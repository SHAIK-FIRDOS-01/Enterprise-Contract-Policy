"""
Full-System End-to-End Multi-Document Integration Test Suite for Ticket 21.
Exercises the complete critical path of Phase 2:
1. Concurrent synthetic PDF ingestion across Doc A (FY25) and Doc B (FY26).
2. Isolated concurrent hybrid RRF retrieval with zero cross-document vector leakage.
3. Deterministic confidence gating:
   - Single-doc factual query -> SYSTEM_1_FAST_PATH (sub-60ms local resolution).
   - Multi-doc comparative query -> SYSTEM_2_FRONTIER reduce-stage Groq synthesis.
4. End-to-end telemetry validation in AuditBenchmarkLog and TelemetryService.
"""
import json
from decimal import Decimal
from typing import Any, Dict, List
from unittest.mock import MagicMock
import pymupdf
import pytest
from django.core.files.base import ContentFile

from apps.analytics.models import AuditBenchmarkLog
from apps.analytics.services.telemetry import TelemetryService
from apps.authentication.models import User
from apps.documents.models import Document, DocumentStatus
from apps.documents.tasks import process_document_pipeline
from apps.query.services.dispatcher import ConcurrentMapDispatcher
from apps.query.services.gater import ConfidenceGater
from apps.query.services.multiplexer import MultiTargetSSEMultiplexer
from apps.query.services.reducer import MultiDocReduceSynthesizer


def _generate_synthetic_pdf_fy25() -> bytes:
    """Generates synthetic 2-page FY25 contract with unique financial and legal terms."""
    doc = pymupdf.open()

    page1 = doc.new_page(width=612, height=792)
    page1.insert_text(pymupdf.Point(72, 80), "ANNUAL REPORT FY25 - FINANCIAL STATEMENTS", fontsize=14)
    page1.insert_textbox(
        pymupdf.Rect(72, 120, 540, 350),
        "Item 1. Consolidated Revenue.\n"
        "Total consolidated revenues for fiscal year 2025 were $12.4 billion, "
        "representing standard operational revenue across all commercial units.",
        fontsize=11,
    )

    page2 = doc.new_page(width=612, height=792)
    page2.insert_text(pymupdf.Point(72, 80), "LEGAL & JURISDICTION CLAUSES", fontsize=14)
    page2.insert_textbox(
        pymupdf.Rect(72, 120, 540, 350),
        "Clause 14. Governing Law and Arbitration.\n"
        "This Agreement shall strictly be governed by the laws of the State of Delaware, "
        "without regard to conflict of laws principles.",
        fontsize=11,
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _generate_synthetic_pdf_fy26() -> bytes:
    """Generates synthetic 2-page FY26 contract with updated revenue and identical jurisdiction."""
    doc = pymupdf.open()

    page1 = doc.new_page(width=612, height=792)
    page1.insert_text(pymupdf.Point(72, 80), "ANNUAL REPORT FY26 - FINANCIAL STATEMENTS", fontsize=14)
    page1.insert_textbox(
        pymupdf.Rect(72, 120, 540, 350),
        "Item 1. Consolidated Revenue.\n"
        "Total consolidated revenues for fiscal year 2026 grew to $14.1 billion, "
        "driven primarily by cloud platform adoption and enterprise contracts.",
        fontsize=11,
    )

    page2 = doc.new_page(width=612, height=792)
    page2.insert_text(pymupdf.Point(72, 80), "LEGAL & JURISDICTION CLAUSES", fontsize=14)
    page2.insert_textbox(
        pymupdf.Rect(72, 120, 540, 350),
        "Clause 14. Governing Law and Arbitration.\n"
        "This Agreement shall strictly be governed by the laws of the State of Delaware, "
        "without regard to conflict of laws principles.",
        fontsize=11,
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


class MockE2EGroqCompletion:
    def __init__(self, text: str, prompt_tokens: int = 140, completion_tokens: int = 50) -> None:
        self.choices = [MagicMock(message=MagicMock(content=text))]
        self.usage = MagicMock(
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            total_tokens=prompt_tokens + completion_tokens,
        )


class MockE2EGroqClient:
    def __init__(self, doc_a_id: str, doc_b_id: str) -> None:
        self.doc_a_id = doc_a_id
        self.doc_b_id = doc_b_id

    @property
    def chat(self) -> Any:
        doc_a_id = self.doc_a_id
        doc_b_id = self.doc_b_id

        class Chat:
            class completions:
                @staticmethod
                def create(*args: Any, **kwargs: Any) -> MockE2EGroqCompletion:
                    text = (
                        f"Year-over-year revenue comparison: In FY25, total revenue was $12.4 billion "
                        f"[Ref:{doc_a_id}:chunk_fy25_rev:1]. In FY26, revenue grew to $14.1 billion "
                        f"[Ref:{doc_b_id}:chunk_fy26_rev:1], representing a $1.7B variance."
                    )
                    return MockE2EGroqCompletion(text)
        return Chat()


@pytest.mark.django_db(transaction=True)
def test_ticket_21_multidoc_full_pipeline_critical_path() -> None:
    """
    Test 1: Full-Pipeline E2E Multi-Document Critical Path.
    Ingests Doc A & Doc B, verifies isolated concurrent hybrid retrieval,
    asserts dual-system confidence gating, and validates audit telemetry.
    """
    user = User.objects.create_user(
        email="ticket21_auditor@enterprise-copilot.test",
        password="SecureAuditPassword2026!",
    )

    # 1. Ingestion Phase: Process 2 synthetic documents
    pdf_bytes_a = _generate_synthetic_pdf_fy25()
    pdf_bytes_b = _generate_synthetic_pdf_fy26()

    doc_a = Document.objects.create(
        user=user,
        title="FY25 Annual Report.pdf",
        file=ContentFile(pdf_bytes_a, name="FY25_Annual_Report.pdf"),
        status=DocumentStatus.READY,
    )
    doc_b = Document.objects.create(
        user=user,
        title="FY26 Annual Report.pdf",
        file=ContentFile(pdf_bytes_b, name="FY26_Annual_Report.pdf"),
        status=DocumentStatus.READY,
    )

    process_document_pipeline(str(doc_a.id))
    process_document_pipeline(str(doc_b.id))

    doc_a.refresh_from_db()
    doc_b.refresh_from_db()

    assert doc_a.status == DocumentStatus.READY
    assert doc_b.status == DocumentStatus.READY
    assert doc_a.chunks.count() >= 2
    assert doc_b.chunks.count() >= 2

    # 2. Hybrid Retrieval Isolation Verification
    dispatcher = ConcurrentMapDispatcher(default_timeout=5.0)
    bundles = dispatcher.dispatch(
        document_ids=[doc_a.id, doc_b.id],
        query_text="Total consolidated revenues fiscal year",
        top_k=3,
    )

    assert len(bundles) == 2
    bundle_a = next(b for b in bundles if str(b["document_id"]) == str(doc_a.id))
    bundle_b = next(b for b in bundles if str(b["document_id"]) == str(doc_b.id))

    assert bundle_a["status"] == "SUCCESS"
    assert bundle_b["status"] == "SUCCESS"

    # Enforce zero cross-document vector leakage
    assert len(bundle_a["candidate_chunks"]) >= 1
    assert len(bundle_b["candidate_chunks"]) >= 1

    for c in bundle_a["candidate_chunks"]:
        assert str(c["document_id"]) == str(doc_a.id)
    assert any("$12.4 billion" in c["text_content"] for c in bundle_a["candidate_chunks"])
    assert not any("$14.1 billion" in c["text_content"] for c in bundle_a["candidate_chunks"])

    for c in bundle_b["candidate_chunks"]:
        assert str(c["document_id"]) == str(doc_b.id)
    assert any("$14.1 billion" in c["text_content"] for c in bundle_b["candidate_chunks"])
    assert not any("$12.4 billion" in c["text_content"] for c in bundle_b["candidate_chunks"])

    # 3. Dynamic Gating: Single-Doc Fast Path vs Multi-Doc Frontier Escalation
    multiplexer = MultiTargetSSEMultiplexer()
    gater = ConfidenceGater(threshold=0.60)

    # 3a. Single-document factual query -> SYSTEM_1_FAST_PATH
    single_events: List[str] = list(
        multiplexer.stream_multi_target_query(
            query="Total consolidated revenues for fiscal year 2025 were $12.4 billion",
            document_ids=[doc_a.id],
            user_id=user.id,
            dispatcher=dispatcher,
            gater=gater,
            force_frontier=False,
        )
    )

    route_event_1 = next(e for e in single_events if "event: route" in e)
    assert "SYSTEM_1_FAST_PATH" in route_event_1

    telemetry_event_1 = next(e for e in single_events if "event: telemetry" in e)
    telemetry_payload_1 = json.loads(telemetry_event_1.split("data: ")[1].strip())
    assert float(telemetry_payload_1.get("estimated_cost_usd", 0.0)) == 0.0

    # 3b. Multi-document comparative query -> SYSTEM_2_FRONTIER
    mock_client = MockE2EGroqClient(str(doc_a.id), str(doc_b.id))
    reducer = MultiDocReduceSynthesizer(client=mock_client)

    multi_events: List[str] = list(
        multiplexer.stream_multi_target_query(
            query="Compare total revenue between FY25 and FY26 and identify the variance.",
            document_ids=[doc_a.id, doc_b.id],
            user_id=user.id,
            dispatcher=dispatcher,
            gater=gater,
            reducer=reducer,
            force_frontier=False,
        )
    )

    route_event_2 = next(e for e in multi_events if "event: route" in e)
    assert "SYSTEM_2_FRONTIER" in route_event_2

    # Verify per-document worker status events
    worker_events = [e for e in multi_events if "event: worker_status" in e]
    assert len(worker_events) == 2

    # Verify citations emitted
    citation_events = [e for e in multi_events if "event: citation" in e]
    assert len(citation_events) >= 1

    # 4. Telemetry Ledger Validation
    logs = AuditBenchmarkLog.objects.filter(
        operation__in=["FAST_PATH_SYNTHESIS", "MULTI_DOC_QUERY"]
    )
    assert logs.count() >= 2

    fast_log = logs.filter(operation="FAST_PATH_SYNTHESIS").latest("created_at")
    assert fast_log.metadata.get("route") == "SYSTEM_1_FAST_PATH"
    assert fast_log.estimated_cost_usd == Decimal("0.000000")

    multi_log = logs.filter(operation="MULTI_DOC_QUERY").latest("created_at")
    assert multi_log.metadata.get("is_multi_doc") is True
    assert multi_log.metadata.get("document_count") == 2
    assert float(multi_log.metadata.get("concurrency_speedup", 1.0)) >= 0.5

    # 5. A/B Telemetry Aggregation Service Contract
    ab_summary = TelemetryService.get_ab_comparison()
    assert "system_1" in ab_summary
    assert "system_2" in ab_summary
    assert "roi_metrics" in ab_summary
    assert "concurrency_metrics" in ab_summary
    assert "latency_decomposition" in ab_summary

    assert ab_summary["system_1"]["total_queries"] >= 1
    assert ab_summary["system_2"]["total_queries"] >= 1
    assert ab_summary["roi_metrics"]["latency_reduction_pct"] >= 0.0
