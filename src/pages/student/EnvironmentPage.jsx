import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  ComposedChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

// ─── Helper: compute a 0-100 comfort score per row ───────────────────────────
// Ideal: Temp ~22°C, Humidity ~45%, Air Quality > 400 (higher = more CO2 = worse)
function comfortScore(temp, humidity, airQuality) {
  const tempScore   = Math.max(0, 100 - Math.abs(temp - 22) * 6);
  const humidScore  = Math.max(0, 100 - Math.abs(humidity - 45) * 2);
  // Air Quality in dataset is 267-700+; lower = worse (CO₂/particulate proxy)
  const aqScore     = Math.min(100, (airQuality / 700) * 100);
  return ((tempScore + humidScore + aqScore) / 3).toFixed(1);
}

// ─── Score → HSL colour (green = good, red = bad) ────────────────────────────
function scoreToColor(score) {
  const hue = (score / 100) * 120; // 0 = red, 120 = green
  return `hsl(${hue}, 65%, 55%)`;
}

export default function EnvironmentPage() {
  const { logout } = useAuth();
  const navigate   = useNavigate();

  const [allRows, setAllRows]           = useState([]);
  const [selectedDay, setSelectedDay]   = useState('All');
  const [selectedTime, setSelectedTime] = useState('All');
  const [selectedZone, setSelectedZone] = useState('All');

  const [availableDays, setAvailableDays]   = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [availableZones, setAvailableZones] = useState([]);

  const handleLogout = () => { logout(); navigate('/login'); };

  // ── Load CSV once ───────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const res     = await fetch('/data/library_data.csv');
        const text    = await res.text();
        const rows    = text.trim().split('\n');
        const headers = rows[0].split(',').map(h => h.trim());

        const daysSet  = new Set();
        const timesSet = new Set();
        const zonesSet = new Set();
        const parsed   = [];

        rows.slice(1).forEach(row => {
          const vals = row.split(',');
          const obj  = {};
          headers.forEach((h, i) => { obj[h] = vals[i]?.trim(); });

          const ts = obj.Timestamp;
          if (ts && ts.includes(' ')) {
            const hour = ts.split(' ')[1].split(':')[0] + ':00';
            obj.Hour = hour;
            timesSet.add(hour);
          }
          if (obj.Day_of_the_week) daysSet.add(obj.Day_of_the_week.trim());
          if (obj.Zone_ID)         zonesSet.add(obj.Zone_ID.trim());

          parsed.push(obj);
        });

        setAvailableDays(Array.from(daysSet));
        setAvailableTimes(Array.from(timesSet).sort());
        setAvailableZones(Array.from(zonesSet).sort());
        setAllRows(parsed);
      } catch (e) {
        console.error('CSV load error:', e);
      }
    };
    load();
  }, []);

  // ── Apply filters ───────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    return allRows.filter(r => {
      if (selectedDay  !== 'All' && r.Day_of_the_week?.trim() !== selectedDay)  return false;
      if (selectedTime !== 'All' && r.Hour !== selectedTime)                     return false;
      if (selectedZone !== 'All' && r.Zone_ID?.trim()         !== selectedZone)  return false;
      return true;
    });
  }, [allRows, selectedDay, selectedTime, selectedZone]);

  // ── Summary stats ───────────────────────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const valid = filteredRows.filter(r =>
      !isNaN(+r.Temperature) && !isNaN(+r.Humidity) && !isNaN(+r.Air_Quality)
    );
    if (!valid.length) return { temp: '-', humidity: '-', airQuality: '-', count: 0 };

    const n = valid.length;
    const avgTemp       = (valid.reduce((s, r) => s + +r.Temperature, 0) / n).toFixed(1);
    const avgHumidity   = (valid.reduce((s, r) => s + +r.Humidity, 0) / n).toFixed(1);
    const avgAirQuality = (valid.reduce((s, r) => s + +r.Air_Quality, 0) / n).toFixed(0);
    return { temp: avgTemp, humidity: avgHumidity, airQuality: avgAirQuality, count: n };
  }, [filteredRows]);

  // ── Chart 1: Temp & Humidity trends by hour ─────────────────────────────────
  const trendData = useMemo(() => {
    const hourMap = {};
    filteredRows.forEach(r => {
      const h    = r.Hour;
      const temp = +r.Temperature;
      const hum  = +r.Humidity;
      if (!h || isNaN(temp) || isNaN(hum)) return;
      if (!hourMap[h]) hourMap[h] = { hour: h, tempSum: 0, humSum: 0, n: 0 };
      hourMap[h].tempSum += temp;
      hourMap[h].humSum  += hum;
      hourMap[h].n       += 1;
    });
    return Object.values(hourMap)
      .sort((a, b) => a.hour.localeCompare(b.hour))
      .map(d => ({
        hour:        d.hour,
        Avg_Temp:    +(d.tempSum / d.n).toFixed(2),
        Avg_Humidity:+(d.humSum  / d.n).toFixed(2),
      }));
  }, [filteredRows]);

  // ── Chart 2: Air Quality by Zone ────────────────────────────────────────────
  const airQualityByZone = useMemo(() => {
    const zoneMap = {};
    filteredRows.forEach(r => {
      const z  = r.Zone_ID?.trim();
      const aq = +r.Air_Quality;
      if (!z || isNaN(aq)) return;
      if (!zoneMap[z]) zoneMap[z] = { zone: z, sum: 0, n: 0 };
      zoneMap[z].sum += aq;
      zoneMap[z].n   += 1;
    });
    return Object.values(zoneMap)
      .sort((a, b) => a.zone.localeCompare(b.zone))
      .map(d => ({
        Zone_ID:         d.zone.replace('zone', 'Zone '),
        Avg_Air_Quality: +(d.sum / d.n).toFixed(1),
      }));
  }, [filteredRows]);

  // ── Chart 3: Temp vs Humidity scatter + trend line ──────────────────────────
  const scatterData = useMemo(() => {
    const valid = filteredRows
      .filter(r => !isNaN(+r.Temperature) && !isNaN(+r.Humidity))
      .map(r => ({ x: +r.Temperature, y: +r.Humidity }));

    if (valid.length < 2) return valid.map(d => ({ ...d, Trend: null }));

    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    const n = valid.length;
    valid.forEach(({ x, y }) => { sx += x; sy += y; sxy += x * y; sxx += x * x; });
    const slope     = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const intercept = (sy - slope * sx) / n;

    return [...valid]
      .sort((a, b) => a.x - b.x)
      .map(d => ({ ...d, Trend: +(slope * d.x + intercept).toFixed(2) }));
  }, [filteredRows]);

  // ── Chart 4: Comfort heatmap by zone ────────────────────────────────────────
  const comfortByZone = useMemo(() => {
    const zoneMap = {};
    filteredRows.forEach(r => {
      const z   = r.Zone_ID?.trim();
      const t   = +r.Temperature;
      const h   = +r.Humidity;
      const aq  = +r.Air_Quality;
      if (!z || isNaN(t) || isNaN(h) || isNaN(aq)) return;
      if (!zoneMap[z]) zoneMap[z] = { tempSum: 0, humSum: 0, aqSum: 0, n: 0 };
      zoneMap[z].tempSum += t;
      zoneMap[z].humSum  += h;
      zoneMap[z].aqSum   += aq;
      zoneMap[z].n       += 1;
    });
    return Object.entries(zoneMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([zone, d]) => {
        const avgTemp = d.tempSum / d.n;
        const avgHum  = d.humSum  / d.n;
        const avgAQ   = d.aqSum   / d.n;
        const score   = +comfortScore(avgTemp, avgHum, avgAQ);
        return {
          zone,
          label:   zone.replace('zone', 'Zone '),
          score,
          avgTemp: avgTemp.toFixed(1),
          avgHum:  avgHum.toFixed(1),
          avgAQ:   avgAQ.toFixed(0),
          color:   scoreToColor(score),
          textColor: score < 50 ? 'white' : 'black',
        };
      });
  }, [filteredRows]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="content-area">
      {/* ── Header ── */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="page-eyebrow">Student Dashboard</span>
          <h1>Environmental Conditions</h1>
          <p>Analyse temperature, humidity, and air quality across library zones.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/student" className="secondary-btn">Back to Overview</Link>
          <button onClick={handleLogout} className="danger-btn">Logout</button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="card" style={{ marginBottom: '20px', display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {[
          { label: 'Day of Week',  value: selectedDay,  setter: setSelectedDay,  all: 'All Days',  opts: availableDays  },
          { label: 'Time (Hour)',  value: selectedTime, setter: setSelectedTime, all: 'All Times', opts: availableTimes },
          { label: 'Zone',        value: selectedZone, setter: setSelectedZone, all: 'All Zones', opts: availableZones },
        ].map(({ label, value, setter, all, opts }) => (
          <div key={label}>
            <label style={{ display: 'block', fontSize: '0.9em', color: '#64748b', marginBottom: '5px' }}>{label}</label>
            <select
              value={value}
              onChange={e => setter(e.target.value)}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1em', minWidth: '150px' }}
            >
              <option value="All">{all}</option>
              {opts.map(o => <option key={o} value={o}>{o.replace('zone', 'Zone ')}</option>)}
            </select>
          </div>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: '0.85em', color: '#94a3b8', alignSelf: 'center' }}>
          {summaryStats.count} records selected
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '20px' }}>
        {[
          { label: 'Avg Temperature', value: summaryStats.temp     !== '-' ? `${summaryStats.temp} °C`  : '-', color: '#ef4444', bg: '#fef2f2' },
          { label: 'Avg Humidity',    value: summaryStats.humidity !== '-' ? `${summaryStats.humidity} %` : '-', color: '#3b82f6', bg: '#eff6ff' },
          { label: 'Avg Air Quality', value: summaryStats.airQuality !== '-' ? `${summaryStats.airQuality} AQI` : '-', color: '#10b981', bg: '#f0fdf4' },
        ].map(({ label, value, color, bg }) => (
          <div key={label} className="card" style={{ background: bg, borderLeft: `4px solid ${color}`, marginBottom: 0 }}>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.85em', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</p>
            <p style={{ margin: '6px 0 0', fontSize: '2em', fontWeight: 700, color }}>{value}</p>
          </div>
        ))}
      </div>

      {/* ── Chart 1: Temp & Humidity Trend ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Temperature &amp; Humidity Trends by Hour</h3>
        <p style={{ color: '#475569' }}>
          Tracks how average temperature (°C) and relative humidity (%) shift throughout the day across the selected filters.
        </p>
        <div style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" label={{ value: 'Hour of Day', position: 'insideBottom', offset: -15 }} />
              <YAxis yAxisId="temp" orientation="left"
                label={{ value: 'Temperature (°C)', angle: -90, position: 'insideLeft', offset: 10 }} />
              <YAxis yAxisId="hum" orientation="right"
                label={{ value: 'Humidity (%)', angle: 90, position: 'insideRight', offset: 10 }} />
              <Tooltip />
              <Legend verticalAlign="top" height={36} />
              <Line yAxisId="temp" type="monotone" dataKey="Avg_Temp"     name="Avg Temp (°C)"    stroke="#ef4444" strokeWidth={2} dot={false} />
              <Line yAxisId="hum"  type="monotone" dataKey="Avg_Humidity" name="Avg Humidity (%)" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Chart 2: Air Quality by Zone ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Air Quality Index by Zone</h3>
        <p style={{ color: '#475569' }}>
          Compares the average air quality reading across zones. Lower values may indicate poorer ventilation or higher CO₂ concentration.
        </p>
        <div style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={airQualityByZone} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="Zone_ID" />
              <YAxis label={{ value: 'Avg Air Quality', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Avg_Air_Quality" name="Avg Air Quality (AQI)" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Chart 3: Temp vs Humidity Scatter ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Temperature vs. Humidity Correlation</h3>
        <p style={{ color: '#475569' }}>
          Each point represents one sensor reading. The red trend line reveals whether temperature and humidity rise or fall together.
        </p>
        <div style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={scatterData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" type="number" domain={['auto', 'auto']}
                label={{ value: 'Temperature (°C)', position: 'insideBottom', offset: -15 }} />
              <YAxis dataKey="y"
                label={{ value: 'Humidity (%)', angle: -90, position: 'insideLeft', offset: 10 }} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend verticalAlign="top" height={36} />
              <Scatter name="Reading" dataKey="y" fill="#a78bfa" fillOpacity={0.6} />
              <Line type="monotone" dataKey="Trend" name="Trend Line" stroke="#ef4444" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Chart 4: Comfort Heatmap ── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Environmental Comfort Score by Zone</h3>
        <p style={{ color: '#475569' }}>
          A composite score (0–100) derived from temperature proximity to 22 °C, humidity proximity to 45%, and air quality level.
          Greener = more comfortable. Hover a card for zone-level detail.
        </p>
        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
          {comfortByZone.map(z => (
            <div
              key={z.zone}
              title={`Avg Temp: ${z.avgTemp}°C | Avg Humidity: ${z.avgHum}% | Avg AQI: ${z.avgAQ}`}
              style={{
                flex: '1 1 120px',
                minWidth: '120px',
                padding: '20px 12px',
                textAlign: 'center',
                backgroundColor: z.color,
                color: z.textColor,
                borderRadius: '10px',
                cursor: 'default',
                transition: 'transform 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.04)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <div style={{ fontWeight: 700, fontSize: '1.1em', marginBottom: '6px' }}>{z.label}</div>
              <div style={{ fontSize: '2em', fontWeight: 800 }}>{z.score}</div>
              <div style={{ fontSize: '0.8em', marginTop: '4px', opacity: 0.85 }}>/ 100</div>
              <div style={{ fontSize: '0.75em', marginTop: '8px', lineHeight: 1.6 }}>
                🌡 {z.avgTemp}°C<br />
                💧 {z.avgHum}%<br />
                🌿 AQI {z.avgAQ}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer logout ── */}
      <div className="card" style={{ display: 'flex', justifyContent: 'center' }}>
        <button onClick={handleLogout} className="danger-btn">Logout</button>
      </div>
    </div>
  );
}