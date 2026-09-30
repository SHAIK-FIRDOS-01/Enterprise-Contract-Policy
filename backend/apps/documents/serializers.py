"""Serializers for contract document management and bounding-box chunks."""
import hashlib
from typing import Any, Dict
from rest_framework import serializers
from apps.documents.models import Document, DocumentChunk

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB


class DocumentChunkSerializer(serializers.ModelSerializer):
    """Serializer for document chunks including spatial bounding box coordinates."""
    class Meta:
        model = DocumentChunk
        fields = [
            "id",
            "document",
            "chunk_index",
            "page_number",
            "text_content",
            "bounding_box",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields


class DocumentDetailSerializer(serializers.ModelSerializer):
    """Detailed document status and metadata serializer."""
    chunk_count = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = [
            "id",
            "title",
            "file",
            "file_hash",
            "page_count",
            "status",
            "error_message",
            "chunk_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields

    def get_chunk_count(self, obj: Document) -> int:
        return obj.chunks.count()


class DocumentUploadSerializer(serializers.Serializer):
    """Validates contract PDF uploads and computes cryptographic SHA-256 hash."""
    file = serializers.FileField()
    title = serializers.CharField(max_length=255, required=False)

    def validate_file(self, file: Any) -> Any:
        # Validate file extension
        filename = getattr(file, "name", "").lower()
        if not filename.endswith(".pdf"):
            raise serializers.ValidationError("Only PDF documents (.pdf) are supported.")

        # Validate file size (max 25MB)
        if file.size > MAX_FILE_SIZE_BYTES:
            raise serializers.ValidationError(
                f"File size exceeds the 25MB maximum limit ({file.size} bytes)."
            )

        # Validate PDF magic header bytes (%PDF-)
        header = file.read(5)
        file.seek(0)
        if not header.startswith(b"%PDF-"):
            raise serializers.ValidationError(
                "Invalid PDF document: File missing '%PDF-' header signature."
            )

        return file

    def create(self, validated_data: Dict[str, Any]) -> Document:
        file = validated_data["file"]
        title = validated_data.get("title") or file.name

        # Compute SHA-256 hash
        hasher = hashlib.sha256()
        for chunk in file.chunks():
            hasher.update(chunk)
        file_hash = hasher.hexdigest()

        user = self.context["request"].user

        document = Document.objects.create(
            user=user,
            title=title,
            file=file,
            file_hash=file_hash,
        )
        return document
