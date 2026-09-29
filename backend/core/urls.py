"""Core URL Configuration."""
from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.authentication.urls")),
    path("api/documents/", include("apps.documents.urls")),
    path("api/search/", include("apps.search.urls")),
    path("api/query/", include("apps.query.urls")),
    path("api/benchmarks/", include("apps.analytics.urls")),
]
