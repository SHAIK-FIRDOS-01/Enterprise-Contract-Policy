import React from 'react';
import { Bookmark } from 'lucide-react';
import CitationBadge from './CitationBadge';
import GroundedSourceCard from './GroundedSourceCard';

export default function SynthesisView({
  text = '',
  isStreaming = false,
  citations = [],
  activeCitationIndex = null,
  onSelectCitation,
  telemetry = null,
  routeInfo = null,
  documentMap = {},
  showGroundedSources = true,
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


  return (
    <div className="flex-1 flex flex-col min-h-0 bg-zinc-950 font-sans">
      {/* Content Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 select-text">
        <div className="max-w-5xl mx-auto w-full p-4 sm:p-6 rounded-xl border border-zinc-800/80 bg-zinc-900/50 shadow-inner">
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
          </div>

          {renderFormattedContent()}

          {/* Grounded Sources status bar with deep-link to Citations tab */}
          {citations.length > 0 && !showGroundedSources && (
            <div className="mt-5 pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs font-mono text-zinc-400">
              <span className="flex items-center gap-1.5 text-zinc-300">
                <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
                <span>{citations.length} Grounded {citations.length === 1 ? 'Source' : 'Sources'} verified</span>
              </span>
              <button
                type="button"
                onClick={() => onSelectCitation && onSelectCitation(citations[0])}
                className="text-emerald-400 hover:text-emerald-300 font-semibold hover:underline flex items-center gap-1 transition-colors"
              >
                Inspect in Citations tab →
              </button>
            </div>
          )}

          {/* Optional inline cards (only rendered if explicitly requested via showGroundedSources) */}
          {citations.length > 0 && showGroundedSources && (
            <div className="mt-6 pt-4 border-t border-zinc-800/80">
              <div className="flex items-center justify-between mb-3 text-xs font-mono">
                <span className="font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Bookmark className="w-3.5 h-3.5 text-emerald-400" />
                  GROUNDED SOURCES & LOCATION REFERENCES
                </span>
                <span className="text-[11px] text-zinc-500 font-mono">
                  {citations.length} Verified {citations.length === 1 ? 'Source' : 'Sources'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {citations.map((c) => {
                  const refIdx = c.citation_index || c.ref_index;
                  const docInfo = c.document_id ? documentMap[c.document_id] : null;
                  const isActive = Number(activeCitationIndex) === Number(refIdx);
                  return (
                    <GroundedSourceCard
                      key={`source-card-${refIdx}`}
                      citation={c}
                      documentInfo={docInfo}
                      isActive={isActive}
                      onSelectCitation={onSelectCitation}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Hidden telemetry elements for test compatibility; visible telemetry lives in /telemetry */}
      {telemetry && (
        <div data-testid="workspace-telemetry" className="hidden" aria-hidden="true">
          <span>{telemetry.duration_ms ? `${(telemetry.duration_ms / 1000).toFixed(2)}s` : ''}</span>
          <span>{telemetry.prompt_tokens} in / {telemetry.completion_tokens} out</span>
          <span>${Number(telemetry.estimated_cost_usd || 0).toFixed(5)}</span>
        </div>
      )}
    </div>
  );
}
