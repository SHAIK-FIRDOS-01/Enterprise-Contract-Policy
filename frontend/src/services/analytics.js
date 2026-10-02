import api from './api';

/**
 * Fetches benchmark telemetry summary from Django backend.
 */
export async function fetchBenchmarkSummary() {
  const response = await api.get('/api/analytics/benchmarks/summary/');
  return response.data;
}

/**
 * Fetches A/B comparative benchmark telemetry from Django backend.
 */
export async function fetchComparativeBenchmarks() {
  const response = await api.get('/api/analytics/benchmarks/ab-comparison/');
  return response.data;
}


/**
 * Computes comparative economic savings and ROI against industry baselines:
 * - Baseline 1 (Manual Legal Review): $25.00 per contract document.
 * - Baseline 2 (Naive Frontier LLM): $0.08 per ungrounded frontier query (30k tokens @ $2.50/M).
 * - Copilot Actual: Aggregated AuditBenchmarkLog dollar expenditure.
 */
export function calculateRoiEconomics({
  totalDocuments = 0,
  totalQueries = 0,
  totalCostUsd = 0.0,
} = {}) {
  const docCount = Number(totalDocuments) || 0;
  const queryCount = Number(totalQueries) || 0;
  const actualCost = Math.max(0, Number(totalCostUsd) || 0.0);

  const manualCost = docCount * 25.0;
  const frontierCost = queryCount * 0.08;

  const savingsVsManualPct =
    manualCost > 0
      ? Math.max(0, ((manualCost - actualCost) / manualCost) * 100)
      : 0.0;

  const savingsVsFrontierPct =
    frontierCost > 0
      ? Math.max(0, ((frontierCost - actualCost) / frontierCost) * 100)
      : 0.0;

  const capitalPreservedUsd = Math.max(0, manualCost - actualCost);

  return {
    manualCost,
    frontierCost,
    actualCost,
    savingsVsManualPct,
    savingsVsFrontierPct,
    capitalPreservedUsd,
  };
}
