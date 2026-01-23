// lib/patient/PatientContext.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type Jaw = "upper" | "lower";

export type ProcedureStatus = "PLANNED" | "DONE" | "CANCELLED";

export type ProcedureType =
  | "IMPLANT"
  | "CROWN"
  | "FILLING"
  | "ROOT_CANAL"
  | "EXTRACTION"
  | "BRIDGE"
  | "VENEER"
  | "WHITENING"
  | "CLEANING"
  | "OTHER";

export type Procedure = {
  id: string; // unique id
  type: ProcedureType;
  status: ProcedureStatus;
  createdAt: number; // epoch ms
  note?: string;
};

export type TreatmentTooth = {
  jaw: Jaw;
  toothId: string; // "11".."48" (FDI)
  procedures: Procedure[];
};

export type Patient = {
  id: string;
  fullName: string;
  email?: string;
  phone?: string;
  updatedAt: number; // epoch ms
  teeth: TreatmentTooth[];
};

type PatientContextValue = {
  patient: Patient | null;
  isLoading: boolean;
  setPatient: (p: Patient) => Promise<void>;
  clearPatient: () => Promise<void>;
  refreshFromStorage: () => Promise<void>;
};

const STORAGE_KEY = "cliniflow.patient.v1";

const PatientContext = createContext<PatientContextValue | undefined>(undefined);

export function PatientProvider({ children }: { children: React.ReactNode }) {
  const [patient, setPatientState] = useState<Patient | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshFromStorage = async () => {
    setIsLoading(true);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setPatientState(null);
        return;
      }
      const parsed = JSON.parse(raw) as Patient;

      // küçük validasyon (kırık data yüzünden crash olmasın)
      if (!parsed?.id || !Array.isArray(parsed?.teeth)) {
        setPatientState(null);
        return;
      }

      setPatientState(parsed);
    } catch (e) {
      // storage bozuksa temizle
      setPatientState(null);
      try {
        await AsyncStorage.removeItem(STORAGE_KEY);
      } catch {}
    } finally {
      setIsLoading(false);
    }
  };

  const setPatient = async (p: Patient) => {
    const next: Patient = {
      ...p,
      updatedAt: Date.now(),
      teeth: Array.isArray(p.teeth) ? p.teeth : [],
    };
    setPatientState(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const clearPatient = async () => {
    setPatientState(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  useEffect(() => {
    refreshFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<PatientContextValue>(
    () => ({
      patient,
      isLoading,
      setPatient,
      clearPatient,
      refreshFromStorage,
    }),
    [patient, isLoading]
  );

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
}

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) {
    throw new Error("usePatient must be used within PatientProvider (RootLayout)");
  }
  return ctx;
}
