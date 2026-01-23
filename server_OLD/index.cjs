// server/index.cjs  (ESM sürümü: package.json içinde "type":"module" olmalı)
// Çalıştır:  node index.cjs

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5050;

// ✅ Sağlam __dirname (ESM)
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(decodeURIComponent(__filename));

// --- Paths ---
const DATA_DIR = path.join(__dirname, "data");
const PATIENTS_DIR = path.join(DATA_DIR, "patients");
const TREATMENTS_DIR = path.join(DATA_DIR, "treatments");
const TRAVEL_DIR = path.join(DATA_DIR, "travel");

// ✅ public klasörünü absolute path ile serve et (CWD’ye bağlı kalma)
const PUBLIC_DIR = path.join(__dirname, "public");
app.use(express.static(PUBLIC_DIR)); // -> /admin-travel.html burada bulunursa otomatik açılır

function ensureDirs() {
  [DATA_DIR, PATIENTS_DIR, TREATMENTS_DIR, TRAVEL_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function safeReadJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function listPatientsFromFiles() {
  ensureDirs();
  const files = fs.readdirSync(PATIENTS_DIR).filter((f) => f.endsWith(".json"));
  return files
    .map((f) => safeReadJson(path.join(PATIENTS_DIR, f), null))
    .filter(Boolean)
    .map((p) => ({ id: String(p.id || "").trim(), name: p.name || p.id }))
    .filter((p) => p.id);
}

// --- Admin HTML (root dosya: server/admin_v2.html) ---
app.get("/admin.html", (req, res) => {
  const filePath = path.join(__dirname, "admin_v2.html");
  if (!fs.existsSync(filePath)) return res.status(404).send("admin.html not found");
  res.sendFile(filePath);
});

// ✅ admin-travel.html kesin açılsın diye (public içinde arar)
// Dosya: server/public/admin-travel.html
app.get("/admin-travel.html", (req, res) => {
  const filePath = path.join(PUBLIC_DIR, "admin-travel.html");
  if (!fs.existsSync(filePath)) return res.status(404).send("admin-travel.html not found");
  res.sendFile(filePath);
});

// --- API: Patients (dosyadan) ---
app.get("/api/patients", (req, res) => {
  const patients = listPatientsFromFiles();
  res.json({ ok: true, patients });
});

// --- API: Treatments (dosyadan) ---
app.get("/api/patient/:patientId/treatments", (req, res) => {
  ensureDirs();
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patientId missing" });

  const filePath = path.join(TREATMENTS_DIR, `${patientId}.json`);
  const fallback = { schemaVersion: 1, updatedAt: Date.now(), patientId, teeth: [] };
  const json = safeReadJson(filePath, fallback);

  json.patientId = patientId;
  if (!json.updatedAt) json.updatedAt = Date.now();

  res.json(json);
});

// --- API: Travel (dosyadan) ---
app.get("/api/patient/:patientId/travel", (req, res) => {
  ensureDirs();
  const patientId = String(req.params.patientId || "").trim();
  if (!patientId) return res.status(400).json({ ok: false, error: "patientId missing" });

  const filePath = path.join(TRAVEL_DIR, `${patientId}.json`);
  const fallback = {
    schemaVersion: 1,
    updatedAt: Date.now(),
    patientId,
    hotel: null,
    flights: [],
    notes: "",
  };
  const json = safeReadJson(filePath, fallback);

  json.patientId = patientId;
  if (!json.updatedAt) json.updatedAt = Date.now();

  res.json(json);
});

// health
app.get("/health", (req, res) => res.json({ ok: true, port: String(PORT) }));

app.listen(PORT, "127.0.0.1", () => {
  ensureDirs();
  console.log(`✅ Server running: http://127.0.0.1:${PORT}`);
  console.log(`🔧 Admin:        http://127.0.0.1:${PORT}/admin.html`);
  console.log(`✈️  AdminTravel:  http://127.0.0.1:${PORT}/admin-travel.html`);
  console.log(`🗂️  Public dir:   ${PUBLIC_DIR}`);
  console.log(`📁 Data dir:     ${DATA_DIR}`);
});
