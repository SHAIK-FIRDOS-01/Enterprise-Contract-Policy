import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import TopNav from './TopNav';
import SidebarNav from './SidebarNav';
import { Terminal } from 'lucide-react';

export const ProtectedLayout = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-zinc-950 flex flex-col items-center justify-center space-y-3 select-none">
        <div className="flex items-center space-x-2 text-zinc-400">
          <Terminal className="w-5 h-5 text-emerald-500 animate-pulse" />
          <span className="font-mono text-sm tracking-wider text-zinc-200">
            SYSTEM BOOTING // VERIFYING SESSION...
          </span>
        </div>
        <div className="w-48 h-1 bg-zinc-900 rounded overflow-hidden">
          <div className="h-full bg-emerald-500/80 animate-[indeterminate_1.5s_infinite_linear]" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 font-sans overflow-hidden">
      <TopNav />
      <div className="flex flex-1 overflow-hidden">
        <SidebarNav />
        <main className="flex-1 overflow-y-auto bg-zinc-950 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default ProtectedLayout;
