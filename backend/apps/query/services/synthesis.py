"""
Groq Synthesis Service.
Generates legally grounded, citation-annotated answers using Groq LLM API
(llama-3.3-70b-versatile) with precise token economics and telemetry instrumentation.
"""
import json
from typing import Any, Dict, Generator, List, Optional
from django.conf import settings

from apps.analytics.services.telemetry import track_telemetry
from apps.search.services.hybrid_search import SearchResult


SYSTEM_PROMPT = """You are an enterprise legal and contract policy copilot.
Your job is to synthesize accurate answers based STRICTLY on the provided contract excerpts.

Rules you MUST follow:
1. ONLY answer questions using the facts directly stated in the context below.
   Do NOT assume, extrapolate, or bring outside knowledge.
2. If the context does not contain sufficient facts to answer the question, clearly state:
   "The provided document context does not contain sufficient information to answer this query."
3. Every factual statement or substantive claim MUST be grounded with an exact citation marker:
   [Ref:N], where N corresponds to the [Source N] reference number of the excerpt.
4. Place citation markers immediately after the sentence or clause they support,
   e.g., "The limitation of liability is capped at total fees paid [Ref:1]."
5. Be concise, objective, and adhere strictly to legal precision.
"""


class GroqSynthesisService:
    """
    Orchestrates prompt assembly, Groq LLM streaming inference, citation injection,
    and operational telemetry tracking.
    """

    def __init__(
        self,
        client: Optional[Any] = None,
        model_name: Optional[str] = None,
    ) -> None:
        self.model_name = str(
            model_name
            or getattr(settings, "GROQ_MODEL_NAME", "llama-3.3-70b-versatile")
        )
        self.api_key = str(getattr(settings, "GROQ_API_KEY", ""))
        self._client = client

    def get_client(self) -> Any:
        """Lazily initialize or return configured Groq client."""
        if self._client is None:
            from groq import Groq
            self._client = Groq(api_key=self.api_key or "gsk_dummy_key_for_testing")
        return self._client

    def format_context(self, retrieved_chunks: List[SearchResult]) -> str:
        """Format retrieved search result chunks into structured numbered prompt context."""
        if not retrieved_chunks:
            return "No relevant context found."

        context_blocks = []
        for idx, chunk in enumerate(retrieved_chunks, start=1):
            context_blocks.append(
                f"[Source {idx}] (Document: '{chunk.document_title}', Page: {chunk.page_number}, "
                f"Chunk: {chunk.chunk_index})\n{chunk.text_content.strip()}"
            )
        return "\n\n".join(context_blocks)

    def build_prompt_messages(
        self,
        query: str,
        retrieved_chunks: List[SearchResult],
    ) -> List[Dict[str, str]]:
        """Construct system and user messages containing retrieved context and instructions."""
        context_text = self.format_context(retrieved_chunks)
        user_content = (
            f"Context Excerpts:\n{context_text}\n\n"
            f"Query: {query}\n\n"
            f"Provide a grounded answer with [Ref:N] citations."
        )
        return [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ]

    def stream_synthesis(
        self,
        query: str,
        retrieved_chunks: List[SearchResult],
        temperature: float = 0.2,
    ) -> Generator[str, None, None]:
        """
        Yield raw text token deltas while instrumenting execution in AuditBenchmarkLog.
        """
        if not retrieved_chunks:
            return

        with track_telemetry(
            operation="LLM_SYNTHESIS",
            model_name=self.model_name,
            metadata={"query": query, "chunk_count": len(retrieved_chunks)},
        ) as tracker:
            messages = self.build_prompt_messages(query, retrieved_chunks)
            client = self.get_client()

            stream = client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                temperature=temperature,
                stream=True,
                stream_options={"include_usage": True},
            )

            accumulated_text: List[str] = []
            prompt_tokens = 0
            completion_tokens = 0

            for chunk in stream:
                if hasattr(chunk, "choices") and chunk.choices:
                    delta = getattr(chunk.choices[0], "delta", None)
                    content = getattr(delta, "content", None) if delta else None
                    if content:
                        accumulated_text.append(content)
                        yield content

                if hasattr(chunk, "usage") and chunk.usage:
                    prompt_tokens = getattr(chunk.usage, "prompt_tokens", prompt_tokens)
                    completion_tokens = getattr(
                        chunk.usage, "completion_tokens", completion_tokens
                    )

            if prompt_tokens == 0:
                prompt_tokens = max(1, len(json.dumps(messages).split()))
            if completion_tokens == 0:
                completion_tokens = max(1, len("".join(accumulated_text).split()))

            tracker.set_tokens(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )

    def stream_synthesis_sse(
        self,
        query: str,
        retrieved_chunks: List[SearchResult],
        temperature: float = 0.2,
    ) -> Generator[str, None, None]:
        """
        Generate SSE formatted events (metadata, delta, telemetry, done) for browser consumption.
        """
        # Event 1: Source chunk metadata
        metadata_payload = {
            "query": query,
            "chunk_count": len(retrieved_chunks),
            "chunks": [c.to_dict() for c in retrieved_chunks],
        }
        yield f"event: metadata\ndata: {json.dumps(metadata_payload)}\n\n"

        if not retrieved_chunks:
            no_info_msg = (
                "The provided document context does not contain sufficient "
                "information to answer this query."
            )
            yield f"event: delta\ndata: {json.dumps({'content': no_info_msg})}\n\n"
            yield "event: done\ndata: [DONE]\n\n"
            return

        with track_telemetry(
            operation="LLM_SYNTHESIS",
            model_name=self.model_name,
            metadata={"query": query, "chunk_count": len(retrieved_chunks)},
        ) as tracker:
            messages = self.build_prompt_messages(query, retrieved_chunks)
            client = self.get_client()

            stream = client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                temperature=temperature,
                stream=True,
                stream_options={"include_usage": True},
            )

            accumulated_text: List[str] = []
            prompt_tokens = 0
            completion_tokens = 0

            for chunk in stream:
                if hasattr(chunk, "choices") and chunk.choices:
                    delta = getattr(chunk.choices[0], "delta", None)
                    content = getattr(delta, "content", None) if delta else None
                    if content:
                        accumulated_text.append(content)
                        yield f"event: delta\ndata: {json.dumps({'content': content})}\n\n"

                if hasattr(chunk, "usage") and chunk.usage:
                    prompt_tokens = getattr(chunk.usage, "prompt_tokens", prompt_tokens)
                    completion_tokens = getattr(
                        chunk.usage, "completion_tokens", completion_tokens
                    )

            if prompt_tokens == 0:
                prompt_tokens = max(1, len(json.dumps(messages).split()))
            if completion_tokens == 0:
                completion_tokens = max(1, len("".join(accumulated_text).split()))

            tracker.set_tokens(
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
            )

        # Event 3: Verification of synthesized citations
        from apps.query.services.verifier import CitationValidator
        validator = CitationValidator()
        full_text = "".join(accumulated_text)
        verified_citations = validator.verify_synthesis(full_text, retrieved_chunks)
        yield (
            f"event: verification\n"
            f"data: {json.dumps([v.to_dict() for v in verified_citations])}\n\n"
        )

        log_inst = tracker.log_instance
        telemetry_payload = {
            "duration_ms": log_inst.duration_ms if log_inst else 0.0,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
            "estimated_cost_usd": float(log_inst.estimated_cost_usd) if log_inst else 0.0,
        }
        yield f"event: telemetry\ndata: {json.dumps(telemetry_payload)}\n\n"
        yield "event: done\ndata: [DONE]\n\n"
