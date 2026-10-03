"""
Multi-Document Reduce Synthesizer Service.
Assembles isolated multi-document prompt payloads using strict <document_context> XML tags,
invokes Groq SDK (qwen/qwen3.8-27b) for cross-document legal analysis and variance synthesis,
formats standardized citations [Ref:DocID:ChunkID:Page], and instruments operational telemetry.
"""
import os
import re
from typing import Any, Dict, List, Optional
from django.conf import settings
from groq import Groq

from apps.analytics.services.telemetry import track_telemetry

SYSTEM_PROMPT = (
    "You are the Enterprise Contract & Policy Copilot performing multi-document synthesis, "
    "cross-clause variance comparison, and compliance analysis. "
    "You are provided with verified evidence chunks organized strictly inside "
    "<document_context> tags with document IDs, titles, and chunk pages. "
    "\n\nRules:"
    "\n1. Rely STRICTLY and EXCLUSIVELY on the facts provided within <document_context> tags."
    "\n2. Whenever asserting a claim, cite the supporting source using the exact format: "
    "[Ref:DocID:ChunkID:Page], for example [Ref:doc-123:chunk-456:3]."
    "\n3. Keep your response dense, structured, and complete within 200 to 350 words. "
    "Always conclude all sentences, bullet points, comparisons, and citation brackets completely. "
    "Never cut off or leave any sentence or table row unfinished."
    "\n4. Highlight explicit differences, term updates, and year-over-year variances clearly."
    "\n5. If information is missing or cannot be compared, "
    "state that clearly in one concise sentence."
)


class MultiDocReduceSynthesizer:
    """
    Multi-Document Reduce Synthesizer.
    Executes reduce-stage cross-document synthesis over gated evidence bundles.
    """

    CITATION_PATTERN = re.compile(r"\[Ref:([^:\s]+):([^:\s]+):(\d+)\]")

    def __init__(
        self,
        client: Optional[Any] = None,
        model_name: Optional[str] = None,
    ) -> None:
        self.model_name: str = str(
            model_name
            or getattr(settings, "GROQ_MODEL", None)
            or getattr(settings, "GROQ_MODEL_NAME", None)
            or "qwen/qwen3.8-27b"
        )
        if client is not None:
            self.client = client
        else:
            api_key = getattr(settings, "GROQ_API_KEY", "") or os.environ.get("GROQ_API_KEY", "")
            self.client = Groq(api_key=api_key)

    def build_prompt(
        self,
        query: str,
        evidence: List[Dict[str, Any]],
        max_prompt_chars: int = 12000,
    ) -> str:
        """
        Assembles prompt with strict <document_context> XML boundaries isolating each
        document's candidate chunks to eliminate cross-document context contamination.
        Enforces a dynamic character/token budget to prevent Groq ITPM (7000) rate limit errors.
        """
        header = f"Query: {query.strip()}\n\nTarget Evidence Across Documents:\n"
        footer = (
            "\nSynthesize a concise, high-density audit response (strictly 250-350 words). "
            "Conclude all points and citations completely. Use format [Ref:DocID:ChunkID:Page]."
        )
        available_budget = max(2000, max_prompt_chars - len(header) - len(footer))
        num_docs = max(1, len(evidence))
        budget_per_doc = available_budget // num_docs

        # Allocate chunks per doc based on document pool size
        max_chunks_per_doc = 5 if num_docs <= 2 else (3 if num_docs <= 4 else 2)
        per_chunk_char_cap = 1500 if num_docs == 1 else (1000 if num_docs == 2 else 750)

        lines: List[str] = [header.rstrip()]
        total_content_chars = 0

        for doc_item in evidence:
            doc_id = doc_item.get("document_id", "")
            doc_title = doc_item.get("document_title", "Document")
            chunks = doc_item.get("chunks", [])[:max_chunks_per_doc]

            doc_lines: List[str] = [f'<document_context id="{doc_id}" title="{doc_title}">']
            doc_chars = 0

            for chunk in chunks:
                chunk_id = chunk.get("chunk_id", "")
                page_num = chunk.get("page_number", 1)
                text_content = chunk.get("text_content", "").strip()
                if len(text_content) > per_chunk_char_cap:
                    text_content = text_content[:per_chunk_char_cap] + "..."

                chunk_entry = (
                    f'  <chunk id="{chunk_id}" page="{page_num}">\n'
                    f"    {text_content}\n"
                    f"  </chunk>"
                )
                if doc_chars + len(chunk_entry) > budget_per_doc and len(doc_lines) > 1:
                    break
                if total_content_chars + len(chunk_entry) > available_budget and len(lines) > 1:
                    break

                doc_lines.append(chunk_entry)
                doc_chars += len(chunk_entry)
                total_content_chars += len(chunk_entry)

            doc_lines.append("</document_context>\n")
            lines.append("\n".join(doc_lines))

        lines.append(footer.strip())
        return "\n".join(lines)

    def extract_citations(self, text: str) -> List[Dict[str, Any]]:
        """
        Parses standardized [Ref:DocID:ChunkID:Page] markers from generated synthesis.
        """
        citations: List[Dict[str, Any]] = []
        seen = set()

        for match in self.CITATION_PATTERN.finditer(text):
            doc_id, chunk_id, page_str = match.groups()
            key = (doc_id, chunk_id, page_str)
            if key not in seen:
                seen.add(key)
                citations.append({
                    "document_id": doc_id,
                    "chunk_id": chunk_id,
                    "page_number": int(page_str),
                })

        return citations

    def reduce_synthesis(
        self,
        query: str,
        gated_decision: Dict[str, Any],
        temperature: float = 0.2,
    ) -> Dict[str, Any]:
        """
        Executes multi-document reduce synthesis via Groq API.
        Instruments execution timing, token counts, and cost under REDUCE_SYNTHESIS telemetry.
        Includes automated context compression retry if provider payload limits are hit.
        """
        evidence = gated_decision.get("grounded_evidence", [])
        prompt = self.build_prompt(query, evidence, max_prompt_chars=12000)

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

        try:
            with track_telemetry(
                operation="REDUCE_SYNTHESIS",
                model_name=self.model_name,
                metadata={
                    "query": query,
                    "document_count": len(evidence),
                    "route": gated_decision.get("route", "SYSTEM_2_FRONTIER"),
                },
            ) as tracker:
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=950,
                )

                synthesis_text = response.choices[0].message.content or ""
                citations = self.extract_citations(synthesis_text)

                prompt_tokens = 0
                completion_tokens = 0
                if hasattr(response, "usage") and response.usage:
                    prompt_tokens = getattr(response.usage, "prompt_tokens", 0) or 0
                    completion_tokens = getattr(response.usage, "completion_tokens", 0) or 0
                else:
                    prompt_tokens = len(prompt.split()) * 4 // 3
                    completion_tokens = len(synthesis_text.split()) * 4 // 3

                tracker.set_tokens(
                    prompt_tokens=prompt_tokens,
                    completion_tokens=completion_tokens,
                )
                tracker.add_metadata("citations_count", len(citations))

            log_inst = tracker.log_instance
            duration_ms = log_inst.duration_ms if log_inst else 0.0
        except Exception as exc:
            err_str = str(exc)
            # Automatic fallback: retry with aggressive 5000 char compression if limit hit
            if any(term in err_str.lower() for term in ["413", "too large", "itpm", "limit"]):
                try:
                    compact_prompt = self.build_prompt(query, evidence, max_prompt_chars=5000)
                    retry_messages = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": compact_prompt},
                    ]
                    response = self.client.chat.completions.create(
                        model=self.model_name,
                        messages=retry_messages,
                        temperature=temperature,
                        max_tokens=950,
                    )
                    synthesis_text = response.choices[0].message.content or ""
                    citations = self.extract_citations(synthesis_text)
                    prompt_tokens = len(compact_prompt.split()) * 4 // 3
                    completion_tokens = len(synthesis_text.split()) * 4 // 3
                    duration_ms = 100.0
                except Exception as inner_exc:
                    synthesis_text = (
                        f"LLM synthesis encountered a provider limit ({inner_exc}). "
                        "Grounded evidence excerpts remain available in the Citations tab."
                    )
                    citations = []
                    duration_ms = 0.0
                    prompt_tokens = len(prompt.split()) * 4 // 3
                    completion_tokens = 0
            else:
                synthesis_text = (
                    f"LLM synthesis encountered a provider limit ({exc}). "
                    "Grounded evidence excerpts remain available in the Citations tab."
                )
                citations = []
                duration_ms = 0.0
                prompt_tokens = len(prompt.split()) * 4 // 3
                completion_tokens = 0
            prompt_tokens = len(prompt.split()) * 4 // 3
            completion_tokens = len(synthesis_text.split()) * 4 // 3

        return {
            "synthesis_text": synthesis_text,
            "citations": citations,
            "route": "SYSTEM_2_FRONTIER",
            "duration_ms": duration_ms,
            "total_tokens": prompt_tokens + completion_tokens,
        }
