import React from 'react';
import { Cpu, Clock, DollarSign, Activity } from 'lucide-react';
import CitationBadge from './CitationBadge';

export default function SynthesisView({
  text = '',
  isStreaming = false,
  citations = [],
  activeCitationIndex = null,
  onSelectCitation,
  telemetry = null,
}) {
  // Parse text and replace [Ref: N] or [Ref:N] with interactive CitationBadge components
  const renderFormattedContent = () => {
    if (!text) {
      return (
        <span className="text-zinc-600 font-mono italic text-xs">
          Awaiting query submission...
        </span>
      );
    }

    // Regex matching [Ref: N] or [Ref:N]
    const regex = /\[Ref:\s*(\d+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const matchIndex = match.index;
      const refNumber = parseInt(match[1], 10);

      // Push preceding text segment
      if (matchIndex > lastIndex) {
        parts.push(text.substring(lastIndex, matchIndex));
      }

      // Find matching verified citation record
      const citationData = citations.find(
        (c) => Number(c.citation_index) === refNumber
      );

      const isActive = Number(activeCitationIndex) === refNumber;

      parts.push(
        <CitationBadge
          key={`ref-${refNumber}-${matchIndex}`}
          citationIndex={refNumber}
          status={citationData?.status || 'VERIFIED'}
          confidence={citationData?.confidence ?? 0.85}
          pageNumber={citationData?.page_number || 1}
          chunkId={citationData?.chunk_id}
          isActive={isActive}
          onClick={() => {
            if (onSelectCitation) {
              onSelectCitation(
                citationData || {
                  citation_index: refNumber,
                  page_number: 1,
                }
              );
            }
          }}
        />
      );

      lastIndex = regex.lastIndex;
    }

    // Push remaining trailing text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return (
      <div className="text-xs text-zinc-200 leading-relaxed font-sans whitespace-pre-wrap">
        {parts}
        {isStreaming && (
          <span className="inline-block w-2 h-3.5 bg-emerald-400 ml-1 animate-pulse align-middle" />
        )}
      </div>
    );
  };

  const tokensPerSec =
    telemetry?.duration_ms && telemetry?.completion_tokens
      ? (
          (telemetry.completion_tokens / (telemetry.duration_ms / 1000))
        ).toFixed(1)
      : null;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-950 font-sans">
      {/* Content Stream Area */}
      <div className="flex-1 overflow-y-auto p-5 select-text">
        <div className="p-4 rounded border border-zinc-800/80 bg-zinc-900/50 shadow-inner">
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-zinc-800 text-[11px] font-mono text-zinc-400">
            <span className="font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SYNTHESIS OUTPUT STREAM
            </span>
            <span className="text-zinc-500">ENGINE: GROQ-LLAMA3</span>
          </div>

          {renderFormattedContent()}
        </div>
      </div>

      {/* Telemetry & Benchmark Footer */}
      {telemetry && (
        <div className="px-4 py-2 border-t border-zinc-800 bg-zinc-900/90 flex items-center justify-between text-[11px] font-mono text-zinc-400 select-none">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 text-zinc-300" title="Wall-Clock Synthesis Latency">
              <Clock className="w-3 h-3 text-zinc-500" />
              <span className="tabular-nums">{(telemetry.duration_ms / 1000).toFixed(2)}s</span>
            </div>

            {tokensPerSec && (
              <div className="flex items-center gap-1 text-zinc-300" title="Generation Throughput">
                <Activity className="w-3 h-3 text-emerald-500" />
                <span className="tabular-nums">{tokensPerSec} t/s</span>
              </div>
            )}

            <div className="flex items-center gap-1 text-zinc-300" title="Prompt & Completion Tokens">
              <Cpu className="w-3 h-3 text-zinc-500" />
              <span className="tabular-nums">
                {telemetry.prompt_tokens} in / {telemetry.completion_tokens} out
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 text-emerald-400 font-bold" title="Calculated Groq API USD Cost">
            <DollarSign className="w-3 h-3" />
            <span className="tabular-nums">${Number(telemetry.estimated_cost_usd || 0).toFixed(5)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
