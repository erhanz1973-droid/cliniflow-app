import { useCallback, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { emptyLeadData } from "../aiCoordinator/leadData";
import type { TreatmentGuideIntakeState } from "./types";
import { fetchTreatmentGuideIntake } from "./intakeApi";

const emptyState = (): TreatmentGuideIntakeState => ({
  leadData: emptyLeadData(),
  operationalIntakeFlags: null,
  intakeJourney: null,
  documents: [],
  clinicDirectory: null,
  treatmentGuideWorkspace: null,
});

export function useTreatmentGuideIntake(params: {
  sessionId: string;
  clinicId?: string | null;
}) {
  const [intake, setIntake] = useState<TreatmentGuideIntakeState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!params.sessionId) return;
    try {
      const next = await fetchTreatmentGuideIntake({
        sessionId: params.sessionId,
        clinicId: params.clinicId,
      });
      if (mountedRef.current) {
        setIntake(next);
        setError(null);
      }
    } catch (e: unknown) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : "Failed to load intake state");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [params.sessionId, params.clinicId]);

  useFocusEffect(
    useCallback(() => {
      mountedRef.current = true;
      void refresh();
      return () => {
        mountedRef.current = false;
      };
    }, [refresh]),
  );

  const applyIntakeState = useCallback((next: TreatmentGuideIntakeState) => {
    setIntake(next);
    setError(null);
  }, []);

  return { intake, loading, error, refresh, applyIntakeState };
}
