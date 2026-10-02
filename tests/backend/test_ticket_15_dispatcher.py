"""
Tests for TICKET-15: Concurrent Multi-Document Worker Pool & Map Dispatcher.
Verifies DocumentAuditWorker and ConcurrentMapDispatcher:
1. Strict per-document retrieval context isolation via SQL parameterization
   (zero cross-document bleed).
2. Robust bounding box coordinate normalization.
3. Parallel execution with ThreadPoolExecutor across target documents.
4. Straggler timeout enforcement without blocking the dispatch pool.
5. Worker exception resilience (individual worker failure does not crash the pool).
6. Django thread-local database connection cleanup (django.db.connections.close_all()).
"""
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch
import time
import pytest
from django.contrib.postgres.search import SearchVector

from apps.authentication.models import User
from apps.documents.models import Document, DocumentChunk, DocumentStatus
from apps.documents.services.embedding import VectorEmbeddingService
from apps.query.services.dispatcher import ConcurrentMapDispatcher
from apps.query.services.worker import DocumentAuditWorker, normalize_bounding_box


@pytest.fixture
def embedding_service() -> VectorEmbeddingService:
    return VectorEmbeddingService()


@pytest.mark.django_db
def test_document_audit_worker_isolated_retrieval(
    embedding_service: VectorEmbeddingService,
) -> None:
    """
    Test 1: Verify DocumentAuditWorker enforces strict document_id isolation.
    Queries for terms present in both Document A and Document B must return ONLY
    chunks belonging to the requested document.
    """
    user = User.objects.create_user(email="worker_test@enterprise.com", password="Password123!")
    doc_a = Document.objects.create(
        user=user,
        title="Contract Alpha.pdf",
        file_hash="hash_alpha_01",
        status=DocumentStatus.READY,
    )
    doc_b = Document.objects.create(
        user=user,
        title="Contract Beta.pdf",
        file_hash="hash_beta_01",
        status=DocumentStatus.READY,
    )

    text_a = "Governing law shall strictly be the State of Delaware."
    text_b = "Governing law shall strictly be the State of New York."

    vec_a = embedding_service.generate_embedding(text_a)
    vec_b = embedding_service.generate_embedding(text_b)

    chunk_a = DocumentChunk.objects.create(
        document=doc_a,
        chunk_index=0,
        page_number=1,
        text_content=text_a,
        bounding_box={"x0": 50.0, "y0": 100.0, "x1": 500.0, "y1": 150.0},
        embedding=vec_a,
    )
    DocumentChunk.objects.filter(id=chunk_a.id).update(search_vector=SearchVector("text_content"))

    chunk_b = DocumentChunk.objects.create(
        document=doc_b,
        chunk_index=0,
        page_number=1,
        text_content=text_b,
        bounding_box={"x0": 60.0, "y0": 120.0, "x1": 520.0, "y1": 180.0},
        embedding=vec_b,
    )
    DocumentChunk.objects.filter(id=chunk_b.id).update(search_vector=SearchVector("text_content"))

    worker = DocumentAuditWorker()

    # Query for Alpha
    result_a = worker.execute(
        document_id=doc_a.id,
        query_text="Governing law",
        user_id=user.id,
        top_k=5,
    )

    assert result_a["document_id"] == str(doc_a.id)
    assert result_a["status"] == "SUCCESS"
    assert len(result_a["candidate_chunks"]) == 1
    assert result_a["candidate_chunks"][0]["document_id"] == str(doc_a.id)
    assert "Delaware" in result_a["candidate_chunks"][0]["text_content"]
    assert "New York" not in result_a["candidate_chunks"][0]["text_content"]

    # Query for Beta
    result_b = worker.execute(
        document_id=doc_b.id,
        query_text="Governing law",
        user_id=user.id,
        top_k=5,
    )

    assert result_b["document_id"] == str(doc_b.id)
    assert result_b["status"] == "SUCCESS"
    assert len(result_b["candidate_chunks"]) == 1
    assert result_b["candidate_chunks"][0]["document_id"] == str(doc_b.id)
    assert "New York" in result_b["candidate_chunks"][0]["text_content"]
    assert "Delaware" not in result_b["candidate_chunks"][0]["text_content"]


def test_bounding_box_normalization() -> None:
    """
    Test 2: Verify normalize_bounding_box handles various raw formats, string floats,
    missing keys, and unexpected types without raising exceptions.
    """
    # Standard complete dict
    box1 = {"x0": 10.5, "y0": 20.0, "x1": 100.25, "y1": 200.75}
    norm1 = normalize_bounding_box(box1)
    assert norm1 == {"x0": 10.5, "y0": 20.0, "x1": 100.25, "y1": 200.75}

    # String values
    box2 = {"x0": "15.2", "y0": "30.1", "x1": "150.0", "y1": "250.0"}
    norm2 = normalize_bounding_box(box2)
    assert norm2 == {"x0": 15.2, "y0": 30.1, "x1": 150.0, "y1": 250.0}

    # Missing keys fallback to 0.0
    box3 = {"x0": 5.0, "y0": 10.0}
    norm3 = normalize_bounding_box(box3)
    assert norm3 == {"x0": 5.0, "y0": 10.0, "x1": 0.0, "y1": 0.0}

    # Empty or invalid type
    norm4 = normalize_bounding_box(None)
    assert norm4 == {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0}

    norm5 = normalize_bounding_box("invalid")
    assert norm5 == {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0}


@pytest.mark.django_db(transaction=True)
def test_concurrent_map_dispatcher_multi_document_success(
    embedding_service: VectorEmbeddingService,
) -> None:
    """
    Test 3: Dispatch queries across multiple synthetic documents concurrently.
    Verify that each document produces isolated candidate bundles with zero cross-document bleed.
    """
    user = User.objects.create_user(email="dispatcher_test@enterprise.com", password="Password123!")
    docs: List[Document] = []
    for i in range(3):
        doc = Document.objects.create(
            user=user,
            title=f"Synthetic Policy {i}.pdf",
            file_hash=f"hash_poly_{i}",
            status=DocumentStatus.READY,
        )
        text = f"Policy Section {i}: Standard indemnity limit is ${100_000 * (i + 1)}."
        vec = embedding_service.generate_embedding(text)
        chunk = DocumentChunk.objects.create(
            document=doc,
            chunk_index=0,
            page_number=1,
            text_content=text,
            bounding_box={"x0": 72.0, "y0": 100.0, "x1": 400.0, "y1": 150.0},
            embedding=vec,
        )
        DocumentChunk.objects.filter(id=chunk.id).update(search_vector=SearchVector("text_content"))
        docs.append(doc)

    dispatcher = ConcurrentMapDispatcher()
    doc_ids = [d.id for d in docs]

    bundles = dispatcher.dispatch(
        document_ids=doc_ids,
        query_text="indemnity limit",
        user_id=user.id,
        top_k=3,
        timeout_seconds=2.0,
    )

    assert len(bundles) == 3
    # Check that each bundle is mapped to the right document
    bundle_by_doc = {b["document_id"]: b for b in bundles}

    for i, doc in enumerate(docs):
        doc_id_str = str(doc.id)
        assert doc_id_str in bundle_by_doc
        bundle = bundle_by_doc[doc_id_str]
        assert bundle["status"] == "SUCCESS"
        assert bundle["duration_ms"] >= 0.0
        assert len(bundle["candidate_chunks"]) == 1

        cand = bundle["candidate_chunks"][0]
        assert cand["document_id"] == doc_id_str
        assert f"Policy Section {i}" in cand["text_content"]
        assert f"${100_000 * (i + 1)}" in cand["text_content"]

        # Ensure no cross-document bleed
        for j in range(3):
            if j != i:
                assert f"Policy Section {j}" not in cand["text_content"]


def test_concurrent_map_dispatcher_straggler_timeout() -> None:
    """
    Test 4: Verify strict per-worker timeout ceiling. If one worker delays past
    timeout_seconds, it is returned with status 'TIMEOUT' while other workers complete 'SUCCESS'.
    """
    mock_worker = MagicMock()

    def side_effect(document_id: Any, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        if str(document_id) == "straggler-doc":
            time.sleep(0.3)
            return {
                "document_id": "straggler-doc",
                "status": "SUCCESS",
                "duration_ms": 300.0,
                "candidate_chunks": [{"chunk_id": "c1"}],
            }
        return {
            "document_id": str(document_id),
            "status": "SUCCESS",
            "duration_ms": 10.0,
            "candidate_chunks": [{"chunk_id": f"chunk-{document_id}"}],
        }

    mock_worker.execute.side_effect = side_effect

    dispatcher = ConcurrentMapDispatcher(worker=mock_worker)
    bundles = dispatcher.dispatch(
        document_ids=["fast-doc-1", "straggler-doc", "fast-doc-2"],
        query_text="contract query",
        timeout_seconds=0.1,  # 100ms ceiling vs 300ms delay
    )

    assert len(bundles) == 3
    bundle_by_id = {b["document_id"]: b for b in bundles}

    assert bundle_by_id["fast-doc-1"]["status"] == "SUCCESS"
    assert len(bundle_by_id["fast-doc-1"]["candidate_chunks"]) == 1

    assert bundle_by_id["fast-doc-2"]["status"] == "SUCCESS"
    assert len(bundle_by_id["fast-doc-2"]["candidate_chunks"]) == 1

    assert bundle_by_id["straggler-doc"]["status"] == "TIMEOUT"
    assert bundle_by_id["straggler-doc"]["candidate_chunks"] == []


def test_concurrent_map_dispatcher_worker_failure_resilience() -> None:
    """
    Test 5: Verify that an unhandled exception in one worker does not fail the dispatch pool.
    The failed document returns 'FAILED' while others return 'SUCCESS'.
    """
    mock_worker = MagicMock()

    def side_effect(document_id: Any, *args: Any, **kwargs: Any) -> Dict[str, Any]:
        if str(document_id) == "failing-doc":
            raise RuntimeError("Database connection reset by peer")
        return {
            "document_id": str(document_id),
            "status": "SUCCESS",
            "duration_ms": 15.0,
            "candidate_chunks": [{"chunk_id": "valid"}],
        }

    mock_worker.execute.side_effect = side_effect

    dispatcher = ConcurrentMapDispatcher(worker=mock_worker)
    bundles = dispatcher.dispatch(
        document_ids=["doc-ok-1", "failing-doc", "doc-ok-2"],
        query_text="liability limit",
        timeout_seconds=1.0,
    )

    assert len(bundles) == 3
    bundle_by_id = {b["document_id"]: b for b in bundles}

    assert bundle_by_id["doc-ok-1"]["status"] == "SUCCESS"
    assert bundle_by_id["doc-ok-2"]["status"] == "SUCCESS"
    assert bundle_by_id["failing-doc"]["status"] == "FAILED"
    assert bundle_by_id["failing-doc"]["candidate_chunks"] == []


@pytest.mark.django_db
def test_concurrent_map_dispatcher_db_connections_cleanup() -> None:
    """
    Test 6: Verify django.db.connections.close_all() is invoked in worker threads
    to prevent connection leaks and starvation.
    """
    with patch("django.db.connections.close_all") as mock_close_all:
        dispatcher = ConcurrentMapDispatcher()
        bundles = dispatcher.dispatch(
            document_ids=["nonexistent-doc-1", "nonexistent-doc-2"],
            query_text="audit clause",
            timeout_seconds=1.0,
        )

        assert len(bundles) == 2
        # Each worker thread must call connections.close_all()
        assert mock_close_all.call_count >= 2
