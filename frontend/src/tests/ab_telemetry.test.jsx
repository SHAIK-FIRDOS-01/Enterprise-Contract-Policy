import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ComparativeRoiMatrix from '../components/telemetry/ComparativeRoiMatrix';
import api from '../services/api';

describe('Ticket 20: A/B Comparative Telemetry & Cost/Latency ROI Dashboard', () => {
  const mockComparisonData = {
    system_1: {
      total_queries: 45,
      avg_latency_ms: 42.5,
      total_tokens: 3150,
      total_cost_usd: '0.000000',
      resolution_rate: 0.375,
    },
    system_2: {
      total_queries: 75,
      avg_latency_ms: 1180.2,
      total_tokens: 112500,
      total_cost_usd: '0.076500',
      resolution_rate: 0.625,
    },
    frontier_baseline: {
      total_queries: 30,
      avg_latency_ms: 1340.0,
      total_tokens: 49500,
      total_cost_usd: '0.033660',
    },
    dual_system_summary: {
      total_queries: 120,
      avg_latency_ms: 753.5,
      total_tokens: 115650,
      total_cost_usd: '0.076500',
    },
    roi_metrics: {
      tokens_saved: 67500,
      dollar_savings: '0.045900',
      latency_reduction_pct: 96.4,
      cost_reduction_pct: 37.5,
    },
    concurrency_metrics: {
      avg_speedup_ratio: 2.45,
      total_dispatches: 120,
      worker_timeout_rate: 0.008,
      straggler_frequency: 0.025,
      avg_wall_clock_ms: 68.4,
      avg_worker_sum_ms: 167.5,
    },
    latency_decomposition: [
      { document: 'Doc A', avg_retrieval_ms: 64.2 },
      { document: 'Doc B', avg_retrieval_ms: 72.8 },
      { document: 'Doc C', avg_retrieval_ms: 67.5 },
      { document: 'Doc D', avg_retrieval_ms: 69.1 },
    ],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders comparative KPI cards: Dual-System vs Frontier Baseline with latency and dollar savings', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: mockComparisonData });

    render(<ComparativeRoiMatrix initialData={mockComparisonData} />);

    // 1. Verify Headers & Titles
    expect(screen.getByText(/A\/B COMPARATIVE ROI MATRIX/i)).toBeTruthy();
    expect(screen.getByText(/DUAL-SYSTEM MODE/i)).toBeTruthy();
    expect(screen.getByText(/FRONTIER-ONLY BASELINE/i)).toBeTruthy();

    // 2. Verify Average Latencies (System 1 fast path 42ms vs Frontier 1,340ms)
    expect(screen.getByTestId('fast-path-latency')).toBeTruthy();
    expect(screen.getByTestId('fast-path-latency').textContent).toContain('42.5ms');
    expect(screen.getByTestId('frontier-latency').textContent).toContain('1340.0ms');

    // 3. Verify Latency Reduction Percentage
    expect(screen.getByText(/96.4%/i)).toBeTruthy();

    // 4. Verify Cumulative Dollar Cost Savings
    expect(screen.getByTestId('dollar-savings-counter')).toBeTruthy();
    expect(screen.getByTestId('dollar-savings-counter').textContent).toContain('$0.04590');

    // 5. Verify Tokens Saved
    expect(screen.getByText(/67,500/i)).toBeTruthy();
  });

  it('displays parallel concurrency efficiency speedup factor and worker health stats', async () => {
    render(<ComparativeRoiMatrix initialData={mockComparisonData} />);

    // 1. Concurrency Speedup Card
    const speedupEl = screen.getByTestId('concurrency-speedup');
    expect(speedupEl).toBeTruthy();
    expect(speedupEl.textContent).toContain('2.45x');

    // 2. Worker Timeout and Straggler frequency
    expect(screen.getByText(/0.8% TIMEOUT RATE/i)).toBeTruthy();
    expect(screen.getByText(/2.5% STRAGGLER FREQ/i)).toBeTruthy();
  });

  it('renders latency decomposition chart with per-document worker retrieval breakdown', async () => {
    render(<ComparativeRoiMatrix initialData={mockComparisonData} />);

    // 1. Verify latency decomposition container
    expect(screen.getByTestId('latency-decomposition-graph')).toBeTruthy();

    // 2. Verify document bars exist for Doc A, Doc B, Doc C, Doc D
    expect(screen.getByText('Doc A')).toBeTruthy();
    expect(screen.getByText('Doc B')).toBeTruthy();
    expect(screen.getByText('Doc C')).toBeTruthy();
    expect(screen.getByText('Doc D')).toBeTruthy();
    expect(screen.getByText(/64.2ms/i)).toBeTruthy();
    expect(screen.getByText(/72.8ms/i)).toBeTruthy();
  });

  it('fetches fresh telemetry on manual refresh click', async () => {
    const getSpy = vi.spyOn(api, 'get').mockResolvedValue({ data: mockComparisonData });

    render(<ComparativeRoiMatrix />);

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/analytics/benchmarks/ab-comparison/');
    });

    const refreshBtn = screen.getByTestId('refresh-ab-matrix-btn');
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledTimes(2);
    });
  });
});
