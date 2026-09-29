"""
Tests for TICKET-05: PyMuPDF Coordinate Extraction Pipeline, Chunking Engine, and Celery Ingestion Task.
Verifies PDFCoordinateChunker, VectorEmbeddingService, and Celery pipeline end-to-end.
"""
from typing import Any, List
import pymupdf
import pytest
from django.core.files.base import ContentFile

from apps.analytics.models import AuditBenchmarkLog, OperationType
from apps.authentication.models import User
from apps.documents.models import Document, DocumentChunk, DocumentStatus
from apps.documents.services.chunking import PDFCoordinateChunker
from apps.documents.services.embedding import VectorEmbeddingService
from apps.documents.tasks import process_document_pipeline


def _create_synthetic_test_pdf() -> bytes:
    """Create a minimal 2-page synthetic PDF with deterministic text and coordinates."""
    doc = pymupdf.open()

    # Page 1
    page1 = doc.new_page(width=612, height=792)  # Standard US Letter
    page1.insert_text(
        pymupdf.Point(72, 100),
        "CONFIDENTIAL MASTER SERVICES AGREEMENT",
        fontsize=16,
    )
    page1.insert_text(
        pymupdf.Point(72, 160),
        "This Agreement is entered into on January 15, 2026 by and between Enterprise Corp and Partner Inc. "
        "The Vendor agrees to provide cloud policy audit and automated compliance scanning services.",
        fontsize=12,
    )

    # Page 2
    page2 = doc.new_page(width=612, height=792)
    page2.insert_text(
        pymupdf.Point(72, 100),
        "SECTION 12: LIMITATION OF LIABILITY AND INDEMNIFICATION",
        fontsize=14,
    )
    page2.insert_text(
        pymupdf.Point(72, 150),
        "Neither party shall be liable for indirect, incidental, or consequential damages. "
        "The total aggregate liability under this Agreement shall not exceed the fees paid in the previous 12 months.",
        fontsize=12,
    )

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


@pytest.mark.django_db
def test_pdf_coordinate_chunker_extraction() -> None:
    """Test 1: Verify PDFCoordinateChunker extracts text, page numbers, and normalized coordinates."""
    pdf_bytes = _create_synthetic_test_pdf()
    chunker = PDFCoordinateChunker()
    result = chunker.chunk_pdf_bytes(pdf_bytes)

    assert result.page_count == 2
    assert len(result.chunks) >= 2

    # Verify Page 1 chunk
    chunk1 = result.chunks[0]
    assert chunk1.page_number == 1
    assert "CONFIDENTIAL MASTER SERVICES AGREEMENT" in chunk1.text_content
    bbox = chunk1.bounding_box
    assert "x0" in bbox and "y0" in bbox and "x1" in bbox and "y1" in bbox
    assert "norm_x0" in bbox and "norm_y0" in bbox and "norm_x1" in bbox and "norm_y1" in bbox
    assert 0.0 <= bbox["norm_x0"] <= 1.0
    assert 0.0 <= bbox["norm_y0"] <= 1.0
    assert 0.0 <= bbox["norm_x1"] <= 1.0
    assert 0.0 <= bbox["norm_y1"] <= 1.0
    assert bbox["norm_x1"] > bbox["norm_x0"]
    assert bbox["norm_y1"] > bbox["norm_y0"]

    # Verify Page 2 chunk
    chunk2 = [c for c in result.chunks if c.page_number == 2][0]
    assert "LIMITATION OF LIABILITY" in chunk2.text_content
    assert chunk2.bounding_box["norm_y0"] >= 0.0


@pytest.mark.django_db
def test_vector_embedding_service_384_dimensions() -> None:
    """Test 2: Verify VectorEmbeddingService generates 384-dim dense vectors and logs telemetry."""
    service = VectorEmbeddingService()
    sample_texts = [
        "Confidential arbitration and dispute resolution clause under Delaware law.",
        "Force majeure includes acts of God, strikes, and government restrictions.",
    ]

    embeddings: List[List[float]] = service.generate_embeddings(sample_texts)

    assert len(embeddings) == 2
    assert len(embeddings[0]) == 384
    assert len(embeddings[1]) == 384
    assert all(isinstance(val, float) for val in embeddings[0])

    # Verify telemetry log recorded
    log = AuditBenchmarkLog.objects.filter(
        operation=OperationType.EMBEDDING_GEN,
        status="SUCCESS",
    ).first()
    assert log is not None
    assert log.duration_ms > 0.0


@pytest.mark.django_db
def test_process_document_pipeline_end_to_end() -> None:
    """Test 3: Verify Celery pipeline processes PDF, transitions status, and populates vectors."""
    user = User.objects.create_user(
        email="pipelineuser@enterprise.com",
        password="ValidPassword123!",
    )
    pdf_bytes = _create_synthetic_test_pdf()
    doc = Document.objects.create(
        user=user,
        title="Master Agreement 2026.pdf",
        file_hash="test_pipeline_hash_001",
        status=DocumentStatus.PENDING,
    )
    doc.file.save("Master_Agreement_2026.pdf", ContentFile(pdf_bytes))
    doc.save()

    # Execute pipeline synchronously
    process_document_pipeline(str(doc.id))

    # Reload document state
    doc.refresh_from_db()
    assert doc.status == DocumentStatus.READY
    assert doc.page_count == 2
    assert doc.error_message in (None, "")

    # Verify chunks created in PostgreSQL
    chunks = DocumentChunk.objects.filter(document=doc).order_by("chunk_index")
    assert chunks.count() >= 2

    first_chunk = chunks.first()
    assert first_chunk is not None
    assert first_chunk.page_number == 1
    assert len(first_chunk.embedding) == 384
    assert first_chunk.search_vector is not None

    # Verify ingestion telemetry record created
    ingest_log = AuditBenchmarkLog.objects.filter(
        operation=OperationType.INGEST_CHUNK_PARSE,
        status="SUCCESS",
    ).first()
    assert ingest_log is not None


@pytest.mark.django_db
def test_process_document_pipeline_corrupt_file_failure() -> None:
    """Test 4: Verify corrupt PDF causes pipeline to set status=FAILED and log error."""
    user = User.objects.create_user(
        email="failuser@enterprise.com",
        password="ValidPassword123!",
    )
    doc = Document.objects.create(
        user=user,
        title="Corrupted_Contract.pdf",
        file_hash="corrupt_hash_999",
        status=DocumentStatus.PENDING,
    )
    doc.file.save("corrupt.pdf", ContentFile(b"Not a valid PDF file stream at all!"))
    doc.save()

    process_document_pipeline(str(doc.id))

    doc.refresh_from_db()
    assert doc.status == DocumentStatus.FAILED
    assert doc.error_message is not None
    assert len(doc.error_message) > 0
    assert DocumentChunk.objects.filter(document=doc).count() == 0
