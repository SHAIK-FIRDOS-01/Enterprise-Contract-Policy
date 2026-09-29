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
