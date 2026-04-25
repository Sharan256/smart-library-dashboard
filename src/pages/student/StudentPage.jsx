import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { loadLibraryData } from '../../utils/libraryData';
import {
  ResponsiveContainer,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  Scatter,
} from 'recharts';

export default function StudentPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [occupancyNoiseData, setOccupancyNoiseData] = useState([]);
  const [lightPowerData, setLightPowerData] = useState([]);
  const [devicePowerData, setDevicePowerData] = useState([]);
  const MAX_CHART_POINTS = 1800;

  const sampleEvenly = (data, maxPoints = MAX_CHART_POINTS) => {
    if (!data || data.length <= maxPoints) return data || [];
    const step = data.length / maxPoints;
    const sampled = [];
    for (let index = 0; index < maxPoints; index += 1) {
      sampled.push(data[Math.floor(index * step)]);
    }
    return sampled;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  useEffect(() => {
    const loadCsvData = async () => {
      try {
        const parsedRows = await loadLibraryData();

        const validOccupancyNoise = parsedRows.filter(
          (item) =>
            item.Occupancy_Count !== null &&
            item.Noise_Level !== null
        );

        const validLightPower = parsedRows.filter(
          (item) =>
            item.Light_Level !== null &&
            item.Total_Power_Consumption !== null
        );

        const validDevicePower = parsedRows.filter(
          (item) =>
            item.Device_Usage_Count !== null &&
            item.Total_Power_Consumption !== null
        );

        setOccupancyNoiseData(validOccupancyNoise);
        setLightPowerData(validLightPower);
        setDevicePowerData(validDevicePower);
      } catch (error) {
        console.error('Error loading CSV data:', error);
      }
    };

    loadCsvData();
  }, []);

  const computeCorrelation = (data, xKey, yKey) => {
    if (!data || data.length === 0) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
    const n = data.length;

    data.forEach((item) => {
      const x = item[xKey];
      const y = item[yKey];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
      sumYY += y * y;
    });

    const denominator = Math.sqrt(
      (n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY)
    );
    if (denominator === 0) return 0;
    return Number(((n * sumXY - sumX * sumY) / denominator).toFixed(2));
  };

  const formatCorrelationDescription = (value) => {
    if (value === null) return 'Calculating...';
    if (value === 0) return 'No linear correlation detected.';
    const strength = Math.abs(value) >= 0.75 ? 'strong' : Math.abs(value) >= 0.5 ? 'moderate' : 'weak';
    const direction = value > 0 ? 'positive' : 'negative';
    return `${strength} ${direction} correlation`;
  };

  const occupancyNoiseCorrelation = useMemo(
    () => computeCorrelation(occupancyNoiseData, 'Occupancy_Count', 'Noise_Level'),
    [occupancyNoiseData]
  );

  const lightPowerCorrelation = useMemo(
    () => computeCorrelation(lightPowerData, 'Light_Level', 'Total_Power_Consumption'),
    [lightPowerData]
  );

  const devicePowerCorrelation = useMemo(
    () => computeCorrelation(devicePowerData, 'Device_Usage_Count', 'Total_Power_Consumption'),
    [devicePowerData]
  );

  const occupancyNoiseWithTrend = useMemo(() => {
    if (occupancyNoiseData.length === 0) return [];

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const n = occupancyNoiseData.length;

    occupancyNoiseData.forEach((item) => {
      const x = item.Occupancy_Count;
      const y = item.Noise_Level;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const sorted = [...occupancyNoiseData].sort(
      (a, b) => a.Occupancy_Count - b.Occupancy_Count
    );

    return sorted.map((item) => ({
      ...item,
      Trend_Line: slope * item.Occupancy_Count + intercept,
    }));
  }, [occupancyNoiseData]);

  const lightPowerWithTrend = useMemo(() => {
    if (lightPowerData.length === 0) return [];

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const n = lightPowerData.length;

    lightPowerData.forEach((item) => {
      const x = item.Light_Level;
      const y = item.Total_Power_Consumption;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const sorted = [...lightPowerData].sort((a, b) => a.Light_Level - b.Light_Level);

    return sorted.map((item) => ({
      ...item,
      Trend_Line: slope * item.Light_Level + intercept,
    }));
  }, [lightPowerData]);

  const devicePowerWithTrend = useMemo(() => {
    if (devicePowerData.length === 0) return [];

    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const n = devicePowerData.length;

    devicePowerData.forEach((item) => {
      const x = item.Device_Usage_Count;
      const y = item.Total_Power_Consumption;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    });

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    const sorted = [...devicePowerData].sort(
      (a, b) => a.Device_Usage_Count - b.Device_Usage_Count
    );

    return sorted.map((item) => ({
      ...item,
      Trend_Line: slope * item.Device_Usage_Count + intercept,
    }));
  }, [devicePowerData]);

  const occupancyNoiseChartData = useMemo(
    () => sampleEvenly(occupancyNoiseWithTrend),
    [occupancyNoiseWithTrend]
  );

  const lightPowerChartData = useMemo(
    () => sampleEvenly(lightPowerWithTrend),
    [lightPowerWithTrend]
  );

  const devicePowerChartData = useMemo(
    () => sampleEvenly(devicePowerWithTrend),
    [devicePowerWithTrend]
  );

  return (
    <div className="content-area">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span className="page-eyebrow">Student Dashboard</span>
          <h1>Welcome, {user?.name}!</h1>
          <p>You are logged in as a student.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link to="/student/zones" className="secondary-btn">
            View Zones
          </Link>
          <Link to="/student/insights" className="secondary-btn">
            Student Insights
          </Link>
          <button onClick={handleLogout} className="danger-btn">
            Logout
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Occupancy Count vs Noise Level</h3>
        <p style={{ color: '#475569' }}>
          Shows how noise level changes as occupancy increases.
        </p>
        <div style={{ color: '#475569', marginTop: '10px' }}>
          <strong>Correlation:</strong>{' '}
          {occupancyNoiseCorrelation !== null
            ? `${occupancyNoiseCorrelation} (${formatCorrelationDescription(occupancyNoiseCorrelation)})`
            : 'calculating...'}
        </div>

        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={occupancyNoiseChartData} margin={{ top: 20, right: 30, left: 100, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="Occupancy_Count"
                type="number"
                domain={['auto', 'auto']}
                label={{
                  value: 'Occupancy Count (people)',
                  position: 'insideBottom',
                  offset: -10,
                }}
              />
              <YAxis
                width={100}
                domain={[0, 100]}
                label={{
                  value: 'Noise Level (dB)',
                  angle: -90,
                  position: 'left',
                  offset: 10,
                }}
              />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend verticalAlign="top" height={36} />
              <Scatter
                name="Actual Noise (dB)"
                dataKey="Noise_Level"
                fill="#f97316"
              />
              <Line
                type="monotone"
                dataKey="Trend_Line"
                name="Trend Line (dB)"
                stroke="red"
                strokeWidth={4}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Light Level vs Total Power Consumption</h3>
        <p style={{ color: '#475569' }}>
          Shows the relationship between lighting intensity and energy usage.
        </p>
        <div style={{ color: '#475569', marginTop: '10px' }}>
          <strong>Correlation:</strong>{' '}
          {lightPowerCorrelation !== null
            ? `${lightPowerCorrelation} (${formatCorrelationDescription(lightPowerCorrelation)})`
            : 'calculating...'}
        </div>

        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={lightPowerChartData} margin={{ top: 20, right: 30, left: 100, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="Light_Level"
                type="number"
                domain={['auto', 'auto']}
                label={{
                  value: 'Light Level (lux)',
                  position: 'insideBottom',
                  offset: -5,
                }}
              />
              <YAxis
                width={100}
                dataKey="Total_Power_Consumption"
                domain={[0, 4000]}
                label={{
                  value: 'Power Consumption (W)',
                  angle: -90,
                  position: 'left',
                  offset: 10,
                }}
              />
              <Tooltip />
              <Legend />
              <Scatter
                name="Total Power Consumption (W)"
                dataKey="Total_Power_Consumption"
                fill="#6366f1"
                r={4}
              />
              <Line
                type="monotone"
                dataKey="Trend_Line"
                name="Trend Line (W)"
                stroke="#ef4444"
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '20px' }}>
        <h3>Device Usage vs Total Power Consumption</h3>
        <p style={{ color: '#475569' }}>
          Shows the relationship between connected devices and power consumption with a trend line.
        </p>
        <div style={{ color: '#475569', marginTop: '10px' }}>
          <strong>Correlation:</strong>{' '}
          {devicePowerCorrelation !== null
            ? `${devicePowerCorrelation} (${formatCorrelationDescription(devicePowerCorrelation)})`
            : 'calculating...'}
        </div>

        <div className="chart-box" style={{ marginTop: '20px' }}>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart data={devicePowerChartData} margin={{ top: 20, right: 30, left: 100, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="Device_Usage_Count"
                type="number"
                domain={['auto', 'auto']}
                label={{
                  value: 'Device Usage Count (devices)',
                  position: 'insideBottom',
                  offset: -5,
                }}
              />
              <YAxis
                width={100}
                domain={[0, 4000]}
                label={{
                  value: 'Power Consumption (W)',
                  angle: -90,
                  position: 'left',
                  offset: 10,
                }}
              />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Legend />
              <Scatter
                name="Actual Data (W)"
                dataKey="Total_Power_Consumption"
                fill="#3b82f6"
              />
              <Line
                type="monotone"
                dataKey="Trend_Line"
                name="Trend Line (W)"
                stroke="red"
                strokeWidth={2}
                dot={false}
                activeDot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'center' }}>
        <button onClick={handleLogout} className="danger-btn">Logout</button>
      </div>
    </div>
  );
}