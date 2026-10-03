import React from 'react';
import { History, MessageSquare } from 'lucide-react';

export default function AuditAuditTrail({
  history = [],
  currentIndex = -1,
  onSelectHistory,
}) {
  if (!history.length) {
    return null;
  }

  return (
    <div className="border-t border-zinc-800 bg-zinc-950/80 p-3 font-sans">
      <div className="max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-1.5 pb-2 text-[10px] font-mono text-zinc-500 uppercase tracking-wider">
          <History className="w-3 h-3 text-zinc-400" />
          <span>SESSION QUERY AUDIT TRAIL ({history.length})</span>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {history.map((item, idx) => {
            const isSelected = idx === currentIndex;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSelectHistory && onSelectHistory(idx)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono whitespace-nowrap transition-colors flex-shrink-0 ${
                  isSelected
                    ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300'
                    : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                }`}
              >
                <MessageSquare className="w-3 h-3 flex-shrink-0" />
                <span className="truncate max-w-[180px]">{item.query}</span>
                <span className="text-[9px] text-zinc-500 font-sans">
                  ({item.citations?.length || 0} citations)
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
