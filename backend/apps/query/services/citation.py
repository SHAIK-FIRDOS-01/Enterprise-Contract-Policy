"""
Citation Engine Service.
Parses [Ref:N] citation markers from synthesized LLM text and maps them
back to source DocumentChunk coordinate bounding boxes for frontend PDF.js canvas overlays.
"""
import re
from typing import Any, Dict, List
from apps.search.services.hybrid_search import SearchResult


def extract_heading_from_text(text: str) -> str:
    """
    Extracts a concise section heading or clause title from chunk text.
    Uses regex heuristics for numbered clauses, articles, sections, items, or uppercase headers.
    """
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    if not lines:
        return "General Section"

    for line in lines[:4]:
        clean = line.strip("#*- ").strip()
        if not clean:
            continue
        # Patterns like 'SECTION 1', 'Item 1A', 'ARTICLE IV', '1.0 DEFINITIONS', etc.
        if re.match(r"^(section|article|item|clause|\d+(\.\d+)*)\b", clean, re.IGNORECASE):
            return clean[:80]
        # All-caps line of moderate length (standard legal/contract heading)
        if clean.isupper() and 3 <= len(clean) <= 80:
            return clean

    first = lines[0].strip("#*- ").strip()
    if len(first) <= 75:
        return first
    if ":" in first[:60]:
        return first.split(":")[0].strip()
    return first[:60] + "..."


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
            including document info, page number, section heading, and bounding box coordinates.
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
                    "section_heading": extract_heading_from_text(chunk.text_content),
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
