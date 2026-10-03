import React from 'react';
import { NavLink } from 'react-router-dom';
import { FileText, ShieldCheck, Activity } from 'lucide-react';

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
    <>
      {/* Desktop Fixed Left Sidebar */}
      <aside className="hidden md:flex md:w-56 lg:w-64 border-r border-zinc-800 bg-zinc-900/60 flex-col justify-between select-none flex-shrink-0">
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
      </aside>

      {/* Mobile Sleek Bottom Dock (< 768px) */}
      <nav className="flex md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md items-center justify-around h-14 px-3 select-none">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-1 px-3 text-[10px] font-mono transition-colors ${
                  isActive
                    ? 'text-emerald-400 font-semibold'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`
              }
            >
              <Icon className="w-4 h-4 mb-0.5" />
              <span className="tracking-wider">{item.badge}</span>
            </NavLink>
          );
        })}
      </nav>
    </>
  );
};

export default SidebarNav;
