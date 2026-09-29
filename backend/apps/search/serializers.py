"""Serializers for Hybrid Search API."""
from rest_framework import serializers


class HybridSearchRequestSerializer(serializers.Serializer):
    """Validation schema for hybrid search requests."""
    query = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=1000,
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
        max_value=100,
        default=5,
    )
    dense_weight = serializers.FloatField(
        required=False,
        min_value=0.0,
        max_value=1.0,
        default=0.5,
    )
    sparse_weight = serializers.FloatField(
        required=False,
        min_value=0.0,
        max_value=1.0,
        default=0.5,
    )


class SearchResultSerializer(serializers.Serializer):
    """Output serialization schema for ranked search result chunks."""
    chunk_id = serializers.UUIDField()
    document_id = serializers.UUIDField()
    document_title = serializers.CharField()
    page_number = serializers.IntegerField()
    chunk_index = serializers.IntegerField()
    text_content = serializers.CharField()
    bounding_box = serializers.DictField()
    dense_rank = serializers.IntegerField(allow_null=True)
    sparse_rank = serializers.IntegerField(allow_null=True)
    rrf_score = serializers.FloatField()
