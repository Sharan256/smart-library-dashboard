import React, { useEffect, useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, CartesianGrid,
} from "recharts";

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const ZONE_CAPACITY = 300;
const TOTAL_ZONES   = 4;
const ZONE_COLORS   = { zone1: "#f97316", zone2: "#3b82f6", zone3: "#10b981", zone4: "#a855f7" };

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows    = text.trim().split("\n");
  const headers = rows[0].split(",").map((h) => h.trim());

  return rows.slice(1).map((row) => {
    const values = row.split(",");
    const obj    = {};
    headers.forEach((h, i) => { obj[h] = values[i]?.trim(); });
    return {
      zone:      obj.Zone_ID,
      occupancy: Number(obj.Occupancy_Count),
      timestamp: new Date(obj.Timestamp),
    };
  }).filter((d) => !isNaN(d.timestamp) && d.zone);
}

function getStatusInfo(pct) {
  if (pct >= 90) return { label: "Full",      bg: "#fee2e2", text: "#dc2626", bar: "#ef4444" };
  if (pct >= 70) return { label: "Busy",      bg: "#ffedd5", text: "#ea580c", bar: "#f97316" };
  return           { label: "Available", bg: "#dcfce7", text: "#16a34a", bar: "#22c55e" };
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────
function StatCard({ title, value, sub }) {
  return (
    <div style={styles.statCard}>
      <p style={styles.statTitle}>{title}</p>
      <h3 style={styles.statValue}>{value}</h3>
      {sub && <p style={styles.statSub}>{sub}</p>}
    </div>
  );
}

function ZoneStatusCards({ tableData }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Zone Status</h2>
      <div style={styles.zoneGrid}>
        {tableData.map((zone) => {
          const pct  = Math.min(100, Math.round((zone.current / zone.cap) * 100));
          const info = getStatusInfo(pct);
          return (
            <div key={zone.name} style={styles.zoneCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={styles.zoneName}>{zone.name}</span>
                <span style={{ ...styles.badge, background: info.bg, color: info.text }}>{info.label}</span>
              </div>
              <div style={styles.zonePct}>{pct}% <span style={styles.zonePctSub}>Occupied</span></div>
              <p style={styles.zoneCount}>{zone.current} / {zone.cap} students</p>
              <div style={styles.progressTrack}>
                <div style={{ ...styles.progressBar, width: `${pct}%`, background: info.bar }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OccupancyTable({ tableData }) {
  return (
    <div style={styles.card}>
      <h2 style={styles.cardTitle}>Real-Time Occupancy Table</h2>
      <table style={styles.table}>
        <thead>
          <tr>
            {["Zone", "Current", "Capacity", "Available", "Status"].map((h) => (
              <th key={h} style={styles.th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tableData.map((row, i) => {
            const pct  = Math.min(100, Math.round((row.current / row.cap) * 100));
            const info = getStatusInfo(pct);
            return (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fafafa" : "#fff" }}>
                <td style={styles.td}>{row.name}</td>
                <td style={styles.td}>{row.current}</td>
                <td style={styles.td}>{row.cap}</td>
                <td style={styles.td}>{row.cap - row.current}</td>
                <td style={styles.td}>
                  <span style={{ ...styles.badge, background: info.bg, color: info.text }}>{info.label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function OccupancyDashboard() {
  // ── Raw data & zones ──────────────────────────────────────────────────────
  const [rawData,    setRawData]    = useState([]);
  const [zones,      setZones]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(null);

  // ── Filter state ──────────────────────────────────────────────────────────
  const [startDate,    setStartDate]    = useState("");
  const [endDate,      setEndDate]      = useState("");
  const [selectedZone, setSelectedZone] = useState("ALL");

  // ── Mode state ────────────────────────────────────────────────────────────
  const [showLast30Min, setShowLast30Min] = useState(false);
  const [viewMode,      setViewMode]      = useState("hourly"); // hourly|daily|monthly|yearly

  // ── 1. Load CSV ───────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res  = await fetch("/data/library_data.csv");
        if (!res.ok) throw new Error("Failed to fetch CSV");
        const text = await res.text();
        const parsed = parseCSV(text);
        setRawData(parsed);
        setZones([...new Set(parsed.map((d) => d.zone))].sort());
      } catch (e) {
        setLoadError(e.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // ── 2. last30MinData – derived purely from rawData ─────────────────────────
  const last30MinData = useMemo(() => {
    if (!rawData.length) return [];
    const latestMs  = Math.max(...rawData.map((d) => d.timestamp.getTime()));
    const cutoff    = latestMs - 30 * 60 * 1000;
    return rawData.filter((d) => d.timestamp.getTime() >= cutoff);
  }, [rawData]);

  // ── 3. filteredData – applied only in Normal Mode ─────────────────────────
  const filteredData = useMemo(() => {
    let data = rawData;
    if (startDate && endDate) {
      const s = new Date(startDate);
      const e = new Date(endDate);
      data = data.filter((d) => d.timestamp >= s && d.timestamp <= e);
    }
    if (selectedZone !== "ALL") {
      data = data.filter((d) => d.zone === selectedZone);
    }
    return data;
  }, [rawData, startDate, endDate, selectedZone]);

  // ── 4. isShortRange ───────────────────────────────────────────────────────
  const isShortRange = useMemo(() => {
    if (showLast30Min) return true;
    if (!startDate || !endDate) return false;
    const s = new Date(startDate);
    const e = new Date(endDate);
    const diffHours = (e - s) / (1000 * 60 * 60);
    return diffHours <= 1 && s.toDateString() === e.toDateString();
  }, [showLast30Min, startDate, endDate]);

  // ── 5. SINGLE SOURCE OF TRUTH ─────────────────────────────────────────────
  const activeData = showLast30Min ? last30MinData : filteredData;

  // ── 6. Derived charts & stats from activeData ─────────────────────────────
  const { stats, zoneData, hourlyData, timeSeriesData, tableData } = useMemo(() => {
    if (!activeData.length) {
      return { stats: { totalOccupancyPct: "0.0", currentStudents: 0, availableSeats: 0, peakHour: "-", zoneCapacity: 0 }, zoneData: [], hourlyData: [], timeSeriesData: [], tableData: [] };
    }

    // ── Zone totals ──
    const zoneMap = {};
    activeData.forEach(({ zone, occupancy }) => {
      zoneMap[zone] = (zoneMap[zone] || 0) + occupancy;
    });

    const zoneData = Object.keys(zoneMap).sort().map((z) => ({
      name:  `Zone ${z}`,
      value: zoneMap[z],
      fill:  ZONE_COLORS[z] || "#f97316",
    }));

    // ── Hourly heatmap ──
    const hourMap = {};
    activeData.forEach(({ timestamp, occupancy }) => {
      const h = timestamp.getHours();
      hourMap[h] = (hourMap[h] || 0) + occupancy;
    });
    const hourlyData = Object.keys(hourMap).sort((a, b) => Number(a) - Number(b)).map((h) => ({
      time:  `${h}:00`,
      value: hourMap[h],
    }));
    const maxHourVal = Math.max(...hourlyData.map((d) => d.value), 1);

    // ── Time series (line chart) ──
    const timeMap = {};
    activeData.forEach((item) => {
      const d = new Date(item.timestamp);
      let key;
      if      (viewMode === "hourly")   key = `${d.getHours()}:00`;
      else if (viewMode === "daily")    key = d.toISOString().split("T")[0];
      else if (viewMode === "monthly")  key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      else                              key = `${d.getFullYear()}`;

      if (!timeMap[key]) {
        timeMap[key] = { time: key };
        zones.forEach((z) => { timeMap[key][`Zone ${z}`] = 0; });
      }
      timeMap[key][`Zone ${item.zone}`] = (timeMap[key][`Zone ${item.zone}`] || 0) + item.occupancy;
    });

    const timeSeriesData = Object.values(timeMap).sort((a, b) => {
      if (viewMode === "hourly") return parseInt(a.time) - parseInt(b.time);
      return new Date(a.time) - new Date(b.time);
    });

    // ── Table ──
    const tableData = Object.keys(zoneMap).sort().map((z) => ({
      name:    `Zone ${z}`,
      current: zoneMap[z],
      cap:     ZONE_CAPACITY,
    }));

    // ── Peak hour (based on TOTAL occupancy) ──
    const hourTotals = {};

    activeData.forEach(({ timestamp, occupancy }) => {
    const h = timestamp.getHours();
    hourTotals[h] = (hourTotals[h] || 0) + occupancy;
    });

    const peakEntry = Object.entries(hourTotals)
    .map(([hour, total]) => ({
        hour: Number(hour),
        total
    }))
    .sort((a, b) => b.total - a.total)[0];

    const peakHour = peakEntry
    ? `${peakEntry.hour}:00 – ${peakEntry.hour + 1}:00`
    : "-";

    // ── Overall stats ──
    const totalStudents  = activeData.reduce((s, d) => s + d.occupancy, 0);
    const capacityCount  = selectedZone === "ALL" || showLast30Min ? ZONE_CAPACITY * TOTAL_ZONES : ZONE_CAPACITY;
    const totalOccupancyPct = ((totalStudents / capacityCount) * 100).toFixed(1);

    const stats = {
      totalOccupancyPct,
      currentStudents: totalStudents,
      availableSeats:  Math.max(0, capacityCount - totalStudents),
      peakHour,
      zoneCapacity:    capacityCount,
    };

    return { stats, zoneData, hourlyData: hourlyData.map((d) => ({ ...d, opacity: d.value / maxHourVal })), timeSeriesData, tableData };
  }, [activeData, viewMode, zones, selectedZone, showLast30Min]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleBack = () => {
    setShowLast30Min(false);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return <div style={styles.center}>Loading data…</div>;
  if (loadError) return <div style={styles.center}>Error: {loadError}</div>;

  return (
    <div style={styles.root}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>Library Occupancy Dashboard</h1>
          <p style={styles.subHeading}>Real-time zone monitoring &amp; analytics</p>
        </div>
        {showLast30Min && (
          <span style={styles.liveChip}>🟢 Live · Last 30 Min</span>
        )}
      </div>

      {/* ── FILTERS ────────────────────────────────────────────── */}
      <div style={styles.filterBar}>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>From</label>
          <input type="datetime-local" value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setShowLast30Min(false); }}
            style={styles.input} disabled={showLast30Min} />
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>To</label>
          <input type="datetime-local" value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setShowLast30Min(false); }}
            style={styles.input} disabled={showLast30Min} />
        </div>
        <div style={styles.filterGroup}>
          <label style={styles.filterLabel}>Zone</label>
          <select value={selectedZone}
            onChange={(e) => { setSelectedZone(e.target.value); setShowLast30Min(false); }}
            style={styles.input} disabled={showLast30Min}>
            <option value="ALL">All Zones</option>
            {zones.map((z) => <option key={z} value={z}>Zone {z.replace("zone", "").toUpperCase()}</option>)}
          </select>
        </div>
        <button onClick={() => setShowLast30Min(true)}  style={showLast30Min ? styles.btnActive : styles.btn}>⏱ Last 30 Min</button>
        <button onClick={handleBack} style={styles.btnSecondary} disabled={!showLast30Min}>↩ Back</button>
      </div>

      {/* ══════════════════════════════════════════════════════════
          SHORT VIEW  (≤ 1hr  OR  Last 30 Min)
      ═══════════════════════════════════════════════════════════ */}
      {isShortRange && (
        <>
          {/* KPI Cards */}
          <div style={styles.statGrid}>
            <StatCard title="Total Occupancy"    value={`${stats.totalOccupancyPct}%`}          sub="of total capacity" />
            <StatCard title="Current Students"   value={stats.currentStudents.toLocaleString()}  sub="across all zones" />
            <StatCard title="Available Seats"    value={stats.availableSeats.toLocaleString()}   sub="remaining" />
            <StatCard title="Zone Capacity"      value={stats.zoneCapacity.toLocaleString()}     sub="total seats" />
          </div>

          {/* Zone Status Cards */}
          <ZoneStatusCards tableData={tableData} />

          {/* Bar Chart */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Occupancy by Zone</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={zoneData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 12 }} label={{ value: "Students", angle: -90, position: "insideLeft", fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${v} students`, "Occupancy"]} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {zoneData.map((entry, i) => (
                    <rect key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Table */}
          <OccupancyTable tableData={tableData} />
        </>
      )}

      {/* ══════════════════════════════════════════════════════════
          LONG VIEW  (> 1 hour)
      ═══════════════════════════════════════════════════════════ */}
      {!isShortRange && (
        <>
          {/* Peak Hour Banner */}
          <div style={styles.peakBanner}>
            <span style={styles.peakLabel}>🔥 Peak Hour</span>
            <span style={styles.peakTime}>{stats.peakHour}</span>
            <span style={styles.peakSub}>Consistently busiest time slot</span>
          </div>

          {/* Hourly Heatmap */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Hourly Occupancy Heatmap</h2>
            <div style={styles.heatmapGrid}>
              {hourlyData.map((item, i) => (
                <div key={i} style={{ ...styles.heatCell, background: `rgba(249,115,22,${Math.max(0.08, item.opacity)})` }}>
                  <span style={styles.heatHour}>{item.time}</span>
                  <span style={styles.heatVal}>{item.value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          {/* View Mode Drill Buttons */}
          <div style={styles.drillBar}>
            <span style={styles.drillLabel}>Group by:</span>
            {["hourly", "daily", "monthly", "yearly"].map((mode) => (
              <button key={mode}
                onClick={() => setViewMode(mode)}
                style={viewMode === mode ? styles.drillActive : styles.drillBtn}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {/* Line Chart */}
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Occupancy Over Time</h2>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={timeSeriesData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {zones.map((z) => (
                  <Line key={z} type="monotone" dataKey={`Zone ${z}`}
                    stroke={ZONE_COLORS[z] || "#888"} strokeWidth={2} dot={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {/* Empty state */}
      {activeData.length === 0 && (
        <div style={styles.empty}>No data for the selected range. Try adjusting your filters.</div>
      )}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const styles = {
  root:         { fontFamily: "'Segoe UI', sans-serif", background: "#f8fafc", minHeight: "100vh", padding: "24px", color: "#1e293b" },
  center:       { display: "flex", justifyContent: "center", alignItems: "center", height: "60vh", fontSize: 18, color: "#64748b" },
  header:       { display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 24 },
  heading:      { fontSize: 26, fontWeight: 700, margin: 0, color: "#0f172a" },
  subHeading:   { fontSize: 14, color: "#64748b", margin: "4px 0 0" },
  liveChip:     { background: "#dcfce7", color: "#15803d", fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 20 },

  filterBar:    { background: "#fff", borderRadius: 12, padding: "16px 20px", boxShadow: "0 1px 4px rgba(0,0,0,.08)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 24 },
  filterGroup:  { display: "flex", flexDirection: "column", gap: 4 },
  filterLabel:  { fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em" },
  input:        { border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 14, color: "#0f172a", outline: "none", background: "#fff" },
  btn:          { padding: "8px 18px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  btnActive:    { padding: "8px 18px", background: "#ea580c", color: "#fff", border: "2px solid #c2410c", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 14 },
  btnSecondary: { padding: "8px 18px", background: "#f1f5f9", color: "#64748b", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },

  statGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 },
  statCard:     { background: "#fff", borderRadius: 12, padding: "20px", boxShadow: "0 1px 4px rgba(0,0,0,.07)", borderTop: "3px solid #f97316" },
  statTitle:    { fontSize: 12, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", margin: "0 0 8px" },
  statValue:    { fontSize: 28, fontWeight: 800, color: "#0f172a", margin: "0 0 4px" },
  statSub:      { fontSize: 12, color: "#94a3b8", margin: 0 },

  card:         { background: "#fff", borderRadius: 12, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,.07)", marginBottom: 20 },
  cardTitle:    { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 16px" },

  zoneGrid:     { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 },
  zoneCard:     { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16 },
  zoneName:     { fontWeight: 600, fontSize: 14, color: "#334155" },
  badge:        { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: ".04em" },
  zonePct:      { fontSize: 24, fontWeight: 800, color: "#0f172a", margin: "10px 0 2px" },
  zonePctSub:   { fontSize: 13, fontWeight: 400, color: "#94a3b8" },
  zoneCount:    { fontSize: 12, color: "#64748b", margin: "0 0 10px" },
  progressTrack:{ height: 6, background: "#e2e8f0", borderRadius: 10, overflow: "hidden" },
  progressBar:  { height: "100%", borderRadius: 10, transition: "width .4s" },

  table:        { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th:           { textAlign: "left", padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".05em", borderBottom: "2px solid #e2e8f0" },
  td:           { padding: "10px 14px", borderBottom: "1px solid #f1f5f9", color: "#334155" },

  peakBanner:   { background: "linear-gradient(135deg,#fff7ed,#ffedd5)", border: "1px solid #fed7aa", borderRadius: 12, padding: "20px 28px", display: "flex", alignItems: "center", gap: 20, marginBottom: 20, flexWrap: "wrap" },
  peakLabel:    { fontSize: 13, fontWeight: 700, color: "#ea580c", textTransform: "uppercase", letterSpacing: ".05em" },
  peakTime:     { fontSize: 28, fontWeight: 800, color: "#c2410c" },
  peakSub:      { fontSize: 13, color: "#9a3412" },

  heatmapGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 },
  heatCell:     { borderRadius: 8, padding: "10px 6px", textAlign: "center", display: "flex", flexDirection: "column", gap: 2 },
  heatHour:     { fontSize: 12, fontWeight: 600, color: "#7c3e0a" },
  heatVal:      { fontSize: 11, color: "#9a4d12" },

  drillBar:     { display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" },
  drillLabel:   { fontSize: 13, fontWeight: 600, color: "#64748b" },
  drillBtn:     { padding: "6px 16px", background: "#f1f5f9", color: "#475569", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 500, fontSize: 13 },
  drillActive:  { padding: "6px 16px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 13 },

  empty:        { textAlign: "center", padding: "60px 20px", color: "#94a3b8", fontSize: 16 },
};
