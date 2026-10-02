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
  routeInfo = null,
  documentMap = {},
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
      const docInfo = citationData?.document_id ? documentMap[citationData.document_id] : null;
      const docLabel = docInfo?.label || null;

      parts.push(
        <CitationBadge
          key={`ref-${refNumber}-${matchIndex}`}
          citationIndex={refNumber}
          status={citationData?.status || 'VERIFIED'}
          confidence={citationData?.confidence ?? 0.85}
          pageNumber={citationData?.page_number || 1}
          chunkId={citationData?.chunk_id}
          documentId={citationData?.document_id}
          docLabel={docLabel}
          boundingBox={citationData?.bounding_box}
          isActive={isActive}
          onClick={() => {
            if (onSelectCitation) {
              onSelectCitation(
                citationData || {
                  citation_index: refNumber,
                  citationIndex: refNumber,
                  page_number: 1,
                  pageNumber: 1,
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
          <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-zinc-800 text-[11px] font-mono text-zinc-400 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                SYNTHESIS OUTPUT STREAM
              </span>

              {routeInfo && (
                <span
                  data-testid="synthesis-route-badge"
                  className={`px-2 py-0.5 rounded border text-[10px] font-mono font-bold tracking-wide flex items-center gap-1 ${
                    routeInfo.route === 'SYSTEM_1_FAST_PATH'
                      ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-400'
                      : 'border-amber-500/50 bg-amber-950/50 text-amber-400'
                  }`}
                  title={`Confidence: ${Math.round((routeInfo.confidence || 0) * 100)}% | ${routeInfo.reason || ''}`}
                >
                  {routeInfo.route === 'SYSTEM_1_FAST_PATH'
                    ? '⚡ SYSTEM 1: EXTRACTIVE FAST-PATH'
                    : '🧠 SYSTEM 2: FRONTIER REDUCE SYNTHESIS'}
                </span>
              )}
            </div>

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
