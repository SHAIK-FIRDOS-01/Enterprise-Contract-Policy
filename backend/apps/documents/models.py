"""
Document and DocumentChunk models supporting PyMuPDF bounding-box extraction,
full-text search via tsvector, and 384-dimensional dense pgvector HNSW indexing.
"""
import uuid
from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
from django.db import models
from pgvector.django import HnswIndex, VectorField


class DocumentStatus(models.TextChoices):
    """Lifecycle state of an uploaded contract or policy document."""
    PENDING = "PENDING", "Pending Ingestion"
    PARSING = "PARSING", "Parsing Structure & Bboxes"
    INDEXING = "INDEXING", "Generating Embeddings & Indexes"
    READY = "READY", "Ready for Query & Retrieval"
    FAILED = "FAILED", "Processing Failed"


class Document(models.Model):
    """
    Contract or policy PDF document uploaded by an enterprise user.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="documents",
    )
    title = models.CharField(max_length=255)
    file = models.FileField(upload_to="contracts/%Y/%m/")
    file_hash = models.CharField(max_length=64, db_index=True)
    page_count = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=32,
        choices=DocumentStatus.choices,
        default=DocumentStatus.PENDING,
    )
    error_message = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "documents_document"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.title} ({self.status})"


class DocumentChunk(models.Model):
    """
    Fine-grained semantic chunk extracted from a document page, preserving
    exact bounding box coordinates for frontend PDF.js canvas overlay synchronization.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document = models.ForeignKey(
        Document,
        on_delete=models.CASCADE,
        related_name="chunks",
    )
    chunk_index = models.PositiveIntegerField()
    page_number = models.PositiveIntegerField()
    text_content = models.TextField()
    bounding_box = models.JSONField(default=dict)
    embedding = VectorField(dimensions=384, null=True, blank=True)
    search_vector = SearchVectorField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "documents_chunk"
        ordering = ["document", "chunk_index"]
        indexes = [
            HnswIndex(
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
                name="chunk_embedding_hnsw_idx",
            ),
            GinIndex(
                fields=["search_vector"],
                name="chunk_search_vec_gin_idx",
            ),
            models.Index(
                fields=["document", "page_number"],
                name="chunk_doc_page_idx",
            ),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["document", "chunk_index"],
                name="unique_document_chunk_index",
            ),
        ]

    def __str__(self) -> str:
        return f"Doc {self.document_id} Chunk {self.chunk_index} (Page {self.page_number})"
