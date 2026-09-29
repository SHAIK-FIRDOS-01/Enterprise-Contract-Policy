"""
Celery asynchronous ingestion tasks for document structure extraction,
coordinate chunking, vector embedding generation, and full-text search indexing.
"""
import logging
import traceback
from typing import List
from celery import shared_task
from django.contrib.postgres.search import SearchVector

from apps.analytics.services.telemetry import track_telemetry
from apps.documents.models import Document, DocumentChunk, DocumentStatus
from apps.documents.services.chunking import PDFCoordinateChunker
from apps.documents.services.embedding import VectorEmbeddingService

logger = logging.getLogger(__name__)


@shared_task(name="apps.documents.tasks.process_document_pipeline")
def process_document_pipeline(document_id: str) -> None:
    """
    End-to-end ingestion pipeline for contract and policy PDFs:
    1. Status: PARSING -> PyMuPDF coordinate & bounding-box extraction.
    2. Status: INDEXING -> Batch 384-dim embedding generation & SearchVector indexing.
    3. Status: READY -> Available for dense vector search and citation sync.
    On failure: Sets status = FAILED and records formatted traceback.
    """
    try:
        document = Document.objects.get(id=document_id)
    except Document.DoesNotExist:
        logger.error(f"Document with ID {document_id} not found.")
        return

    try:
        # Step 1: Transition to PARSING
        document.status = DocumentStatus.PARSING
        document.error_message = None
        document.save(update_fields=["status", "error_message"])

        with track_telemetry(
            operation="INGEST_CHUNK_PARSE",
            model_name="pymupdf",
            metadata={"document_id": str(document.id)},
        ):
            # Read file bytes from storage
            document.file.open("rb")
            try:
                pdf_bytes = document.file.read()
            finally:
                document.file.close()

            chunker = PDFCoordinateChunker()
            chunk_result = chunker.chunk_pdf_bytes(pdf_bytes)

            if not chunk_result.chunks:
                raise ValueError("No extractable text blocks found in the uploaded PDF.")

            # Step 2: Transition to INDEXING
            document.status = DocumentStatus.INDEXING
            document.page_count = chunk_result.page_count
            document.save(update_fields=["status", "page_count"])

            # Generate embeddings
            embedding_service = VectorEmbeddingService()
            texts = [c.text_content for c in chunk_result.chunks]
            embeddings: List[List[float]] = embedding_service.generate_embeddings(texts)

            # Step 3: Persist chunks to PostgreSQL
            # Clear any preexisting chunks for idempotency
            DocumentChunk.objects.filter(document=document).delete()

            chunk_objects = [
                DocumentChunk(
                    document=document,
                    chunk_index=chunk_data.chunk_index,
                    page_number=chunk_data.page_number,
                    text_content=chunk_data.text_content,
                    bounding_box=chunk_data.bounding_box,
                    embedding=embeddings[i],
                    metadata=chunk_data.metadata,
                )
                for i, chunk_data in enumerate(chunk_result.chunks)
            ]
            DocumentChunk.objects.bulk_create(chunk_objects)

            # Populate tsvector search vector for full-text search
            DocumentChunk.objects.filter(document=document).update(
                search_vector=SearchVector("text_content")
            )

            # Step 4: Transition to READY
            document.status = DocumentStatus.READY
            document.error_message = None
            document.save(update_fields=["status", "error_message"])

    except Exception as exc:
        logger.exception(f"Document processing failed for {document_id}: {exc}")
        document.status = DocumentStatus.FAILED
        document.error_message = f"{type(exc).__name__}: {str(exc)}\n{traceback.format_exc()}"
        document.save(update_fields=["status", "error_message"])
