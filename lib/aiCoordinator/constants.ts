/** Starter assistant message (MVP — always shown on fresh session). */
export const AI_COORDINATOR_WELCOME_MESSAGE =
  "Hello 👋 How can I help you with your dental treatment today?";

/** Treatment Guide embedded chat — educational, non-tourism tone. */
export const AI_TREATMENT_GUIDE_WELCOME_MESSAGE =
  "Hello — I'm your AI Treatment Guide. Share what you're hoping to improve, and I'll help explain typical next steps and what clinics often request before a consultation. This is educational guidance only, not a diagnosis.";

/** POST /ai/chat — longer than default API POST (OpenAI latency). */
export const AI_COORDINATOR_REQUEST_TIMEOUT_MS = 35_000;

/** Max turns sent to API per request (server also caps). Full history stays on device only. */
export const AI_COORDINATOR_MAX_RECENT_TURNS = 8;
