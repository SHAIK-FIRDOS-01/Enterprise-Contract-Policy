import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import PDFViewer from '../../components/viewer/PDFViewer';
import {
  Layers,
  Terminal,
  Cpu,
  ShieldCheck,
  FileText,
  ChevronDown,
} from 'lucide-react';

export default function WorkspacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [documents, setDocuments] = useState([]);
  const [selectedDocId, setSelectedDocId] = useState(searchParams.get('doc') || '');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [activePage, setActivePage] = useState(1);
  const [activeBoxId, setActiveBoxId] = useState(null);
  const [zoomScale, setZoomScale] = useState(1.0);

  // Fetch ready documents for the workspace dropdown
  const fetchDocuments = useCallback(async () => {
    try {
      const response = await api.get('/api/documents/');
      const docs = Array.isArray(response.data)
        ? response.data
        : response.data.results || [];
      const readyDocs = docs.filter((d) => d.status === 'READY');
      setDocuments(readyDocs);

      // Auto-select first doc if none selected
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

  // Load document details and chunks whenever selectedDocId changes
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

    // Fetch chunk bounding boxes
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

  const handleSelectBox = (boxId, boxData) => {
    setActiveBoxId(boxId);
    if (boxData?.page_number && Number(boxData.page_number) !== Number(activePage)) {
      setActivePage(Number(boxData.page_number));
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans select-none">
      {/* Workspace Header Toolbar */}
      <div className="h-11 px-4 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
            <Layers className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-200 uppercase font-semibold">Workspace</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">Audit & Citation Synthesis</span>
          </div>

          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold tracking-wide">
            SYNTHESIS READY
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

        {/* Right Pane: Query & Citation Console (Ticket 11 will power the SSE stream) */}
        <div className="h-full flex flex-col bg-zinc-950 overflow-hidden">
          <div className="h-10 px-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Terminal className="w-3.5 h-3.5 text-zinc-500" />
              QUERY STREAM & CITATION AUDIT CONSOLE
            </span>
            <span className="text-[10px] text-zinc-500">ENGINE: GROQ-LLAMA3</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center select-none">
            <div className="w-12 h-12 rounded border border-zinc-800 bg-zinc-900/70 flex items-center justify-center mb-3">
              <Cpu className="w-6 h-6 text-zinc-600" />
            </div>
            <h3 className="text-xs font-mono font-medium text-zinc-300 uppercase tracking-wider mb-1">
              SSE Stream Idle
            </h3>
            <p className="text-[11px] font-mono text-zinc-500 max-w-xs leading-relaxed mb-4">
              {selectedDocument
                ? `Contract "${selectedDocument.title}" loaded with ${chunks.length} vectorized chunk bboxes.`
                : 'Select an ingested contract to query clauses and stream grounded responses.'}
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-zinc-800 bg-zinc-900/40 text-[10px] font-mono text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>CITATION VALIDATOR: VERIFIED CONFIDENCE &gt;= 0.85</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
