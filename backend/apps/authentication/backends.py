"""Authentication backends and DRF authentication classes."""
from apps.authentication.authentication import (
    CookieJWTAuthentication,
    JWTCookieAuthentication,
)

__all__ = ["CookieJWTAuthentication", "JWTCookieAuthentication"]
