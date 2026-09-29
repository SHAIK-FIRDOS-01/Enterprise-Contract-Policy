"""Documents API URL routing."""
from django.urls import path
from apps.documents.views import (
    DocumentChunkListView,
    DocumentDetailView,
    DocumentListView,
    DocumentUploadView,
)

app_name = "documents"

urlpatterns = [
    path("upload/", DocumentUploadView.as_view(), name="document-upload"),
    path("", DocumentListView.as_view(), name="document-list"),
    path("<uuid:pk>/", DocumentDetailView.as_view(), name="document-detail"),
    path("<uuid:pk>/chunks/", DocumentChunkListView.as_view(), name="document-chunks"),
]
