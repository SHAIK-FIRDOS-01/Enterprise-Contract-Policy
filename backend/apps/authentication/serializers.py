"""Serializers for enterprise authentication and user management."""
from typing import Any, Dict
from rest_framework import serializers
from apps.authentication.models import User, UserRole


class UserSerializer(serializers.ModelSerializer):
    """Public user profile serializer without sensitive credential leaks."""
    class Meta:
        model = User
        fields = [
            "id",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "date_joined",
        ]
        read_only_fields = fields


class RegisterSerializer(serializers.Serializer):
    """User registration serializer enforcing email uniqueness and strong passwords."""
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)
    role = serializers.CharField(required=False, default=UserRole.AUDITOR)

    def validate_role(self, value: str) -> str:
        role_map = {
            "COMPLIANCE_OFFICER": UserRole.AUDITOR,
            "LEGAL_COUNSEL": UserRole.AUDITOR,
            "ADMINISTRATOR": UserRole.ADMIN,
        }
        normalized = value.strip().upper() if value else UserRole.AUDITOR
        resolved = role_map.get(normalized, normalized)
        valid_roles = [choice[0] for choice in UserRole.choices]
        if resolved not in valid_roles:
            raise serializers.ValidationError(
                f"Invalid role '{value}'. Allowed roles: {valid_roles}"
            )
        return resolved

    def validate_email(self, value: str) -> str:
        normalized = value.strip().lower()
        if User.objects.filter(email__iexact=normalized).exists():
            raise serializers.ValidationError("A user with this email address already exists.")
        return normalized

    def create(self, validated_data: Dict[str, Any]) -> User:
        return User.objects.create_user(
            email=validated_data["email"],
            password=validated_data["password"],
            role=validated_data.get("role", UserRole.AUDITOR),
        )


class LoginSerializer(serializers.Serializer):
    """Credentials validation serializer for email/password authentication."""
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
