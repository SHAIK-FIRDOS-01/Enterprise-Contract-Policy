"""
Hybrid Search Service.
Combines 384-dimensional dense vector embeddings (pgvector cosine distance)
with sparse full-text keyword retrieval (PostgreSQL tsvector / websearch_to_tsquery)
via Reciprocal Rank Fusion (RRF k=60).
"""
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Union
from uuid import UUID

from django.db import connection

from apps.analytics.services.telemetry import track_telemetry
from apps.documents.services.embedding import VectorEmbeddingService


@dataclass
class SearchResult:
    """
    Ranked search result combining dense semantic similarity and sparse full-text relevance
    with exact PDF bounding-box coordinates for frontend overlay synchronization.
    """
    chunk_id: UUID
    document_id: UUID
    document_title: str
    page_number: int
    chunk_index: int
    text_content: str
    bounding_box: Dict[str, Any]
    dense_rank: Optional[int]
    sparse_rank: Optional[int]
    rrf_score: float

    def to_dict(self) -> Dict[str, Any]:
        """Convert SearchResult into a JSON-serializable dictionary."""
        return {
            "chunk_id": str(self.chunk_id),
            "document_id": str(self.document_id),
            "document_title": self.document_title,
            "page_number": self.page_number,
            "chunk_index": self.chunk_index,
            "text_content": self.text_content,
            "bounding_box": self.bounding_box,
            "dense_rank": self.dense_rank,
            "sparse_rank": self.sparse_rank,
            "rrf_score": round(self.rrf_score, 6),
        }


class HybridSearchService:
    """
    Hybrid Search Engine executing dense + sparse candidate retrieval and Reciprocal
    Rank Fusion (k=60) directly in PostgreSQL via parameterized raw SQL queries.
    """

    def __init__(self, embedding_service: Optional[VectorEmbeddingService] = None) -> None:
        self.embedding_service = embedding_service or VectorEmbeddingService()

    def search(
        self,
        user_id: Union[UUID, str],
        query: str,
        document_id: Optional[Union[UUID, str]] = None,
        top_k: int = 5,
        dense_weight: float = 0.5,
        sparse_weight: float = 0.5,
        candidate_limit: int = 20,
    ) -> List[SearchResult]:
        """
        Execute hybrid search scoped strictly to documents owned by user_id.

        Args:
            user_id: ID of the authenticated requesting user.
            query: User search query text.
            document_id: Optional UUID to restrict search to a single document.
            top_k: Maximum number of fused results to return.
            dense_weight: Weight applied to dense RRF component (default 0.5).
            sparse_weight: Weight applied to sparse RRF component (default 0.5).
            candidate_limit: Candidate pool size retrieved from dense and sparse queries.

        Returns:
            List of SearchResult objects ordered by descending rrf_score.
        """
        query_clean = query.strip()
        if not query_clean:
            return []

        doc_filter_dense = "AND c.document_id = %(document_id)s" if document_id else ""
        doc_filter_sparse = "AND c.document_id = %(document_id)s" if document_id else ""

        with track_telemetry(
            operation="RRF_RETRIEVAL",
            model_name=self.embedding_service.model_name,
            metadata={
                "query": query_clean,
                "top_k": top_k,
                "document_id": str(document_id) if document_id else None,
                "dense_weight": dense_weight,
                "sparse_weight": sparse_weight,
            },
        ) as tracker:
            # 1. Generate 384-dimensional dense vector embedding
            query_embedding = self.embedding_service.generate_embedding(query_clean)

            # 2. Reciprocal Rank Fusion (k=60) parameterized CTE query
            sql = f"""
            WITH dense_search AS (
                SELECT
                    c.id,
                    ROW_NUMBER() OVER (
                        ORDER BY c.embedding <=> %(query_embedding)s::vector
                    ) AS dense_rank
                FROM documents_chunk c
                JOIN documents_document d ON c.document_id = d.id
                WHERE d.user_id = %(user_id)s
                  AND d.status = 'READY'
                  AND c.embedding IS NOT NULL
                  {doc_filter_dense}
                ORDER BY c.embedding <=> %(query_embedding)s::vector
                LIMIT %(candidate_limit)s
            ),
            sparse_search AS (
                SELECT
                    c.id,
                    ROW_NUMBER() OVER (
                        ORDER BY ts_rank_cd(
                            c.search_vector,
                            websearch_to_tsquery('english', %(query_text)s)
                        ) DESC
                    ) AS sparse_rank
                FROM documents_chunk c
                JOIN documents_document d ON c.document_id = d.id
                WHERE d.user_id = %(user_id)s
                  AND d.status = 'READY'
                  AND c.search_vector @@ websearch_to_tsquery('english', %(query_text)s)
                  {doc_filter_sparse}
                ORDER BY ts_rank_cd(
                    c.search_vector,
                    websearch_to_tsquery('english', %(query_text)s)
                ) DESC
                LIMIT %(candidate_limit)s
            )
            SELECT
                c.id AS chunk_id,
                c.document_id,
                d.title AS document_title,
                c.page_number,
                c.chunk_index,
                c.text_content,
                c.bounding_box,
                dense_s.dense_rank,
                sparse_s.sparse_rank,
                (
                    COALESCE(%(dense_weight)s / (60.0 + dense_s.dense_rank), 0.0) +
                    COALESCE(%(sparse_weight)s / (60.0 + sparse_s.sparse_rank), 0.0)
                ) AS rrf_score
            FROM documents_chunk c
            JOIN documents_document d ON c.document_id = d.id
            LEFT JOIN dense_search dense_s ON c.id = dense_s.id
            LEFT JOIN sparse_search sparse_s ON c.id = sparse_s.id
            WHERE dense_s.id IS NOT NULL OR sparse_s.id IS NOT NULL
            ORDER BY rrf_score DESC
            LIMIT %(final_limit)s;
            """

            params: Dict[str, Any] = {
                "query_embedding": str(query_embedding),
                "query_text": query_clean,
                "user_id": str(user_id),
                "candidate_limit": max(candidate_limit, top_k),
                "final_limit": top_k,
                "dense_weight": float(dense_weight),
                "sparse_weight": float(sparse_weight),
            }
            if document_id:
                params["document_id"] = str(document_id)

            with connection.cursor() as cursor:
                cursor.execute(sql, params)
                rows = cursor.fetchall()

            results: List[SearchResult] = []
            for row in rows:
                raw_bbox = row[6]
                if isinstance(raw_bbox, str):
                    bbox = json.loads(raw_bbox)
                elif isinstance(raw_bbox, dict):
                    bbox = raw_bbox
                else:
                    bbox = {}

                result = SearchResult(
                    chunk_id=UUID(str(row[0])),
                    document_id=UUID(str(row[1])),
                    document_title=str(row[2]),
                    page_number=int(row[3]),
                    chunk_index=int(row[4]),
                    text_content=str(row[5]),
                    bounding_box=bbox,
                    dense_rank=int(row[7]) if row[7] is not None else None,
                    sparse_rank=int(row[8]) if row[8] is not None else None,
                    rrf_score=float(row[9]),
                )
                results.append(result)

            tracker.add_metadata("result_count", len(results))

        return results
