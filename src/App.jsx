import { Route, Routes, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import StudentPage from './pages/student/StudentPage';
import ZonePage from './pages/student/ZonePage';
import StudentInsightsPage from './pages/student/StudentInsightsPage';
import AssistantPage from './pages/assistant/AssistantPage';
import AssistantInsightsPage from './pages/assistant/AssistantInsightsPage';
import ProtectedRoute from './components/ProtectedRoute';
import Chatbot from './components/Chatbot';
import OccupancyDashboard from './pages/student/OccupancyDashboard';
import EnvironmentPage from './pages/student/EnvironmentPage';


export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/student"
          element={
            <ProtectedRoute requiredRole="student">
              <StudentPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/zones"
          element={
            <ProtectedRoute requiredRole="student">
              <ZonePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/student/insights"
          element={
            <ProtectedRoute requiredRole="student">
              <StudentInsightsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assistant"
          element={
            <ProtectedRoute requiredRole="assistant">
              <AssistantPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/assistant/insights"
          element={
            <ProtectedRoute requiredRole="assistant">
              <AssistantInsightsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/student/occupancy"
          element={
            <ProtectedRoute requiredRole="student">
              <OccupancyDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/student/environment"
          element={
            <ProtectedRoute requiredRole="student">
              <EnvironmentPage />
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
      <Chatbot />
    </>
  );
}
