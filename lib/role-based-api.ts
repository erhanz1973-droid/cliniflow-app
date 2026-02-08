// lib/role-based-api.ts
import { API_BASE } from './api';
import { useAuth } from './auth';
import type { UserRole } from './auth';

/**
 * Role-based API endpoint selector
 * - Doctor → /api/doctor/*
 * - Patient → /api/patient/*
 * - Admin → /api/admin/*
 */

export function getRoleBasedEndpoint(userRole: UserRole | undefined, endpoint: string): string {
  if (!userRole) {
    console.warn('[ROLE-API] No user role provided, defaulting to patient endpoints');
    return `${API_BASE}/api/patient${endpoint}`;
  }

  switch (userRole) {
    case 'DOCTOR':
      return `${API_BASE}/api/doctor${endpoint}`;
    case 'PATIENT':
      return `${API_BASE}/api/patient${endpoint}`;
    case 'ADMIN':
      return `${API_BASE}/api/admin${endpoint}`;
    default:
      console.warn('[ROLE-API] Unknown role, defaulting to patient endpoints:', userRole);
      return `${API_BASE}/api/patient${endpoint}`;
  }
}

/**
 * Common endpoints that work for all roles
 */
export const COMMON_ENDPOINTS = {
  ME: '/me',
  PROFILE: '/profile',
  SETTINGS: '/settings',
  MESSAGES: '/messages',
  REFERRALS: '/referrals',
  TREATMENTS: '/treatments',
  HEALTH: '/health',
  TRAVEL: '/travel',
  PHOTO: '/photo',
} as const;

/**
 * Role-specific fetch helper
 */
export async function fetchRoleBased(
  userRole: UserRole | undefined,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const url = getRoleBasedEndpoint(userRole, endpoint);
  console.log(`[ROLE-API] Fetching from ${userRole} endpoint:`, url);
  
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Hook for role-based API calls
 */
export function useRoleBasedAPI() {
  const { user } = useAuth();
  
  const fetchWithRole = (endpoint: string, options: RequestInit = {}) => {
    return fetchRoleBased(user?.role, endpoint, {
      ...options,
      headers: {
        Authorization: user?.token ? `Bearer ${user.token}` : '',
        ...options.headers,
      },
    });
  };
  
  return {
    fetchWithRole,
    userRole: user?.role,
    userId: user?.id,
  };
}
