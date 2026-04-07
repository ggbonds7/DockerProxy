import type { ApiErrorNormalized, FeedbackAction, NotifyLevel } from '../types';

export const APP_NOTIFY_EVENT = 'app:notify';
export const APP_API_ERROR_EVENT = 'app:api-error';

export type NotifyEventDetail = {
  level: NotifyLevel;
  message: string;
  description?: string;
  source?: string;
  sticky?: boolean;
  action?: FeedbackAction;
};

export type ApiErrorEventDetail = {
  error: ApiErrorNormalized;
  source?: string;
  retry?: (() => Promise<Response>) | undefined;
};

export type ApiRequestOptions = RequestInit & {
  suppressGlobalError?: boolean;
  source?: string;
};

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

export class ApiRequestError extends Error {
  normalized: ApiErrorNormalized;

  constructor(normalized: ApiErrorNormalized) {
    super(normalized.message);
    this.name = 'ApiRequestError';
    this.normalized = normalized;
  }
}

function dispatchWindowEvent<T>(eventName: string, detail: T) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export async function parseResponseBody(res: Response) {
  const contentType = res.headers.get('content-type') || '';
  const cloned = res.clone();

  try {
    if (contentType.includes('application/json')) {
      return await cloned.json();
    }

    const text = await cloned.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

export async function normalizeApiError(res: Response, payload?: unknown): Promise<ApiErrorNormalized> {
  const parsed = payload === undefined ? await parseResponseBody(res) : payload;
  const asObject = typeof parsed === 'object' && parsed ? (parsed as Record<string, unknown>) : {};
  const textMessage = typeof parsed === 'string' ? parsed : undefined;

  const message =
    (typeof asObject.details === 'string' && asObject.details) ||
    (typeof asObject.error === 'string' && asObject.error) ||
    (typeof asObject.message === 'string' && asObject.message) ||
    textMessage ||
    `Request failed with status ${res.status}`;

  const code =
    (typeof asObject.code === 'string' && asObject.code) ||
    (typeof asObject.errorCode === 'string' && asObject.errorCode) ||
    `HTTP_${res.status}`;

  const requestId =
    res.headers.get('x-request-id') || res.headers.get('x-correlation-id') || (asObject.requestId as string | undefined);

  return {
    status: res.status,
    code,
    message,
    details: typeof asObject.details === 'string' ? asObject.details : undefined,
    requestId,
    retryable: RETRYABLE_STATUS.has(res.status),
  };
}

export function normalizeUnknownError(error: unknown): ApiErrorNormalized {
  if (error instanceof ApiRequestError) {
    return error.normalized;
  }

  if (error instanceof Error) {
    return {
      status: 0,
      code: 'NETWORK_ERROR',
      message: error.message || 'Network request failed',
      retryable: true,
    };
  }

  return {
    status: 0,
    code: 'UNKNOWN_ERROR',
    message: 'Unexpected error',
    retryable: true,
  };
}

export function notify(level: NotifyLevel, message: string, source?: string, description?: string, action?: FeedbackAction) {
  dispatchWindowEvent<NotifyEventDetail>(APP_NOTIFY_EVENT, {
    level,
    message,
    source,
    description,
    action,
    sticky: level === 'error',
  });
}

export function notifySuccess(message: string, source?: string, description?: string) {
  notify('success', message, source, description);
}

export function notifyInfo(message: string, source?: string, description?: string) {
  notify('info', message, source, description);
}

export function notifyWarning(message: string, source?: string, description?: string) {
  notify('warning', message, source, description);
}

export function notifyError(message: string, source?: string, description?: string) {
  notify('error', message, source, description);
}

export async function apiFetch(url: string, options: ApiRequestOptions = {}) {
  const token = localStorage.getItem('token');
  const headers = new Headers(options.headers);

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const { suppressGlobalError = false, source, ...requestInit } = options;

  try {
    const res = await fetch(url, { ...requestInit, headers });

    if (res.status === 401) {
      window.dispatchEvent(new Event('auth-unauthorized'));
    }

    if (!res.ok && !suppressGlobalError) {
      const normalized = await normalizeApiError(res);
      const retry = normalized.retryable ? () => apiFetch(url, { ...options, suppressGlobalError }) : undefined;

      dispatchWindowEvent<ApiErrorEventDetail>(APP_API_ERROR_EVENT, {
        error: normalized,
        source,
        retry,
      });
    }

    return res;
  } catch (error) {
    if (!suppressGlobalError) {
      const normalized = normalizeUnknownError(error);
      const retry = normalized.retryable ? () => apiFetch(url, { ...options, suppressGlobalError }) : undefined;

      dispatchWindowEvent<ApiErrorEventDetail>(APP_API_ERROR_EVENT, {
        error: normalized,
        source,
        retry,
      });
    }

    throw error;
  }
}

export async function requestJson<T>(url: string, options: ApiRequestOptions = {}) {
  const res = await apiFetch(url, options);
  const payload = await parseResponseBody(res);

  if (!res.ok) {
    throw new ApiRequestError(await normalizeApiError(res, payload));
  }

  return payload as T;
}

export async function requestText(url: string, options: ApiRequestOptions = {}) {
  const res = await apiFetch(url, options);
  const text = await res.text();

  if (!res.ok) {
    throw new ApiRequestError(await normalizeApiError(res, text));
  }

  return text;
}
