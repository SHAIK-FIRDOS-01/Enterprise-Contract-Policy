import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import {
  Zap,
  DollarSign,
  Clock,
  Cpu,
  RefreshCw,
  Gauge,
  Server,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import api from '../../services/api';

export default function ComparativeRoiMatrix({ initialData = null }) {
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(!initialData);

  const fetchComparison = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/analytics/benchmarks/ab-comparison/');
      setData(response.data);
    } catch {
      // In error case keep current data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialData) {
      setData(initialData);
      setLoading(false);
    } else {
      fetchComparison();
    }
  }, [initialData, fetchComparison]);

  const sys1 = data?.system_1 || {};
  const sys2 = data?.system_2 || {};
  const frontier = data?.frontier_baseline || {};
  const roi = data?.roi_metrics || {};
  const concurrency = data?.concurrency_metrics || {};
  const decomposition = data?.latency_decomposition || [];

  const fastPathLat = Number(sys1.avg_latency_ms || 0);
  const frontierLat = Number(frontier.avg_latency_ms || 0);
  const latencyReduction = Number(roi.latency_reduction_pct || 0);
  const dollarSavings = Number(roi.dollar_savings || 0);
  const tokensSaved = Number(roi.tokens_saved || 0);
  const speedupRatio = Number(concurrency.avg_speedup_ratio || 1.0);
  const timeoutRatePct = (Number(concurrency.worker_timeout_rate || 0) * 100);
  const stragglerFreqPct = (Number(concurrency.straggler_frequency || 0) * 100);

  return (
    <div className="p-4 sm:p-5 rounded-lg border border-zinc-800 bg-zinc-900/60 font-sans space-y-5 select-none shadow-sm">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-800/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-mono font-bold tracking-wider text-zinc-100 uppercase">
              A/B COMPARATIVE ROI MATRIX
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
              DUAL-SYSTEM VS FRONTIER
            </span>
          </div>
          <p className="text-[11px] font-mono text-zinc-400 mt-1">
            Empirical comparative telemetry: Fast-path ONNX triage vs Reduce-stage Frontier LLM vs Naive baseline
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="refresh-ab-matrix-btn"
            onClick={fetchComparison}
            className="px-3 py-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 font-mono text-xs flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>SYNC A/B TELEMETRY</span>
          </button>
        </div>
      </div>

      {/* Side-by-side comparative KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mode A: Dual-System Mode */}
        <div className="p-4 rounded border border-emerald-500/30 bg-emerald-950/15 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">
                DUAL-SYSTEM MODE
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-900/40 border border-emerald-500/40 text-emerald-300">
              ACTIVE HYBRID
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4 font-mono">
            <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800/80">
              <span className="text-[10px] text-zinc-400 uppercase block">System 1 Fast-Path</span>
              <div
                data-testid="fast-path-latency"
                className="text-lg font-bold text-emerald-400 tabular-nums mt-0.5"
              >
                {fastPathLat.toFixed(1)}ms
              </div>
              <span className="text-[10px] text-zinc-500">
                {sys1.total_queries || 0} queries ({((Number(sys1.resolution_rate || 0)) * 100).toFixed(1)}%)
              </span>
            </div>

            <div className="p-2.5 rounded bg-zinc-950/80 border border-zinc-800/80">
              <span className="text-[10px] text-zinc-400 uppercase block">System 2 Reduce</span>
              <div className="text-lg font-bold text-cyan-400 tabular-nums mt-0.5">
                {Number(sys2.avg_latency_ms || 0).toFixed(1)}ms
              </div>
              <span className="text-[10px] text-zinc-500">
                {sys2.total_queries || 0} queries ({((Number(sys2.resolution_rate || 0)) * 100).toFixed(1)}%)
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between pt-2 border-t border-emerald-900/30 text-xs font-mono">
            <span className="text-zinc-400 text-[11px]">Cumulative Latency Speedup:</span>
            <span className="font-bold text-emerald-400">
              {latencyReduction.toFixed(1)}% FASTER
            </span>
          </div>
        </div>

        {/* Mode B: Frontier-Only Baseline */}
        <div className="p-4 rounded border border-zinc-800 bg-zinc-950/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-zinc-400" />
              <span className="text-xs font-mono font-bold text-zinc-300 uppercase tracking-wider">
                FRONTIER-ONLY BASELINE
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
              UNOPTIMIZED
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-4 font-mono">
            <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800/80">
              <span className="text-[10px] text-zinc-400 uppercase block">Frontier Latency</span>
              <div
                data-testid="frontier-latency"
                className="text-lg font-bold text-zinc-200 tabular-nums mt-0.5"
              >
                {frontierLat.toFixed(1)}ms
              </div>
              <span className="text-[10px] text-zinc-500">
                {frontier.total_queries || 0} benchmark runs
              </span>
            </div>

            <div className="p-2.5 rounded bg-zinc-900/80 border border-zinc-800/80">
              <span className="text-[10px] text-zinc-400 uppercase block">Frontier Cost</span>
              <div className="text-lg font-bold text-amber-400 tabular-nums mt-0.5">
                ${Number(frontier.total_cost_usd || 0).toFixed(5)}
              </div>
              <span className="text-[10px] text-zinc-500">
                {Number(frontier.total_tokens || 0).toLocaleString()} tokens
              </span>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between pt-2 border-t border-zinc-800 text-xs font-mono">
            <span className="text-zinc-400 text-[11px]">Unoptimized Overhead:</span>
            <span className="font-bold text-zinc-400">100% LLM INVOCATION</span>
          </div>
        </div>
      </div>

      {/* ROI & Concurrency Stat Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
        {/* Cumulative Dollar Savings */}
        <div className="p-3.5 rounded bg-zinc-950 border border-emerald-500/30 bg-emerald-950/10">
          <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 uppercase">
            <DollarSign className="w-3.5 h-3.5" />
            <span>Cumulative Cost Savings</span>
          </div>
          <div
            data-testid="dollar-savings-counter"
            className="text-xl font-bold text-emerald-400 tabular-nums mt-1"
          >
            ${dollarSavings.toFixed(5)}
          </div>
          <div className="text-[10px] text-emerald-500/80 mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            <span>{tokensSaved.toLocaleString()} TOKENS SAVED</span>
          </div>
        </div>

        {/* Parallel Concurrency Speedup */}
        <div className="p-3.5 rounded bg-zinc-950 border border-cyan-500/30 bg-cyan-950/10">
          <div className="flex items-center gap-1.5 text-[10px] text-cyan-400 uppercase">
            <Layers className="w-3.5 h-3.5" />
            <span>Concurrency Efficiency</span>
          </div>
          <div
            data-testid="concurrency-speedup"
            className="text-xl font-bold text-cyan-400 tabular-nums mt-1"
          >
            {speedupRatio.toFixed(2)}x
          </div>
          <div className="text-[10px] text-cyan-400/80 mt-1">
            Wall-clock vs Sequential Ratio
          </div>
        </div>

        {/* Worker Pool Health */}
        <div className="p-3.5 rounded bg-zinc-950 border border-zinc-800">
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 uppercase">
            <Clock className="w-3.5 h-3.5" />
            <span>Worker Pool Reliability</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <div className="text-xs font-bold text-zinc-200">
              {timeoutRatePct.toFixed(1)}% TIMEOUT RATE
            </div>
            <span className="text-zinc-700">|</span>
            <div className="text-xs font-bold text-amber-400">
              {stragglerFreqPct.toFixed(1)}% STRAGGLER FREQ
            </div>
          </div>
          <div className="text-[10px] text-zinc-500 mt-1">
            Worker latency straggler boundary &gt; 2.5x avg
          </div>
        </div>
      </div>

      {/* Latency Decomposition Graph */}
      <div
        data-testid="latency-decomposition-graph"
        className="p-4 rounded border border-zinc-800 bg-zinc-950/80 space-y-3 font-mono"
      >
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-zinc-400" />
            Worker Latency Decomposition ({decomposition.length} {decomposition.length === 1 ? 'Target Document' : 'Target Documents'})
          </span>
          <span className="text-[10px] text-zinc-500">
            Per-Document Retrieval Duration vs Synthesis
          </span>
        </div>

        <div className="space-y-2 pt-1">
          {decomposition.length === 0 ? (
            <div className="text-xs text-zinc-500 py-3 text-center">
              No documents in corpus yet.
            </div>
          ) : (
            decomposition.map((item, idx) => {
              const maxRetrieval = Math.max(
                ...decomposition.map((d) => Number(d.avg_retrieval_ms || 1)),
                100
              );
              const pct = Math.min(
                100,
                Math.max(10, (Number(item.avg_retrieval_ms || 0) / maxRetrieval) * 100)
              );

              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300 font-medium truncate max-w-[65%]">{item.document}</span>
                    <div className="flex items-center gap-2 font-mono">
                      {item.query_count !== undefined && (
                        <span className="text-[10px] text-zinc-500">
                          {item.query_count} {item.query_count === 1 ? 'query' : 'queries'}
                        </span>
                      )}
                      <span className="text-zinc-400 tabular-nums">
                        {Number(item.avg_retrieval_ms || 0).toFixed(1)}ms
                      </span>
                    </div>
                  </div>
                  <div className="h-2 w-full bg-zinc-900 rounded-full overflow-hidden border border-zinc-800/80">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

ComparativeRoiMatrix.propTypes = {
  initialData: PropTypes.shape({
    system_1: PropTypes.object,
    system_2: PropTypes.object,
    frontier_baseline: PropTypes.object,
    dual_system_summary: PropTypes.object,
    roi_metrics: PropTypes.object,
    concurrency_metrics: PropTypes.object,
    latency_decomposition: PropTypes.arrayOf(PropTypes.object),
  }),
};
