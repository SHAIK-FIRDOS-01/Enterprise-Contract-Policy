"""
Tests for TICKET-04: Documents Data Layer & pgvector VectorField Schema.
Verifies Document & DocumentChunk models, pgvector HNSW 384-dim indexing,
cosine similarity ordering, document upload API, and user data isolation.
"""
import math
from typing import Any, Dict, List
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from pgvector.django import CosineDistance

from apps.authentication.models import User, UserRole
from apps.documents.models import Document, DocumentChunk, DocumentStatus


def _generate_unit_vector(dimension: int, non_zero_index: int) -> List[float]:
    """Generate a simple normalized 384-dimensional unit vector."""
    vec = [0.0] * dimension
    vec[non_zero_index % dimension] = 1.0
    return vec


def _generate_dense_vector(dimension: int, seed: float) -> List[float]:
    """Generate a normalized dense vector."""
    raw = [math.sin(seed * (i + 1)) for i in range(dimension)]
    norm = math.sqrt(sum(x * x for x in raw))
    return [x / norm for x in raw]


@pytest.mark.django_db
def test_document_and_chunk_model_persistence() -> None:
    """Test 1: Verify Document and DocumentChunk models persist with UUIDs and field defaults."""
    user = User.objects.create_user(
        email="docuser@enterprise.com",
        password="ValidPassword123!",
        role=UserRole.AUDITOR,
    )
    doc = Document.objects.create(
        user=user,
        title="Master Services Agreement 2026.pdf",
        file_hash="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        status=DocumentStatus.PENDING,
    )
    assert doc.id is not None
    assert str(doc.id) != ""
    assert doc.status == DocumentStatus.PENDING
    assert doc.page_count == 0

    chunk = DocumentChunk.objects.create(
        document=doc,
        chunk_index=0,
        page_number=1,
        text_content="This Master Services Agreement is entered into as of January 1, 2026.",
        bounding_box={"x0": 54.0, "y0": 72.0, "x1": 558.0, "y1": 110.0},
        embedding=_generate_unit_vector(384, 0),
        metadata={"section": "Preamble", "clause_type": "AGREEMENT_DATE"},
    )
    assert chunk.id is not None
    assert str(chunk.id) != ""
    assert chunk.chunk_index == 0
    assert chunk.page_number == 1
    assert chunk.bounding_box["x0"] == 54.0
    assert len(chunk.embedding) == 384


@pytest.mark.django_db
def test_pgvector_cosine_distance_ordering() -> None:
    """
    Test 2: Insert 384-dimensional test vectors and verify cosine distance ordering query.
    Cosine distance = 1 - cosine_similarity.
    Identical vector -> distance ~0.0 (closest).
    Orthogonal vector -> distance ~1.0.
    Opposite vector -> distance ~2.0.
    """
    user = User.objects.create_user(
        email="vectoruser@enterprise.com",
        password="ValidPassword123!",
    )
    doc = Document.objects.create(
        user=user,
        title="Vector Benchmark Doc.pdf",
        file_hash="dummy_hash_001",
    )

    query_vec = _generate_dense_vector(384, seed=1.0)
    # Closest: identical to query
    closest_vec = list(query_vec)
    # Far: inverted
    far_vec = [-x for x in query_vec]
    # Neutral / orthogonal
    orthogonal_vec = _generate_unit_vector(384, 10)

    c_close = DocumentChunk.objects.create(
        document=doc,
        chunk_index=0,
        page_number=1,
        text_content="Closest semantic match",
        embedding=closest_vec,
    )
    c_orth = DocumentChunk.objects.create(
        document=doc,
        chunk_index=1,
        page_number=1,
        text_content="Orthogonal match",
        embedding=orthogonal_vec,
    )
    c_far = DocumentChunk.objects.create(
        document=doc,
        chunk_index=2,
        page_number=1,
        text_content="Far match",
        embedding=far_vec,
    )

    # Order by cosine distance to query_vec
    ranked_chunks = list(
        DocumentChunk.objects.filter(document=doc)
        .order_by(CosineDistance("embedding", query_vec))
    )

    assert len(ranked_chunks) == 3
    # The first element must be the closest vector
    assert ranked_chunks[0].id == c_close.id
    # The last element must be the farthest vector
    assert ranked_chunks[-1].id == c_far.id


@pytest.mark.django_db
def test_document_upload_success() -> None:
    """Test 3: POST /api/documents/upload/ creates Document with SHA-256 and returns HTTP 202."""
    user = User.objects.create_user(
        email="uploader@enterprise.com",
        password="ValidPassword123!",
    )
    client = APIClient()
    client.force_authenticate(user=user)

    # Fake PDF file content
    pdf_content = b"%PDF-1.4 sample contract text stream for testing"
    uploaded_file = SimpleUploadedFile(
        name="Employment_Agreement.pdf",
        content=pdf_content,
        content_type="application/pdf",
    )

    response = client.post(
        "/api/documents/upload/",
        data={"file": uploaded_file, "title": "Employment Agreement 2026"},
        format="multipart",
    )

    assert response.status_code == 202
    data: Dict[str, Any] = response.json()
    assert data["title"] == "Employment Agreement 2026"
    assert data["status"] == "PENDING"
    assert data["file_hash"] != ""
    assert data["chunk_count"] == 0

    # Verify persisted in database
    doc = Document.objects.get(id=data["id"])
    assert doc.user == user
    assert doc.file_hash == data["file_hash"]


@pytest.mark.django_db
def test_document_upload_validation_errors() -> None:
    """Test 4: Non-PDF uploads and oversized files (>25MB) are rejected with HTTP 400."""
    user = User.objects.create_user(
        email="validator@enterprise.com",
        password="ValidPassword123!",
    )
    client = APIClient()
    client.force_authenticate(user=user)

    # Case A: Non-PDF file (.txt)
    txt_file = SimpleUploadedFile(
        name="contract.txt",
        content=b"plaintext contract",
        content_type="text/plain",
    )
    res_non_pdf = client.post(
        "/api/documents/upload/",
        data={"file": txt_file},
        format="multipart",
    )
    assert res_non_pdf.status_code == 400

    # Case B: Oversized file (>25MB)
    large_content = b"%PDF-1.4 " + b"0" * (25 * 1024 * 1024 + 1024)
    large_pdf = SimpleUploadedFile(
        name="huge.pdf",
        content=large_content,
        content_type="application/pdf",
    )

    res_oversized = client.post(
        "/api/documents/upload/",
        data={"file": large_pdf},
        format="multipart",
    )
    assert res_oversized.status_code == 400


@pytest.mark.django_db
def test_user_data_isolation() -> None:
    """Test 5: Verify user data isolation (User A cannot list or view User B's documents)."""
    user_a = User.objects.create_user(
        email="user_a@enterprise.com",
        password="Password123!",
    )
    user_b = User.objects.create_user(
        email="user_b@enterprise.com",
        password="Password123!",
    )

    doc_a = Document.objects.create(
        user=user_a,
        title="User A Confidential Policy.pdf",
        file_hash="hash_a",
    )
    DocumentChunk.objects.create(
        document=doc_a,
        chunk_index=0,
        page_number=1,
        text_content="Confidential clause for user A",
    )

    doc_b = Document.objects.create(
        user=user_b,
        title="User B Secret Contract.pdf",
        file_hash="hash_b",
    )

    client = APIClient()
    client.force_authenticate(user=user_b)

    # 1. User B lists documents -> only doc_b appears
    list_res = client.get("/api/documents/")
    assert list_res.status_code == 200
    b_docs = list_res.json()
    b_doc_ids = [d["id"] for d in b_docs]
    assert str(doc_b.id) in b_doc_ids
    assert str(doc_a.id) not in b_doc_ids

    # 2. User B tries to view doc_a details -> 404 Not Found
    detail_res = client.get(f"/api/documents/{doc_a.id}/")
    assert detail_res.status_code == 404

    # 3. User B tries to fetch doc_a chunks -> 404 Not Found
    chunks_res = client.get(f"/api/documents/{doc_a.id}/chunks/")
    assert chunks_res.status_code == 404


@pytest.mark.django_db
def test_media_file_serving_under_debug(settings: Any) -> None:
    """Test 6: Verify Django serves media files from MEDIA_ROOT under MEDIA_URL when DEBUG=True."""
    import importlib
    from django.urls import clear_url_caches
    import core.urls

    settings.DEBUG = True
    importlib.reload(core.urls)
    clear_url_caches()

    user = User.objects.create_user(email="media_test@enterprise.com", password="Password123!")
    pdf_content = b"%PDF-1.4 test document content"
    uploaded_file = SimpleUploadedFile("test_contract.pdf", pdf_content, content_type="application/pdf")

    doc = Document.objects.create(
        user=user,
        title="test_contract.pdf",
        file=uploaded_file,
        file_hash="hash_media_test",
    )
    assert doc.file.name is not None

    client = APIClient()
    media_url = doc.file.url
    response = client.get(media_url)
    assert response.status_code == 200
    assert b"".join(response.streaming_content) == pdf_content

    # Clean up test file from disk
    if doc.file and doc.file.storage.exists(doc.file.name):
        doc.file.storage.delete(doc.file.name)


