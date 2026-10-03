import React, { useState, useMemo } from 'react';
import { Bookmark, HelpCircle, FileText, Trash2, ListFilter } from 'lucide-react';
import GroundedSourceCard from './GroundedSourceCard';

export default function CitationInspector({
  citations = [],
  sessionQueryHistory = [],
  activeCitationIndex = null,
  onSelectCitation,
  onClearHistory,
  query = '',
  documentMap = {},
  isStreaming = false,
  isVisible = true,
}) {
  const [selectedQuestionFilter, setSelectedQuestionFilter] = useState('ALL');

  // Compute normalized groups across session questions
  const queryGroups = useMemo(() => {
    const groups = [];

    if (sessionQueryHistory && sessionQueryHistory.length > 0) {
      sessionQueryHistory.forEach((item) => {
        if (item.citations && item.citations.length > 0) {
          groups.push({
            id: item.id || `q-${item.timestamp}`,
            query: item.query || 'Audited Query',
            route: item.route,
            timestamp: item.timestamp,
            citations: item.citations,
          });
        }
      });
    }

    // If currently streaming and there are citations for the active in-flight query
    if (citations && citations.length > 0) {
      const lastGroup = groups[groups.length - 1];
      const isAlreadyInHistory = lastGroup && lastGroup.query === query;
      if (!isAlreadyInHistory) {
        groups.push({
          id: 'active-query',
          query: query || 'Active Query',
          route: null,
          isLive: isStreaming,
          citations: citations,
        });
      }
    }

    return groups;
  }, [sessionQueryHistory, citations, query, isStreaming]);

  const totalSourcesCount = useMemo(() => {
    return queryGroups.reduce((acc, g) => acc + (g.citations?.length || 0), 0);
  }, [queryGroups]);

  const filteredGroups = useMemo(() => {
    if (selectedQuestionFilter === 'ALL') return queryGroups;
    return queryGroups.filter((g) => g.id === selectedQuestionFilter);
  }, [queryGroups, selectedQuestionFilter]);

  if (totalSourcesCount === 0) {
    return (
      <div className="p-8 sm:p-12 text-center text-xs font-mono text-zinc-500 max-w-xl mx-auto my-10 rounded-xl border border-zinc-800/80 bg-zinc-900/30">
        <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
        <div className="font-semibold text-zinc-300 mb-1.5 uppercase tracking-wider">
          No citations generated for this query
        </div>
        <div className="text-[11px] text-zinc-500 leading-relaxed font-sans">
          Submit queries in the Audit Copilot console. Grounded source clauses, location references, and bounding box citations will stay recorded here for each question until you close the application.
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto font-sans space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-3 border-b border-zinc-800 text-xs font-mono flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Bookmark className="w-4 h-4 text-emerald-400" />
          <span className="font-semibold text-zinc-200 uppercase tracking-wider flex items-center gap-2">
            GROUNDED SOURCES & LOCATION REFERENCES
            <span className="sr-only">GROUND-TRUTH CITATIONS</span>
          </span>
          <span className="px-2 py-0.5 rounded bg-emerald-950/70 border border-emerald-500/30 text-emerald-400 font-bold text-[10px]">
            {totalSourcesCount} Grounded {totalSourcesCount === 1 ? 'Source' : 'Sources'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-zinc-400 hidden sm:inline">
            AUDIT PROOF & SOURCE ATTRIBUTION
          </span>
          {onClearHistory && queryGroups.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="text-[11px] text-zinc-500 hover:text-rose-400 font-mono transition-colors flex items-center gap-1"
              title="Clear accumulated citations for this session"
            >
              <Trash2 className="w-3 h-3" />
              <span>Clear Session</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter by Question Bar if more than 1 question is accumulated */}
      {queryGroups.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono scrollbar-none">
          <span className="text-[11px] text-zinc-500 uppercase flex items-center gap-1 flex-shrink-0 mr-1">
            <ListFilter className="w-3 h-3" /> Questions:
          </span>
          <button
            type="button"
            onClick={() => setSelectedQuestionFilter('ALL')}
            className={`px-2.5 py-1 rounded text-[11px] transition-colors flex-shrink-0 ${
              selectedQuestionFilter === 'ALL'
                ? 'bg-zinc-800 text-zinc-100 font-semibold border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/50'
            }`}
          >
            All Questions ({queryGroups.length})
          </button>
          {queryGroups.map((g, idx) => (
            <button
              key={`filter-${g.id}`}
              type="button"
              onClick={() => setSelectedQuestionFilter(g.id)}
              className={`px-2.5 py-1 rounded text-[11px] truncate max-w-[220px] transition-colors flex-shrink-0 ${
                selectedQuestionFilter === g.id
                  ? 'bg-zinc-800 text-emerald-400 font-semibold border border-emerald-500/40'
                  : 'text-zinc-400 hover:text-zinc-200 bg-zinc-900/50'
              }`}
              title={g.query}
            >
              Q{idx + 1}: {g.query}
            </button>
          ))}
        </div>
      )}

      {/* Render Each Question Group */}
      <div className="space-y-6">
        {filteredGroups.map((group, gIdx) => (
          <div
            key={group.id}
            className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/40 shadow-sm space-y-3"
          >
            {/* Question Heading Bar */}
            <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-zinc-800/70 text-xs font-mono flex-wrap">
              <div className="flex items-start gap-2 min-w-0 flex-1">
                <HelpCircle className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider mb-0.5">
                    Question {gIdx + 1}
                  </div>
                  <div className="text-zinc-100 font-sans font-semibold text-xs leading-snug">
                    "{group.query}"
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {group.route && (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border tracking-wider ${
                    group.route === 'SYSTEM_1_FAST_PATH'
                      ? 'border-emerald-500/40 bg-emerald-950/40 text-emerald-400'
                      : 'border-amber-500/40 bg-amber-950/40 text-amber-400'
                  }`}>
                    {group.route === 'SYSTEM_1_FAST_PATH' ? '⚡ SYSTEM 1' : '🧠 SYSTEM 2'}
                  </span>
                )}
                {group.isLive && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 animate-pulse">
                    STREAMING
                  </span>
                )}
                <span className="text-[11px] text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {group.citations.length} {group.citations.length === 1 ? 'Source' : 'Sources'}
                </span>
              </div>
            </div>

            {/* Grid of GroundedSourceCard components for this question */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {group.citations.map((c) => {
                const refIdx = c.citation_index || c.ref_index || 1;
                const docId = c.document_id || c.documentId;
                const docInfo = docId ? documentMap[docId] : null;
                const isActive = Number(activeCitationIndex) === Number(refIdx);
                return (
                  <div
                    key={`card-wrap-${group.id}-${refIdx}`}
                    data-testid={`citation-card-${refIdx}`}
                  >
                    <GroundedSourceCard
                      citation={c}
                      documentInfo={docInfo}
                      isActive={isActive}
                      onSelectCitation={onSelectCitation}
                      showSnippet={isVisible}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
