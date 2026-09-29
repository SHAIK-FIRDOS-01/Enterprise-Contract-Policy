import React from 'react';

export default function App(): React.ReactElement {
  return (
    <div className="flex h-screen flex-col bg-slate-900 text-white">
      <header className="flex h-14 items-center justify-between border-b border-slate-800 px-6">
        <h1 className="text-lg font-semibold tracking-tight text-white">
          Enterprise Contract &amp; Policy Copilot
        </h1>
        <span className="rounded bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-400">
          Dual-System RRF RAG Engine
        </span>
      </header>
      <main className="flex flex-1 items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-slate-400">
            Platform Scaffolding Initialized. Ticket 01 Active.
          </p>
        </div>
      </main>
    </div>
  );
}
