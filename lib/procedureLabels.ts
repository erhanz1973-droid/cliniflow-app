/**
 * Maps API procedure codes / names (any casing, spaces, hyphens) to i18n keys treatment.type.*
 */

const CODE_ALIASES: Record<string, string> = {
  ROOT_CANAL: "ROOT_CANAL_TREATMENT",
  ROOT_CANAL_TX: "ROOT_CANAL_TREATMENT",
  RCT: "ROOT_CANAL_TREATMENT",
  CONSULTATION: "CONSULT",
  BRIDGE: "BRIDGE_UNIT",
};

function normalizeProcedureCode(raw: string): string {
  return String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/-/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

function treatmentTypeKey(norm: string): string {
  return `treatment.type.${norm}`;
}

/** Returns translated label or null if no i18n entry. */
export function translateProcedureCodeRaw(
  t: (key: string) => string,
  code: string
): string | null {
  let norm = normalizeProcedureCode(code);
  if (!norm) return null;
  norm = CODE_ALIASES[norm] || norm;
  const key = treatmentTypeKey(norm);
  const label = t(key);
  return label === key ? null : label;
}

function translateOneProcedureFragment(t: (key: string) => string, frag: string): string {
  const f = frag.trim();
  if (!f) return "";
  if (/^procedure$/i.test(f)) return t("treatment.genericProcedure");
  const paren = f.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    const innerRaw = paren[1].trim();
    const inner =
      translateProcedureCodeRaw(t, innerRaw) ||
      translateProcedureSummary(t, innerRaw);
    return `${inner} (${paren[2].trim()})`;
  }
  const hit = translateProcedureCodeRaw(t, f);
  if (hit) return hit;
  return f;
}

/**
 * Full appointment / plan summary, e.g. "CROWN (14)", "consult, FILLING", "bridge-unit".
 */
export function translateProcedureSummary(t: (key: string) => string, summary: string): string {
  const s = String(summary || "").trim();
  if (!s) return t("treatment.genericProcedure");
  if (/^procedure$/i.test(s)) return t("treatment.genericProcedure");
  if (/[,·|]/.test(s)) {
    return s
      .split(/[,·|]+/)
      .map((x) => translateOneProcedureFragment(t, x))
      .filter(Boolean)
      .join(", ");
  }
  return translateOneProcedureFragment(t, s);
}

/** Patient home: prefer structured `type`, else parse human/title string. */
export function translateProcedureDisplay(
  t: (key: string) => string,
  type: string | undefined,
  fallbackTitle: string | undefined
): string {
  const code = String(type || "").trim();
  if (code) {
    const hit = translateProcedureCodeRaw(t, code);
    if (hit) return hit;
  }
  const fb = String(fallbackTitle || "").trim();
  if (fb) return translateProcedureSummary(t, fb);
  return t("treatment.genericProcedure");
}

/** Alias for treatment / encounter screens (same behavior as translateProcedureDisplay). */
export function localizedProcedureTypeLabel(
  t: (key: string) => string,
  type: string | undefined,
  name?: string | undefined
): string {
  return translateProcedureDisplay(t, type, name);
}
