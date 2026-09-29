import React from 'react';

export default function CitationBadge({
  citationIndex,
  status = 'VERIFIED',
  confidence = 0.9,
  pageNumber = 1,
  chunkId = null,
  onClick,
  isActive = false,
}) {
  const isRejected = status === 'REJECTED' || (confidence !== null && confidence < 0.5);
  const isMedium =
    !isRejected && (status === 'LOW' || status === 'CAUTION' || (confidence !== null && confidence < 0.75));

  let colorClasses = 'border-emerald-500/40 bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/50';
  let dotColor = 'bg-emerald-400';

  if (isRejected) {
    colorClasses = 'border-rose-500/40 bg-rose-950/40 text-rose-400 line-through opacity-80 hover:bg-rose-900/50';
    dotColor = 'bg-rose-400';
  } else if (isMedium) {
    colorClasses = 'border-amber-500/40 bg-amber-950/40 text-amber-400 hover:bg-amber-900/50';
    dotColor = 'bg-amber-400';
  }

  if (isActive) {
    colorClasses += ' ring-1 ring-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]';
  }

  const handleClick = (e) => {
    e.stopPropagation();
    if (onClick) {
      onClick({
        citationIndex,
        status,
        confidence,
        pageNumber,
        chunkId,
      });
    }
  };

  const formattedConfidence =
    confidence !== null && confidence !== undefined
      ? `${Math.round(confidence * 100)}%`
      : 'N/A';

  return (
    <button
      type="button"
      data-testid={`citation-badge-${citationIndex}`}
      onClick={handleClick}
      title={`Citation Ref: ${citationIndex} | Page ${pageNumber} | Confidence: ${formattedConfidence} | Status: ${status}`}
      className={`inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 rounded border text-[11px] font-mono font-semibold transition-all duration-150 cursor-pointer select-none ${colorClasses}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} flex-shrink-0`} />
      <span>Ref: {citationIndex}</span>
      {pageNumber && (
        <span className="text-[9px] opacity-70">p.{pageNumber}</span>
      )}
    </button>
  );
}
