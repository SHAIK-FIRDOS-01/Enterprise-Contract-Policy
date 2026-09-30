import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authApi, subscribeToAuthFailure } from '../services/api';

const AuthContext = createContext(null);

const extractErrorMessage = (err, fallback = 'Operation failed') => {
  if (!err) return fallback;
  const resData = err.response?.data;
  if (!resData) return err.message || fallback;
  if (typeof resData === 'string') return resData;
  if (resData.detail) return resData.detail;
  if (resData.error) return resData.error;
  if (resData.message) return resData.message;
  if (typeof resData === 'object') {
    const messages = Object.entries(resData)
      .map(([field, errs]) => {
        const msg = Array.isArray(errs) ? errs.join(' ') : String(errs);
        return field === 'non_field_errors' ? msg : `${field}: ${msg}`;
      })
      .filter(Boolean);
    if (messages.length > 0) return messages.join('; ');
  }
  return err.message || fallback;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const authInFlightRef = useRef(null);

  const checkAuth = useCallback(async () => {
    if (authInFlightRef.current) {
      return authInFlightRef.current;
    }

    const runCheck = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await authApi.getMe();
        const userData = data?.user || (data?.email ? data : null);
        if (userData) {
          setUser(userData);
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (err) {
        // A 401 or network error on /api/auth/me/ during bootstrap cleanly indicates an unauthenticated session
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
        authInFlightRef.current = null;
      }
    };

    authInFlightRef.current = runCheck();
    return authInFlightRef.current;
  }, []);

  useEffect(() => {
    checkAuth();

    // Clear user session if any request encounters persistent 401
    const unsubscribe = subscribeToAuthFailure(() => {
      setUser(null);
      setIsAuthenticated(false);
    });

    return () => unsubscribe();
  }, [checkAuth]);

  const login = async ({ email, password }) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await authApi.login({ email, password });
      const userData = data?.user || (data?.email ? data : null);
      if (userData) {
        setUser(userData);
        setIsAuthenticated(true);
        return { success: true, user: userData };
      }
      throw new Error('Invalid user payload received');
    } catch (err) {
      const errMsg = extractErrorMessage(err, 'Login failed');
      setError(errMsg);
      setIsAuthenticated(false);
      setUser(null);
      return { success: false, error: errMsg };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async ({ email, password, role }) => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await authApi.register({ email, password, role });
      const userData = data?.user || (data?.email ? data : null);
      if (userData) {
        // Automatically login after successful registration
        return await login({ email, password });
      }
      return { success: true };
    } catch (err) {
      const errMsg = extractErrorMessage(err, 'Registration failed');
      setError(errMsg);
      return { success: false, error: errMsg };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      setIsLoading(true);
      await authApi.logout();
    } catch (err) {
      // Ignore logout network errors, proceed with local session clearing
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoading(false);
    }
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    logout,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
