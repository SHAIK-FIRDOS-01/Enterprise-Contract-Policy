"""
Tests for TICKET-17: Real-Time Multi-Target SSE Protocol & Stream Multiplexer.
Verifies MultiTargetSSEMultiplexer and multi-document StreamingQueryView:
1. Standard SSE event format compliance ('event: <type>\\ndata: <json>\\n\\n').
2. Document ID tagging on citation events.
3. Worker status events emitted for all target documents.
4. Telemetry event precision with worker latency breakdown.
5. End-to-end multi-target streaming execution via StreamingQueryView.
"""
import json
from typing import Any, Dict, List
from unittest.mock import MagicMock, patch
import pytest
from rest_framework.test import APIClient

from apps.authentication.models import User
from apps.documents.models import Document, DocumentStatus
from apps.query.services.multiplexer import MultiTargetSSEMultiplexer


def parse_sse_events(raw_stream: str) -> List[Dict[str, Any]]:
    """Helper to parse raw SSE chunks into a list of {event: str, data: Any}."""
    blocks = raw_stream.strip().split("\n\n")
    events: List[Dict[str, Any]] = []
    for block in blocks:
        if not block.strip():
            continue
        lines = block.strip().split("\n")
        ev_type = "message"
        data_str = ""
        for line in lines:
            if line.startswith("event: "):
                ev_type = line.replace("event: ", "").strip()
            elif line.startswith("data: "):
                data_str = line.replace("data: ", "").strip()
        data_val: Any = data_str
        try:
            data_val = json.loads(data_str)
        except Exception:
            pass
        events.append({"event": ev_type, "data": data_val})
    return events


def test_multiplexer_event_formatting() -> None:
    """
    Test 1: Verify MultiTargetSSEMultiplexer formats valid SSE messages
    with double newlines and strictly compliant JSON data.
    """
    mux = MultiTargetSSEMultiplexer()

    # Route event
    route_msg = mux.format_route("SYSTEM_1_FAST_PATH", 0.95, "Direct match")
    assert route_msg.startswith("event: route\ndata: ")
    assert route_msg.endswith("\n\n")
    parsed_route = json.loads(route_msg.split("data: ")[1].strip())
    assert parsed_route["route"] == "SYSTEM_1_FAST_PATH"
    assert parsed_route["confidence"] == 0.95

    # Worker status event
    ws_msg = mux.format_worker_status("doc-123", "SUCCESS", 45.2)
    assert ws_msg.startswith("event: worker_status\ndata: ")
    assert ws_msg.endswith("\n\n")
    parsed_ws = json.loads(ws_msg.split("data: ")[1].strip())
    assert parsed_ws["document_id"] == "doc-123"
    assert parsed_ws["status"] == "SUCCESS"
    assert parsed_ws["duration_ms"] == 45.2

    # Citation event
    cit_msg = mux.format_citation(
        citation_id="cit-001",
        ref_index=1,
        document_id="doc-123",
        page_number=3,
        bounding_box={"norm_x0": 0.1, "norm_y0": 0.2, "norm_x1": 0.8, "norm_y1": 0.3},
        text_snippet="Term snippet",
    )
    assert cit_msg.startswith("event: citation\ndata: ")
    assert cit_msg.endswith("\n\n")
    parsed_cit = json.loads(cit_msg.split("data: ")[1].strip())
    assert parsed_cit["document_id"] == "doc-123"
    assert parsed_cit["page_number"] == 3
    assert parsed_cit["bounding_box"]["norm_x0"] == 0.1

    # Token event
    token_msg = mux.format_token(" comparative analysis")
    assert token_msg == 'event: token\ndata: {"content": " comparative analysis"}\n\n'

    # Telemetry event
    telem_msg = mux.format_telemetry(
        total_duration_ms=120.5,
        worker_latency_breakdown={"doc-123": 45.2, "doc-456": 55.1},
        prompt_tokens=300,
        completion_tokens=75,
        estimated_cost_usd=0.00025,
    )
    assert telem_msg.startswith("event: telemetry\ndata: ")
    assert telem_msg.endswith("\n\n")
    parsed_telem = json.loads(telem_msg.split("data: ")[1].strip())
    assert parsed_telem["total_duration_ms"] == 120.5
    assert parsed_telem["worker_latency_breakdown"]["doc-123"] == 45.2

    # Done event
    done_msg = mux.format_done()
    assert done_msg == "event: done\ndata: [DONE]\n\n"


def test_multiplexer_stream_pipeline_fast_path() -> None:
    """
    Test 2: Verify MultiTargetSSEMultiplexer stream pipeline yields worker_status,
    route=SYSTEM_1_FAST_PATH, citations, token, telemetry, and done without calling Groq.
    """
    mux = MultiTargetSSEMultiplexer()

    mock_dispatcher = MagicMock()
    bbox1 = {"norm_x0": 0.1, "norm_y0": 0.2, "norm_x1": 0.9, "norm_y1": 0.3}
    mock_dispatcher.dispatch.return_value = [
        {
            "document_id": "doc-fast-1",
            "status": "SUCCESS",
            "duration_ms": 30.0,
            "candidate_chunks": [
                {
                    "chunk_id": "chk-1",
                    "document_id": "doc-fast-1",
                    "document_title": "Policy.pdf",
                    "page_number": 1,
                    "bounding_box": bbox1,
                    "text_content": "Limitation of liability is capped at $1,000,000.",
                }
            ],
        }
    ]

    mock_gater = MagicMock()
    mock_gater.evaluate.return_value = {
        "route": "SYSTEM_1_FAST_PATH",
        "confidence_score": 0.95,
        "reason": "Direct factual match",
        "is_multi_doc": False,
        "grounded_evidence": [
            {
                "document_id": "doc-fast-1",
                "document_title": "Policy.pdf",
                "chunks": [
                    {
                        "chunk_id": "chk-1",
                        "document_id": "doc-fast-1",
                        "page_number": 1,
                        "bounding_box": bbox1,
                        "text_content": "Limitation of liability is capped at $1,000,000.",
                    }
                ],
            }
        ],
        "fast_path_payload": {
            "document_id": "doc-fast-1",
            "chunk_id": "chk-1",
            "page_number": 1,
            "bounding_box": {"norm_x0": 0.1, "norm_y0": 0.2, "norm_x1": 0.9, "norm_y1": 0.3},
            "extracted_span": "Limitation of liability is capped at $1,000,000.",
        },
    }

    stream = list(
        mux.stream_multi_target_query(
            query="What is the cap?",
            document_ids=["doc-fast-1"],
            user_id="user-123",
            dispatcher=mock_dispatcher,
            gater=mock_gater,
        )
    )

    full_output = "".join(stream)
    events = parse_sse_events(full_output)

    event_types = [e["event"] for e in events]
    assert "worker_status" in event_types
    assert "route" in event_types
    assert "citation" in event_types
    assert "token" in event_types
    assert "telemetry" in event_types
    assert "done" in event_types

    # Find route event
    route_ev = next(e for e in events if e["event"] == "route")
    assert route_ev["data"]["route"] == "SYSTEM_1_FAST_PATH"
    assert route_ev["data"]["confidence"] == 0.95

    # Find citation event
    cit_ev = next(e for e in events if e["event"] == "citation")
    assert cit_ev["data"]["document_id"] == "doc-fast-1"
    assert cit_ev["data"]["page_number"] == 1

    # Find token event (extracted span)
    token_events = [e for e in events if e["event"] == "token"]
    assert len(token_events) > 0
    token_text = "".join(t["data"]["content"] for t in token_events)
    assert "$1,000,000" in token_text


def test_multiplexer_stream_pipeline_multi_doc_frontier() -> None:
    """
    Test 3: Verify MultiTargetSSEMultiplexer stream pipeline handles multi-document
    SYSTEM_2_FRONTIER queries, emitting worker_status for all documents and streaming
    synthesis tokens from MultiDocReduceSynthesizer.
    """
    mux = MultiTargetSSEMultiplexer()

    mock_dispatcher = MagicMock()
    bbox_a = {"norm_x0": 0.1, "norm_y0": 0.1, "norm_x1": 0.8, "norm_y1": 0.2}
    bbox_b = {"norm_x0": 0.1, "norm_y0": 0.3, "norm_x1": 0.8, "norm_y1": 0.4}
    mock_dispatcher.dispatch.return_value = [
        {
            "document_id": "doc-a",
            "status": "SUCCESS",
            "duration_ms": 25.0,
            "candidate_chunks": [
                {
                    "chunk_id": "chk-a1",
                    "document_id": "doc-a",
                    "document_title": "Contract A.pdf",
                    "page_number": 2,
                    "bounding_box": bbox_a,
                    "text_content": "Notice is 30 days.",
                }
            ],
        },
        {
            "document_id": "doc-b",
            "status": "SUCCESS",
            "duration_ms": 30.0,
            "candidate_chunks": [
                {
                    "chunk_id": "chk-b1",
                    "document_id": "doc-b",
                    "document_title": "Contract B.pdf",
                    "page_number": 5,
                    "bounding_box": bbox_b,
                    "text_content": "Notice is 60 days.",
                }
            ],
        },
    ]

    mock_gater = MagicMock()
    mock_gater.evaluate.return_value = {
        "route": "SYSTEM_2_FRONTIER",
        "confidence_score": 1.0,
        "reason": "Multi-document comparative analysis",
        "is_multi_doc": True,
        "grounded_evidence": [
            {
                "document_id": "doc-a",
                "document_title": "Contract A.pdf",
                "chunks": [
                    {
                        "chunk_id": "chk-a1",
                        "document_id": "doc-a",
                        "page_number": 2,
                        "bounding_box": bbox_a,
                        "text_content": "Notice is 30 days.",
                    }
                ],
            },
            {
                "document_id": "doc-b",
                "document_title": "Contract B.pdf",
                "chunks": [
                    {
                        "chunk_id": "chk-b1",
                        "document_id": "doc-b",
                        "page_number": 5,
                        "bounding_box": bbox_b,
                        "text_content": "Notice is 60 days.",
                    }
                ],
            },
        ],
        "fast_path_payload": None,
    }

    mock_reducer = MagicMock()
    mock_reducer.reduce_synthesis.return_value = {
        "synthesis_text": "Comparison shows 30 days in Contract A vs 60 days in Contract B.",
        "citations": [
            {"document_id": "doc-a", "chunk_id": "chk-a1", "page_number": 2},
            {"document_id": "doc-b", "chunk_id": "chk-b1", "page_number": 5},
        ],
        "route": "SYSTEM_2_FRONTIER",
        "duration_ms": 350.0,
        "total_tokens": 420,
    }

    stream = list(
        mux.stream_multi_target_query(
            query="Compare notice periods",
            document_ids=["doc-a", "doc-b"],
            user_id="user-123",
            dispatcher=mock_dispatcher,
            gater=mock_gater,
            reducer=mock_reducer,
        )
    )

    full_output = "".join(stream)
    events = parse_sse_events(full_output)

    # Assert worker_status fired for both doc-a and doc-b
    ws_events = [e for e in events if e["event"] == "worker_status"]
    assert len(ws_events) == 2
    ws_docs = {e["data"]["document_id"] for e in ws_events}
    assert ws_docs == {"doc-a", "doc-b"}

    # Assert route event
    route_ev = next(e for e in events if e["event"] == "route")
    assert route_ev["data"]["route"] == "SYSTEM_2_FRONTIER"

    # Assert citations have document_ids
    citations = [e for e in events if e["event"] == "citation"]
    assert len(citations) >= 2
    cit_doc_ids = {c["data"]["document_id"] for c in citations}
    assert "doc-a" in cit_doc_ids
    assert "doc-b" in cit_doc_ids

    # Assert token text contains synthesized comparative analysis
    token_events = [e for e in events if e["event"] == "token"]
    assert len(token_events) > 0
    token_text = "".join(t["data"]["content"] for t in token_events)
    assert "Comparison shows 30 days" in token_text

    # Assert telemetry event
    telem_ev = next(e for e in events if e["event"] == "telemetry")
    assert "worker_latency_breakdown" in telem_ev["data"]
    assert telem_ev["data"]["worker_latency_breakdown"]["doc-a"] == 25.0
    assert telem_ev["data"]["worker_latency_breakdown"]["doc-b"] == 30.0


@pytest.mark.django_db
def test_streaming_query_view_multi_document_request() -> None:
    """
    Test 4: Verify POST /api/query/stream/ accepts document_ids array,
    authenticates user, and streams multi-target SSE events.
    """
    user = User.objects.create_user(email="stream_view@enterprise.com", password="Password123!")
    doc1 = Document.objects.create(
        user=user,
        title="Document One.pdf",
        file_hash="hash_view_01",
        status=DocumentStatus.READY,
    )
    doc2 = Document.objects.create(
        user=user,
        title="Document Two.pdf",
        file_hash="hash_view_02",
        status=DocumentStatus.READY,
    )

    client = APIClient()
    client.force_authenticate(user=user)

    box1 = {"norm_x0": 0.1, "norm_y0": 0.1, "norm_x1": 0.9, "norm_y1": 0.2}
    box2 = {"norm_x0": 0.1, "norm_y0": 0.3, "norm_x1": 0.9, "norm_y1": 0.4}
    with patch("apps.query.services.multiplexer.ConcurrentMapDispatcher") as mock_disp_cls, \
         patch("apps.query.services.multiplexer.ConfidenceGater") as mock_gater_cls:

        mock_disp_inst = mock_disp_cls.return_value
        mock_disp_inst.dispatch.return_value = [
            {
                "document_id": str(doc1.id),
                "status": "SUCCESS",
                "duration_ms": 20.0,
                "candidate_chunks": [
                    {
                        "chunk_id": "c1",
                        "document_id": str(doc1.id),
                        "document_title": "Document One.pdf",
                        "page_number": 1,
                        "bounding_box": box1,
                        "text_content": "Payment terms are Net 30.",
                    }
                ],
            },
            {
                "document_id": str(doc2.id),
                "status": "SUCCESS",
                "duration_ms": 22.0,
                "candidate_chunks": [
                    {
                        "chunk_id": "c2",
                        "document_id": str(doc2.id),
                        "document_title": "Document Two.pdf",
                        "page_number": 2,
                        "bounding_box": box2,
                        "text_content": "Payment terms are Net 60.",
                    }
                ],
            },
        ]

        mock_gater_inst = mock_gater_cls.return_value
        mock_gater_inst.evaluate.return_value = {
            "route": "SYSTEM_1_FAST_PATH",
            "confidence_score": 0.92,
            "reason": "Fast path test",
            "is_multi_doc": False,
            "grounded_evidence": [
                {
                    "document_id": str(doc1.id),
                    "document_title": "Document One.pdf",
                    "chunks": [
                        {
                            "chunk_id": "c1",
                            "document_id": str(doc1.id),
                            "page_number": 1,
                            "bounding_box": box1,
                            "text_content": "Payment terms are Net 30.",
                        }
                    ],
                }
            ],
            "fast_path_payload": {
                "document_id": str(doc1.id),
                "chunk_id": "c1",
                "page_number": 1,
                "bounding_box": box1,
                "extracted_span": "Payment terms are Net 30.",
            },
        }

        response = client.post(
            "/api/query/stream/",
            data={
                "query": "What are payment terms?",
                "document_ids": [str(doc1.id), str(doc2.id)],
            },
            format="json",
        )

        assert response.status_code == 200
        assert "text/event-stream" in response["Content-Type"]

        content_bytes = b"".join(response.streaming_content)
        content_str = content_bytes.decode("utf-8")
        events = parse_sse_events(content_str)

        assert any(e["event"] == "route" for e in events)
        assert any(e["event"] == "worker_status" for e in events)
        assert any(e["event"] == "done" for e in events)
