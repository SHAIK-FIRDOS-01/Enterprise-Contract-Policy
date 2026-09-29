"""
Tests for TICKET-08: apps/query Citation Verification Engine.
Verifies CitationValidator with deterministic lexical overlap + embedding cosine similarity,
confidence scoring thresholds (HIGH >= 0.75, MEDIUM >= 0.50, REJECTED < 0.50),
POST /api/query/verify/ endpoint, and CITATION_VERIFY telemetry logging.
"""
from typing import Any, Dict, List
from uuid import uuid4
import pytest
from rest_framework.test import APIClient

from apps.analytics.models import AuditBenchmarkLog, OperationType
from apps.authentication.models import User
from apps.documents.services.embedding import VectorEmbeddingService
from apps.query.services.verifier import (
    CitationValidator,
    ConfidenceLevel,
    VerificationResult,
)
from apps.search.services.hybrid_search import SearchResult


@pytest.fixture
def embedding_service() -> VectorEmbeddingService:
    return VectorEmbeddingService()


@pytest.fixture
def validator(embedding_service: VectorEmbeddingService) -> CitationValidator:
    return CitationValidator(embedding_service=embedding_service)


@pytest.mark.django_db
def test_grounded_claim_yields_high_confidence(validator: CitationValidator) -> None:
    """
    Test 1: Grounded claim test: Verifies exact or near-verbatim quote from chunk
    yields HIGH confidence (>= 0.75).
    """
    source_chunk = (
        "The aggregate limitation of liability under this agreement shall strictly not exceed "
        "the total fees paid by customer in the preceding twelve months."
    )
    grounded_claim = (
        "The aggregate limitation of liability shall strictly not exceed the total fees paid "
        "by customer in the preceding twelve months [Ref:1]."
    )
    bbox = {"x0": 0.1, "y0": 0.2, "x1": 0.9, "y1": 0.35}

    result: VerificationResult = validator.verify_claim(
        claim_text=grounded_claim,
        ref_id=1,
        source_chunk_text=source_chunk,
        bounding_box=bbox,
    )

    assert result.status == ConfidenceLevel.HIGH
    assert result.confidence_score >= 0.75
    assert result.lexical_score >= 0.70
    assert result.semantic_score >= 0.75
    assert result.bounding_box == bbox
    assert result.ref_id == 1


@pytest.mark.django_db
def test_hallucinated_citation_yields_rejected(validator: CitationValidator) -> None:
    """
    Test 2: Hallucinated citation test: Verifies claim citing irrelevant chunk
    yields REJECTED (< 0.50).
    """
    source_chunk = (
        "The employee cafeteria is open from 11:30 AM to 1:30 PM on standard business days. "
        "Visitors must register with front desk security."
    )
    hallucinated_claim = (
        "Vendor shall indemnify client against any patent and trademark infringement actions [Ref:1]."
    )
    bbox = {"x0": 0.05, "y0": 0.8, "x1": 0.95, "y1": 0.95}

    result: VerificationResult = validator.verify_claim(
        claim_text=hallucinated_claim,
        ref_id=1,
        source_chunk_text=source_chunk,
        bounding_box=bbox,
    )

    assert result.status == ConfidenceLevel.REJECTED
    assert result.confidence_score < 0.50
    assert result.lexical_score <= 0.20
    assert result.bounding_box == bbox


@pytest.mark.django_db
def test_multiple_citation_resolution(validator: CitationValidator) -> None:
    """
    Test 3: Multiple citation resolution: Verifies text with multiple citations ([Ref:1], [Ref:2])
    resolves each independently with its respective bounding box.
    """
    doc_id = uuid4()
    bbox_1 = {"x0": 0.1, "y0": 0.1, "x1": 0.9, "y1": 0.2}
    bbox_2 = {"x0": 0.15, "y0": 0.5, "x1": 0.85, "y1": 0.65}

    chunks = [
        SearchResult(
            chunk_id=uuid4(),
            document_id=doc_id,
            document_title="Contract Alpha.pdf",
            page_number=2,
            chunk_index=1,
            text_content="Liability is capped at total fees paid in the prior twelve months.",
            bounding_box=bbox_1,
            dense_rank=1,
            sparse_rank=1,
            rrf_score=0.032,
        ),
        SearchResult(
            chunk_id=uuid4(),
            document_id=doc_id,
            document_title="Contract Alpha.pdf",
            page_number=9,
            chunk_index=5,
            text_content="This agreement is governed strictly by the laws of the State of Delaware.",
            bounding_box=bbox_2,
            dense_rank=2,
            sparse_rank=1,
            rrf_score=0.024,
        ),
    ]

    synthesis_text = (
        "The liability is capped at twelve months fees paid [Ref:1]. "
        "Governing law is strictly the State of Delaware [Ref:2]."
    )

    results: List[VerificationResult] = validator.verify_synthesis(
        synthesis_text=synthesis_text,
        retrieved_chunks=chunks,
    )

    assert len(results) == 2
    res_1 = results[0]
    assert res_1.ref_id == 1
    assert res_1.bounding_box == bbox_1
    assert res_1.status == ConfidenceLevel.HIGH

    res_2 = results[1]
    assert res_2.ref_id == 2
    assert res_2.bounding_box == bbox_2
    assert res_2.status == ConfidenceLevel.HIGH


@pytest.mark.django_db
def test_verify_api_endpoint() -> None:
    """
    Test 4: Endpoint test: POST /api/query/verify/
    - Returns HTTP 401 when unauthenticated.
    - Returns HTTP 200 with structured validation payload when authenticated.
    """
    user = User.objects.create_user(email="verifier_api_user@enterprise.com", password="Password123!")
    client = APIClient()

    payload = {
        "synthesis_text": "The liability is capped at 12 months fees [Ref:1].",
        "chunks": [
            {
                "chunk_index": 0,
                "text_content": "The limitation of liability shall not exceed twelve months fees.",
                "bounding_box": {"x0": 0.1, "y0": 0.2, "x1": 0.9, "y1": 0.3},
                "page_number": 1,
                "document_id": str(uuid4()),
                "document_title": "MSA 2026.pdf",
            }
        ],
    }

    # 1. Unauthenticated request rejected
    res_unauth = client.post("/api/query/verify/", data=payload, format="json")
    assert res_unauth.status_code == 401

    # 2. Authenticated request succeeds
    client.force_authenticate(user=user)
    res_auth = client.post("/api/query/verify/", data=payload, format="json")
    assert res_auth.status_code == 200

    data: Dict[str, Any] = res_auth.json()
    assert "results" in data
    assert "total_verified" in data
    assert data["total_verified"] >= 1

    first = data["results"][0]
    assert first["ref_id"] == 1
    assert first["status"] in ["HIGH", "MEDIUM"]
    assert first["confidence_score"] >= 0.50
    assert first["bounding_box"] == {"x0": 0.1, "y0": 0.2, "x1": 0.9, "y1": 0.3}


@pytest.mark.django_db
def test_citation_verify_telemetry_persisted(validator: CitationValidator) -> None:
    """
    Test 5: Telemetry persistence: Verifies CITATION_VERIFY log is saved
    in AuditBenchmarkLog with accurate execution duration and metadata.
    """
    initial_count = AuditBenchmarkLog.objects.filter(
        operation=OperationType.CITATION_VERIFY
    ).count()

    doc_id = uuid4()
    chunks = [
        SearchResult(
            chunk_id=uuid4(),
            document_id=doc_id,
            document_title="Policy.pdf",
            page_number=1,
            chunk_index=0,
            text_content="Notice must be provided within thirty days of termination.",
            bounding_box={"x0": 0.1, "y0": 0.1, "x1": 0.8, "y1": 0.2},
            dense_rank=1,
            sparse_rank=1,
            rrf_score=0.03,
        )
    ]

    _ = validator.verify_synthesis(
        synthesis_text="Notice requires 30 days [Ref:1].",
        retrieved_chunks=chunks,
    )

    new_logs = AuditBenchmarkLog.objects.filter(operation=OperationType.CITATION_VERIFY)
    assert new_logs.count() == initial_count + 1

    latest = new_logs.latest("created_at")
    assert latest.operation == OperationType.CITATION_VERIFY
    assert latest.status == "SUCCESS"
    assert latest.duration_ms > 0.0
    assert latest.model_name == "system"
