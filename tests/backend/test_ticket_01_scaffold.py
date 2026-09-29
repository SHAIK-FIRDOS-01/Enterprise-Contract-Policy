"""
TICKET-01 Scaffold & Configuration Verification Test Suite.
Verifies core Django multi-app setup, database engine, Celery, and auth settings.
"""
from django.conf import settings


def test_installed_apps_includes_all_five_modular_apps() -> None:
    """Verify that all 5 isolated modular apps are registered in INSTALLED_APPS."""
    expected_apps = [
        "apps.authentication",
        "apps.documents",
        "apps.search",
        "apps.query",
        "apps.analytics",
    ]
    for app in expected_apps:
        assert app in settings.INSTALLED_APPS, f"Missing modular app: {app}"


def test_installed_apps_includes_required_third_party_dependencies() -> None:
    """Verify essential third party apps are registered in INSTALLED_APPS."""
    required = [
        "rest_framework",
        "rest_framework_simplejwt",
        "corsheaders",
        "pgvector.django",
    ]
    for app in required:
        assert app in settings.INSTALLED_APPS, f"Missing dependency app: {app}"


def test_database_engine_is_postgresql() -> None:
    """Verify default database configuration uses PostgreSQL."""
    default_db = settings.DATABASES.get("default", {})
    assert (
        default_db.get("ENGINE") == "django.db.backends.postgresql"
    ), f"Expected PostgreSQL engine, got {default_db.get('ENGINE')}"


def test_celery_broker_configuration() -> None:
    """Verify Celery broker and result backend URLs are configured."""
    assert hasattr(settings, "CELERY_BROKER_URL"), "CELERY_BROKER_URL must be configured"
    assert "redis://" in settings.CELERY_BROKER_URL, "CELERY_BROKER_URL must point to Redis"
    assert hasattr(settings, "CELERY_RESULT_BACKEND"), "CELERY_RESULT_BACKEND must be configured"
    assert "redis://" in settings.CELERY_RESULT_BACKEND, "CELERY_RESULT_BACKEND must point to Redis"


def test_auth_user_model_is_custom() -> None:
    """Verify AUTH_USER_MODEL is configured for custom User model in apps/authentication."""
    assert (
        settings.AUTH_USER_MODEL == "authentication.User"
    ), f"Expected authentication.User, got {settings.AUTH_USER_MODEL}"
