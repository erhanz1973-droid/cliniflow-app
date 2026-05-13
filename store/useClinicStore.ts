import { useCallback, useSyncExternalStore } from "react";
import { safeGetItem, safeRemoveItem, safeSetItem } from "../lib/asyncStorageSafe";

const STORAGE_KEY = "cliniflow.activeClinic.v1";

export type ActiveClinic = {
  id: string;
  name: string;
  logo_url?: string | null;
  country?: string | null;
};

type ClinicStoreState = {
  activeClinic: ActiveClinic | null;
  hydrated: boolean;
};

let state: ClinicStoreState = {
  activeClinic: null,
  hydrated: false,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function setState(patch: Partial<ClinicStoreState>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): ClinicStoreState {
  return state;
}

async function persistClinic(clinic: ActiveClinic | null) {
  if (clinic == null) {
    await safeRemoveItem(STORAGE_KEY);
  } else {
    await safeSetItem(STORAGE_KEY, JSON.stringify(clinic));
  }
}

/** Load cached clinic from AsyncStorage (once at cold start — before network). */
export async function hydrateClinicStore(): Promise<void> {
  try {
    const raw = await safeGetItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "id" in parsed &&
        "name" in parsed &&
        String((parsed as ActiveClinic).id || "").trim() &&
        String((parsed as ActiveClinic).name || "").trim()
      ) {
        const row = parsed as ActiveClinic;
        setState({
          activeClinic: {
            id: String(row.id).trim(),
            name: String(row.name).trim(),
            logo_url: row.logo_url ?? null,
            country: row.country ?? null,
          },
        });
      }
    }
  } catch {
    /* ignore corrupted cache */
  }
  setState({ hydrated: true });
}

export function setClinic(clinic: ActiveClinic | null) {
  setState({ activeClinic: clinic });
  void persistClinic(clinic);
}

export function clearClinic() {
  setClinic(null);
}

export function useClinicStore() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const boundSet = useCallback((clinic: ActiveClinic | null) => setClinic(clinic), []);
  const boundClear = useCallback(() => clearClinic(), []);

  return {
    activeClinic: snapshot.activeClinic,
    hydrated: snapshot.hydrated,
    setClinic: boundSet,
    clearClinic: boundClear,
  };
}
