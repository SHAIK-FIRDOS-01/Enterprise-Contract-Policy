"""
Tests for TICKET-06: apps/search Setup.
Verifies HybridSearchService combining dense vector cosine similarity (pgvector)
and sparse full-text search (tsvector) via Reciprocal Rank Fusion (RRF k=60),
multi-tenant isolation, search API endpoint, and operational telemetry logging.
"""
from typing import Any, Dict, List
import pytest
from rest_framework.test import APIClient
from django.contrib.postgres.search import SearchVector

from apps.analytics.models import AuditBenchmarkLog, OperationType
from apps.authentication.models import User
from apps.documents.models import Document, DocumentChunk, DocumentStatus
from apps.documents.services.embedding import VectorEmbeddingService
from apps.search.services.hybrid_search import HybridSearchService, SearchResult


@pytest.fixture
def embedding_service() -> VectorEmbeddingService:
    return VectorEmbeddingService()


@pytest.mark.django_db
def test_hybrid_search_semantic_dense_relevance(embedding_service: VectorEmbeddingService) -> None:
    """
    Test 1: Verify hybrid search returns results when query has only semantic relevance
    (synonyms/paraphrases not matching exact keywords).
    """
    user = User.objects.create_user(email="semantic_user@enterprise.com", password="Password123!")
    doc = Document.objects.create(
        user=user,
        title="Vendor Master Agreement.pdf",
        file_hash="hash_sem_01",
        status=DocumentStatus.READY,
    )

    text_indemnity = (
        "The vendor agrees to hold harmless and protect the client against any and all "
        "losses, damages, and expenditures arising from third-party infringement actions."
    )
    text_unrelated = (
        "All cafeteria lunch hours are scheduled between 12:00 PM and 2:00 PM on weekdays."
    )

    vec_indemnity = embedding_service.generate_embedding(text_indemnity)
    vec_unrelated = embedding_service.generate_embedding(text_unrelated)

    chunk_indemnity = DocumentChunk.objects.create(
        document=doc,
        chunk_index=0,
        page_number=3,
        text_content=text_indemnity,
        bounding_box={"x0": 0.1, "y0": 0.2, "x1": 0.9, "y1": 0.35},
        embedding=vec_indemnity,
    )
    DocumentChunk.objects.filter(id=chunk_indemnity.id).update(
        search_vector=SearchVector("text_content")
    )

    chunk_unrelated = DocumentChunk.objects.create(
        document=doc,
        chunk_index=1,
        page_number=10,
        text_content=text_unrelated,
        bounding_box={"x0": 0.1, "y0": 0.5, "x1": 0.8, "y1": 0.6},
        embedding=vec_unrelated,
    )
    DocumentChunk.objects.filter(id=chunk_unrelated.id).update(
        search_vector=SearchVector("text_content")
    )

    # Paraphrase query with zero word overlap with text_indemnity
    query = "compensation for external copyright violation lawsuits"
    search_service = HybridSearchService()
    results: List[SearchResult] = search_service.search(
        user_id=user.id,
        query=query,
        top_k=2,
    )

    assert len(results) >= 1
    top_result = results[0]
    assert top_result.chunk_id == chunk_indemnity.id
    assert top_result.dense_rank is not None
    assert top_result.dense_rank == 1
    assert top_result.rrf_score > 0.0


@pytest.mark.django_db
def test_hybrid_search_sparse_keyword_match(embedding_service: VectorEmbeddingService) -> None:
    """
    Test 2: Verify hybrid search returns results when query has exact keyword terms
    matching sparse search_vector.
    """
    user = User.objects.create_user(email="sparse_user@enterprise.com", password="Password123!")
    doc = Document.objects.create(
        user=user,
        title="Delaware Jurisdiction MSA.pdf",
        file_hash="hash_sparse_01",
        status=DocumentStatus.READY,
    )

    text_law = (
        "This Agreement shall be governed exclusively by the laws of the State of Delaware, "
        "without regard to conflict of law principles."
    )
    text_payment = (
        "Invoices shall be rendered on a monthly basis and are payable net thirty days."
    )

    vec_law = embedding_service.generate_embedding(text_law)
    vec_payment = embedding_service.generate_embedding(text_payment)

    chunk_law = DocumentChunk.objects.create(
        document=doc,
        chunk_index=0,
        page_number=7,
        text_content=text_law,
        bounding_box={"x0": 0.15, "y0": 0.4, "x1": 0.85, "y1": 0.55},
        embedding=vec_law,
    )
    DocumentChunk.objects.filter(id=chunk_law.id).update(
        search_vector=SearchVector("text_content")
    )

    chunk_payment = DocumentChunk.objects.create(
        document=doc,
        chunk_index=1,
        page_number=8,
        text_content=text_payment,
        bounding_box={"x0": 0.1, "y0": 0.1, "x1": 0.8, "y1": 0.25},
        embedding=vec_payment,
    )
    DocumentChunk.objects.filter(id=chunk_payment.id).update(
        search_vector=SearchVector("text_content")
    )

    # Exact keyword query
    query = "Delaware conflict of law"
    search_service = HybridSearchService()
    results: List[SearchResult] = search_service.search(
        user_id=user.id,
        query=query,
        top_k=2,
    )

    assert len(results) >= 1
    top_result = results[0]
    assert top_result.chunk_id == chunk_law.id
    assert top_result.sparse_rank is not None
    assert top_result.sparse_rank == 1
    assert top_result.rrf_score > 0.0


@pytest.mark.django_db
def test_reciprocal_rank_fusion_ordering(embedding_service: VectorEmbeddingService) -> None:
    """
    Test 3: Verify Reciprocal Rank Fusion ordering:
    A chunk matching both dense (semantic) and sparse (keyword) ranks higher
    than a chunk matching only dense or only sparse.
    """
    user = User.objects.create_user(email="rrf_order_user@enterprise.com", password="Password123!")
    doc = Document.objects.create(
        user=user,
        title="RRF Benchmark Contract.pdf",
        file_hash="hash_rrf_order_01",
        status=DocumentStatus.READY,
    )

    # Chunk A: Matches BOTH semantic query AND exact keywords
    text_dual = "The aggregate limitation of liability cap shall not exceed total fees paid."
    vec_dual = embedding_service.generate_embedding(text_dual)

    # Chunk B: Matches sparse keywords, but has no dense vector (sparse-only)
    text_sparse_only = "Statutory liability cap provisions apply strictly to municipal property damage."

    # Chunk C: High semantic relevance to liability cap, but ZERO keyword overlap (dense-only)
    text_dense_only = "The maximum financial damages ceiling under this contract is strictly bounded."
    vec_dense_only = embedding_service.generate_embedding(text_dense_only)

    chunk_dual = DocumentChunk.objects.create(
        document=doc,
        chunk_index=0,
        page_number=1,
        text_content=text_dual,
        bounding_box={"x0": 0.1, "y0": 0.1, "x1": 0.9, "y1": 0.2},
        embedding=vec_dual,
    )
    DocumentChunk.objects.filter(id=chunk_dual.id).update(
        search_vector=SearchVector("text_content")
    )

    chunk_sparse = DocumentChunk.objects.create(
        document=doc,
        chunk_index=1,
        page_number=2,
        text_content=text_sparse_only,
        bounding_box={"x0": 0.1, "y0": 0.3, "x1": 0.9, "y1": 0.4},
        embedding=None,  # No embedding -> sparse only
    )
    DocumentChunk.objects.filter(id=chunk_sparse.id).update(
        search_vector=SearchVector("text_content")
    )

    chunk_dense = DocumentChunk.objects.create(
        document=doc,
        chunk_index=2,
        page_number=3,
        text_content=text_dense_only,
        bounding_box={"x0": 0.1, "y0": 0.5, "x1": 0.9, "y1": 0.6},
        embedding=vec_dense_only,
    )
    # Zero keyword overlap with query -> sparse won't match
    DocumentChunk.objects.filter(id=chunk_dense.id).update(
        search_vector=SearchVector("text_content")
    )

    query = "liability cap"
    search_service = HybridSearchService()
    results = search_service.search(user_id=user.id, query=query, top_k=5)

    assert len(results) >= 2
    # Chunk Dual should be ranked #1 because it has both dense and sparse ranks
    assert results[0].chunk_id == chunk_dual.id
    assert results[0].dense_rank is not None
    assert results[0].sparse_rank is not None
    # Dual chunk score must exceed subsequent chunk scores
    assert results[0].rrf_score > results[1].rrf_score


@pytest.mark.django_db
def test_hybrid_search_multi_tenant_isolation(embedding_service: VectorEmbeddingService) -> None:
    """
    Test 4: Verify multi-tenant isolation:
    User A cannot retrieve or view User B's document chunks even with matching queries.
    """
    user_a = User.objects.create_user(email="usera_search@enterprise.com", password="Password123!")
    user_b = User.objects.create_user(email="userb_search@enterprise.com", password="Password123!")

    doc_a = Document.objects.create(
        user=user_a,
        title="User A Public SOW.pdf",
        file_hash="hash_iso_a",
        status=DocumentStatus.READY,
    )
    doc_b = Document.objects.create(
        user=user_b,
        title="User B Secret M&A Agreement.pdf",
        file_hash="hash_iso_b",
        status=DocumentStatus.READY,
    )

    secret_text = "Project Apollo acquisition price is strictly confidential at fifty million dollars."
    public_text = "Standard consulting hours for deliverables are Monday to Friday."

    vec_secret = embedding_service.generate_embedding(secret_text)
    vec_public = embedding_service.generate_embedding(public_text)

    chunk_b = DocumentChunk.objects.create(
        document=doc_b,
        chunk_index=0,
        page_number=1,
        text_content=secret_text,
        bounding_box={"x0": 0.1, "y0": 0.1, "x1": 0.9, "y1": 0.2},
        embedding=vec_secret,
    )
    DocumentChunk.objects.filter(id=chunk_b.id).update(
        search_vector=SearchVector("text_content")
    )

    chunk_a = DocumentChunk.objects.create(
        document=doc_a,
        chunk_index=0,
        page_number=1,
        text_content=public_text,
        bounding_box={"x0": 0.1, "y0": 0.1, "x1": 0.9, "y1": 0.2},
        embedding=vec_public,
    )
    DocumentChunk.objects.filter(id=chunk_a.id).update(
        search_vector=SearchVector("text_content")
    )

    search_service = HybridSearchService()

    # User A searches for User B's secret text
    results_a = search_service.search(user_id=user_a.id, query="Project Apollo acquisition price", top_k=5)
    # Must NOT return User B's chunk
    chunk_ids_a = [r.chunk_id for r in results_a]
    assert chunk_b.id not in chunk_ids_a

    # User B searches and CAN find their own secret chunk
    results_b = search_service.search(user_id=user_b.id, query="Project Apollo acquisition price", top_k=5)
    chunk_ids_b = [r.chunk_id for r in results_b]
    assert chunk_b.id in chunk_ids_b


@pytest.mark.django_db
def test_hybrid_search_api_endpoint(embedding_service: VectorEmbeddingService) -> None:
    """
    Test 5: Verify POST /api/search/hybrid/ endpoint:
    - Requires authentication.
    - Returns HTTP 200 with structured JSON list of ranked chunks, coordinates, and RRF scores.
    - Respects document_id filter if provided.
    """
    user = User.objects.create_user(email="api_search_user@enterprise.com", password="Password123!")
    doc = Document.objects.create(
        user=user,
        title="Master Services Policy 2026.pdf",
        file_hash="hash_api_search_01",
        status=DocumentStatus.READY,
    )

    text_clause = "The service provider guarantees 99.9% uptime for enterprise software services."
    vec_clause = embedding_service.generate_embedding(text_clause)

    chunk = DocumentChunk.objects.create(
        document=doc,
        chunk_index=0,
        page_number=4,
        text_content=text_clause,
        bounding_box={"x0": 0.12, "y0": 0.25, "x1": 0.88, "y1": 0.38},
        embedding=vec_clause,
    )
    DocumentChunk.objects.filter(id=chunk.id).update(
        search_vector=SearchVector("text_content")
    )

    client = APIClient()

    # 1. Unauthenticated request rejected with 401
    res_unauth = client.post("/api/search/hybrid/", data={"query": "uptime guarantee"}, format="json")
    assert res_unauth.status_code == 401

    # 2. Authenticated request succeeds
    client.force_authenticate(user=user)
    res_auth = client.post(
        "/api/search/hybrid/",
        data={"query": "enterprise software uptime guarantee", "top_k": 3},
        format="json",
    )
    assert res_auth.status_code == 200
    results: List[Dict[str, Any]] = res_auth.json()
    assert isinstance(results, list)
    assert len(results) >= 1

    first = results[0]
    assert first["chunk_id"] == str(chunk.id)
    assert first["document_id"] == str(doc.id)
    assert first["document_title"] == "Master Services Policy 2026.pdf"
    assert first["page_number"] == 4
    assert "x0" in first["bounding_box"]
    assert first["bounding_box"]["x0"] == 0.12
    assert "rrf_score" in first
    assert first["rrf_score"] > 0.0

    # 3. Filter by document_id
    res_doc_filter = client.post(
        "/api/search/hybrid/",
        data={"query": "uptime", "document_id": str(doc.id)},
        format="json",
    )
    assert res_doc_filter.status_code == 200
    assert len(res_doc_filter.json()) >= 1


@pytest.mark.django_db
def test_rrf_retrieval_telemetry_logging(embedding_service: VectorEmbeddingService) -> None:
    """
    Test 6: Verify RRF_RETRIEVAL record is persisted in AuditBenchmarkLog
    with accurate execution duration and query metadata.
    """
    user = User.objects.create_user(email="telemetry_search_user@enterprise.com", password="Password123!")
    doc = Document.objects.create(
        user=user,
        title="Telemetry Test Doc.pdf",
        file_hash="hash_telemetry_doc_01",
        status=DocumentStatus.READY,
    )

    text = "Termination for convenience requires thirty calendar days prior written notice."
    vec = embedding_service.generate_embedding(text)

    chunk = DocumentChunk.objects.create(
        document=doc,
        chunk_index=0,
        page_number=5,
        text_content=text,
        bounding_box={"x0": 0.05, "y0": 0.1, "x1": 0.95, "y1": 0.22},
        embedding=vec,
    )
    DocumentChunk.objects.filter(id=chunk.id).update(
        search_vector=SearchVector("text_content")
    )

    initial_log_count = AuditBenchmarkLog.objects.filter(
        operation=OperationType.RRF_RETRIEVAL
    ).count()

    search_service = HybridSearchService()
    search_service.search(user_id=user.id, query="notice for termination", top_k=1)

    new_logs = AuditBenchmarkLog.objects.filter(operation=OperationType.RRF_RETRIEVAL)
    assert new_logs.count() == initial_log_count + 1

    latest_log = new_logs.latest("created_at")
    assert latest_log.operation == OperationType.RRF_RETRIEVAL
    assert latest_log.status == "SUCCESS"
    assert latest_log.duration_ms > 0.0
    assert latest_log.metadata.get("query") == "notice for termination"
    assert latest_log.metadata.get("top_k") == 1
