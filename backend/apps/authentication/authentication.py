"""
Cookie-based JWT Authentication middleware and class for djangorestframework-simplejwt.
Reads access token from HttpOnly cookie with fallback to Authorization Bearer header.
"""
from typing import Any, Optional, Tuple
from django.conf import settings
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import Token


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom JWT Authentication that extracts the raw token from an HttpOnly cookie
    defined by SIMPLE_JWT['AUTH_COOKIE'] ('access_token' by default).
    Falls back to the standard Authorization Bearer header.
    """

    def authenticate(
        self, request: Request
    ) -> Optional[Tuple[Any, Token]]:
        simple_jwt_settings = getattr(settings, "SIMPLE_JWT", {})
        cookie_name = str(simple_jwt_settings.get("AUTH_COOKIE", "access_token"))
        raw_token = request.COOKIES.get(cookie_name)

        if raw_token is not None:
            validated_token = self.get_validated_token(raw_token.encode("utf-8"))
            return self.get_user(validated_token), validated_token

        # Fall back to standard header authentication
        return super().authenticate(request)
