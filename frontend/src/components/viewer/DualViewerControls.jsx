import React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Link2,
  Unlink,
} from 'lucide-react';

export default function DualViewerControls({
  pageA = 1,
  numPagesA = 1,
  onPageAChange,
  pageB = 1,
  numPagesB = 1,
  onPageBChange,
  isLocked = false,
  onToggleLock,
  scale = 1.0,
  onZoomChange,
  titleA = 'Doc A',
  titleB = 'Doc B',
}) {
  const canPrevA = pageA > 1;
  const canNextA = pageA < numPagesA;
  const canPrevB = pageB > 1;
  const canNextB = pageB < numPagesB;

  const handleZoomIn = () => {
    if (onZoomChange) {
      onZoomChange(Math.min(2.5, Math.round((scale + 0.15) * 100) / 100));
    }
  };

  const handleZoomOut = () => {
    if (onZoomChange) {
      onZoomChange(Math.max(0.5, Math.round((scale - 0.15) * 100) / 100));
    }
  };

  const handleZoomReset = () => {
    if (onZoomChange) {
      onZoomChange(1.0);
    }
  };

  return (
    <div className="h-10 px-3 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-xs font-mono select-none">
      {/* Pane A Controls (Cyan) */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-cyan-400 font-bold px-1 py-0.5 rounded bg-cyan-950/60 border border-cyan-800/80">
          {titleA}
        </span>

        <button
          type="button"
          data-testid="prev-page-pane-a"
          disabled={!canPrevA}
          onClick={() => onPageAChange && onPageAChange(pageA - 1)}
          className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          title="Previous Page (Doc A)"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <span
          data-testid="page-indicator-pane-a"
          className="px-1.5 py-0.5 text-zinc-300 tabular-nums text-[11px] bg-zinc-950 rounded border border-zinc-800"
        >
          {pageA} / {numPagesA}
        </span>

        <button
          type="button"
          data-testid="next-page-pane-a"
          disabled={!canNextA}
          onClick={() => onPageAChange && onPageAChange(pageA + 1)}
          className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          title="Next Page (Doc A)"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Center Controls: Lock Scroll Toggle & Global Zoom */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="lock-scroll-toggle"
          aria-pressed={isLocked ? 'true' : 'false'}
          onClick={() => onToggleLock && onToggleLock(!isLocked)}
          className={`flex items-center gap-1 px-2 py-1 rounded border text-[11px] font-mono transition-all ${
            isLocked
              ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-400 font-semibold shadow-sm'
              : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
          }`}
          title={
            isLocked
              ? 'Lock Scroll Active: Proportional mirroring enabled across revisions.'
              : 'Independent Navigation: Lock Scroll disabled.'
          }
        >
          {isLocked ? (
            <Link2 className="w-3 h-3 text-emerald-400" />
          ) : (
            <Unlink className="w-3 h-3 text-zinc-500" />
          )}
          <span>{isLocked ? 'LOCKED SCROLL' : 'UNLINKED'}</span>
        </button>

        <div className="h-3.5 w-px bg-zinc-800 mx-0.5" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-0.5 bg-zinc-950 border border-zinc-800 rounded p-0.5">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={scale <= 0.5}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded disabled:opacity-40 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={handleZoomReset}
            className="px-1 text-[10px] text-zinc-300 tabular-nums hover:text-zinc-100"
            title="Reset Zoom"
          >
            {Math.round(scale * 100)}%
          </button>

          <button
            type="button"
            onClick={handleZoomIn}
            disabled={scale >= 2.5}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded disabled:opacity-40 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3 h-3" />
          </button>

          <button
            type="button"
            onClick={handleZoomReset}
            className="p-1 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded transition-colors"
            title="Reset (100%)"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Pane B Controls (Amber) */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-testid="prev-page-pane-b"
          disabled={!canPrevB}
          onClick={() => onPageBChange && onPageBChange(pageB - 1)}
          className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          title="Previous Page (Doc B)"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <span
          data-testid="page-indicator-pane-b"
          className="px-1.5 py-0.5 text-zinc-300 tabular-nums text-[11px] bg-zinc-950 rounded border border-zinc-800"
        >
          {pageB} / {numPagesB}
        </span>

        <button
          type="button"
          data-testid="next-page-pane-b"
          disabled={!canNextB}
          onClick={() => onPageBChange && onPageBChange(pageB + 1)}
          className="p-1 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          title="Next Page (Doc B)"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>

        <span className="text-[10px] text-amber-400 font-bold px-1 py-0.5 rounded bg-amber-950/60 border border-amber-800/80">
          {titleB}
        </span>
      </div>
    </div>
  );
}
