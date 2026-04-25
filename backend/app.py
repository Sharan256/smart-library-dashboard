import os
import re
import math
import pandas as pd
import httpx
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

# -------------------------------
# 🔹 SETUP
# -------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, ".env"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
print("API KEY:", GEMINI_API_KEY)

app = Flask(__name__)
CORS(app)

# -------------------------------
# 🔹 CONSTANTS (mirror your dashboards)
# -------------------------------
ZONE_CAPACITY   = 300   # seats per zone
TOTAL_ZONES     = 4
TOTAL_CAPACITY  = ZONE_CAPACITY * TOTAL_ZONES  # 1200

IDEAL_TEMP      = 22.0   # °C
IDEAL_HUMIDITY  = 45.0   # %
IDEAL_NOISE     = 40.0   # dB
IDEAL_LIGHT     = 500.0  # lux
IDEAL_AQI       = 550.0  # AQI units

# Comfort-score weights
W_NOISE       = 0.25
W_OCCUPANCY   = 0.25
W_TEMPERATURE = 0.15
W_LIGHT       = 0.15
W_AIR_QUALITY = 0.10
W_WIFI        = 0.10

# -------------------------------
# 🔹 LOAD DATASET
# -------------------------------
DATA_PATH = os.path.join(BASE_DIR, "library_data.csv")
df_raw = pd.read_csv(DATA_PATH)

df_raw["Timestamp"] = pd.to_datetime(df_raw["Timestamp"], errors="coerce")
df_raw["Hour"]      = df_raw["Timestamp"].dt.hour
df_raw["Date"]      = df_raw["Timestamp"].dt.date
df_raw["Zone_ID"]   = df_raw["Zone_ID"].str.strip().str.lower()
df_raw["DayName"]   = df_raw["Timestamp"].dt.day_name()
df_raw["Month"]     = df_raw["Timestamp"].dt.month
df_raw["Year"]      = df_raw["Timestamp"].dt.year

df = df_raw.copy()

# -----------------------------------------------------------------------
# 🔹 TIME-FILTER ENGINE
# -----------------------------------------------------------------------

_TIME_RANGES = {
    "morning":   (6,  12),
    "afternoon": (12, 17),
    "evening":   (17, 21),
    "night":     (21, 24),
}
_DAY_WORDS = {
    "monday": "Monday", "tuesday": "Tuesday", "wednesday": "Wednesday",
    "thursday": "Thursday", "friday": "Friday", "saturday": "Saturday",
    "sunday": "Sunday",
    "mon": "Monday", "tue": "Tuesday", "wed": "Wednesday",
    "thu": "Thursday", "fri": "Friday", "sat": "Saturday", "sun": "Sunday",
    "today": None,
    "yesterday": None,
    "weekday": ["Monday","Tuesday","Wednesday","Thursday","Friday"],
    "weekend":  ["Saturday","Sunday"],
}
_MONTH_WORDS = {
    "january":1,"february":2,"march":3,"april":4,"may":5,"june":6,
    "july":7,"august":8,"september":9,"october":10,"november":11,"december":12,
    "jan":1,"feb":2,"mar":3,"apr":4,"jun":6,"jul":7,"aug":8,
    "sep":9,"oct":10,"nov":11,"dec":12,
}

import datetime as _dt

def parse_time_context(q: str) -> dict:
    ctx = {"hour_start": None, "hour_end": None,
           "days": None, "month": None, "year": None, "description": "all time"}
    desc_parts = []

    # ── 1. Named time ranges (morning/afternoon/evening/night) ─────────────
    for word, (h0, h1) in _TIME_RANGES.items():
        if word in q:
            ctx["hour_start"] = h0
            ctx["hour_end"]   = h1
            desc_parts.append(word)
            break

    # ── 2. BUG FIX: Check 'between/from' RANGE first, before single-time ──
    #    Old code checked single-time first → "between 9am and 12pm" would
    #    match '9am' alone and ignore the full range.
    range_matched = False
    m = re.search(r'between\s+(\d{1,2})\s*(am|pm)?\s+and\s+(\d{1,2})\s*(am|pm)?', q)
    if not m:
        m = re.search(r'from\s+(\d{1,2})\s*(am|pm)?\s+to\s+(\d{1,2})\s*(am|pm)?', q)
    if m:
        h0 = int(m.group(1)); s0 = m.group(2) or ""
        h1 = int(m.group(3)); s1 = m.group(4) or ""
        if s0 == "pm" and h0 != 12: h0 += 12
        if s0 == "am" and h0 == 12: h0  = 0
        if s1 == "pm" and h1 != 12: h1 += 12
        if s1 == "am" and h1 == 12: h1  = 0
        ctx["hour_start"] = h0
        ctx["hour_end"]   = h1
        desc_parts.append(f"{h0}:00–{h1}:00")
        range_matched = True

    # ── 3. Single explicit hour — only if no range was matched ─────────────
    if not range_matched and ctx["hour_start"] is None:
        m = re.search(r'\bat\s+(\d{1,2})\s*(am|pm)\b', q)
        if not m:
            m = re.search(r'\b(\d{1,2})\s*(am|pm)\b', q)
        if m:
            h = int(m.group(1))
            meridiem = m.group(2)
            if meridiem == "pm" and h != 12: h += 12
            if meridiem == "am" and h == 12: h = 0
            ctx["hour_start"] = h
            ctx["hour_end"]   = h + 1
            desc_parts.append(f"{m.group(1)}{m.group(2)}")

        # 24h format "at 15:00" / "15:00"
        m = re.search(r'\bat\s+(\d{1,2}):(\d{2})\b', q)
        if not m:
            m = re.search(r'\b(\d{1,2}):(\d{2})\b', q)
        if m:
            h = int(m.group(1))
            if 0 <= h <= 23:
                ctx["hour_start"] = h
                ctx["hour_end"]   = h + 1
                desc_parts.append(f"{h:02d}:00")

    # ── 4. Day-of-week ──────────────────────────────────────────────────────
    today = _dt.date.today()
    if "yesterday" in q:
        yesterday = today - _dt.timedelta(days=1)
        ctx["days"] = [yesterday.strftime("%A")]
        desc_parts.append("yesterday")
    elif "today" in q:
        ctx["days"] = [today.strftime("%A")]
        desc_parts.append("today")
    elif any(f"last {d}" in q for d in _DAY_WORDS):
        for word, mapped in _DAY_WORDS.items():
            if f"last {word}" in q and isinstance(mapped, str):
                ctx["days"] = [mapped]
                desc_parts.append(f"last {word}")
                break
    else:
        for word, mapped in _DAY_WORDS.items():
            if re.search(rf'\b{word}\b', q):
                if isinstance(mapped, list):
                    ctx["days"] = mapped
                    desc_parts.append(word)
                elif isinstance(mapped, str):
                    ctx["days"] = [mapped]
                    desc_parts.append(word)
                break

    # ── 5. Month name ───────────────────────────────────────────────────────
    for word, num in _MONTH_WORDS.items():
        if re.search(rf'\b{word}\b', q):
            ctx["month"] = num
            desc_parts.append(word.capitalize())
            break

    # ── 6. Year ─────────────────────────────────────────────────────────────
    m = re.search(r'\b(202\d)\b', q)
    if m:
        ctx["year"] = int(m.group(1))
        desc_parts.append(m.group(1))

    ctx["description"] = " · ".join(desc_parts) if desc_parts else "all time"
    return ctx


def apply_time_filter(base_df: pd.DataFrame, ctx: dict) -> pd.DataFrame:
    fdf = base_df.copy()
    if ctx["hour_start"] is not None and ctx["hour_end"] is not None:
        fdf = fdf[(fdf["Hour"] >= ctx["hour_start"]) & (fdf["Hour"] < ctx["hour_end"])]
    elif ctx["hour_start"] is not None:
        fdf = fdf[fdf["Hour"] == ctx["hour_start"]]
    if ctx["days"]:
        fdf = fdf[fdf["DayName"].isin(ctx["days"])]
    if ctx["month"]:
        fdf = fdf[fdf["Month"] == ctx["month"]]
    if ctx["year"]:
        fdf = fdf[fdf["Year"] == ctx["year"]]
    return fdf


def has_time_context(ctx: dict) -> bool:
    return any([
        ctx["hour_start"] is not None,
        ctx["days"] is not None,
        ctx["month"] is not None,
        ctx["year"] is not None,
    ])


def time_filtered_summary(fdf: pd.DataFrame, ctx: dict, zone: str = None) -> dict:
    if zone:
        fdf = fdf[fdf["Zone_ID"] == zone]
    if fdf.empty:
        return None

    total_records = len(fdf)
    avg_occupancy = round(fdf["Occupancy_Count"].mean(), 1)

    # BUG FIX: guard idxmax() crash when only one hour exists in the slice
    try:
        hourly_grp = fdf.groupby("Hour")["Occupancy_Count"].sum()
        peak_h = int(hourly_grp.idxmax()) if not hourly_grp.empty else None
    except Exception:
        peak_h = None

    result = {
        "records":       total_records,
        "avg_occupancy": avg_occupancy,
        "peak_hour":     f"{peak_h}:00–{peak_h+1}:00" if peak_h is not None else "N/A",
        "available":     max(0, ZONE_CAPACITY - int(avg_occupancy)) if zone
                         else max(0, TOTAL_CAPACITY - int(avg_occupancy * TOTAL_ZONES)),
    }

    for col, label in [("Noise_Level","avg_noise"), ("Temperature","avg_temp"),
                        ("Humidity","avg_humidity"), ("Air_Quality","avg_aq"),
                        ("WiFi_Speed","avg_wifi"), ("Light_Level","avg_light"),
                        ("Total_Power_Consumption","avg_power")]:
        if col in fdf.columns:
            val = fdf[col].dropna()
            result[label] = round(val.mean(), 1) if not val.empty else None

    zone_occ = fdf.groupby("Zone_ID")["Occupancy_Count"].mean().round(1)
    result["zone_occupancy"] = zone_occ.to_dict()
    return result

# -----------------------------------------------------------------------
# 🔹 HELPER UTILITIES
# -----------------------------------------------------------------------

def bounded(value, lo=0, hi=100):
    return max(lo, min(hi, value))

def comfort_score_row(row):
    noise_s     = bounded(100 - abs(row.get("Noise_Level", 40) - IDEAL_NOISE) * 2)
    occupancy_s = bounded(100 - row.get("Occupancy_Count", 0))
    temp_s      = bounded(100 - abs(row.get("Temperature", 22) - 23) * 8)
    light_s     = bounded(100 - abs(row.get("Light_Level", 500) - IDEAL_LIGHT) / 5)
    aq_s        = bounded(100 - abs(row.get("Air_Quality", 550) - IDEAL_AQI) / 5)
    wifi_s      = bounded(row.get("WiFi_Speed", 50))
    return (
        noise_s     * W_NOISE       +
        occupancy_s * W_OCCUPANCY   +
        temp_s      * W_TEMPERATURE +
        light_s     * W_LIGHT       +
        aq_s        * W_AIR_QUALITY +
        wifi_s      * W_WIFI
    )

def env_comfort_score(temp, humidity, air_quality):
    temp_s   = bounded(100 - abs(temp - IDEAL_TEMP) * 6)
    humid_s  = bounded(100 - abs(humidity - IDEAL_HUMIDITY) * 2)
    aq_s     = min(100, (air_quality / 700) * 100)
    return round((temp_s + humid_s + aq_s) / 3, 1)

def pearson_r(xs, ys):
    n = len(xs)
    if n < 2: return None
    mx, my = sum(xs)/n, sum(ys)/n
    num    = sum((x - mx)*(y - my) for x, y in zip(xs, ys))
    den    = math.sqrt(sum((x - mx)**2 for x in xs) * sum((y - my)**2 for y in ys))
    return round(num / den, 2) if den != 0 else 0.0

def describe_correlation(r):
    if r is None: return "insufficient data"
    strength  = "strong" if abs(r) >= 0.75 else "moderate" if abs(r) >= 0.5 else "weak"
    direction = "positive" if r > 0 else "negative"
    return f"{strength} {direction} correlation (r = {r})"

def zone_status(pct):
    if pct >= 90: return "Full"
    if pct >= 70: return "Busy"
    return "Available"

# -----------------------------------------------------------------------
# 🔹 DATA LOGIC FUNCTIONS
# -----------------------------------------------------------------------

def get_peak_hour():
    hourly = df.groupby("Hour")["Occupancy_Count"].sum()
    peak   = hourly.idxmax()
    return int(peak), int(hourly[peak])

def get_most_crowded_zone():
    zone_avg = df.groupby("Zone_ID")["Occupancy_Count"].mean()
    zone     = zone_avg.idxmax()
    return zone, round(zone_avg[zone], 1)

def get_least_crowded_zone():
    zone_avg = df.groupby("Zone_ID")["Occupancy_Count"].mean()
    zone     = zone_avg.idxmin()
    return zone, round(zone_avg[zone], 1)

def get_available_seats():
    current = int(df["Occupancy_Count"].iloc[-1])
    return TOTAL_CAPACITY - current, current

def get_total_occupancy_pct():
    latest = df.groupby("Zone_ID")["Occupancy_Count"].last()
    total  = int(latest.sum())
    pct    = round((total / TOTAL_CAPACITY) * 100, 1)
    return pct, total

def get_zone_status_all():
    latest = df.groupby("Zone_ID")["Occupancy_Count"].last().reset_index()
    results = []
    for _, row in latest.iterrows():
        current = int(row["Occupancy_Count"])
        pct     = round((current / ZONE_CAPACITY) * 100, 1)
        results.append({
            "zone": row["Zone_ID"], "current": current, "capacity": ZONE_CAPACITY,
            "available": ZONE_CAPACITY - current, "pct": pct, "status": zone_status(pct),
        })
    return results

def get_hourly_trend():
    hourly = df.groupby("Hour")["Occupancy_Count"].sum().reset_index()
    hourly.columns = ["hour", "total_occupancy"]
    return hourly.sort_values("hour").to_dict("records")

def get_env_summary():
    valid = df[["Temperature","Humidity","Air_Quality"]].dropna()
    return {
        "avg_temp":        round(valid["Temperature"].mean(), 1),
        "avg_humidity":    round(valid["Humidity"].mean(), 1),
        "avg_air_quality": round(valid["Air_Quality"].mean(), 0),
        "count":           len(valid),
    }

def get_env_by_zone():
    result = []
    for zone, grp in df.groupby("Zone_ID"):
        gv = grp[["Temperature","Humidity","Air_Quality"]].dropna()
        if gv.empty: continue
        t, h, a = gv["Temperature"].mean(), gv["Humidity"].mean(), gv["Air_Quality"].mean()
        result.append({
            "zone": zone, "avg_temp": round(t,1), "avg_humidity": round(h,1),
            "avg_aq": round(a,0), "comfort_score": env_comfort_score(t,h,a),
        })
    return sorted(result, key=lambda x: x["zone"])

def get_best_env_zone():
    return max(get_env_by_zone(), key=lambda x: x["comfort_score"])

def get_zone_comparison_full():
    result = []
    cols = ["Occupancy_Count","Noise_Level","WiFi_Speed","Temperature","Humidity","Air_Quality"]
    for zone, grp in df.groupby("Zone_ID"):
        valid = grp[cols].dropna()
        if valid.empty: continue
        result.append({
            "zone": zone,
            "avg_occupancy":   round(valid["Occupancy_Count"].mean(), 1),
            "avg_noise":       round(valid["Noise_Level"].mean(), 1),
            "avg_wifi":        round(valid["WiFi_Speed"].mean(), 1),
            "avg_temperature": round(valid["Temperature"].mean(), 1),
            "avg_humidity":    round(valid["Humidity"].mean(), 1),
            "avg_air_quality": round(valid["Air_Quality"].mean(), 1),
        })
    return sorted(result, key=lambda x: x["zone"])

def get_best_wifi_zone():
    return max(get_zone_comparison_full(), key=lambda x: x["avg_wifi"])

def get_noise_by_zone():
    return [(z["zone"], z["avg_noise"]) for z in get_zone_comparison_full()]

def get_wifi_by_zone():
    return [(z["zone"], z["avg_wifi"]) for z in get_zone_comparison_full()]

def get_comfort_scores_by_zone():
    required = ["Occupancy_Count","Noise_Level","Temperature","Light_Level","Air_Quality","WiFi_Speed"]
    valid    = df[["Zone_ID"] + required].dropna()
    result   = []
    for zone, grp in valid.groupby("Zone_ID"):
        scores = grp.apply(lambda r: comfort_score_row(r.to_dict()), axis=1)
        result.append({
            "zone": zone.upper(), "comfort_score": round(scores.mean(), 1),
            "avg_noise": round(grp["Noise_Level"].mean(), 1),
            "avg_occupancy": round(grp["Occupancy_Count"].mean(), 1),
            "avg_temp": round(grp["Temperature"].mean(), 1),
            "avg_light": round(grp["Light_Level"].mean(), 1),
            "avg_wifi": round(grp["WiFi_Speed"].mean(), 1),
        })
    return sorted(result, key=lambda x: -x["comfort_score"])

def get_occupancy_noise_correlation():
    valid = df[["Occupancy_Count","Noise_Level"]].dropna()
    r = pearson_r(valid["Occupancy_Count"].tolist(), valid["Noise_Level"].tolist())
    return r, describe_correlation(r)

def get_light_power_correlation():
    valid = df[["Light_Level","Total_Power_Consumption"]].dropna()
    r = pearson_r(valid["Light_Level"].tolist(), valid["Total_Power_Consumption"].tolist())
    return r, describe_correlation(r)

def get_device_power_correlation():
    valid = df[["Device_Usage_Count","Total_Power_Consumption"]].dropna()
    r = pearson_r(valid["Device_Usage_Count"].tolist(), valid["Total_Power_Consumption"].tolist())
    return r, describe_correlation(r)

def get_power_summary():
    valid = df["Total_Power_Consumption"].dropna()
    return {"avg_power": round(valid.mean(),1), "max_power": round(valid.max(),1), "min_power": round(valid.min(),1)}

def get_light_summary():
    valid = df["Light_Level"].dropna()
    return {"avg_light": round(valid.mean(),1), "max_light": round(valid.max(),1)}

# -----------------------------------------------------------------------
# 🔹 GEMINI FUNCTION  —  FIX: v1 → v1beta (required for Gemini 2.x models)
# -----------------------------------------------------------------------

def ask_gemini(prompt: str) -> str:
    # ✅ FIX: Gemini 2.x models require v1beta, not v1
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    )
    try:
        response = httpx.post(
            url,
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=40.0,   # increased for Gemini 2.5
        )
        data = response.json()
        print("Gemini status:", response.status_code)

        if "candidates" not in data:
            print("Gemini error response:", data)
            return "I couldn't retrieve data at this moment. Please try again."

        candidate = data["candidates"][0]
        finish_reason = candidate.get("finishReason", "")
        if finish_reason in ("SAFETY", "RECITATION", "OTHER"):
            return "I wasn't able to generate a response for that query."

        return candidate["content"]["parts"][0]["text"]

    except httpx.TimeoutException:
        print("Gemini timeout")
        return "The request timed out. Please try again."
    except Exception as e:
        print("Gemini error:", type(e).__name__, e)
        return "Sorry, I couldn't generate a response right now."

# -----------------------------------------------------------------------
# 🔹 INTENT ROUTER
# -----------------------------------------------------------------------

def contains(q, *keywords):
    return any(k in q for k in keywords)

def extract_zone(q):
    m = re.search(r"zone\s*([1-4])", q)
    return f"zone{m.group(1)}" if m else None

def route_and_respond(question: str) -> str:
    q = question.lower().strip()

    ctx    = parse_time_context(q)
    fdf    = apply_time_filter(df, ctx)
    timed  = has_time_context(ctx)
    tlabel = ctx["description"]
    adf    = fdf if timed else df

    if timed and fdf.empty:
        return (
            f"I couldn't find any library data for '{tlabel}'. "
            "The dataset covers Monday–Sunday, 9 AM–6 PM. "
            "Try a different time, day, or date range."
        )

    # ── 1. PEAK HOUR ──────────────────────────────────────────────────────
    if contains(q, "peak hour", "peak time", "busiest hour", "busiest time"):
        hourly  = adf.groupby("Hour")["Occupancy_Count"].sum()
        peak_h  = int(hourly.idxmax())
        peak_cnt = int(hourly[peak_h])
        prompt = f"""
You are a smart library analytics assistant.
{'Time filter: ' + tlabel if timed else 'All available data.'}

Peak occupancy hour: {peak_h}:00–{peak_h+1}:00
Total student-visits in that hour: {peak_cnt:,}

Explain this in 2–3 sentences and suggest one practical action for library staff.
"""
        return ask_gemini(prompt)

    # ── 2. MOST / LEAST CROWDED ZONE ─────────────────────────────────────
    if contains(q, "most crowded", "most busy", "highest occupancy", "most people"):
        zone_avg  = adf.groupby("Zone_ID")["Occupancy_Count"].mean()
        zone      = zone_avg.idxmax()
        avg       = round(zone_avg[zone], 1)
        time_note = f"during {tlabel}" if timed else "overall"
        prompt = f"""
Library data ({time_note}): Zone {zone.upper()} has the highest average occupancy ({avg} students).
Explain why this zone might be most popular and suggest 1–2 improvements.
"""
        return ask_gemini(prompt)

    if contains(q, "least crowded", "least busy", "lowest occupancy"):
        zone_avg  = adf.groupby("Zone_ID")["Occupancy_Count"].mean()
        zone      = zone_avg.idxmin()
        avg       = round(zone_avg[zone], 1)
        time_note = f"during {tlabel}" if timed else "overall"
        prompt = f"""
Library data ({time_note}): Zone {zone.upper()} has the lowest average occupancy ({avg} students).
Explain why this zone might be underused and suggest how to attract more students.
"""
        return ask_gemini(prompt)

    # ── 3. AVAILABLE SEATS ────────────────────────────────────────────────
    if contains(q, "available seat", "free seat", "empty seat", "how many seat"):
        if timed:
            snap    = time_filtered_summary(adf, ctx)
            avg_occ = snap["avg_occupancy"] * TOTAL_ZONES
            avail   = max(0, TOTAL_CAPACITY - int(avg_occ))
            pct_occ = round((avg_occ / TOTAL_CAPACITY) * 100, 1)
            prompt = f"""
Library seat availability during {tlabel}:
- Average students present: {int(avg_occ)} / {TOTAL_CAPACITY}
- Estimated available seats: {avail} ({100-pct_occ:.1f}% free)
- Based on {snap['records']} historical records.
Describe conditions and advise students. Mention this is a historical average, not live data.
"""
        else:
            available, current = get_available_seats()
            pct = round((current / TOTAL_CAPACITY) * 100, 1)
            prompt = f"""
Library status (latest data):
- Students: {current} / {TOTAL_CAPACITY} | Available seats: {available} ({100-pct:.1f}% free)
Describe whether it's crowded and advise students. Keep it friendly and concise.
"""
        return ask_gemini(prompt)

    # ── 4. TOTAL OCCUPANCY / HOW FULL ─────────────────────────────────────
    if contains(q, "total occupancy", "overall occupancy", "how full", "occupancy rate",
                "occupancy percentage", "occupancy %"):
        if timed:
            snap    = time_filtered_summary(adf, ctx)
            avg_occ = snap["avg_occupancy"] * TOTAL_ZONES
            pct     = round((avg_occ / TOTAL_CAPACITY) * 100, 1)
            prompt = f"""
Library occupancy during {tlabel}:
- Average total students: {int(avg_occ)} / {TOTAL_CAPACITY} ({pct}% full)
- Records analysed: {snap['records']}
Summarise and recommend when students should visit.
"""
        else:
            pct, total = get_total_occupancy_pct()
            prompt = f"""
The library is at {pct}% occupancy ({total} / {TOTAL_CAPACITY} seats).
Summarise and give one recommendation for students looking for a seat.
"""
        return ask_gemini(prompt)

    # ── 4b. ✅ NEW: GENERAL OCCUPANCY WITH TIME FILTER ────────────────────
    #   Catches: "what is the occupancy at 3pm", "how busy at 9am", etc.
    if timed and contains(q, "occupancy", "how busy", "how crowded", "how many people",
                          "how many students", "how full", "crowd", "busy"):
        snap      = time_filtered_summary(adf, ctx)
        if not snap:
            return f"No data found for '{tlabel}'."
        avg_occ   = snap["avg_occupancy"] * TOTAL_ZONES
        pct       = round((avg_occ / TOTAL_CAPACITY) * 100, 1)
        avail     = max(0, TOTAL_CAPACITY - int(avg_occ))
        zone_lines = "\n".join(
            f"  - {z.upper()}: avg {int(v)} students"
            for z, v in snap.get("zone_occupancy", {}).items()
        )
        prompt = f"""
Library occupancy during {tlabel} (based on {snap['records']} historical records):
- Average students present: {int(avg_occ)} / {TOTAL_CAPACITY} ({pct}% full)
- Estimated available seats: {avail}
- Peak hour within this window: {snap['peak_hour']}

Zone breakdown:
{zone_lines}

Answer the student's question: "{question}"
Note: this is based on historical averages, not a live reading.
"""
        return ask_gemini(prompt)

    # ── 5. ZONE STATUS (all zones) ────────────────────────────────────────
    if contains(q, "zone status", "all zone", "which zone", "zone available",
                "zone full", "zone busy"):
        if timed:
            snap  = time_filtered_summary(adf, ctx)
            zo    = snap.get("zone_occupancy", {})
            lines = []
            for z, avg_occ in sorted(zo.items()):
                pct   = round((avg_occ / ZONE_CAPACITY) * 100, 1)
                avail = max(0, ZONE_CAPACITY - int(avg_occ))
                lines.append(f"  - {z.upper()}: avg {int(avg_occ)} ({pct}%) → {zone_status(pct)}, ~{avail} seats free")
            prompt = f"""
Zone occupancy during {tlabel} (historical averages):
{chr(10).join(lines)}
Advise which zone likely has seats. Remind this is historical data, not live.
"""
        else:
            zones  = get_zone_status_all()
            detail = "\n".join(
                f"  - {z['zone'].upper()}: {z['current']}/{z['capacity']} ({z['pct']}%) → {z['status']}"
                for z in zones
            )
            avail_zones = [z["zone"].upper() for z in zones if z["status"] == "Available"]
            prompt = f"""
Current zone status:
{detail}
Available zones: {', '.join(avail_zones) if avail_zones else 'None'}
Give students a clear, friendly summary of where they can find seats.
"""
        return ask_gemini(prompt)

    # ── 6. SPECIFIC ZONE QUERY ────────────────────────────────────────────
    target_zone = extract_zone(q)
    if target_zone:
        zdf   = adf[adf["Zone_ID"] == target_zone]
        if zdf.empty:
            return f"No data found for {target_zone.upper()} during '{tlabel}'."
        cols  = ["Occupancy_Count","Noise_Level","WiFi_Speed","Temperature","Humidity","Air_Quality"]
        valid = zdf[cols].dropna()
        pct   = round((valid["Occupancy_Count"].mean() / ZONE_CAPACITY) * 100, 1) if not valid.empty else 0
        time_note = f"during {tlabel}" if timed else "(all-time averages)"

        def safe(col): return round(valid[col].mean(), 1) if not valid.empty else "N/A"

        prompt = f"""
Details for {target_zone.upper()} {time_note}:
- Avg occupancy: {safe('Occupancy_Count')} / {ZONE_CAPACITY} ({pct}%) → {zone_status(pct)}
- Avg noise:     {safe('Noise_Level')} dB
- Avg WiFi:      {safe('WiFi_Speed')} Mbps
- Avg temp:      {safe('Temperature')} °C
- Avg humidity:  {safe('Humidity')} %
- Avg AQI:       {round(valid['Air_Quality'].mean(),0) if not valid.empty else 'N/A'}
- Records used:  {len(zdf)}
{'(Historical data for specified time window, not a live reading.)' if timed else ''}

Give a concise summary of this zone's conditions and whether it's a good study spot.
"""
        return ask_gemini(prompt)

    # ── 7. HOURLY TREND ───────────────────────────────────────────────────
    if contains(q, "trend", "over time", "hourly", "throughout the day",
                "occupancy pattern", "time pattern"):
        hourly = adf.groupby("Hour")["Occupancy_Count"].sum().reset_index()
        hourly.columns = ["hour", "total_occupancy"]
        hourly = hourly.sort_values("hour")
        peak_h = int(hourly.loc[hourly["total_occupancy"].idxmax(), "hour"])
        summary = ", ".join(f"{int(r.hour)}:00→{int(r.total_occupancy)}" for _, r in hourly.iterrows())
        prompt = f"""
Library occupancy pattern {'for ' + tlabel if timed else 'across all data'}: {summary}
Peak hour: {peak_h}:00.
Explain the pattern and what drives it. Keep it simple and useful (3–4 sentences).
"""
        return ask_gemini(prompt)

    # ── 8. ENVIRONMENT ────────────────────────────────────────────────────
    if contains(q, "temperature", "humidity", "air quality", "environment",
                "aqi", "comfort", "how hot", "how cold", "climate"):
        valid_env = adf[["Temperature","Humidity","Air_Quality"]].dropna()
        avg_temp  = round(valid_env["Temperature"].mean(), 1) if not valid_env.empty else "N/A"
        avg_hum   = round(valid_env["Humidity"].mean(), 1)    if not valid_env.empty else "N/A"
        avg_aq    = round(valid_env["Air_Quality"].mean(), 0) if not valid_env.empty else "N/A"
        time_note = f"during {tlabel}" if timed else "overall"

        if contains(q, "temperature", "how hot", "how cold"):
            prompt = f"Average temperature {time_note}: {avg_temp} °C (ideal ~22 °C). Explain comfort impact."
        elif contains(q, "humidity"):
            prompt = f"Average humidity {time_note}: {avg_hum}% (ideal 40–50%). Explain studying impact."
        elif contains(q, "air quality", "aqi"):
            prompt = f"Average AQI {time_note}: {avg_aq}. Explain health/focus impact and suggest action if needed."
        else:
            zone_env = []
            for zone, grp in adf.groupby("Zone_ID"):
                gv = grp[["Temperature","Humidity","Air_Quality"]].dropna()
                if gv.empty: continue
                t, h, a = gv["Temperature"].mean(), gv["Humidity"].mean(), gv["Air_Quality"].mean()
                zone_env.append((zone, round(t,1), round(h,1), round(a,0), env_comfort_score(t,h,a)))
            best_env = max(zone_env, key=lambda x: x[4]) if zone_env else None
            detail   = "\n".join(f"  - {z.upper()}: {t}°C, {h}%, AQI {a} → comfort {sc}/100" for z,t,h,a,sc in zone_env)
            prompt = f"""
Library environmental conditions {time_note}:
- Avg temp: {avg_temp} °C | Avg humidity: {avg_hum}% | Avg AQI: {avg_aq}

Zone breakdown:
{detail}
{'Best zone: ' + best_env[0].upper() + ' (score ' + str(best_env[4]) + '/100)' if best_env else ''}
Summarise conditions and tell students which zone is most comfortable.
"""
        return ask_gemini(prompt)

    # ── 9. COMFORT SCORE / BEST STUDY ZONE ───────────────────────────────
    if contains(q, "comfort score", "best zone", "best study", "best place",
                "where should i sit", "where to sit", "recommended zone", "most comfortable"):
        required = ["Occupancy_Count","Noise_Level","Temperature","Light_Level","Air_Quality","WiFi_Speed"]
        valid_c  = adf[["Zone_ID"] + required].dropna()
        zone_scores = []
        for zone, grp in valid_c.groupby("Zone_ID"):
            scores = grp.apply(lambda r: comfort_score_row(r.to_dict()), axis=1)
            zone_scores.append({
                "zone": zone.upper(), "comfort_score": round(scores.mean(), 1),
                "avg_noise": round(grp["Noise_Level"].mean(), 1),
                "avg_occupancy": round(grp["Occupancy_Count"].mean(), 1),
                "avg_temp": round(grp["Temperature"].mean(), 1),
                "avg_wifi": round(grp["WiFi_Speed"].mean(), 1),
            })
        zone_scores.sort(key=lambda x: -x["comfort_score"])
        best    = zone_scores[0] if zone_scores else None
        details = "\n".join(
            f"  - {z['zone']}: {z['comfort_score']}/100 (noise {z['avg_noise']} dB, "
            f"occupancy {z['avg_occupancy']}, temp {z['avg_temp']}°C, wifi {z['avg_wifi']} Mbps)"
            for z in zone_scores
        )
        prompt = f"""
Zone comfort scores {'during ' + tlabel if timed else '(all data)'}:
{details}
Best zone: {best['zone'] if best else 'N/A'} — {best['comfort_score'] if best else 'N/A'}/100
Explain and give a clear recommendation to students.
{'Based on historical data for this time window.' if timed else ''}
"""
        return ask_gemini(prompt)

    # ── 10. NOISE ─────────────────────────────────────────────────────────
    if contains(q, "noise", "quiet", "loud", "decibel", "db", "silent"):
        noise_data = get_noise_by_zone()
        quietest   = min(noise_data, key=lambda x: x[1])
        loudest    = max(noise_data, key=lambda x: x[1])
        detail     = "\n".join(f"  - {z.upper()}: {n} dB" for z, n in noise_data)
        prompt = f"""
Average noise levels:
{detail}
Quietest: {quietest[0].upper()} ({quietest[1]} dB) | Loudest: {loudest[0].upper()} ({loudest[1]} dB)
Explain what these mean for studying and recommend the best quiet zone.
"""
        return ask_gemini(prompt)

    # ── 11. WIFI ──────────────────────────────────────────────────────────
    if contains(q, "wifi", "wi-fi", "internet", "speed", "connectivity", "mbps"):
        wifi_data = get_wifi_by_zone()
        best_wifi = get_best_wifi_zone()
        detail    = "\n".join(f"  - {z.upper()}: {w} Mbps" for z, w in wifi_data)
        prompt = f"""
WiFi speeds by zone:
{detail}
Best: {best_wifi['zone'].upper()} ({best_wifi['avg_wifi']} Mbps)
Tell students which zone has best connectivity and whether speeds suit common tasks.
"""
        return ask_gemini(prompt)

    # ── 12. LIGHT ─────────────────────────────────────────────────────────
    if contains(q, "light", "lighting", "brightness", "lux", "illumination"):
        light = get_light_summary()
        prompt = f"""
Library lighting — Avg: {light['avg_light']} lux | Max: {light['max_light']} lux (ideal 300–500 lux).
Explain whether this is suitable for studying and give recommendations.
"""
        return ask_gemini(prompt)

    # ── 13. POWER ─────────────────────────────────────────────────────────
    if contains(q, "power", "energy", "electricity", "consumption", "watt"):
        power = get_power_summary()
        _, dl = get_light_power_correlation()
        _, dd = get_device_power_correlation()
        prompt = f"""
Power consumption — Avg: {power['avg_power']} W | Peak: {power['max_power']} W | Min: {power['min_power']} W
Light vs power: {dl} | Device count vs power: {dd}
Explain the energy pattern and give 1–2 efficiency suggestions.
"""
        return ask_gemini(prompt)

    # ── 14. CORRELATIONS ──────────────────────────────────────────────────
    if contains(q, "correlation", "relationship", "affect", "impact", "influence"):
        if contains(q, "occupancy") and contains(q, "noise"):
            r, desc = get_occupancy_noise_correlation()
            prompt = f"Occupancy ↔ Noise: {desc}. Explain: does more people = more noise? Implications for quiet study."
        elif contains(q, "light") and contains(q, "power"):
            r, desc = get_light_power_correlation()
            prompt = f"Light level ↔ Power: {desc}. Explain this relationship and energy implications."
        elif contains(q, "device") and contains(q, "power"):
            r, desc = get_device_power_correlation()
            prompt = f"Device count ↔ Power: {desc}. Explain how student devices affect energy consumption."
        else:
            r1, d1 = get_occupancy_noise_correlation()
            r2, d2 = get_light_power_correlation()
            r3, d3 = get_device_power_correlation()
            prompt = f"""
Library correlations:
1. Occupancy ↔ Noise: {d1}
2. Light ↔ Power: {d2}
3. Device count ↔ Power: {d3}
Summarise what these reveal about the library environment and energy use.
"""
        return ask_gemini(prompt)

    # ── 15. ZONE COMPARISON ───────────────────────────────────────────────
    if contains(q, "compare zone", "zone comparison", "zone vs", "zones differ",
                "which zone is better", "zone ranking", "zone overview"):
        zones  = get_zone_comparison_full()
        detail = "\n".join(
            f"  - {z['zone'].upper()}: occupancy={z['avg_occupancy']}, noise={z['avg_noise']} dB, "
            f"wifi={z['avg_wifi']} Mbps, temp={z['avg_temperature']}°C, AQI={z['avg_air_quality']}"
            for z in zones
        )
        prompt = f"""
Zone comparison:
{detail}
Summarise differences and recommend zones for different student needs (quiet study, group work, connectivity).
"""
        return ask_gemini(prompt)

    # ── 16. DAY-OF-WEEK ───────────────────────────────────────────────────
    if contains(q, "weekday", "weekend", "monday", "tuesday", "wednesday",
                "thursday", "friday", "saturday", "sunday", "when to visit",
                "best time to visit", "when is it quiet", "which day"):
        day_avg   = adf.groupby("DayName")["Occupancy_Count"].mean().round(1)
        if day_avg.empty:
            return f"No occupancy data found for '{tlabel}'."
        best_day  = day_avg.idxmin()
        worst_day = day_avg.idxmax()
        detail    = "\n".join(f"  - {d}: {v} avg students" for d, v in day_avg.items())
        prompt = f"""
Avg occupancy by day {'(' + tlabel + ')' if timed else '(all data)'}:
{detail}
Quietest: {best_day} ({day_avg[best_day]}) | Busiest: {worst_day} ({day_avg[worst_day]})
Advise students on the best days to visit.
"""
        return ask_gemini(prompt)

    # ── 17. GREETING / HELP ───────────────────────────────────────────────
    if contains(q, "hello", "hi", "hey", "help", "what can you", "what can i ask"):
        prompt = """
You are a friendly library analytics assistant for a smart university library.
In one short paragraph, tell the user what you can help with:
zone occupancy, seat availability, peak hours, noise, WiFi, temperature, humidity,
air quality, comfort scores, power consumption, correlations, zone comparisons,
and best-day advice.
Also mention time filters: 'at 3pm', 'on Monday', 'in the morning',
'between 9am and 12pm', 'last Tuesday', 'on weekdays', etc.
"""
        return ask_gemini(prompt)

    # ── 18. TIME-SPECIFIC FALLBACK ────────────────────────────────────────
    if timed:
        snap = time_filtered_summary(adf, ctx)
        if snap:
            zone_lines = "\n".join(
                f"  - {z.upper()}: avg {int(v)} students"
                for z, v in snap.get("zone_occupancy", {}).items()
            )
            prompt = f"""
You are a smart library analytics assistant. Answer the student's question using the data below.

Time window: {tlabel} | Records: {snap['records']}

Library snapshot:
- Avg occupancy: {snap['avg_occupancy']} students/zone | Available seats: {snap['available']}
- Peak hour: {snap['peak_hour']}
- Noise: {snap.get('avg_noise','N/A')} dB | Temp: {snap.get('avg_temp','N/A')} °C
- Humidity: {snap.get('avg_humidity','N/A')}% | AQI: {snap.get('avg_aq','N/A')}
- WiFi: {snap.get('avg_wifi','N/A')} Mbps

Zone occupancy:
{zone_lines}

Student question: "{question}"
Remind: this is historical data, not a live feed.
If unrelated to library, politely redirect.
"""
            return ask_gemini(prompt)

    # ── 19. GENERAL FALLBACK ──────────────────────────────────────────────
    env            = get_env_summary()
    avail, current = get_available_seats()
    peak_h, _      = get_peak_hour()
    prompt = f"""
You are a smart library analytics assistant. Answer using the context below.

Library snapshot:
- Students: {current} / {TOTAL_CAPACITY} | Available seats: {avail}
- Peak hour: {peak_h}:00
- Avg temp: {env['avg_temp']} °C | Humidity: {env['avg_humidity']}% | AQI: {env['avg_air_quality']}

Student question: "{question}"

You can answer time-filtered questions like "at 3pm", "on Monday", "between 9am and 12pm".
If unrelated to library, politely redirect.
"""
    return ask_gemini(prompt)

# -----------------------------------------------------------------------
# 🔹 CHAT ENDPOINT
# -----------------------------------------------------------------------

@app.route("/api/chat", methods=["POST"])
def chat():
    payload  = request.get_json()
    question = payload.get("question", "")
    if not question.strip():
        return jsonify({"answer": "Please ask a question about the library."})
    return jsonify({"answer": route_and_respond(question)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)