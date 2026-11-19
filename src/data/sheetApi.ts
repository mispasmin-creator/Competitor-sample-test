import type { LabSnapshot, LoginResponseData } from '../types/lab';

export const DEFAULT_SHEET_API_URL =
  'https://script.google.com/macros/s/AKfycbykpAGc7u-o3qDqmBMXdy-Nzb0XzvpZUfLW0y5ooLjsl3D8KfC9k_Adbl5GB4PYao8gzw/exec';

export const TOKEN_STORAGE_KEY = 'csl_token';

function getEnvApiUrl(): string {
  try {
    const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    const configured = viteEnv?.VITE_SHEET_API_URL?.trim();
    return configured || DEFAULT_SHEET_API_URL;
  } catch {
    return DEFAULT_SHEET_API_URL;
  }
}

export const SHEET_API_URL = getEnvApiUrl();

export class SessionAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionAuthError';
  }
}

export function isSessionErrorMessage(message: string): boolean {
  return /session expired|not logged in/i.test(message);
}

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null): void {
  try {
    if (!token) {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } else {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  } catch (err) {
    console.error('Failed to update auth token in localStorage:', err);
  }
}

/**
 * Removes legacy localStorage business data keys from earlier local-only versions,
 * preserving only csl_token and theme preference (csl_v1_theme).
 */
export function purgeLegacyBusinessLocalStorage(): void {
  try {
    const legacyKeys = [
      'csl_v1_lab_data',
      'csl_v2_lab_data',
      'csl_v1_user_session',
      'csl_v2_user_session',
      'csl_v1_users',
    ];
    for (const key of legacyKeys) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access failures
  }
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

type ErrorObserver = (message: string, isAuthError: boolean) => void;
let errorObserver: ErrorObserver | null = null;

export function setApiErrorObserver(observer: ErrorObserver | null): void {
  errorObserver = observer;
}

export async function call<T = LabSnapshot>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<T> {
  const token = action === 'login' ? undefined : getToken();

  let response: Response;
  try {
    response = await fetch(SHEET_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action,
        ...(action === 'login' ? {} : { token: token ?? '' }),
        payload,
      }),
    });
  } catch {
    const msg = 'Unable to reach laboratory server. Check your connection and try again.';
    errorObserver?.(msg, false);
    throw new Error(msg);
  }

  let parsed: ApiEnvelope<T>;
  try {
    parsed = (await response.json()) as ApiEnvelope<T>;
  } catch {
    const msg = `Invalid server response (${response.status})`;
    errorObserver?.(msg, false);
    throw new Error(msg);
  }

  if (!parsed.ok) {
    const message = parsed.error || 'Server request failed';
    const isAuthError = isSessionErrorMessage(message);
    if (isAuthError) {
      saveToken(null);
      errorObserver?.(message, true);
      throw new SessionAuthError(message);
    }
    errorObserver?.(message, false);
    throw new Error(message);
  }

  return parsed.data as T;
}

export async function loginRequest(
  username: string,
  password: string
): Promise<LoginResponseData> {
  return call<LoginResponseData>('login', { username, password });
}
