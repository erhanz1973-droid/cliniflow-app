// API_ROUTES - Centralized endpoint configuration
export const API_ROUTES = {
  // Doctor endpoints
  doctor: {
    login: '/api/doctor/login',
    encounters: '/api/doctor/encounters',
    encountersByPatient: (id: string) => `/api/doctor/encounters/patient/${id}`,
    encounterById: (id: string) => `/api/doctor/encounters/${id}`,
    encounterDiagnoses: (id: string) => `/api/doctor/encounters/${id}/diagnoses`,
    patientDiagnoses: (id: string) => `/api/doctor/patients/${id}/diagnoses`,
    patientTreatments: (id: string) => `/api/doctor/patients/${id}/treatments`,
    addPatientTreatment: (id: string) => `/api/doctor/patients/${id}/treatments`,
    updateTreatment: (id: string) => `/api/doctor/treatments/${id}`,
    doctors: '/api/doctor/doctors',
    treatmentPlans: '/api/doctor/treatment-plans',
    patients: '/api/doctor/patients',
  },
  
  // Treatment endpoints (legacy - to be phased out)
  TREATMENT_ENCOUNTERS: '/api/treatment/encounters',
  TREATMENT_ENCOUNTERS_PATIENT: (patientId: string) => `/api/treatment/encounters/patient/${patientId}`,
  TREATMENT_ENCOUNTERS_DETAIL: (encounterId: string) => `/api/treatment/encounters/${encounterId}`,
  TREATMENT_ENCOUNTERS_DIAGNOSES: (encounterId: string) => `/api/treatment/encounters/${encounterId}/diagnoses`,
  TREATMENT_ENCOUNTERS_TREATMENT_PLANS: (encounterId: string) => `/api/treatment/encounters/${encounterId}/treatment-plans`,
  TREATMENT_PLANS_ITEMS: (planId: string) => `/api/treatment-plans/${planId}/items`,
  TREATMENT_ITEMS_STATUS: (itemId: string) => `/api/treatment/treatment-items/${itemId}/status`,
  
  // Auth endpoints
  AUTH_VERIFY: '/api/auth/verify',
  AUTH_LOGIN: '/api/auth/login',
  
  // Admin endpoints
  ADMIN_PATIENTS: '/api/admin/patients',
  ADMIN_DOCTORS: '/api/admin/doctors',
} as const;

// Helper function to build URLs with API_BASE
export const buildApiUrl = (base: string, route: string): string => {
  return `${base}${route}`;
};
