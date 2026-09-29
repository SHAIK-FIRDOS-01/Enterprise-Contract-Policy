import React from 'react';
import { Clock } from 'lucide-react';

const STAGES = [
  {
    key: 'INGEST_CHUNK_PARSE',
    label: 'PyMuPDF Chunking',
    color: 'bg-cyan-500',
    textColor: 'text-cyan-400',
    barColor: 'bg-cyan-500',
  },
  {
    key: 'EMBEDDING_GEN',
    label: 'Dense Embedding',
    color: 'bg-blue-500',
    textColor: 'text-blue-400',
    barColor: 'bg-blue-500',
  },
  {
    key: 'RRF_RETRIEVAL',
    label: 'Hybrid RRF Search',
    color: 'bg-purple-500',
    textColor: 'text-purple-400',
    barColor: 'bg-purple-500',
  },
  {
    key: 'LLM_SYNTHESIS',
    label: 'Groq LLM Synthesis',
    color: 'bg-emerald-500',
    textColor: 'text-emerald-400',
    barColor: 'bg-emerald-500',
  },
  {
    key: 'CITATION_VERIFY',
    label: 'Citation Validator',
    color: 'bg-amber-500',
    textColor: 'text-amber-400',
    barColor: 'bg-amber-500',
  },
];

export default function PipelineLatencyBreakdown({ operationsBreakdown = {} }) {
  // Compute total average duration across known pipeline operations
  let totalDurationMs = 0;
  STAGES.forEach((stage) => {
    const opData = operationsBreakdown[stage.key];
    if (opData?.avg_duration_ms) {
      totalDurationMs += Number(opData.avg_duration_ms);
    }
  });

  return (
    <div className="p-4 rounded border border-zinc-800 bg-zinc-900/50 space-y-4 font-sans select-none">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-zinc-400" />
            <span>End-to-End Pipeline Latency Benchmarks</span>
          </h3>
          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
            Wall-clock duration decomposition from PDF ingestion through verification
          </p>
        </div>

        <div className="text-right">
          <div className="text-lg font-mono font-bold text-zinc-100 tabular-nums">
            {totalDurationMs.toFixed(1)}ms
          </div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase">
            Avg Sequential Pipeline
          </span>
        </div>
      </div>

      {/* Horizontal Stacked Percentage Bar */}
      <div className="w-full h-3 rounded bg-zinc-950 border border-zinc-800 flex overflow-hidden">
        {STAGES.map((stage) => {
          const opData = operationsBreakdown[stage.key];
          const duration = Number(opData?.avg_duration_ms || 0);
          const percent = totalDurationMs > 0 ? (duration / totalDurationMs) * 100 : 0;

          if (percent <= 0) return null;

          return (
            <div
              key={stage.key}
              style={{ width: `${percent}%` }}
              className={`${stage.barColor} h-full transition-all duration-300`}
              title={`${stage.label}: ${duration.toFixed(1)}ms (${percent.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Stage Breakdown Readout Table */}
      <div className="grid grid-cols-5 gap-2 pt-1 font-mono text-[11px]">
        {STAGES.map((stage) => {
          const opData = operationsBreakdown[stage.key];
          const duration = Number(opData?.avg_duration_ms || 0);
          const count = opData?.count || 0;
          const percent = totalDurationMs > 0 ? (duration / totalDurationMs) * 100 : 0;

          return (
            <div
              key={stage.key}
              className="p-2.5 rounded bg-zinc-950/60 border border-zinc-800/80 flex flex-col justify-between"
            >
              <div className="flex items-center gap-1.5 mb-1 truncate">
                <span className={`w-2 h-2 rounded-full ${stage.color} flex-shrink-0`} />
                <span className="text-[10px] font-semibold text-zinc-300 truncate">
                  {stage.label}
                </span>
              </div>

              <div className="text-sm font-bold text-zinc-100 tabular-nums">
                {duration.toFixed(1)}ms
              </div>

              <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-1">
                <span>{percent.toFixed(1)}%</span>
                <span>{count} ops</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
