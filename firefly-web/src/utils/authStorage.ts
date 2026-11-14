/**
 * Centralised access to the auth material persisted in localStorage.
 * Keeping the keys in one module prevents the request layer and the auth store
 * from drifting apart (previously both maintained their own literals).
 */
export const ACCESS_TOKEN_KEY = 'access_token';
export const REFRESH_TOKEN_KEY = 'refresh_token';
export const USER_CACHE_KEY = 'user_info';
export const SESSION_EXPIRED_KEY = 'firefly:session-expired';

function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode / quota); the app still works in-memory.
  }
}

function safeRemoveItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getAccessToken(): string | null {
  return safeGetItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return safeGetItem(REFRESH_TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  safeSetItem(ACCESS_TOKEN_KEY, token);
}

export function setRefreshToken(token: string): void {
  safeSetItem(REFRESH_TOKEN_KEY, token);
}

export function clearTokens(): void {
  safeRemoveItem(ACCESS_TOKEN_KEY);
  safeRemoveItem(REFRESH_TOKEN_KEY);
}

export function clearRefreshToken(): void {
  safeRemoveItem(REFRESH_TOKEN_KEY);
}

export function readUserCache(): string | null {
  return safeGetItem(USER_CACHE_KEY);
}

export function writeUserCache(value: string): void {
  safeSetItem(USER_CACHE_KEY, value);
}

export function clearUserCache(): void {
  safeRemoveItem(USER_CACHE_KEY);
}

export function markSessionExpired(): void {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
  } catch {
    // ignore
  }
}

export function consumeSessionExpired(): boolean {
  try {
    const expired = sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1';
    if (expired) {
      sessionStorage.removeItem(SESSION_EXPIRED_KEY);
    }
    return expired;
  } catch {
    return false;
  }
}

export function clearSessionExpired(): void {
  try {
    sessionStorage.removeItem(SESSION_EXPIRED_KEY);
  } catch {
    // ignore
  }
}
