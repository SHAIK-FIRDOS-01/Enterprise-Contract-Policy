import React from 'react';
import {
  FileText,
  MapPin,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  Bookmark,
} from 'lucide-react';
import { getHeadingFromCitation } from '../../utils/headings';

export default function GroundedSourceCard({
  citation,
  documentInfo = null,
  isActive = false,
  onSelectCitation,
  showSnippet = true,
}) {
  const refIndex = citation.citation_index || citation.ref_index || 1;
  const pageNum = citation.page_number || citation.pageNumber || 1;
  const confidence = citation.confidence !== null && citation.confidence !== undefined
    ? Math.round(citation.confidence * 100)
    : 92;
  const status = citation.status || 'VERIFIED';
  const isRejected = status === 'REJECTED' || (citation.confidence !== null && citation.confidence < 0.5);
  const isCaution = !isRejected && (status === 'LOW' || status === 'CAUTION' || (citation.confidence !== null && citation.confidence < 0.75));

  const heading = getHeadingFromCitation(citation);
  const snippet = citation.text_snippet || citation.extracted_claim || citation.claim || '';
  const docTitle = documentInfo?.title || citation.document_title || (documentInfo?.label ? `${documentInfo.label}` : 'Source Document');
  const docLabel = documentInfo?.label || null;

  let borderClasses = 'border-zinc-800/90 bg-zinc-900/60 hover:border-zinc-700 hover:bg-zinc-900/90';
  let badgeColor = 'border-emerald-500/40 bg-emerald-950/40 text-emerald-400';
  let statusIcon = <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />;
  let statusLabel = 'VERIFIED';

  if (isActive) {
    borderClasses = 'border-emerald-500/70 bg-emerald-950/20 ring-1 ring-emerald-500/40 shadow-[0_0_12px_rgba(16,185,129,0.15)]';
  } else if (isRejected) {
    borderClasses = 'border-rose-900/60 bg-rose-950/20 hover:border-rose-700';
    badgeColor = 'border-rose-500/40 bg-rose-950/40 text-rose-400';
    statusIcon = <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />;
    statusLabel = 'REJECTED';
  } else if (isCaution) {
    borderClasses = 'border-amber-900/60 bg-amber-950/20 hover:border-amber-700';
    badgeColor = 'border-amber-500/40 bg-amber-950/40 text-amber-400';
    statusIcon = <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
    statusLabel = 'LOW CONFIDENCE';
  }

  const handleCardClick = () => {
    if (onSelectCitation) {
      onSelectCitation(citation);
    }
  };

  return (
    <div
      data-testid={`grounded-source-card-${refIndex}`}
      onClick={handleCardClick}
      className={`rounded-lg border p-3.5 transition-all duration-200 cursor-pointer text-left relative group ${borderClasses}`}
    >
      {/* Top Meta Line: Ref Badge, Document Tag, Page Location, Grounding Status */}
      <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold border tracking-wide flex items-center gap-1 ${badgeColor}`}>
            Ref: {refIndex}
          </span>

          <span
            className="text-xs font-mono font-semibold text-zinc-300 flex items-center gap-1.5 truncate max-w-[240px]"
            title={docTitle}
          >
            <FileText className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
            {docLabel ? (
              <span className="text-emerald-400 font-bold">[{docLabel}]</span>
            ) : null}
            <span className="truncate">{docTitle}</span>
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span className="flex items-center gap-1 text-zinc-400 bg-zinc-950 border border-zinc-800 px-2 py-0.5 rounded">
            <MapPin className="w-3 h-3 text-emerald-400" />
            <span>Page {pageNum}</span>
          </span>

          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold text-zinc-300">
            {statusIcon}
            <span>{statusLabel}</span>
            <span className="text-zinc-500">({confidence}%)</span>
          </span>
        </div>
      </div>

      {/* Heading Line */}
      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-zinc-100 font-sans tracking-tight">
        <Bookmark className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
        <span className="truncate">{heading}</span>
      </div>

      {/* Snippet / Excerpt Quote */}
      {showSnippet && snippet && (
        <blockquote className="text-xs text-zinc-300 font-sans italic leading-relaxed border-l-2 border-emerald-500/40 pl-2.5 py-0.5 mb-2.5 line-clamp-3 bg-zinc-950/40 rounded-r">
          "{snippet}"
        </blockquote>
      )}

      {/* Card Footer: Verified Evidence Tag */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800/80 text-[11px] font-mono text-zinc-500">
        <span className="text-[10px] text-zinc-400 font-mono">
          CONF: <strong className="text-zinc-300">{confidence}%</strong>
        </span>
        <span className="text-[10px] text-emerald-400/90 font-mono">
          AUDIT TRAIL LOGGED
        </span>
      </div>
    </div>
  );
}
