import React from 'react';
import { NavLink } from 'react-router-dom';
import { FileText, ShieldCheck, Activity, Layers } from 'lucide-react';

const NAV_ITEMS = [
  {
    to: '/contracts',
    label: 'Contracts & Policies',
    badge: 'INGEST',
    icon: FileText,
  },
  {
    to: '/workspace',
    label: 'Audit Workspace',
    badge: 'COPILOT',
    icon: ShieldCheck,
  },
  {
    to: '/telemetry',
    label: 'Operational Telemetry',
    badge: 'AUDIT',
    icon: Activity,
  },
];

export const SidebarNav = () => {
  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-900/60 flex flex-col justify-between select-none">
      <div className="p-3 space-y-1">
        <div className="px-3 py-2 text-[10px] font-mono font-medium tracking-wider text-zinc-500 uppercase">
          Navigation Modules
        </div>

        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center justify-between px-3 py-2 rounded text-xs transition-colors font-medium ${
                  isActive
                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700/60 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-850'
                }`
              }
            >
              <div className="flex items-center space-x-2.5">
                <Icon className="w-4 h-4 text-zinc-400" />
                <span>{item.label}</span>
              </div>
              <span className="text-[9px] font-mono px-1 rounded bg-zinc-950/80 text-zinc-400 border border-zinc-800">
                {item.badge}
              </span>
            </NavLink>
          );
        })}
      </div>

      {/* System Hardware / Runtime Specs */}
      <div className="p-3 border-t border-zinc-800/80">
        <div className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800/80 space-y-1 text-[11px] font-mono">
          <div className="flex items-center justify-between text-zinc-500">
            <span className="flex items-center space-x-1">
              <Layers className="w-3 h-3" />
              <span>STACK</span>
            </span>
            <span className="text-zinc-300">DUAL-RAG</span>
          </div>
          <div className="flex items-center justify-between text-zinc-500">
            <span>ENGINE</span>
            <span className="text-emerald-400">HYBRID RRF</span>
          </div>
          <div className="flex items-center justify-between text-zinc-500">
            <span>VERSION</span>
            <span className="text-zinc-300">v0.1.0-STABLE</span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default SidebarNav;
