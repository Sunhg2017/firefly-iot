import axios from 'axios';
import type { AxiosInstance, AxiosResponse } from 'axios';
import { normalizeDateTimeStrings } from './datetime';

export interface R<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/**
 * Create an axios instance for a specific microservice.
 * URL convention: /{SERVICENAME}/api/v1/...
 * Gateway rewrites to /api/v1/... before forwarding to lb://firefly-{serviceName}.
 */
function createServiceRequest(serviceName: string): AxiosInstance {
  const instance = axios.create({
    baseURL: `/${serviceName.toUpperCase()}/api/v1`,
    timeout: 15000,
  });

  // Request interceptor: attach token
  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['X-Platform'] = 'WEB';
    return config;
  });

  // Response interceptor: handle token refresh
  instance.interceptors.response.use(
    (response: AxiosResponse<R>) => {
      response.data = normalizeDateTimeStrings(response.data);
      return response;
    },
    async (error) => {
      const originalRequest = error.config;
      if (error.response?.status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;
        const refreshToken = localStorage.getItem('refresh_token');
        if (refreshToken) {
          try {
            const res = await axios.post('/SYSTEM/api/v1/auth/refresh', { refreshToken });
            const { accessToken, refreshToken: newRefresh } = res.data.data;
            localStorage.setItem('access_token', accessToken);
            if (newRefresh) localStorage.setItem('refresh_token', newRefresh);
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
            return instance(originalRequest);
          } catch {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            window.location.href = '/login';
          }
        } else {
          window.location.href = '/login';
        }
      }
      return Promise.reject(error);
    },
  );

  return instance;
}

// Service-specific axios instances
export const systemRequest = createServiceRequest('system');
export const deviceRequest = createServiceRequest('device');
export const ruleRequest = createServiceRequest('rule');
export const dataRequest = createServiceRequest('data');
export const supportRequest = createServiceRequest('support');
export const mediaRequest = createServiceRequest('media');
export const connectorRequest = createServiceRequest('connector');

// Default export kept for backward compatibility (points to system service)
const request = systemRequest;
export default request;
