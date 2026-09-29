"""Views for Groq SSE Streaming Query API and Citation Verification."""
from uuid import UUID, uuid4
from django.http import HttpResponseBase, StreamingHttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import User
from apps.query.serializers import (
    QueryRequestSerializer,
    VerifyRequestSerializer,
)
from apps.query.services.synthesis import GroqSynthesisService
from apps.query.services.verifier import CitationValidator
from apps.search.services.hybrid_search import HybridSearchService, SearchResult


class StreamingQueryView(APIView):
    """
    POST /api/query/stream/
    Authenticates requesting user, retrieves top grounded context chunks via hybrid search,
    and streams synthesized answers with exact coordinate citations via Server-Sent Events (SSE).
    """
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
        search_chunks = []
        for c in raw_chunks:
            doc_id_val = c.get("document_id")
            doc_id = UUID(str(doc_id_val)) if doc_id_val else uuid4()
            search_chunks.append(
                SearchResult(
                    chunk_id=doc_id,
                    document_id=doc_id,
                    document_title=str(c.get("document_title", "Document")),
                    page_number=int(c.get("page_number", 1)),
                    chunk_index=int(c.get("chunk_index", 0)),
                    text_content=str(c["text_content"]),
                    bounding_box=c.get("bounding_box", {}),
                    dense_rank=1,
                    sparse_rank=1,
                    rrf_score=1.0,
                )
            )

        validator = CitationValidator()
        results = validator.verify_synthesis(synthesis_text, search_chunks)

        response_data = {
            "results": [r.to_dict() for r in results],
            "total_verified": len(results),
        }
        return Response(response_data, status=status.HTTP_200_OK)
