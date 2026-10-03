import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import api from '../../services/api';
import DocumentListTable from '../../components/contracts/DocumentListTable';
import DocumentUploadModal from '../../components/contracts/DocumentUploadModal';

export const ContractsPage = () => {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const pollingRef = useRef(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await api.get('/api/documents/');
      const docs = Array.isArray(response.data)
        ? response.data
        : response.data.results || [];
      setDocuments(docs);
      setIsLoading(false);
      return docs;
    } catch {
      setIsLoading(false);
      return [];
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Auto-polling when documents are in transition state
  useEffect(() => {
    const hasTransitioningDocs = documents.some((d) =>
      ['PENDING', 'PARSING', 'INDEXING'].includes(d.status)
    );

    if (hasTransitioningDocs) {
      pollingRef.current = setInterval(() => {
        fetchDocuments();
      }, 3000);
    } else {
      if (pollingRef.current) clearInterval(pollingRef.current);
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [documents, fetchDocuments]);

  const handleDeleteDocument = async (docId) => {
    if (!window.confirm('Confirm deletion of document and all indexed chunk vectors?')) {
      return;
    }

    try {
      await api.delete(`/api/documents/${docId}/`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      // Re-fetch to synchronize state
      fetchDocuments();
    }
  };

  const filteredDocuments = documents.filter((doc) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      doc.title?.toLowerCase().includes(q) ||
      doc.file_hash?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans overflow-y-auto">
      {/* Page Header */}
      <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-mono font-semibold tracking-wider text-zinc-100 uppercase">
            Contract & Policy Documents Ingestion Repository
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            Enterprise contract repository and compliance policy document management
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono">
          <button
            type="button"
            onClick={fetchDocuments}
            className="h-8 px-2.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs text-zinc-300 flex items-center gap-1.5 transition-colors"
            title="Refresh Ingestion Registry"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-400" />
            <span>SYNC</span>
          </button>

          <button
            type="button"
            onClick={() => setIsUploadModalOpen(true)}
            className="h-8 px-3 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-semibold text-xs flex items-center gap-1.5 transition-colors shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>INGEST PDF</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 space-y-4">
        {/* Search Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search contracts by title or SHA-256 hash..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 pl-9 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-400 font-mono transition-colors"
            />
          </div>

          <div className="text-xs font-mono text-zinc-500">
            TOTAL INGESTED: <span className="text-zinc-200 font-bold tabular-nums">{documents.length}</span>
          </div>
        </div>

        {/* Documents Table */}
        <DocumentListTable
          documents={filteredDocuments}
          isLoading={isLoading}
          onDeleteDocument={handleDeleteDocument}
          onRefresh={fetchDocuments}
        />
      </div>

      {/* Upload Modal */}
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onUploadSuccess={() => {
          fetchDocuments();
        }}
      />
    </div>
  );
};

export default ContractsPage;
