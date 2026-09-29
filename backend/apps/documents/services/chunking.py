"""
PyMuPDF (fitz) extraction pipeline and coordinate chunking engine.
Extracts structured text blocks with normalized page coordinates ([0.0, 1.0])
and merges them into semantic chunks for frontend canvas bounding-box alignment.
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List
import pymupdf


@dataclass
class ExtractedChunk:
    """A semantic text chunk with exact spatial bounding box coordinates."""
    chunk_index: int
    page_number: int
    text_content: str
    bounding_box: Dict[str, float]
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ChunkerResult:
    """Complete result of document extraction containing page count and chunks."""
    page_count: int
    chunks: List[ExtractedChunk]


class PDFCoordinateChunker:
    """
    Extracts text blocks per page using PyMuPDF, normalizes bounding box coordinates
    relative to page dimensions, and aggregates blocks into coherent semantic chunks.
    """

    def chunk_pdf_bytes(
        self,
        pdf_bytes: bytes,
        max_words_per_chunk: int = 350,
    ) -> ChunkerResult:
        """Process in-memory PDF byte stream."""
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        return self._extract_and_chunk(doc, max_words_per_chunk)

    def chunk_pdf_file(
        self,
        file_path: str,
        max_words_per_chunk: int = 350,
    ) -> ChunkerResult:
        """Process PDF from local file system path."""
        doc = pymupdf.open(file_path)
        return self._extract_and_chunk(doc, max_words_per_chunk)

    def _extract_and_chunk(
        self,
        doc: pymupdf.Document,
        max_words: int,
    ) -> ChunkerResult:
        """Core extraction loop parsing pages, blocks, and normalized coordinates."""
        try:
            page_count = len(doc)
            if page_count == 0:
                raise ValueError("PDF document contains no pages.")

            chunks: List[ExtractedChunk] = []
            chunk_index = 0

            for page_idx in range(page_count):
                page = doc[page_idx]
                page_number = page_idx + 1
                rect = page.rect
                page_w = float(rect.width)
                page_h = float(rect.height)

                # Extract text blocks: tuple(x0, y0, x1, y1, "text", block_no, block_type)
                raw_blocks = page.get_text("blocks")
                # Filter text blocks (type 0) with non-whitespace content
                text_blocks = [
                    b for b in raw_blocks
                    if len(b) >= 7 and b[6] == 0 and b[4].strip()
                ]

                if not text_blocks:
                    continue

                current_group: List[Dict[str, Any]] = []
                current_word_count = 0

                for b in text_blocks:
                    x0, y0, x1, y1 = float(b[0]), float(b[1]), float(b[2]), float(b[3])
                    text = b[4].strip()
                    word_count = len(text.split())

                    # Calculate normalized coordinates
                    norm_x0 = max(0.0, min(1.0, x0 / page_w)) if page_w > 0 else 0.0
                    norm_y0 = max(0.0, min(1.0, y0 / page_h)) if page_h > 0 else 0.0
                    norm_x1 = max(0.0, min(1.0, x1 / page_w)) if page_w > 0 else 0.0
                    norm_y1 = max(0.0, min(1.0, y1 / page_h)) if page_h > 0 else 0.0

                    block_data = {
                        "x0": x0,
                        "y0": y0,
                        "x1": x1,
                        "y1": y1,
                        "norm_x0": norm_x0,
                        "norm_y0": norm_y0,
                        "norm_x1": norm_x1,
                        "norm_y1": norm_y1,
                        "text": text,
                        "word_count": word_count,
                    }

                    # If adding this block exceeds limit and we already have blocks, flush
                    if current_group and (current_word_count + word_count > max_words):
                        chunks.append(
                            self._create_chunk(
                                chunk_index,
                                page_number,
                                page_w,
                                page_h,
                                current_group,
                            )
                        )
                        chunk_index += 1
                        current_group = [block_data]
                        current_word_count = word_count
                    else:
                        current_group.append(block_data)
                        current_word_count += word_count

                # Flush remaining blocks on this page
                if current_group:
                    chunks.append(
                        self._create_chunk(
                            chunk_index,
                            page_number,
                            page_w,
                            page_h,
                            current_group,
                        )
                    )
                    chunk_index += 1

            return ChunkerResult(page_count=page_count, chunks=chunks)
        finally:
            doc.close()

    def _create_chunk(
        self,
        chunk_index: int,
        page_number: int,
        page_w: float,
        page_h: float,
        blocks: List[Dict[str, Any]],
    ) -> ExtractedChunk:
        """Compute aggregated bounding box and merge text for a group of blocks."""
        merged_text = "\n\n".join(b["text"] for b in blocks)
        bbox = {
            "x0": round(min(b["x0"] for b in blocks), 2),
            "y0": round(min(b["y0"] for b in blocks), 2),
            "x1": round(max(b["x1"] for b in blocks), 2),
            "y1": round(max(b["y1"] for b in blocks), 2),
            "norm_x0": round(min(b["norm_x0"] for b in blocks), 4),
            "norm_y0": round(min(b["norm_y0"] for b in blocks), 4),
            "norm_x1": round(max(b["norm_x1"] for b in blocks), 4),
            "norm_y1": round(max(b["norm_y1"] for b in blocks), 4),
            "page_width": round(page_w, 2),
            "page_height": round(page_h, 2),
        }
        metadata = {
            "page_number": page_number,
            "word_count": len(merged_text.split()),
            "char_count": len(merged_text),
            "block_count": len(blocks),
        }
        return ExtractedChunk(
            chunk_index=chunk_index,
            page_number=page_number,
            text_content=merged_text,
            bounding_box=bbox,
            metadata=metadata,
        )
