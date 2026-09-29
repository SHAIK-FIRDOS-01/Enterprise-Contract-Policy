import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, subscribeToAuthFailure } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await authApi.getMe();
      if (data?.user) {
        setUser(data.user);
        setIsAuthenticated(true);
      } else {
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch (err) {
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
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
      if (data?.user) {
        setUser(data.user);
        setIsAuthenticated(true);
        return { success: true, user: data.user };
      }
      throw new Error('Invalid user payload received');
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.response?.data?.error || err.message || 'Login failed';
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
      if (data?.user) {
        // Automatically login after successful registration
        return await login({ email, password });
      }
      return { success: true };
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.response?.data?.error || err.message || 'Registration failed';
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
