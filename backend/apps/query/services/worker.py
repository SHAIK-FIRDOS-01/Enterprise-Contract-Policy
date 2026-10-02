"""
Document Audit Worker Service.
Executes isolated single-document hybrid RRF retrieval within strict SQL parameter boundaries,
preventing cross-document context contamination. Normalizes PDF bounding-box coordinates
into structured candidate evidence payloads.
"""
import json
import logging
import time
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from apps.documents.models import Document
from apps.search.services.hybrid_search import HybridSearchService

logger = logging.getLogger(__name__)


def normalize_bounding_box(raw_bbox: Any) -> Dict[str, float]:
    """
    Normalizes arbitrary bounding box representations into a standard dictionary
    with float coordinates: {'x0': float, 'y0': float, 'x1': float, 'y1': float}.
    Handles JSON strings, missing keys, and invalid types with safe float coercion.
    """
    default_bbox = {"x0": 0.0, "y0": 0.0, "x1": 0.0, "y1": 0.0}
    if not raw_bbox:
        return default_bbox

    bbox_dict: Dict[str, Any] = {}
    if isinstance(raw_bbox, str):
        try:
            parsed = json.loads(raw_bbox)
            if isinstance(parsed, dict):
                bbox_dict = parsed
        except (ValueError, TypeError):
            return default_bbox
    elif isinstance(raw_bbox, dict):
        bbox_dict = raw_bbox
    else:
        return default_bbox

    normalized: Dict[str, float] = {}
    for key in ("x0", "y0", "x1", "y1"):
        val = bbox_dict.get(key, 0.0)
        try:
            normalized[key] = float(val)
        except (ValueError, TypeError):
            normalized[key] = 0.0

    return normalized


class DocumentAuditWorker:
    """
    Scoped document audit worker.
    Enforces strict retrieval context isolation by pre-filtering SQL execution via
    `document_id = %(document_id)s` to eliminate cross-document context contamination.
    """

    def __init__(self, search_service: Optional[HybridSearchService] = None) -> None:
        self.search_service = search_service or HybridSearchService()

    def execute(
        self,
        document_id: Union[UUID, str],
        query_text: str,
        user_id: Optional[Union[UUID, str]] = None,
        top_k: int = 5,
        dense_weight: float = 0.5,
        sparse_weight: float = 0.5,
        candidate_limit: int = 20,
        **filters: Any,
    ) -> Dict[str, Any]:
        """
        Executes scoped hybrid search (pgvector dense + tsvector lexical via RRF k=60)
        within the single document boundary.

        Args:
            document_id: Target document UUID.
            query_text: Natural language or keyword query string.
            user_id: Optional user UUID. If omitted, resolved from the document owner.
            top_k: Maximum candidate chunks to retrieve.
            dense_weight: Dense RRF component weight (default 0.5).
            sparse_weight: Sparse RRF component weight (default 0.5).
            candidate_limit: Candidate pool size retrieved prior to RRF fusion.

        Returns:
            Dictionary bundle:
            {
                "document_id": str,
                "status": "SUCCESS" | "FAILED",
                "duration_ms": float,
                "candidate_chunks": list[dict],
            }
        """
        start_time = time.perf_counter()
        doc_id_str = str(document_id)

        try:
            # Resolve owner user_id if not explicitly provided
            resolved_user_id: Optional[Union[UUID, str]] = user_id
            if resolved_user_id is None:
                doc_owner = (
                    Document.objects.filter(id=document_id)
                    .values_list("user_id", flat=True)
                    .first()
                )
                if doc_owner is None:
                    duration_ms = (time.perf_counter() - start_time) * 1000
                    return {
                        "document_id": doc_id_str,
                        "status": "FAILED",
                        "duration_ms": round(duration_ms, 2),
                        "candidate_chunks": [],
                        "error_message": f"Document {doc_id_str} not found.",
                    }
                resolved_user_id = doc_owner

            # Execute strictly scoped hybrid search
            search_results = self.search_service.search(
                user_id=resolved_user_id,
                query=query_text,
                document_id=document_id,
                top_k=top_k,
                dense_weight=dense_weight,
                sparse_weight=sparse_weight,
                candidate_limit=candidate_limit,
            )

            # Format and normalize candidate chunks
            candidate_chunks: List[Dict[str, Any]] = [
                {
                    "chunk_id": str(chunk.chunk_id),
                    "document_id": str(chunk.document_id),
                    "document_title": chunk.document_title,
                    "page_number": chunk.page_number,
                    "chunk_index": chunk.chunk_index,
                    "text_content": chunk.text_content,
                    "bounding_box": normalize_bounding_box(chunk.bounding_box),
                    "dense_rank": chunk.dense_rank,
                    "sparse_rank": chunk.sparse_rank,
                    "rrf_score": round(chunk.rrf_score, 6),
                }
                for chunk in search_results
            ]

            duration_ms = (time.perf_counter() - start_time) * 1000
            return {
                "document_id": doc_id_str,
                "status": "SUCCESS",
                "duration_ms": round(duration_ms, 2),
                "candidate_chunks": candidate_chunks,
            }

        except Exception as exc:
            duration_ms = (time.perf_counter() - start_time) * 1000
            logger.warning(
                "DocumentAuditWorker failed for document %s: %s",
                doc_id_str,
                exc,
                exc_info=True,
            )
            return {
                "document_id": doc_id_str,
                "status": "FAILED",
                "duration_ms": round(duration_ms, 2),
                "candidate_chunks": [],
                "error_message": str(exc),
            }
