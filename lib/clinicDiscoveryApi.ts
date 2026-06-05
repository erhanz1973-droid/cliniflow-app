import { API_BASE } from "./api";
import type { DiscoveryClinicCard, DiscoveryClinicProfile, DiscoveryFilterState } from "./clinicDiscoveryTypes";

function buildDiscoveryQuery(
  country: string,
  city: string,
  filters: DiscoveryFilterState,
): string {
  const params = new URLSearchParams();
  params.set("country", country);
  if (city.trim()) params.set("city", city.trim());
  if (filters.minGoogleRating != null) {
    params.set("min_google_rating", String(filters.minGoogleRating));
  }
  if (filters.minGoogleReviews != null) {
    params.set("min_google_reviews", String(filters.minGoogleReviews));
  }
  if (filters.verifiedOnly) params.set("verified_only", "true");
  if (filters.specialty.trim()) params.set("specialty", filters.specialty.trim());
  if (filters.language.trim()) params.set("language", filters.language.trim());
  return params.toString();
}

export function mapDiscoveryListRow(c: Record<string, unknown>): DiscoveryClinicCard {
  return {
    id: String(c.id ?? ""),
    name: String(c.name ?? "Clinic").trim() || "Clinic",
    clinicCode:
      c.clinicCode != null
        ? String(c.clinicCode).trim() || null
        : c.clinic_code != null
          ? String(c.clinic_code).trim() || null
          : null,
    city: c.city != null ? String(c.city) : null,
    country: c.country != null ? String(c.country) : null,
    logoUrl:
      c.logoUrl != null
        ? String(c.logoUrl).trim() || null
        : c.logo_url != null
          ? String(c.logo_url).trim() || null
          : null,
    shortDescription:
      c.shortDescription != null
        ? String(c.shortDescription)
        : c.short_description != null
          ? String(c.short_description)
          : null,
    googleRating:
      c.googleRating != null
        ? Number(c.googleRating)
        : c.google_rating != null
          ? Number(c.google_rating)
          : c.rating != null
            ? Number(c.rating)
            : null,
    googleReviewCount:
      c.googleReviewCount != null
        ? Number(c.googleReviewCount)
        : c.google_review_count != null
          ? Number(c.google_review_count)
          : null,
    trustpilotRating:
      c.trustpilotRating != null
        ? Number(c.trustpilotRating)
        : c.trustpilot_rating != null
          ? Number(c.trustpilot_rating)
          : null,
    trustpilotReviewCount:
      c.trustpilotReviewCount != null
        ? Number(c.trustpilotReviewCount)
        : c.trustpilot_review_count != null
          ? Number(c.trustpilot_review_count)
          : null,
    internationalPatientCount:
      c.internationalPatientCount != null
        ? Number(c.internationalPatientCount)
        : c.international_patient_count != null
          ? Number(c.international_patient_count)
          : null,
    languages: Array.isArray(c.languages) ? (c.languages as string[]) : [],
    specialties: Array.isArray(c.specialties) ? (c.specialties as string[]) : [],
    isVerified: c.isVerified === true || c.is_verified === true,
    googleMapsUrl:
      c.googleMapsUrl != null
        ? String(c.googleMapsUrl)
        : c.google_maps_url != null
          ? String(c.google_maps_url)
          : null,
    websiteUrl:
      c.websiteUrl != null
        ? String(c.websiteUrl)
        : c.website_url != null
          ? String(c.website_url)
          : c.website != null
            ? String(c.website)
            : null,
    facebookUrl:
      c.facebookUrl != null ? String(c.facebookUrl) : c.facebook_url != null ? String(c.facebook_url) : null,
    instagramUrl:
      c.instagramUrl != null ? String(c.instagramUrl) : c.instagram_url != null ? String(c.instagram_url) : null,
    tiktokUrl: c.tiktokUrl != null ? String(c.tiktokUrl) : c.tiktok_url != null ? String(c.tiktok_url) : null,
    youtubeUrl:
      c.youtubeUrl != null ? String(c.youtubeUrl) : c.youtube_url != null ? String(c.youtube_url) : null,
    linkedinUrl:
      c.linkedinUrl != null ? String(c.linkedinUrl) : c.linkedin_url != null ? String(c.linkedin_url) : null,
    googleReviewsUrl:
      c.googleReviewsUrl != null
        ? String(c.googleReviewsUrl)
        : c.google_reviews_url != null
          ? String(c.google_reviews_url)
          : null,
    latitude: c.latitude != null ? Number(c.latitude) : null,
    longitude: c.longitude != null ? Number(c.longitude) : null,
    rating: c.rating != null ? Number(c.rating) : null,
  };
}

export async function fetchDiscoveryClinics(
  country: string,
  city: string,
  filters: DiscoveryFilterState,
): Promise<DiscoveryClinicCard[]> {
  const qs = buildDiscoveryQuery(country, city, filters);
  const res = await fetch(`${API_BASE}/api/discovery/clinics?${qs}`);
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    clinics?: Record<string, unknown>[];
    message?: string;
    error?: string;
  };
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  return (Array.isArray(data.clinics) ? data.clinics : []).map(mapDiscoveryListRow);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mergeDiscoveryCardWithProfile(
  card: DiscoveryClinicCard,
  profile: DiscoveryClinicProfile | null,
): DiscoveryClinicCard {
  if (!profile) return card;
  return {
    ...card,
    shortDescription: profile.shortDescription ?? card.shortDescription,
    googleRating: profile.googleRating ?? card.googleRating,
    googleReviewCount: profile.googleReviewCount ?? card.googleReviewCount,
    trustpilotRating: profile.trustpilotRating ?? card.trustpilotRating,
    trustpilotReviewCount: profile.trustpilotReviewCount ?? card.trustpilotReviewCount,
    websiteUrl: profile.websiteUrl ?? card.websiteUrl,
    facebookUrl: profile.facebookUrl ?? card.facebookUrl,
    instagramUrl: profile.instagramUrl ?? card.instagramUrl,
    tiktokUrl: profile.tiktokUrl ?? card.tiktokUrl,
    youtubeUrl: profile.youtubeUrl ?? card.youtubeUrl,
    linkedinUrl: profile.linkedinUrl ?? card.linkedinUrl,
    googleReviewsUrl: profile.googleReviewsUrl ?? card.googleReviewsUrl,
    googleMapsUrl: profile.googleMapsUrl ?? card.googleMapsUrl,
    logoUrl: profile.logoUrl ?? card.logoUrl,
  };
}

/** List endpoint omits social/reputation on older backends — hydrate from profile API. */
export async function enrichDiscoveryClinicsWithProfiles(
  cards: DiscoveryClinicCard[],
): Promise<DiscoveryClinicCard[]> {
  if (!cards.length) return cards;
  const valid = cards.filter((c) => UUID_RE.test(String(c.id || "").trim()));
  const profiles = await Promise.all(
    valid.map(async (card) => {
      try {
        return await fetchDiscoveryClinicProfile(card.id);
      } catch {
        return null;
      }
    }),
  );
  const byId = new Map<string, DiscoveryClinicProfile | null>();
  valid.forEach((card, index) => {
    byId.set(card.id, profiles[index]);
  });
  return cards.map((card) => mergeDiscoveryCardWithProfile(card, byId.get(card.id) ?? null));
}

/** Single-clinic hydrate (search cards / profile screen). */
export async function enrichDiscoveryClinicCard(
  card: DiscoveryClinicCard,
): Promise<DiscoveryClinicCard> {
  const id = String(card.id || "").trim();
  if (!UUID_RE.test(id)) return card;
  try {
    const profile = await fetchDiscoveryClinicProfile(id);
    return mergeDiscoveryCardWithProfile(card, profile);
  } catch {
    return card;
  }
}

export async function fetchDiscoveryClinicProfile(
  clinicId: string,
): Promise<DiscoveryClinicProfile> {
  const res = await fetch(`${API_BASE}/api/discovery/clinics/${encodeURIComponent(clinicId)}`);
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    clinic?: Record<string, unknown>;
    error?: string;
  };
  if (!res.ok || data.ok === false || !data.clinic) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  const c = data.clinic;
  const base = mapDiscoveryListRow(c);
  const mg = (c.mediaGallery || c.media_gallery) as DiscoveryClinicProfile["mediaGallery"];
  return {
    ...base,
    aboutText:
      c.aboutText != null
        ? String(c.aboutText)
        : c.about_text != null
          ? String(c.about_text)
          : null,
    address: c.address != null ? String(c.address) : null,
    phone: c.phone != null ? String(c.phone) : null,
    email: c.email != null ? String(c.email) : null,
    websiteUrl:
      c.websiteUrl != null
        ? String(c.websiteUrl)
        : c.website_url != null
          ? String(c.website_url)
          : c.website != null
            ? String(c.website)
            : null,
    facebookUrl: c.facebookUrl != null ? String(c.facebookUrl) : c.facebook_url != null ? String(c.facebook_url) : null,
    instagramUrl: c.instagramUrl != null ? String(c.instagramUrl) : c.instagram_url != null ? String(c.instagram_url) : null,
    tiktokUrl: c.tiktokUrl != null ? String(c.tiktokUrl) : c.tiktok_url != null ? String(c.tiktok_url) : null,
    youtubeUrl: c.youtubeUrl != null ? String(c.youtubeUrl) : c.youtube_url != null ? String(c.youtube_url) : null,
    linkedinUrl: c.linkedinUrl != null ? String(c.linkedinUrl) : c.linkedin_url != null ? String(c.linkedin_url) : null,
    whatsapp: c.whatsapp != null ? String(c.whatsapp) : null,
    googleReviewsUrl:
      c.googleReviewsUrl != null
        ? String(c.googleReviewsUrl)
        : c.google_reviews_url != null
          ? String(c.google_reviews_url)
          : null,
    trustpilotUrl:
      c.trustpilotUrl != null
        ? String(c.trustpilotUrl)
        : c.trustpilot_url != null
          ? String(c.trustpilot_url)
          : null,
    yearsInOperation:
      c.yearsInOperation != null
        ? Number(c.yearsInOperation)
        : c.years_in_operation != null
          ? Number(c.years_in_operation)
          : null,
    services: Array.isArray(c.services) ? (c.services as string[]) : [],
    technologies: Array.isArray(c.technologies) ? (c.technologies as string[]) : [],
    workingHours:
      c.workingHours && typeof c.workingHours === "object"
        ? (c.workingHours as Record<string, unknown>)
        : c.working_hours && typeof c.working_hours === "object"
          ? (c.working_hours as Record<string, unknown>)
          : {},
    mediaGallery: mg || { photos: [], beforeAfter: [], videos: [] },
    team: Array.isArray(c.team)
      ? (c.team as Record<string, unknown>[]).map((d) => ({
          id: String(d.id ?? ""),
          name: String(d.name ?? ""),
          title: d.title != null ? String(d.title) : null,
          bio: d.bio != null ? String(d.bio) : null,
          photoUrl:
            d.photoUrl != null
              ? String(d.photoUrl)
              : d.photo_url != null
                ? String(d.photo_url)
                : null,
          specialties: Array.isArray(d.specialties) ? (d.specialties as string[]) : [],
        }))
      : [],
  };
}
