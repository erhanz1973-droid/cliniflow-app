// lib/treatments.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
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
  id: string;
  type: ProcedureType;
  status: ProcedureStatus;
  createdAt: number;
  note?: string;
};

export type TreatmentTooth = {
  jaw: Jaw;
  toothId: string;
  procedures: Procedure[];
};

type SyncResult = { ok: boolean; teethCount: number; error?: string };

type TreatmentsCtx = {
  teeth: TreatmentTooth[];
  isReady: boolean;
  isSyncing: boolean;
  upsertProcedure: (jaw: Jaw, toothId: string, proc: Omit<Procedure, "id" | "createdAt">) => void;
  removeProcedure: (jaw: Jaw, toothId: string, procId: string) => void;
  syncFromServer: (patientId?: string) => Promise<SyncResult>;
  clearAll: () => Promise<void>;
};

const TreatmentsContext = createContext<TreatmentsCtx | null>(null);

const STORAGE_KEY = "cliniflow.treatments.v1";
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE || "";
const ENV_PATIENT_ID = process.env.EXPO_PUBLIC_PATIENT_ID || "p1";

/* ---------------- helpers ---------------- */

function nowId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function isValidToothId(toothId: string) {
  const n = Number(toothId);
  return Number.isFinite(n) && n >= 11 && n <= 48;
}

function inferJaw(toothId: string): Jaw | null {
  const n = Number(toothId);
  if (n >= 11 && n <= 28) return "upper";
  if (n >= 31 && n <= 48) return "lower";
  return null;
}

function cleanTeethArray(input: any): TreatmentTooth[] {
  if (!Array.isArray(input)) return [];

  const out: TreatmentTooth[] = [];

  for (const t of input) {
    const toothId: string | null = typeof t?.toothId === "string" ? t.toothId.trim() : null;
    if (!toothId || !isValidToothId(toothId)) continue;

    const jaw: Jaw | null = t?.jaw === "upper" || t?.jaw === "lower" ? t.jaw : inferJaw(toothId);
    if (!jaw) continue;

    const proceduresRaw = Array.isArray(t?.procedures) ? t.procedures : [];
    const procedures: Procedure[] = proceduresRaw.map((p: any) => ({
      id: typeof p?.id === "string" ? p.id : nowId(),
      type: (typeof p?.type === "string" ? p.type : "OTHER") as ProcedureType,
      status: p?.status === "PLANNED" || p?.status === "DONE" || p?.status === "CANCELLED" ? p.status : "PLANNED",
      createdAt: typeof p?.createdAt === "number" ? p.createdAt : Date.now(),
      note: typeof p?.note === "string" ? p.note : undefined,
    }));

    out.push({ jaw, toothId, procedures });
  }

  // merge duplicates
  const map = new Map<string, TreatmentTooth>();
  for (const t of out) {
    const key = `${t.jaw}:${t.toothId}`;
    const prev = map.get(key);
    map.set(key, prev ? { ...prev, procedures: [...prev.procedures, ...t.procedures] } : t);
  }

  return Array.from(map.values());
}

async function storageGet(key: string) {
  try {
    if (Platform.OS === "web") {
      return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    }
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storageSet(key: string, val: string | null) {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      if (val === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, val);
      return;
    }
    if (val === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, val);
  } catch {
    // ignore
  }
}

/* ---------------- provider ---------------- */

export function TreatmentsProvider({ children }: { children: React.ReactNode }) {
  const [teeth, setTeeth] = useState<TreatmentTooth[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const raw = await storageGet(STORAGE_KEY);
      if (!alive) return;

      if (!raw) {
        setTeeth([]);
        setIsReady(true);
        return;
      }

      try {
        const parsed = JSON.parse(raw);
        const cleaned = cleanTeethArray(parsed?.teeth ?? parsed);
        setTeeth(cleaned);
      } catch {
        setTeeth([]);
        await storageSet(STORAGE_KEY, null);
      } finally {
        setIsReady(true);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!isReady) return;
    storageSet(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, updatedAt: Date.now(), teeth }));
  }, [teeth, isReady]);

  const upsertProcedure: TreatmentsCtx["upsertProcedure"] = (jaw, toothId, proc) => {
    const tid = String(toothId).trim();
    if (!isValidToothId(tid)) return;

    const nextProc: Procedure = {
      id: nowId(),
      createdAt: Date.now(),
      type: proc.type,
      status: proc.status,
      note: proc.note,
    };

    setTeeth((prev) => {
      const idx = prev.findIndex((t) => t.jaw === jaw && t.toothId === tid);
      if (idx === -1) return [...prev, { jaw, toothId: tid, procedures: [nextProc] }];

      const copy = [...prev];
      const t = copy[idx];
      copy[idx] = { ...t, procedures: [...(t.procedures || []), nextProc] };
      return copy;
    });
  };

  const removeProcedure: TreatmentsCtx["removeProcedure"] = (jaw, toothId, procId) => {
    const tid = String(toothId).trim();
    setTeeth((prev) =>
      prev.map((t) => {
        if (t.jaw !== jaw || t.toothId !== tid) return t;
        return { ...t, procedures: (t.procedures || []).filter((p) => p.id !== procId) };
      })
    );
  };

  const clearAll = async () => {
    setTeeth([]);
    await storageSet(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, updatedAt: Date.now(), teeth: [] }));
  };

  const syncFromServer: TreatmentsCtx["syncFromServer"] = async (patientId?: string) => {
    const pid = String(patientId ?? "").trim() || ENV_PATIENT_ID || "p1";

    if (!API_BASE_URL) {
      return { ok: false, teethCount: 0, error: "EXPO_PUBLIC_API_BASE is empty" };
    }

    const url = `${API_BASE_URL}/api/patient/${encodeURIComponent(pid)}/treatments`;

    setIsSyncing(true);
    try {
      const res = await fetch(url, { cache: "no-store" as any });
      if (!res.ok) return { ok: false, teethCount: 0, error: `GET ${res.status}` };

      const json = await res.json();

      // server schema: { teeth: [...] } OR direct array
      const cleaned = cleanTeethArray(json?.teeth ?? json);
      setTeeth(cleaned);

      return { ok: true, teethCount: cleaned.length };
    } catch (e: any) {
      return { ok: false, teethCount: 0, error: e?.message || "sync error" };
    } finally {
      setIsSyncing(false);
    }
  };

  const value = useMemo<TreatmentsCtx>(
    () => ({
      teeth,
      isReady,
      isSyncing,
      upsertProcedure,
      removeProcedure,
      syncFromServer,
      clearAll,
    }),
    [teeth, isReady, isSyncing]
  );

  return <TreatmentsContext.Provider value={value}>{children}</TreatmentsContext.Provider>;
}

/* ---------------- hook ---------------- */

export function useTreatments() {
  const ctx = useContext(TreatmentsContext);
  if (!ctx) throw new Error("useTreatments must be used inside TreatmentsProvider");
  return ctx;
}
