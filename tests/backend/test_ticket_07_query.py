"""
Tests for TICKET-07: apps/query Setup.
Verifies Groq LLM synthesis service, coordinate citation engine,
SSE streaming endpoint (/api/query/stream/), and LLM_SYNTHESIS telemetry instrumentation.
"""
import json
from typing import Any, Dict, List, Optional
from uuid import uuid4
import pytest
from rest_framework.test import APIClient
from django.contrib.postgres.search import SearchVector

from apps.analytics.models import AuditBenchmarkLog, OperationType
from apps.authentication.models import User
from apps.documents.models import Document, DocumentChunk, DocumentStatus
from apps.documents.services.embedding import VectorEmbeddingService
from apps.query.services.citation import CitationEngine
from apps.query.services.synthesis import GroqSynthesisService
from apps.search.services.hybrid_search import SearchResult


class MockDelta:
    def __init__(self, content: Optional[str]) -> None:
        self.content = content


class MockChoice:
    def __init__(self, content: Optional[str]) -> None:
        self.delta = MockDelta(content)


class MockUsage:
    def __init__(self, prompt_tokens: int = 50, completion_tokens: int = 25) -> None:
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
        prompt_tokens: int = 50,
        completion_tokens: int = 25,
    ) -> None:
        self.tokens = tokens or [
            "The ", "limitation ", "of ", "liability ", "cap ",
            "is ", "strictly ", "capped ", "at ", "twelve ", "months ",
            "fees ", "[Ref:1].",
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
        prompt_tokens: int = 50,
        completion_tokens: int = 25,
    ) -> None:
        self.chat = type(
            "Chat",
            (),
            {"completions": MockChatCompletions(tokens, prompt_tokens, completion_tokens)},
        )()


@pytest.fixture
def sample_search_results() -> List[SearchResult]:
    doc_id = uuid4()
    return [
        SearchResult(
            chunk_id=uuid4(),
            document_id=doc_id,
            document_title="Master Services Agreement 2026.pdf",
            page_number=4,
            chunk_index=2,
            text_content="The total liability under this agreement shall not exceed fees paid in prior 12 months.",
            bounding_box={"x0": 0.1, "y0": 0.2, "x1": 0.9, "y1": 0.35},
            dense_rank=1,
            sparse_rank=1,
            rrf_score=0.032786,
        ),
        SearchResult(
            chunk_id=uuid4(),
            document_id=doc_id,
            document_title="Master Services Agreement 2026.pdf",
            page_number=12,
            chunk_index=8,
            text_content="Governing law shall strictly be the State of Delaware.",
            bounding_box={"x0": 0.15, "y0": 0.6, "x1": 0.85, "y1": 0.72},
            dense_rank=2,
            sparse_rank=None,
            rrf_score=0.008064,
        ),
    ]


def test_citation_engine_extraction_and_mapping(sample_search_results: List[SearchResult]) -> None:
    """
    Test 1: Verify CitationEngine correctly identifies citation tags and maps them
    to chunk bounding boxes and page coordinates.
    """
    synthesized_text = (
        "The liability is capped at 12 months of fees [Ref:1] and disputes "
        "are adjudicated in Delaware [Ref:2]. Outside notice is 30 days [Ref:99]."
    )

    citations = CitationEngine.extract_citations(synthesized_text, sample_search_results)

    # Must resolve Ref 1 and Ref 2, but ignore Ref 99 which is out of range
    assert 1 in citations
    assert 2 in citations
    assert 99 not in citations

    ref1 = citations[1]
    assert ref1["page_number"] == 4
    assert ref1["bounding_box"] == {"x0": 0.1, "y0": 0.2, "x1": 0.9, "y1": 0.35}
    assert ref1["document_title"] == "Master Services Agreement 2026.pdf"

    ref2 = citations[2]
    assert ref2["page_number"] == 12
    assert ref2["bounding_box"] == {"x0": 0.15, "y0": 0.6, "x1": 0.85, "y1": 0.72}


@pytest.mark.django_db
def test_groq_synthesis_service_prompt_formatting_and_streaming(
    sample_search_results: List[SearchResult],
) -> None:
    """
    Test 2: Test GroqSynthesisService prompt formatting and mocked streaming output generation.
    """
    mock_client = MockGroqClient(
        tokens=["Answer: ", "liability ", "is ", "capped ", "[Ref:1]."],
        prompt_tokens=45,
        completion_tokens=15,
    )
    service = GroqSynthesisService(client=mock_client)

    # Verify prompt context formatting
    context = service.format_context(sample_search_results)
    assert "[Source 1]" in context
    assert "Master Services Agreement 2026.pdf" in context
    assert "Page: 4" in context
    assert "[Source 2]" in context

    # Verify stream generation
    token_events = list(
        service.stream_synthesis("What is the cap?", sample_search_results)
    )
    full_text = "".join(token_events)
    assert full_text == "Answer: liability is capped [Ref:1]."


@pytest.mark.django_db
def test_query_stream_unauthenticated_rejected() -> None:
    """
    Test 3: Test POST /api/query/stream/ unauthenticated request returns HTTP 401.
    """
    client = APIClient()
    response = client.post(
        "/api/query/stream/",
        data={"query": "What is the liability cap?"},
        format="json",
    )
    assert response.status_code == 401


@pytest.mark.django_db
def test_query_stream_sse_protocol_events(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Test 4: Test POST /api/query/stream/ authenticated request returns StreamingHttpResponse
    with valid SSE event sequence (metadata, delta, telemetry, done).
    """
    user = User.objects.create_user(email="stream_user@enterprise.com", password="Password123!")
    doc = Document.objects.create(
        user=user,
        title="Vendor Agreement 2026.pdf",
        file_hash="hash_stream_01",
        status=DocumentStatus.READY,
    )

    embedder = VectorEmbeddingService()
    text = "The limitation of liability cap shall not exceed twelve months of fees."
    chunk = DocumentChunk.objects.create(
        document=doc,
        chunk_index=0,
        page_number=1,
        text_content=text,
        bounding_box={"x0": 0.1, "y0": 0.2, "x1": 0.9, "y1": 0.3},
        embedding=embedder.generate_embedding(text),
    )
    DocumentChunk.objects.filter(id=chunk.id).update(search_vector=SearchVector("text_content"))

    client = APIClient()
    client.force_authenticate(user=user)

    mock_client = MockGroqClient(
        tokens=["The ", "liability ", "cap ", "is ", "12 ", "months ", "[Ref:1]."],
        prompt_tokens=80,
        completion_tokens=20,
    )

    monkeypatch.setattr(
        "apps.query.services.synthesis.GroqSynthesisService.get_client",
        lambda self: mock_client,
    )
    monkeypatch.setattr(
        "apps.query.views.GroqSynthesisService.get_client",
        lambda self: mock_client,
    )

    response = client.post(
        "/api/query/stream/",
        data={"query": "liability cap", "top_k": 2},
        format="json",
    )

    assert response.status_code == 200
    assert "text/event-stream" in response["Content-Type"]

    content = b"".join(response.streaming_content).decode("utf-8")
    assert "event: metadata" in content
    assert "event: delta" in content
    assert "event: telemetry" in content
    assert "event: done" in content
    assert "[DONE]" in content


@pytest.mark.django_db
def test_llm_synthesis_telemetry_persisted(sample_search_results: List[SearchResult]) -> None:
    """
    Test 5: Verify LLM_SYNTHESIS telemetry log record is created in AuditBenchmarkLog
    with non-zero duration, token counts, and cost.
    """
    mock_client = MockGroqClient(
        tokens=["Grounded ", "answer ", "[Ref:1]."],
        prompt_tokens=120,
        completion_tokens=30,
    )
    service = GroqSynthesisService(client=mock_client)

    initial_log_count = AuditBenchmarkLog.objects.filter(
        operation=OperationType.LLM_SYNTHESIS
    ).count()

    # Exhaust stream to finalize telemetry context block
    _ = list(service.stream_synthesis("What is the clause?", sample_search_results))

    new_logs = AuditBenchmarkLog.objects.filter(operation=OperationType.LLM_SYNTHESIS)
    assert new_logs.count() == initial_log_count + 1

    latest_log = new_logs.latest("created_at")
    assert latest_log.operation == OperationType.LLM_SYNTHESIS
    assert latest_log.status == "SUCCESS"
    assert latest_log.prompt_tokens == 120
    assert latest_log.completion_tokens == 30
    assert latest_log.total_tokens == 150
    assert latest_log.duration_ms > 0.0
    assert latest_log.estimated_cost_usd > 0.0
