/**
 * @deprecated Prefer `import { API_BASE } from "@/lib/api"`.
 * Kept for modules that still import `API_BASE` / `API_BASES` from here.
 */
import { API_BASE as API_BASE_FROM_LIB } from "./api";

export const API_BASE = API_BASE_FROM_LIB;
export const API_BASES: string[] = [API_BASE_FROM_LIB];

if (__DEV__) {
  console.log("[ENV] API_BASE:", API_BASE);
}
