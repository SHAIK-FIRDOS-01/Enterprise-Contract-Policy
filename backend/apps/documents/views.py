"""Views for contract document upload, status monitoring, and chunk coordinate retrieval."""
from django.db.models import QuerySet
from django.shortcuts import get_object_or_404
from rest_framework import generics, status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.authentication.models import User
from apps.documents.models import Document, DocumentChunk
from apps.documents.serializers import (
    DocumentChunkSerializer,
    DocumentDetailSerializer,
    DocumentUploadSerializer,
)


class DocumentUploadView(APIView):
    """
    POST /api/documents/upload/
    Uploads contract PDF, computes SHA-256 deduplication hash, queues for ingestion,
    and returns HTTP 202 Accepted.
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request) -> Response:
        serializer = DocumentUploadSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        document: Document = serializer.save()

        response_serializer = DocumentDetailSerializer(document)
        return Response(
            response_serializer.data,
            status=status.HTTP_202_ACCEPTED,
        )


class DocumentListView(generics.ListAPIView):
    """
    GET /api/documents/
    Lists all documents owned by the authenticated user.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentDetailSerializer

    def get_queryset(self) -> QuerySet[Document]:
        user = self.request.user
        if not isinstance(user, User):
            return Document.objects.none()
        return Document.objects.filter(user=user)


class DocumentDetailView(generics.RetrieveAPIView):
    """
    GET /api/documents/<uuid:pk>/
    Retrieves document status, metadata, and chunk count with user isolation.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentDetailSerializer

    def get_queryset(self) -> QuerySet[Document]:
        user = self.request.user
        if not isinstance(user, User):
            return Document.objects.none()
        return Document.objects.filter(user=user)


class DocumentChunkListView(generics.ListAPIView):
    """
    GET /api/documents/<uuid:pk>/chunks/
    Retrieves all semantic chunks and bounding boxes for the PDF viewer.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = DocumentChunkSerializer

    def get_queryset(self) -> QuerySet[DocumentChunk]:
        user = self.request.user
        if not isinstance(user, User):
            return DocumentChunk.objects.none()
        document = get_object_or_404(
            Document,
            pk=self.kwargs.get("pk"),
            user=user,
        )
        return DocumentChunk.objects.filter(document=document)
