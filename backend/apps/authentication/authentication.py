"""
Cookie-based JWT Authentication class for djangorestframework-simplejwt.
Reads access token from Authorization Bearer header, falling back to HttpOnly cookie.
"""
from typing import Any, Optional, Tuple
from django.conf import settings
from rest_framework.request import Request
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import Token


class CookieJWTAuthentication(JWTAuthentication):
    """
    Custom JWT Authentication that checks the Authorization Bearer header first,
    falling back to extracting the access token from an HttpOnly cookie defined by
    SIMPLE_JWT['AUTH_COOKIE'] ('access_token' by default).
    """

    def authenticate(
        self, request: Request
    ) -> Optional[Tuple[Any, Token]]:
        header = self.get_header(request)
        if header is not None:
            raw_token = self.get_raw_token(header)
            if raw_token is not None:
                validated_token = self.get_validated_token(raw_token)
                return self.get_user(validated_token), validated_token

        simple_jwt_settings = getattr(settings, "SIMPLE_JWT", {})
        cookie_name = str(simple_jwt_settings.get("AUTH_COOKIE", "access_token"))
        cookie_token = request.COOKIES.get(cookie_name)

        if cookie_token is not None:
            validated_token = self.get_validated_token(cookie_token.encode("utf-8"))
            return self.get_user(validated_token), validated_token

        return None


# Canonical alias for compatibility
JWTCookieAuthentication = CookieJWTAuthentication
