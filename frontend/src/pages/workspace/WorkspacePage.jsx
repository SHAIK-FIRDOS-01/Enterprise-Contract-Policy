import React from 'react';
import { Terminal, Cpu, FileSearch, ShieldCheck, Layers } from 'lucide-react';

export default function WorkspacePage() {
  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans">
      {/* Workspace Header Toolbar */}
      <div className="h-10 px-4 border-b border-zinc-800 bg-zinc-900/60 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-400">
            <Layers className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-200 uppercase font-semibold">Workspace</span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">Audit & Citation Synthesis</span>
          </div>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 font-semibold tracking-wide">
            SYNTHESIS ENGINE READY
          </span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
          <span className="text-zinc-500">SPLIT-VIEW MODE:</span>
          <span className="px-2 py-0.5 bg-zinc-800 border border-zinc-700 text-zinc-300 rounded text-[11px]">
            50% PDF CANVAS | 50% QUERY STREAM
          </span>
        </div>
      </div>

      {/* Dual Pane Placeholder Shell */}
      <div className="flex-1 grid grid-cols-2 divide-x divide-zinc-800 overflow-hidden">
        {/* Left Pane: PDF Document Canvas */}
        <div className="flex flex-col bg-zinc-950 overflow-hidden">
          <div className="h-8 px-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1.5 font-medium">
              <FileSearch className="w-3.5 h-3.5 text-zinc-500" />
              DOCUMENT VIEWER CANVAS (PDF.JS)
            </span>
            <span className="text-[10px] text-zinc-500">STANDBY // NO CONTRACT LOADED</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded border border-zinc-800 bg-zinc-900/70 flex items-center justify-center mb-3">
              <FileSearch className="w-6 h-6 text-zinc-600" />
            </div>
            <h3 className="text-xs font-mono font-medium text-zinc-300 uppercase tracking-wider mb-1">
              No Document Selected
            </h3>
            <p className="text-[11px] font-mono text-zinc-500 max-w-xs leading-relaxed">
              Select an ingested contract from the document registry to mount page canvases and inspect coordinate bounding boxes.
            </p>
          </div>
        </div>

        {/* Right Pane: Query & Citation Console */}
        <div className="flex flex-col bg-zinc-950 overflow-hidden">
          <div className="h-8 px-3 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between text-xs font-mono text-zinc-400">
            <span className="flex items-center gap-1.5 font-medium">
              <Terminal className="w-3.5 h-3.5 text-zinc-500" />
              QUERY STREAM & CITATION AUDIT CONSOLE
            </span>
            <span className="text-[10px] text-zinc-500">ENGINE: GROQ-LLAMA3</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded border border-zinc-800 bg-zinc-900/70 flex items-center justify-center mb-3">
              <Cpu className="w-6 h-6 text-zinc-600" />
            </div>
            <h3 className="text-xs font-mono font-medium text-zinc-300 uppercase tracking-wider mb-1">
              SSE Stream Idle
            </h3>
            <p className="text-[11px] font-mono text-zinc-500 max-w-xs leading-relaxed mb-4">
              Enter natural language policy questions to trigger dense + sparse hybrid RRF retrieval and coordinate-grounded synthesis.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded border border-zinc-800 bg-zinc-900/40 text-[10px] font-mono text-zinc-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>CITATION VALIDATOR: VERIFIED CONFIDENCE &gt;= 0.85</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
