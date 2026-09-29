"""Custom User model for enterprise authentication."""
import uuid
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """Custom User model conforming to specification."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = models.CharField(max_length=20, default="AUDITOR")

    class Meta:
        db_table = "authentication_user"
