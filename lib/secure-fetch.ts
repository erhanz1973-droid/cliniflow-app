import { API_BASE, TIMEOUT_GET, TIMEOUT_POST } from './api';

export type SecureFetchOptions = RequestInit & { timeoutMs?: number };

// Secure fetch pattern with proper error handling
export async function secureFetch(
  endpoint: string,
  options: SecureFetchOptions = {},
  token?: string
): Promise<any> {
  const url = `${API_BASE}${endpoint}`;
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const { timeoutMs: timeoutOverride, ...fetchOptions } = options;
  const controller = new AbortController();
  const timeoutMs =
    timeoutOverride ??
    ((fetchOptions.method === 'POST' || fetchOptions.method === 'PUT') ? TIMEOUT_POST : TIMEOUT_GET);
  const timerId = setTimeout(() => controller.abort(), timeoutMs);

  const mergedOptions: RequestInit = {
    ...fetchOptions,
    signal: (fetchOptions as any).signal ?? controller.signal,
    headers: {
      ...defaultHeaders,
      ...fetchOptions.headers,
    },
  };

  try {
    console.log(`[API] ${fetchOptions.method || 'GET'} ${endpoint}`);
    
    const res = await fetch(url, mergedOptions);
    clearTimeout(timerId);
    const contentType = res.headers.get('content-type');
    
    console.log(`[API] Response status: ${res.status}`);
    console.log(`[API] Content-Type: ${contentType}`);

    // Handle non-success responses
    if (!res.ok) {
      const raw = await res.text();
      console.error(`[API] Request failed (${res.status}):`, raw);
      let parsed: { error?: string; message?: string } | null = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }
      const detail =
        (parsed && (parsed.message || parsed.error)) ||
        raw ||
        `Request failed with status ${res.status}`;
      const err = new Error(detail) as Error & { code?: string; status?: number };
      if (parsed?.error) err.code = String(parsed.error);
      err.status = res.status;
      throw err;
    }

    // Ensure we get JSON response
    if (!contentType?.includes('application/json')) {
      const raw = await res.text();
      console.error(`[API] Non-JSON response:`, raw);
      console.error(`[API] Raw response starts with:`, raw.substring(0, 100));
      throw new Error('Invalid API response format');
    }

    const data = await res.json();
    console.log(`[API] Success:`, data);
    return data;

  } catch (error: any) {
    clearTimeout(timerId);
    if (error?.name === 'AbortError') {
      const timeoutErr = new Error(`Request timeout: ${endpoint}`);
      (timeoutErr as any).kind = 'timeout';
      throw timeoutErr;
    }
    console.error(`[API] Error for ${endpoint}:`, error);
    throw error;
  }
}

// Helper for POST requests
export async function securePost(
  endpoint: string,
  body: any,
  token?: string,
  opts?: { timeoutMs?: number }
): Promise<any> {
  return secureFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
    timeoutMs: opts?.timeoutMs,
  }, token);
}

// Helper for GET requests
export async function secureGet(
  endpoint: string,
  token?: string
): Promise<any> {
  return secureFetch(endpoint, {
    method: 'GET',
  }, token);
}
