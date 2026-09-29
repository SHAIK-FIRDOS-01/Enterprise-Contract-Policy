import React, { useState } from 'react';
import { transformCoordinates } from '../../utils/coordinates';
import { ShieldCheck, ShieldAlert, AlertTriangle } from 'lucide-react';

export default function BoundingBoxOverlay({
  boundingBoxes = [],
  activeBoxId = null,
  canvasWidth = 0,
  canvasHeight = 0,
  originalPage = null,
  onSelectBox,
  isVisible = true,
}) {
  const [hoveredBoxId, setHoveredBoxId] = useState(null);

  if (!isVisible || !canvasWidth || !canvasHeight || !boundingBoxes.length) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
      style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
    >
      {boundingBoxes.map((item) => {
        const boxId = item.id || `chunk-${item.chunk_index}`;
        const isActive = activeBoxId === boxId;
        const isHovered = hoveredBoxId === boxId;

        const coords = transformCoordinates(
          item.bounding_box || item,
          canvasWidth,
          canvasHeight,
          originalPage
        );

        // Discard degenerate or zero-area bounding boxes
        if (coords.width <= 0 || coords.height <= 0) {
          return null;
        }

        const isRejected = item.status === 'REJECTED';
        const isCaution = item.status === 'LOW' || item.status === 'CAUTION';

        let boxColorClasses = 'border-amber-400/80 bg-amber-500/20 hover:bg-amber-500/35 hover:border-amber-300';
        if (isActive) {
          boxColorClasses = 'border-emerald-400 bg-emerald-500/30 shadow-[0_0_12px_rgba(52,211,153,0.6)] z-20';
        } else if (isRejected) {
          boxColorClasses = 'border-rose-400/80 bg-rose-500/20 hover:bg-rose-500/35 hover:border-rose-300';
        } else if (isCaution) {
          boxColorClasses = 'border-yellow-400/80 bg-yellow-500/20 hover:bg-yellow-500/35 hover:border-yellow-300';
        }

        return (
          <div
            key={boxId}
            data-testid={`bounding-box-${boxId}`}
            onClick={(e) => {
              e.stopPropagation();
              if (onSelectBox) onSelectBox(boxId, item);
            }}
            onMouseEnter={() => setHoveredBoxId(boxId)}
            onMouseLeave={() => setHoveredBoxId(null)}
            className={`absolute border-2 rounded-sm cursor-pointer pointer-events-auto transition-all duration-150 group ${boxColorClasses}`}
            style={{
              left: `${coords.left}px`,
              top: `${coords.top}px`,
              width: `${coords.width}px`,
              height: `${coords.height}px`,
            }}
          >
            {/* Tag Badge */}
            <div className="absolute -top-4 left-0 px-1 py-0.2 bg-zinc-950/90 border border-zinc-700 rounded text-[9px] font-mono text-zinc-300 uppercase whitespace-nowrap shadow pointer-events-none">
              <span>REF: {item.chunk_index ?? item.index ?? 'CLAUSE'}</span>
            </div>

            {/* Hover Tooltip Card */}
            {isHovered && (
              <div
                className="absolute z-50 left-0 top-full mt-1.5 w-64 p-2.5 rounded bg-zinc-950 border border-zinc-700 shadow-2xl text-left pointer-events-none font-mono"
                style={{ minWidth: '220px' }}
              >
                <div className="flex items-center justify-between pb-1 border-b border-zinc-800 text-[10px] text-zinc-400 mb-1.5">
                  <span className="font-semibold text-zinc-200">
                    {item.metadata?.clause_type || 'CITATION CLAUSE'}
                  </span>
                  <div className="flex items-center gap-1">
                    {isRejected ? (
                      <span className="text-rose-400 flex items-center gap-0.5">
                        <ShieldAlert className="w-3 h-3" /> REJECTED
                      </span>
                    ) : isCaution ? (
                      <span className="text-amber-400 flex items-center gap-0.5">
                        <AlertTriangle className="w-3 h-3" /> LOW
                      </span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-0.5">
                        <ShieldCheck className="w-3 h-3" /> VERIFIED
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-[11px] text-zinc-300 line-clamp-3 leading-snug font-sans">
                  {item.text_content || item.text || 'Extracted clause snippet'}
                </p>

                {item.confidence !== undefined && (
                  <div className="mt-1.5 pt-1 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-500">
                    <span>CONFIDENCE SCORE:</span>
                    <span className="font-bold text-zinc-200 tabular-nums">
                      {(Number(item.confidence) * 100).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
