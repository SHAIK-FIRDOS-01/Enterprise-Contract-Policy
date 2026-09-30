import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, AlertCircle, FileSearch } from 'lucide-react';
import ViewerControls from './ViewerControls';
import BoundingBoxOverlay from './BoundingBoxOverlay';

// Configure standard PDF.js worker
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.js`;
}

export default function PDFViewer({
  fileUrl = null,
  activePage = 1,
  onPageChange,
  boundingBoxes = [],
  activeBoxId = null,
  scale = 1.0,
  onZoomChange,
  onSelectBox,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const renderTaskRef = useRef(null);

  const [pdfDoc, setPdfDoc] = useState(null);
  const [numPages, setNumPages] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [renderError, setRenderError] = useState(null);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 0, height: 0 });
  const [originalPageDimensions, setOriginalPageDimensions] = useState({ width: 612, height: 792 });
  const [showHighlights, setShowHighlights] = useState(true);

  const cancelInFlightRender = useCallback(() => {
    if (renderTaskRef.current) {
      try {
        if (typeof renderTaskRef.current.cancel === 'function') {
          renderTaskRef.current.cancel();
        }
      } catch {
        // ignore cancellation
      }
      renderTaskRef.current = null;
    }
  }, []);

  // Load PDF Document when fileUrl changes
  useEffect(() => {
    if (!fileUrl) {
      cancelInFlightRender();
      setPdfDoc(null);
      setNumPages(1);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setRenderError(null);
    cancelInFlightRender();

    const loadingTask = pdfjsLib.getDocument({
      url: fileUrl,
      withCredentials: true,
    });

    loadingTask.promise
      .then((doc) => {
        if (!isMounted) return;
        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        setIsLoading(false);
        setRenderError(`Failed to load document: ${err.message || 'Network error'}`);
      });

    return () => {
      isMounted = false;
      cancelInFlightRender();
      try {
        loadingTask.destroy();
      } catch {
        // ignore cancellation
      }
    };
  }, [fileUrl, cancelInFlightRender]);

  // Render current active page to canvas with high-DPI awareness
  const renderPage = useCallback(async () => {
    cancelInFlightRender();

    if (!pdfDoc || !canvasRef.current) return;

    try {
      const pageToRender = Math.max(1, Math.min(activePage, numPages));
      const page = await pdfDoc.getPage(pageToRender);

      // Verify canvas still mounted after async page retrieval
      if (!canvasRef.current) return;

      // Determine viewport scale based on base viewport and zoom scale
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) return;

      // DPI-AWARE COORDINATE NORMALIZATION INVARIANT:
      // Internal buffer is scaled by window.devicePixelRatio for retina sharpness,
      // while canvas style and overlay bounding boxes strictly track unscaled CSS layout dimensions.
      const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

      const layoutWidth = Math.floor(viewport.width);
      const layoutHeight = Math.floor(viewport.height);

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${layoutWidth}px`;
      canvas.style.height = `${layoutHeight}px`;

      context.clearRect(0, 0, canvas.width, canvas.height);

      // Render at high-DPI resolution to internal buffer
      const renderViewport = page.getViewport({ scale: scale * dpr });
      const renderContext = {
        canvasContext: context,
        viewport: renderViewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      await renderTask.promise;
      renderTaskRef.current = null;

      // Ensure coordinate measuring and dimensions only execute after the render task resolves
      setCanvasDimensions({ width: layoutWidth, height: layoutHeight });
      setOriginalPageDimensions({
        width: unscaledViewport.width,
        height: unscaledViewport.height,
      });
      setRenderError(null);
    } catch (err) {
      // Avoid reporting cancelled renders or DOM detachment during in-flight cancellation
      const isCancelled =
        err?.name === 'RenderingCancelledException' ||
        err?.message?.includes('Rendering cancelled') ||
        err?.message?.includes('cancelled');

      if (!isCancelled) {
        setRenderError(`Page render error: ${err?.message || 'Rendering error'}`);
      }
    } finally {
      renderTaskRef.current = null;
    }
  }, [pdfDoc, activePage, numPages, scale, cancelInFlightRender]);

  useEffect(() => {
    renderPage();
    return () => {
      cancelInFlightRender();
    };
  }, [renderPage, cancelInFlightRender]);

  // ResizeObserver on viewer container for smooth layout updates on window/pane resize
  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect && entry.contentRect.width > 0) {
          // Layout bounds updated smoothly
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Filter chunks relevant to the current page
  const pageBoxes = boundingBoxes.filter(
    (b) => Number(b.page_number) === Number(activePage)
  );

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Viewer Toolbar */}
      <ViewerControls
        pageNumber={activePage}
        numPages={numPages}
        scale={scale}
        onPageChange={onPageChange}
        onZoomChange={onZoomChange}
        showHighlights={showHighlights}
        onToggleHighlights={() => setShowHighlights(!showHighlights)}
      />

      {/* Main Document Canvas Viewport */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-zinc-950 p-6 flex items-start justify-center relative select-none"
      >
        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 z-30 bg-zinc-950/70 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
            <span className="text-xs font-mono text-zinc-400">LOADING CONTRACT PDF...</span>
          </div>
        )}

        {/* Error State */}
        {renderError && (
          <div className="p-4 rounded bg-rose-950/40 border border-rose-800 flex items-start gap-3 text-rose-300 text-xs font-mono max-w-md my-auto">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
            <div>
              <p className="font-semibold uppercase">Document Rendering Fault</p>
              <p className="mt-1 text-rose-400">{renderError}</p>
            </div>
          </div>
        )}

        {/* Empty State when no document loaded */}
        {!fileUrl && !isLoading && !renderError && (
          <div className="my-auto flex flex-col items-center justify-center p-8 text-center max-w-sm">
            <div className="w-12 h-12 rounded border border-zinc-800 bg-zinc-900/60 flex items-center justify-center mb-3 text-zinc-500">
              <FileSearch className="w-6 h-6" />
            </div>
            <h3 className="text-xs font-mono font-medium text-zinc-200 uppercase tracking-wider mb-1">
              No Document Mounted
            </h3>
            <p className="text-[11px] font-mono text-zinc-500 leading-relaxed">
              Select a contract from the registry or ingest a PDF to inspect clause bounding boxes.
            </p>
          </div>
        )}

        {/* Document Canvas Wrapper with Coordinate Overlay */}
        {fileUrl && !renderError && (
          <div
            className="relative shadow-2xl border border-zinc-800 bg-white transition-transform duration-100"
            style={{
              width: canvasDimensions.width ? `${canvasDimensions.width}px` : 'auto',
              height: canvasDimensions.height ? `${canvasDimensions.height}px` : 'auto',
            }}
          >
            <canvas ref={canvasRef} className="block" />

            {/* Interactive Bounding Box Highlight Overlay */}
            <BoundingBoxOverlay
              boundingBoxes={pageBoxes}
              activeBoxId={activeBoxId}
              canvasWidth={canvasDimensions.width}
              canvasHeight={canvasDimensions.height}
              originalPage={originalPageDimensions}
              onSelectBox={onSelectBox}
              isVisible={showHighlights}
            />
          </div>
        )}
      </div>
    </div>
  );
}
