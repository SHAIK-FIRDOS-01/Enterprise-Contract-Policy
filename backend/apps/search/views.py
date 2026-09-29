"""Views for Hybrid Search API."""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import User
from apps.search.serializers import (
    HybridSearchRequestSerializer,
    SearchResultSerializer,
)
from apps.search.services.hybrid_search import HybridSearchService


class HybridSearchView(APIView):
    """
    POST /api/search/hybrid/
    Executes hybrid dense + sparse retrieval with Reciprocal Rank Fusion (k=60).
    Scoped strictly to the authenticated requesting user's documents.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request: Request) -> Response:
        serializer = HybridSearchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user = request.user
        if not isinstance(user, User):
            return Response(
                {"detail": "Authentication credentials were not provided."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        service = HybridSearchService()
        results = service.search(
            user_id=user.id,
            query=data["query"],
            document_id=data.get("document_id"),
            top_k=data.get("top_k", 5),
            dense_weight=data.get("dense_weight", 0.5),
            sparse_weight=data.get("sparse_weight", 0.5),
        )

        output_serializer = SearchResultSerializer(results, many=True)
        return Response(output_serializer.data, status=status.HTTP_200_OK)
