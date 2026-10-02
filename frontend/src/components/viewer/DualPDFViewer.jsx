import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, AlertCircle, FileText } from 'lucide-react';
import DualViewerControls from './DualViewerControls';
import BoundingBoxOverlay from './BoundingBoxOverlay';

// Configure standard PDF.js worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
}

export default function DualPDFViewer({
  documentA = null,
  documentB = null,
  initialPageA = 1,
  initialPageB = 1,
  activePageA: controlledPageA = null,
  activePageB: controlledPageB = null,
  onPageAChange = null,
  onPageBChange = null,
  isLocked: controlledLocked = false,
  onToggleLock = null,
  onSyncPage = null,
  boundingBoxes = [],
  citations = [],
  activeCitation = null,
  activeBoxId = null,
  onSelectBox = null,
  isCompact = false,
}) {
  // Page states
  const [internalPageA, setInternalPageA] = useState(initialPageA);
  const [internalPageB, setInternalPageB] = useState(initialPageB);
  const pageA = controlledPageA !== null ? controlledPageA : internalPageA;
  const pageB = controlledPageB !== null ? controlledPageB : internalPageB;

  // Lock state
  const [internalLocked, setInternalLocked] = useState(controlledLocked);
  const isLocked = onToggleLock ? controlledLocked : internalLocked;

  // Zoom scale
  const [scale, setScale] = useState(1.0);

  // Compact screen active pane tab ('A' | 'B')
  const [compactActivePane, setCompactActivePane] = useState('A');

  // Derive effective active box id from activeCitation or activeBoxId
  const effectiveActiveBoxId = useMemo(() => {
    if (activeBoxId) return activeBoxId;
    if (activeCitation) {
      return (
        activeCitation.chunk_id ||
        activeCitation.id ||
        (activeCitation.citation_index !== undefined ? `chunk-${activeCitation.citation_index}` : null)
      );
    }
    return null;
  }, [activeBoxId, activeCitation]);

  // Combine bounding boxes and citations into a single array
  const allBoundingBoxes = useMemo(() => {
    const list = [...boundingBoxes];
    if (citations && citations.length > 0) {
      citations.forEach((c) => {
        const cId = c.chunk_id || c.id || `chunk-${c.citation_index}`;
        if (!list.some((item) => (item.id || `chunk-${item.chunk_index}`) === cId)) {
          list.push({
            id: cId,
            chunk_id: cId,
            document_id: c.document_id || c.documentId,
            page_number: c.page_number || c.page,
            bounding_box: c.bounding_box,
            chunk_index: c.citation_index,
            status: c.status,
            confidence: c.confidence,
            text_content: c.text_snippet || c.extracted_claim || '',
          });
        }
      });
    }
    if (activeCitation && activeCitation.bounding_box) {
      const aId = activeCitation.chunk_id || activeCitation.id || `chunk-${activeCitation.citation_index}`;
      if (!list.some((item) => (item.id || `chunk-${item.chunk_index}`) === aId)) {
        list.push({
          id: aId,
          chunk_id: aId,
          document_id: activeCitation.document_id || activeCitation.documentId,
          page_number: activeCitation.page_number || activeCitation.page,
          bounding_box: activeCitation.bounding_box,
          chunk_index: activeCitation.citation_index,
          status: activeCitation.status,
          confidence: activeCitation.confidence,
          text_content: activeCitation.text_snippet || activeCitation.extracted_claim || '',
        });
      }
    }
    return list;
  }, [boundingBoxes, citations, activeCitation]);

  // Handle active citation navigation
  useEffect(() => {
    if (!activeCitation) return;
    const targetDocId = activeCitation.document_id || activeCitation.documentId;
    const pageNum = Number(activeCitation.page_number || activeCitation.page);
    if (!pageNum || pageNum < 1) return;

    if (documentA?.id && targetDocId === documentA.id) {
      if (onPageAChange) {
        onPageAChange(pageNum);
      } else {
        setInternalPageA(pageNum);
      }
      if (isCompact) {
        setCompactActivePane('A');
      }
    } else if (documentB?.id && targetDocId === documentB.id) {
      if (onPageBChange) {
        onPageBChange(pageNum);
      } else {
        setInternalPageB(pageNum);
      }
      if (isCompact) {
        setCompactActivePane('B');
      }
    }
  }, [activeCitation, documentA?.id, documentB?.id, isCompact, onPageAChange, onPageBChange]);

  // PDF Document states & isolated render tasks
  const canvasRefA = useRef(null);
  const canvasRefB = useRef(null);
  const renderTaskRefA = useRef(null);
  const renderTaskRefB = useRef(null);

  const [pdfDocA, setPdfDocA] = useState(null);
  const [pdfDocB, setPdfDocB] = useState(null);
  const [numPagesA, setNumPagesA] = useState(documentA?.page_count || 1);
  const [numPagesB, setNumPagesB] = useState(documentB?.page_count || 1);

  const [isLoadingA, setIsLoadingA] = useState(false);
  const [isLoadingB, setIsLoadingB] = useState(false);
  const [errorA, setErrorA] = useState(null);
  const [errorB, setErrorB] = useState(null);

  const [canvasDimsA, setCanvasDimsA] = useState({ width: 0, height: 0 });
  const [canvasDimsB, setCanvasDimsB] = useState({ width: 0, height: 0 });

  const fileUrlA = documentA?.file || (documentA?.file_path ? `/media/${documentA.file_path}` : null);
  const fileUrlB = documentB?.file || (documentB?.file_path ? `/media/${documentB.file_path}` : null);

  const cancelInFlightRenderA = useCallback(() => {
    if (renderTaskRefA.current) {
      try {
        if (typeof renderTaskRefA.current.cancel === 'function') {
          renderTaskRefA.current.cancel();
        }
      } catch {
        // ignore cancellation
      }
      renderTaskRefA.current = null;
    }
  }, []);

  const cancelInFlightRenderB = useCallback(() => {
    if (renderTaskRefB.current) {
      try {
        if (typeof renderTaskRefB.current.cancel === 'function') {
          renderTaskRefB.current.cancel();
        }
      } catch {
        // ignore cancellation
      }
      renderTaskRefB.current = null;
    }
  }, []);

  // 1. Load Document A
  useEffect(() => {
    if (!fileUrlA) {
      cancelInFlightRenderA();
      setPdfDocA(null);
      setNumPagesA(1);
      return;
    }

    let isMounted = true;
    setIsLoadingA(true);
    setErrorA(null);
    cancelInFlightRenderA();

    const task = pdfjsLib.getDocument({
      url: fileUrlA,
      withCredentials: true,
    });

    task.promise
      .then((doc) => {
        if (!isMounted) return;
        setPdfDocA(doc);
        setNumPagesA(doc.numPages);
        setIsLoadingA(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setIsLoadingA(false);
        setErrorA(`Failed to load Document A: ${err.message || 'Network error'}`);
      });

    return () => {
      isMounted = false;
      cancelInFlightRenderA();
      try {
        task.destroy();
      } catch {
        // ignore
      }
    };
  }, [fileUrlA, cancelInFlightRenderA]);

  // 2. Load Document B
  useEffect(() => {
    if (!fileUrlB) {
      cancelInFlightRenderB();
      setPdfDocB(null);
      setNumPagesB(1);
      return;
    }

    let isMounted = true;
    setIsLoadingB(true);
    setErrorB(null);
    cancelInFlightRenderB();

    const task = pdfjsLib.getDocument({
      url: fileUrlB,
      withCredentials: true,
    });

    task.promise
      .then((doc) => {
        if (!isMounted) return;
        setPdfDocB(doc);
        setNumPagesB(doc.numPages);
        setIsLoadingB(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setIsLoadingB(false);
        setErrorB(`Failed to load Document B: ${err.message || 'Network error'}`);
      });

    return () => {
      isMounted = false;
      cancelInFlightRenderB();
      try {
        task.destroy();
      } catch {
        // ignore
      }
    };
  }, [fileUrlB, cancelInFlightRenderB]);

  // 3. Render Canvas Pane A
  const renderPaneA = useCallback(async () => {
    cancelInFlightRenderA();
    if (!pdfDocA || !canvasRefA.current) return;

    try {
      const pageToRender = Math.max(1, Math.min(pageA, numPagesA));
      const page = await pdfDocA.getPage(pageToRender);
      if (!canvasRefA.current) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRefA.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const layoutWidth = Math.floor(viewport.width);
      const layoutHeight = Math.floor(viewport.height);

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${layoutWidth}px`;
      canvas.style.height = `${layoutHeight}px`;

      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderViewport = page.getViewport({ scale: scale * dpr });
      const renderTask = page.render({
        canvasContext: context,
        viewport: renderViewport,
      });
      renderTaskRefA.current = renderTask;
      await renderTask.promise;
      renderTaskRefA.current = null;

      setCanvasDimsA({ width: layoutWidth, height: layoutHeight });
    } catch {
      // ignore cancellation
    }
  }, [pdfDocA, pageA, numPagesA, scale, cancelInFlightRenderA]);

  // 4. Render Canvas Pane B
  const renderPaneB = useCallback(async () => {
    cancelInFlightRenderB();
    if (!pdfDocB || !canvasRefB.current) return;

    try {
      const pageToRender = Math.max(1, Math.min(pageB, numPagesB));
      const page = await pdfDocB.getPage(pageToRender);
      if (!canvasRefB.current) return;

      const viewport = page.getViewport({ scale });
      const canvas = canvasRefB.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const layoutWidth = Math.floor(viewport.width);
      const layoutHeight = Math.floor(viewport.height);

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${layoutWidth}px`;
      canvas.style.height = `${layoutHeight}px`;

      context.clearRect(0, 0, canvas.width, canvas.height);

      const renderViewport = page.getViewport({ scale: scale * dpr });
      const renderTask = page.render({
        canvasContext: context,
        viewport: renderViewport,
      });
      renderTaskRefB.current = renderTask;
      await renderTask.promise;
      renderTaskRefB.current = null;

      setCanvasDimsB({ width: layoutWidth, height: layoutHeight });
    } catch {
      // ignore cancellation
    }
  }, [pdfDocB, pageB, numPagesB, scale, cancelInFlightRenderB]);

  useEffect(() => {
    renderPaneA();
  }, [renderPaneA]);

  useEffect(() => {
    renderPaneB();
  }, [renderPaneB]);

  // Page navigation handlers with proportional mirroring when locked
  const handlePageAChange = (newPage) => {
    const clamped = Math.max(1, Math.min(newPage, numPagesA));
    if (onPageAChange) {
      onPageAChange(clamped);
    } else {
      setInternalPageA(clamped);
    }

    if (isLocked) {
      const ratio = numPagesA > 1 ? (clamped - 1) / (numPagesA - 1) : 0;
      const targetB = Math.max(1, Math.min(numPagesB, Math.round(1 + ratio * (numPagesB - 1))));
      if (onPageBChange) {
        onPageBChange(targetB);
      } else {
        setInternalPageB(targetB);
      }
      if (onSyncPage) onSyncPage({ pageA: clamped, pageB: targetB });
    }
  };

  const handlePageBChange = (newPage) => {
    const clamped = Math.max(1, Math.min(newPage, numPagesB));
    if (onPageBChange) {
      onPageBChange(clamped);
    } else {
      setInternalPageB(clamped);
    }

    if (isLocked) {
      const ratio = numPagesB > 1 ? (clamped - 1) / (numPagesB - 1) : 0;
      const targetA = Math.max(1, Math.min(numPagesA, Math.round(1 + ratio * (numPagesA - 1))));
      if (onPageAChange) {
        onPageAChange(targetA);
      } else {
        setInternalPageA(targetA);
      }
      if (onSyncPage) onSyncPage({ pageA: targetA, pageB: clamped });
    }
  };

  const handleToggleLock = (newLocked) => {
    if (onToggleLock) {
      onToggleLock(newLocked);
    } else {
      setInternalLocked(newLocked);
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950 select-none overflow-hidden font-sans border-r border-zinc-800">
      {/* Dual Split-Pane Synchronization Controls */}
      <DualViewerControls
        pageA={pageA}
        numPagesA={numPagesA}
        onPageAChange={handlePageAChange}
        pageB={pageB}
        numPagesB={numPagesB}
        onPageBChange={handlePageBChange}
        isLocked={isLocked}
        onToggleLock={handleToggleLock}
        scale={scale}
        onZoomChange={setScale}
        titleA={documentA?.title ? 'DOC A' : 'DOC A'}
        titleB={documentB?.title ? 'DOC B' : 'DOC B'}
      />

      {/* Responsive Segmented Tabs for Compact Viewports */}
      {isCompact && (
        <div className="h-9 px-3 bg-zinc-900/90 border-b border-zinc-800 flex items-center gap-1.5 text-xs font-mono">
          <button
            type="button"
            data-testid="compact-tab-doc-a"
            aria-selected={compactActivePane === 'A' ? 'true' : 'false'}
            onClick={() => setCompactActivePane('A')}
            className={`flex-1 py-1 rounded text-center transition-colors ${
              compactActivePane === 'A'
                ? 'bg-cyan-950/80 text-cyan-300 font-semibold border border-cyan-800'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            [DOC A] {documentA?.title ? documentA.title.slice(0, 20) : 'Primary'}
          </button>
          <button
            type="button"
            data-testid="compact-tab-doc-b"
            aria-selected={compactActivePane === 'B' ? 'true' : 'false'}
            onClick={() => setCompactActivePane('B')}
            className={`flex-1 py-1 rounded text-center transition-colors ${
              compactActivePane === 'B'
                ? 'bg-amber-950/80 text-amber-300 font-semibold border border-amber-800'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            [DOC B] {documentB?.title ? documentB.title.slice(0, 20) : 'Comparison'}
          </button>
        </div>
      )}

      {/* Side-by-Side Dual Canvas Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden divide-x divide-zinc-800">
        {/* Pane A: Primary Document (Slate-Cyan Theme) */}
        {(!isCompact || compactActivePane === 'A') && (
          <div
            data-testid="pane-doc-a"
            className="flex-1 flex flex-col min-w-0 bg-zinc-950 overflow-hidden"
          >
            <div className="px-3 py-1 bg-zinc-900/60 border-b border-zinc-800 text-[11px] font-mono text-cyan-400 flex items-center justify-between truncate">
              <span className="truncate font-semibold flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0" />
                <span className="truncate">{documentA?.title || 'Primary Document A'}</span>
              </span>
              <span className="text-[10px] text-zinc-500 uppercase flex-shrink-0">
                P.{pageA} OF {numPagesA}
              </span>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center relative bg-zinc-900/20">
              {isLoadingA && (
                <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Loading Document A...</span>
                </div>
              )}
              {errorA && (
                <div className="flex items-center gap-1.5 text-rose-400 text-xs font-mono p-3 bg-rose-950/30 border border-rose-800 rounded">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errorA}</span>
                </div>
              )}

              <div className="relative shadow-2xl bg-white rounded-sm overflow-hidden">
                <canvas
                  ref={canvasRefA}
                  data-testid="canvas-pane-a"
                  className="block select-none"
                />
                <BoundingBoxOverlay
                  boundingBoxes={allBoundingBoxes}
                  documentId={documentA?.id}
                  paneTheme="cyan"
                  canvasWidth={canvasDimsA.width}
                  canvasHeight={canvasDimsA.height}
                  activeBoxId={effectiveActiveBoxId}
                  onSelectBox={onSelectBox}
                  isVisible={!isLoadingA && !errorA}
                />
              </div>
            </div>
          </div>
        )}

        {/* Pane B: Comparison Document (Amber-Indigo Theme) */}
        {(!isCompact || compactActivePane === 'B') && (
          <div
            data-testid="pane-doc-b"
            className="flex-1 flex flex-col min-w-0 bg-zinc-950 overflow-hidden"
          >
            <div className="px-3 py-1 bg-zinc-900/60 border-b border-zinc-800 text-[11px] font-mono text-amber-400 flex items-center justify-between truncate">
              <span className="truncate font-semibold flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="truncate">{documentB?.title || 'Comparison Document B'}</span>
              </span>
              <span className="text-[10px] text-zinc-500 uppercase flex-shrink-0">
                P.{pageB} OF {numPagesB}
              </span>
            </div>

            <div className="flex-1 overflow-auto p-4 flex items-center justify-center relative bg-zinc-900/20">
              {isLoadingB && (
                <div className="flex items-center gap-2 text-zinc-400 text-xs font-mono">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Loading Document B...</span>
                </div>
              )}
              {errorB && (
                <div className="flex items-center gap-1.5 text-rose-400 text-xs font-mono p-3 bg-rose-950/30 border border-rose-800 rounded">
                  <AlertCircle className="w-4 h-4" />
                  <span>{errorB}</span>
                </div>
              )}

              <div className="relative shadow-2xl bg-white rounded-sm overflow-hidden">
                <canvas
                  ref={canvasRefB}
                  data-testid="canvas-pane-b"
                  className="block select-none"
                />
                <BoundingBoxOverlay
                  boundingBoxes={allBoundingBoxes}
                  documentId={documentB?.id}
                  paneTheme="amber"
                  canvasWidth={canvasDimsB.width}
                  canvasHeight={canvasDimsB.height}
                  activeBoxId={effectiveActiveBoxId}
                  onSelectBox={onSelectBox}
                  isVisible={!isLoadingB && !errorB}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
