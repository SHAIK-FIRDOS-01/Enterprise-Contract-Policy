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

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve();
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Do not attempt token refresh for auth endpoints or if already retried
    const isAuthRoute =
      originalRequest?.url?.includes('/api/auth/login/') ||
      originalRequest?.url?.includes('/api/auth/register/') ||
      originalRequest?.url?.includes('/api/auth/refresh/') ||
      originalRequest?.url?.includes('/api/auth/me/');

    if (error.response?.status === 401 && !originalRequest?._retry && !isAuthRoute) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => api(originalRequest))
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        await api.post('/api/auth/refresh/');
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        authListeners.forEach((callback) => callback(refreshError));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // If persistent 401 on retried request, notify listeners to clear session
    if (error.response?.status === 401 && originalRequest?._retry && !isAuthRoute) {
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
