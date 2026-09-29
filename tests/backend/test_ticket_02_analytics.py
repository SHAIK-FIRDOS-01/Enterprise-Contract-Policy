"""
TICKET-02: Telemetry Engine and AuditBenchmarkLog Test Suite.
Verifies model creation, track_telemetry context manager, Groq pricing, and analytics summary API.
"""
import time
import pytest
from decimal import Decimal
from rest_framework.test import APIClient

from apps.analytics.models import AuditBenchmarkLog, OperationType
from apps.analytics.services.telemetry import (
    track_telemetry,
    calculate_groq_cost,
    GROQ_RATE_TABLE,
)


@pytest.mark.django_db
def test_audit_benchmark_log_model_creation() -> None:
    """Test 1: Verify model creation, UUID primary key generation, and field defaults."""
    log = AuditBenchmarkLog.objects.create(
        operation=OperationType.RRF_RETRIEVAL,
        model_name="all-MiniLM-L6-v2",
        duration_ms=45.2,
        prompt_tokens=100,
        completion_tokens=0,
        total_tokens=100,
        estimated_cost_usd=Decimal("0.000000"),
        status="SUCCESS",
        metadata={"k": 60, "limit": 10},
    )

    assert log.id is not None
    assert len(str(log.id)) == 36  # Valid UUID string format
    assert log.operation == OperationType.RRF_RETRIEVAL
    assert log.status == "SUCCESS"
    assert log.error_message is None
    assert log.metadata.get("k") == 60
    assert log.created_at is not None


@pytest.mark.django_db
def test_track_telemetry_records_success() -> None:
    """Test 2: Test track_telemetry records execution time and persists success log."""
    initial_count = AuditBenchmarkLog.objects.count()

    with track_telemetry(
        operation=OperationType.LLM_SYNTHESIS,
        model_name="llama-3.3-70b-versatile",
        metadata={"doc_id": "test-doc-123"},
    ) as tracker:
        time.sleep(0.02)  # Simulate 20ms of work
        tracker.set_tokens(prompt_tokens=500, completion_tokens=150)

    assert AuditBenchmarkLog.objects.count() == initial_count + 1
    log = AuditBenchmarkLog.objects.latest("created_at")

    assert log.operation == OperationType.LLM_SYNTHESIS
    assert log.model_name == "llama-3.3-70b-versatile"
    assert log.status == "SUCCESS"
    assert log.duration_ms >= 15.0  # Measured at least ~20ms
    assert log.prompt_tokens == 500
    assert log.completion_tokens == 150
    assert log.total_tokens == 650
    assert log.estimated_cost_usd > Decimal("0.000000")
    assert log.metadata.get("doc_id") == "test-doc-123"


@pytest.mark.django_db
def test_track_telemetry_captures_failure_and_reraises() -> None:
    """Test 3: Test track_telemetry catches exceptions, logs FAILED with traceback, and re-raises."""
    initial_count = AuditBenchmarkLog.objects.count()

    with pytest.raises(ValueError, match="Simulated synthesis failure"):
        with track_telemetry(
            operation=OperationType.LLM_SYNTHESIS,
            model_name="llama-3.3-70b-versatile",
            metadata={"step": "generation"},
        ):
            time.sleep(0.01)
            raise ValueError("Simulated synthesis failure")

    assert AuditBenchmarkLog.objects.count() == initial_count + 1
    log = AuditBenchmarkLog.objects.latest("created_at")

    assert log.operation == OperationType.LLM_SYNTHESIS
    assert log.status == "FAILED"
    assert log.error_message is not None
    assert "ValueError: Simulated synthesis failure" in log.error_message
    assert log.duration_ms > 0.0


def test_calculate_groq_cost() -> None:
    """Test 4: Test calculate_groq_cost accurately computes dollar values per rate table."""
    # Llama 3.3 70b versatile rates:
    # prompt: $0.59 per 1M tokens ($0.00000059 / token)
    # completion: $0.79 per 1M tokens ($0.00000079 / token)
    cost = calculate_groq_cost(
        model_name="llama-3.3-70b-versatile",
        prompt_tokens=1_000_000,
        completion_tokens=1_000_000,
    )
    expected = Decimal("0.590000") + Decimal("0.790000")
    assert cost == expected

    # Embedding models (local) cost $0.00
    embedding_cost = calculate_groq_cost(
        model_name="sentence-transformers/all-MiniLM-L6-v2",
        prompt_tokens=50_000,
        completion_tokens=0,
    )
    assert embedding_cost == Decimal("0.000000")


@pytest.mark.django_db
def test_get_benchmarks_summary_api() -> None:
    """Test 5: Test GET /api/benchmarks/summary/ returns aggregate statistics."""
    # Seed logs
    AuditBenchmarkLog.objects.create(
        operation=OperationType.INGEST_CHUNK_PARSE,
        model_name="PyMuPDF",
        duration_ms=120.0,
        status="SUCCESS",
    )
    AuditBenchmarkLog.objects.create(
        operation=OperationType.LLM_SYNTHESIS,
        model_name="llama-3.3-70b-versatile",
        duration_ms=450.0,
        prompt_tokens=1000,
        completion_tokens=200,
        total_tokens=1200,
        estimated_cost_usd=Decimal("0.000748"),
        status="SUCCESS",
    )
    AuditBenchmarkLog.objects.create(
        operation=OperationType.RRF_RETRIEVAL,
        model_name="pgvector+tsvector",
        duration_ms=35.0,
        status="FAILED",
        error_message="Connection timed out",
    )

    client = APIClient()
    response = client.get("/api/benchmarks/summary/")
    response_canonical = client.get("/api/analytics/benchmarks/summary/")

    assert response.status_code == 200
    assert response_canonical.status_code == 200
    data = response.json()
    assert data["total_operations"] == 3
    assert data["system_health"]["failed_operations"] == 1
    assert data["system_health"]["successful_operations"] == 2
    assert "INGEST_CHUNK_PARSE" in data["operations_breakdown"]
    assert "LLM_SYNTHESIS" in data["operations_breakdown"]
    assert data["totals"]["total_tokens"] == 1200
    assert float(data["totals"]["total_cost_usd"]) > 0.0
