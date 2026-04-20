/**
 * treatment_requests.description alanı: hasta metni + --- AI analysis --- + JSON + --- Photo --- + URL.
 * Hasta / doktor arayüzünde ham JSON ve imzalı URL satırı göstermemek için.
 * Teklif sohbetinde (synthetic offer_messages) aynı ham metin balonda gelir — burada da kullanılır.
 */

const AI_SUMMARY_MARKER = "\n\n--- AI analysis (summary) ---\n";

function pushHumanPartsFromDentalJson(
  parts: string[],
  jsonStr: string
): "added" | "bare_ok" | "unparsed" {
  const j = jsonStr.trim();
  if (!j.startsWith("{")) return "unparsed";
  try {
    const parsed = JSON.parse(j) as Record<string, unknown>;
    const summary = String(
      parsed.summary || parsed.recommendation || parsed.overallNote || ""
    ).trim();
    if (summary) parts.push(summary);
    const ins = Array.isArray(parsed.insights) ? parsed.insights : [];
    for (const x of ins.slice(0, 5)) {
      const line = String(x || "").trim();
      if (line) parts.push(`• ${line}`);
    }
    if (summary || (ins && ins.length > 0)) return "added";
    const bareOk =
      parsed.ok === true &&
      !summary &&
      (!ins || ins.length === 0) &&
      !parsed.recommendation &&
      !parsed.overallNote;
    return bareOk ? "bare_ok" : "unparsed";
  } catch {
    return "unparsed";
  }
}

/** Bazen API yanıtı string olarak mesaja yazılmış: {"ok":true,"message":"..."} */
function unwrapApiMessageEnvelope(s: string): string {
  let t = s.trim();
  for (let depth = 0; depth < 2; depth++) {
    if (!t.startsWith("{")) break;
    try {
      const env = JSON.parse(t) as Record<string, unknown>;
      if (
        env &&
        typeof env === "object" &&
        env.ok === true &&
        typeof env.message === "string"
      ) {
        const inner = String(env.message).trim();
        if (inner) t = inner;
        else break;
      } else break;
    } catch {
      break;
    }
  }
  return t;
}

export function formatTreatmentRequestDescription(raw: string): string {
  let full = unwrapApiMessageEnvelope(String(raw || ""));
  if (!full) return "";

  let userPart = full;
  let jsonChunk = "";

  const aiIdx = full.indexOf(AI_SUMMARY_MARKER);
  if (aiIdx !== -1) {
    userPart = full.slice(0, aiIdx).trim();
    jsonChunk = full.slice(aiIdx + AI_SUMMARY_MARKER.length);
  }

  const photoIdx = jsonChunk.search(/\n\n--- Photo ---\n/i);
  if (photoIdx !== -1) {
    jsonChunk = jsonChunk.slice(0, photoIdx).trim();
  } else {
    jsonChunk = jsonChunk.replace(/\n\n--- Photo ---\n[\s\S]*$/i, "").trim();
  }
  userPart = userPart.replace(/\n\n--- Photo ---\n[\s\S]*$/i, "").trim();

  const parts: string[] = [];

  if (userPart) {
    const up = userPart.trim();
    if (up.startsWith("{")) {
      const r = pushHumanPartsFromDentalJson(parts, up);
      if (r === "unparsed") parts.push(userPart);
    } else {
      parts.push(userPart);
    }
  }

  const j = jsonChunk.trim();
  if (j.startsWith("{")) {
    const r = pushHumanPartsFromDentalJson(parts, j);
    if (r === "unparsed") {
      /* jsonChunk: parse edilemediyse ham dökme */
    }
  }

  return parts.join("\n\n").trim();
}

export function extractPhotoUrlFromDescription(raw: string): string | null {
  const m = String(raw || "").match(/\n\n--- Photo ---\n(https?:\/\/\S+)/i);
  return m?.[1] ? m[1].trim().split(/\s/)[0] : null;
}

export type RequestImageFields = {
  description: string;
  image_url?: string | null;
  photos?: { url?: string }[] | null;
};

export function resolveRequestImageUrl(req: RequestImageFields): string | null {
  const direct = String(req.image_url || "").trim();
  if (/^https?:\/\//i.test(direct)) return direct;
  const photos = Array.isArray(req.photos) ? req.photos : [];
  const u = photos[0]?.url;
  const s = u != null ? String(u).trim() : "";
  if (/^https?:\/\//i.test(s)) return s;
  return extractPhotoUrlFromDescription(req.description);
}
