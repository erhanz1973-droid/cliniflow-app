// lib/timelineIcons.ts
// Timeline event type → icon mapping
// Cliniflow Mobile (Expo / React Native)

export type TimelineEventType =
  | "TAKEOFF"
  | "LANDING"
  | "TREATMENT"
  | "HOTEL"
  | "MESSAGE";

export const TIMELINE_ICONS: Record<TimelineEventType, any> = {
  TAKEOFF: require("../assets/icons/timeline/takeoff.png"),
  LANDING: require("../assets/icons/timeline/landing.png"),
  TREATMENT: require("../assets/icons/timeline/tooth-treatment.png"),

  // şimdilik placeholder, yoksa aynı ikonu kullanabilirsin
  HOTEL: require("../assets/icons/timeline/hotel.png"),
  MESSAGE: require("../assets/icons/timeline/message.png"),
};
