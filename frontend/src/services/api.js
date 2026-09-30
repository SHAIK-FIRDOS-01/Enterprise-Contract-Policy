import axios from 'axios';

/**
 * Preconfigured Axios instance enforcing HttpOnly cookie credential rotation.
 * Invariant: withCredentials must strictly be true so the browser automatically
 * attaches access_token and refresh_token cookies to requests.
 */
const api = axios.create({
  baseURL: '',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Event listener mechanism for 401 unauthorized session expiration
const authListeners = new Set();

export const subscribeToAuthFailure = (callback) => {
  authListeners.add(callback);
  return () => authListeners.delete(callback);
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    // Notify listeners if request failed with 401 Unauthorized and not already retrying
    if (error.response?.status === 401 && !originalRequest?._retry) {
      originalRequest._retry = true;
      authListeners.forEach((callback) => callback(error));
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: async ({ email, password }) => {
    const response = await api.post('/api/auth/login/', { email, password });
    return response.data;
  },
  register: async ({ email, password, role }) => {
    const response = await api.post('/api/auth/register/', { email, password, role });
    return response.data;
  },
  logout: async () => {
    const response = await api.post('/api/auth/logout/');
    return response.data;
  },
  getMe: async () => {
    const response = await api.get('/api/auth/me/');
    return response.data;
  },
  refreshToken: async () => {
    const response = await api.post('/api/auth/refresh/');
    return response.data;
  },
};

export default api;
