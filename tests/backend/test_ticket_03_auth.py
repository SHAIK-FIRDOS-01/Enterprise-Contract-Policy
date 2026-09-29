"""
Tests for TICKET-03: Authentication Engine with HttpOnly Cookie Rotation.
Verifies Custom User Model, SimpleJWT Cookie Rotation, Blacklist, and Auth API.
"""
from typing import Any, Dict
import pytest
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken, UntypedToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from apps.authentication.models import User, UserRole
from apps.analytics.models import AuditBenchmarkLog, OperationType


@pytest.mark.django_db
def test_user_model_and_manager() -> None:
    """Test 1: User model creation, custom manager, and role assignment."""
    # Standard user creation
    user = User.objects.create_user(
        email="analyst@enterprise.com",
        password="SecurePassword123!",
        role=UserRole.AUDITOR,
    )
    assert user.email == "analyst@enterprise.com"
    assert user.role == UserRole.AUDITOR
    assert user.is_active is True
    assert user.is_staff is False
    assert user.is_superuser is False
    assert user.check_password("SecurePassword123!") is True
    assert str(user.id) != ""

    # Superuser creation
    superuser = User.objects.create_superuser(
        email="admin@enterprise.com",
        password="AdminPassword123!",
    )
    assert superuser.email == "admin@enterprise.com"
    assert superuser.role == UserRole.ADMIN
    assert superuser.is_staff is True
    assert superuser.is_superuser is True


@pytest.mark.django_db
def test_register_endpoint() -> None:
    """Test 2: POST /api/auth/register/ creates user and sets HttpOnly cookies."""
    client = APIClient()
    payload = {
        "email": "newuser@enterprise.com",
        "password": "CompliantPassword2026!",
        "role": UserRole.VIEWER,
    }
    response = client.post("/api/auth/register/", data=payload, format="json")
    assert response.status_code == 201

    data: Dict[str, Any] = response.json()
    assert "user" in data
    assert data["user"]["email"] == "newuser@enterprise.com"
    assert data["user"]["role"] == UserRole.VIEWER
    # Invariant: JWT tokens MUST NOT be exposed in response body
    assert "access" not in data
    assert "refresh" not in data
    assert "access_token" not in data
    assert "refresh_token" not in data

    # Verify HttpOnly cookies
    cookies = response.cookies
    assert "access_token" in cookies
    assert cookies["access_token"]["httponly"] is True
    assert "refresh_token" in cookies
    assert cookies["refresh_token"]["httponly"] is True

    # User exists in DB
    assert User.objects.filter(email="newuser@enterprise.com").exists()


@pytest.mark.django_db
def test_login_endpoint() -> None:
    """Test 3: POST /api/auth/login/ validates credentials, rejects wrong passwords, sets cookies."""
    # Create test user
    User.objects.create_user(
        email="auditor@enterprise.com",
        password="ValidPassword123!",
        role=UserRole.AUDITOR,
    )

    client = APIClient()

    # Case 1: Wrong password -> 401 Unauthorized
    failed_res = client.post(
        "/api/auth/login/",
        data={"email": "auditor@enterprise.com", "password": "WrongPassword"},
        format="json",
    )
    assert failed_res.status_code == 401

    # Case 2: Correct password -> 200 OK with HttpOnly cookies & telemetry
    success_res = client.post(
        "/api/auth/login/",
        data={"email": "auditor@enterprise.com", "password": "ValidPassword123!"},
        format="json",
    )
    assert success_res.status_code == 200
    data: Dict[str, Any] = success_res.json()
    assert data["user"]["email"] == "auditor@enterprise.com"
    assert "access_token" not in data
    assert "refresh_token" not in data

    assert "access_token" in success_res.cookies
    assert success_res.cookies["access_token"]["httponly"] is True
    assert "refresh_token" in success_res.cookies
    assert success_res.cookies["refresh_token"]["httponly"] is True

    # Verify telemetry logged
    assert AuditBenchmarkLog.objects.filter(
        operation=OperationType.AUTH_VERIFY,
        status="SUCCESS",
    ).exists()


@pytest.mark.django_db
def test_jwt_cookie_authentication() -> None:
    """Test 4: JWTCookieAuthentication authenticates requests via cookie without header."""
    user = User.objects.create_user(
        email="cookieuser@enterprise.com",
        password="Password123!",
        role=UserRole.AUDITOR,
    )
    refresh = RefreshToken.for_user(user)
    access_token_str = str(refresh.access_token)

    client = APIClient()

    # Unauthenticated request without cookie -> 401
    unauth_res = client.get("/api/auth/me/")
    assert unauth_res.status_code == 401

    # Request with access_token cookie
    client.cookies["access_token"] = access_token_str
    auth_res = client.get("/api/auth/me/")
    assert auth_res.status_code == 200
    data: Dict[str, Any] = auth_res.json()
    assert data["email"] == "cookieuser@enterprise.com"
    assert data["role"] == UserRole.AUDITOR


@pytest.mark.django_db
def test_refresh_endpoint() -> None:
    """Test 5: POST /api/auth/refresh/ rotates refresh cookie and issues fresh access cookie."""
    user = User.objects.create_user(
        email="refreshuser@enterprise.com",
        password="Password123!",
        role=UserRole.AUDITOR,
    )
    refresh = RefreshToken.for_user(user)
    initial_refresh_str = str(refresh)

    client = APIClient()

    # Missing refresh cookie -> 401
    missing_res = client.post("/api/auth/refresh/")
    assert missing_res.status_code == 401

    # Valid refresh cookie
    client.cookies["refresh_token"] = initial_refresh_str
    refresh_res = client.post("/api/auth/refresh/")
    assert refresh_res.status_code == 200

    # Ensure new cookies are set
    new_cookies = refresh_res.cookies
    assert "access_token" in new_cookies
    assert "refresh_token" in new_cookies
    new_refresh_str = new_cookies["refresh_token"].value
    assert new_refresh_str != initial_refresh_str

    # Invariant: No tokens in JSON response body
    data: Dict[str, Any] = refresh_res.json()
    assert "access" not in data
    assert "refresh" not in data

    # Old refresh token should now be blacklisted
    assert BlacklistedToken.objects.filter(token__token=initial_refresh_str).exists()
    with pytest.raises(Exception):
        RefreshToken(initial_refresh_str)


@pytest.mark.django_db
def test_logout_endpoint() -> None:
    """Test 6: POST /api/auth/logout/ blacklists refresh token and deletes cookies."""
    user = User.objects.create_user(
        email="logoutuser@enterprise.com",
        password="Password123!",
        role=UserRole.AUDITOR,
    )
    refresh = RefreshToken.for_user(user)
    refresh_str = str(refresh)

    client = APIClient()
    client.cookies["access_token"] = str(refresh.access_token)
    client.cookies["refresh_token"] = refresh_str

    logout_res = client.post("/api/auth/logout/")
    assert logout_res.status_code == 200

    # Verify cookies expired / deleted
    access_cookie = logout_res.cookies["access_token"]
    refresh_cookie = logout_res.cookies["refresh_token"]
    assert access_cookie.value == "" or access_cookie["max-age"] == 0
    assert refresh_cookie.value == "" or refresh_cookie["max-age"] == 0

    # Verify refresh token is blacklisted in database
    assert BlacklistedToken.objects.filter(token__token=refresh_str).exists()
