"""Search URLs."""
from django.urls import path
from apps.search.views import HybridSearchView

app_name = "search"

urlpatterns = [
    path("hybrid/", HybridSearchView.as_view(), name="hybrid_search"),
]
