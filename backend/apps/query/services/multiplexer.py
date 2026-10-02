"""
Multi-Target SSE Protocol & Stream Multiplexer Service.
Formats Server-Sent Events across multi-document query lifecycle:
- 'route': Confidence gating route (SYSTEM_1_FAST_PATH | SYSTEM_2_FRONTIER)
- 'worker_status': Per-document worker lifecycle progress
- 'citation': Standardized document-tagged citation metadata
- 'token': Synthesized answer text tokens
- 'telemetry': Wall-clock latency breakdown, token usage, and economics
- 'done': Terminal stream signal [DONE]
"""
import json
import time
from typing import Any, Dict, Generator, List, Optional, Union
from uuid import UUID

from apps.query.services.dispatcher import ConcurrentMapDispatcher
from apps.query.services.gater import ConfidenceGater
from apps.query.services.reducer import MultiDocReduceSynthesizer


class MultiTargetSSEMultiplexer:
    """
    Encodes and multiplexes Server-Sent Events for multi-document query execution.
    Complies strictly with text/event-stream specification ('event: <type>\\ndata: <json>\\n\\n').
    """

    def format_event(self, event_type: str, data: Any) -> str:
        """Encodes an event block with double newlines."""
        if isinstance(data, (dict, list)):
            payload = json.dumps(data)
        else:
            payload = str(data)
        return f"event: {event_type}\ndata: {payload}\n\n"

    def format_route(self, route: str, confidence: float, reason: str) -> str:
        """Encodes gating route decision event."""
        return self.format_event(
            "route",
            {
                "route": route,
                "confidence": round(float(confidence), 4),
                "reason": str(reason),
            },
        )

    def format_worker_status(
        self,
        document_id: str,
        status: str,
        duration_ms: float,
    ) -> str:
        """Encodes per-document worker status update event."""
        return self.format_event(
            "worker_status",
            {
                "document_id": str(document_id),
                "status": str(status),
                "duration_ms": round(float(duration_ms), 2),
            },
        )

    def format_citation(
        self,
        citation_id: str,
        ref_index: int,
        document_id: str,
        page_number: int,
        bounding_box: Dict[str, Any],
        text_snippet: str,
    ) -> str:
        """Encodes citation metadata with document ID tagging."""
        norm_box = {
            "norm_x0": float(bounding_box.get("norm_x0", bounding_box.get("x0", 0.0))),
            "norm_y0": float(bounding_box.get("norm_y0", bounding_box.get("y0", 0.0))),
            "norm_x1": float(bounding_box.get("norm_x1", bounding_box.get("x1", 0.0))),
            "norm_y1": float(bounding_box.get("norm_y1", bounding_box.get("y1", 0.0))),
        }
        return self.format_event(
            "citation",
            {
                "citation_id": str(citation_id),
                "ref_index": int(ref_index),
                "document_id": str(document_id),
                "page_number": int(page_number),
                "bounding_box": norm_box,
                "text_snippet": str(text_snippet),
            },
        )

    def format_token(self, content: str) -> str:
        """Encodes delta text token event."""
        return self.format_event("token", {"content": content})

    def format_telemetry(
        self,
        total_duration_ms: float,
        worker_latency_breakdown: Dict[str, float],
        prompt_tokens: int,
        completion_tokens: int,
        estimated_cost_usd: float,
    ) -> str:
        """Encodes telemetry event with per-worker breakdown and token economics."""
        return self.format_event(
            "telemetry",
            {
                "total_duration_ms": round(float(total_duration_ms), 2),
                "worker_latency_breakdown": {
                    str(k): round(float(v), 2) for k, v in worker_latency_breakdown.items()
                },
                "prompt_tokens": int(prompt_tokens),
                "completion_tokens": int(completion_tokens),
                "estimated_cost_usd": round(float(estimated_cost_usd), 6),
            },
        )

    def format_done(self) -> str:
        """Encodes terminal done event."""
        return "event: done\ndata: [DONE]\n\n"

    def stream_multi_target_query(
        self,
        query: str,
        document_ids: List[Union[UUID, str]],
        user_id: Optional[Union[UUID, str]] = None,
        dispatcher: Optional[ConcurrentMapDispatcher] = None,
        gater: Optional[ConfidenceGater] = None,
        reducer: Optional[MultiDocReduceSynthesizer] = None,
        temperature: float = 0.2,
        top_k: int = 5,
    ) -> Generator[str, None, None]:
        """
        Orchestrates full multi-target query execution and yields SSE event streams.
        """
        t0 = time.perf_counter()
        disp = dispatcher or ConcurrentMapDispatcher()
        gat = gater or ConfidenceGater()
        red = reducer or MultiDocReduceSynthesizer()

        doc_id_targets: List[Union[UUID, str]] = list(document_ids)
        doc_id_strs = [str(did) for did in document_ids]
        if not doc_id_strs:
            yield self.format_route("SYSTEM_2_FRONTIER", 0.0, "No documents provided.")
            yield self.format_token("No documents were specified for query analysis.")
            yield self.format_telemetry(
                total_duration_ms=0.0,
                worker_latency_breakdown={},
                prompt_tokens=0,
                completion_tokens=0,
                estimated_cost_usd=0.0,
            )
            yield self.format_done()
            return

        # 1. Dispatch concurrent retrieval
        bundles = disp.dispatch(
            document_ids=doc_id_targets,
            query_text=query,
            user_id=user_id,
            top_k=top_k,
        )

        # 2. Emit worker_status events for each target document
        worker_latency_breakdown: Dict[str, float] = {}
        for bundle in bundles:
            did = str(bundle.get("document_id"))
            dur = float(bundle.get("duration_ms", 0.0))
            stat = str(bundle.get("status", "SUCCESS"))
            worker_latency_breakdown[did] = dur
            yield self.format_worker_status(document_id=did, status=stat, duration_ms=dur)

        # 3. Evaluate confidence gater
        is_multi_doc = len(doc_id_strs) > 1
        decision = gat.evaluate(query=query, bundles=bundles, is_multi_doc=is_multi_doc)
        yield self.format_route(
            route=decision["route"],
            confidence=decision["confidence_score"],
            reason=decision["reason"],
        )

        # 4. Emit citations tagged with document IDs
        ref_idx = 1
        for doc_item in decision.get("grounded_evidence", []):
            doc_id = str(doc_item.get("document_id"))
            for chunk in doc_item.get("chunks", []):
                chunk_id = str(chunk.get("chunk_id", f"c-{ref_idx}"))
                page_num = int(chunk.get("page_number", 1))
                bbox = chunk.get("bounding_box", {})
                snippet = str(chunk.get("text_content", ""))[:200]
                yield self.format_citation(
                    citation_id=chunk_id,
                    ref_index=ref_idx,
                    document_id=doc_id,
                    page_number=page_num,
                    bounding_box=bbox,
                    text_snippet=snippet,
                )
                ref_idx += 1

        # 5. Synthesize or deliver fast path
        if decision["route"] == "SYSTEM_1_FAST_PATH":
            fast_payload = decision.get("fast_path_payload") or {}
            extracted_span = str(fast_payload.get("extracted_span", ""))
            words = extracted_span.split(" ")
            for i, word in enumerate(words):
                content = word if i == 0 else f" {word}"
                yield self.format_token(content)

            total_duration_ms = (time.perf_counter() - t0) * 1000.0
            prompt_tok = max(1, len(query.split()) * 4 // 3)
            comp_tok = max(1, len(extracted_span.split()) * 4 // 3)
            yield self.format_telemetry(
                total_duration_ms=total_duration_ms,
                worker_latency_breakdown=worker_latency_breakdown,
                prompt_tokens=prompt_tok,
                completion_tokens=comp_tok,
                estimated_cost_usd=0.0,
            )
        else:
            reduce_result = red.reduce_synthesis(
                query=query,
                gated_decision=decision,
                temperature=temperature,
            )
            synthesis_text = str(reduce_result.get("synthesis_text", ""))
            words = synthesis_text.split(" ")
            for i, word in enumerate(words):
                content = word if i == 0 else f" {word}"
                yield self.format_token(content)

            total_duration_ms = (time.perf_counter() - t0) * 1000.0
            total_tokens = int(reduce_result.get("total_tokens", 0))
            if total_tokens > 0:
                prompt_tok = max(1, total_tokens // 2)
                comp_tok = max(1, total_tokens - prompt_tok)
            else:
                prompt_tok = max(1, len(query.split()) * 4 // 3)
                comp_tok = max(1, len(synthesis_text.split()) * 4 // 3)

            yield self.format_telemetry(
                total_duration_ms=total_duration_ms,
                worker_latency_breakdown=worker_latency_breakdown,
                prompt_tokens=prompt_tok,
                completion_tokens=comp_tok,
                estimated_cost_usd=0.0001,
            )

        # 6. Terminal done event
        yield self.format_done()
