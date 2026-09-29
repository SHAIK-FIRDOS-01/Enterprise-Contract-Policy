"""Serializers for analytics models and metrics summaries."""
from rest_framework import serializers
from apps.analytics.models import AuditBenchmarkLog


class AuditBenchmarkLogSerializer(serializers.ModelSerializer):
    """Serializer for individual AuditBenchmarkLog instances."""

    class Meta:
        model = AuditBenchmarkLog
        fields = [
            "id",
            "operation",
            "model_name",
            "duration_ms",
            "prompt_tokens",
            "completion_tokens",
            "total_tokens",
            "estimated_cost_usd",
            "status",
            "error_message",
            "metadata",
            "created_at",
        ]
        read_only_fields = fields
