import React from 'react';
import { Cpu, Zap } from 'lucide-react';

export default function TokenCostAnalytics({ totals = {}, operationsBreakdown = {} }) {
  const totalTokens = Number(totals.total_tokens || 0);
  const totalCostUsd = Number(totals.total_cost_usd || 0.0);

  const llmData = operationsBreakdown.LLM_SYNTHESIS || {};
  const llmOps = llmData.count || 0;
  const llmTokens = llmData.total_tokens || 0;
  const avgTokensPerQuery = llmOps > 0 ? Math.round(llmTokens / llmOps) : 0;

  // Approximate 70% prompt / 30% completion ratio based on Groq chat completions
  const promptTokensEst = Math.round(totalTokens * 0.7);
  const completionTokensEst = totalTokens - promptTokensEst;

  return (
    <div className="p-4 rounded border border-zinc-800 bg-zinc-900/50 space-y-4 font-sans select-none">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-zinc-200 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-zinc-400" />
            <span>Token Expenditure & Compute Unit Economics</span>
          </h3>
          <p className="text-[11px] font-mono text-zinc-500 mt-0.5">
            AuditBenchmarkLog aggregate telemetry and model pricing ledger
          </p>
        </div>

        <div className="text-right">
          <div className="text-lg font-mono font-bold text-emerald-400 tabular-nums">
            ${totalCostUsd.toFixed(6)}
          </div>
          <span className="text-[10px] font-mono text-zinc-500 uppercase">
            Total Incurred Cost (USD)
          </span>
        </div>
      </div>

      {/* Numerical Metrics Grid */}
      <div className="grid grid-cols-4 gap-3 font-mono text-xs">
        <div className="p-3 rounded bg-zinc-950/70 border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">TOTAL TOKENS</div>
          <div className="text-lg font-bold text-zinc-100 tabular-nums mt-0.5">
            {totalTokens.toLocaleString()}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Prompt + Completion</div>
        </div>

        <div className="p-3 rounded bg-zinc-950/70 border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">SYNTHESIS INVOCATIONS</div>
          <div className="text-lg font-bold text-zinc-100 tabular-nums mt-0.5">
            {llmOps.toLocaleString()}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">Groq LPUs Dispatched</div>
        </div>

        <div className="p-3 rounded bg-zinc-950/70 border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">AVG TOKENS / QUERY</div>
          <div className="text-lg font-bold text-zinc-100 tabular-nums mt-0.5">
            {avgTokensPerQuery.toLocaleString()}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">RAG Context + Synthesis</div>
        </div>

        <div className="p-3 rounded bg-zinc-950/70 border border-zinc-800/80">
          <div className="text-[10px] text-zinc-500 uppercase">EFFECTIVE COST / 1K TOKENS</div>
          <div className="text-lg font-bold text-emerald-400 tabular-nums mt-0.5">
            ${totalTokens > 0 ? ((totalCostUsd / totalTokens) * 1000).toFixed(4) : '0.0006'}
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">LPU Accelerated Tier</div>
        </div>
      </div>

      {/* Model Roster & Architecture Specs */}
      <div className="p-3 rounded bg-zinc-950 border border-zinc-800 flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-zinc-300">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-semibold">GROQ LPU CLUSTER:</span>
            <span className="text-zinc-400">llama-3.3-70b-versatile</span>
          </div>
          <span className="text-zinc-600">|</span>
          <div className="flex items-center gap-1 text-zinc-400 text-[11px]">
            <span>LOCAL VECTOR:</span>
            <span className="text-zinc-300">all-MiniLM-L6-v2 (384-dim CPU)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
          <span>PROMPT: ~{promptTokensEst.toLocaleString()}</span>
          <span>•</span>
          <span>COMPLETION: ~{completionTokensEst.toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
}
