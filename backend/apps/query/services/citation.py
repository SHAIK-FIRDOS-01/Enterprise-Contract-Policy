"""
Citation Engine Service.
Parses [Ref:N] citation markers from synthesized LLM text and maps them
back to source DocumentChunk coordinate bounding boxes for frontend PDF.js canvas overlays.
"""
import re
from typing import Any, Dict, List
from apps.search.services.hybrid_search import SearchResult


class CitationEngine:
    """
    Extracts citation references and binds them to precise page and coordinate bounding boxes.
    """
    CITATION_PATTERN = re.compile(r"\[Ref:\s*(\d+)\]", re.IGNORECASE)

    @classmethod
    def extract_citations(
        cls,
        text: str,
        chunks: List[SearchResult],
    ) -> Dict[int, Dict[str, Any]]:
        """
        Parses all [Ref:N] tags from text and resolves them against the provided chunks.

        Args:
            text: Synthesized text response from LLM.
            chunks: List of retrieved SearchResult objects passed as context to the LLM.

        Returns:
            Dictionary mapping integer reference ID (1-indexed) to citation metadata
            including document info, page number, and bounding box coordinates.
        """
        resolved: Dict[int, Dict[str, Any]] = {}
        if not text or not chunks:
            return resolved

        matches = cls.CITATION_PATTERN.findall(text)
        for match in matches:
            ref_idx = int(match)
            if 1 <= ref_idx <= len(chunks) and ref_idx not in resolved:
                chunk = chunks[ref_idx - 1]
                resolved[ref_idx] = {
                    "ref_id": ref_idx,
                    "chunk_id": str(chunk.chunk_id),
                    "document_id": str(chunk.document_id),
                    "document_title": chunk.document_title,
                    "page_number": chunk.page_number,
                    "chunk_index": chunk.chunk_index,
                    "bounding_box": chunk.bounding_box,
                    "text_snippet": (
                        chunk.text_content[:200] + "..."
                        if len(chunk.text_content) > 200
                        else chunk.text_content
                    ),
                }

        return resolved

    @classmethod
    def extract_citations_list(
        cls,
        text: str,
        chunks: List[SearchResult],
    ) -> List[Dict[str, Any]]:
        """Return resolved citations as an ordered list."""
        citations_dict = cls.extract_citations(text, chunks)
        return [citations_dict[k] for k in sorted(citations_dict.keys())]
