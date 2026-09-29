import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { streamContractQuery } from '../../services/streaming';
import PDFViewer from '../../components/viewer/PDFViewer';
import AuditQueryInput from '../../components/workspace/AuditQueryInput';
import SynthesisView from '../../components/workspace/SynthesisView';
import CitationInspector from '../../components/workspace/CitationInspector';
import AuditAuditTrail from '../../components/workspace/AuditAuditTrail';
import {
  Layers,
  Terminal,
  FileText,
  ChevronDown,
  ListFilter,
  CheckCircle2,
} from 'lucide-react';

export default function WorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Document Corpus State
  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(searchParams.get('doc') || '');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [chunks, setChunks] = useState([]);

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
  const [telemetry, setTelemetry] = useState(null);
  const [activeTab, setActiveTab] = useState('synthesis'); // 'synthesis' | 'citations'

  // Session History
  const [auditHistory, setAuditHistory] = useState([]);
  const [selectedHistoryIndex, setSelectedHistoryIndex] = useState(-1);

  const abortControllerRef = useRef(null);

  // Fetch ready documents for dropdown
  const fetchDocuments = useCallback(async () => {
    try {
      const response = await api.get('/api/documents/');
      const docs = Array.isArray(response.data)
        ? response.data
        : response.data.results || [];
      const readyDocs = docs.filter((d) => d.status === 'READY');
      setDocuments(readyDocs);

      if (!selectedDocId && readyDocs.length > 0) {
        setSelectedDocId(readyDocs[0].id);
        setSearchParams({ doc: readyDocs[0].id }, { replace: true });
      }
    } catch {
      // ignore
    }
  }, [selectedDocId, setSearchParams]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Load document details and base chunks whenever selectedDocId changes
  useEffect(() => {
    if (!selectedDocId) {
      setSelectedDocument(null);
      setChunks([]);
      return;
    }

    const doc = documents.find((d) => d.id === selectedDocId);
    if (doc) {
      setSelectedDocument(doc);
    }

    api
      .get(`/api/documents/${selectedDocId}/chunks/`)
      .then((res) => {
        const chunkData = Array.isArray(res.data)
          ? res.data
          : res.data.results || [];
        setChunks(chunkData);
      })
      .catch(() => {
        setChunks([]);
      });
  }, [selectedDocId, documents]);

  const handleSelectDocument = (e) => {
    const newDocId = e.target.value;
    setSelectedDocId(newDocId);
    setActivePage(1);
    setActiveBoxId(null);
    if (newDocId) {
      setSearchParams({ doc: newDocId });
    } else {
      setSearchParams({});
    }
  };

  // ONE-CLICK CITATION SYNCHRONIZATION INVARIANT:
  // Immediately jumps PDF viewer to citation's page and highlights bounding box
  const handleSelectCitation = (citation) => {
    if (!citation) return;

    const citationIndex = citation.citation_index;
    setActiveCitationIndex(citationIndex);

    // Jump page
    const pageNum = Number(citation.page_number);
    if (pageNum && pageNum > 0) {
      setActivePage(pageNum);
    }

    // Set active bounding box ID for emerald glow
    const boxId = citation.chunk_id || `chunk-${citation.citation_index}`;
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
              text_content: citation.extracted_claim || '',
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

  // Submit Query to Groq SSE Streaming Engine
  const handleSubmitQuery = async () => {
    if (!query.trim() || isStreaming) return;

    setIsStreaming(true);
    setSynthesisText('');
    setVerifiedCitations([]);
    setActiveCitationIndex(null);
    setTelemetry(null);
    setActiveTab('synthesis');

    abortControllerRef.current = new AbortController();

    let accumulatedText = '';
    let finalCitations = [];
    let finalTelemetry = null;

    await streamContractQuery({
      query,
      documentId: selectedDocId || null,
      topK: 5,
      signal: abortControllerRef.current.signal,
      onMetadata: (metadata) => {
        // Merge retrieved search chunks with existing chunks
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
        finalCitations = citations;
        setVerifiedCitations(citations);
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
    setActiveCitationIndex(null);
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans select-none overflow-hidden">
      {/* Workspace Header Toolbar */}
      <div className="h-11 px-4 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
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
        </div>

        {/* Document Selector Dropdown */}
        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <FileText className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-500 uppercase text-[11px]">ACTIVE CORPUS:</span>
          </div>

          <div className="relative">
            <select
              value={selectedDocId}
              onChange={handleSelectDocument}
              className="appearance-none bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1 pr-7 text-xs font-mono text-zinc-200 focus:outline-none focus:ring-1 focus:ring-zinc-400 max-w-xs truncate cursor-pointer"
            >
              {!selectedDocId && <option value="">-- No Document Selected --</option>}
              {documents.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({d.page_count}p)
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 absolute right-2 top-2 text-zinc-500 pointer-events-none" />
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

      {/* Dual Pane Layout */}
      <div className="flex-1 grid grid-cols-2 divide-x divide-zinc-800 overflow-hidden">
        {/* Left Pane: Interactive PDF Document Viewer */}
        <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
          <PDFViewer
            fileUrl={selectedDocument?.file || null}
            activePage={activePage}
            onPageChange={(page) => setActivePage(page)}
            boundingBoxes={chunks}
            activeBoxId={activeBoxId}
            scale={zoomScale}
            onZoomChange={(newScale) => setZoomScale(newScale)}
            onSelectBox={handleSelectBox}
          />
        </div>

        {/* Right Pane: Real-Time SSE Audit Copilot Console */}
        <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
          {/* Subheader / Tabs */}
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

          {/* Tab Content */}
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {activeTab === 'synthesis' ? (
              <SynthesisView
                text={synthesisText}
                isStreaming={isStreaming}
                citations={verifiedCitations}
                activeCitationIndex={activeCitationIndex}
                onSelectCitation={handleSelectCitation}
                telemetry={telemetry}
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
          </div>

          {/* Session Audit History */}
          <AuditAuditTrail
            history={auditHistory}
            currentIndex={selectedHistoryIndex}
            onSelectHistory={handleSelectHistory}
          />

          {/* Interactive Query Input Toolbar */}
          <AuditQueryInput
            query={query}
            onQueryChange={setQuery}
            onSubmit={handleSubmitQuery}
            isStreaming={isStreaming}
            onCancel={handleCancelStream}
            disabled={!selectedDocId}
          />
        </div>
      </div>
    </div>
  );
}
