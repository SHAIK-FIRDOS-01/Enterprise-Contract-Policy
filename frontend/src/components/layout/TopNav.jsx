import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Terminal, LogOut, Shield } from 'lucide-react';

export const TopNav = () => {
  const { user, logout } = useAuth();

  return (
    <header className="h-12 border-b border-zinc-800 bg-zinc-900 px-3 sm:px-4 flex items-center justify-between select-none">
      {/* Brand & Systems Status */}
      <div className="flex items-center space-x-2 sm:space-x-4 min-w-0">
        <div className="flex items-center space-x-2 flex-shrink-0">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="font-mono text-xs font-semibold tracking-wider text-zinc-100">
            COPILOT <span className="hidden sm:inline text-zinc-500">{'//'}</span>{' '}
            <span className="hidden sm:inline">CONTRACT INTELLIGENCE</span>
          </span>
        </div>

        <div className="hidden sm:block h-4 w-px bg-zinc-800" />

        <div className="flex items-center space-x-2 text-[10px] sm:text-[11px] font-mono">
          <span className="flex items-center space-x-1.5 text-zinc-400 flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden xs:inline">SYSTEM: </span><span>ONLINE</span>
          </span>
        </div>
      </div>

      {/* User Badge & Controls */}
      <div className="flex items-center space-x-2 sm:space-x-4 flex-shrink-0">

        {user && (
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="flex items-center space-x-1.5 sm:space-x-2 text-xs">
              <Shield className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
              <span className="font-mono text-zinc-300 max-w-[90px] sm:max-w-xs truncate">
                {user.email}
              </span>
              <span className="hidden sm:inline-block px-1.5 py-0.5 rounded text-[10px] font-mono tracking-wider bg-zinc-800 text-zinc-300 border border-zinc-700">
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
