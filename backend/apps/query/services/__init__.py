"""Query services package."""
from apps.query.services.citation import CitationEngine
from apps.query.services.dispatcher import ConcurrentMapDispatcher
from apps.query.services.gater import ConfidenceGater
from apps.query.services.reducer import MultiDocReduceSynthesizer
from apps.query.services.synthesis import GroqSynthesisService
from apps.query.services.verifier import (
    CitationValidator,
    ConfidenceLevel,
    VerificationResult,
)
from apps.query.services.worker import DocumentAuditWorker, normalize_bounding_box

__all__ = [
    "CitationEngine",
    "CitationValidator",
    "ConfidenceGater",
    "ConfidenceLevel",
    "ConcurrentMapDispatcher",
    "DocumentAuditWorker",
    "GroqSynthesisService",
    "MultiDocReduceSynthesizer",
    "VerificationResult",
    "normalize_bounding_box",
]
