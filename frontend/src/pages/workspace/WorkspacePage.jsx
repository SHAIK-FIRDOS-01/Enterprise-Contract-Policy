import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { streamContractQuery } from '../../services/streaming';
import useResponsiveViewport from '../../hooks/useResponsiveViewport';
import PDFViewer from '../../components/viewer/PDFViewer';
import DualPDFViewer from '../../components/viewer/DualPDFViewer';
import AuditQueryInput from '../../components/workspace/AuditQueryInput';
import SynthesisView from '../../components/workspace/SynthesisView';
import CitationInspector from '../../components/workspace/CitationInspector';
import AuditAuditTrail from '../../components/workspace/AuditAuditTrail';
import DocumentSelectorDock from '../../components/workspace/DocumentSelectorDock';
import ModeToggle from '../../components/workspace/ModeToggle';
import {
  Layers,
  Terminal,
  ChevronDown,
  ListFilter,
  CheckCircle2,
} from 'lucide-react';

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
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [chunks, setChunks] = useState([]);

  // Multi-Document Worker & Routing State
  const [operationalMode, setOperationalMode] = useState('DUAL_SYSTEM'); // 'DUAL_SYSTEM' | 'FRONTIER_ONLY'
  const [workerStatuses, setWorkerStatuses] = useState({});
  const [routeInfo, setRouteInfo] = useState(null);

  // PDF Viewer State
  const [activePage, setActivePage] = useState(1);
  const [activeBoxId, setActiveBoxId] = useState(null);
  const [zoomScale, setZoomScale] = useState(1.0);

  // Synthesis & Query State
  const [query, setQuery] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [synthesisText, setSynthesisText] = useState('');
  const [verifiedCitations, setVerifiedCitations] = useState([]);
  const [activeCitationIndex, setActiveCitationIndex] = useState(null);
  const [activeCitation, setActiveCitation] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [activeTab, setActiveTab] = useState('synthesis'); // 'synthesis' | 'citations'

  // Responsive Viewport & Split-Pane Ergonomics (Ticket 14-R)
  const { isCompact } = useResponsiveViewport();
  const [compactTab, setCompactTab] = useState('viewer'); // 'viewer' | 'copilot' | 'citations'

  // Session History
  const [auditHistory, setAuditHistory] = useState([]);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(-1);

  const abortControllerRef = useRef(null);

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

  const docA = useMemo(
    () => documents.find((d) => d.id === selectedDocIds[0]) || null,
    [documents, selectedDocIds]
  );
  const docB = useMemo(
    () => documents.find((d) => d.id === selectedDocIds[1]) || null,
    [documents, selectedDocIds]
  );

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
            initial = paramDocs;
          } else if (paramDoc) {
            initial = [paramDoc];
          } else {
            // Default 2 documents (e.g., FY25 vs FY26) per spec
            initial = readyDocs.slice(0, 2).map((d) => d.id);
          }
          setActiveViewerDocId(initial[0]);
          setSearchParams(
            { doc: initial[0], docs: initial.join(',') },
            { replace: true }
          );
          return initial;
        });
      }
    } catch {
      // ignore
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Load document details and base chunks whenever activeViewerDocId changes
  useEffect(() => {
    if (!activeViewerDocId) {
      setSelectedDocument(null);
      setChunks([]);
      return;
    }

    const doc = documents.find((d) => d.id === activeViewerDocId);
    if (doc) {
      setSelectedDocument(doc);
    }

    api
      .get(`/api/documents/${activeViewerDocId}/chunks/`)
      .then((res) => {
        const chunkData = Array.isArray(res.data)
          ? res.data
          : res.data.results || [];
        setChunks(chunkData);
      })
      .catch(() => {
        setChunks([]);
      });
  }, [activeViewerDocId, documents]);

  const handleSelectDocument = (e) => {
    const newDocId = e.target.value;
    if (!newDocId) return;
    setActiveViewerDocId(newDocId);
    setActivePage(1);
    setActiveBoxId(null);
    setSelectedDocIds((prev) => {
      const updated = prev.includes(newDocId) ? prev : [...prev, newDocId];
      setSearchParams(
        { doc: newDocId, docs: updated.join(',') },
        { replace: true }
      );
      return updated;
    });
  };

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
    setActivePage(1);
    setActiveBoxId(null);
    setSearchParams((prevParams) => {
      const p = new URLSearchParams(prevParams);
      p.set('doc', docId);
      return p;
    }, { replace: true });
  };

  // ONE-CLICK CITATION SYNCHRONIZATION INVARIANT:
  // Immediately jumps PDF viewer to citation's document & page, and highlights bounding box
  const handleSelectCitation = (citation) => {
    if (!citation) return;

    setActiveCitation(citation);
    const citationIndex = citation.citation_index || citation.citationIndex;
    setActiveCitationIndex(citationIndex);

    // If citation targets a different document, switch the PDF viewer
    const targetDocId = citation.document_id || citation.documentId;
    if (targetDocId && targetDocId !== activeViewerDocId) {
      setActiveViewerDocId(targetDocId);
      if (!selectedDocIds.includes(targetDocId)) {
        setSelectedDocIds((prev) => [...prev, targetDocId]);
      }
    }

    // If on compact viewport, automatically switch active tab to DOCUMENT VIEWER
    if (isCompact) {
      setCompactTab('viewer');
    }

    // Jump page
    const pageNum = Number(citation.page_number);
    if (pageNum && pageNum > 0) {
      setActivePage(pageNum);
    }

    // Set active bounding box ID for emerald glow
    const boxId = citation.chunk_id || citation.citation_id || `chunk-${citationIndex}`;
    setActiveBoxId(boxId);

    // Ensure citation chunk exists in boundingBoxes list so canvas renders it
    if (citation.bounding_box && Object.keys(citation.bounding_box).length > 0) {
      setChunks((prev) => {
        const exists = prev.some((c) => c.id === boxId || c.chunk_id === boxId);
        if (!exists) {
          return [
            ...prev,
            {
              id: boxId,
              chunk_id: boxId,
              page_number: pageNum,
              bounding_box: citation.bounding_box,
              text_content: citation.text_snippet || citation.extracted_claim || '',
              status: citation.status,
              confidence: citation.confidence,
              chunk_index: citationIndex,
            },
          ];
        }
        return prev;
      });
    }
  };

  // Handle click directly on canvas bounding box
  const handleSelectBox = (boxId, boxData) => {
    setActiveBoxId(boxId);
    if (boxData?.page_number) {
      setActivePage(Number(boxData.page_number));
    }
    if (boxData?.chunk_index) {
      setActiveCitationIndex(boxData.chunk_index);
    }
  };

  // Submit Multi-Target Query to Groq SSE Streaming Engine
  const handleSubmitQuery = async () => {
    if (!query.trim() || isStreaming) return;

    setIsStreaming(true);
    setSynthesisText('');
    setVerifiedCitations([]);
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
    let finalCitations = [];
    let finalTelemetry = null;
    let finalRoute = null;

    await streamContractQuery({
      query,
      documentId: activeViewerDocId || selectedDocIds[0] || null,
      documentIds: selectedDocIds,
      forceFrontier: operationalMode === 'FRONTIER_ONLY',
      topK: 5,
      signal: abortControllerRef.current.signal,
      onRoute: (routeData) => {
        finalRoute = routeData;
        setRouteInfo(routeData);
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
          const exists = prev.some((c) => (c.citation_index || c.ref_index) === cIndex);
          if (exists) return prev;
          const formatted = {
            ...citation,
            citation_index: cIndex,
            citationIndex: cIndex,
            page_number: citation.page_number || 1,
            chunk_id: citation.citation_id || citation.chunk_id || `ref-${cIndex}`,
            extracted_claim: citation.text_snippet || citation.extracted_claim || '',
            status: citation.status || 'VERIFIED',
            confidence: citation.confidence !== undefined ? citation.confidence : 0.9,
            bounding_box: citation.bounding_box || {},
          };
          finalCitations = [...finalCitations, formatted];
          return [...prev, formatted];
        });
      },
      onMetadata: (metadata) => {
        if (metadata.chunks && Array.isArray(metadata.chunks)) {
          setChunks((prev) => {
            const newMap = new Map();
            prev.forEach((c) => newMap.set(c.id || c.chunk_id, c));
            metadata.chunks.forEach((c) => {
              const id = c.chunk_id || c.id;
              newMap.set(id, {
                ...c,
                id,
              });
            });
            return Array.from(newMap.values());
          });
        }
      },
      onDelta: (deltaText) => {
        accumulatedText += deltaText;
        setSynthesisText(accumulatedText);
      },
      onVerification: (citations) => {
        if (citations && citations.length > 0) {
          finalCitations = citations;
          setVerifiedCitations(citations);
        }
      },
      onTelemetry: (telemetryData) => {
        finalTelemetry = telemetryData;
        setTelemetry(telemetryData);
      },
      onError: (err) => {
        setSynthesisText(
          (prev) => prev + `\n\n[STREAM ERROR: ${err.message || 'Connection lost'}]`
        );
        setIsStreaming(false);
      },
      onDone: () => {
        setIsStreaming(false);
        // Record in audit history
        const newRecord = {
          query,
          synthesis: accumulatedText,
          citations: finalCitations,
          telemetry: finalTelemetry,
          routeInfo: finalRoute,
          timestamp: new Date().toISOString(),
        };
        setAuditHistory((prev) => [newRecord, ...prev]);
        setSelectedHistoryIndex(0);
      },
    });
  };

  const handleCancelStream = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsStreaming(false);
  };

  const handleSelectHistory = (index) => {
    const item = auditHistory[index];
    if (!item) return;

    setSelectedHistoryIndex(index);
    setQuery(item.query);
    setSynthesisText(item.synthesis);
    setVerifiedCitations(item.citations || []);
    setTelemetry(item.telemetry || null);
    setRouteInfo(item.routeInfo || null);
    setActiveCitationIndex(null);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden">
      {/* Workspace Header Toolbar */}
      <div className="min-h-11 px-4 py-1.5 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
            <Layers className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-200 uppercase font-semibold">Workspace</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">Audit & Citation Synthesis</span>
          </div>

          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold tracking-wide flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            DUAL-SYSTEM RAG ACTIVE
          </span>

          <ModeToggle
            mode={operationalMode}
            onChange={(newMode) => setOperationalMode(newMode)}
            disabled={isStreaming}
          />
        </div>

        {/* Multi-Document Selector Dock & Active Viewer Dropdown */}
        <div className="flex items-center gap-3 font-mono text-xs flex-wrap">
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

          <div className="flex items-center gap-1.5 text-zinc-400">
            <span className="text-zinc-500 uppercase text-[10px]">VIEWER:</span>
            <div className="relative">
              <select
                value={activeViewerDocId}
                onChange={handleSelectDocument}
                className="appearance-none bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 pr-7 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 max-w-[170px] truncate cursor-pointer"
              >
                {!activeViewerDocId && <option value="">-- No Document Selected --</option>}
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} ({d.page_count}p)
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-2 text-zinc-500 pointer-events-none" />
            </div>
          </div>

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

      {/* Responsive Segmented Control Bar (Visible on compact viewports < 1280px) */}
      {isCompact && (
        <div className="h-10 px-3 sm:px-4 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1 p-0.5 bg-zinc-950 border border-zinc-800 rounded">
            <button
              type="button"
              onClick={() => setCompactTab('viewer')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                compactTab === 'viewer'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              [1] DOCUMENT VIEWER
            </button>
            <button
              type="button"
              onClick={() => setCompactTab('copilot')}
              className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors ${
                compactTab === 'copilot'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              [2] AUDIT COPILOT
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
              [3] CITATIONS ({verifiedCitations.length})
            </button>
          </div>

          <div className="text-[11px] text-zinc-400 truncate max-w-[200px]">
            {selectedDocument ? selectedDocument.title : 'No Document'}
          </div>
        </div>
      )}

      {/* Main Split Layout: Left PDF Viewer | Right Copilot Console */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Pane: Interactive Document Canvas Viewer */}
        {(!isCompact || compactTab === 'viewer') && (
          <div
            className={`h-full border-r border-zinc-800 bg-zinc-950 overflow-hidden flex flex-col ${
              isCompact ? 'flex-1' : selectedDocIds.length >= 2 && docA && docB ? 'w-[62%] min-w-[560px]' : 'w-[55%] min-w-[500px]'
            }`}
          >
            {selectedDocIds.length >= 2 && docA && docB ? (
              <DualPDFViewer
                documentA={docA}
                documentB={docB}
                activeCitation={activeCitation}
                citations={verifiedCitations}
                boundingBoxes={chunks}
                onSelectBox={handleSelectBox}
                isCompact={isCompact}
              />
            ) : (
              <PDFViewer
                fileUrl={selectedDocument?.file || (selectedDocument?.file_path ? `/media/${selectedDocument.file_path}` : null)}
                activePage={activePage}
                onPageChange={(newPage) => setActivePage(newPage)}
                boundingBoxes={chunks}
                activeBoxId={activeBoxId}
                scale={zoomScale}
                onZoomChange={(newScale) => setZoomScale(newScale)}
                onSelectBox={handleSelectBox}
              />
            )}
          </div>
        )}

        {/* Right Pane: Real-Time SSE Audit Copilot Console */}
        {(!isCompact || compactTab === 'copilot' || compactTab === 'citations') && (
          <div
            className={`h-full flex flex-col bg-zinc-950 overflow-hidden flex-1 ${
              isCompact && compactTab === 'viewer' ? 'hidden' : ''
            }`}
          >
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
                    <span>CITATIONS ({verifiedCitations.length})</span>
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
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {(!isCompact ? activeTab === 'synthesis' : compactTab === 'copilot') ? (
                <SynthesisView
                  text={synthesisText}
                  isStreaming={isStreaming}
                  citations={verifiedCitations}
                  activeCitationIndex={activeCitationIndex}
                  onSelectCitation={handleSelectCitation}
                  telemetry={telemetry}
                  routeInfo={routeInfo}
                  documentMap={documentMap}
                />
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <CitationInspector
                    citations={verifiedCitations}
                    activeCitationIndex={activeCitationIndex}
                    onSelectCitation={handleSelectCitation}
                  />
                </div>
              )}

              {/* Session Audit History (Visible in copilot view) */}
              {(!isCompact || compactTab === 'copilot') && (
                <AuditAuditTrail
                  history={auditHistory}
                  currentIndex={selectedHistoryIndex}
                  onSelectHistory={handleSelectHistory}
                />
              )}

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
        )}
      </div>
    </div>
  );
}
