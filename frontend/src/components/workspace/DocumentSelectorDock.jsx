import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Plus,
  X,
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';

const DOC_THEMES = [
  {
    label: 'DOC A',
    colorClasses: 'border-cyan-500/50 bg-cyan-950/40 text-cyan-300 hover:border-cyan-400',
    activeClasses: 'ring-1 ring-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.4)]',
    dotColor: 'bg-cyan-400',
  },
  {
    label: 'DOC B',
    colorClasses: 'border-amber-500/50 bg-amber-950/40 text-amber-300 hover:border-amber-400',
    activeClasses: 'ring-1 ring-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.4)]',
    dotColor: 'bg-amber-400',
  },
  {
    label: 'DOC C',
    colorClasses: 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300 hover:border-emerald-400',
    activeClasses: 'ring-1 ring-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]',
    dotColor: 'bg-emerald-400',
  },
  {
    label: 'DOC D',
    colorClasses: 'border-violet-500/50 bg-violet-950/40 text-violet-300 hover:border-violet-400',
    activeClasses: 'ring-1 ring-violet-400 shadow-[0_0_8px_rgba(139,92,246,0.4)]',
    dotColor: 'bg-violet-400',
  },
  {
    label: 'DOC E',
    colorClasses: 'border-rose-500/50 bg-rose-950/40 text-rose-300 hover:border-rose-400',
    activeClasses: 'ring-1 ring-rose-400 shadow-[0_0_8px_rgba(244,63,94,0.4)]',
    dotColor: 'bg-rose-400',
  },
  {
    label: 'DOC F',
    colorClasses: 'border-sky-500/50 bg-sky-950/40 text-sky-300 hover:border-sky-400',
    activeClasses: 'ring-1 ring-sky-400 shadow-[0_0_8px_rgba(14,165,233,0.4)]',
    dotColor: 'bg-sky-400',
  },
  {
    label: 'DOC G',
    colorClasses: 'border-fuchsia-500/50 bg-fuchsia-950/40 text-fuchsia-300 hover:border-fuchsia-400',
    activeClasses: 'ring-1 ring-fuchsia-400 shadow-[0_0_8px_rgba(217,70,239,0.4)]',
    dotColor: 'bg-fuchsia-400',
  },
  {
    label: 'DOC H',
    colorClasses: 'border-teal-500/50 bg-teal-950/40 text-teal-300 hover:border-teal-400',
    activeClasses: 'ring-1 ring-teal-400 shadow-[0_0_8px_rgba(20,184,166,0.4)]',
    dotColor: 'bg-teal-400',
  },
];

export default function DocumentSelectorDock({
  documents = [],
  selectedDocIds = [],
  activeViewerDocId = null,
  onToggleDocument,
  onSelectViewerDoc,
  workerStatuses = {},
  maxDocuments = 8,
  disabled = false,
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unselectedDocuments = documents.filter(
    (d) => !selectedDocIds.includes(d.id)
  );

  const isAtMax = selectedDocIds.length >= maxDocuments;

  const renderWorkerStatus = (docId) => {
    const rawStatus = workerStatuses[docId];
    if (!rawStatus) return null;

    const status = typeof rawStatus === 'object' ? rawStatus.status : rawStatus;
    const durationMs = typeof rawStatus === 'object' ? rawStatus.duration_ms : null;

    switch (status) {
      case 'PENDING':
        return (
          <span
            data-testid={`worker-status-${docId}`}
            className="inline-flex items-center gap-1 text-[9px] font-mono text-zinc-400 bg-zinc-800/80 px-1 py-0.5 rounded border border-zinc-700"
          >
            <Clock className="w-2.5 h-2.5 text-zinc-400" />
            PENDING
          </span>
        );
      case 'PROCESSING':
        return (
          <span
            data-testid={`worker-status-${docId}`}
            className="inline-flex items-center gap-1 text-[9px] font-mono text-cyan-300 bg-cyan-950/60 px-1 py-0.5 rounded border border-cyan-800 animate-pulse"
          >
            <Loader2 className="w-2.5 h-2.5 text-cyan-400 animate-spin" />
            PROCESSING
          </span>
        );
      case 'READY':
      case 'SUCCESS':
        return (
          <span
            data-testid={`worker-status-${docId}`}
            className="inline-flex items-center gap-1 text-[9px] font-mono text-emerald-400 bg-emerald-950/60 px-1 py-0.5 rounded border border-emerald-800"
          >
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
            READY {durationMs ? `${Math.round(durationMs)}ms` : ''}
          </span>
        );
      case 'TIMEOUT':
        return (
          <span
            data-testid={`worker-status-${docId}`}
            className="inline-flex items-center gap-1 text-[9px] font-mono text-amber-400 bg-amber-950/60 px-1 py-0.5 rounded border border-amber-800"
          >
            <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
            TIMEOUT
          </span>
        );
      case 'FAILED':
        return (
          <span
            data-testid={`worker-status-${docId}`}
            className="inline-flex items-center gap-1 text-[9px] font-mono text-rose-400 bg-rose-950/60 px-1 py-0.5 rounded border border-rose-800"
          >
            <AlertTriangle className="w-2.5 h-2.5 text-rose-400" />
            FAILED
          </span>
        );
      default:
        return (
          <span
            data-testid={`worker-status-${docId}`}
            className="text-[9px] font-mono text-zinc-400"
          >
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs select-none">
      <div className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 uppercase tracking-wider mr-1">
        <FileText className="w-3.5 h-3.5 text-zinc-500" />
        <span>AUDIT DOCK:</span>
      </div>

      {/* Selected Document Badges */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {selectedDocIds.map((docId, index) => {
          const doc = documents.find((d) => d.id === docId) || {
            id: docId,
            title: `Document ${index + 1}`,
          };
          const theme = DOC_THEMES[index % DOC_THEMES.length];
          const isViewerActive = activeViewerDocId === docId;

          return (
            <div
              key={docId}
              data-testid={`doc-badge-${docId}`}
              onClick={() => onSelectViewerDoc && onSelectViewerDoc(docId)}
              className={`group flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-mono font-medium transition-all duration-150 cursor-pointer ${
                theme.colorClasses
              } ${isViewerActive ? theme.activeClasses : 'opacity-90'}`}
              title={`${doc.title} (Click to view in PDF pane)`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${theme.dotColor}`} />
              <span className="font-semibold">{theme.label}:</span>
              <span className="max-w-[130px] truncate text-[11px]">
                {doc.title}
              </span>

              {renderWorkerStatus(docId)}

              {/* Remove button (if >1 document selected or if toggling permitted) */}
              {selectedDocIds.length > 1 && (
                <button
                  type="button"
                  data-testid={`remove-doc-${docId}`}
                  disabled={disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onToggleDocument) onToggleDocument(docId);
                  }}
                  className="ml-0.5 p-0.5 text-zinc-400 hover:text-rose-400 rounded transition-colors"
                  title="Remove from audit dock"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Document Dropdown */}
      <div className="relative" ref={dropdownRef}>
        {isAtMax ? (
          <span className="text-[10px] font-mono px-2 py-1 rounded border border-zinc-800 bg-zinc-900 text-zinc-500">
            MAX ({selectedDocIds.length}/{maxDocuments})
          </span>
        ) : (
          <button
            type="button"
            data-testid="add-document-button"
            disabled={disabled || unselectedDocuments.length === 0}
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1 px-2 py-1 rounded border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-700 text-xs font-mono transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-3 h-3 text-emerald-400" />
            <span>ADD TARGET</span>
            <ChevronDown className="w-3 h-3 text-zinc-500 ml-0.5" />
          </button>
        )}

        {isDropdownOpen && !isAtMax && unselectedDocuments.length > 0 && (
          <div className="absolute left-0 mt-1 w-64 max-h-56 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded shadow-xl z-50 py-1 font-mono text-xs">
            <div className="px-2 py-1 text-[10px] text-zinc-500 uppercase border-b border-zinc-800">
              Select Document for Multi-Audit
            </div>
            {unselectedDocuments.map((doc) => (
              <button
                key={doc.id}
                type="button"
                data-testid={`dock-select-${doc.id}`}
                onClick={() => {
                  if (onToggleDocument) onToggleDocument(doc.id);
                  setIsDropdownOpen(false);
                }}
                className="w-full text-left px-2.5 py-1.5 hover:bg-zinc-800 text-zinc-200 truncate flex items-center justify-between transition-colors"
              >
                <span className="truncate pr-2">{doc.title}</span>
                {doc.page_count && (
                  <span className="text-[10px] text-zinc-500 flex-shrink-0">
                    {doc.page_count}p
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
