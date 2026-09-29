"""Audit Benchmark and Operational Telemetry Models."""
import uuid
from decimal import Decimal
from django.db import models


class OperationType(models.TextChoices):
    """Operation types tracked by the operational telemetry engine."""
    INGEST_CHUNK_PARSE = "INGEST_CHUNK_PARSE", "Document Chunk Parsing"
    EMBEDDING_GEN = "EMBEDDING_GEN", "Dense Embedding Generation"
    RRF_RETRIEVAL = "RRF_RETRIEVAL", "Reciprocal Rank Fusion Retrieval"
    LLM_SYNTHESIS = "LLM_SYNTHESIS", "LLM Inference and Answer Synthesis"
    CITATION_VERIFY = "CITATION_VERIFY", "Citation Grounding Verification"
    AUTH_VERIFY = "AUTH_VERIFY", "Authentication Verification"


class AuditBenchmarkLog(models.Model):
    """
    Log record capturing real operational telemetry, execution timing,
    token consumption, and estimated dollar costs per Groq rate tables.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    operation = models.CharField(
        max_length=64,
        choices=OperationType.choices,
        db_index=True,
    )
    model_name = models.CharField(max_length=128, default="system")
    duration_ms = models.FloatField(
        help_text="Execution duration in milliseconds measured via time.perf_counter()",
    )
    prompt_tokens = models.IntegerField(default=0)
    completion_tokens = models.IntegerField(default=0)
    total_tokens = models.IntegerField(default=0)
    estimated_cost_usd = models.DecimalField(
        max_digits=10,
        decimal_places=6,
        default=Decimal("0.000000"),
        help_text="Estimated dollar cost calculated per official rate tables",
    )
    status = models.CharField(
        max_length=16,
        default="SUCCESS",
        db_index=True,
        choices=[("SUCCESS", "SUCCESS"), ("FAILED", "FAILED")],
    )
    error_message = models.TextField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = "analytics_auditbenchmarklog"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["operation", "status"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"[{self.status}] {self.operation} ({self.duration_ms:.2f}ms)"
