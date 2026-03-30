/**
 * @deprecated Prefer `import { API_BASE_URL } from "@/config/api"` or `lib/api` `API_BASE`.
 * Kept for modules that still import `API_BASE` / `API_BASES` from here.
 */
import { API_BASE_URL } from "../config/api";

export const API_BASE = API_BASE_URL;
export const API_BASES: string[] = [API_BASE_URL];

if (__DEV__) {
  console.log("[ENV] API_BASE:", API_BASE);
}
