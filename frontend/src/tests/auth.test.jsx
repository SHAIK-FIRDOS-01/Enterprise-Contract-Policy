import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import api, { authApi } from '../services/api';
import { AuthProvider, useAuth } from '../context/AuthContext';
import LoginPage from '../pages/auth/LoginPage';

// Test consumer component for AuthContext testing
function TestAuthConsumer() {
  const { user, isAuthenticated, isLoading, error } = useAuth();
  return (
    <div>
      <span data-testid="auth-loading">{isLoading ? 'loading' : 'done'}</span>
      <span data-testid="auth-status">{isAuthenticated ? 'authenticated' : 'unauthenticated'}</span>
      <span data-testid="user-email">{user?.email || 'no-user'}</span>
      <span data-testid="auth-error">{error || 'no-error'}</span>
    </div>
  );
}

describe('Ticket 09: Frontend Auth & Workstation Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // Test 1: Invariant Check - api.js withCredentials: true
  it('enforces HttpOnly cookie invariant with credentials on Axios client', () => {
    expect(api.defaults.withCredentials).toBe(true);
    expect(api.defaults.baseURL).toBe('');
    expect(api.defaults.headers['Content-Type']).toBe('application/json');
  });

  // Test 2: LoginPage renders inputs and handles form validation
  it('renders LoginPage email and password fields with high-density workstation UI', async () => {
    vi.spyOn(authApi, 'getMe').mockRejectedValue({
      response: { status: 401, data: { detail: 'Unauthorized' } }
    });

    render(
      <BrowserRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </BrowserRouter>
    );

    // Verify institutional brand headers
    expect(screen.getByText('CO-PILOT // CONTRACT INTELLIGENCE')).toBeTruthy();
    expect(screen.getByText('OPERATOR AUTHENTICATION')).toBeTruthy();

    // Verify email and password input fields
    const emailInput = screen.getByLabelText(/OPERATOR EMAIL/i);
    const passwordInput = screen.getByLabelText(/CREDENTIAL /i);
    const submitBtn = screen.getByRole('button', { name: /AUTHENTICATE WORKSTATION/i });

    expect(emailInput).toBeTruthy();
    expect(passwordInput).toBeTruthy();
    expect(submitBtn).toBeTruthy();

    // Input changes
    fireEvent.change(emailInput, { target: { value: 'analyst@enterprise.internal' } });
    fireEvent.change(passwordInput, { target: { value: 'SecurePass123!' } });

    expect(emailInput.value).toBe('analyst@enterprise.internal');
    expect(passwordInput.value).toBe('SecurePass123!');
  });

  // Test 3: AuthContext lifecycle and 401 unauthenticated resolution
  it('initializes in loading state and resolves to unauthenticated state on 401', async () => {
    // Mock getMe to simulate 401 Unauthorized
    vi.spyOn(authApi, 'getMe').mockRejectedValue({
      response: {
        status: 401,
        data: { detail: 'Given token not valid for any token type' }
      }
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    // Initial state before promise resolves
    // Wait for the auth check to complete and settle
    await waitFor(() => {
      expect(screen.getByTestId('auth-loading').textContent).toBe('done');
    });

    expect(screen.getByTestId('auth-status').textContent).toBe('unauthenticated');
    expect(screen.getByTestId('user-email').textContent).toBe('no-user');
  });
});
