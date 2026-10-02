"""
Tests for TICKET-16: Deterministic Confidence Gater & Reduce-Stage Groq Handoff.
Verifies ConfidenceGater and MultiDocReduceSynthesizer:
1. High-Confidence Single-Doc Fast Path (System 1 bypasses Groq API).
2. Low-Confidence Escalation (< 0.85 escalates to System 2 Frontier).
3. Multi-Document Auto-Escalation (multiple documents always route to System 2).
4. Prompt XML Boundary Isolation (strict <document_context> tags without cross-doc bleed).
5. Reduce-Stage Groq Synthesis execution and telemetry logging.
"""
from typing import Any, Dict, List
from unittest.mock import MagicMock
import pytest

from apps.analytics.models import AuditBenchmarkLog
from apps.query.services.gater import ConfidenceGater
from apps.query.services.reducer import MultiDocReduceSynthesizer


@pytest.fixture
def mock_validator() -> MagicMock:
    validator = MagicMock()
    return validator


def test_confidence_gater_single_doc_fast_path(mock_validator: MagicMock) -> None:
    """
    Test 1: High-confidence single-doc queries (confidence >= 0.85)
    must resolve via SYSTEM_1_FAST_PATH, bypassing Groq LLM synthesis.
    """
    mock_validator.compute_lexical_containment.return_value = 1.0
    mock_validator.compute_semantic_similarity.return_value = 0.95

    gater = ConfidenceGater(threshold=0.85, validator=mock_validator)

    bundles: List[Dict[str, Any]] = [
        {
            "document_id": "doc-alpha-123",
            "status": "SUCCESS",
            "duration_ms": 42.0,
            "candidate_chunks": [
                {
                    "chunk_id": "chunk-001",
                    "document_id": "doc-alpha-123",
                    "document_title": "MSA Agreement.pdf",
                    "page_number": 4,
                    "chunk_index": 0,
                    "text_content": "The limitation of liability cap is strictly $5,000,000.",
                    "bounding_box": {"x0": 72.0, "y0": 100.0, "x1": 500.0, "y1": 150.0},
                    "dense_rank": 1,
                    "sparse_rank": 1,
                    "rrf_score": 0.032,
                }
            ],
        }
    ]

    decision = gater.evaluate(
        query="What is the limitation of liability cap?",
        bundles=bundles,
        is_multi_doc=False,
    )

    assert decision["route"] == "SYSTEM_1_FAST_PATH"
    assert decision["confidence_score"] >= 0.85
    assert decision["is_multi_doc"] is False
    assert len(decision["grounded_evidence"]) == 1
    assert decision["fast_path_payload"] is not None
    assert decision["fast_path_payload"]["document_id"] == "doc-alpha-123"
    assert decision["fast_path_payload"]["chunk_id"] == "chunk-001"
    assert "$5,000,000" in decision["fast_path_payload"]["extracted_span"]


def test_confidence_gater_low_confidence_escalation(mock_validator: MagicMock) -> None:
    """
    Test 2: Sub-threshold queries (confidence < 0.85) must cleanly escalate
    to SYSTEM_2_FRONTIER for full synthesis.
    """
    mock_validator.compute_lexical_containment.return_value = 0.3
    mock_validator.compute_semantic_similarity.return_value = 0.4

    gater = ConfidenceGater(threshold=0.85, validator=mock_validator)

    bundles: List[Dict[str, Any]] = [
        {
            "document_id": "doc-beta-456",
            "status": "SUCCESS",
            "duration_ms": 35.0,
            "candidate_chunks": [
                {
                    "chunk_id": "chunk-002",
                    "document_id": "doc-beta-456",
                    "document_title": "Policy Document.pdf",
                    "page_number": 12,
                    "chunk_index": 3,
                    "text_content": "General definitions and standard operational terms.",
                    "bounding_box": {"x0": 50.0, "y0": 80.0, "x1": 450.0, "y1": 120.0},
                    "dense_rank": 3,
                    "sparse_rank": 5,
                    "rrf_score": 0.015,
                }
            ],
        }
    ]

    decision = gater.evaluate(
        query="What is the audit frequency for cybersecurity audits?",
        bundles=bundles,
        is_multi_doc=False,
    )

    assert decision["route"] == "SYSTEM_2_FRONTIER"
    assert decision["confidence_score"] < 0.85
    assert decision["is_multi_doc"] is False
    assert decision["fast_path_payload"] is None


def test_confidence_gater_multi_doc_auto_escalation(mock_validator: MagicMock) -> None:
    """
    Test 3: Queries spanning multiple documents must ALWAYS route to SYSTEM_2_FRONTIER
    regardless of whether individual chunks have high confidence.
    """
    mock_validator.compute_lexical_containment.return_value = 1.0
    mock_validator.compute_semantic_similarity.return_value = 1.0

    gater = ConfidenceGater(threshold=0.85, validator=mock_validator)

    bundles: List[Dict[str, Any]] = [
        {
            "document_id": "doc-2025",
            "status": "SUCCESS",
            "duration_ms": 20.0,
            "candidate_chunks": [
                {
                    "chunk_id": "c-2025",
                    "document_id": "doc-2025",
                    "document_title": "Vendor 2025.pdf",
                    "page_number": 1,
                    "chunk_index": 0,
                    "text_content": "Notice period is 30 days.",
                    "bounding_box": {"x0": 0.1, "y0": 0.1, "x1": 0.5, "y1": 0.2},
                    "dense_rank": 1,
                    "sparse_rank": 1,
                    "rrf_score": 0.033,
                }
            ],
        },
        {
            "document_id": "doc-2026",
            "status": "SUCCESS",
            "duration_ms": 22.0,
            "candidate_chunks": [
                {
                    "chunk_id": "c-2026",
                    "document_id": "doc-2026",
                    "document_title": "Vendor 2026.pdf",
                    "page_number": 2,
                    "chunk_index": 1,
                    "text_content": "Notice period was extended to 60 days.",
                    "bounding_box": {"x0": 0.1, "y0": 0.3, "x1": 0.5, "y1": 0.4},
                    "dense_rank": 1,
                    "sparse_rank": 1,
                    "rrf_score": 0.033,
                }
            ],
        },
    ]

    decision = gater.evaluate(
        query="Compare notice period variance between 2025 and 2026.",
        bundles=bundles,
    )

    assert decision["route"] == "SYSTEM_2_FRONTIER"
    assert decision["is_multi_doc"] is True
    assert len(decision["grounded_evidence"]) == 2
    assert decision["fast_path_payload"] is None


def test_reducer_prompt_boundary_isolation() -> None:
    """
    Test 4: Verify MultiDocReduceSynthesizer generates prompt with strict
    <document_context> XML boundaries isolating each document's chunks without bleeding.
    """
    synthesizer = MultiDocReduceSynthesizer(client=MagicMock())

    evidence = [
        {
            "document_id": "doc-aaa",
            "document_title": "Master Services Agreement.pdf",
            "chunks": [
                {
                    "chunk_id": "chk-1",
                    "page_number": 10,
                    "text_content": "Indemnification covers third-party copyright claims.",
                }
            ],
        },
        {
            "document_id": "doc-bbb",
            "document_title": "Security Addendum.pdf",
            "chunks": [
                {
                    "chunk_id": "chk-2",
                    "page_number": 3,
                    "text_content": "Vendor must notify breach within 24 hours.",
                }
            ],
        },
    ]

    prompt = synthesizer.build_prompt(
        query="What are the indemnity and breach notification requirements?",
        evidence=evidence,
    )

    # Check XML isolation tags
    assert '<document_context id="doc-aaa" title="Master Services Agreement.pdf">' in prompt
    assert '<document_context id="doc-bbb" title="Security Addendum.pdf">' in prompt
    assert '<chunk id="chk-1" page="10">' in prompt
    assert '<chunk id="chk-2" page="3">' in prompt
    assert "</document_context>" in prompt
    assert "Indemnification covers third-party copyright claims." in prompt
    assert "Vendor must notify breach within 24 hours." in prompt


@pytest.mark.django_db
def test_reducer_synthesis_and_telemetry_logging() -> None:
    """
    Test 5: Verify MultiDocReduceSynthesizer calls Groq client, emits standardized
    citations [Ref:DocID:ChunkID:Page], and logs REDUCE_SYNTHESIS telemetry.
    """
    mock_client = MagicMock()
    mock_response = MagicMock()
    mock_choice = MagicMock()
    mock_message = MagicMock()

    mock_message.content = (
        "The 2025 agreement required 30 days notice [Ref:doc-2025:c-1:1], whereas the "
        "2026 addendum expanded it to 60 days [Ref:doc-2026:c-2:3]."
    )
    mock_choice.message = mock_message
    mock_response.choices = [mock_choice]
    mock_response.usage = MagicMock(prompt_tokens=450, completion_tokens=120, total_tokens=570)
    mock_client.chat.completions.create.return_value = mock_response

    synthesizer = MultiDocReduceSynthesizer(client=mock_client, model_name="qwen/qwen3.8-27b")

    gated_decision = {
        "route": "SYSTEM_2_FRONTIER",
        "confidence_score": 0.9,
        "is_multi_doc": True,
        "grounded_evidence": [
            {
                "document_id": "doc-2025",
                "document_title": "2025 MSA.pdf",
                "chunks": [
                    {
                        "chunk_id": "c-1",
                        "page_number": 1,
                        "text_content": "Notice is 30 days.",
                    }
                ],
            },
            {
                "document_id": "doc-2026",
                "document_title": "2026 Addendum.pdf",
                "chunks": [
                    {
                        "chunk_id": "c-2",
                        "page_number": 3,
                        "text_content": "Notice is 60 days.",
                    }
                ],
            },
        ],
    }

    result = synthesizer.reduce_synthesis(
        query="Compare notice periods across agreements",
        gated_decision=gated_decision,
    )

    assert result["route"] == "SYSTEM_2_FRONTIER"
    assert "2025 agreement" in result["synthesis_text"]
    assert len(result["citations"]) == 2
    assert result["citations"][0]["document_id"] == "doc-2025"
    assert result["citations"][0]["chunk_id"] == "c-1"
    assert result["citations"][0]["page_number"] == 1
    assert result["citations"][1]["document_id"] == "doc-2026"
    assert result["citations"][1]["chunk_id"] == "c-2"
    assert result["citations"][1]["page_number"] == 3

    # Check telemetry persisted in database
    log = AuditBenchmarkLog.objects.filter(operation="REDUCE_SYNTHESIS").latest("created_at")
    assert log.status == "SUCCESS"
    assert log.model_name == "qwen/qwen3.8-27b"
    assert log.prompt_tokens == 450
    assert log.completion_tokens == 120
