"""Custom User model for enterprise authentication."""
import uuid
from typing import Any, ClassVar, Optional
from django.contrib.auth.models import (
    AbstractBaseUser,
    BaseUserManager,
    PermissionsMixin,
)
from django.db import models
from django.utils import timezone


class UserRole(models.TextChoices):
    """System access roles with granular permission levels."""
    ADMIN = "ADMIN", "Administrator"
    AUDITOR = "AUDITOR", "Compliance Auditor"
    VIEWER = "VIEWER", "Document Viewer"


class UserManager(BaseUserManager["User"]):
    """Custom user manager where email is the unique identifier for auth."""

    def create_user(
        self,
        email: str,
        password: Optional[str] = None,
        role: str = UserRole.AUDITOR,
        **extra_fields: Any,
    ) -> "User":
        """Create, normalize, and save standard user."""
        if not email:
            raise ValueError("The Email field must be set.")
        email = self.normalize_email(email)
        extra_fields.setdefault("role", role)
        extra_fields.setdefault("is_active", True)
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)

        user: User = self.model(email=email, **extra_fields)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(
        self,
        email: str,
        password: Optional[str] = None,
        **extra_fields: Any,
    ) -> "User":
        """Create and save superuser with admin privileges."""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("role", UserRole.ADMIN)

        if extra_fields.get("is_staff") is not True:
            raise ValueError("Superuser must have is_staff=True.")
        if extra_fields.get("is_superuser") is not True:
            raise ValueError("Superuser must have is_superuser=True.")

        return self.create_user(email, password=password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    """
    Enterprise Custom User model using UUID primary keys, email authentication,
    and role-based access control.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, db_index=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    role = models.CharField(
        max_length=32,
        choices=UserRole.choices,
        default=UserRole.AUDITOR,
    )
    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    date_joined = models.DateTimeField(default=timezone.now)

    objects: UserManager = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    class Meta:
        db_table = "authentication_user"
        ordering = ["-date_joined"]

    def __str__(self) -> str:
        return f"{self.email} ({self.role})"
