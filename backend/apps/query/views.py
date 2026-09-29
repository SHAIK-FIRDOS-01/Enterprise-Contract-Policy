"""Views for Groq SSE Streaming Query API."""
from django.http import HttpResponseBase, StreamingHttpResponse
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import User
from apps.query.serializers import QueryRequestSerializer
from apps.query.services.synthesis import GroqSynthesisService
from apps.search.services.hybrid_search import HybridSearchService


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
