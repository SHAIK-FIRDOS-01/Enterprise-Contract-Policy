import React from 'react';

export default function MetricStatCard({
  label,
  value,
  subtext,
  indicatorColor = 'emerald',
  icon: Icon,
}) {
  const getIndicatorColor = () => {
    switch (indicatorColor) {
      case 'emerald':
        return 'bg-emerald-400 text-emerald-400';
      case 'amber':
        return 'bg-amber-400 text-amber-400';
      case 'rose':
        return 'bg-rose-400 text-rose-400';
      case 'cyan':
        return 'bg-cyan-400 text-cyan-400';
      default:
        return 'bg-zinc-400 text-zinc-400';
    }
  };

  const indicatorClasses = getIndicatorColor();

  return (
    <div className="p-4 rounded border border-zinc-800 bg-zinc-900/50 flex flex-col justify-between select-none font-sans">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">
          {label}
        </span>
        <div className="flex items-center gap-1.5">
          {Icon ? (
            <Icon className="w-3.5 h-3.5 text-zinc-500" />
          ) : (
            <span className={`w-1.5 h-1.5 rounded-full ${indicatorClasses.split(' ')[0]}`} />
          )}
        </div>
      </div>

      <div className="text-2xl font-mono font-bold text-zinc-100 tabular-nums">
        {value}
      </div>

      {subtext && (
        <div className="text-[11px] font-mono text-zinc-500 mt-1 truncate">
          {subtext}
        </div>
      )}
    </div>
  );
}
