import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Terminal, Database, LogOut, Shield } from 'lucide-react';

export const TopNav = () => {
  const { user, logout } = useAuth();

  return (
    <header className="h-12 border-b border-zinc-800 bg-zinc-900 px-4 flex items-center justify-between select-none">
      {/* Brand & Systems Status */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-mono text-xs font-semibold tracking-wider text-zinc-100">
            COPILOT <span className="text-zinc-500">{'//'}</span> CONTRACT INTELLIGENCE
          </span>
        </div>

        <div className="h-4 w-px bg-zinc-800" />

        <div className="flex items-center space-x-3 text-[11px] font-mono">
          <span className="flex items-center space-x-1.5 text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>CORE: ACTIVE</span>
          </span>
          <span className="flex items-center space-x-1.5 text-zinc-400">
            <Database className="w-3 h-3 text-zinc-500" />
            <span>PGVECTOR: 384-DIM HNSW</span>
          </span>
        </div>
      </div>

      {/* Telemetry Ticker & User Badge */}
      <div className="flex items-center space-x-4">
        <div className="hidden md:flex items-center space-x-3 text-[11px] font-mono text-zinc-400 tabular-nums">
          <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
            RRF: <span className="text-zinc-200">K=60</span>
          </span>
          <span className="px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800">
            GROQ: <span className="text-emerald-400">LLAMA-3.3-70B</span>
          </span>
        </div>

        <div className="h-4 w-px bg-zinc-800" />

        {user && (
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 text-xs">
              <Shield className="w-3.5 h-3.5 text-zinc-400" />
              <span className="font-mono text-zinc-300">{user.email}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
                {user.role || 'AUDITOR'}
              </span>
            </div>

            <button
              onClick={logout}
              title="Terminate session"
              className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default TopNav;
