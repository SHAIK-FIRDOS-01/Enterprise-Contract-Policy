"""
Telemetry Engine Service.
Provides high-precision timing, token usage tracking, Groq cost estimation,
and automatic error capture into AuditBenchmarkLog.
"""
import time
import traceback
from contextlib import contextmanager
from decimal import Decimal
from typing import Any, Dict, Generator, Optional

from apps.analytics.models import AuditBenchmarkLog

# Official Groq pricing table (costs per 1,000,000 tokens)
GROQ_RATE_TABLE: Dict[str, Dict[str, Decimal]] = {
    "llama-3.3-70b-versatile": {
        "prompt": Decimal("0.59"),
        "completion": Decimal("0.79"),
    },
    "qwen/qwen3.8-27b": {
        "prompt": Decimal("0.59"),
        "completion": Decimal("0.79"),
    },
    "openai/gpt-oss-120b": {
        "prompt": Decimal("0.59"),
        "completion": Decimal("0.79"),
    },
    "llama-3.1-70b-versatile": {
        "prompt": Decimal("0.59"),
        "completion": Decimal("0.79"),
    },
    "llama-3.1-8b-instant": {
        "prompt": Decimal("0.05"),
        "completion": Decimal("0.08"),
    },
    "mixtral-8x7b-32768": {
        "prompt": Decimal("0.24"),
        "completion": Decimal("0.24"),
    },
}


def calculate_groq_cost(
    model_name: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> Decimal:
    """
    Calculate the estimated USD cost of an operation based on model name
    and token usage according to Groq published rate cards.
    Local models (e.g. sentence-transformers) return Decimal('0.000000').
    """
    rates = GROQ_RATE_TABLE.get(model_name)
    if not rates:
        return Decimal("0.000000")

    prompt_rate_per_token = rates["prompt"] / Decimal("1000000")
    completion_rate_per_token = rates["completion"] / Decimal("1000000")

    total_cost = (Decimal(prompt_tokens) * prompt_rate_per_token) + (
        Decimal(completion_tokens) * completion_rate_per_token
    )
    return total_cost.quantize(Decimal("0.000001"))


class TelemetryTracker:
    """Mutable tracker object passed to track_telemetry context block."""

    def __init__(
        self,
        operation: str,
        model_name: str = "system",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.operation = operation
        self.model_name = model_name
        self.metadata = dict(metadata or {})
        self.prompt_tokens = 0
        self.completion_tokens = 0
        self.log_instance: Optional[AuditBenchmarkLog] = None

    def set_tokens(self, prompt_tokens: int = 0, completion_tokens: int = 0) -> None:
        """Update token counts for the operation."""
        self.prompt_tokens = prompt_tokens
        self.completion_tokens = completion_tokens

    def add_metadata(self, key: str, value: Any) -> None:
        """Add arbitrary contextual metadata to the log entry."""
        self.metadata[key] = value


@contextmanager
def track_telemetry(
    operation: str,
    model_name: str = "system",
    metadata: Optional[Dict[str, Any]] = None,
) -> Generator[TelemetryTracker, None, None]:
    """
    Context manager measuring wall-clock duration via time.perf_counter(),
    capturing token economics, and persisting an AuditBenchmarkLog record.
    If an unhandled exception occurs inside the block, it records status='FAILED',
    captures the stack trace, persists the failure log, and re-raises.
    """
    tracker = TelemetryTracker(
        operation=operation,
        model_name=model_name,
        metadata=metadata,
    )
    t0 = time.perf_counter()

    try:
        yield tracker
        duration_ms = (time.perf_counter() - t0) * 1000.0
        total_tokens = tracker.prompt_tokens + tracker.completion_tokens
        cost = calculate_groq_cost(
            tracker.model_name,
            tracker.prompt_tokens,
            tracker.completion_tokens,
        )

        tracker.log_instance = AuditBenchmarkLog.objects.create(
            operation=tracker.operation,
            model_name=tracker.model_name,
            duration_ms=round(duration_ms, 3),
            prompt_tokens=tracker.prompt_tokens,
            completion_tokens=tracker.completion_tokens,
            total_tokens=total_tokens,
            estimated_cost_usd=cost,
            status="SUCCESS",
            metadata=tracker.metadata,
        )
    except Exception as exc:
        duration_ms = (time.perf_counter() - t0) * 1000.0
        err_msg = traceback.format_exc()

        tracker.log_instance = AuditBenchmarkLog.objects.create(
            operation=tracker.operation,
            model_name=tracker.model_name,
            duration_ms=round(duration_ms, 3),
            prompt_tokens=tracker.prompt_tokens,
            completion_tokens=tracker.completion_tokens,
            total_tokens=tracker.prompt_tokens + tracker.completion_tokens,
            estimated_cost_usd=Decimal("0.000000"),
            status="FAILED",
            error_message=err_msg or str(exc),
            metadata=tracker.metadata,
        )
        raise
