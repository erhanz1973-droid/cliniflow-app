// server/timeline.ts
import fs from "fs";
import path from "path";
import express, { Request, Response, Express } from "express";

/* ================== TYPES ================== */

type Status = "PENDING" | "PLANNED" | "CONFIRMED" | "DONE" | "CANCELLED";
type Type =
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
  type: Type;
  status: Status;
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

/* ================== FS HELPERS ================== */

const DATA_DIR = path.join(process.cwd(), "data");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function filePath(patientId: string) {
  ensureDir();
  return path.join(DATA_DIR, `patient_${patientId}_timeline.json`);
}

/* ================== CORE LOGIC ================== */

function requiredDeparture(): TimelineItem {
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

function normalize(items: TimelineItem[]): TimelineItem[] {
  const others = items.filter(i => i.type !== "DEPARTURE_FLIGHT");
  const deps = items.filter(i => i.type === "DEPARTURE_FLIGHT");

  let dep =
    deps.find(d => typeof d.startAt === "number") ||
    deps[0] ||
    requiredDeparture();

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
    },
  };

  others.sort((a, b) => {
    const ad = a.startAt ?? Infinity;
    const bd = b.startAt ?? Infinity;
    if (ad !== bd) return ad - bd;
    return (a.orderHint ?? 0) - (b.orderHint ?? 0);
  });

  return [...others, dep];
}

function readTimeline(patientId: string): TimelineResponse {
  const file = filePath(patientId);

  if (!fs.existsSync(file)) {
    const fresh: TimelineResponse = {
      schemaVersion: 1,
      patientId,
      updatedAt: Date.now(),
      items: normalize([]),
    };
    fs.writeFileSync(file, JSON.stringify(fresh, null, 2));
    return fresh;
  }

  const raw = fs.readFileSync(file, "utf-8");
  const parsed = JSON.parse(raw);

  const normalized = normalize(parsed.items || []);

  const res: TimelineResponse = {
    schemaVersion: 1,
    patientId,
    updatedAt: Date.now(),
    items: normalized,
  };

  fs.writeFileSync(file, JSON.stringify(res, null, 2));
  return res;
}

function writeTimeline(patientId: string, body: any): TimelineResponse {
  const items = normalize(body.items || []);

  const res: TimelineResponse = {
    schemaVersion: 1,
    patientId,
    updatedAt: Date.now(),
    items,
  };

  fs.writeFileSync(filePath(patientId), JSON.stringify(res, null, 2));
  return res;
}

/* ================== EXPRESS REGISTER ================== */

export function registerTimeline(app: Express) {
  app.use(express.json());

  app.get("/api/patient/:patientId/timeline", (req: Request, res: Response) => {
    const { patientId } = req.params;
    if (!patientId) return res.status(400).json({ error: "patientId missing" });
    return res.json(readTimeline(patientId));
  });

  app.put("/api/patient/:patientId/timeline", (req: Request, res: Response) => {
    const { patientId } = req.params;
    if (!patientId) return res.status(400).json({ error: "patientId missing" });
    return res.json(writeTimeline(patientId, req.body));
  });
}
