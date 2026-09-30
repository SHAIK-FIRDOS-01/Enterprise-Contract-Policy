from typing import List, Union
from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import path, include
from django.urls.resolvers import URLPattern, URLResolver

urlpatterns: List[Union[URLPattern, URLResolver]] = [
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.authentication.urls")),
    path("api/documents/", include("apps.documents.urls")),
    path("api/search/", include("apps.search.urls")),
    path("api/query/", include("apps.query.urls")),
    path("api/analytics/benchmarks/", include("apps.analytics.urls")),
    path("api/benchmarks/", include("apps.analytics.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
