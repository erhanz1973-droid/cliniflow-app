/** First https URL from candidates (smile quote / clinic offer need remote photos). */
export function firstHttpPhotoUrl(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    const uri = String(c ?? "").trim();
    if (/^https?:\/\//i.test(uri)) return uri;
  }
  return undefined;
}

export function resolveSmileQuotePhotoUrls(args: {
  smileUri?: string | null;
  teethUri?: string | null;
  analysisPayload?: Record<string, unknown> | null;
  workspacePhotoUrl?: string | null;
}): { smileUrl?: string; teethUrl?: string } {
  const payload = args.analysisPayload;
  return {
    smileUrl: firstHttpPhotoUrl(
      payload?.smileImageUrl,
      payload?.imageUrl,
      args.workspacePhotoUrl,
      args.smileUri,
    ),
    teethUrl: firstHttpPhotoUrl(payload?.teethImageUrl, args.teethUri),
  };
}
