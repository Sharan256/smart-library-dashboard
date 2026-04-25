import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadLibraryData } from '../../utils/libraryData';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

export default function StudentInsightsPage() {
  const [libraryData, setLibraryData] = useState([]);
  const [selectedDay, setSelectedDay] = useState('All');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');

  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await loadLibraryData();

        setLibraryData(
          data.filter(
            (item) =>
              item.Zone_ID &&
              item.Occupancy_Count !== null &&
              item.Noise_Level !== null &&
              item.Temperature !== null &&
              item.Light_Level !== null &&
              item.Air_Quality !== null &&
              item.WiFi_Speed !== null
          )
        );
      } catch (error) {
        console.error('Error loading library data:', error);
      }
    };

    loadData();
  }, []);

  const boundedScore = (value) => Math.max(0, Math.min(100, value));

  const getTimeOnly = (timestamp) => {
    if (!timestamp) return '';

    const date = new Date(timestamp);

    if (!isNaN(date.getTime())) {
      return date.toTimeString().slice(0, 5);
    }

    const match = String(timestamp).match(/(\d{2}:\d{2})/);
    return match ? match[1] : '';
  };

  const getComfortScore = (row) => {
    const noiseScore = boundedScore(100 - Math.abs(row.Noise_Level - 40) * 2);
    const occupancyScore = boundedScore(100 - row.Occupancy_Count);
    const temperatureScore = boundedScore(
      100 - Math.abs(row.Temperature - 23) * 8
    );
    const lightScore = boundedScore(100 - Math.abs(row.Light_Level - 500) / 5);
    const airQualityScore = boundedScore(
      100 - Math.abs(row.Air_Quality - 550) / 5
    );
    const wifiScore = boundedScore(row.WiFi_Speed);

    return (
      noiseScore * 0.25 +
      occupancyScore * 0.25 +
      temperatureScore * 0.15 +
      lightScore * 0.15 +
      airQualityScore * 0.1 +
      wifiScore * 0.1
    );
  };

  const days = useMemo(() => {
    const uniqueDays = [
      ...new Set(libraryData.map((item) => item.Day_of_the_week)),
    ].filter(Boolean);

    return ['All', ...uniqueDays];
  }, [libraryData]);

  const filteredData = useMemo(() => {
    return libraryData.filter((row) => {
      const rowTime = getTimeOnly(row.Timestamp);

      const dayMatch =
        selectedDay === 'All' || row.Day_of_the_week === selectedDay;

      const timeMatch = rowTime >= startTime && rowTime <= endTime;

      return dayMatch && timeMatch;
    });
  }, [libraryData, selectedDay, startTime, endTime]);

  const zoneComfortData = useMemo(() => {
    const grouped = {};

    filteredData.forEach((row) => {
      if (!grouped[row.Zone_ID]) {
        grouped[row.Zone_ID] = {
          zone: row.Zone_ID,
          totalComfort: 0,
          totalNoise: 0,
          totalOccupancy: 0,
          totalTemperature: 0,
          totalLight: 0,
          totalWifi: 0,
          count: 0,
        };
      }

      grouped[row.Zone_ID].totalComfort += getComfortScore(row);
      grouped[row.Zone_ID].totalNoise += row.Noise_Level;
      grouped[row.Zone_ID].totalOccupancy += row.Occupancy_Count;
      grouped[row.Zone_ID].totalTemperature += row.Temperature;
      grouped[row.Zone_ID].totalLight += row.Light_Level;
      grouped[row.Zone_ID].totalWifi += row.WiFi_Speed;
      grouped[row.Zone_ID].count += 1;
    });

    return Object.values(grouped)
      .map((item) => ({
        zone: item.zone.toUpperCase(),
        comfortScore: Number((item.totalComfort / item.count).toFixed(1)),
        avgNoise: Number((item.totalNoise / item.count).toFixed(1)),
        avgOccupancy: Number((item.totalOccupancy / item.count).toFixed(1)),
        avgTemperature: Number((item.totalTemperature / item.count).toFixed(1)),
        avgLight: Number((item.totalLight / item.count).toFixed(1)),
        avgWifi: Number((item.totalWifi / item.count).toFixed(1)),
      }))
      .sort((a, b) => b.comfortScore - a.comfortScore);
  }, [filteredData]);

  const bestZone = zoneComfortData[0];

  const resetFilters = () => {
    setSelectedDay('All');
    setStartTime('09:00');
    setEndTime('18:00');
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <span className="page-eyebrow">Student Dashboard</span>
          <h1>Student Space Insights</h1>
          <p>
            Students can compare study zone comfortableness based on day and
            time.
          </p>
        </div>

        <Link to="/student" className="secondary-btn">
          Back to Student Dashboard
        </Link>
        <Link to="/student/environment" className="secondary-btn">
          Environment
        </Link>
        <Link to="/student/occupancy" className="secondary-btn">
          Occupancy Analytics
        </Link>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Filter Study Conditions</h3>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginTop: '16px',
          }}
        >
          <div>
            <label style={labelStyle}>Day of the Week</label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              style={inputStyle}
            >
              {days.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>End Time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'end' }}>
            <button onClick={resetFilters} className="secondary-btn">
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Comfortableness Score Formula</h3>
        <p style={{ color: '#475569', lineHeight: '1.7' }}>
          Comfort Score = 25% Noise + 25% Occupancy + 15% Temperature + 15%
          Light + 10% Air Quality + 10% WiFi
        </p>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Comfortableness in Each Zone</h3>
        <p style={{ color: '#475569' }}>
          Showing comfort score based on the selected day and time range.
        </p>

        {zoneComfortData.length > 0 ? (
          <div className="chart-box" style={{ marginTop: '20px' }}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={zoneComfortData}
                layout="vertical"
                margin={{ top: 20, right: 40, left: 30, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis dataKey="zone" type="category" width={90} />
                <Tooltip
                  formatter={(value) => [`${value}/100`, 'Comfort Score']}
                />
                <Legend />
                <Bar
                  dataKey="comfortScore"
                  name="Comfortableness Score"
                  fill="#22c55e"
                  radius={[0, 10, 10, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p style={{ marginTop: '16px', color: '#ef4444' }}>
            No data available for the selected filters.
          </p>
        )}
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Best Zone Recommendation</h3>

        {bestZone ? (
          <p style={{ color: '#475569', lineHeight: '1.8' }}>
            Based on the selected filters, <strong>{bestZone.zone}</strong> is
            the best study zone with a comfort score of{' '}
            <strong>{bestZone.comfortScore}/100</strong>.
          </p>
        ) : (
          <p>No recommendation available.</p>
        )}
      </div>

      <div className="card">
        <h3>Zone Summary</h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={tableHeaderStyle}>Zone</th>
                <th style={tableHeaderStyle}>Comfort Score</th>
                <th style={tableHeaderStyle}>Noise</th>
                <th style={tableHeaderStyle}>Occupancy</th>
                <th style={tableHeaderStyle}>Temperature</th>
                <th style={tableHeaderStyle}>Light</th>
                <th style={tableHeaderStyle}>WiFi</th>
              </tr>
            </thead>

            <tbody>
              {zoneComfortData.map((zone) => (
                <tr key={zone.zone}>
                  <td style={tableCellStyle}>{zone.zone}</td>
                  <td style={tableCellStyle}>{zone.comfortScore}/100</td>
                  <td style={tableCellStyle}>{zone.avgNoise} dB</td>
                  <td style={tableCellStyle}>{zone.avgOccupancy}</td>
                  <td style={tableCellStyle}>{zone.avgTemperature} °C</td>
                  <td style={tableCellStyle}>{zone.avgLight} lux</td>
                  <td style={tableCellStyle}>{zone.avgWifi} Mbps</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: 'block',
  marginBottom: '6px',
  fontWeight: '600',
  color: '#334155',
};

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid #cbd5e1',
  outline: 'none',
};

const tableHeaderStyle = {
  padding: '12px',
  textAlign: 'left',
  borderBottom: '1px solid #e2e8f0',
  color: '#334155',
};

const tableCellStyle = {
  padding: '12px',
  borderBottom: '1px solid #e2e8f0',
  color: '#475569',
};