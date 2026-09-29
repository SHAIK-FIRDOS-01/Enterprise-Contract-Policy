import React from 'react';
import { ShieldCheck, ShieldAlert, AlertTriangle, ExternalLink } from 'lucide-react';

export default function CitationInspector({
  citations = [],
  activeCitationIndex = null,
  onSelectCitation,
}) {
  if (!citations.length) {
    return (
      <div className="p-4 text-center text-xs font-mono text-zinc-500">
        No citations generated for this query.
      </div>
    );
  }

  return (
    <div className="space-y-2.5 p-3 font-sans">
      <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
        <span className="font-semibold text-zinc-300 uppercase tracking-wider">
          GROUND-TRUTH CITATIONS ({citations.length})
        </span>
        <span className="text-[10px] text-zinc-500">LEXICAL + EMBEDDING AUDIT</span>
      </div>

      <div className="space-y-2 overflow-y-auto max-h-[300px] pr-1">
        {citations.map((c) => {
          const isActive = Number(activeCitationIndex) === Number(c.citation_index);
          const isRejected = c.status === 'REJECTED' || (c.confidence !== null && c.confidence < 0.5);
          const isCaution = !isRejected && (c.status === 'LOW' || (c.confidence !== null && c.confidence < 0.75));

          let borderClass = 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/60';
          let statusBadge = (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold font-mono">
              <ShieldCheck className="w-3 h-3" /> VERIFIED
            </span>
          );

          if (isActive) {
            borderClass = 'border-emerald-500/60 bg-emerald-950/20 ring-1 ring-emerald-500/40';
          } else if (isRejected) {
            borderClass = 'border-rose-900/60 bg-rose-950/10 hover:border-rose-700';
            statusBadge = (
              <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-semibold font-mono">
                <ShieldAlert className="w-3 h-3" /> REJECTED
              </span>
            );
          } else if (isCaution) {
            borderClass = 'border-amber-900/60 bg-amber-950/10 hover:border-amber-700';
            statusBadge = (
              <span className="inline-flex items-center gap-1 text-[10px] text-amber-400 font-semibold font-mono">
                <AlertTriangle className="w-3 h-3" /> LOW CONFIDENCE
              </span>
            );
          }

          return (
            <div
              key={c.citation_index}
              onClick={() => onSelectCitation && onSelectCitation(c)}
              className={`p-2.5 rounded border transition-all cursor-pointer ${borderClass}`}
            >
              <div className="flex items-center justify-between mb-1.5 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-200 font-bold text-[11px]">
                    Ref: {c.citation_index}
                  </span>
                  <span className="text-[10px] text-zinc-400">
                    Page {c.page_number}
                  </span>
                </div>
                {statusBadge}
              </div>

              {c.extracted_claim && (
                <p className="text-[11px] text-zinc-300 line-clamp-2 leading-relaxed mb-2 font-sans italic">
                  "{c.extracted_claim}"
                </p>
              )}

              <div className="flex items-center justify-between pt-1.5 border-t border-zinc-800/80 text-[10px] font-mono text-zinc-500">
                <div className="flex items-center gap-2">
                  <span>CONF: <strong className="text-zinc-300">{Math.round((c.confidence || 0) * 100)}%</strong></span>
                  {c.lexical_overlap !== undefined && (
                    <span>LEX: <strong className="text-zinc-400">{Math.round(c.lexical_overlap * 100)}%</strong></span>
                  )}
                </div>

                <span className="flex items-center gap-1 text-emerald-400 hover:underline">
                  <span>Jump</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
