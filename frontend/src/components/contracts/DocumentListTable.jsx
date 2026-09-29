import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  ExternalLink,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Loader2,
  Hash,
} from 'lucide-react';

export default function DocumentListTable({
  documents = [],
  isLoading = false,
  onDeleteDocument,
}) {
  const navigate = useNavigate();

  const getStatusBadge = (status) => {
    switch (status) {
      case 'READY':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>READY</span>
          </span>
        );
      case 'PARSING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-amber-500/30 bg-amber-500/10 text-amber-400 font-medium animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>PARSING</span>
          </span>
        );
      case 'INDEXING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 font-medium animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>INDEXING</span>
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-zinc-700 bg-zinc-800 text-zinc-400 font-medium">
            <Clock className="w-3 h-3" />
            <span>QUEUED</span>
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border border-rose-500/30 bg-rose-500/10 text-rose-400 font-medium">
            <AlertCircle className="w-3 h-3" />
            <span>FAILED</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-zinc-800 text-zinc-400">
            {status}
          </span>
        );
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden font-sans">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-950/80 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[11px]">
            <tr>
              <th className="py-3 px-4">Contract / Title</th>
              <th className="py-3 px-4">SHA-256 Hash</th>
              <th className="py-3 px-4 text-center">Pages</th>
              <th className="py-3 px-4">Ingestion State</th>
              <th className="py-3 px-4">Registered</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/80">
            {isLoading && !documents.length ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
                    <span>SYNCHRONIZING DOCUMENT REGISTRY...</span>
                  </div>
                </td>
              </tr>
            ) : !documents.length ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-zinc-500">
                  No contracts ingested yet. Upload a PDF contract to begin.
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const isReady = doc.status === 'READY';
                const shortHash = doc.file_hash ? doc.file_hash.substring(0, 12) : '—';

                return (
                  <tr
                    key={doc.id}
                    className="hover:bg-zinc-800/30 transition-colors group"
                  >
                    {/* Title */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-zinc-400 group-hover:text-zinc-200 flex-shrink-0" />
                        <div>
                          <p className="font-semibold text-zinc-200 group-hover:text-zinc-100 transition-colors">
                            {doc.title || 'Untitled Document'}
                          </p>
                          <p className="text-[10px] text-zinc-500 font-sans truncate max-w-xs">
                            ID: {doc.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* SHA256 Hash */}
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-[11px] text-zinc-400 font-mono" title={doc.file_hash}>
                        <Hash className="w-2.5 h-2.5 text-zinc-500" />
                        {shortHash}...
                      </span>
                    </td>

                    {/* Page Count */}
                    <td className="py-3 px-4 text-center tabular-nums text-zinc-300">
                      {doc.page_count || '—'}
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4">
                      {getStatusBadge(doc.status)}
                    </td>

                    {/* Timestamp */}
                    <td className="py-3 px-4 text-zinc-400 text-[11px]">
                      {formatDate(doc.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Open in Workspace */}
                        <button
                          type="button"
                          disabled={!isReady}
                          onClick={() => navigate(`/workspace?doc=${doc.id}`)}
                          className="p-1.5 rounded bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title={isReady ? 'Open in Audit Workspace' : 'Waiting for Ingestion'}
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                        </button>

                        {/* Download Document */}
                        {doc.file && (
                          <a
                            href={doc.file}
                            download
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors"
                            title="Download PDF File"
                          >
                            <Download className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-200" />
                          </a>
                        )}

                        {/* Delete Document */}
                        <button
                          type="button"
                          onClick={() => onDeleteDocument && onDeleteDocument(doc.id)}
                          className="p-1.5 rounded bg-zinc-950 border border-zinc-800 hover:bg-rose-950/40 hover:border-rose-800/80 text-zinc-400 hover:text-rose-400 transition-colors"
                          title="Delete Document"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
