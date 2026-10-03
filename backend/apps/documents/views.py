"""Views for contract document upload, status monitoring, and chunk coordinate retrieval."""
from typing import Any, List
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
    Uploads contract PDF(s), computes SHA-256 deduplication hash, queues for ingestion,
    and returns HTTP 202 Accepted.
    Supports both single file ('file') and batch multi-file upload ('files').
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request: Request) -> Response:
        files: List[Any] = request.FILES.getlist("files")
        if not files and len(request.FILES.getlist("file")) > 1:
            files = request.FILES.getlist("file")

        if files:
            created_docs: List[Document] = []
            for uploaded_file in files:
                raw_name: str = getattr(uploaded_file, "name", "contract.pdf")
                doc_title = raw_name.rsplit(".", 1)[0].replace("_", " ").replace("-", " ")
                serializer = DocumentUploadSerializer(
                    data={"file": uploaded_file, "title": doc_title},
                    context={"request": request},
                )
                serializer.is_valid(raise_exception=True)
                doc: Document = serializer.save()
                try:
                    from apps.documents.tasks import process_document_pipeline
                    process_document_pipeline.delay(str(doc.id))
                except Exception as exc:
                    import logging
                    logging.getLogger(__name__).warning(
                        "Failed to dispatch Celery ingestion task: %s", exc
                    )
                created_docs.append(doc)

            response_data = DocumentDetailSerializer(created_docs, many=True).data
            return Response(
                response_data,
                status=status.HTTP_202_ACCEPTED,
            )

        serializer = DocumentUploadSerializer(
            data=request.data,
            context={"request": request},
        )
        serializer.is_valid(raise_exception=True)
        document: Document = serializer.save()

        # Trigger Celery ingestion task (with synchronous fallback)
        try:
            from apps.documents.tasks import process_document_pipeline
            process_document_pipeline.delay(str(document.id))
        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning("Failed to dispatch Celery ingestion task: %s", exc)

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


class DocumentDetailView(generics.RetrieveDestroyAPIView):
    """
    GET /api/documents/<uuid:pk>/
    DELETE /api/documents/<uuid:pk>/
    Retrieves or deletes document with user isolation.
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
