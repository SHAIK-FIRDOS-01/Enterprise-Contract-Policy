import React from 'react';
import { Zap, Cpu } from 'lucide-react';

export default function ModeToggle({
  mode = 'DUAL_SYSTEM',
  onChange,
  disabled = false,
}) {
  const isDual = mode === 'DUAL_SYSTEM';
  const isFrontier = mode === 'FRONTIER_ONLY';

  const handleSelectDual = () => {
    if (disabled || isDual) return;
    if (onChange) {
      onChange('DUAL_SYSTEM', false);
    }
  };

  const handleSelectFrontier = () => {
    if (disabled || isFrontier) return;
    if (onChange) {
      onChange('FRONTIER_ONLY', true);
    }
  };

  return (
    <div className="flex items-center gap-1 bg-zinc-950 p-0.5 rounded border border-zinc-800 text-[11px] font-mono select-none">
      <button
        type="button"
        data-testid="mode-toggle-dual"
        aria-pressed={isDual ? 'true' : 'false'}
        disabled={disabled}
        onClick={handleSelectDual}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all duration-150 cursor-pointer ${
          isDual
            ? 'bg-zinc-800 text-emerald-400 font-semibold shadow-sm border border-emerald-500/30'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title="Automated compliance intelligence: fast-path clause retrieval with deep synthesis escalation."
      >
        <Zap className={`w-3 h-3 ${isDual ? 'text-emerald-400 fill-emerald-400/20' : 'text-zinc-500'}`} />
        <span>DUAL-SYSTEM (AUTONOMOUS)</span>
      </button>

      <button
        type="button"
        data-testid="mode-toggle-frontier"
        aria-pressed={isFrontier ? 'true' : 'false'}
        disabled={disabled}
        onClick={handleSelectFrontier}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded transition-all duration-150 cursor-pointer ${
          isFrontier
            ? 'bg-zinc-800 text-amber-400 font-semibold shadow-sm border border-amber-500/30'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-transparent'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title="Comprehensive frontier mode: routes all queries through deep multi-document analysis."
      >
        <Cpu className={`w-3 h-3 ${isFrontier ? 'text-amber-400' : 'text-zinc-500'}`} />
        <span>FRONTIER-ONLY (BENCHMARK)</span>
      </button>
    </div>
  );
}
