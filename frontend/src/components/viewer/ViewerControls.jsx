import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Highlighter,
} from 'lucide-react';

export default function ViewerControls({
  pageNumber = 1,
  numPages = 1,
  scale = 1.0,
  onPageChange,
  onZoomChange,
  showHighlights = true,
  onToggleHighlights,
}) {
  const isFirstPage = pageNumber <= 1;
  const isLastPage = pageNumber >= numPages;

  return (
    <div className="h-10 px-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between select-none text-xs font-mono text-zinc-300">
      {/* Page Navigation */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Previous Page"
          disabled={isFirstPage}
          onClick={() => onPageChange && onPageChange(pageNumber - 1)}
          className="p-1 rounded bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <div
          data-testid="page-indicator"
          aria-label={`Page ${pageNumber} of ${numPages}`}
          className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded tabular-nums text-zinc-200"
        >
          <span>{pageNumber}</span>
          <span className="text-zinc-600 mx-1">/</span>
          <span className="text-zinc-400">{numPages || 1}</span>
        </div>

        <button
          type="button"
          aria-label="Next Page"
          disabled={isLastPage}
          onClick={() => onPageChange && onPageChange(pageNumber + 1)}
          className="p-1 rounded bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Zoom and Display Controls */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Zoom Out"
          disabled={scale <= 0.5}
          onClick={() => onZoomChange && onZoomChange(Math.max(0.5, scale - 0.25))}
          className="p-1 rounded bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <span className="tabular-nums px-1.5 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-300 min-w-[3.5rem] text-center">
          {Math.round(scale * 100)}%
        </span>

        <button
          type="button"
          aria-label="Zoom In"
          disabled={scale >= 3.0}
          onClick={() => onZoomChange && onZoomChange(Math.min(3.0, scale + 0.25))}
          className="p-1 rounded bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          aria-label="Reset Zoom"
          onClick={() => onZoomChange && onZoomChange(1.0)}
          className="p-1 rounded bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          title="Reset Fit (100%)"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-zinc-800 mx-1" />

        {/* Toggle Bounding Box Highlights */}
        <button
          type="button"
          aria-label="Toggle Highlights"
          onClick={onToggleHighlights}
          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] transition-colors ${
            showHighlights
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-300'
              : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Highlighter className="w-3 h-3" />
          <span>HIGHLIGHTS</span>
        </button>
      </div>
    </div>
  );
}
