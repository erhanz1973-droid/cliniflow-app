// server/timeline.routes.ts
// Express route registrar for patient timeline
// Creates: GET /api/patient/:patientId/timeline
//          PUT /api/patient/:patientId/timeline

import fs from "fs";
import path from "path";
import type { Express, Request, Response } from "express";

type TimelineStatus = "PENDING" | "PLANNED" | "CONFIRMED" | "DONE" | "CANCELLED";
type TimelineType =
  | "ARRIVAL_FLIGHT"
  | "DEPARTURE_FLIGHT"
  | "HOTEL_CHECKIN"
  | "HOTEL_CHECKOUT"
  | "TRANSFER"
  | "TREATMENT_APPOINTMENT"
  | "CHECKUP"
  | "NOTE";

type TimelineItem = {
  id: string;
  type: TimelineType;
  status: TimelineStatus;
  title: string;
  startAt: number | null;
  endAt?: number | null;
  orderHint?: number;
  data?: any;
};

type TimelineResponse = {
  schemaVersion: 1;
  patientId: string;
  updatedAt: number;
  items: TimelineItem[];
};

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function dataDir() {
  // server/ klasöründen çalıştığını varsayar
  // İstersen DATA_DIR env ile override edebilirsin
  const base = process.env.DATA_DIR || path.join(process.cwd(), "data");
  ensureDir(base);
  return base;
}

function timelineFile(patientId: string) {
  return path.join(dataDir(), `patient_${patientId}_timeline.json`);
}

function requiredDepartureFlight(patientId: string): TimelineItem {
  return {
    id: "dep-required",
    type: "DEPARTURE_FLIGHT",
    status: "PENDING",
    title: "Return Flight (Required)",
    startAt: null,
    orderHint: 999999,
    data: {
      required: true,
      flightNumber: null,
      from: "TBS",
      to: "IST",
      airline: null,
      terminal: null,
      pnr: null,
    },
  };
}

function normalize(items: TimelineItem[], patientId: string): TimelineItem[] {
  const list = Array.isArray(items) ? [...items] : [];

  const deps = list.filter((x) => x.type === "DEPARTURE_FLIGHT");
  const others = list.filter((x) => x.type !== "DEPARTURE_FLIGHT");

  // pick best departure (with date if any)
  let dep: TimelineItem =
    deps.find((d) => typeof d.startAt === "number") ||
    deps[0] ||
    requiredDepartureFlight(patientId);

  // force required=true
  dep = {
    ...dep,
    type: "DEPARTURE_FLIGHT",
    title: dep.title || "Return Flight (Required)",
    data: {
      ...(dep.data || {}),
      required: true,
      from: dep.data?.from ?? "TBS",
      to: dep.data?.to ?? "IST",
      flightNumber: dep.data?.flightNumber ?? null,
      airline: dep.data?.airline ?? null,
      terminal: dep.data?.terminal ?? null,
      pnr: dep.data?.pnr ?? null,
    },
  };

  // sort others by date then orderHint; null dates last
  others.sort((a, b) => {
    const ad = a.startAt ?? Number.POSITIVE_INFINITY;
    const bd = b.startAt ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;

    const ah = a.orderHint ?? 0;
    const bh = b.orderHint ?? 0;
    if (ah !== bh) return ah - bh;

    return a.id.localeCompare(b.id);
  });

  // departure ALWAYS last
  return [...others, dep];
}

function readTimeline(patientId: string): TimelineResponse {
  const file = timelineFile(patientId);

  if (!fs.existsSync(file)) {
    const empty: TimelineResponse = {
      schemaVersion: 1,
      patientId,
      updatedAt: Date.now(),
      items: normalize([], patientId),
    };
    fs.writeFileSync(file, JSON.stringify(empty, null, 2), "utf-8");
    return empty;
  }

  const raw = fs.readFileSync(file, "utf-8");
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // file bozulduysa sıfırla
    const reset: TimelineResponse = {
      schemaVersion: 1,
      patientId,
      updatedAt: Date.now(),
      items: normalize([], patientId),
    };
    fs.writeFileSync(file, JSON.stringify(reset, null, 2), "utf-8");
    return reset;
  }

  const items = normalize(parsed?.items || [], patientId);

  const res: TimelineResponse = {
    schemaVersion: 1,
    patientId,
    updatedAt: parsed?.updatedAt || Date.now(),
    items,
  };

  // normalize edilmiş halini geri yaz (tekli dep + sıralı)
  fs.writeFileSync(file, JSON.stringify(res, null, 2), "utf-8");
  return res;
}

function writeTimeline(patientId: string, incoming: any): TimelineResponse {
  const items = normalize(incoming?.items || [], patientId);

  const res: TimelineResponse = {
    schemaVersion: 1,
    patientId,
    updatedAt: Date.now(),
    items,
  };

  fs.writeFileSync(timelineFile(patientId), JSON.stringify(res, null, 2), "utf-8");
  return res;
}

export function registerTimelineRoutes(app: Express) {
  // GET
  app.get("/api/patient/:patientId/timeline", (req: Request, res: Response) => {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ error: "patientId missing" });

    const data = readTimeline(patientId);
    return res.json(data);
  });

  // PUT (admin veya internal tool için)
  app.put("/api/patient/:patientId/timeline", (req: Request, res: Response) => {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ error: "patientId missing" });

    const saved = writeTimeline(patientId, req.body);
    return res.json(saved);
  });
}
