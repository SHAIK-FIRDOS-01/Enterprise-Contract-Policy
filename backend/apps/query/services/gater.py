"""
Deterministic Confidence Gater Service.
Evaluates multi-document evidence bundles against configurable confidence thresholds (tau=0.85),
routing queries to SYSTEM_1_FAST_PATH (bypassing LLM inference for high-confidence single-doc facts)
or escalating to SYSTEM_2_FRONTIER for cross-clause multi-document map-reduce synthesis.
"""
import re
from typing import Any, Dict, List, Optional
from django.conf import settings

from apps.query.services.verifier import CitationValidator


def _score_candidate(candidate: str, query_words: set) -> float:
    words = set(re.findall(r"\b[a-zA-Z0-9_]{2,}\b", candidate.lower()))
    if not query_words or not words:
        return 0.0
    overlap = len(query_words.intersection(words))
    score = overlap / len(query_words)
    if re.search(r"[\$0-9]", candidate):
        score += 0.2
    return score


def extract_focused_span(query: str, text: str, max_chars: int = 500) -> str:
    """
    Extracts the most relevant, concise text span matching query terms
    instead of dumping an entire raw chunk.
    """
    cleaned = text.strip()
    if len(cleaned) <= 150:
        return cleaned

    stopwords = {
        "what", "is", "the", "of", "in", "for", "to", "a", "an", "and", "or",
        "how", "much", "did", "tell", "me", "find", "show", "give", "are",
        "were", "was", "be", "been", "being", "have", "has", "had", "do",
        "does", "did", "at", "by", "with", "from", "as", "into", "about", "which",
    }
    raw_query = set(re.findall(r"\b[a-zA-Z0-9_]{2,}\b", query.lower()))
    query_words = raw_query - stopwords or raw_query

    candidates: List[str] = []
    # 1. Paragraphs
    candidates.extend(p.strip() for p in re.split(r"\n\s*\n", cleaned) if p.strip())
    # 2. Sentences
    candidates.extend(s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if len(s.strip()) > 20)
    # 3. Line windows
    raw_lines = [line.strip() for line in cleaned.splitlines() if line.strip()]
    for i in range(len(raw_lines)):
        candidates.append("\n".join(raw_lines[max(0, i - 2): min(len(raw_lines), i + 2)]))

    best_candidate = ""
    best_score = -1.0
    for cand in candidates:
        if len(cand) <= max_chars:
            score = _score_candidate(cand, query_words)
            if score > best_score:
                best_score = score
                best_candidate = cand

    if best_candidate and best_score >= 0.4:
        return best_candidate

    return cleaned[:max_chars].strip() + ("..." if len(cleaned) > max_chars else "")


class ConfidenceGater:
    """
    Deterministic Confidence Gater.
    Analyzes retrieval confidence and multi-document scope to route queries:
    - SYSTEM_1_FAST_PATH: Single-document factual queries with confidence >= tau.
    - SYSTEM_2_FRONTIER: Multi-document comparisons or queries with confidence < tau.
    """

    def __init__(
        self,
        threshold: Optional[float] = None,
        validator: Optional[CitationValidator] = None,
    ) -> None:
        configured_threshold = getattr(settings, "CONFIDENCE_THRESHOLD", 0.85)
        self.threshold = float(threshold if threshold is not None else configured_threshold)
        self.validator = validator or CitationValidator()

    def evaluate(
        self,
        query: str,
        bundles: List[Dict[str, Any]],
        is_multi_doc: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Evaluates retrieval evidence bundles and decides routing path.

        Args:
            query: Natural language user query.
            bundles: Output bundles from ConcurrentMapDispatcher.
            is_multi_doc: Optional explicit flag. If None, inferred from document count and intent.

        Returns:
            Dict:
            {
                "route": "SYSTEM_1_FAST_PATH" | "SYSTEM_2_FRONTIER",
                "confidence_score": float,
                "reason": str,
                "is_multi_doc": bool,
                "grounded_evidence": list[dict],
                "fast_path_payload": Optional[dict],
            }
        """
        query_clean = query.strip()
        successful_bundles = [b for b in bundles if b.get("status") == "SUCCESS"]

        # Build normalized grounded evidence grouped by document
        grounded_evidence: List[Dict[str, Any]] = []
        for bundle in successful_bundles:
            chunks = bundle.get("candidate_chunks", [])
            doc_id = str(bundle.get("document_id", ""))
            doc_title = chunks[0].get("document_title", "Document") if chunks else "Document"
            grounded_evidence.append({
                "document_id": doc_id,
                "document_title": doc_title,
                "chunks": chunks,
            })

        # Determine multi-document status
        unique_docs = {b.get("document_id") for b in successful_bundles if b.get("document_id")}
        if is_multi_doc is not None:
            multi_doc_flag = is_multi_doc
        else:
            multi_doc_flag = len(unique_docs) > 1

        # If no chunks were retrieved at all
        all_chunks = [
            chunk
            for bundle in successful_bundles
            for chunk in bundle.get("candidate_chunks", [])
        ]
        if not all_chunks:
            return {
                "route": "SYSTEM_2_FRONTIER",
                "confidence_score": 0.0,
                "reason": "No candidate chunks retrieved across document pool.",
                "is_multi_doc": multi_doc_flag,
                "grounded_evidence": grounded_evidence,
                "fast_path_payload": None,
            }

        # Multi-document queries must always escalate to System 2 Frontier
        if multi_doc_flag:
            return {
                "route": "SYSTEM_2_FRONTIER",
                "confidence_score": 1.0,
                "reason": "Multi-document query requires reduce-stage cross-clause synthesis.",
                "is_multi_doc": True,
                "grounded_evidence": grounded_evidence,
                "fast_path_payload": None,
            }

        # Compound or multi-clause query patterns requiring LLM reasoning/synthesis
        compound_patterns = [
            r"\band\s+(?:how|what|why|where|when|who|which)\b",
            r"\b(?:compare|contrast|difference|breakdown|reconcil)\b",
            r"\?.*\?",
        ]
        if any(re.search(pat, query_clean, re.IGNORECASE) for pat in compound_patterns):
            return {
                "route": "SYSTEM_2_FRONTIER",
                "confidence_score": 0.5,
                "reason": "Compound query requires multi-clause reasoning and synthesis.",
                "is_multi_doc": False,
                "grounded_evidence": grounded_evidence,
                "fast_path_payload": None,
            }

        # Single document path: evaluate top chunk confidence
        top_chunk = all_chunks[0]
        text_content = top_chunk.get("text_content", "")

        lexical_score = self.validator.compute_lexical_containment(query_clean, text_content)
        semantic_score = self.validator.compute_semantic_similarity(query_clean, text_content)

        confidence_score = max(0.0, min(1.0, (0.4 * lexical_score) + (0.6 * semantic_score)))
        confidence_rounded = round(confidence_score, 4)

        if confidence_rounded >= self.threshold:
            focused_span = extract_focused_span(query_clean, text_content)
            formatted_span = f"**Direct Grounded Span** [Ref:1]:\n\n{focused_span}"
            fast_path_payload: Optional[Dict[str, Any]] = {
                "document_id": str(top_chunk.get("document_id")),
                "chunk_id": str(top_chunk.get("chunk_id")),
                "document_title": top_chunk.get("document_title", ""),
                "page_number": int(top_chunk.get("page_number", 1)),
                "bounding_box": top_chunk.get("bounding_box", {}),
                "extracted_span": formatted_span,
            }
            return {
                "route": "SYSTEM_1_FAST_PATH",
                "confidence_score": confidence_rounded,
                "reason": (
                    f"High-confidence factual grounding ({confidence_rounded:.2f} >= "
                    f"{self.threshold:.2f}) on single document."
                ),
                "is_multi_doc": False,
                "grounded_evidence": grounded_evidence,
                "fast_path_payload": fast_path_payload,
            }

        return {
            "route": "SYSTEM_2_FRONTIER",
            "confidence_score": confidence_rounded,
            "reason": (
                f"Top candidate confidence ({confidence_rounded:.2f}) below "
                f"threshold ceiling ({self.threshold:.2f})."
            ),
            "is_multi_doc": False,
            "grounded_evidence": grounded_evidence,
            "fast_path_payload": None,
        }
