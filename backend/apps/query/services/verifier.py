"""
Citation Verification Engine.
Provides deterministic, ground-truth validation of synthesized citations
combining lexical containment ratio with dense embedding cosine similarity.
Calculates composite confidence scores and flags hallucinated citations.
"""
from dataclasses import dataclass
from enum import Enum
import re
from typing import Any, Dict, List, Optional

from apps.analytics.services.telemetry import track_telemetry
from apps.documents.services.embedding import VectorEmbeddingService
from apps.query.services.citation import CitationEngine
from apps.search.services.hybrid_search import SearchResult


class ConfidenceLevel(str, Enum):
    """Categorical classification of citation grounding confidence."""
    HIGH = "HIGH"          # >= 0.75: Grounded and verified claim
    MEDIUM = "MEDIUM"      # >= 0.50: Tentative claim with partial overlap
    REJECTED = "REJECTED"  # < 0.50: Hallucinated citation or ungrounded claim


@dataclass
class VerificationResult:
    """Evaluation result for an individual cited claim against source chunk."""
    claim_text: str
    ref_id: int
    source_chunk_text: str
    bounding_box: Dict[str, Any]
    lexical_score: float
    semantic_score: float
    confidence_score: float
    status: ConfidenceLevel

    def to_dict(self) -> Dict[str, Any]:
        """Convert VerificationResult into a JSON-serializable dictionary."""
        return {
            "claim_text": self.claim_text,
            "ref_id": self.ref_id,
            "bounding_box": self.bounding_box,
            "lexical_score": round(self.lexical_score, 4),
            "semantic_score": round(self.semantic_score, 4),
            "confidence_score": round(self.confidence_score, 4),
            "status": self.status.value,
        }


class CitationValidator:
    """
    Deterministic validator evaluating factual grounding of citations
    without calling an external LLM.
    """

    def __init__(
        self,
        embedding_service: Optional[VectorEmbeddingService] = None,
    ) -> None:
        self.embedding_service = embedding_service or VectorEmbeddingService()

    def compute_lexical_containment(self, claim: str, source: str) -> float:
        """
        Calculate lexical containment: fraction of significant claim words
        present in the source chunk text.
        """
        claim_words = set(re.findall(r"\b[a-zA-Z0-9_]{2,}\b", claim.lower()))
        source_words = set(re.findall(r"\b[a-zA-Z0-9_]{2,}\b", source.lower()))

        if not claim_words:
            return 0.0

        overlap = claim_words.intersection(source_words)
        return len(overlap) / len(claim_words)

    def compute_semantic_similarity(self, claim: str, source: str) -> float:
        """
        Calculate cosine similarity between claim embedding and source chunk embedding.
        Embeddings produced by VectorEmbeddingService are L2-normalized.
        """
        if not claim.strip() or not source.strip():
            return 0.0

        vec_claim = self.embedding_service.generate_embedding(claim)
        vec_source = self.embedding_service.generate_embedding(source)

        # Dot product of unit vectors equals cosine similarity
        dot_product = sum(a * b for a, b in zip(vec_claim, vec_source))
        return max(0.0, min(1.0, float(dot_product)))

    def verify_claim(
        self,
        claim_text: str,
        ref_id: int,
        source_chunk_text: str,
        bounding_box: Dict[str, Any],
    ) -> VerificationResult:
        """
        Evaluate a single claim against its referenced source chunk.

        Formula:
            Confidence = 0.4 * Lexical_Score + 0.6 * Cosine_Similarity

        Thresholds:
            >= 0.75: HIGH
            >= 0.50: MEDIUM
            <  0.50: REJECTED
        """
        clean_claim = re.sub(r"\[Ref:\s*\d+\]", "", claim_text).strip()

        if not clean_claim or not source_chunk_text.strip():
            return VerificationResult(
                claim_text=claim_text,
                ref_id=ref_id,
                source_chunk_text=source_chunk_text,
                bounding_box=bounding_box,
                lexical_score=0.0,
                semantic_score=0.0,
                confidence_score=0.0,
                status=ConfidenceLevel.REJECTED,
            )

        lexical_score = self.compute_lexical_containment(clean_claim, source_chunk_text)
        semantic_score = self.compute_semantic_similarity(clean_claim, source_chunk_text)

        composite_confidence = (0.4 * lexical_score) + (0.6 * semantic_score)
        composite_confidence = max(0.0, min(1.0, composite_confidence))

        if composite_confidence >= 0.75:
            status = ConfidenceLevel.HIGH
        elif composite_confidence >= 0.50:
            status = ConfidenceLevel.MEDIUM
        else:
            status = ConfidenceLevel.REJECTED

        return VerificationResult(
            claim_text=claim_text,
            ref_id=ref_id,
            source_chunk_text=source_chunk_text,
            bounding_box=bounding_box,
            lexical_score=lexical_score,
            semantic_score=semantic_score,
            confidence_score=composite_confidence,
            status=status,
        )

    def verify_synthesis(
        self,
        synthesis_text: str,
        retrieved_chunks: List[SearchResult],
    ) -> List[VerificationResult]:
        """
        Parse all cited claims from synthesized text and verify each against
        its corresponding source chunk.
        Instruments execution duration in AuditBenchmarkLog.
        """
        with track_telemetry(
            operation="CITATION_VERIFY",
            model_name="system",
            metadata={"chunk_count": len(retrieved_chunks)},
        ) as tracker:
            results: List[VerificationResult] = []
            if not synthesis_text.strip() or not retrieved_chunks:
                return results

            # Split into sentence units
            sentences = re.split(r"(?<=[.!?])\s+", synthesis_text.strip())

            for sentence in sentences:
                matches = CitationEngine.CITATION_PATTERN.findall(sentence)
                for match in matches:
                    ref_id = int(match)
                    if 1 <= ref_id <= len(retrieved_chunks):
                        chunk = retrieved_chunks[ref_id - 1]
                        res = self.verify_claim(
                            claim_text=sentence,
                            ref_id=ref_id,
                            source_chunk_text=chunk.text_content,
                            bounding_box=chunk.bounding_box,
                        )
                        results.append(res)
                    else:
                        # Out of range citation marker is by definition rejected
                        results.append(
                            VerificationResult(
                                claim_text=sentence,
                                ref_id=ref_id,
                                source_chunk_text="",
                                bounding_box={},
                                lexical_score=0.0,
                                semantic_score=0.0,
                                confidence_score=0.0,
                                status=ConfidenceLevel.REJECTED,
                            )
                        )

            tracker.add_metadata("verified_claims_count", len(results))

        return results
