"""Authentication API URL routing."""
from django.urls import path
from apps.authentication.views import (
    CurrentUserView,
    LoginView,
    LogoutView,
    RefreshView,
    RegisterView,
)

app_name = "authentication"

urlpatterns = [
    path("register/", RegisterView.as_view(), name="register"),
    path("login/", LoginView.as_view(), name="login"),
    path("token/", LoginView.as_view(), name="token_login"),
    path("refresh/", RefreshView.as_view(), name="refresh"),
    path("token/refresh/", RefreshView.as_view(), name="token_refresh"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", CurrentUserView.as_view(), name="me"),
]
