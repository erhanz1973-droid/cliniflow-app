import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetchJson } from "@/lib/api";
import type { CoordinationWorkspaceResponse } from "@/lib/coordinationWorkspaceTypes";
import { i18n } from "@/lib/i18n";

const POLL_MS = 18_000;

export function useCoordinationWorkspace(patientId: string) {
  const [data, setData] = useState<CoordinationWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!patientId) return;
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
      setData(json);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : "Yüklenemedi");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(id);
    };
  }, [load]);

  return { data, loading, error, refresh: load };
}
