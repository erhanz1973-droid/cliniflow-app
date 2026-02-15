// index.cjs
// Cliniflow mini-server (Express) — TEK DOSYA
// - Port: 5050
// - JSON file storage: ./data/patient_<id>_travel.json + ./data/patient_<id>_treatments.json
// - Travel: GET + POST + PATCH (MERGE-SAFE; flights kaybolmaz)
// - Treatments: GET + POST
// - Health: GET /health
// - Static: /public altını servis eder (varsa)

const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 5050;

app.use(cors({ origin: "*", methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"] }));
app.use(express.json({ limit: "5mb" }));

// ---- paths ----
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const PUBLIC_DIR = path.join(ROOT, "public");

// ensure folders
mkdirp(DATA_DIR);

// static (if exists)
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
}

// ---- helpers ----
function mkdirp(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

function now() {
  return Date.now();
}

function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    const j = safeJsonParse(raw);
    return j == null ? fallback : j;
  } catch {
    return fallback;
  }
}

function writeJson(filePath, obj) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf8");
}

function travelPath(patientId) {
  return path.join(DATA_DIR, `patient_${patientId}_travel.json`);
}

function treatmentsPath(patientId) {
  return path.join(DATA_DIR, `patient_${patientId}_treatments.json`);
}

// ---- schema defaults ----
function defaultTravel(patientId) {
  return {
    schemaVersion: 1,
    updatedAt: now(),
    patientId,
    hotel: null, // { name, address, checkIn, checkOut, notes }
    flights: [], // [{ direction:"OUTBOUND"|"RETURN", from,to,date,time,flightNo,airline,notes }]
    notes: "",
  };
}

function defaultTreatments(patientId) {
  return {
    schemaVersion: 1,
    updatedAt: now(),
    patientId,
    teeth: [], // [{ jaw:"upper"|"lower", toothId:"11", procedures:[{id,type,status,createdAt,scheduledAt?}] }]
  };
}

// ---- read/write domain ----
function readPatientTravel(patientId) {
  const fp = travelPath(patientId);
  const fallback = defaultTravel(patientId);
  const j = readJson(fp, fallback);

  // normalize
  if (!j || typeof j !== "object") return fallback;
  if (!Array.isArray(j.flights)) j.flights = [];
  if (!("hotel" in j)) j.hotel = null;
  if (!("notes" in j)) j.notes = "";
  j.patientId = patientId;
  if (!j.schemaVersion) j.schemaVersion = 1;
  if (!j.updatedAt) j.updatedAt = now();

  return j;
}

function writePatientTravel(patientId, travelObj) {
  const fp = travelPath(patientId);
  writeJson(fp, travelObj);
}

function readPatientTreatments(patientId) {
  const fp = treatmentsPath(patientId);
  const fallback = defaultTreatments(patientId);
  const j = readJson(fp, fallback);

  // normalize
  if (!j || typeof j !== "object") return fallback;
  if (!Array.isArray(j.teeth)) j.teeth = [];
  j.patientId = patientId;
  if (!j.schemaVersion) j.schemaVersion = 1;
  if (!j.updatedAt) j.updatedAt = now();

  return j;
}

function writePatientTreatments(patientId, obj) {
  const fp = treatmentsPath(patientId);
  writeJson(fp, obj);
}

// ---- routes ----
app.get("/health", (req, res) => {
  res.json({ ok: true, server: "index.cjs", port: String(PORT), time: now() });
});

// ---------- TRAVEL ----------
app.get("/api/patient/:patientId/travel", (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patientId missing" });
  const travel = readPatientTravel(patientId);
  res.json(travel);
});

// POST = full save (ama yine de flights kaybolmasın diye merge mantığı ile yazıyoruz)
app.post("/api/patient/:patientId/travel", (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patientId missing" });

    const current = readPatientTravel(patientId);
    const body = (req.body && typeof req.body === "object") ? req.body : {};

    const merged = mergeTravelSafe(current, body, patientId);

    writePatientTravel(patientId, merged);
    return res.json({ ok: true, saved: true, travel: merged });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ✅ MERGE-SAFE PATCH travel (flights kaybolmasın)
app.patch("/api/patient/:patientId/travel", (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patientId missing" });

    const current = readPatientTravel(patientId);
    const body = (req.body && typeof req.body === "object") ? req.body : {};

    const merged = mergeTravelSafe(current, body, patientId);

    writePatientTravel(patientId, merged);
    return res.json({ ok: true, saved: true, travel: merged });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

function mergeTravelSafe(current, body, patientId) {
  const merged = {
    ...(current || {}),
    ...(body || {}),
    schemaVersion: (current && current.schemaVersion) ? current.schemaVersion : 1,
    patientId,
    updatedAt: now(),
  };

  // flights koruma:
  // - body'de flights YOKSA: mevcut flights kalsın
  // - body'de flights VAR ama [] / null / invalid ise: mevcut doluysa onu koru
  const bodyHasFlights = Object.prototype.hasOwnProperty.call(body, "flights");
  if (!bodyHasFlights) {
    merged.flights = (current && Array.isArray(current.flights)) ? current.flights : [];
  } else {
    if (!Array.isArray(body.flights) || body.flights.length === 0) {
      merged.flights =
        (current && Array.isArray(current.flights) && current.flights.length > 0)
          ? current.flights
          : (Array.isArray(body.flights) ? body.flights : []);
    }
  }

  // hotel koruma (body.hotel null / "" ise eskisini tut)
  const bodyHasHotel = Object.prototype.hasOwnProperty.call(body, "hotel");
  if (bodyHasHotel && (body.hotel === null || body.hotel === "")) {
    merged.hotel = (current && current.hotel) ? current.hotel : null;
  }

  // notes normalize
  if (!Object.prototype.hasOwnProperty.call(merged, "notes") || merged.notes == null) merged.notes = "";

  return merged;
}

// ---------- TREATMENTS ----------
app.get("/api/patient/:patientId/treatments", (req, res) => {
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patientId missing" });
  const t = readPatientTreatments(patientId);
  res.json(t);
});

app.post("/api/patient/:patientId/treatments", (req, res) => {
  try {
    const patientId = String(req.params.patientId || "").trim();
    if (!patientId) return res.status(400).json({ ok: false, error: "patientId missing" });

    const body = (req.body && typeof req.body === "object") ? req.body : {};
    const current = readPatientTreatments(patientId);

    // merge (basit)
    const merged = {
      ...(current || {}),
      ...(body || {}),
      schemaVersion: (current && current.schemaVersion) ? current.schemaVersion : 1,
      patientId,
      updatedAt: now(),
    };

    if (!Array.isArray(merged.teeth)) merged.teeth = Array.isArray(current.teeth) ? current.teeth : [];

    writePatientTreatments(patientId, merged);
    return res.json({ ok: true, saved: true, treatments: merged });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
});

// ---- basic root ----
app.get("/", (req, res) => {
  res.type("text/plain").send("Cliniflow server is running. Try /health");
});

// ---- start ----
app.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Server running: http://127.0.0.1:${PORT}`);
});
