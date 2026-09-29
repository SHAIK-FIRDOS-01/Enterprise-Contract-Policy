"""Analytics and Benchmarking URLs."""
from django.urls import path
from apps.analytics.views import BenchmarksSummaryView

urlpatterns = [
    path("summary/", BenchmarksSummaryView.as_view(), name="benchmarks-summary"),
]
