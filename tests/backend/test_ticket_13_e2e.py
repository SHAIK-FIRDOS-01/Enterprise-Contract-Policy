"""
Tests for TICKET-13: Full-Pipeline End-to-End Integration Test Suite.
Exercises complete critical path without mocking database state:
1. User registration & HttpOnly cookie issuance (apps/authentication)
2. PDF upload and asynchronous ingestion task execution (apps/documents)
3. Hybrid RRF search retrieval (apps/search)
4. Groq SSE synthesis & deterministic citation verification (apps/query)
5. Audit telemetry aggregation across all pipeline stages (apps/analytics)
"""
import json
from decimal import Decimal
from typing import Any, Dict, List, Optional
import pymupdf
import pytest
from django.core.files.base import ContentFile
from rest_framework.test import APIClient

from apps.analytics.models import AuditBenchmarkLog, OperationType
from apps.authentication.models import User
from apps.documents.models import Document, DocumentChunk, DocumentStatus
from apps.documents.tasks import process_document_pipeline


class MockDelta:
    def __init__(self, content: Optional[str]) -> None:
        self.content = content


class MockChoice:
    def __init__(self, content: Optional[str]) -> None:
        self.delta = MockDelta(content)


class MockUsage:
    def __init__(self, prompt_tokens: int = 150, completion_tokens: int = 40) -> None:
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens
        self.total_tokens = prompt_tokens + completion_tokens


class MockChunk:
    def __init__(self, content: Optional[str], usage: Optional[MockUsage] = None) -> None:
        self.choices = [MockChoice(content)] if content is not None else []
        self.usage = usage


class MockChatCompletions:
    def __init__(
        self,
        tokens: Optional[List[str]] = None,
        prompt_tokens: int = 150,
        completion_tokens: int = 40,
    ) -> None:
        self.tokens = tokens or [
            "Pursuant ", "to ", "Clause ", "1, ", "the ", "limitation ", "of ", "liability ",
            "is ", "strictly ", "capped ", "at ", "five ", "hundred ", "thousand ",
            "dollars ", "($500,000) ", "[Ref:1]. ",
            "Furthermore, ", "under ", "Clause ", "2, ", "the ", "governing ", "law ",
            "is ", "the ", "State ", "of ", "New ", "York ", "[Ref:2].",
        ]
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens

    def create(self, **kwargs: Any) -> Any:
        chunks = [MockChunk(t) for t in self.tokens]
        chunks.append(MockChunk(None, usage=MockUsage(self.prompt_tokens, self.completion_tokens)))
        return iter(chunks)


class MockGroqClient:
    def __init__(
        self,
        tokens: Optional[List[str]] = None,
        prompt_tokens: int = 150,
        completion_tokens: int = 40,
    ) -> None:
        self.chat = type(
            "Chat",
            (),
            {"completions": MockChatCompletions(tokens, prompt_tokens, completion_tokens)},
        )()


def _generate_synthetic_multi_page_contract_pdf() -> bytes:
    """Generate in-memory 3-page synthetic legal contract with distinct, unambiguous clauses."""
    doc = pymupdf.open()

    # Page 1: Clause 1 - Limitation of Liability
    page1 = doc.new_page(width=612, height=792)
    page1.insert_text(
        pymupdf.Point(72, 80),
        "MASTER SERVICES AGREEMENT",
        fontsize=16,
    )
    page1.insert_textbox(
        pymupdf.Rect(72, 120, 540, 400),
        "Clause 1: Limitation of Liability.\n"
        "The total aggregate liability of either party under this Agreement shall strictly "
        "be capped at five hundred thousand dollars ($500,000). Neither party shall be liable "
        "to the other for indirect, special, punitive, or consequential damages.",
        fontsize=11,
    )

    # Page 2: Clause 2 - Governing Law
    page2 = doc.new_page(width=612, height=792)
    page2.insert_text(
        pymupdf.Point(72, 80),
        "GENERAL TERMS AND JURISDICTION",
        fontsize=16,
    )
    page2.insert_textbox(
        pymupdf.Rect(72, 120, 540, 400),
        "Clause 2: Governing Law and Dispute Resolution.\n"
        "This Agreement shall be governed by, interpreted, and construed in accordance with "
        "the substantive laws of the State of New York, excluding its conflicts of law principles.",
        fontsize=11,
    )

    # Page 3: Clause 3 - Termination for Convenience
    page3 = doc.new_page(width=612, height=792)
    page3.insert_text(
        pymupdf.Point(72, 80),
        "TERM AND TERMINATION CONDITIONS",
        fontsize=16,
    )
    page3.insert_textbox(
        pymupdf.Rect(72, 120, 540, 400),
        "Clause 3: Termination for Convenience.\n"
        "Either party may terminate this Agreement without cause for convenience upon providing "
        "thirty (30) days prior written notice to the other party.",
        fontsize=11,
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.mark.django_db
def test_ticket_13_end_to_end_critical_path(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    End-to-End Critical Path Verification:
    Stage 1: User Registration & Login with HttpOnly cookie issuance (apps/authentication)
    Stage 2: Contract PDF Upload and Asynchronous Pipeline Execution (apps/documents)
    Stage 3: Hybrid RRF Search with Normalized Bounding Boxes (apps/search)
    Stage 4: Groq SSE Token Streaming & Verification Engine (apps/query)
    Stage 5: Verification API Endpoint with High-Confidence Grounding (apps/query)
    Stage 6: Comprehensive Benchmark Analytics Telemetry Aggregation (apps/analytics)
    """
    client = APIClient()

    # -------------------------------------------------------------------------
    # Stage 1: User Registration, Login & Session Authentication
    # -------------------------------------------------------------------------
    register_payload = {
        "email": "lead_auditor@enterprise.com",
        "password": "ProductionPassword2026!",
        "role": "AUDITOR",
    }
    reg_res = client.post("/api/auth/register/", data=register_payload, format="json")
    assert reg_res.status_code == 201
    assert "access_token" in reg_res.cookies
    assert "refresh_token" in reg_res.cookies

    # Test login endpoint to trigger AUTH_VERIFY telemetry
    login_payload = {
        "email": "lead_auditor@enterprise.com",
        "password": "ProductionPassword2026!",
    }
    login_res = client.post("/api/auth/login/", data=login_payload, format="json")
    assert login_res.status_code == 200
    assert "access_token" in login_res.cookies
    client.cookies = login_res.cookies  # Ensure cookies persist on client session

    user = User.objects.get(email="lead_auditor@enterprise.com")
    assert user.is_authenticated

    # Verify AUTH_VERIFY telemetry was recorded
    auth_logs = AuditBenchmarkLog.objects.filter(operation=OperationType.AUTH_VERIFY)
    assert auth_logs.exists()

    # -------------------------------------------------------------------------
    # Stage 2: PDF Document Upload and Synchronous Ingestion Execution
    # -------------------------------------------------------------------------
    pdf_bytes = _generate_synthetic_multi_page_contract_pdf()
    pdf_file = ContentFile(pdf_bytes, name="Enterprise_Vendor_Agreement_2026.pdf")

    upload_res = client.post(
        "/api/documents/upload/",
        data={"file": pdf_file, "title": "Enterprise Vendor Agreement 2026"},
        format="multipart",
    )
    assert upload_res.status_code == 202
    doc_id = upload_res.json()["id"]

    # Execute ingestion pipeline synchronously
    process_document_pipeline(str(doc_id))

    # Verify Document state in database
    document = Document.objects.get(id=doc_id)
    assert document.status == DocumentStatus.READY
    assert document.page_count == 3
    assert document.error_message is None

    # Verify DocumentChunk extraction and embeddings
    chunks = DocumentChunk.objects.filter(document=document).order_by("chunk_index")
    assert chunks.count() >= 3

    # Check bounding box points and normalized coordinates [0.0, 1.0]
    for chunk in chunks:
        bbox = chunk.bounding_box
        assert "x0" in bbox and "y0" in bbox and "x1" in bbox and "y1" in bbox
        assert "norm_x0" in bbox and "norm_y0" in bbox and "norm_x1" in bbox and "norm_y1" in bbox
        assert 0.0 <= bbox["norm_x0"] <= 1.0
        assert 0.0 <= bbox["norm_y0"] <= 1.0
        assert 0.0 <= bbox["norm_x1"] <= 1.0
        assert 0.0 <= bbox["norm_y1"] <= 1.0
        assert bbox["norm_x1"] >= bbox["norm_x0"]
        assert bbox["norm_y1"] >= bbox["norm_y0"]
        assert chunk.embedding is not None
        assert len(chunk.embedding) == 384

    # Verify INGEST_CHUNK_PARSE and EMBEDDING_GEN telemetry
    assert AuditBenchmarkLog.objects.filter(operation=OperationType.INGEST_CHUNK_PARSE).exists()
    assert AuditBenchmarkLog.objects.filter(operation=OperationType.EMBEDDING_GEN).exists()

    # -------------------------------------------------------------------------
    # Stage 3: Hybrid Search Retrieval (Dense pgvector + Sparse tsvector RRF)
    # -------------------------------------------------------------------------
    search_payload = {
        "query": "What is the liability cap limitation?",
        "document_id": str(doc_id),
        "top_k": 3,
    }
    search_res = client.post("/api/search/hybrid/", data=search_payload, format="json")
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert isinstance(search_data, list)
    assert len(search_data) >= 1

    top_chunk = search_data[0]
    assert "liability" in top_chunk["text_content"].lower()
    assert top_chunk["bounding_box"] is not None
    assert top_chunk["rrf_score"] > 0.0

    # Verify RRF_RETRIEVAL telemetry was logged
    assert AuditBenchmarkLog.objects.filter(operation=OperationType.RRF_RETRIEVAL).exists()

    # -------------------------------------------------------------------------
    # Stage 4: Groq SSE Token Streaming & Verification Engine
    # -------------------------------------------------------------------------
    mock_groq = MockGroqClient()
    monkeypatch.setattr(
        "apps.query.services.synthesis.GroqSynthesisService.get_client",
        lambda self: mock_groq,
    )
    monkeypatch.setattr(
        "apps.query.views.GroqSynthesisService.get_client",
        lambda self: mock_groq,
    )

    query_payload = {
        "query": "What are the liability cap and governing law conditions?",
        "document_id": str(doc_id),
        "top_k": 3,
        "temperature": 0.1,
    }
    stream_res = client.post("/api/query/stream/", data=query_payload, format="json")
    assert stream_res.status_code == 200
    assert "text/event-stream" in stream_res["Content-Type"]

    raw_stream_content = b"".join(stream_res.streaming_content).decode("utf-8")

    # Assert SSE event structure
    assert "event: metadata" in raw_stream_content
    assert "event: delta" in raw_stream_content
    assert "event: verification" in raw_stream_content
    assert "event: telemetry" in raw_stream_content
    assert "event: done" in raw_stream_content
    assert "[DONE]" in raw_stream_content

    # Verify LLM_SYNTHESIS and CITATION_VERIFY telemetry were recorded
    assert AuditBenchmarkLog.objects.filter(operation=OperationType.LLM_SYNTHESIS).exists()
    assert AuditBenchmarkLog.objects.filter(operation=OperationType.CITATION_VERIFY).exists()

    # -------------------------------------------------------------------------
    # Stage 5: Citation Verification Endpoint (Deterministic Grounding)
    # -------------------------------------------------------------------------
    liability_chunk = chunks.filter(page_number=1).first()
    assert liability_chunk is not None

    verify_payload = {
        "synthesis_text": (
            "The total aggregate liability of either party shall strictly be capped at "
            "five hundred thousand dollars ($500,000) [Ref:1]."
        ),
        "chunks": [
            {
                "chunk_index": 0,
                "text_content": liability_chunk.text_content,
                "bounding_box": liability_chunk.bounding_box,
                "page_number": liability_chunk.page_number,
                "document_id": str(document.id),
                "document_title": document.title,
            }
        ],
    }
    verify_res = client.post("/api/query/verify/", data=verify_payload, format="json")
    assert verify_res.status_code == 200
    verify_data = verify_res.json()

    assert verify_data["total_verified"] == 1
    verified_item = verify_data["results"][0]
    assert verified_item["ref_id"] == 1
    assert verified_item["status"] == "HIGH"
    assert verified_item["confidence_score"] >= 0.75
    assert verified_item["bounding_box"] == liability_chunk.bounding_box

    # -------------------------------------------------------------------------
    # Stage 6: Summary Analytics Telemetry Aggregation
    # -------------------------------------------------------------------------
    summary_res = client.get("/api/analytics/benchmarks/summary/")
    assert summary_res.status_code == 200
    summary_data = summary_res.json()

    assert summary_data["total_operations"] >= 6
    assert summary_data["system_health"]["overall_success_rate"] == 1.0
    assert summary_data["system_health"]["failed_operations"] == 0

    breakdown = summary_data["operations_breakdown"]
    required_operations = [
        "AUTH_VERIFY",
        "INGEST_CHUNK_PARSE",
        "EMBEDDING_GEN",
        "RRF_RETRIEVAL",
        "LLM_SYNTHESIS",
        "CITATION_VERIFY",
    ]
    for op in required_operations:
        assert op in breakdown, f"Operation {op} missing from telemetry breakdown"
        assert breakdown[op]["count"] >= 1
        assert breakdown[op]["avg_duration_ms"] >= 0.0

    # Verify monetary and token accounting
    total_tokens = summary_data["totals"]["total_tokens"]
    total_cost_usd = Decimal(str(summary_data["totals"]["total_cost_usd"]))
    assert total_tokens > 0
    assert total_cost_usd >= Decimal("0.000000")
