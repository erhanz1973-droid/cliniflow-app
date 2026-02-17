import { API_BASE } from './api';

// Secure fetch pattern with proper error handling
export async function secureFetch(
  endpoint: string,
  options: RequestInit = {},
  token?: string
): Promise<any> {
  const url = `${API_BASE}${endpoint}`;
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
  };

  const mergedOptions: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };

  try {
    console.log(`[API] ${options.method || 'GET'} ${endpoint}`);
    
    const res = await fetch(url, mergedOptions);
    const contentType = res.headers.get('content-type');
    
    console.log(`[API] Response status: ${res.status}`);
    console.log(`[API] Content-Type: ${contentType}`);

    // Handle non-success responses
    if (!res.ok) {
      const raw = await res.text();
      console.error(`[API] Request failed (${res.status}):`, raw);
      console.error(`[API] Raw response starts with:`, raw.substring(0, 100));
      throw new Error(raw || `Request failed with status ${res.status}`);
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

  } catch (error) {
    console.error(`[API] Error for ${endpoint}:`, error);
    throw error;
  }
}

// Helper for POST requests
export async function securePost(
  endpoint: string,
  body: any,
  token?: string
): Promise<any> {
  return secureFetch(endpoint, {
    method: 'POST',
    body: JSON.stringify(body),
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
