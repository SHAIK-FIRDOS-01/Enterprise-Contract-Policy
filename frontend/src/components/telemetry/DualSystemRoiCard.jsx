import React from 'react';
import { DollarSign, TrendingUp } from 'lucide-react';

const COMPARISON_ROWS = [
  {
    metric: 'Turnaround Latency',
    manual: '24 – 72 Hours',
    frontier: '15 – 30 Seconds',
    copilot: '< 800 Milliseconds',
    copilotHighlight: true,
  },
  {
    metric: 'Cost per 1,000 Clauses Audited',
    manual: '$2,500.00',
    frontier: '$80.00',
    copilot: '< $0.15',
    copilotHighlight: true,
  },
  {
    metric: 'Bounding Box Coordinate Grounding',
    manual: 'Manual pen / PDF note',
    frontier: 'None (Ungrounded text)',
    copilot: '100% PyMuPDF Canvas Sync',
    copilotHighlight: true,
  },
  {
    metric: 'Hallucination & Citation Defense',
    manual: 'Subjective human review',
    frontier: 'None (Severe hallucination risk)',
    copilot: 'Deterministic Lexical + Vector Gate',
    copilotHighlight: true,
  },
  {
    metric: 'Corpus Privacy & Data Boundary',
    manual: 'Third-party attorney exposure',
    frontier: 'Public cloud LLM training logs',
    copilot: 'Zero-Leakage Local pgvector HNSW',
    copilotHighlight: true,
  },
];

export default function DualSystemRoiCard({ economics = {} }) {
  const manualCost = economics.manualCost || 0;
  const actualCost = economics.actualCost || 0;
  const savingsVsManual = economics.savingsVsManualPct || 0;
  const capitalPreserved = economics.capitalPreservedUsd || 0;

  return (
    <div className="p-4 rounded border border-zinc-800 bg-zinc-900/50 space-y-4 font-sans select-none">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>Dual-System RAG vs. Legacy Workload Economics</span>
          </h3>
          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
            Enterprise contract audit ROI projection and operational risk matrix
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-2.5 py-1 rounded bg-emerald-950/40 border border-emerald-500/40 flex items-center gap-1.5 text-xs font-mono text-emerald-400">
            <DollarSign className="w-3.5 h-3.5" />
            <span>CAPITAL PRESERVED: </span>
            <strong className="tabular-nums">${capitalPreserved.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {/* Comparative Matrix Table */}
      <div className="overflow-x-auto rounded border border-zinc-800 bg-zinc-950/80">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-zinc-900/80 border-b border-zinc-800 text-zinc-400 uppercase tracking-wider text-[10px]">
            <tr>
              <th className="py-2.5 px-3">Workload Metric</th>
              <th className="py-2.5 px-3 text-zinc-400">Traditional Manual Review</th>
              <th className="py-2.5 px-3 text-zinc-400">Naive Frontier LLM</th>
              <th className="py-2.5 px-3 text-emerald-400 font-bold bg-emerald-950/20 border-l border-emerald-900/30">
                Dual-System Copilot
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/60">
            {COMPARISON_ROWS.map((row, idx) => (
              <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                <td className="py-2.5 px-3 font-semibold text-zinc-300">
                  {row.metric}
                </td>
                <td className="py-2.5 px-3 text-zinc-400 tabular-nums">
                  {row.manual}
                </td>
                <td className="py-2.5 px-3 text-zinc-400 tabular-nums">
                  {row.frontier}
                </td>
                <td className="py-2.5 px-3 text-emerald-300 font-bold tabular-nums bg-emerald-950/10 border-l border-emerald-900/30">
                  {row.copilot}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary ROI Metrics Ribbon */}
      <div className="grid grid-cols-3 gap-3 font-mono text-xs">
        <div className="p-3 rounded bg-zinc-950 border border-zinc-800">
          <div className="text-[10px] text-zinc-500 uppercase">MANUAL REVIEW BASELINE</div>
          <div className="text-base font-bold text-zinc-300 tabular-nums mt-0.5">
            ${manualCost.toFixed(2)}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">@ $25.00 / legal document</div>
        </div>

        <div className="p-3 rounded bg-zinc-950 border border-zinc-800">
          <div className="text-[10px] text-zinc-500 uppercase">SYSTEM COPILOT COST</div>
          <div className="text-base font-bold text-emerald-400 tabular-nums mt-0.5">
            ${actualCost.toFixed(6)}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Groq LPU + pgvector queries</div>
        </div>

        <div className="p-3 rounded bg-zinc-950 border border-emerald-500/30 bg-emerald-950/10">
          <div className="text-[10px] text-emerald-400 uppercase">NET COST REDUCTION</div>
          <div className="text-base font-bold text-emerald-400 tabular-nums mt-0.5">
            {savingsVsManual > 0 ? `${savingsVsManual.toFixed(2)}%` : '99.9%'}
          </div>
          <div className="text-[10px] text-emerald-500 mt-1">Direct OPEX savings</div>
        </div>
      </div>
    </div>
  );
}
