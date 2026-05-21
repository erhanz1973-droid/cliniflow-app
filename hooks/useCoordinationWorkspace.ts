import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetchJson } from "@/lib/api";
import type { CoordinationWorkspaceResponse } from "@/lib/coordinationWorkspaceTypes";
import { getCachedResource, peekCachedResource, setCachedResource } from "@/lib/resourceCache";
import { i18n } from "@/lib/i18n";

const POLL_MS = 18_000;
const CACHE_TTL_MS = 90_000;

function cacheKey(patientId: string) {
  return `doctor:coordination-workspace:${patientId}`;
}

export function useCoordinationWorkspace(patientId: string) {
  const cached =
    patientId && getCachedResource<CoordinationWorkspaceResponse>(cacheKey(patientId), CACHE_TTL_MS);
  const [data, setData] = useState<CoordinationWorkspaceResponse | null>(cached);
  const [loading, setLoading] = useState(!cached?.profile);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!patientId) return;
      const stale = peekCachedResource<CoordinationWorkspaceResponse>(cacheKey(patientId));
      if (!opts?.silent && !stale?.profile) setLoading(true);
      try {
        const json = await apiFetchJson<CoordinationWorkspaceResponse>(
          `/api/doctor/patients/${encodeURIComponent(patientId)}/coordination-workspace`,
          {
            timeoutMs: 30_000,
            headers: { "X-UI-Language": i18n.locale || "en" },
          },
        );
        if (!mounted.current) return;
        if (!json.ok) {
          setError(json.message || json.error || "Yüklenemedi");
          return;
        }
        setCachedResource(cacheKey(patientId), json);
        setData(json);
        setError(null);
      } catch (e) {
        if (!mounted.current) return;
        if (!stale?.profile) {
          setError(e instanceof Error ? e.message : "Yüklenemedi");
        }
      } finally {
        if (mounted.current) setLoading(false);
      }
    },
    [patientId],
  );

  useEffect(() => {
    mounted.current = true;
    const warm = peekCachedResource<CoordinationWorkspaceResponse>(cacheKey(patientId));
    if (warm?.profile) {
      setData(warm);
      setLoading(false);
      void load({ silent: true });
    } else {
      setLoading(true);
      void load();
    }
    const id = setInterval(() => load({ silent: true }), POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [patientId, load]);

  return { data, loading, error, refresh: () => load({ silent: true }) };
}
