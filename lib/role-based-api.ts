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
    throw new Error('[ROLE-API] userRole is undefined. API call blocked.');
  }

  switch (userRole) {
    case 'DOCTOR':
      return `${API_BASE}/api/doctor${endpoint}`;
    case 'PATIENT':
      return `${API_BASE}/api/patient${endpoint}`;
    case 'ADMIN':
      return `${API_BASE}/api/admin${endpoint}`;
    default:
      throw new Error(`[ROLE-API] Unknown role: ${userRole}`);
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
  console.log(`[ROLE-API] Fetching (${userRole}) →`, url);
  
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
    if (!user?.role) {
      throw new Error('[ROLE-API] fetchWithRole called before role is set');
    }

    return fetchRoleBased(user.role, endpoint, {
      ...options,
      headers: {
        Authorization: `Bearer ${user.token}`,
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
