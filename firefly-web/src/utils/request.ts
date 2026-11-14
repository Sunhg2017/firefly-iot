import axios, { AxiosHeaders } from 'axios';
import type { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import { normalizeDateTimeStrings } from './datetime';
import {
  getAccessToken,
  getRefreshToken,
  markSessionExpired,
  setAccessToken,
  setRefreshToken,
} from './authStorage';

export interface R<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** Fired when the refresh token is missing or rejected; the layout handles redirecting. */
export const SESSION_EXPIRED_EVENT = 'firefly:session-expired';

const AUTH_ENDPOINT_HINTS = ['/auth/login', '/auth/refresh', '/auth/sms/send', '/auth/oauth'];

let refreshPromise: Promise<string> | null = null;
let sessionExpiredNotified = false;

function isAuthEndpoint(url?: string): boolean {
  return Boolean(url && AUTH_ENDPOINT_HINTS.some((hint) => url.includes(hint)));
}

/** Called by the auth store after a successful login so a later expiry notifies again. */
export function markSessionActive(): void {
  sessionExpiredNotified = false;
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('缺少刷新令牌');
  }
  const response = await axios.post('/SYSTEM/api/v1/auth/refresh', { refreshToken }, { timeout: 15000 });
  const payload = response.data?.data ?? {};
  const accessToken = payload.accessToken as string | undefined;
  if (!accessToken) {
    throw new Error('刷新令牌响应无效');
  }
  setAccessToken(accessToken);
  if (typeof payload.refreshToken === 'string' && payload.refreshToken) {
    setRefreshToken(payload.refreshToken);
  }
  return accessToken;
}

/**
 * Single-flight refresh: concurrent 401s must share one refresh request, otherwise
 * rotating refresh tokens make every request after the first one fail and the user
 * gets logged out even though the session was still recoverable.
 */
function requestTokenRefresh(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

function handleSessionExpired(): void {
  if (sessionExpiredNotified) {
    return;
  }
  sessionExpiredNotified = true;
  markSessionExpired();
  // The layout owns navigation and store cleanup; the request layer must not hard-reload
  // the whole SPA (that used to discard open tabs, filters and unsaved forms).
  window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}

function createServiceRequest(serviceName: string): AxiosInstance {
  const instance = axios.create({
    baseURL: `/${serviceName.toUpperCase()}/api/v1`,
    timeout: 15000,
  });

  instance.interceptors.request.use((config) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['X-Platform'] = 'WEB';
    return config;
  });

  instance.interceptors.response.use(
    (response: AxiosResponse<R>) => {
      response.data = normalizeDateTimeStrings(response.data);
      return response;
    },
    async (error: AxiosError) => {
      const originalRequest = error.config as (typeof error.config & { _retry?: boolean }) | undefined;

      if (
        error.response?.status === 401
        && originalRequest
        && !originalRequest._retry
        && !isAuthEndpoint(originalRequest.url)
      ) {
        originalRequest._retry = true;
        if (getRefreshToken()) {
          try {
            const accessToken = await requestTokenRefresh();
            const retryHeaders = AxiosHeaders.from(originalRequest.headers);
            retryHeaders.set('Authorization', `Bearer ${accessToken}`);
            originalRequest.headers = retryHeaders;
            return instance(originalRequest);
          } catch {
            handleSessionExpired();
            return Promise.reject(error);
          }
        }
        handleSessionExpired();
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
