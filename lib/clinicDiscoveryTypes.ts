export type DiscoveryMediaItem = {
  url?: string;
  caption?: string;
  title?: string;
};

export type DiscoveryClinicCard = {
  id: string;
  name: string;
  clinicCode?: string | null;
  city?: string | null;
  country?: string | null;
  logoUrl?: string | null;
  coverPhotoUrl?: string | null;
  shortDescription?: string | null;
  googleRating?: number | null;
  googleReviewCount?: number | null;
  trustpilotRating?: number | null;
  trustpilotReviewCount?: number | null;
  internationalPatientCount?: number | null;
  certifications?: string[];
  awards?: string[];
  isFeatured?: boolean;
  listingTier?: string;
  socialPresenceScore?: number;
  discoveryRankScore?: number;
  languages?: string[];
  specialties?: string[];
  isVerified?: boolean;
  googleMapsUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  /** Legacy internal ratings table */
  rating?: number | null;
  distance_km?: number | null;
};

export type DiscoveryDoctor = {
  id: string;
  name: string;
  title?: string | null;
  bio?: string | null;
  photoUrl?: string | null;
  specialties?: string[];
};

export type DiscoveryClinicProfile = DiscoveryClinicCard & {
  aboutText?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  youtubeUrl?: string | null;
  linkedinUrl?: string | null;
  whatsapp?: string | null;
  googleReviewsUrl?: string | null;
  trustpilotUrl?: string | null;
  yearsInOperation?: number | null;
  services?: string[];
  technologies?: string[];
  workingHours?: Record<string, unknown>;
  mediaGallery?: {
    photos?: DiscoveryMediaItem[];
    beforeAfter?: DiscoveryMediaItem[];
    videos?: DiscoveryMediaItem[];
  };
  team?: DiscoveryDoctor[];
  profileCompletenessPercent?: number;
};

export type DiscoveryFilterState = {
  minGoogleRating: number | null;
  minGoogleReviews: number | null;
  verifiedOnly: boolean;
  specialty: string;
  language: string;
};

export const DISCOVERY_SPECIALTY_OPTIONS = [
  "Implants",
  "Veneers",
  "Orthodontics",
  "Cosmetic Dentistry",
  "Oral Surgery",
  "Periodontics",
  "Pediatric Dentistry",
  "General Dentistry",
] as const;

export const DISCOVERY_LANGUAGE_OPTIONS = [
  "English",
  "Turkish",
  "Russian",
  "Arabic",
  "German",
  "French",
  "Georgian",
] as const;
