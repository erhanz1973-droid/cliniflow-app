// app/travel.tsx
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Linking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { API_BASE } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useLanguage } from "../../lib/language-context";

type EditOwner = "ADMIN" | "PATIENT" | "BOTH";

type Flight = {
  type: "ARRIVAL" | "DEPARTURE";
  from: string;
  to: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM format
  flightNo?: string;
};

type Hotel = {
  name: string;
  address?: string;
  phone?: string;
  checkIn?: string;  // YYYY-MM-DD
  checkOut?: string; // YYYY-MM-DD
  googleMapsUrl?: string; // Google Maps link
  googleMapLink?: string; // Legacy/admin field
};

type AirportPickup = {
  name?: string; // Karşılayan kişi adı
  whatsApp?: string; // WhatsApp numarası
  gate?: string; // Buluşma yeri (Gate)
  carBrand?: string; // Araba markası
  carColor?: string; // Araba rengi
  carPlate?: string; // Araba plakası
  notes?: string; // Özel notlar
};

type TravelData = {
  schemaVersion?: number;
  updatedAt?: number;
  patientId?: string;

  editPolicy?: {
    hotel?: EditOwner;
    flights?: EditOwner;
    notes?: EditOwner;
  };

  hotel: Hotel | null;
  flights: Flight[];
  notes?: string;
  airportPickup?: AirportPickup | null;
};

function normalizeTravel(json: any): TravelData {
  // Hotel bilgisini parse et - daha robust kontrol
  let hotel: Hotel | null = null;
  
  const hotelRaw = json?.hotel;
  
  if (hotelRaw === null) {
    // Explicit null - no hotel
    hotel = null;
    console.log("[normalizeTravel] Hotel is explicitly null");
  } else if (hotelRaw === undefined) {
    // Undefined - no hotel
    hotel = null;
    console.log("[normalizeTravel] Hotel is undefined, setting to null");
  } else if (typeof hotelRaw === "string") {
    // Legacy format: hotel is a string
    const hotelName = String(hotelRaw).trim();
    hotel = hotelName ? { name: hotelName } : null;
    console.log("[normalizeTravel] Hotel was string:", hotelName, "->", hotel);
  } else if (typeof hotelRaw === "object") {
    // Modern format: hotel is an object
    const hotelName = String(hotelRaw?.name ?? "").trim();
    const mapUrlRaw =
      hotelRaw?.googleMapLink ??
      hotelRaw?.googleMapsUrl ??
      hotelRaw?.googleMapsURL ??
      hotelRaw?.mapUrl;
    if (hotelName) {
      hotel = {
        name: hotelName,
        address: hotelRaw?.address ? String(hotelRaw.address).trim() : undefined,
        phone: hotelRaw?.phone ? String(hotelRaw.phone).trim() : undefined,
        checkIn: hotelRaw?.checkIn ? String(hotelRaw.checkIn).trim() : undefined,
        checkOut: hotelRaw?.checkOut ? String(hotelRaw.checkOut).trim() : undefined,
        googleMapsUrl: mapUrlRaw ? String(mapUrlRaw).trim() : undefined,
      };
      console.log("[normalizeTravel] Hotel object parsed successfully:", hotelName);
    } else {
      hotel = null;
      console.log("[normalizeTravel] Hotel object exists but name is empty, setting to null");
    }
  } else {
    hotel = null;
    console.log("[normalizeTravel] Hotel has unexpected type:", typeof hotelRaw, "setting to null");
  }
  
  console.log("[normalizeTravel] Input hotel (raw):", JSON.stringify(hotelRaw, null, 2));
  console.log("[normalizeTravel] Parsed hotel (final):", JSON.stringify(hotel, null, 2));

  // Flights parse - handle different formats
  let flights: Flight[] = [];
  
  if (Array.isArray(json?.flights)) {
    flights = json.flights.map((f: any) => {
      // Handle different type formats
      let flightType: "ARRIVAL" | "DEPARTURE" = "ARRIVAL";
      if (f?.type === "DEPARTURE" || f?.type === "OUTBOUND" || f?.type === "RETURN") {
        flightType = f?.type === "DEPARTURE" || f?.type === "OUTBOUND" ? "DEPARTURE" : "ARRIVAL";
      }
      
      return {
        type: flightType,
        from: String(f?.from ?? ""),
        to: String(f?.to ?? ""),
        date: String(f?.date ?? ""),
        time: f?.time ? String(f.time) : undefined,
        flightNo: f?.flightNo ? String(f.flightNo) : "",
      };
    });
    console.log("[normalizeTravel] Flights parsed:", flights.length, "flights");
  } else {
    console.log("[normalizeTravel] Flights is not an array:", typeof json?.flights, json?.flights);
  }
  
  console.log("[normalizeTravel] Final flights array:", JSON.stringify(flights, null, 2));

  const editPolicy = {
    hotel: (json?.editPolicy?.hotel as EditOwner) || "ADMIN",
    flights: (json?.editPolicy?.flights as EditOwner) || "ADMIN",
    notes: (json?.editPolicy?.notes as EditOwner) || "ADMIN",
  };

  // Airport pickup bilgisini parse et
  let airportPickup: AirportPickup | null = null;
  const pickupRaw = json?.airportPickup;
  
  // Support both formats:
  // 1. App format: whatsApp, gate, carBrand, carColor, carPlate
  // 2. Admin format: phone, vehicle (single string)
  if (pickupRaw && typeof pickupRaw === "object" && (
    pickupRaw.name || 
    pickupRaw.whatsApp || pickupRaw.phone || 
    pickupRaw.gate || 
    pickupRaw.carBrand || pickupRaw.carColor || pickupRaw.carPlate || pickupRaw.vehicle ||
    pickupRaw.notes
  )) {
    // Use whatsApp if available, otherwise fall back to phone
    const whatsApp = pickupRaw.whatsApp ? String(pickupRaw.whatsApp).trim() : 
                     (pickupRaw.phone ? String(pickupRaw.phone).trim() : undefined);
    
    // Parse vehicle string (admin format) into carBrand/carColor/carPlate if needed
    let carBrand = pickupRaw.carBrand ? String(pickupRaw.carBrand).trim() : undefined;
    let carColor = pickupRaw.carColor ? String(pickupRaw.carColor).trim() : undefined;
    let carPlate = pickupRaw.carPlate ? String(pickupRaw.carPlate).trim() : undefined;
    
    // If vehicle is a string (admin format), try to parse it
    if (pickupRaw.vehicle && !carBrand && !carColor && !carPlate) {
      const vehicleStr = String(pickupRaw.vehicle).trim();
      // Try to extract plate number (common patterns: "34 ABC 123", "Plaka: 34 ABC 123")
      const plateMatch = vehicleStr.match(/(?:[Pp]laka[:\s]*)?([0-9]{1,2}\s*[A-Z]{1,3}\s*[0-9]{1,4})/);
      if (plateMatch) {
        carPlate = plateMatch[1].trim();
      }
      // Try to extract color (common colors)
      const colorMatch = vehicleStr.match(/\b(Siyah|Beyaz|Kırmızı|Mavi|Yeşil|Gri|Sarı|Turuncu|Mor|Pembe|Kahverengi|Lacivert)\b/i);
      if (colorMatch) {
        carColor = colorMatch[1];
      }
      // Brand is usually at the start (BMW, Mercedes, etc.)
      const brandMatch = vehicleStr.match(/^([A-Za-z]+)/);
      if (brandMatch && !colorMatch) {
        carBrand = brandMatch[1];
      }
    }
    
    airportPickup = {
      name: pickupRaw.name ? String(pickupRaw.name).trim() : undefined,
      whatsApp: whatsApp,
      gate: pickupRaw.gate ? String(pickupRaw.gate).trim() : undefined,
      carBrand: carBrand,
      carColor: carColor,
      carPlate: carPlate,
      notes: pickupRaw.notes ? String(pickupRaw.notes).trim() : undefined,
    };
    console.log("[normalizeTravel] Airport pickup parsed:", JSON.stringify(airportPickup, null, 2));
  } else {
    console.log("[normalizeTravel] Airport pickup is null or empty");
  }
  
  return {
    schemaVersion: json?.schemaVersion ?? 1,
    updatedAt: json?.updatedAt ?? Date.now(),
    patientId: json?.patientId,

    editPolicy,

    hotel,
    flights,
    notes: json?.notes ? String(json.notes) : "",
    airportPickup: airportPickup,
  };
}

export default function TravelScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const { user, isAuthReady, isAuthed } = useAuth();
  const { t } = useLanguage();

  const OWNER_LABEL: Record<EditOwner, string> = {
    ADMIN: t("travel.editPolicyAdmin"),
    PATIENT: t("travel.editPolicyPatient"),
    BOTH: t("travel.editPolicyBoth"),
  };

  const [data, setData] = useState<TravelData | null>(null);
  const [patientId, setPatientId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [retryKey, setRetryKey] = useState(0); // Force re-fetch on retry
  // First-open questions (patient must decide when first entering Travel)
  const [flightTicketsOwner, setFlightTicketsOwner] = useState<"CLINIC" | "PATIENT" | null>(null);
  const [hotelReservationOwner, setHotelReservationOwner] = useState<"CLINIC" | "PATIENT" | null>(null);
  const [showDatePicker, setShowDatePicker] = useState<{
    type: 'checkIn' | 'checkOut' | 'flight' | null;
    flightIndex?: number;
  }>({ type: null });
  const [datePickerValue, setDatePickerValue] = useState<Date>(new Date());
  const [expandedSections, setExpandedSections] = useState<{
    hotel: boolean;
    flights: boolean;
    airportPickup: boolean;
  }>({
    hotel: false,
    flights: false,
    airportPickup: false,
  });
  const lastPatientIdRef = useRef<string | null>(null);

  // Helper function to format date as YYYY-MM-DD in local timezone (not UTC)
  const formatDateLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const openDatePicker = (type: 'checkIn' | 'checkOut' | 'flight', currentDate: Date, flightIndex?: number) => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: "date",
        onChange: (event, selectedDate) => {
          if (event.type === "dismissed") return;
          if (!selectedDate) return;
          // Use local timezone, not UTC to avoid date shift
          const dateValue = formatDateLocal(selectedDate);
          if (type === 'checkIn') {
            updateHotelField('checkIn', dateValue);
          } else if (type === 'checkOut') {
            updateHotelField('checkOut', dateValue);
          } else if (type === 'flight' && flightIndex !== undefined) {
            updateFlight(flightIndex, 'date', dateValue);
          }
        },
      });
      return;
    }
    setDatePickerValue(currentDate);
    setShowDatePicker({ type, flightIndex });
  };

  useEffect(() => {
    if (!isAuthReady) return;

    // Check authentication - use isAuthed instead of user?.token for more reliable check
    if (!isAuthed || !user?.token) {
      setLoading(false);
      router.replace("/");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setErr("");

    const token = user.token;

    // Fetch function - defined inside useEffect to avoid dependency issues
    const fetchTravelData = async (isInitial = false) => {
      if (cancelled) return;

      console.log("[TRAVEL] Starting fetch, API_BASE:", API_BASE);

      // Create AbortController for timeout - shorter timeout for better UX
      let controller: AbortController | null = new AbortController();
      let timeoutId: NodeJS.Timeout | null = setTimeout(() => {
        console.error("[TRAVEL] Timeout: /api/patient/me request took too long");
        controller?.abort();
      }, 10000); // 10 second timeout

      let travelController: AbortController | null = null;
      let travelTimeoutId: NodeJS.Timeout | null = null;

      try {
        // Get patient info first to get patientId
        console.log("[TRAVEL] Fetching /api/patient/me from:", `${API_BASE}/api/patient/me`);
        const meRes = await fetch(`${API_BASE}/api/patient/me`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        if (!meRes.ok) {
          if (meRes.status === 403) throw new Error("patient_not_approved");
          throw new Error(`Status check failed: ${meRes.status}`);
        }

        const me = await meRes.json();
        const currentPatientId = me?.patientId || "";
        
        if (cancelled) return;
        
        if (!currentPatientId) {
          throw new Error("Patient ID not found");
        }
        
        if (me?.status !== "APPROVED") {
          router.replace("/waiting-approval");
          return;
        }

        // If patient changes, clear stale data before loading
        if (lastPatientIdRef.current && lastPatientIdRef.current !== currentPatientId) {
          setData(null);
          setFlightTicketsOwner(null);
          setHotelReservationOwner(null);
          setExpandedSections({ hotel: false, flights: false, airportPickup: false });
          setErr("");
        }
        lastPatientIdRef.current = currentPatientId;

        setPatientId(currentPatientId);

        // Load saved answers
        try {
          const savedFlightTicketsOwner = await AsyncStorage.getItem(`flightTicketsOwner_${currentPatientId}`);
          const savedHotelReservationOwner = await AsyncStorage.getItem(`hotelReservationOwner_${currentPatientId}`);
          if (savedFlightTicketsOwner === "CLINIC" || savedFlightTicketsOwner === "PATIENT") {
            setFlightTicketsOwner(savedFlightTicketsOwner);
          }
          if (savedHotelReservationOwner === "CLINIC" || savedHotelReservationOwner === "PATIENT") {
            setHotelReservationOwner(savedHotelReservationOwner);
          }
        } catch (e) {
          console.log("[TRAVEL] Could not load saved answers:", e);
        }

        // Status approved, fetch travel data
        travelController = new AbortController();
        travelTimeoutId = setTimeout(() => {
          console.error("[TRAVEL] Timeout: /api/patient/travel request took too long");
          travelController?.abort();
        }, 10000); // 10 second timeout

        console.log("[TRAVEL] Fetching travel data from:", `${API_BASE}/api/patient/${encodeURIComponent(currentPatientId)}/travel`);
        const travelRes = await fetch(`${API_BASE}/api/patient/${encodeURIComponent(currentPatientId)}/travel`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: travelController.signal,
        });

        if (travelTimeoutId) {
          clearTimeout(travelTimeoutId);
          travelTimeoutId = null;
        }

        if (cancelled) return;

        if (!travelRes.ok) {
          if (travelRes.status === 403) {
            router.replace("/waiting-approval");
            return;
          }
          throw new Error(`GET travel failed: ${travelRes.status}`);
        }

        const json = await travelRes.json();
        
        if (cancelled) return;
        
        if (isInitial) {
          console.log("[TRAVEL] Initial load - Received data:", JSON.stringify(json, null, 2));
        } else {
          console.log("[TRAVEL] Auto-refresh - Received data:", JSON.stringify(json, null, 2));
        }
        console.log("[TRAVEL] Hotel data:", JSON.stringify(json.hotel, null, 2));
        console.log("[TRAVEL] Flights data:", JSON.stringify(json.flights, null, 2));
        console.log("[TRAVEL] Airport pickup data:", JSON.stringify(json.airportPickup, null, 2));
        
        const normalized = normalizeTravel(json);
        console.log("[TRAVEL] Normalized hotel:", JSON.stringify(normalized.hotel, null, 2));
        console.log("[TRAVEL] Normalized flights:", JSON.stringify(normalized.flights, null, 2));
        console.log("[TRAVEL] Normalized airport pickup:", JSON.stringify(normalized.airportPickup, null, 2));
        
        setData(normalized);
        setErr("");

        // Mark travel as "seen" when user opens Travel screen
        try {
          const ts = Number(normalized?.updatedAt || Date.now());
          await AsyncStorage.setItem(`travel_last_seen_${currentPatientId}`, String(ts));
        } catch {}
      } catch (e: any) {
        // Clean up timeouts
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (travelTimeoutId) {
          clearTimeout(travelTimeoutId);
          travelTimeoutId = null;
        }
        
        // Abort pending requests
        if (controller && !controller.signal.aborted) {
          controller.abort();
        }
        if (travelController && !travelController.signal.aborted) {
          travelController.abort();
        }
        
        if (cancelled) return;
        
        // Handle abort/timeout errors
        if (e?.name === "AbortError" || e?.message?.includes("aborted") || e?.message?.includes("timeout")) {
          console.error("[TRAVEL] Request timeout:", e);
          setErr(t("travel.requestTimeout"));
          setLoading(false); // Always set loading to false on error
          return;
        }
        
        // Handle network errors
        if (e?.message?.includes("Network request failed") || e?.message?.includes("Failed to connect") || e?.message?.includes("ECONNREFUSED")) {
          console.error("[TRAVEL] Network error:", e);
          setErr(t("travel.networkError"));
          setLoading(false); // Always set loading to false on error
          return;
        }
        
        if (e?.message?.includes("patient_not_approved") || e?.message?.includes("403")) {
          setLoading(false);
          router.replace("/waiting-approval");
          return;
        }
        
        console.error("[TRAVEL] Error:", e);
        setData(null);
        setErr(`${e?.message || t("travel.loadError")}\n\nAPI: ${API_BASE}`);
        setLoading(false); // Always set loading to false on error
      } finally {
        // Always set loading to false, even if there was an error
        if (isInitial && !cancelled) {
          setLoading(false);
        }
      }
    };

    // Initial fetch
    fetchTravelData(true);

    // Auto-refresh every 10 seconds - DISABLED to prevent page refresh while filling forms
    // const intervalId = setInterval(() => {
    //   if (!cancelled && user?.token) {
    //     console.log("[TRAVEL] Auto-refreshing data (every 10 seconds)...");
    //     fetchTravelData(false); // Not initial, don't show loading
    //   }
    // }, 10000); // 10 seconds

    return () => {
      cancelled = true;
      // clearInterval(intervalId); // Disabled auto-refresh
    };
  }, [router, user?.token, isAuthReady, isAuthed, retryKey]); // Include retryKey to trigger re-fetch

  useEffect(() => {
    if (loading) return;
    if (err) return;
    if (data) return;
    if (!patientId) return;
    setData({
      patientId,
      hotel: null,
      flights: [],
      notes: "",
      airportPickup: null,
      editPolicy: {
        hotel: "ADMIN",
        flights: "ADMIN",
        notes: "ADMIN",
      },
    });
  }, [loading, err, data, patientId]);

  const onRefresh = useCallback(async () => {
    if (!user?.token || !patientId) return;
    setRefreshing(true);
    try {
      const travelRes = await fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/travel`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (travelRes.ok) {
        const json = await travelRes.json();
        const normalized = normalizeTravel(json);
        setData(normalized);
        setErr("");
      }
    } catch (e: any) {
      console.error("[TRAVEL] Refresh error:", e);
        setErr(e?.message || t("travel.refreshError"));
    } finally {
      setRefreshing(false);
    }
  }, [user?.token, patientId]);

  const owner = useMemo(() => {
    // If questions are answered, use those answers
    if (flightTicketsOwner !== null && hotelReservationOwner !== null) {
      return {
        flights: (flightTicketsOwner === "PATIENT" ? "PATIENT" : "ADMIN") as EditOwner,
        hotel: (hotelReservationOwner === "PATIENT" ? "PATIENT" : "ADMIN") as EditOwner,
        // Notes are always patient-editable once they have made the initial decision
        notes: "PATIENT" as EditOwner,
      };
    }

    // Fallback to server data
    const ep = data?.editPolicy;
    return {
      hotel: (ep?.hotel || "ADMIN") as EditOwner,
      flights: (ep?.flights || "ADMIN") as EditOwner,
      notes: (ep?.notes || "ADMIN") as EditOwner,
    };
  }, [data?.editPolicy, flightTicketsOwner, hotelReservationOwner]);

  const canPatientEdit = (k: "hotel" | "flights" | "notes") => {
    // If questions are not answered yet, don't allow editing
    if (flightTicketsOwner === null || hotelReservationOwner === null) return false;

    if (k === "flights") return flightTicketsOwner === "PATIENT";
    if (k === "hotel") return hotelReservationOwner === "PATIENT";
    // notes: always editable once initial decision is made
    if (k === "notes") return true;
    return owner[k] === "PATIENT" || owner[k] === "BOTH";
  };

  const anythingEditable =
    canPatientEdit("hotel") || canPatientEdit("flights") || canPatientEdit("notes");

  // Function to save editPolicy to server
  const saveEditPolicyToServer = useCallback(async (flightsOwner: "CLINIC" | "PATIENT", hotelOwner: "CLINIC" | "PATIENT") => {
    if (!user?.token) return;
    const currentPatientId = patientId || data?.patientId || "";
    if (!currentPatientId) return;
    
    try {
      // Calculate editPolicy based on answers
      const editPolicy: { hotel: EditOwner; flights: EditOwner; notes: EditOwner } = {
        hotel: hotelOwner === "PATIENT" ? "PATIENT" : "ADMIN",
        flights: flightsOwner === "PATIENT" ? "PATIENT" : "ADMIN",
        notes: "PATIENT",
      };
      
      // Get current travel data
      const currentData = data || {
        schemaVersion: 1,
        updatedAt: Date.now(),
        patientId: currentPatientId,
        hotel: null,
        flights: [],
        notes: "",
        airportPickup: null,
        editPolicy: editPolicy,
      };
      
      const payload = {
        ...currentData,
        patientId: currentPatientId,
        editPolicy: editPolicy,
        updatedAt: Date.now(),
        hotel: currentData?.hotel
          ? {
              ...currentData.hotel,
              // Keep admin-compatible key in sync
              googleMapLink:
                currentData.hotel.googleMapsUrl ||
                currentData.hotel.googleMapLink ||
                "",
            }
          : null,
      };
      
      const r = await fetch(`${API_BASE}/api/patient/me/travel`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(payload),
      });
      
      if (!r.ok) {
        const text = await r.text().catch(() => "");
        console.error("[TRAVEL] saveEditPolicyToServer failed:", {
          status: r.status,
          text: text?.substring?.(0, 500) || text,
          url: `${API_BASE}/api/patient/me/travel`,
          editPolicy,
        });
        Alert.alert(t("common.error"), t("travel.saveError"));
        return;
      }

      const json = await r.json().catch(() => null);
      const travelData = json?.travel || json;
      if (travelData) {
        const normalized = normalizeTravel(travelData);
        setData(normalized);
      }
      console.log("[TRAVEL] EditPolicy saved to server:", editPolicy);
    } catch (e: any) {
      console.error("[TRAVEL] Error saving editPolicy:", e);
      Alert.alert(t("common.error"), t("travel.saveError"));
    }
  }, [user?.token, patientId, data]);

  function updateHotelField(field: keyof Hotel, value: string) {
    if (!data) return;
    const current = data.hotel || { name: "" };
    const updatedHotel = { ...current, [field]: value };
    console.log(`[TRAVEL] updateHotelField: ${field} = ${value}`, {
      current,
      updatedHotel,
      fullData: { ...data, hotel: updatedHotel }
    });
    setData({ ...data, hotel: updatedHotel });
  }

  function updateFlight(i: number, field: keyof Flight, value: string) {
    if (!data) return;
    const flights = [...data.flights];
    
    // Format time input to HH:MM format
    if (field === "time") {
      // Remove all non-digit characters
      let digits = value.replace(/\D/g, "");
      
      // Limit to 4 digits (HHMM)
      if (digits.length > 4) {
        digits = digits.substring(0, 4);
      }
      
      // Format as HH:MM
      if (digits.length >= 3) {
        value = digits.substring(0, 2) + ":" + digits.substring(2);
      } else if (digits.length > 0) {
        value = digits;
      } else {
        value = "";
      }
      
      // Validate hours (00-23) and minutes (00-59)
      if (value.length === 5) {
        const [hours, minutes] = value.split(":");
        const h = parseInt(hours, 10);
        const m = parseInt(minutes, 10);
        if (h > 23) {
          value = "23:" + minutes;
        }
        if (m > 59) {
          value = hours + ":59";
        }
      }
    }
    
    flights[i] = { ...flights[i], [field]: value } as Flight;
    setData({ ...data, flights });
  }

  function addFlight(type: Flight["type"]) {
    if (!data) return;
    setData({
      ...data,
      flights: [...data.flights, { type, from: "", to: "", date: "", time: undefined, flightNo: "" }],
    });
  }

  function removeFlight(i: number) {
    if (!data) return;
    setData({ ...data, flights: data.flights.filter((_, idx) => idx !== i) });
  }

  async function save() {
    if (!data || !user?.token) return;
    if (!anythingEditable) {
      Alert.alert(t("travel.noEditableFields"));
      return;
    }

    const currentPatientId = patientId || data?.patientId || "";
    if (!currentPatientId) {
      Alert.alert(t("common.error"), t("travel.patientIdNotFound"));
      return;
    }

    // Hasta yetkili olmadığı alanları istemeden overwrite etmesin:
    // payload'ı server'ın beklediği formatta gönderiyoruz ama kilitli alanları aynen bırakıyoruz.
    setSaving(true);
    setErr("");

    const payload: TravelData = {
      ...data,
      updatedAt: Date.now(),
      patientId: currentPatientId,
      schemaVersion: data.schemaVersion ?? 1,
      editPolicy: data.editPolicy, // policy server'da dursun
      // hotel/flights/notes zaten state'te var
      hotel: data.hotel
        ? {
            ...data.hotel,
            // Keep admin-compatible key in sync
            googleMapLink:
              data.hotel.googleMapsUrl ||
              data.hotel.googleMapLink ||
              "",
          }
        : null,
    };

    console.log("[TRAVEL SAVE] Payload before send:", JSON.stringify(payload, null, 2));
    console.log("[TRAVEL SAVE] Hotel in payload:", payload.hotel);
    console.log("[TRAVEL SAVE] Flights in payload:", payload.flights);
    console.log("[TRAVEL SAVE] Data state:", JSON.stringify(data, null, 2));

    try {
      const r = await fetch(`${API_BASE}/api/patient/me/travel`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(`POST travel failed: ${r.status}`);

      let json: any = null;
      try {
        json = await r.json();
        console.log("[TRAVEL SAVE] Server response:", JSON.stringify(json, null, 2));
      } catch {
        // no json
      }
      // Server returns { ok: true, saved: true, travel: payload }
      // So we need to use json.travel if it exists, otherwise json itself
      const travelData = json?.travel || json;
      console.log("[TRAVEL SAVE] Travel data extracted from response:", JSON.stringify(travelData, null, 2));
      const mergedTravel = travelData
        ? {
            ...travelData,
            flights: Array.isArray(travelData?.flights) ? travelData.flights : payload.flights,
          }
        : payload;
      const normalized = normalizeTravel(mergedTravel);
      console.log("[TRAVEL SAVE] Normalized data after save:", JSON.stringify(normalized, null, 2));
      console.log("[TRAVEL SAVE] Hotel in normalized:", normalized.hotel);
      console.log("[TRAVEL SAVE] Flights in normalized:", normalized.flights);
      setData(normalized);

      // After saving, this screen is the latest "seen"
      try {
        const ts = Number(normalized?.updatedAt || Date.now());
        await AsyncStorage.setItem(`travel_last_seen_${currentPatientId}`, String(ts));
      } catch {}
      
      // Reload data from server to ensure consistency
      if (user?.token) {
        console.log("[TRAVEL SAVE] Reloading data from server...");
        try {
          const reloadRes = await fetch(`${API_BASE}/api/patient/me/travel`, {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          if (reloadRes.ok) {
            const reloadJson = await reloadRes.json();
            const reloadMerged = {
              ...reloadJson,
              flights: Array.isArray(reloadJson?.flights) ? reloadJson.flights : payload.flights,
            };
            const reloadNormalized = normalizeTravel(reloadMerged);
            console.log("[TRAVEL SAVE] Reloaded data:", JSON.stringify(reloadNormalized, null, 2));
            setData(reloadNormalized);
          }
        } catch (reloadErr) {
          console.error("[TRAVEL SAVE] Reload error:", reloadErr);
          // Don't fail the save if reload fails
        }
      }
      
      Alert.alert(t("travel.saveSuccess"));
    } catch (e: any) {
      setErr(e?.message || t("travel.saveError"));
      Alert.alert(t("travel.saveError"), e?.message || "");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={{ padding: 16, flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ marginTop: 16, fontSize: 16 }}>{t("travel.loading")}</Text>
        <Text style={{ marginTop: 8, fontSize: 12, color: "#6B7280" }}>API: {API_BASE}</Text>
        <Text style={{ marginTop: 4, fontSize: 11, color: "#9CA3AF" }}>{t("travel.waitMax10Seconds")}</Text>
      </View>
    );
  }

  if (err && !data) {
    return (
      <ScrollView style={{ padding: 16 }}>
        <View style={{ backgroundColor: "#FEE2E2", padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "#FCA5A5" }}>
          <Text style={{ fontWeight: "700", marginBottom: 8, fontSize: 18, color: "#991B1B" }}>❌ {t("travel.error")}</Text>
          <Text style={{ marginBottom: 12, color: "#7F1D1D", lineHeight: 20 }}>{err}</Text>
          <Pressable
            style={{ backgroundColor: "#2563EB", padding: 12, borderRadius: 8, marginTop: 8 }}
            onPress={() => {
              // Reset state and trigger useEffect to re-fetch
              setErr("");
              setLoading(true);
              setData(null);
              // Increment retryKey to trigger useEffect re-run
              setRetryKey(prev => prev + 1);
            }}
          >
            <Text style={{ color: "#FFFFFF", textAlign: "center", fontWeight: "700" }}>🔄 {t("common.retry")}</Text>
          </Pressable>
          <View style={{ marginTop: 16, padding: 12, backgroundColor: "#F9FAFB", borderRadius: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", marginBottom: 4, color: "#374151" }}>Debug Information:</Text>
            <Text style={{ fontSize: 11, color: "#6B7280", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
              API_BASE: {API_BASE}
            </Text>
            <Text style={{ fontSize: 11, color: "#6B7280", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
              Patient ID: {patientId || "(none)"}
            </Text>
            <Text style={{ fontSize: 11, color: "#6B7280", fontFamily: Platform.OS === "ios" ? "Courier" : "monospace" }}>
              Token: {user?.token ? "✓ Present" : "✗ Missing"}
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (!data) {
    return (
      <View style={{ padding: 16 }}>
        <Text>{t("travel.loading")}</Text>
      </View>
    );
  }

  return (
    <ScrollView 
      contentContainerStyle={{ padding: 16, gap: 14 }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={{ fontSize: 20, fontWeight: "800" }}>{t("travel.title")}</Text>

      {/* Organization Selection Info */}
      {flightTicketsOwner === null && (
        <View style={{ backgroundColor: "#DBEAFE", padding: 16, borderRadius: 12, marginTop: 12, marginBottom: 12, borderWidth: 2, borderColor: "#3B82F6" }}>
          <Text style={{ fontSize: 15, color: "#1E40AF", fontWeight: "700", textAlign: "center", lineHeight: 22 }}>
            {t("travel.selectOrganizationMessage")}
          </Text>
        </View>
      )}

      {/* Q1: Flights */}
      {flightTicketsOwner === null && (
        <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb" }}>
          <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>
            1) {t("travel.whoWillArrangeFlights")}
          </Text>
          <Pressable
            onPress={async () => {
              setFlightTicketsOwner("CLINIC");
              try {
                await AsyncStorage.setItem(`flightTicketsOwner_${patientId}`, "CLINIC");
              } catch (e) {
                console.error("[TRAVEL] Error saving flightTicketsOwner:", e);
              }
            }}
            style={{
              backgroundColor: "#f3f4f6",
              padding: 12,
              borderRadius: 8,
              marginBottom: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600" }}>{t("travel.clinic")}</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              setFlightTicketsOwner("PATIENT");
              try {
                await AsyncStorage.setItem(`flightTicketsOwner_${patientId}`, "PATIENT");
              } catch (e) {
                console.error("[TRAVEL] Error saving flightTicketsOwner:", e);
              }
            }}
            style={{
              backgroundColor: "#f3f4f6",
              padding: 12,
              borderRadius: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600" }}>{t("travel.patient")}</Text>
          </Pressable>
        </View>
      )}

      {/* Q2: Hotel */}
      {flightTicketsOwner !== null && hotelReservationOwner === null && (
        <View style={{ backgroundColor: "#fff", padding: 16, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb" }}>
          <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 12 }}>
            2) {t("travel.whoWillArrangeHotel")}
          </Text>
          <Pressable
            onPress={async () => {
              setHotelReservationOwner("CLINIC");
              try {
                await AsyncStorage.setItem(`hotelReservationOwner_${patientId}`, "CLINIC");
                // Save editPolicy to server once both answers are available
                await saveEditPolicyToServer(flightTicketsOwner, "CLINIC");
              } catch (e) {
                console.log("[TRAVEL] Could not save answer:", e);
              }
            }}
            style={{
              backgroundColor: "#f3f4f6",
              padding: 12,
              borderRadius: 8,
              marginBottom: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600" }}>{t("travel.clinic")}</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              setHotelReservationOwner("PATIENT");
              try {
                await AsyncStorage.setItem(`hotelReservationOwner_${patientId}`, "PATIENT");
                // Save editPolicy to server once both answers are available
                await saveEditPolicyToServer(flightTicketsOwner, "PATIENT");
              } catch (e) {
                console.log("[TRAVEL] Could not save answer:", e);
              }
            }}
            style={{
              backgroundColor: "#f3f4f6",
              padding: 12,
              borderRadius: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600" }}>{t("travel.patient")}</Text>
          </Pressable>
        </View>
      )}

      {/* Show form only after both questions are answered */}
      {flightTicketsOwner !== null && hotelReservationOwner !== null && (
        <>

      {/* Decision summary + allow change */}
      <View style={{ backgroundColor: "#fff", padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#e5e7eb", marginBottom: 12 }}>
        <Text style={{ fontSize: 14, fontWeight: "800", marginBottom: 8 }}>{t("travel.yourChoice")}</Text>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Text style={{ fontSize: 13, opacity: 0.8 }}>{t("travel.flightTickets")}</Text>
          <Text style={{ fontSize: 13, fontWeight: "700" }}>{flightTicketsOwner === "PATIENT" ? t("travel.patient") : t("travel.clinic")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
          <Pressable
            onPress={async () => {
              setFlightTicketsOwner("CLINIC");
              try { await AsyncStorage.setItem(`flightTicketsOwner_${patientId}`, "CLINIC"); } catch {}
              await saveEditPolicyToServer("CLINIC", hotelReservationOwner);
            }}
            style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: flightTicketsOwner === "CLINIC" ? "#111827" : "#f3f4f6" }}
          >
            <Text style={{ textAlign: "center", color: flightTicketsOwner === "CLINIC" ? "#fff" : "#111", fontWeight: "700" }}>{t("travel.clinic")}</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              setFlightTicketsOwner("PATIENT");
              try { await AsyncStorage.setItem(`flightTicketsOwner_${patientId}`, "PATIENT"); } catch {}
              await saveEditPolicyToServer("PATIENT", hotelReservationOwner);
            }}
            style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: flightTicketsOwner === "PATIENT" ? "#111827" : "#f3f4f6" }}
          >
            <Text style={{ textAlign: "center", color: flightTicketsOwner === "PATIENT" ? "#fff" : "#111", fontWeight: "700" }}>{t("travel.patient")}</Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <Text style={{ fontSize: 13, opacity: 0.8 }}>{t("travel.hotelReservation")}</Text>
          <Text style={{ fontSize: 13, fontWeight: "700" }}>{hotelReservationOwner === "PATIENT" ? t("travel.patient") : t("travel.clinic")}</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={async () => {
              setHotelReservationOwner("CLINIC");
              try { await AsyncStorage.setItem(`hotelReservationOwner_${patientId}`, "CLINIC"); } catch {}
              await saveEditPolicyToServer(flightTicketsOwner, "CLINIC");
            }}
            style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: hotelReservationOwner === "CLINIC" ? "#111827" : "#f3f4f6" }}
          >
            <Text style={{ textAlign: "center", color: hotelReservationOwner === "CLINIC" ? "#fff" : "#111", fontWeight: "700" }}>{t("travel.clinic")}</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              setHotelReservationOwner("PATIENT");
              try { await AsyncStorage.setItem(`hotelReservationOwner_${patientId}`, "PATIENT"); } catch {}
              await saveEditPolicyToServer(flightTicketsOwner, "PATIENT");
            }}
            style={{ flex: 1, padding: 10, borderRadius: 8, backgroundColor: hotelReservationOwner === "PATIENT" ? "#111827" : "#f3f4f6" }}
          >
            <Text style={{ textAlign: "center", color: hotelReservationOwner === "PATIENT" ? "#fff" : "#111", fontWeight: "700" }}>{t("travel.patient")}</Text>
          </Pressable>
        </View>
      </View>

      {/* HOTEL */}
      <View style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, overflow: "hidden" }}>
        <Pressable
          onPress={() => setExpandedSections({ ...expandedSections, hotel: !expandedSections.hotel })}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 12,
            backgroundColor: "#f9f9f9",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "800" }}>🏨 {t("travel.hotel")}</Text>
            <Text style={{ fontSize: 12, opacity: 0.7 }}>
              {OWNER_LABEL[owner.hotel]}
            </Text>
          </View>
          <Text style={{ fontSize: 18, opacity: 0.6 }}>
            {expandedSections.hotel ? "▼" : "▶"}
          </Text>
        </Pressable>

        {expandedSections.hotel && (
          <View style={{ padding: 12 }}>

        {!data.hotel || !data.hotel.name ? (
          <Text style={{ marginTop: 10, marginBottom: 10, opacity: 0.7, fontSize: 14, fontStyle: "italic" }}>
            {t("travel.noHotelInfo")}
          </Text>
        ) : null}

        <TextInput
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            borderRadius: 8,
            padding: 10,
            marginTop: 10,
            opacity: canPatientEdit("hotel") ? 1 : 0.6,
            backgroundColor: data.hotel?.name ? "#fff" : "#f9f9f9",
          }}
          placeholder={t("travel.hotelNamePlaceholder")}
          editable={canPatientEdit("hotel")}
          value={data.hotel?.name || ""}
          onChangeText={(t) => updateHotelField("name", t)}
        />
        <TextInput
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            borderRadius: 8,
            padding: 10,
            marginTop: 8,
            opacity: canPatientEdit("hotel") ? 1 : 0.6,
          }}
          placeholder={t("travel.addressPlaceholder")}
          editable={canPatientEdit("hotel")}
          value={data.hotel?.address || ""}
          onChangeText={(t) => updateHotelField("address", t)}
        />
        <TextInput
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            borderRadius: 8,
            padding: 10,
            marginTop: 8,
            opacity: canPatientEdit("hotel") ? 1 : 0.6,
          }}
          placeholder={t("travel.phonePlaceholder")}
          editable={canPatientEdit("hotel")}
          value={data.hotel?.phone || ""}
          onChangeText={(t) => updateHotelField("phone", t)}
          keyboardType="phone-pad"
        />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <Pressable
            onPress={() => {
              if (canPatientEdit("hotel")) {
                const currentDate = data.hotel?.checkIn ? new Date(data.hotel.checkIn + 'T00:00:00') : new Date();
                openDatePicker('checkIn', currentDate);
              }
            }}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 8,
              padding: 10,
              opacity: canPatientEdit("hotel") ? 1 : 0.6,
              backgroundColor: canPatientEdit("hotel") ? "#fff" : "#e5e7eb",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#000" }}>
              {data.hotel?.checkIn || t("travel.checkInDate")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              if (canPatientEdit("hotel")) {
                const currentDate = data.hotel?.checkOut ? new Date(data.hotel.checkOut + 'T00:00:00') : new Date();
                openDatePicker('checkOut', currentDate);
              }
            }}
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 8,
              padding: 10,
              opacity: canPatientEdit("hotel") ? 1 : 0.6,
              backgroundColor: canPatientEdit("hotel") ? "#fff" : "#e5e7eb",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: "#000" }}>
              {data.hotel?.checkOut || t("travel.checkOutDate")}
            </Text>
          </Pressable>
        </View>
        
        <TextInput
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            borderRadius: 8,
            padding: 10,
            marginTop: 8,
            opacity: canPatientEdit("hotel") ? 1 : 0.7,
            backgroundColor: data.hotel?.googleMapsUrl ? "#f0f8ff" : "#fff",
          }}
          placeholder={t("travel.googleMapsLinkPlaceholder")}
          editable={canPatientEdit("hotel")}
          value={data.hotel?.googleMapsUrl || ""}
          onChangeText={(t) => updateHotelField("googleMapsUrl", t)}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
        />
        
        {data.hotel?.googleMapsUrl ? (
          <Pressable
            style={{ 
              marginTop: 10, 
              padding: 12, 
              backgroundColor: "#1976D2", 
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
            onPress={async () => {
              const url = data.hotel?.googleMapsUrl || "";
              if (url) {
                try {
                  // URL'i düzelt - eğer http/https yoksa ekle
                  let finalUrl = url.trim();
                  if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
                    finalUrl = "https://" + finalUrl;
                  }
                  
                  const canOpen = await Linking.canOpenURL(finalUrl);
                  if (canOpen) {
                    await Linking.openURL(finalUrl);
                  } else {
                    Alert.alert("Error", "Could not open Google Maps. Please check the URL.");
                  }
                } catch (error) {
                  console.error("[TRAVEL] Google Maps open error:", error);
                  Alert.alert("Error", "Could not open Google Maps");
                }
              }
            }}
          >
            <Text style={{ fontSize: 18 }}>📍</Text>
            <Text style={{ color: "#FFFFFF", textAlign: "center", fontWeight: "600", fontSize: 14 }}>
              Open in Google Maps
            </Text>
          </Pressable>
        ) : data.hotel?.name ? (
          <View style={{ 
            marginTop: 8, 
            padding: 10, 
            backgroundColor: "#f5f5f5", 
            borderRadius: 8,
            borderWidth: 1,
            borderColor: "#ddd",
          }}>
            <Text style={{ fontSize: 12, opacity: 0.7, textAlign: "center" }}>
              Google Maps link not added yet
            </Text>
          </View>
        ) : null}

        {!canPatientEdit("hotel") ? (
          <Text style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            {t("travel.adminOnlySection")}
          </Text>
        ) : null}
          </View>
        )}
      </View>

      {/* FLIGHTS */}
      <View style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, overflow: "hidden" }}>
        <Pressable
          onPress={() => setExpandedSections({ ...expandedSections, flights: !expandedSections.flights })}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            padding: 12,
            backgroundColor: "#f9f9f9",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "800" }}>✈️ {t("travel.flight")}</Text>
            <Text style={{ fontSize: 12, opacity: 0.7 }}>
              {OWNER_LABEL[owner.flights]}
            </Text>
          </View>
          <Text style={{ fontSize: 18, opacity: 0.6 }}>
            {expandedSections.flights ? "▼" : "▶"}
          </Text>
        </Pressable>

        {expandedSections.flights && (
          <View style={{ padding: 12 }}>

        {data.flights.length === 0 ? (
          <Text style={{ marginTop: 8, opacity: 0.7 }}>No flights yet.</Text>
        ) : null}

        {data.flights.map((f, i) => (
          <View
            key={i}
            style={{
              borderWidth: 1,
              borderColor: "#ccc",
              borderRadius: 10,
              padding: 10,
              marginTop: 10,
              opacity: canPatientEdit("flights") ? 1 : 0.65,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "800" }}>{f.type}</Text>
              <Pressable
                onPress={() => removeFlight(i)}
                disabled={!canPatientEdit("flights")}
                style={{
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "#aaa",
                  opacity: canPatientEdit("flights") ? 1 : 0.5,
                }}
              >
                <Text>{t("travel.remove")}</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: "#bbb", borderRadius: 8, padding: 10, backgroundColor: "#fff", color: "#000" }}
                placeholder={t("travel.fromPlaceholder")}
                placeholderTextColor="#999"
                editable={canPatientEdit("flights")}
                value={f.from}
                onChangeText={(t) => updateFlight(i, "from", t)}
              />
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: "#bbb", borderRadius: 8, padding: 10, backgroundColor: "#fff", color: "#000" }}
                placeholder={t("travel.toPlaceholder")}
                placeholderTextColor="#999"
                editable={canPatientEdit("flights")}
                value={f.to}
                onChangeText={(t) => updateFlight(i, "to", t)}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
              <Pressable
                  onPress={() => {
                    if (canPatientEdit("flights")) {
                      const currentDate = f.date ? new Date(f.date + 'T00:00:00') : new Date();
                      openDatePicker('flight', currentDate, i);
                    }
                  }}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#bbb",
                  borderRadius: 8,
                  padding: 10,
                  backgroundColor: canPatientEdit("flights") ? "#fff" : "#e5e7eb",
                  opacity: canPatientEdit("flights") ? 1 : 0.5,
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#000" }}>
                  {f.date ? (f.date + (f.time ? ` ${f.time}` : "")) : t("travel.selectDate")}
                </Text>
              </Pressable>
              <TextInput
                style={{ flex: 1, borderWidth: 1, borderColor: "#bbb", borderRadius: 8, padding: 10, backgroundColor: "#fff", color: "#000" }}
                placeholder={t("travel.timePlaceholder")}
                placeholderTextColor="#999"
                editable={canPatientEdit("flights")}
                value={f.time || ""}
                onChangeText={(t) => updateFlight(i, "time", t)}
                keyboardType="numeric"
                maxLength={5}
              />
            </View>
            <TextInput
              style={{ marginTop: 8, borderWidth: 1, borderColor: "#bbb", borderRadius: 8, padding: 10, backgroundColor: "#fff", color: "#000" }}
              placeholder={t("travel.flightNoPlaceholder")}
              placeholderTextColor="#999"
              editable={canPatientEdit("flights")}
              value={f.flightNo || ""}
              onChangeText={(t) => updateFlight(i, "flightNo", t)}
            />
          </View>
        ))}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <Pressable
            onPress={() => addFlight("ARRIVAL")}
            disabled={!canPatientEdit("flights")}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#aaa",
              opacity: canPatientEdit("flights") ? 1 : 0.5,
              alignItems: "center",
            }}
          >
            <Text>{t("travel.addArrival")}</Text>
          </Pressable>
          <Pressable
            onPress={() => addFlight("DEPARTURE")}
            disabled={!canPatientEdit("flights")}
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#aaa",
              opacity: canPatientEdit("flights") ? 1 : 0.5,
              alignItems: "center",
            }}
          >
            <Text>{t("travel.addDeparture")}</Text>
          </Pressable>
        </View>

        {!canPatientEdit("flights") ? (
          <Text style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            {t("travel.adminOnlySection")}
          </Text>
        ) : null}
          </View>
        )}
      </View>

      {/* AIRPORT PICKUP */}
      {(() => {
        console.log("[TRAVEL RENDER] airportPickup check:", {
          hasAirportPickup: !!data.airportPickup,
          airportPickup: data.airportPickup,
          airportPickupType: typeof data.airportPickup,
          airportPickupKeys: data.airportPickup ? Object.keys(data.airportPickup) : [],
        });
        return null;
      })()}
      {(data.airportPickup && (data.airportPickup.name || data.airportPickup.whatsApp || data.airportPickup.gate || data.airportPickup.carBrand || data.airportPickup.carColor || data.airportPickup.carPlate || data.airportPickup.notes)) ? (
        <View style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, overflow: "hidden", backgroundColor: "#f9f9f9" }}>
          <Pressable
            onPress={() => setExpandedSections({ ...expandedSections, airportPickup: !expandedSections.airportPickup })}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 12,
              backgroundColor: "#f0f0f0",
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: "800" }}>🚗 {t("travel.airportPickup")}</Text>
            <Text style={{ fontSize: 18, opacity: 0.6 }}>
              {expandedSections.airportPickup ? "▼" : "▶"}
            </Text>
          </Pressable>

          {expandedSections.airportPickup && (
            <View style={{ padding: 12 }}>
          {data.airportPickup.name ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{t("travel.contactPerson")}</Text>
              <Text style={{ fontSize: 14, fontWeight: "600" }}>{data.airportPickup.name}</Text>
            </View>
          ) : null}

          {data.airportPickup.whatsApp ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>WhatsApp</Text>
              <Pressable
                onPress={() => {
                  const whatsappUrl = `https://wa.me/${data.airportPickup?.whatsApp?.replace(/[^0-9]/g, "")}`;
                  Linking.openURL(whatsappUrl).catch(() => Alert.alert("Error", "Could not open WhatsApp"));
                }}
              >
                <Text style={{ fontSize: 14, color: "#25D366", fontWeight: "600" }}>
                  💬 {data.airportPickup.whatsApp}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {data.airportPickup.gate ? (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{t("travel.meetingPoint")}</Text>
              <Text style={{ fontSize: 14, fontWeight: "600" }}>📍 {data.airportPickup.gate}</Text>
            </View>
          ) : null}

          {(data.airportPickup.carBrand || data.airportPickup.carColor || data.airportPickup.carPlate) ? (
            <View style={{ marginBottom: 10, padding: 10, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#ddd" }}>
              <Text style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>{t("travel.vehicleInformation")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {data.airportPickup.carBrand ? (
                  <Text style={{ fontSize: 13 }}>🚗 {data.airportPickup.carBrand}</Text>
                ) : null}
                {data.airportPickup.carColor ? (
                  <Text style={{ fontSize: 13 }}>🎨 {data.airportPickup.carColor}</Text>
                ) : null}
                {data.airportPickup.carPlate ? (
                  <Text style={{ fontSize: 13, fontWeight: "600" }}>🔢 {data.airportPickup.carPlate}</Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {data.airportPickup.notes ? (
            <View style={{ marginTop: 8, padding: 10, backgroundColor: "#fff", borderRadius: 8, borderWidth: 1, borderColor: "#ddd" }}>
              <Text style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{t("travel.specialNotes")}</Text>
              <Text style={{ fontSize: 13 }}>{data.airportPickup.notes}</Text>
            </View>
          ) : null}
            </View>
          )}
        </View>
      ) : null}

      {/* NOTES */}
      <View style={{ borderWidth: 1, borderColor: "#ddd", borderRadius: 10, padding: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <Text style={{ fontSize: 16, fontWeight: "800" }}>{t("travel.notes")}</Text>
          <Text style={{ fontSize: 12, opacity: 0.7 }}>
            {OWNER_LABEL[owner.notes]}
          </Text>
        </View>

        <TextInput
          style={{
            borderWidth: 1,
            borderColor: "#ccc",
            borderRadius: 8,
            padding: 10,
            marginTop: 10,
            minHeight: 90,
            textAlignVertical: "top",
            opacity: canPatientEdit("notes") ? 1 : 0.6,
          }}
          multiline
          placeholder={t("travel.notesPlaceholder")}
          editable={canPatientEdit("notes")}
          value={data.notes || ""}
          onChangeText={(t) => setData({ ...data, notes: t })}
        />

        {!canPatientEdit("notes") ? (
          <Text style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
            {t("travel.adminOnlySection")}
          </Text>
        ) : null}
      </View>

      {/* SAVE */}
      <Pressable
        onPress={save}
        disabled={saving || !anythingEditable}
        style={{
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#999",
          opacity: saving || !anythingEditable ? 0.5 : 1,
          alignItems: "center",
        }}
      >
        {saving ? <ActivityIndicator /> : <Text style={{ fontWeight: "800" }}>{t("travel.save")}</Text>}
      </Pressable>

      {err ? (
        <Text style={{ marginTop: 6, color: "crimson" }}>{err}</Text>
      ) : null}
        </>
      )}

      {/* Date Picker Modal */}
      {showDatePicker.type && Platform.OS === "web" && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
        }}>
          <View style={{
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: 20,
            width: '90%',
            maxWidth: 400,
          }}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16 }}>
              {showDatePicker.type === 'checkIn' && t("travel.checkInDateLabel")}
              {showDatePicker.type === 'checkOut' && t("travel.checkOutDateLabel")}
              {showDatePicker.type === 'flight' && t("travel.flightDateLabel")}
            </Text>
            <input
              type="date"
              value={
                showDatePicker.type === 'checkIn' ? (data.hotel?.checkIn || '') :
                showDatePicker.type === 'checkOut' ? (data.hotel?.checkOut || '') :
                showDatePicker.type === 'flight' && showDatePicker.flightIndex !== undefined
                  ? (data.flights[showDatePicker.flightIndex]?.date || '')
                  : ''
              }
              onChange={(e) => {
                const dateValue = e.target.value;
                if (showDatePicker.type === 'checkIn') {
                  updateHotelField('checkIn', dateValue);
                } else if (showDatePicker.type === 'checkOut') {
                  updateHotelField('checkOut', dateValue);
                } else if (showDatePicker.type === 'flight' && showDatePicker.flightIndex !== undefined) {
                  updateFlight(showDatePicker.flightIndex, 'date', dateValue);
                }
                setShowDatePicker({ type: null });
              }}
              style={{
                width: '100%',
                padding: 10,
                fontSize: 16,
                borderWidth: 1,
                borderColor: '#ccc',
                borderRadius: 8,
              }}
            />
          </View>
        </View>
      )}
      {showDatePicker.type && Platform.OS === "ios" && (
        <Modal
          transparent
          visible
          animationType="fade"
          onRequestClose={() => setShowDatePicker({ type: null })}
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <View style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: 20,
              width: '90%',
              maxWidth: 400,
            }}>
              <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16 }}>
                {showDatePicker.type === 'checkIn' && t("travel.checkInDateLabel")}
                {showDatePicker.type === 'checkOut' && t("travel.checkOutDateLabel")}
                {showDatePicker.type === 'flight' && t("travel.flightDateLabel")}
              </Text>
              <View>
                <DateTimePicker
                  value={datePickerValue}
                  mode="date"
                  display="inline"
                  onChange={(event, selectedDate) => {
                    if (selectedDate) {
                      setDatePickerValue(selectedDate);
                    }
                  }}
                />
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                  <Pressable
                    onPress={() => setShowDatePicker({ type: null })}
                    style={{
                      flex: 1,
                      backgroundColor: '#6b7280',
                      padding: 12,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      // Use local timezone, not UTC to avoid date shift
                      const dateValue = formatDateLocal(datePickerValue);
                      if (showDatePicker.type === 'checkIn') {
                        updateHotelField('checkIn', dateValue);
                      } else if (showDatePicker.type === 'checkOut') {
                        updateHotelField('checkOut', dateValue);
                      } else if (showDatePicker.type === 'flight' && showDatePicker.flightIndex !== undefined) {
                        updateFlight(showDatePicker.flightIndex, 'date', dateValue);
                      }
                      setShowDatePicker({ type: null });
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: '#2563eb',
                      padding: 12,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '600' }}>
                      OK
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}
