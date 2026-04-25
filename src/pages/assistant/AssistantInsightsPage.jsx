import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';

export default function AssistantInsightsPage() {
  const [data, setData] = useState([]);
  const [selectedDay, setSelectedDay] = useState('all');
  const [selectedStartHour, setSelectedStartHour] = useState(9);
  const [selectedEndHour, setSelectedEndHour] = useState(17);
  const zoneCapacities = { zone1: 24, zone2: 20, zone3: 28, zone4: 18 };

  useEffect(() => {
    const loadData = async () => {
      try {
        const response = await fetch('/data/library_data.csv');
        const csvText = await response.text();
        const rows = csvText.trim().split('\n');
        const headers = rows[0].split(',');
        const parsed = rows.slice(1).map((row) => {
          const values = row.split(',');
          const rowObject = {};
          headers.forEach((header, index) => {
            rowObject[header.trim()] = values[index]?.trim();
          });
          return {
            Day: rowObject.Day_of_the_week,
            Zone: rowObject.Zone_ID,
            Hour: Number((rowObject.Timestamp || '').split(' ')[1]?.split(':')[0]),
            Occupancy: Number(rowObject.Occupancy_Count),
            Noise: Number(rowObject.Noise_Level),
            Temp: Number(rowObject.Temperature),
            Wifi: Number(rowObject.WiFi_Speed),
          };
        });
        setData(
          parsed.filter(
            (d) =>
              d.Day &&
              d.Zone &&
              !Number.isNaN(d.Hour) &&
              !Number.isNaN(d.Occupancy) &&
              !Number.isNaN(d.Noise) &&
              !Number.isNaN(d.Temp) &&
              !Number.isNaN(d.Wifi)
          )
        );
      } catch (error) {
        console.error('Error loading assistant insights:', error);
      }
    };
    loadData();
  }, []);

  const dayOptions = useMemo(() => ['all', ...Array.from(new Set(data.map((d) => d.Day)))], [data]);
  const hours = Array.from({ length: 9 }, (_, index) => 9 + index);

  const filtered = useMemo(
    () =>
      data.filter(
        (d) =>
          (selectedDay === 'all' || d.Day === selectedDay) &&
          d.Hour >= selectedStartHour &&
          d.Hour <= selectedEndHour
      ),
    [data, selectedDay, selectedStartHour, selectedEndHour]
  );

  const incidentSummary = useMemo(() => {
    if (filtered.length === 0) return [];
    const grouped = filtered.reduce((acc, row) => {
      if (!acc[row.Zone]) {
        acc[row.Zone] = { zone: row.Zone, highNoise: 0, crowding: 0, lowWifi: 0, samples: 0 };
      }
      acc[row.Zone].samples += 1;
      if (row.Noise > 55) acc[row.Zone].highNoise += 1;
      if (row.Occupancy / (zoneCapacities[row.Zone] || 24) > 0.85) acc[row.Zone].crowding += 1;
      if (row.Wifi < 110) acc[row.Zone].lowWifi += 1;
      return acc;
    }, {});

    return Object.values(grouped).map((z) => {
      const denominator = z.samples || 1;
      return {
        zone: z.zone,
        noiseIncidents: Number(((z.highNoise / denominator) * 100).toFixed(1)),
        crowdIncidents: Number(((z.crowding / denominator) * 100).toFixed(1)),
        wifiIncidents: Number(((z.lowWifi / denominator) * 100).toFixed(1)),
      };
    });
  }, [filtered]);

  const trendData = useMemo(() => {
    if (filtered.length === 0) return [];
    const grouped = filtered.reduce((acc, row) => {
      if (!acc[row.Hour]) {
        acc[row.Hour] = { hour: row.Hour, samples: 0, noise: 0, occupancy: 0, temp: 0, wifi: 0 };
      }
      acc[row.Hour].samples += 1;
      acc[row.Hour].noise += row.Noise;
      acc[row.Hour].occupancy += row.Occupancy;
      acc[row.Hour].temp += row.Temp;
      acc[row.Hour].wifi += row.Wifi;
      return acc;
    }, {});
    return Object.values(grouped)
      .map((h) => ({
        hour: h.hour,
        hourLabel: `${String(h.hour).padStart(2, '0')}:00`,
        noise: Number((h.noise / h.samples).toFixed(1)),
        occupancy: Number((h.occupancy / h.samples).toFixed(1)),
        temp: Number((h.temp / h.samples).toFixed(1)),
        wifi: Number((h.wifi / h.samples).toFixed(1)),
      }))
      .sort((a, b) => a.hour - b.hour);
  }, [filtered]);

  const staffingNotes = useMemo(() => {
    if (trendData.length === 0) return [];
    return trendData
      .filter((h) => h.occupancy > 22 || h.noise > 52 || h.wifi < 115 || h.temp > 25)
      .map((h) => {
        if (h.noise > 54) return `At ${h.hourLabel}, deploy quiet-floor patrol (noise ${h.noise} dB).`;
        if (h.occupancy > 24) return `At ${h.hourLabel}, assign overflow seating support (occupancy ${h.occupancy}).`;
        if (h.wifi < 110) return `At ${h.hourLabel}, alert IT support for network congestion (WiFi ${h.wifi} Mbps).`;
        return `At ${h.hourLabel}, review HVAC output (temperature ${h.temp}C).`;
      })
      .slice(0, 4);
  }, [trendData]);

  const serviceRisk = useMemo(() => {
    if (filtered.length === 0) return null;
    const risky = filtered.filter((row) => {
      const utilization = row.Occupancy / (zoneCapacities[row.Zone] || 24);
      return row.Noise > 55 || utilization > 0.85 || row.Wifi < 110 || row.Temp > 25 || row.Temp < 19;
    }).length;
    return Number(((risky / filtered.length) * 100).toFixed(1));
  }, [filtered]);

  return (
    <div className="content-area">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="page-eyebrow">Library Assistant</span>
          <h1>Assistant Insights</h1>
          <p>Actionable analysis for staffing, quiet-zone enforcement, and service quality over time.</p>
        </div>
        <Link to="/assistant" className="secondary-btn">Back to Operations</Link>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Filters</h3>
        <p style={{ color: '#475569' }}>
          Filters apply to incident rates and shift recommendations. Service risk: <strong>{serviceRisk ?? '--'}%</strong>
        </p>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px' }}>
          <label style={{ display: 'grid', gap: '6px' }}>
            <span>Day</span>
            <select value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
              {dayOptions.map((day) => (
                <option key={day} value={day}>{day === 'all' ? 'All Days' : day}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '6px' }}>
            <span>Start Time</span>
            <select
              value={selectedStartHour}
              onChange={(e) => {
                const value = Number(e.target.value);
                setSelectedStartHour(value);
                if (value > selectedEndHour) setSelectedEndHour(value);
              }}
            >
              {hours.map((h) => (
                <option key={h} value={h}>{`${h}:00`}</option>
              ))}
            </select>
          </label>
          <label style={{ display: 'grid', gap: '6px' }}>
            <span>End Time</span>
            <select
              value={selectedEndHour}
              onChange={(e) => {
                const value = Number(e.target.value);
                setSelectedEndHour(value);
                if (value < selectedStartHour) setSelectedStartHour(value);
              }}
            >
              {hours.map((h) => (
                <option key={h} value={h}>{`${h}:00`}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Noise Incident Rate by Zone</h3>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={incidentSummary} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="zone" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="noiseIncidents" fill="#ef4444" name="High Noise Rate (%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Crowding Incident Rate by Zone</h3>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={incidentSummary} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="zone" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="crowdIncidents" fill="#f59e0b" name="Crowding Rate (%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Low WiFi Incident Rate by Zone</h3>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={incidentSummary} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="zone" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="wifiIncidents" fill="#3b82f6" name="Low WiFi Rate (%)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Occupancy Over Time</h3>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hourLabel" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="occupancy" stroke="#2563eb" name="Occupancy" strokeWidth={2.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Noise Over Time</h3>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hourLabel" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="noise" stroke="#ef4444" name="Noise (dB)" strokeWidth={2.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Temperature Over Time</h3>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hourLabel" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="temp" stroke="#f97316" name="Temperature (C)" strokeWidth={2.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>WiFi Speed Over Time</h3>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendData} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hourLabel" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="wifi" stroke="#14b8a6" name="WiFi (Mbps)" strokeWidth={2.2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Suggested Assistant Actions</h3>
        {staffingNotes.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: '18px', color: '#475569', display: 'grid', gap: '8px' }}>
            {staffingNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#475569' }}>No immediate staffing interventions suggested for current filters.</p>
        )}
      </div>
    </div>
  );
}
