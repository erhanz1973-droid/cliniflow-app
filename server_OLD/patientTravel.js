const fs = require("fs");
const path = require("path");

function dataDir() {
  return path.join(process.cwd(), "data");
}

function ensureDataDir() {
  const dir = dataDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function safeId(patientId) {
  return String(patientId).replace(/[^a-zA-Z0-9_-]/g, "");
}

function travelFile(patientId) {
  return path.join(dataDir(), `patient_${safeId(patientId)}_travel.json`);
}

function defaultTravel() {
  return {
    schemaVersion: 1,
    updatedAt: Date.now(),
    hotel: null, // { name, address?, googleMapsUrl, checkInDate?, checkOutDate? }
    flight: null,
    notes: "",
  };
}

function registerPatientTravelRoutes(app) {
  // GET /api/patient/:patientId/travel
  app.get("/api/patient/:patientId/travel", (req, res) => {
    try {
      ensureDataDir();
      const { patientId } = req.params;
      const file = travelFile(patientId);

      if (!fs.existsSync(file)) {
        return res.status(200).json(defaultTravel());
      }

      const raw = fs.readFileSync(file, "utf-8");
      const json = JSON.parse(raw);

      return res.status(200).json({
        ...defaultTravel(),
        ...json,
        schemaVersion: 1,
      });
    } catch (e) {
      return res.status(500).json({ error: "TRAVEL_READ_FAILED" });
    }
  });

  // PUT /api/patient/:patientId/travel
  app.put("/api/patient/:patientId/travel", (req, res) => {
    try {
      ensureDataDir();
      const { patientId } = req.params;

      const body = req.body || {};
      const hotel = body.hotel || null;

      if (hotel) {
        const name = String(hotel.name || "").trim();
        const googleMapsUrl = String(hotel.googleMapsUrl || "").trim();
        if (!name) return res.status(400).json({ error: "HOTEL_NAME_REQUIRED" });
        if (!googleMapsUrl) return res.status(400).json({ error: "GOOGLE_MAPS_URL_REQUIRED" });
      }

      const payload = {
        schemaVersion: 1,
        updatedAt: Date.now(),
        hotel: hotel
          ? {
              name: String(hotel.name || "").trim(),
              address: hotel.address ? String(hotel.address).trim() : undefined,
              googleMapsUrl: String(hotel.googleMapsUrl || "").trim(),
              checkInDate: hotel.checkInDate ? String(hotel.checkInDate).trim() : undefined,
              checkOutDate: hotel.checkOutDate ? String(hotel.checkOutDate).trim() : undefined,
            }
          : null,
        flight: body.flight || null,
        notes: body.notes ? String(body.notes) : "",
      };

      fs.writeFileSync(travelFile(patientId), JSON.stringify(payload, null, 2), "utf-8");
      return res.status(200).json(payload);
    } catch (e) {
      return res.status(500).json({ error: "TRAVEL_WRITE_FAILED" });
    }
  });
}

module.exports = { registerPatientTravelRoutes };
