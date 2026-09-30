import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity,
  Cpu,
  DollarSign,
  RefreshCw,
  Download,
  ShieldCheck,
} from 'lucide-react';
import { fetchBenchmarkSummary, calculateRoiEconomics } from '../../services/analytics';
import api from '../../services/api';
import MetricStatCard from '../../components/telemetry/MetricStatCard';
import PipelineLatencyBreakdown from '../../components/telemetry/PipelineLatencyBreakdown';
import TokenCostAnalytics from '../../components/telemetry/TokenCostAnalytics';
import DualSystemRoiCard from '../../components/telemetry/DualSystemRoiCard';

export default function TelemetryPage() {
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [documentCount, setDocumentCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshTimerRef = useRef(null);

  const loadMetrics = useCallback(async () => {
    try {
      const [summaryRes, docsRes] = await Promise.all([
        fetchBenchmarkSummary(),
        api.get('/api/documents/').catch(() => ({ data: [] })),
      ]);

      setBenchmarkData(summaryRes);
      const docs = Array.isArray(docsRes.data)
        ? docsRes.data
        : docsRes.data.results || [];
      setDocumentCount(docs.length);
      setIsLoading(false);
    } catch {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMetrics();
  }, [loadMetrics]);

  // Handle auto-refresh interval (10s)
  useEffect(() => {
    if (autoRefresh) {
      autoRefreshTimerRef.current = setInterval(() => {
        loadMetrics();
      }, 10000);
    } else {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    }

    return () => {
      if (autoRefreshTimerRef.current) clearInterval(autoRefreshTimerRef.current);
    };
  }, [autoRefresh, loadMetrics]);

  // Export Telemetry as JSON Report
  const handleExportJson = () => {
    if (!benchmarkData) return;

    const report = {
      report_type: 'ENTERPRISE_CONTRACT_COPILOT_TELEMETRY_BENCHMARK',
      generated_at: new Date().toISOString(),
      document_corpus_count: documentCount,
      summary: benchmarkData,
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `telemetry-benchmark-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalOps = benchmarkData?.total_operations || 0;
  const totals = benchmarkData?.totals || {};
  const health = benchmarkData?.system_health || {};
  const operationsBreakdown = benchmarkData?.operations_breakdown || {};

  const totalTokens = Number(totals.total_tokens || 0);
  const totalCostUsd = Number(totals.total_cost_usd || 0.0);
  const successRatePct = Math.round((health.overall_success_rate ?? 1.0) * 100);

  const llmOps = operationsBreakdown.LLM_SYNTHESIS?.count || 0;

  const economics = calculateRoiEconomics({
    totalDocuments: Math.max(documentCount, 1),
    totalQueries: Math.max(llmOps, totalOps > 0 ? totalOps : 1),
    totalCostUsd: totalCostUsd,
  });

  return (
    <div className="h-full flex flex-col bg-zinc-950 text-zinc-100 font-sans overflow-y-auto select-none">
      {/* Telemetry Header */}
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-800 bg-zinc-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            <h1 className="text-sm font-mono font-semibold tracking-wider text-zinc-100 uppercase">
              Operational Telemetry & Performance Benchmark
            </h1>
          </div>
          <p className="text-xs text-zinc-400 font-mono mt-0.5">
            AuditBenchmarkLog aggregate performance, token consumption, and citation verification ledger
          </p>
        </div>

        <div className="flex items-center gap-2.5 font-mono text-xs">
          {/* Auto Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2.5 py-1 rounded border text-[11px] flex items-center gap-1.5 transition-colors ${
              autoRefresh
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'
              }`}
            />
            <span>AUTO-SYNC (10s)</span>
          </button>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={loadMetrics}
            className="p-1.5 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 text-zinc-300 transition-colors"
            title="Refresh Benchmarks"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Export JSON Report */}
          <button
            type="button"
            onClick={handleExportJson}
            className="h-8 px-3 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-900 font-semibold text-xs flex items-center gap-1.5 transition-colors shadow"
          >
            <Download className="w-3.5 h-3.5" />
            <span>EXPORT REPORT</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Metric Summary Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricStatCard
            label="PIPELINE INVOCATIONS"
            value={totalOps.toLocaleString()}
            subtext={`${health.successful_operations || 0} succeeded / ${health.failed_operations || 0} failed`}
            indicatorColor="emerald"
            icon={Activity}
          />

          <MetricStatCard
            label="TOKEN EXPENDITURE"
            value={totalTokens.toLocaleString()}
            subtext="Groq LPUs + Local 384-dim CPU"
            indicatorColor="cyan"
            icon={Cpu}
          />

          <MetricStatCard
            label="ESTIMATED RUN COST"
            value={`$${totalCostUsd.toFixed(5)}`}
            subtext="$0.0006 / 1k tokens benchmark"
            indicatorColor="emerald"
            icon={DollarSign}
          />

          <MetricStatCard
            label="HEALTH & CITATION GATE"
            value={`${successRatePct}%`}
            subtext="Zero-Hallucination Threshold"
            indicatorColor={successRatePct >= 95 ? 'emerald' : 'amber'}
            icon={ShieldCheck}
          />
        </div>

        {/* Pipeline Stage Latency Decomposition */}
        <PipelineLatencyBreakdown operationsBreakdown={operationsBreakdown} />

        {/* Token Expenditure & Model Analytics */}
        <TokenCostAnalytics
          totals={totals}
          operationsBreakdown={operationsBreakdown}
        />

        {/* Dual-System Comparative ROI Economics */}
        <DualSystemRoiCard
          economics={economics}
        />
      </div>
    </div>
  );
}
