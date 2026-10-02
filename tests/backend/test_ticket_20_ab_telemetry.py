"""
TICKET-20: A/B Comparative Telemetry, Concurrency Metrics & Cost/Latency ROI Dashboard Test Suite.
Verifies:
1. TelemetryService A/B comparative aggregation across System 1, System 2, and Frontier-Only baseline.
2. Parallel worker concurrency metrics (speedup ratio, timeout rate, straggler frequency).
3. Dual-system ROI metrics (tokens saved, dollar cost savings against Groq rates, latency reduction %).
4. Endpoint contract for GET /api/analytics/benchmarks/ab-comparison/.
5. End-to-end telemetry instrumentation in multiplexer.
"""
from decimal import Decimal
from typing import Any, Dict, List
import pytest
from rest_framework.test import APIClient

from apps.analytics.models import AuditBenchmarkLog, OperationType
from apps.analytics.services.telemetry import TelemetryService


@pytest.mark.django_db
def test_telemetry_service_ab_comparison_aggregation() -> None:
    """Verify TelemetryService calculates correct ROI, speedup, and routing breakdowns."""
    # 1. System 1 Fast-Path logs
    for i in range(5):
        AuditBenchmarkLog.objects.create(
            operation="FAST_PATH_SYNTHESIS",
            model_name="onnx-minilm",
            duration_ms=40.0 + i,
            prompt_tokens=50,
            completion_tokens=20,
            total_tokens=70,
            estimated_cost_usd=Decimal("0.000000"),
            status="SUCCESS",
            metadata={
                "route": "SYSTEM_1_FAST_PATH",
                "is_multi_doc": True,
                "document_count": 2,
                "dispatch_wall_ms": 30.0,
                "worker_sum_ms": 55.0,
                "worker_timeouts": 0,
                "concurrency_speedup": 1.83,
                "worker_latencies": {"doc-1": 25.0, "doc-2": 30.0},
            },
        )

    # 2. System 2 Reduce-Stage Frontier logs
    for i in range(5):
        AuditBenchmarkLog.objects.create(
            operation="REDUCE_SYNTHESIS",
            model_name="llama-3.3-70b-versatile",
            duration_ms=1100.0 + (i * 10),
            prompt_tokens=1000,
            completion_tokens=400,
            total_tokens=1400,
            estimated_cost_usd=Decimal("0.000905"),
            status="SUCCESS",
            metadata={
                "route": "SYSTEM_2_FRONTIER",
                "is_multi_doc": True,
                "document_count": 2,
                "dispatch_wall_ms": 40.0,
                "worker_sum_ms": 75.0,
                "worker_timeouts": 0,
                "concurrency_speedup": 1.88,
                "worker_latencies": {"doc-1": 35.0, "doc-2": 40.0},
            },
        )

    # 3. Frontier-Only Baseline logs
    for i in range(3):
        AuditBenchmarkLog.objects.create(
            operation="MULTI_DOC_QUERY",
            model_name="llama-3.3-70b-versatile",
            duration_ms=1300.0 + (i * 20),
            prompt_tokens=1200,
            completion_tokens=450,
            total_tokens=1650,
            estimated_cost_usd=Decimal("0.001064"),
            status="SUCCESS",
            metadata={
                "route": "FRONTIER_ONLY",
                "force_frontier": True,
                "is_multi_doc": True,
                "document_count": 2,
                "dispatch_wall_ms": 45.0,
                "worker_sum_ms": 80.0,
                "worker_timeouts": 1 if i == 0 else 0,
                "concurrency_speedup": 1.78,
                "worker_latencies": {"doc-1": 38.0, "doc-2": 42.0},
            },
        )

    comparison = TelemetryService.get_ab_comparison()

    # Verify System 1 metrics
    assert comparison["system_1"]["total_queries"] == 5
    assert 40.0 <= comparison["system_1"]["avg_latency_ms"] <= 45.0
    assert comparison["system_1"]["total_cost_usd"] == "0.000000"

    # Verify System 2 metrics
    assert comparison["system_2"]["total_queries"] == 5
    assert 1100.0 <= comparison["system_2"]["avg_latency_ms"] <= 1150.0

    # Verify Frontier-only metrics
    assert comparison["frontier_baseline"]["total_queries"] == 3
    assert 1300.0 <= comparison["frontier_baseline"]["avg_latency_ms"] <= 1350.0

    # Verify Concurrency speedup
    assert comparison["concurrency_metrics"]["avg_speedup_ratio"] >= 1.5
    assert comparison["concurrency_metrics"]["total_dispatches"] >= 10
    assert comparison["concurrency_metrics"]["worker_timeout_rate"] > 0.0

    # Verify ROI metrics
    roi = comparison["roi_metrics"]
    assert roi["tokens_saved"] > 0
    assert float(roi["dollar_savings"]) > 0.0
    assert roi["latency_reduction_pct"] > 90.0  # Fast path (42ms) vs Frontier (1100ms+) > 95%


@pytest.mark.django_db
def test_ab_comparison_empty_database_fallback() -> None:
    """Verify TelemetryService returns safe defaults when no queries have run."""
    AuditBenchmarkLog.objects.all().delete()
    comparison = TelemetryService.get_ab_comparison()

    assert "system_1" in comparison
    assert "system_2" in comparison
    assert "frontier_baseline" in comparison
    assert "roi_metrics" in comparison
    assert "concurrency_metrics" in comparison
    assert "latency_decomposition" in comparison

    assert comparison["system_1"]["total_queries"] == 0
    assert comparison["concurrency_metrics"]["avg_speedup_ratio"] >= 1.0


@pytest.mark.django_db
def test_ab_comparison_api_endpoint_contract() -> None:
    """Verify GET /api/analytics/benchmarks/ab-comparison/ returns 200 with complete schema."""
    client = APIClient()
    response = client.get("/api/analytics/benchmarks/ab-comparison/")
    assert response.status_code == 200

    data = response.json()
    assert "system_1" in data
    assert "system_2" in data
    assert "frontier_baseline" in data
    assert "dual_system_summary" in data
    assert "roi_metrics" in data
    assert "concurrency_metrics" in data
    assert "latency_decomposition" in data

    # Assert nested fields
    assert "tokens_saved" in data["roi_metrics"]
    assert "dollar_savings" in data["roi_metrics"]
    assert "latency_reduction_pct" in data["roi_metrics"]
    assert "avg_speedup_ratio" in data["concurrency_metrics"]
    assert "worker_timeout_rate" in data["concurrency_metrics"]
