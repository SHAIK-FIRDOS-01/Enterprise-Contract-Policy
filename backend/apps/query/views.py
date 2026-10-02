from typing import Any, Iterable, Mapping, Optional, Tuple
from uuid import UUID, uuid4
from django.http import HttpResponseBase, StreamingHttpResponse
from rest_framework import status
from rest_framework.negotiation import DefaultContentNegotiation
from rest_framework.permissions import IsAuthenticated
from rest_framework.renderers import BaseRenderer
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import User
from apps.query.serializers import (
    QueryRequestSerializer,
    VerifyRequestSerializer,
)
from apps.query.services.multiplexer import MultiTargetSSEMultiplexer
from apps.query.services.synthesis import GroqSynthesisService
from apps.query.services.verifier import CitationValidator
from apps.search.services.hybrid_search import HybridSearchService, SearchResult


class ServerSentEventRenderer(BaseRenderer):
    media_type = "text/event-stream"
    format = "sse"

    def render(
        self,
        data: Any,
        accepted_media_type: Optional[str] = None,
        renderer_context: Optional[Mapping[str, Any]] = None,
    ) -> Any:
        return data


class IgnoreClientContentNegotiation(DefaultContentNegotiation):
    def select_renderer(
        self,
        request: Request,
        renderers: Iterable[BaseRenderer],
        format_suffix: Optional[str] = None,
    ) -> Tuple[BaseRenderer, str]:
        return (ServerSentEventRenderer(), "text/event-stream")


class StreamingQueryView(APIView):
    """
    POST /api/query/stream/
    Authenticates requesting user, retrieves top grounded context chunks via hybrid search,
    and streams synthesized answers with exact coordinate citations via Server-Sent Events (SSE).
    Supports multi-target parallel document dispatch via MultiTargetSSEMultiplexer.
    """
    content_negotiation_class = IgnoreClientContentNegotiation
    renderer_classes = [ServerSentEventRenderer]
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> HttpResponseBase:
        serializer = QueryRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        if not isinstance(user, User):
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Multi-target query path vs legacy single-document stream
        is_multi_target = (
            "document_ids" in request.data
            and bool(data.get("document_ids"))
        )

        if is_multi_target:
            multiplexer = MultiTargetSSEMultiplexer()
            event_stream = multiplexer.stream_multi_target_query(
                query=data["query"],
                document_ids=data["document_ids"],
                user_id=user.id,
                temperature=data.get("temperature", 0.2),
                top_k=data.get("top_k", 5),
                force_frontier=data.get("force_frontier", False),
            )
        else:
            # 1. Retrieve relevant chunks using hybrid RRF search
            search_service = HybridSearchService()
            chunks = search_service.search(
                user_id=user.id,
                query=data["query"],
                document_id=data.get("document_id"),
                top_k=data.get("top_k", 5),
            )

            # 2. Synthesize streamed answer with SSE event protocol
            synthesis_service = GroqSynthesisService()
            event_stream = synthesis_service.stream_synthesis_sse(
                query=data["query"],
                retrieved_chunks=chunks,
                temperature=data.get("temperature", 0.2),
            )

        response = StreamingHttpResponse(
            event_stream,
            content_type="text/event-stream",
        )
        response["Cache-Control"] = "no-cache"
        response["X-Accel-Buffering"] = "no"
        return response


class CitationVerifyView(APIView):
    """
    POST /api/query/verify/
    Validates factual grounding of cited claims against provided source chunks.
    Authenticated via JWT cookie.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = VerifyRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        synthesis_text: str = data["synthesis_text"]
        raw_chunks = data["chunks"]

        # Convert chunk dicts to SearchResult format
        search_chunks = [
            SearchResult(
                chunk_id=UUID(str(c.get("document_id"))) if c.get("document_id") else uuid4(),
                document_id=UUID(str(c.get("document_id"))) if c.get("document_id") else uuid4(),
                document_title=str(c.get("document_title", "Document")),
                page_number=int(c.get("page_number", 1)),
                chunk_index=int(c.get("chunk_index", 0)),
                text_content=str(c["text_content"]),
                bounding_box=c.get("bounding_box", {}),
                dense_rank=1,
                sparse_rank=1,
                rrf_score=1.0,
            )
            for c in raw_chunks
        ]

        validator = CitationValidator()
        results = validator.verify_synthesis(synthesis_text, search_chunks)

        response_data = {
            "results": [r.to_dict() for r in results],
            "total_verified": len(results),
        }
        return Response(response_data, status=status.HTTP_200_OK)
