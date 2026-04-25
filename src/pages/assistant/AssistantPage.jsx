import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export default function AssistantPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const zoneCapacities = {
    zone1: 24,
    zone2: 20,
    zone3: 28,
    zone4: 18,
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
            Timestamp: rowObject.Timestamp,
            Zone_ID: rowObject.Zone_ID,
            Hour: Number((rowObject.Timestamp || '').split(' ')[1]?.split(':')[0]),
            Occupancy_Count: Number(rowObject.Occupancy_Count),
            Noise_Level: Number(rowObject.Noise_Level),
            Temperature: Number(rowObject.Temperature),
            WiFi_Speed: Number(rowObject.WiFi_Speed),
          };
        });

        setRecords(
          parsed.filter(
            (item) =>
              item.Zone_ID &&
              !Number.isNaN(item.Hour) &&
              !Number.isNaN(item.Occupancy_Count) &&
              !Number.isNaN(item.Noise_Level) &&
              !Number.isNaN(item.Temperature) &&
              !Number.isNaN(item.WiFi_Speed)
          )
        );
      } catch (error) {
        console.error('Error loading assistant data:', error);
      }
    };

    loadData();
  }, []);

  const kpis = useMemo(() => {
    if (records.length === 0) return null;
    const total = records.length;
    const quietCompliant = records.filter((r) => r.Noise_Level <= 50).length;
    const wifiHealthy = records.filter((r) => r.WiFi_Speed >= 120).length;
    const thermalComfort = records.filter((r) => r.Temperature >= 20 && r.Temperature <= 24).length;
    const critical = records.filter((r) => {
      const utilization = r.Occupancy_Count / (zoneCapacities[r.Zone_ID] || 24);
      return r.Noise_Level > 58 || r.WiFi_Speed < 90 || utilization > 0.9 || r.Temperature < 19 || r.Temperature > 26;
    }).length;

    return {
      quietCompliance: ((quietCompliant / total) * 100).toFixed(1),
      wifiHealth: ((wifiHealthy / total) * 100).toFixed(1),
      thermalComfort: ((thermalComfort / total) * 100).toFixed(1),
      criticalWindows: ((critical / total) * 100).toFixed(1),
    };
  }, [records]);

  const zoneLoad = useMemo(() => {
    if (records.length === 0) return [];
    const grouped = records.reduce((acc, row) => {
      if (!acc[row.Zone_ID]) {
        acc[row.Zone_ID] = { zone: row.Zone_ID, totalOccupancy: 0, totalNoise: 0, totalUtilization: 0, samples: 0 };
      }
      const capacity = zoneCapacities[row.Zone_ID] || 24;
      acc[row.Zone_ID].totalOccupancy += row.Occupancy_Count;
      acc[row.Zone_ID].totalNoise += row.Noise_Level;
      acc[row.Zone_ID].totalUtilization += row.Occupancy_Count / capacity;
      acc[row.Zone_ID].samples += 1;
      return acc;
    }, {});

    return Object.values(grouped)
      .map((z) => ({
        zone: z.zone,
        avgOccupancy: Number((z.totalOccupancy / z.samples).toFixed(1)),
        avgNoise: Number((z.totalNoise / z.samples).toFixed(1)),
        utilizationPct: Number(((z.totalUtilization / z.samples) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.utilizationPct - a.utilizationPct);
  }, [records]);

  const hourlyOpsTrend = useMemo(() => {
    if (records.length === 0) return [];
    const grouped = records.reduce((acc, row) => {
      if (!acc[row.Hour]) {
        acc[row.Hour] = { hour: row.Hour, samples: 0, totalNoise: 0, totalOccupancy: 0 };
      }
      acc[row.Hour].samples += 1;
      acc[row.Hour].totalNoise += row.Noise_Level;
      acc[row.Hour].totalOccupancy += row.Occupancy_Count;
        const capacity = zoneCapacities[row.Zone_ID] || 24;
        acc[row.Hour].totalUtilization = (acc[row.Hour].totalUtilization || 0) + row.Occupancy_Count / capacity;
      return acc;
    }, {});

    return Object.values(grouped)
      .map((h) => ({
        hour: h.hour,
        hourLabel: `${String(h.hour).padStart(2, '0')}:00`,
        avgNoise: Number((h.totalNoise / h.samples).toFixed(1)),
        avgOccupancy: Number((h.totalOccupancy / h.samples).toFixed(1)),
        avgUtilization: Number((((h.totalUtilization || 0) / h.samples) * 100).toFixed(1)),
      }))
      .sort((a, b) => a.hour - b.hour);
  }, [records]);

  const liveActions = useMemo(() => {
    if (zoneLoad.length === 0) return [];
    return zoneLoad.flatMap((zone) => {
      const actions = [];
      if (zone.utilizationPct > 85) {
        actions.push(`${zone.zone}: open overflow seating and increase walkthrough frequency.`);
      }
      if (zone.avgNoise > 55) {
        actions.push(`${zone.zone}: trigger quiet-zone reminder and monitor group activity.`);
      }
      return actions;
    }).slice(0, 4);
  }, [zoneLoad]);

  return (
    <div className="content-area">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="page-eyebrow">Library Assistant</span>
          <h1>Operations Dashboard</h1>
          <p>Monitor crowding, noise, connectivity, and environmental trends for daily floor management.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/assistant/insights" className="secondary-btn">Assistant Insights</Link>
          <button onClick={handleLogout} className="danger-btn">Logout</button>
        </div>
      </div>

      <div className="metrics-grid" style={{ marginBottom: '20px' }}>
        <div className="card metric-card accent-red">
          <div className="metric-label">Quiet Compliance</div>
          <div className="metric-value">{kpis ? `${kpis.quietCompliance}%` : '--'}</div>
          <div className="metric-helper">Records at or below 50 dB target</div>
        </div>
        <div className="card metric-card accent-orange">
          <div className="metric-label">Thermal Comfort</div>
          <div className="metric-value">{kpis ? `${kpis.thermalComfort}%` : '--'}</div>
          <div className="metric-helper">Records within 20C-24C band</div>
        </div>
        <div className="card metric-card accent-blue">
          <div className="metric-label">WiFi Service Health</div>
          <div className="metric-value">{kpis ? `${kpis.wifiHealth}%` : '--'}</div>
          <div className="metric-helper">Records at or above 120 Mbps</div>
        </div>
        <div className="card metric-card accent-green">
          <div className="metric-label">Critical Service Windows</div>
          <div className="metric-value">{kpis ? `${kpis.criticalWindows}%` : '--'}</div>
          <div className="metric-helper">Noise, crowding, WiFi or HVAC breaches</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Zone Utilization</h3>
        <p style={{ color: '#475569' }}>Average occupancy utilization by zone based on seat capacity.</p>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={zoneLoad} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="zone" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="utilizationPct" name="Utilization (%)" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Zone Noise Profile</h3>
        <p style={{ color: '#475569' }}>Average measured noise level in each zone.</p>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={zoneLoad} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="zone" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgNoise" name="Avg Noise (dB)" fill="#f97316" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Hourly Utilization Trend</h3>
        <p style={{ color: '#475569' }}>Tracks how utilization changes by hour.</p>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={hourlyOpsTrend} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hourLabel" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="avgUtilization" name="Avg Utilization (%)" stroke="#2563eb" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Hourly Noise Trend</h3>
        <p style={{ color: '#475569' }}>Shows when quiet-zone policy pressure is highest.</p>
        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={hourlyOpsTrend} margin={{ top: 16, right: 16, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hourLabel" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="avgNoise" name="Avg Noise (dB)" stroke="#ef4444" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3>Current Shift Action Queue</h3>
        {liveActions.length > 0 ? (
          <ul style={{ margin: 0, paddingLeft: '18px', color: '#475569', display: 'grid', gap: '8px' }}>
            {liveActions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        ) : (
          <p style={{ color: '#475569' }}>No immediate interventions required. Continue routine monitoring.</p>
        )}
      </div>
    </div>
  );
}
