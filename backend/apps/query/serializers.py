"""Serializers for Query API."""
from rest_framework import serializers


class QueryRequestSerializer(serializers.Serializer):
    """Validation schema for query stream requests."""
    query = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=2000,
        trim_whitespace=True,
    )
    document_id = serializers.UUIDField(
        required=False,
        allow_null=True,
        default=None,
    )
    top_k = serializers.IntegerField(
        required=False,
        min_value=1,
        max_value=20,
        default=5,
    )
    temperature = serializers.FloatField(
        required=False,
        min_value=0.0,
        max_value=1.0,
        default=0.2,
    )


class VerifyRequestChunkSerializer(serializers.Serializer):
    """Chunk input for citation verification."""
    chunk_index = serializers.IntegerField(required=False, default=0)
    text_content = serializers.CharField(required=True)
    bounding_box = serializers.DictField(required=False, default=dict)
    page_number = serializers.IntegerField(required=False, default=1)
    document_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    document_title = serializers.CharField(required=False, default="Document")


class VerifyRequestSerializer(serializers.Serializer):
    """Validation schema for standalone citation verification requests."""
    synthesis_text = serializers.CharField(
        required=True,
        allow_blank=False,
    )
    chunks = VerifyRequestChunkSerializer(many=True, required=True)


class VerificationResultSerializer(serializers.Serializer):
    """Output schema for verified citation result."""
    claim_text = serializers.CharField()
    ref_id = serializers.IntegerField()
    bounding_box = serializers.DictField()
    lexical_score = serializers.FloatField()
    semantic_score = serializers.FloatField()
    confidence_score = serializers.FloatField()
    status = serializers.CharField()
