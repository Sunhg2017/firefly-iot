import type { AxiosError } from 'axios';

interface ApiErrorBody {
  code?: number | string;
  message?: string;
}

const NETWORK_MESSAGE = '无法连接服务器，请检查网络后重试';
const TIMEOUT_MESSAGE = '请求超时，请稍后重试';

function isAxiosLike(error: unknown): error is AxiosError<ApiErrorBody> {
  return typeof error === 'object' && error !== null && 'isAxiosError' in error;
}

/** Extract the HTTP status code from an axios error, if any. */
export function getErrorStatus(error: unknown): number | undefined {
  if (isAxiosLike(error)) {
    return error.response?.status;
  }
  return undefined;
}

/**
 * Single source of truth for user-facing request error messages.
 *
 * Priority: backend `message` -> network/timeout/HTTP status wording -> Error.message -> fallback.
 * Pages must pass a short action fallback (e.g. "保存设备失败") so the message stays actionable
 * even when the backend returns nothing useful.
 */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error == null) {
    return fallback;
  }

  if (typeof error === 'string') {
    return error.trim() || fallback;
  }

  if (isAxiosLike(error)) {
    const body = error.response?.data as unknown;
    if (typeof body === 'string') {
      const text = body.trim();
      if (text && !/^<!doctype html/i.test(text)) {
        return text;
      }
    } else if (body && typeof body === 'object') {
      const message = (body as ApiErrorBody).message;
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }
    }

    const status = error.response?.status;
    if (status === 401) {
      return '登录状态已失效，请重新登录';
    }
    if (status === 403) {
      return '没有权限执行该操作';
    }
    if (status === 404) {
      return '请求的资源不存在或已被删除';
    }
    if (status === 429) {
      return '操作过于频繁，请稍后重试';
    }
    if (status != null && status >= 500) {
      return '服务器处理失败，请稍后重试';
    }

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return TIMEOUT_MESSAGE;
    }
    if (error.code === 'ERR_NETWORK' || (error.request && !error.response)) {
      return NETWORK_MESSAGE;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    // Axios' generic "Request failed with status code 500" adds no value to users.
    if (!/^Request failed with status code \d+$/.test(error.message.trim())) {
      return error.message.trim();
    }
  }

  return fallback;
}

/** True when the failure is caused by the session no longer being valid. */
export function isUnauthorizedError(error: unknown): boolean {
  return getErrorStatus(error) === 401;
}
