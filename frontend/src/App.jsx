import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedLayout from './components/layout/ProtectedLayout';
import LoginPage from './pages/auth/LoginPage';
import RegisterPage from './pages/auth/RegisterPage';
import ContractsPage from './pages/contracts/ContractsPage';
import WorkspacePage from './pages/workspace/WorkspacePage';
import TelemetryPage from './pages/telemetry/TelemetryPage';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected Enterprise Workstation Routes */}
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Navigate to="/contracts" replace />} />
            <Route path="/contracts" element={<ContractsPage />} />
            <Route path="/workspace" element={<WorkspacePage />} />
            <Route path="/telemetry" element={<TelemetryPage />} />
          </Route>

          {/* Fallback Route */}
          <Route path="*" element={<Navigate to="/contracts" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
