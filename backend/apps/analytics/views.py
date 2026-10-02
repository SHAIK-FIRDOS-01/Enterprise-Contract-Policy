"""Views for analytics telemetry and benchmark reporting."""
from decimal import Decimal
from typing import Any, Dict
from django.db.models import Avg, Count, Sum
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.request import Request
from rest_framework.permissions import AllowAny

from apps.analytics.models import AuditBenchmarkLog
from apps.analytics.services.telemetry import TelemetryService


class BenchmarksSummaryView(APIView):
    """
    API endpoint returning aggregated performance metrics, latency benchmarks,
    token consumption, and estimated dollar costs across all pipeline operations.
    """
    permission_classes = [AllowAny]

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        total_ops = AuditBenchmarkLog.objects.count()
        successful_ops = AuditBenchmarkLog.objects.filter(status="SUCCESS").count()
        failed_ops = AuditBenchmarkLog.objects.filter(status="FAILED").count()

        # Aggregated totals
        totals_agg = AuditBenchmarkLog.objects.aggregate(
            total_tokens=Sum("total_tokens"),
            total_cost=Sum("estimated_cost_usd"),
        )
        total_tokens = totals_agg["total_tokens"] or 0
        total_cost = totals_agg["total_cost"] or Decimal("0.000000")

        # Breakdown per operation type
        breakdown_qs = (
            AuditBenchmarkLog.objects.values("operation")
            .annotate(
                count=Count("id"),
                avg_duration_ms=Avg("duration_ms"),
                total_tokens=Sum("total_tokens"),
                total_cost_usd=Sum("estimated_cost_usd"),
            )
            .order_by("operation")
        )

        operations_breakdown: Dict[str, Dict[str, Any]] = {
            entry["operation"]: {
                "count": entry["count"],
                "avg_duration_ms": round(entry["avg_duration_ms"] or 0.0, 2),
                "total_tokens": entry["total_tokens"] or 0,
                "total_cost_usd": str(entry["total_cost_usd"] or Decimal("0.000000")),
            }
            for entry in breakdown_qs
        }

        success_rate = (successful_ops / total_ops) if total_ops > 0 else 1.0

        payload = {
            "total_operations": total_ops,
            "system_health": {
                "overall_success_rate": round(success_rate, 4),
                "successful_operations": successful_ops,
                "failed_operations": failed_ops,
            },
            "totals": {
                "total_tokens": total_tokens,
                "total_cost_usd": str(total_cost),
            },
            "operations_breakdown": operations_breakdown,
        }

        return Response(payload)


class ComparativeBenchmarksView(APIView):
    """
    API endpoint returning comparative A/B benchmarks across routing paths:
    System 1 fast path vs System 2 frontier reduce vs Frontier-only baseline.
    Computes concurrency speedup, worker pool health, and ROI economics.
    """
    permission_classes = [AllowAny]

    def get(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        payload = TelemetryService.get_ab_comparison()
        return Response(payload)
