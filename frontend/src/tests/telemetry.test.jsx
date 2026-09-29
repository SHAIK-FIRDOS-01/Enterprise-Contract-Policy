import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MetricStatCard from '../components/telemetry/MetricStatCard';
import PipelineLatencyBreakdown from '../components/telemetry/PipelineLatencyBreakdown';
import { calculateRoiEconomics } from '../services/analytics';

describe('Ticket 12: Operational Telemetry & ROI Analytics Suite', () => {
  // Test 1: MetricStatCard renders label, tabular-nums value, and subtext
  describe('MetricStatCard', () => {
    it('renders label, tabular-nums value, and secondary subtext cleanly', () => {
      render(
        <MetricStatCard
          label="GROQ TOKEN INVOCATIONS"
          value="452,100"
          subtext="+14.2% vs previous 24h baseline"
          indicatorColor="emerald"
        />
      );

      expect(screen.getByText('GROQ TOKEN INVOCATIONS')).toBeTruthy();
      expect(screen.getByText('452,100')).toBeTruthy();
      expect(screen.getByText('+14.2% vs previous 24h baseline')).toBeTruthy();

      const valElement = screen.getByText('452,100');
      expect(valElement.className).toContain('tabular-nums');
      expect(valElement.className).toContain('font-mono');
    });
  });

  // Test 2: ROI calculation helper computes correct savings and preserves capital
  describe('calculateRoiEconomics', () => {
    it('computes correct comparative savings percentages and capital preserved', () => {
      const economics = calculateRoiEconomics({
        totalDocuments: 10,
        totalQueries: 100,
        totalCostUsd: 0.05,
      });

      // Manual Legal Review: 10 docs * $25 = $250.00
      expect(economics.manualCost).toBeCloseTo(250.0, 1);
      // Naive Frontier LLM: 100 queries * $0.08 = $8.00
      expect(economics.frontierCost).toBeCloseTo(8.0, 1);
      // Actual Copilot cost: $0.05
      expect(economics.actualCost).toBeCloseTo(0.05, 2);

      // Savings vs Manual Review: (250 - 0.05) / 250 = 99.98%
      expect(economics.savingsVsManualPct).toBeGreaterThan(99.0);
      // Savings vs Frontier LLM: (8 - 0.05) / 8 = 99.375%
      expect(economics.savingsVsFrontierPct).toBeGreaterThan(99.0);
      // Capital Preserved: $250.00 - $0.05 = $249.95
      expect(economics.capitalPreservedUsd).toBeCloseTo(249.95, 2);
    });

    it('handles zero values without NaN or divide-by-zero errors', () => {
      const zeroEconomics = calculateRoiEconomics({
        totalDocuments: 0,
        totalQueries: 0,
        totalCostUsd: 0.0,
      });

      expect(zeroEconomics.manualCost).toBe(0);
      expect(zeroEconomics.frontierCost).toBe(0);
      expect(zeroEconomics.actualCost).toBe(0);
      expect(zeroEconomics.savingsVsManualPct).toBe(0);
      expect(zeroEconomics.savingsVsFrontierPct).toBe(0);
      expect(zeroEconomics.capitalPreservedUsd).toBe(0);
    });
  });

  // Test 3: PipelineLatencyBreakdown stage labels and zero-division handling
  describe('PipelineLatencyBreakdown', () => {
    it('renders all pipeline stage labels and handles zero-division cleanly', () => {
      // 1. With realistic benchmark data
      const mockBreakdown = {
        INGEST_CHUNK_PARSE: { avg_duration_ms: 120.0, count: 5 },
        EMBEDDING_GEN: { avg_duration_ms: 45.0, count: 5 },
        RRF_RETRIEVAL: { avg_duration_ms: 25.0, count: 10 },
        LLM_SYNTHESIS: { avg_duration_ms: 450.0, count: 10 },
        CITATION_VERIFY: { avg_duration_ms: 15.0, count: 10 },
      };

      const { rerender } = render(
        <PipelineLatencyBreakdown operationsBreakdown={mockBreakdown} />
      );

      expect(screen.getByText(/PyMuPDF Chunking/i)).toBeTruthy();
      expect(screen.getByText(/Dense Embedding/i)).toBeTruthy();
      expect(screen.getByText(/Hybrid RRF Search/i)).toBeTruthy();
      expect(screen.getByText(/Groq LLM Synthesis/i)).toBeTruthy();
      expect(screen.getByText(/Citation Validator/i)).toBeTruthy();

      // Total average pipeline duration: 120 + 45 + 25 + 450 + 15 = 655ms
      expect(screen.getByText(/655/)).toBeTruthy();

      // 2. Empty operations breakdown (zero division test)
      rerender(<PipelineLatencyBreakdown operationsBreakdown={{}} />);
      expect(screen.getAllByText(/0.0ms/i).length).toBeGreaterThan(0);
    });
  });
});
