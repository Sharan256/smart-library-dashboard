import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
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

export default function ZonePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [allRows, setAllRows] = useState([]);
  const [zoneData, setZoneData] = useState([]);
  const [selectedDay, setSelectedDay] = useState('All');
  const [selectedTime, setSelectedTime] = useState('All');
  const [selectedZone, setSelectedZone] = useState('All');
  const [availableDays, setAvailableDays] = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [availableZones, setAvailableZones] = useState([]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const loadCsvData = async () => {
      try {
        const response = await fetch('/data/library_data.csv');
        const csvText = await response.text();

        const rows = csvText.trim().split('\n');
        const headers = rows[0].split(',');

        const parsedRows = [];
        const daysSet = new Set();
        const timesSet = new Set();
        const zonesSet = new Set();

        rows.slice(1).forEach((row) => {
          const values = row.split(',');
          const rowObject = {};

          headers.forEach((header, index) => {
            rowObject[header.trim()] = values[index]?.trim();
          });

          // Extract time hour (e.g. "09:00" from "2026-04-06 09:05")
          const timestamp = rowObject.Timestamp;
          if (timestamp && timestamp.includes(' ')) {
            const timePart = timestamp.split(' ')[1];
            const hourPart = timePart.split(':')[0] + ':00';
            rowObject.Hour = hourPart;
            timesSet.add(hourPart);
          }

          if (rowObject.Day_of_the_week) {
            daysSet.add(rowObject.Day_of_the_week.trim());
          }
          if (rowObject.Zone_ID) {
            zonesSet.add(rowObject.Zone_ID.trim());
          }

          parsedRows.push(rowObject);
        });

        setAvailableDays(Array.from(daysSet));
        setAvailableTimes(Array.from(timesSet).sort());
        setAvailableZones(Array.from(zonesSet).sort());
        setAllRows(parsedRows);
      } catch (error) {
        console.error('Error loading CSV data:', error);
      }
    };

    loadCsvData();
  }, []);

  useEffect(() => {
    if (allRows.length === 0) return;

    const zoneStats = {};

    allRows.forEach((rowObject) => {
      // Filter logic
      if (selectedDay !== 'All' && rowObject.Day_of_the_week?.trim() !== selectedDay) {
        return;
      }
      if (selectedTime !== 'All' && rowObject.Hour !== selectedTime) {
        return;
      }
      if (selectedZone !== 'All' && rowObject.Zone_ID?.trim() !== selectedZone) {
        return;
      }

      const zoneId = rowObject.Zone_ID;
      const occupancy = Number(rowObject.Occupancy_Count);
      const noise = Number(rowObject.Noise_Level);
      const wifi = Number(rowObject.WiFi_Speed);
      const temperature = Number(rowObject.Temperature);
      const humidity = Number(rowObject.Humidity);
      const airQuality = Number(rowObject.Air_Quality);

      if (zoneId) {
        if (!zoneStats[zoneId]) {
          zoneStats[zoneId] = {
            count: 0,
            totalOccupancy: 0,
            totalNoise: 0,
            totalWifi: 0,
            totalTemperature: 0,
            totalHumidity: 0,
            totalAirQuality: 0,
          };
        }

        if (!Number.isNaN(occupancy) && !Number.isNaN(noise) && !Number.isNaN(wifi)) {
          zoneStats[zoneId].count += 1;
          zoneStats[zoneId].totalOccupancy += occupancy;
          zoneStats[zoneId].totalNoise += noise;
          zoneStats[zoneId].totalWifi += wifi;
          zoneStats[zoneId].totalTemperature += (Number.isNaN(temperature) ? 0 : temperature);
          zoneStats[zoneId].totalHumidity += (Number.isNaN(humidity) ? 0 : humidity);
          zoneStats[zoneId].totalAirQuality += (Number.isNaN(airQuality) ? 0 : airQuality);
        }
      }
    });

    const formattedZoneData = Object.keys(zoneStats).map((zone) => {
      const stats = zoneStats[zone];
      return {
        Zone_ID: zone,
        Average_Occupancy: stats.count > 0 ? (stats.totalOccupancy / stats.count).toFixed(2) : 0,
        Average_Noise: stats.count > 0 ? (stats.totalNoise / stats.count).toFixed(2) : 0,
        Average_Wifi_Speed: stats.count > 0 ? (stats.totalWifi / stats.count).toFixed(2) : 0,
        Average_Temperature: stats.count > 0 ? (stats.totalTemperature / stats.count).toFixed(2) : 0,
        Average_Humidity: stats.count > 0 ? (stats.totalHumidity / stats.count).toFixed(2) : 0,
        Average_Air_Quality: stats.count > 0 ? (stats.totalAirQuality / stats.count).toFixed(2) : 0,
      };
    });

    formattedZoneData.sort((a, b) => a.Zone_ID.localeCompare(b.Zone_ID));
    setZoneData(formattedZoneData);
  }, [allRows, selectedDay, selectedTime, selectedZone]);

  return (
    <div className="content-area">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="page-eyebrow">Student Dashboard</span>
          <h1>Library Zones Comparison</h1>
          <p>Compare conditions across different study zones.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/student" className="secondary-btn">
            Back to Overview
          </Link>
          <button onClick={handleLogout} className="danger-btn">
            Logout
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px', display: 'flex', gap: '20px', alignItems: 'center' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.9em', color: '#64748b', marginBottom: '5px' }}>Day of the Week</label>
          <select 
            value={selectedDay} 
            onChange={(e) => setSelectedDay(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1em', minWidth: '150px' }}
          >
            <option value="All">All Days</option>
            {availableDays.map(day => <option key={day} value={day}>{day}</option>)}
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', fontSize: '0.9em', color: '#64748b', marginBottom: '5px' }}>Time (Hour)</label>
          <select 
            value={selectedTime} 
            onChange={(e) => setSelectedTime(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1em', minWidth: '150px' }}
          >
            <option value="All">All Times</option>
            {availableTimes.map(time => <option key={time} value={time}>{time}</option>)}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.9em', color: '#64748b', marginBottom: '5px' }}>Zone</label>
          <select 
            value={selectedZone} 
            onChange={(e) => setSelectedZone(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '1em', minWidth: '150px', textTransform: 'capitalize' }}
          >
            <option value="All">All Zones</option>
            {availableZones.map(zone => <option key={zone} value={zone}>{zone.replace('zone', 'Zone ')}</option>)}
          </select>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Average Occupancy by Zone</h3>
        <p style={{ color: '#475569' }}>
          Compare the average number of people in each zone to find the least crowded area.
        </p>

        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={zoneData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="Zone_ID" />
              <YAxis
                label={{
                  value: 'Average Occupancy (people)',
                  angle: -90,
                  position: 'insideLeft',
                }}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="Average_Occupancy" name="Avg Occupancy (people)" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Noise Level Heatmap</h3>
        <p style={{ color: '#475569' }}>
          Overall average noise levels (in dB) across different zones. Greener is quieter, redder is louder.
        </p>

        <div style={{ marginTop: '20px', display: 'flex', gap: '10px', overflowX: 'auto' }}>
          {(() => {
            const noiseVals = zoneData.map(z => Number(z.Average_Noise)).filter(v => !isNaN(v) && v > 0);
            const minNoise = Math.min(...noiseVals);
            const maxNoise = Math.max(...noiseVals);
            const range = maxNoise - minNoise || 1;

            return zoneData.map((zone) => {
              const val = Number(zone.Average_Noise);
              let backgroundColor = '#f1f5f9';
              let color = '#333';
              if (val) {
                const ratio = (val - minNoise) / range;
                const hue = (1 - ratio) * 120;
                backgroundColor = `hsl(${hue}, 70%, 60%)`;
                color = ratio > 0.6 ? 'white' : 'black';
              }

              return (
                <div key={zone.Zone_ID} style={{ flex: 1, minWidth: '100px', padding: '20px', textAlign: 'center', backgroundColor, color, borderRadius: '8px', fontWeight: 'bold' }}>
                  <div style={{ fontSize: '1.2em', marginBottom: '8px', textTransform: 'capitalize' }}>{zone.Zone_ID.replace('zone', 'Zone ')}</div>
                  <div style={{ fontSize: '1.5em' }}>{val ? val : '-'} dB</div>
                </div>
              );
            });
          })()}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Average WiFi Speed by Zone</h3>
        <p style={{ color: '#475569' }}>
          Compare the average WiFi speed (in Mbps) across different zones to find the best connectivity.
        </p>

        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={zoneData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="Zone_ID" />
              <YAxis
                domain={[0, 200]}
                label={{
                  value: 'Average WiFi Speed (Mbps)',
                  angle: -90,
                  position: 'insideLeft',
                }}
              />
              <Tooltip />
              <Legend />
              <Bar dataKey="Average_Wifi_Speed" name="Avg WiFi Speed" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Environmental Conditions by Zone</h3>
        <p style={{ color: '#475569' }}>
          Compare the average Temperature (°C), Humidity (%), and Air Quality Index across different zones. 
          Air Quality is shown on the right axis.
        </p>

        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={zoneData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="Zone_ID" />
              <YAxis yAxisId="left" orientation="left" stroke="#475569" />
              <YAxis yAxisId="right" orientation="right" stroke="#10b981" />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="Average_Temperature" name="Avg Temperature (°C)" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={60} />
              <Bar yAxisId="left" dataKey="Average_Humidity" name="Avg Humidity (%)" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} />
              <Bar yAxisId="right" dataKey="Average_Air_Quality" name="Avg Air Quality" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={60} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
