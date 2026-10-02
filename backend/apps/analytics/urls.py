from django.urls import path
from apps.analytics.views import BenchmarksSummaryView, ComparativeBenchmarksView

urlpatterns = [
    path("summary/", BenchmarksSummaryView.as_view(), name="benchmarks-summary"),
    path("ab-comparison/", ComparativeBenchmarksView.as_view(), name="benchmarks-ab-comparison"),
]
