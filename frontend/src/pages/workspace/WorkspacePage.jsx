import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { streamContractQuery } from '../../services/streaming';
import useResponsiveViewport from '../../hooks/useResponsiveViewport';
import AuditQueryInput from '../../components/workspace/AuditQueryInput';
import SynthesisView from '../../components/workspace/SynthesisView';
import CitationInspector from '../../components/workspace/CitationInspector';
import DocumentSelectorDock from '../../components/workspace/DocumentSelectorDock';
import {
  Terminal,
  ListFilter,
} from 'lucide-react';

const getStoredMode = () => {
  try {
    if (typeof window !== 'undefined' && window.localStorage && typeof window.localStorage.getItem === 'function') {
      return window.localStorage.getItem('operational_mode') || 'DUAL_SYSTEM';
    }
  } catch {
    // Fallback for environments where localStorage is restricted
  }
  return 'DUAL_SYSTEM';
};

const loadStoredCitationHistory = () => {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage && typeof window.sessionStorage.getItem === 'function') {
      const raw = window.sessionStorage.getItem('audit_copilot_citation_history');
      if (raw) return JSON.parse(raw);
    }
  } catch {
    // Fallback if sessionStorage is restricted
  }
  return [];
};

export default function WorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Document Corpus State (Multi-Document Audit Support)
  const [documents, setDocuments] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState(() => {
    const docsParam = searchParams.get('docs');
    const docParam = searchParams.get('doc');
    if (docsParam) return docsParam.split(',').filter(Boolean);
    if (docParam) return [docParam];
    return [];
  });
  const [activeViewerDocId, setActiveViewerDocId] = useState(
    searchParams.get('doc') || selectedDocIds[0] || ''
  );

  // Multi-Document Worker & Routing State (Synchronized with Telemetry Benchmark Mode)
  const [operationalMode, setOperationalMode] = useState(getStoredMode);
  const [workerStatuses, setWorkerStatuses] = useState({});
  const [routeInfo, setRouteInfo] = useState(null);

  useEffect(() => {
    const handleStorageChange = () => {
      setOperationalMode(getStoredMode());
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('storage', handleStorageChange);
      return () => window.removeEventListener('storage', handleStorageChange);
    }
  }, []);

  // Synthesis & Query State
  const [query, setQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [synthesisText, setSynthesisText] = useState('');
  const [verifiedCitations, setVerifiedCitations] = useState([]);
  const [sessionQueryHistory, setSessionQueryHistory] = useState(loadStoredCitationHistory);
  const [activeCitationIndex, setActiveCitationIndex] = useState(null);
  const [, setActiveCitation] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [activeTab, setActiveTab] = useState('synthesis'); // 'synthesis' | 'citations'

  // Responsive Viewport (Compact viewports < 1024px)
  const { isCompact } = useResponsiveViewport();
  const [compactTab, setCompactTab] = useState('copilot'); // 'copilot' | 'citations'

  const abortControllerRef = useRef(null);
  const verifiedCitationsRef = useRef([]);
  const routeInfoRef = useRef(null);

  // Document labels mapping (Doc A, Doc B, Doc C, etc.)
  const documentMap = useMemo(() => {
    const map = {};
    const labels = ['Doc A', 'Doc B', 'Doc C', 'Doc D', 'Doc E', 'Doc F', 'Doc G', 'Doc H'];
    selectedDocIds.forEach((id, idx) => {
      const doc = documents.find((d) => d.id === id);
      map[id] = {
        label: labels[idx % labels.length],
        title: doc?.title || `Document ${idx + 1}`,
      };
    });
    return map;
  }, [selectedDocIds, documents]);

  // Fetch ready documents for dropdown & multi-target selection
  const fetchDocuments = useCallback(async () => {
    try {
      const response = await api.get('/api/documents/');
      const docs = Array.isArray(response.data)
        ? response.data
        : response.data.results || [];
      const readyDocs = docs.filter((d) => d.status === 'READY');
      setDocuments(readyDocs);

      if (readyDocs.length > 0) {
        setSelectedDocIds((prev) => {
          if (prev.length > 0) return prev;
          const paramDoc = searchParams.get('doc');
          const paramDocs = searchParams.get('docs')?.split(',').filter(Boolean);
          let initial = [];
          if (paramDocs && paramDocs.length > 0) {
            initial = paramDocs.filter((id) => readyDocs.some((d) => d.id === id));
          } else if (paramDoc && readyDocs.some((d) => d.id === paramDoc)) {
            initial = [paramDoc];
          }
          if (initial.length === 0) {
            initial = [readyDocs[0].id];
          }
          return initial;
        });

        setActiveViewerDocId((prev) => {
          if (prev && readyDocs.some((d) => d.id === prev)) return prev;
          const paramDoc = searchParams.get('doc');
          if (paramDoc && readyDocs.some((d) => d.id === paramDoc)) return paramDoc;
          return readyDocs[0].id;
        });
      }
    } catch (err) {
      // Ingestion or network error handled gracefully
    }
  }, [searchParams]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);


  const handleToggleDocument = (docId) => {
    setSelectedDocIds((prev) => {
      let next;
      if (prev.includes(docId)) {
        if (prev.length <= 1) return prev; // Keep at least one document active
        next = prev.filter((id) => id !== docId);
      } else {
        if (prev.length >= 8) return prev; // Max 8 limit
        next = [...prev, docId];
      }
      const newActive = next.includes(activeViewerDocId) ? activeViewerDocId : next[0] || '';
      setActiveViewerDocId(newActive);
      setSearchParams(
        { doc: newActive, docs: next.join(',') },
        { replace: true }
      );
      return next;
    });
  };

  const handleSelectViewerDoc = (docId) => {
    setActiveViewerDocId(docId);
    setSearchParams((prevParams) => {
      const p = new URLSearchParams(prevParams);
      p.set('doc', docId);
      return p;
    }, { replace: true });
  };

  // ONE-CLICK CITATION SYNCHRONIZATION:
  // Highlights active citation card and syncs document selection
  const handleSelectCitation = (citation) => {
    if (!citation) return;

    setActiveCitation(citation);
    const citationIndex = citation.citation_index || citation.ref_index;
    setActiveCitationIndex(citationIndex);

    const targetDocId = citation.document_id || citation.documentId;
    if (targetDocId && targetDocId !== activeViewerDocId) {
      setActiveViewerDocId(targetDocId);
      if (!selectedDocIds.includes(targetDocId)) {
        setSelectedDocIds((prev) => [...prev, targetDocId]);
      }
    }
  };

  const handleClearCitationHistory = useCallback(() => {
    setSessionQueryHistory([]);
    setVerifiedCitations([]);
    verifiedCitationsRef.current = [];
    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.removeItem('audit_copilot_citation_history');
      }
    } catch (_err) {
      // Fallback if storage access is restricted
    }
  }, []);

  // Total session citations count across all questions
  const totalCitationsCount = useMemo(() => {
    const historical = sessionQueryHistory.reduce((acc, q) => acc + (q.citations?.length || 0), 0);
    if (isStreaming) {
      return historical + verifiedCitations.length;
    }
    if (historical === 0) {
      return verifiedCitations.length;
    }
    return historical;
  }, [sessionQueryHistory, verifiedCitations, isStreaming]);

  // Submit Multi-Target Query to Groq SSE Streaming Engine
  const handleSubmitQuery = async () => {
    if (!query.trim() || isStreaming) return;

    const submittedQuery = query.trim();
    setIsStreaming(true);
    setSynthesisText('');
    setVerifiedCitations([]);
    verifiedCitationsRef.current = [];
    routeInfoRef.current = null;
    setActiveCitationIndex(null);
    setTelemetry(null);
    setRouteInfo(null);
    setActiveTab('synthesis');

    // Reset worker statuses to PENDING for each active target document
    const initialWorkers = {};
    selectedDocIds.forEach((id) => {
      initialWorkers[id] = { status: 'PENDING' };
    });
    setWorkerStatuses(initialWorkers);

    abortControllerRef.current = new AbortController();

    let accumulatedText = '';

    await streamContractQuery({
      query: submittedQuery,
      documentId: activeViewerDocId || selectedDocIds[0] || null,
      documentIds: selectedDocIds,
      forceFrontier: (getStoredMode() || operationalMode) === 'FRONTIER_ONLY',
      topK: 5,
      signal: abortControllerRef.current.signal,
      onRoute: (routeData) => {
        setRouteInfo(routeData);
        routeInfoRef.current = routeData;
      },
      onWorkerStatus: (statusData) => {
        setWorkerStatuses((prev) => ({
          ...prev,
          [statusData.document_id]: statusData,
        }));
      },
      onCitation: (citation) => {
        setVerifiedCitations((prev) => {
          const cIndex = citation.ref_index || citation.citation_index;
          const exists = prev.some(
            (c) => (c.ref_index || c.citation_index) === cIndex && c.document_id === citation.document_id
          );
          const next = exists ? prev : [...prev, citation];
          verifiedCitationsRef.current = next;
          return next;
        });
      },
      onDelta: (chunk) => {
        accumulatedText += chunk;
        setSynthesisText(accumulatedText);
      },
      onVerification: (verificationList) => {
        setVerifiedCitations((prev) => {
          const merged = [...prev];
          verificationList.forEach((v) => {
            const vIndex = v.ref_index || v.citation_index;
            const idx = merged.findIndex(
              (c) => (c.ref_index || c.citation_index) === vIndex
            );
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...v };
            } else {
              merged.push(v);
            }
          });
          verifiedCitationsRef.current = merged;
          return merged;
        });
      },
      onTelemetry: (telemetryData) => {
        setTelemetry(telemetryData);
      },
      onError: (err) => {
        setSynthesisText(
          (prev) => prev + `\n\n[STREAM ERROR]: ${err.message || 'Connection lost'}`
        );
        const partial = verifiedCitationsRef.current || [];
        if (partial.length > 0) {
          setSessionQueryHistory((prev) => {
            const updated = [
              ...prev,
              {
                id: `q-${Date.now()}`,
                query: submittedQuery,
                timestamp: Date.now(),
                route: routeInfoRef.current?.route || 'SYSTEM_2_FRONTIER',
                citations: partial.map((c) => ({ ...c, query: submittedQuery })),
              },
            ];
            try {
              if (typeof window !== 'undefined' && window.sessionStorage) {
                window.sessionStorage.setItem('audit_copilot_citation_history', JSON.stringify(updated));
              }
            } catch (_err) {
              // Ignore storage quota errors
            }
            return updated;
          });
        }
      },
      onDone: () => {
        setIsStreaming(false);
        const finalCitations = verifiedCitationsRef.current || [];
        if (finalCitations.length > 0) {
          setSessionQueryHistory((prev) => {
            const updated = [
              ...prev,
              {
                id: `q-${Date.now()}`,
                query: submittedQuery,
                timestamp: Date.now(),
                route: routeInfoRef.current?.route || 'SYSTEM_2_FRONTIER',
                citations: finalCitations.map((c) => ({ ...c, query: submittedQuery })),
              },
            ];
            try {
              if (typeof window !== 'undefined' && window.sessionStorage) {
                window.sessionStorage.setItem('audit_copilot_citation_history', JSON.stringify(updated));
              }
            } catch (_err) {
              // Ignore storage quota errors
            }
            return updated;
          });
        }
      },
    });
  };

  const handleCancelStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
    }
  };


  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Top Application Sub-Bar: Operational Mode & Multi-Doc Badges */}
      <div className="h-12 border-b border-zinc-800 bg-zinc-900/60 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="text-zinc-200 font-semibold tracking-wider">WORKSPACE</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400 hidden md:inline">Audit & Citation Synthesis</span>
          </div>
        </div>

        {/* Multi-Document Selector Dock */}
        <div className="flex items-center gap-2 sm:gap-3 font-mono text-xs flex-wrap">
          <DocumentSelectorDock
            documents={documents}
            selectedDocIds={selectedDocIds}
            activeViewerDocId={activeViewerDocId}
            onToggleDocument={handleToggleDocument}
            onSelectViewerDoc={handleSelectViewerDoc}
            workerStatuses={workerStatuses}
            maxDocuments={8}
            disabled={isStreaming}
          />

          {documents.length === 0 && (
            <button
              type="button"
              onClick={() => navigate('/contracts')}
              className="text-[11px] text-emerald-400 hover:underline"
            >
              + Ingest Document
            </button>
          )}
        </div>
      </div>

      {/* Responsive Segmented Control Bar (Visible on compact viewports < 1024px) */}
      {isCompact && (
        <div className="h-10 px-3 sm:px-4 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between text-xs font-mono flex-shrink-0">
          <div className="flex items-center gap-1 p-0.5 bg-zinc-950 border border-zinc-800 rounded">
            <button
              type="button"
              onClick={() => setCompactTab('copilot')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                compactTab === 'copilot'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              [1] AUDIT COPILOT
            </button>
            <button
              type="button"
              onClick={() => setCompactTab('citations')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                compactTab === 'citations'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              [2] CITATIONS ({totalCitationsCount})
            </button>
          </div>
        </div>
      )}

      {/* Main Full-Width Chat Fit Console */}
      <div className="flex-1 flex flex-col bg-zinc-950 overflow-hidden min-h-0">
        {/* Desktop Subheader / Tabs */}
        {!isCompact && (
          <div className="h-10 px-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('synthesis')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                  activeTab === 'synthesis'
                    ? 'bg-zinc-800 text-zinc-100 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>QUERY STREAM</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('citations')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors ${
                  activeTab === 'citations'
                    ? 'bg-zinc-800 text-zinc-100 font-semibold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <ListFilter className="w-3.5 h-3.5 text-amber-400" />
                <span>CITATIONS ({totalCitationsCount})</span>
              </button>
            </div>

            <div className="text-[10px] text-zinc-500">
              {isStreaming ? (
                <span className="text-emerald-400 animate-pulse font-semibold">STREAMING ACTIVE</span>
              ) : (
                <span>IDLE</span>
              )}
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
          {(!isCompact ? activeTab === 'synthesis' : compactTab === 'copilot') && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <SynthesisView
                text={synthesisText}
                isStreaming={isStreaming}
                citations={verifiedCitations}
                activeCitationIndex={activeCitationIndex}
                onSelectCitation={handleSelectCitation}
                telemetry={telemetry}
                routeInfo={routeInfo}
                documentMap={documentMap}
                showGroundedSources={false}
              />
            </div>
          )}

          <div
            className={`flex-1 overflow-y-auto ${
              (!isCompact ? activeTab === 'citations' : compactTab === 'citations') ? '' : 'hidden'
            }`}
          >
            <CitationInspector
              citations={verifiedCitations}
              sessionQueryHistory={sessionQueryHistory}
              activeCitationIndex={activeCitationIndex}
              onSelectCitation={handleSelectCitation}
              onClearHistory={handleClearCitationHistory}
              query={query}
              documentMap={documentMap}
              activeDocumentTitle={documents.find((d) => d.id === selectedDocIds[0])?.title || ''}
              isStreaming={isStreaming}
              isVisible={(!isCompact ? activeTab === 'citations' : compactTab === 'citations')}
            />
          </div>

          {/* Interactive Query Input Toolbar (Visible in copilot view) */}
          {(!isCompact || compactTab === 'copilot') && (
            <AuditQueryInput
              query={query}
              onQueryChange={setQuery}
              onSubmit={handleSubmitQuery}
              isStreaming={isStreaming}
              onCancel={handleCancelStream}
              disabled={selectedDocIds.length === 0}
            />
          )}
        </div>
      </div>
    </div>
  );
}
