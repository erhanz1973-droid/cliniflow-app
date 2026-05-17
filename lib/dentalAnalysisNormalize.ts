/**
 * Normalize /api/chat/ai-analyze JSON into fields the Treatment Guide UI expects.
 */
export function normalizeAnalyzeApiPayload(
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;

  const nested =
    (raw.aiResult && typeof raw.aiResult === "object" ? raw.aiResult : null) ||
    (raw.ai_result && typeof raw.ai_result === "object" ? raw.ai_result : null);

  const base = nested && typeof nested === "object" ? { ...raw, ...nested } : { ...raw };

  let insights: string[] = [];
  if (Array.isArray(base.insights)) {
    insights = base.insights.map((x) => String(x).trim()).filter(Boolean);
  }

  const analysisText = String(base.analysis || base.analysis_en || "").trim();
  let summary = String(base.summary || "").trim();
  if (!summary && analysisText) summary = analysisText;

  if (!insights.length && summary) {
    const parts = summary
      .split(/\n+/)
      .map((s) => s.replace(/^[\d•\-*.)]+\s*/, "").trim())
      .filter((s) => s.length > 12);
    if (parts.length >= 2) insights = parts.slice(0, 4);
  }

  const recommendation = String(base.recommendation || "").trim();

  return {
    ...base,
    ok: base.ok !== false,
    insights,
    summary,
    recommendation,
    reused: base.reused === true || base.cached === true,
    cached: base.cached === true,
  };
}

export function hasVisibleAnalysisContent(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  const norm = normalizeAnalyzeApiPayload(payload);
  if (!norm) return false;
  const insights = Array.isArray(norm.insights) ? norm.insights : [];
  return insights.length > 0 || !!String(norm.summary || "").trim();
}
