"""Query URLs."""
from django.urls import path
from apps.query.views import StreamingQueryView

app_name = "query"

urlpatterns = [
    path("stream/", StreamingQueryView.as_view(), name="query_stream"),
]
