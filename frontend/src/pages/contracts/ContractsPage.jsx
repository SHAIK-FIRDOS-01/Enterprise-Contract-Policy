import React from 'react';
import { FileText, Filter, Plus } from 'lucide-react';

export const ContractsPage = () => {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
        <div>
          <h1 className="text-base font-semibold text-zinc-100 tracking-tight">
            Contracts & Policies Repository
          </h1>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            Ingestion registry with coordinate bounding-box extraction and pgvector HNSW indexing
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button className="h-8 px-3 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-xs font-mono text-zinc-300 flex items-center space-x-1.5 transition-colors">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <span>Filter</span>
          </button>
          <button className="h-8 px-3 rounded bg-zinc-100 hover:bg-zinc-200 text-xs font-medium text-zinc-900 flex items-center space-x-1.5 transition-colors shadow">
            <Plus className="w-3.5 h-3.5" />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* Main Table / Registry */}
      <div className="rounded border border-zinc-800 bg-zinc-900/40 overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-zinc-800 bg-zinc-900 text-zinc-400 font-mono text-[11px] uppercase tracking-wider">
              <th className="py-2.5 px-4 font-medium">Document Title</th>
              <th className="py-2.5 px-4 font-medium">SHA-256 Hash</th>
              <th className="py-2.5 px-4 font-medium">Pages</th>
              <th className="py-2.5 px-4 font-medium">Status</th>
              <th className="py-2.5 px-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
            <tr className="hover:bg-zinc-850/50 transition-colors">
              <td className="py-3 px-4 font-sans font-medium text-zinc-200 flex items-center space-x-2">
                <FileText className="w-4 h-4 text-zinc-400 flex-shrink-0" />
                <span>Vendor Master Services Agreement 2026.pdf</span>
              </td>
              <td className="py-3 px-4 text-zinc-400 text-[11px]">
                e3b0c44298fc1c14...
              </td>
              <td className="py-3 px-4 text-zinc-300 tabular-nums">42</td>
              <td className="py-3 px-4">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
                  READY
                </span>
              </td>
              <td className="py-3 px-4 text-right">
                <button className="text-zinc-400 hover:text-zinc-100 text-xs transition-colors underline underline-offset-2">
                  Open Workspace
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ContractsPage;
