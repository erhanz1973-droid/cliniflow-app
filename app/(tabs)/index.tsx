// app/home.tsx
// CLINIFLOW – PATIENT HOME (Home Screen)
// Spec: https://docs.google.com/document/d/...

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  ActivityIndicator,
  ScrollView,
  Linking,
  Alert,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

// Import expo-av for audio playback
import { Audio } from "expo-av";
import { useLanguage } from "../../lib/language-context";
import {
  type Language,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
} from "../../lib/i18n";

type PatientStatus =
  | "WAITING_APPROVAL"
  | "NEED_INFO"
  | "PLAN_READY"
  | "TRAVEL_PLANNED"
  | "IN_TREATMENT"
  | "COMPLETED"
  | "PENDING"
  | "APPROVED"
  | "ACTIVE";

type ClinicBranding = {
  clinicName: string;
  clinicLogoUrl: string;
  primaryColor?: string;
  secondaryColor?: string;
  welcomeMessage?: string;
  showPoweredBy?: boolean;
  googleMapLink?: string;
  address?: string;
  phone?: string;
};

type FinancialSnapshot = {
  totalEstimatedCost: number;
  totalPaid: number;
  remainingBalance: number;
};

type PatientInfo = {
  patientId: string;
  name: string;
  status: PatientStatus;
  clinicCode: string;
  clinicPlan: string;
  branding: ClinicBranding | null;
  financialSnapshot?: FinancialSnapshot;
};

type NextAction = {
  id: string;
  label: string;
  route: string;
  icon: string;
};

type UpcomingEvent = {
  type: "appointment" | "flight" | "transfer" | "hotel";
  title: string;
  date: number;
  details?: string;
};

type TreatmentSummary = {
  procedures: string[];
  estimatedDays?: number;
  allCompleted?: boolean;
};

type TravelSummary = {
  flightDate?: number;
  hotelName?: string;
  transferStatus?: string;
  updatedAt?: number;
};

type MessagePreview = {
  unreadCount: number;
  lastMessage?: string;
};

export default function Home() {
  const { user, isAuthReady, isDoctor, isPatient, signOut } = useAuth();
  const { t, setLanguage } = useLanguage();
  const [loading, setLoading] = useState(true);
  
  // Role-based redirect
  useEffect(() => {
    if (!isAuthReady) return;
    
    console.log('[HOME] Role check - user:', user);
    console.log('[HOME] Role check - isDoctor:', isDoctor, 'isPatient:', isPatient);
    console.log('[HOME] Role check - user.role:', user?.role);
    
    // Prevent infinite redirects
    if (user?.role === "DOCTOR") {
      console.log('[HOME] Doctor detected, redirecting to doctor-dashboard');
      router.replace('/doctor-dashboard');
      return;
    }
    
    // Only redirect to login if user has no token (not logged in)
    if (!user?.token) {
      console.log('[HOME] No token found, redirecting to login');
      router.replace('/login');
      return;
    }
    
    console.log('[HOME] Patient confirmed, loading patient home');
  }, [isAuthReady, user?.token, user?.role]);
  
  // Don't render patient home for doctors
  if (isDoctor) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yönlendiriliyor...</Text>
      </View>
    );
  }
  
  // Debug logs to track provider states
  console.log('[HOME] Render - isAuthReady:', isAuthReady, 'loading:', loading, 'user:', user ? 'exists' : 'null');
  console.log('[HOME] t typeof:', typeof t);
  
  // Track state changes
  useEffect(() => {
    console.log('[HOME] STATE CHANGE - isAuthReady:', isAuthReady, 'loading:', loading, 'user:', user ? 'exists' : 'null');
  }, [isAuthReady, loading, user]);
  
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [nextActions, setNextActions] = useState<NextAction[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [treatmentSummary, setTreatmentSummary] = useState<TreatmentSummary | null>(null);
  const [travelSummary, setTravelSummary] = useState<TravelSummary | null>(null);
  const [travelHasNew, setTravelHasNew] = useState(false);
  const [messagePreview, setMessagePreview] = useState<MessagePreview>({ unreadCount: 0 });
  const [healthFormComplete, setHealthFormComplete] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [currentLang, setCurrentLang] = useState<Language>("tr");
  const previousUnreadCountRef = useRef<number>(0);

  // Helper function to get progress steps (moved inside component to access t)
  const getProgressSteps = (t: (key: string, params?: Record<string, string | number>) => string) => {
    // Travel progress: count how many travel items exist (flight, hotel, transfer)
    const hasFlight = !!travelSummary?.flightDate;
    const hasHotel = !!travelSummary?.hotelName;
    const hasTransfer = !!travelSummary?.transferStatus;
    const travelItemsCount = [hasFlight, hasHotel, hasTransfer].filter(Boolean).length;
    const travelInProgress = travelItemsCount > 0 && travelItemsCount < 3; // 1-2 items = in progress (yeşil)
    const travelCompleted = travelItemsCount >= 3; // All 3 items = completed (mavi checkmark)
    
    // Treatment: in progress if IN_TREATMENT or if there are any procedures (first treatment entered)
    // completed if COMPLETED status OR if all procedures are completed
    const hasProcedures = treatmentSummary && treatmentSummary.procedures.length > 0;
    const allProceduresCompleted = treatmentSummary?.allCompleted === true;
    const treatmentCompleted = patientInfo?.status === "COMPLETED" || allProceduresCompleted;
    const treatmentInProgress = patientInfo?.status === "IN_TREATMENT" || (hasProcedures && !treatmentCompleted);
    
    return [
      { id: "form", label: t("home.progressForm"), completed: healthFormComplete, inProgress: false },
      { id: "approval", label: t("home.progressApproval"), completed: patientInfo?.status !== "WAITING_APPROVAL" && patientInfo?.status !== "PENDING", inProgress: false },
      { id: "planning", label: t("home.progressPlanning"), completed: !!treatmentSummary, inProgress: false },
      { id: "travel", label: t("home.progressTravel"), completed: travelCompleted, inProgress: travelInProgress },
    ];
  };

  // Play notification sound and haptic feedback
  const playNotificationSound = useCallback(async () => {
    try {
      console.log("[HOME] Playing notification sound...");
      
      // Configure audio mode for playback
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true, // Play even when phone is in silent mode (iOS)
          staysActiveInBackground: true, // Keep audio active in background (for when screen is off)
          shouldDuckAndroid: true, // Duck other audio on Android
        });
        console.log("[HOME] Audio mode configured");
      } catch (audioModeError) {
        console.warn("[HOME] Could not set audio mode:", audioModeError);
      }
      
      // Haptic feedback (vibration on mobile)
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        console.log("[HOME] Haptic feedback played");
      } catch (hapticError) {
        console.warn("[HOME] Haptic feedback failed:", hapticError);
      }
      
      // Play notification sound file
      try {
        console.log("[HOME] Loading sound file from assets/audio/notification.mp3...");
        
        // Try to require the sound file
        let soundSource;
        try {
          soundSource = require('../assets/audio/notification.mp3');
        } catch (requireError) {
          // Sound file not found - continue with haptic feedback only
          console.log("[HOME] Sound file not available, using haptic feedback only");
          return; // Exit early if sound file is not available
        }
        
        const { sound } = await Audio.Sound.createAsync(
          soundSource,
          { 
            shouldPlay: true, 
            volume: 0.8,
            isLooping: false
          }
        );
        console.log("[HOME] Sound loaded, playing...");
        
        // Wait for sound to finish playing
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            console.log("[HOME] Sound finished and unloaded");
          }
        });
        
        await sound.playAsync();
        console.log("[HOME] Notification sound played successfully");
      } catch (soundError) {
        console.log("[HOME] Sound playback skipped (file may be missing)");
        // Don't throw - continue without sound if file is missing
      }
      
      console.log("[HOME] Notification played (haptic + sound)");
    } catch (error) {
      console.error("[HOME] Could not play notification:", error);
    }
  }, []);

  useEffect(() => {
    console.log('[HOME] useEffect - isAuthReady:', isAuthReady, 'user?.token:', !!user?.token);
    if (!isAuthReady || !user?.token) {
      console.log('[HOME] Guard failed - setting loading to false');
      setLoading(false);
      return;
    }
    console.log('[HOME] Guard passed - loading home data');
    loadHomeData();
  }, [isAuthReady, user?.token]);

  // Reload health form status when screen comes into focus (e.g., returning from health form)
  useFocusEffect(
    useCallback(() => {
      if (isAuthReady && user?.token && patientInfo?.patientId) {
        // Reload health form status
        loadHealthForm(patientInfo.patientId, user.token);
        // Reload travel summary (e.g., returning from Travel)
        loadTravelSummary(patientInfo.patientId, user.token);
        // Reload message preview
        loadMessagePreview(patientInfo.patientId, user.token);
      }
    }, [isAuthReady, user?.token, patientInfo?.patientId])
  );

  // Periodically check for new messages (every 30 seconds)
  useEffect(() => {
    if (!isAuthReady || !user?.token || !patientInfo?.patientId) return;

    // Load immediately
    loadMessagePreview(patientInfo.patientId, user.token);

    // Then check every 30 seconds
    const intervalId = setInterval(() => {
      if (user?.token && patientInfo?.patientId) {
        loadMessagePreview(patientInfo.patientId, user.token);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(intervalId);
  }, [isAuthReady, user?.token, patientInfo?.patientId]);

  const loadHomeData = async (showRefreshing = false) => {
    console.log('[HOME] loadHomeData started');
    
    // Emergency timeout - force loading to complete after 15 seconds
    const emergencyTimeout = setTimeout(() => {
      console.log('[HOME] EMERGENCY: Forcing loading to complete after 15 seconds');
      setLoading(false);
      setRefreshing(false);
    }, 15000);
    
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      
      const token = user?.token;
      if (!token) {
        console.log('[HOME] No token found - setting loading to false');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      console.log('[HOME] Loading patient info...');
      // Load patient info with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const meRes = await fetch(`${API_BASE}/api/patient/me`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);

      console.log('[HOME] Patient info response status:', meRes.status);

      if (!meRes.ok) {
        console.log('[HOME] Patient info response not ok - setting loading to false');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const meData = await meRes.json();
      console.log('[HOME] Patient info data received:', meData.ok ? 'success' : 'failed');
      
      if (!meData.ok) {
        console.log('[HOME] Patient info data not ok - setting loading to false');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const patientId = meData.patientId;
      const status = mapStatus(meData.status);

      setPatientInfo({
        patientId,
        name: meData.name || "",
        status,
        clinicCode: meData.clinicCode || "",
        clinicPlan: meData.clinicPlan || "FREE",
        branding: meData.branding ? {
          clinicName: meData.branding.clinicName || "",
          clinicLogoUrl: meData.branding.clinicLogoUrl || "",
          primaryColor: meData.branding.primaryColor,
          secondaryColor: meData.branding.secondaryColor,
          welcomeMessage: meData.branding.welcomeMessage,
          showPoweredBy: meData.branding.showPoweredBy !== false,
          googleMapLink: meData.branding.googleMapLink,
          address: meData.branding.address,
          phone: meData.branding.phone,
        } : null,
        financialSnapshot: meData.financialSnapshot || {
          totalEstimatedCost: 0,
          totalPaid: 0,
          remainingBalance: 0,
        },
      });

      // Load all data in parallel
      await Promise.all([
        loadHealthForm(patientId, token),
        loadTreatmentSummary(patientId, token),
        loadTravelSummary(patientId, token),
        loadMessagePreview(patientId, token),
      ]);
    } catch (error) {
      console.error("[HOME] Load error:", error);
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[HOME] Request timed out after 10 seconds');
      }
    } finally {
      clearTimeout(emergencyTimeout);
      console.log('[HOME] loadHomeData completed - setting loading to false');
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = useCallback(() => {
    if (user?.token && patientInfo?.patientId) {
      loadHomeData(true);
    }
  }, [user?.token, patientInfo?.patientId]);

  const loadHealthForm = async (patientId: string, token: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/patient/${patientId}/health`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Check both isComplete and formCompleted fields (backend might use either)
        const isComplete = data.isComplete || data.formCompleted || false;
        setHealthFormComplete(isComplete);
        console.log("[HOME] Health form status:", { isComplete, dataIsComplete: data.isComplete, dataFormCompleted: data.formCompleted });
      }
    } catch (error) {
      // Silently fail
    }
  };

  const loadTreatmentSummary = async (patientId: string, token: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/patient/${patientId}/treatments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.teeth && Array.isArray(data.teeth)) {
          const procedures: string[] = [];
          let totalProcedures = 0;
          let completedProcedures = 0;
          
          data.teeth.forEach((tooth: any) => {
            if (tooth.procedures && Array.isArray(tooth.procedures)) {
              tooth.procedures.forEach((proc: any) => {
                if (proc.type && !procedures.includes(proc.type)) {
                  procedures.push(proc.type);
                }
                totalProcedures++;
                // Check if procedure is completed (status === "COMPLETED")
                if (proc.status === "COMPLETED") {
                  completedProcedures++;
                }
              });
            }
          });
          
          // All procedures are completed if total > 0 and all are completed
          const allCompleted = totalProcedures > 0 && completedProcedures === totalProcedures;
          
          setTreatmentSummary({ procedures, allCompleted });
        }
      }
    } catch (error) {
      // Silently fail
    }
  };

  const loadTravelSummary = async (patientId: string, token: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/patient/${patientId}/travel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Backend direkt olarak travel data döndürüyor (travelData wrapper'ı yok)
        const travelData = data;
        const updatedAt = Number(travelData?.updatedAt || 0) || undefined;
        
        // Flight date: flights array'inden ilk flight'ın tarihini al (ARRIVAL veya DEPARTURE)
        let flightDate: number | undefined;
        if (Array.isArray(travelData.flights) && travelData.flights.length > 0) {
          // Önce ARRIVAL flight'ını bul, yoksa ilk flight'ı al
          const arrivalFlight = travelData.flights.find((f: any) => f.type === "ARRIVAL");
          const firstFlight = arrivalFlight || travelData.flights[0];
          // flight.date veya flight.departureDate veya flight.f_date olabilir
          const dateStr = firstFlight.date || firstFlight.departureDate || firstFlight.f_date || firstFlight.departure_date;
          if (dateStr) {
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              flightDate = date.getTime();
            }
          }
        }
        
        // Hotel name: hotel object'inden name al
        const hotelName = travelData.hotel?.name || undefined;
        
        // Transfer status: airportPickup varsa "Confirmed"
        // airportPickup null değilse ve boş object değilse "Confirmed"
        // airportPickup object'inin içinde en az bir dolu field olmalı
        let transferStatus: string | undefined = undefined;
        if (travelData.airportPickup && typeof travelData.airportPickup === 'object') {
          const pickup = travelData.airportPickup;
          // En az bir field dolu mu kontrol et (phone, whatsApp, name, gate, carBrand, carColor, carPlate, notes)
          const hasAnyField = !!(pickup.name || pickup.phone || pickup.whatsApp || pickup.gate || 
            pickup.carBrand || pickup.carColor || pickup.carPlate || pickup.notes || pickup.vehicle);
          if (hasAnyField) {
            transferStatus = t("home.transferConfirmed");
          }
        }
        
        console.log("[HOME] Travel summary loaded:", {
          hasFlight: !!flightDate,
          hasHotel: !!hotelName,
          hasTransfer: !!transferStatus,
          flightsCount: Array.isArray(travelData.flights) ? travelData.flights.length : 0,
          travelData: JSON.stringify(travelData, null, 2),
          firstFlight: Array.isArray(travelData.flights) && travelData.flights.length > 0 ? travelData.flights[0] : null,
          hotel: travelData.hotel,
          airportPickup: travelData.airportPickup,
        });
        
        setTravelSummary({
          flightDate,
          hotelName,
          transferStatus,
          updatedAt,
        });

        // Badge: show only if travel updated after last time user opened Travel screen
        try {
          const lastSeenRaw = await AsyncStorage.getItem(`travel_last_seen_${patientId}`);
          const lastSeen = Number(lastSeenRaw || "0");
          const isNew = !!updatedAt && updatedAt > (Number.isFinite(lastSeen) ? lastSeen : 0);
          setTravelHasNew(isNew);
        } catch {
          setTravelHasNew(false);
        }
      }
    } catch (error) {
      console.error("[HOME] Travel summary load error:", error);
      // Silently fail
    }
  };

  const loadMessagePreview = async (patientId: string, token: string) => {
    try {
      console.log("[HOME] Loading message preview for patient:", patientId);
      const res = await fetch(`${API_BASE}/api/patient/${patientId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log("[HOME] Messages API response:", { ok: data.ok, hasMessages: !!data.messages, hasItems: !!data.items });
        
        // API returns { ok: true, messages: [...] } format
        const messages = Array.isArray(data.messages) ? data.messages : (Array.isArray(data.items) ? data.items : []);
        console.log("[HOME] Total messages:", messages.length);
        
        // Get last seen timestamp from storage
        let lastSeenTimestamp = 0;
        try {
          const lastSeen = await AsyncStorage.getItem(`chat_last_seen_${patientId}`);
          if (lastSeen) {
            lastSeenTimestamp = parseInt(lastSeen, 10) || 0;
          }
          console.log("[HOME] Last seen timestamp:", lastSeenTimestamp);
        } catch {}
        
        // Count unread messages (from ADMIN/clinic, not from patient, after last seen)
        // Note: Admin messages have from: "CLINIC" or from !== "PATIENT"
        const unreadCount = messages.filter((m: any) => {
          // Message is from admin/clinic (not from patient)
          if (m.from === "PATIENT") {
            // Skip patient's own messages (they don't count as unread)
            return false;
          }
          
          // If lastSeenTimestamp is 0, it means user never opened chat, so all CLINIC messages are unread
          // Otherwise, check if message is newer than last seen
          const msgTime = m.createdAt || 0;
          const isUnread = lastSeenTimestamp === 0 || msgTime > lastSeenTimestamp;
          
          return isUnread;
        }).length;
        
        console.log("[HOME] Unread count:", unreadCount);
        console.log("[HOME] Message preview state will be updated with:", { unreadCount, totalMessages: messages.length });
        
        // Check if new messages arrived (unread count increased)
        const previousUnread = previousUnreadCountRef.current;
        if (unreadCount > previousUnread && previousUnread > 0) {
          // New messages arrived - play sound
          playNotificationSound();
        }
        previousUnreadCountRef.current = unreadCount;
        
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const previewData = {
          unreadCount,
          lastMessage: lastMessage?.text?.substring(0, 50),
        };
        console.log("[HOME] Setting message preview:", previewData);
        setMessagePreview(previewData);
        console.log("[HOME] Message preview updated");
      } else {
        const text = await res.text().catch(() => "");
        console.error("[HOME] Messages API error:", res.status, text.slice(0, 300) || res.statusText);
      }
    } catch (error) {
      console.error("[HOME] Load message preview error:", error);
    }
  };

  const mapStatus = (status: string): PatientStatus => {
    const upper = status.toUpperCase();
    if (upper === "PENDING") return "WAITING_APPROVAL";
    if (upper === "ACTIVE") return "APPROVED"; // Add ACTIVE status mapping
    if (upper === "APPROVED") {
      // Status will be determined after loading all data
      return "APPROVED";
    }
    return upper as PatientStatus;
  };

  // Update status and generate actions after all data is loaded
  useEffect(() => {
    if (!patientInfo || loading) return;
    
    let currentStatus = patientInfo.status;
    let newStatus: PatientStatus = currentStatus;
    
    if (currentStatus === "APPROVED" || currentStatus === "WAITING_APPROVAL" || currentStatus === "ACTIVE") {
      if (!healthFormComplete) {
        newStatus = "NEED_INFO";
      } else if (treatmentSummary && treatmentSummary.procedures.length > 0) {
        if (travelSummary?.flightDate) {
          newStatus = "TRAVEL_PLANNED";
        } else {
          newStatus = "PLAN_READY";
        }
      }
    }
    
    // Update status if changed
    if (newStatus !== currentStatus) {
      setPatientInfo((prev) => prev ? { ...prev, status: newStatus } : null);
    }

    // Generate next actions based on current status and data
    const actions = generateNextActions(newStatus, healthFormComplete, treatmentSummary, travelSummary);
    
    // Remove duplicates by id to prevent duplicate key errors
    const uniqueActions = Array.from(
      new Map(actions.map(action => [action.id, action])).values()
    );
    
    setNextActions(uniqueActions);

    // Generate upcoming events
    const events = generateUpcomingEvents(travelSummary, treatmentSummary);
    setUpcomingEvents(events);
  }, [patientInfo?.status, healthFormComplete, treatmentSummary, travelSummary, loading, patientInfo?.patientId]);

  const generateNextActions = (
    status: PatientStatus,
    healthComplete: boolean,
    treatment: TreatmentSummary | null,
    travel: TravelSummary | null
  ): NextAction[] => {
    const actions: NextAction[] = [];

    if (status === "WAITING_APPROVAL" || status === "PENDING") {
      // No actions needed, just wait
      return actions;
    }

    // Priority order: Check what's missing and add the next action
    if (!healthComplete) {
      actions.push({
        id: "health-form",
        label: t("home.actionCompleteForm"),
        route: "/health",
        icon: "medical",
      });
      return actions; // Return early, this is the most important
    }

    // Health form is complete, check for treatment plan
    if (!treatment || !treatment.procedures || treatment.procedures.length === 0) {
      // Treatment plan not ready yet - wait for admin
      return actions;
    }

    // Treatment plan exists, check travel information
    const hasFlight = !!travel?.flightDate;
    const hasHotel = !!travel?.hotelName;
    const hasTransfer = !!travel?.transferStatus;
    const travelItemsCount = [hasFlight, hasHotel, hasTransfer].filter(Boolean).length;

    if (travelItemsCount === 0) {
      actions.push({
        id: "travel-info",
        label: t("home.actionCompleteTravel"),
        route: "/travel",
        icon: "airplane-outline",
      });
    } else if (travelItemsCount < 3) {
      actions.push({
        id: "travel-info",
        label: t("home.actionCompleteTravelDetails"),
        route: "/travel",
        icon: "airplane-outline",
      });
    }

    // If everything is complete, no actions needed
    return actions;
  };

  const generateUpcomingEvents = (
    travel: TravelSummary | null,
    treatment: TreatmentSummary | null
  ): UpcomingEvent[] => {
    const events: UpcomingEvent[] = [];

    if (travel?.flightDate) {
      events.push({
        type: "flight",
        title: t("home.eventFlight"),
        date: travel.flightDate,
        details: t("home.eventFlightDetails"),
      });
    }

    // Add more events based on treatment schedule, appointments, etc.

    return events.sort((a, b) => a.date - b.date);
  };

  const getStatusInfo = (status: PatientStatus) => {
    const statusMap: Record<PatientStatus, { label: string; message: string; color: string }> = {
      WAITING_APPROVAL: {
        label: t("home.statusUnderReview"),
        message: t("home.statusUnderReviewMessage"),
        color: "#F59E0B",
      },
      NEED_INFO: {
        label: t("home.statusNeedInfo"),
        message: t("home.statusNeedInfoMessage"),
        color: "#EF4444",
      },
      PLAN_READY: {
        label: t("home.statusPlanReady"),
        message: t("home.statusPlanReadyMessage"),
        color: "#3B82F6",
      },
      TRAVEL_PLANNED: {
        label: t("home.statusTravelPlanned"),
        message: t("home.statusTravelPlannedMessage"),
        color: "#8B5CF6",
      },
      IN_TREATMENT: {
        label: t("home.statusInTreatment"),
        message: t("home.statusInTreatmentMessage"),
        color: "#06B6D4",
      },
      COMPLETED: {
        label: t("home.statusCompleted"),
        message: t("home.statusCompletedMessage"),
        color: "#10B981",
      },
      PENDING: {
        label: t("home.statusPending"),
        message: t("home.statusPendingMessage"),
        color: "#F59E0B",
      },
      APPROVED: {
        label: t("home.statusApproved"),
        message: t("home.statusApprovedMessage"),
        color: "#10B981",
      },
      ACTIVE: {
        label: t("home.statusApproved"),
        message: t("home.statusApprovedMessage"),
        color: "#10B981",
      },
    };
    return statusMap[status] || statusMap.PENDING;
  };

  const statusInfo = patientInfo ? getStatusInfo(patientInfo.status) : null;
  const progressSteps = getProgressSteps(t);
  const primaryColor = patientInfo?.branding?.primaryColor || "#2563EB";
  const secondaryColor = patientInfo?.branding?.secondaryColor || "#10B981";
  const isPro = patientInfo?.clinicPlan === "PRO";
  
  // Debug logging for branding
  useEffect(() => {
    if (patientInfo) {
      console.log("[HOME] Debug branding:", {
        isPro,
        clinicPlan: patientInfo.clinicPlan,
        hasBranding: !!patientInfo.branding,
        clinicLogoUrl: patientInfo.branding?.clinicLogoUrl,
        clinicName: patientInfo.branding?.clinicName,
      });
    }
  }, [patientInfo, isPro]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={primaryColor} style={styles.loader} />
        <Text style={styles.loadingText}>{t("home.loading")}</Text>
      </View>
    );
  }

  if (!patientInfo) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{t("home.error")}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      {/* 1. Header (Branding) */}
      <View style={[styles.header, { backgroundColor: isPro ? "#FFFFFF" : "#F9FAFB" }]}>
        <View style={styles.headerContent}>
          {isPro && patientInfo.branding ? (
            <>
              {/* PRO Plan: Show logo, name, and all branding info */}
              {patientInfo.branding.clinicLogoUrl && patientInfo.branding.clinicLogoUrl.trim() !== "" && (
                <Image
                  source={{ uri: patientInfo.branding.clinicLogoUrl }}
                  style={styles.clinicLogo}
                  resizeMode="contain"
                  onError={(error) => {
                    console.error("[HOME] Logo image load error:", error);
                  }}
                  onLoad={() => {
                    console.log("[HOME] Logo image loaded successfully");
                  }}
                />
              )}
              <Text style={[styles.clinicName, { color: primaryColor }]}>
                {patientInfo.branding?.clinicName || patientInfo.clinicCode}
              </Text>
              {patientInfo.branding?.welcomeMessage && (
                <Text style={styles.welcomeMessage}>{patientInfo.branding.welcomeMessage}</Text>
              )}
              
              {/* Address */}
              {patientInfo.branding?.address && (
                <View style={styles.clinicInfoRow}>
                  <Ionicons name="location-outline" size={16} color="#6B7280" />
                  <Text style={styles.clinicInfoText}>{patientInfo.branding.address}</Text>
                </View>
              )}
              
              {/* Phone */}
              {patientInfo.branding?.phone && (
                <View style={styles.clinicInfoRow}>
                  <Ionicons name="call-outline" size={16} color="#6B7280" />
                  <Pressable
                    onPress={() => {
                      Linking.openURL(`tel:${patientInfo.branding?.phone}`);
                    }}
                  >
                    <Text style={[styles.clinicInfoText, styles.clinicPhoneLink]}>
                      {patientInfo.branding.phone}
                    </Text>
                  </Pressable>
                </View>
              )}
              
              {/* Google Maps Link - Only for PRO */}
              {patientInfo.branding?.googleMapLink && (
                <Pressable
                  onPress={() => {
                    console.log("[HOME] Opening Google Maps link:", patientInfo.branding?.googleMapLink);
                    Linking.openURL(patientInfo.branding?.googleMapLink!);
                  }}
                  style={[styles.mapLinkButton, { borderColor: primaryColor, marginTop: 8 }]}
                >
                  <Ionicons name="map-outline" size={16} color={primaryColor} />
                  <Text style={[styles.mapLinkText, { color: primaryColor }]}>
                    {t("home.viewOnMap")}
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              {/* Non-PRO: Show only clinic name (no logo, no Google Maps) */}
              <Text style={styles.defaultClinicName}>
                {patientInfo.branding?.clinicName || patientInfo.clinicCode}
              </Text>
              {(!isPro || (patientInfo.branding && patientInfo.branding.showPoweredBy !== false)) && (
                <Text style={styles.poweredBy}>{t("home.poweredBy")}</Text>
              )}
            </>
          )}
        </View>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            style={[styles.refreshButton, { borderColor: primaryColor }]}
          >
            <Ionicons 
              name={refreshing ? "refresh" : "refresh-outline"} 
              size={20} 
              color={refreshing ? "#9CA3AF" : primaryColor}
              style={refreshing ? styles.refreshIconSpinning : undefined}
            />
          </Pressable>
          
          {/* Language Picker */}
          <Pressable
            onPress={() => {
              try {
                const languages = SUPPORTED_LANGUAGES || ["tr", "en", "ka"];
                const languageOptions = languages.map((lang) => ({
                  text: (LANGUAGE_NAMES && LANGUAGE_NAMES[lang]) || (lang === "tr" ? "Türkçe" : lang === "en" ? "English" : "ქართული"),
                  onPress: async () => {
                    try {
                      await setLanguage(lang);
                      Alert.alert(t("settings.languageChangedSuccess"), t("settings.languageChangedMessage"));
                      // Force app refresh to apply language change
                      setTimeout(() => {
                        router.replace('/home');
                      }, 500);
                    } catch (error) {
                      console.error("[HOME] Language change error:", error);
                      Alert.alert(t("common.error"), t("settings.languageChangeFailed"));
                    }
                  },
                }));
                
                Alert.alert(
                  t("settings.languagePickerTitle"),
                  "",
                  [
                    { text: t("common.cancel"), style: "cancel" },
                    ...languageOptions,
                  ]
                );
              } catch (error) {
                console.error("[HOME] Language picker error:", error);
                Alert.alert(t("common.error"), t("settings.languagePickerFailed"));
              }
            }}
            style={[styles.languageButton, { borderColor: primaryColor }]}
          >
            <Ionicons name="language-outline" size={20} color={primaryColor} />
          </Pressable>
          
          <Pressable
            onPress={async () => {
              await signOut();
              setTimeout(() => {
                router.replace("/login");
              }, 100);
            }}
            style={[styles.logoutButton, { borderColor: "#DC2626" }]}
          >
            <Ionicons name="log-out-outline" size={18} color="#DC2626" />
          </Pressable>
        </View>
      </View>

      {/* 2. Status Card */}
      {statusInfo && (
        <View style={[styles.statusCard, { borderLeftColor: statusInfo.color }]}>
          <Text style={[styles.statusLabel, { color: statusInfo.color }]}>
            {statusInfo.label}
          </Text>
          {patientInfo.name && (
            <Text style={styles.statusPatientName}>{patientInfo.name}</Text>
          )}
          <Text style={styles.statusMessage}>{statusInfo.message}</Text>
        </View>
      )}

      {/* 3. Progress Stepper */}
      <View style={styles.progressContainer}>
        {progressSteps.map((step, index) => {
          const prevStep = index > 0 ? progressSteps[index - 1] : null;
          const isLineCompleted = prevStep?.completed || false;
          
          return (
            <React.Fragment key={step.id}>
              {index > 0 && (
                <View
                  style={[
                    styles.progressStepLine,
                    isLineCompleted && { backgroundColor: primaryColor },
                    !isLineCompleted && { backgroundColor: "#E5E7EB" },
                  ]}
                />
              )}
              <View style={styles.progressStepContainer}>
                <View
                  style={[
                    styles.progressStepCircle,
                    step.completed && { backgroundColor: primaryColor },
                    step.inProgress && { backgroundColor: secondaryColor },
                    !step.completed && !step.inProgress && { backgroundColor: "#E5E7EB" },
                  ]}
                >
                  {step.completed && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
                  {step.inProgress && !step.completed && (
                    <View style={styles.progressStepDotInner} />
                  )}
                </View>
                <Text
                  style={[
                    styles.progressStepLabel,
                    step.completed && { color: primaryColor, fontWeight: "600" },
                    step.inProgress && { color: secondaryColor, fontWeight: "600" },
                  ]}
                >
                  {step.label}
                </Text>
              </View>
            </React.Fragment>
          );
        })}
      </View>

      {/* 4. Financial Snapshot */}
      {patientInfo.financialSnapshot && (
        patientInfo.financialSnapshot.totalEstimatedCost > 0 ||
        patientInfo.financialSnapshot.totalPaid > 0 ||
        patientInfo.financialSnapshot.remainingBalance > 0
      ) ? (
        <View style={styles.financialCard}>
          <Text style={styles.financialTitle}>{t("home.financialSummary")}</Text>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{t("home.estimatedTotal")}:</Text>
            <Text style={styles.financialValue}>
              {patientInfo.financialSnapshot.totalEstimatedCost.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} €
            </Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{t("home.totalPaid")}:</Text>
            <Text style={[styles.financialValue, { color: secondaryColor }]}>
              {patientInfo.financialSnapshot.totalPaid.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} €
            </Text>
          </View>
          <View style={styles.financialRow}>
            <Text style={styles.financialLabel}>{t("home.remaining")}:</Text>
            <Text style={[styles.financialValue, { color: patientInfo.financialSnapshot.remainingBalance > 0 ? "#EF4444" : secondaryColor }]}>
              {patientInfo.financialSnapshot.remainingBalance.toLocaleString('tr-TR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} €
            </Text>
          </View>
          <Text style={styles.financialNote}>*{t("home.financialNote")}</Text>
        </View>
      ) : null}

      {/* 5. Next Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("home.nextActions")}</Text>
        {nextActions.length > 0 ? (
          nextActions.map((action, index) => (
            <Pressable
              key={`${action.id}-${index}`}
              style={[styles.actionButton, { borderColor: primaryColor }]}
              onPress={() => router.push(action.route)}
            >
              <Ionicons name={action.icon as any} size={20} color={primaryColor} />
              <Text style={[styles.actionButtonText, { color: primaryColor }]}>
                {action.label}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </Pressable>
          ))
        ) : (
          <View style={styles.noActionsCard}>
            <Text style={styles.noActionsText}>{t("home.noActions")}</Text>
          </View>
        )}
      </View>

      {/* 6. Upcoming */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("home.upcoming")}</Text>
        {upcomingEvents.length > 0 ? (
          upcomingEvents.map((event, index) => (
            <View key={index} style={styles.upcomingCard}>
              <Text style={styles.upcomingTitle}>{event.title}</Text>
              <Text style={styles.upcomingDate}>
                {new Date(event.date).toLocaleDateString()}
        </Text>
              {event.details && <Text style={styles.upcomingDetails}>{event.details}</Text>}
            </View>
          ))
        ) : (
          <View style={styles.noActionsCard}>
            <Text style={styles.noActionsText}>{t("home.noEvents")}</Text>
          </View>
        )}
      </View>

      {/* 7. Mini Summaries */}
      {/* 6a. Treatment Summary */}
      {treatmentSummary && treatmentSummary.procedures.length > 0 && (
      <Pressable
          style={styles.summaryCard}
          onPress={() => router.push(`/treatments?patientId=${patientInfo.patientId}`)}
        >
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>{t("home.treatmentPlan")}</Text>
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </View>
          <Text style={styles.summaryText}>
            {treatmentSummary.procedures.slice(0, 3).join(", ")}
            {treatmentSummary.procedures.length > 3 && "..."}
          </Text>
          {treatmentSummary.estimatedDays && (
            <Text style={styles.summarySubtext}>
              {t("home.estimatedDays", { days: treatmentSummary.estimatedDays })}
            </Text>
          )}
      </Pressable>
      )}

      {/* 6b. Travel Summary */}
      {travelSummary && (travelSummary.flightDate || travelSummary.hotelName) && (
      <Pressable
          style={styles.summaryCard}
          onPress={async () => {
            try {
              const ts = travelSummary.updatedAt || Date.now();
              await AsyncStorage.setItem(`travel_last_seen_${patientInfo.patientId}`, String(ts));
            } catch {}
            setTravelHasNew(false);
            router.push(`/travel?patientId=${patientInfo.patientId}`);
          }}
        >
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>{t("home.travel")}</Text>
            {travelHasNew && (
              <View style={[styles.badge, { backgroundColor: "#EF4444" }]}>
                <Text style={styles.badgeText}>!</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
          </View>
          {travelSummary.flightDate && (
            <Text style={styles.summaryText}>
              {t("home.flightLabel")}: {new Date(travelSummary.flightDate).toLocaleDateString()}
            </Text>
          )}
          {travelSummary.hotelName && (
            <Text style={styles.summaryText}>{t("home.hotelLabel")}: {travelSummary.hotelName}</Text>
          )}
          {travelSummary.transferStatus && (
            <Text style={styles.summarySubtext}>{t("home.transferLabel")}: {travelSummary.transferStatus}</Text>
          )}
      </Pressable>
      )}

      {/* 8. Messages */}
      <Pressable
        style={styles.messageCard}
        onPress={() => router.push(`/chat?patientId=${patientInfo.patientId}`)}
      >
        <View style={styles.messageHeader}>
          <Ionicons name="chatbubbles" size={24} color={primaryColor} />
          <Text style={styles.messageTitle}>{t("home.messageClinic")}</Text>
          {messagePreview.unreadCount > 0 ? (
            <View style={[styles.badge, { backgroundColor: "#EF4444", marginLeft: 8 }]}>
              <Text style={styles.badgeText}>
                {messagePreview.unreadCount > 99 ? "99+" : String(messagePreview.unreadCount)}
              </Text>
            </View>
          ) : null}
          {/* Debug: Show unread count in dev mode */}
          {__DEV__ && (
            <Text style={{ fontSize: 10, color: "#9CA3AF", marginLeft: 4 }}>
              (unread: {messagePreview.unreadCount})
            </Text>
          )}
        </View>
        {messagePreview.lastMessage && (
          <Text style={styles.messagePreview} numberOfLines={1}>
            {messagePreview.lastMessage}
          </Text>
        )}
      </Pressable>

      {/* 9. Trust / Contact block (PRO feature) */}
      {isPro && (
        <View style={styles.contactCard}>
          <Text style={styles.contactTitle}>{t("home.needHelp")}</Text>
          <Text style={styles.contactText}>
            {t("home.contactClinic")}
          </Text>
          {/* Contact details can be added here from clinic settings */}
    </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F9FAFB",
    paddingBottom: 20,
  },
  loader: {
    marginTop: 100,
  },
  loadingText: {
    marginTop: 16,
    textAlign: "center",
    color: "#6B7280",
    fontSize: 16,
  },
  errorText: {
    textAlign: "center",
    color: "#EF4444",
    fontSize: 16,
    marginTop: 100,
  },
  header: {
    padding: 24,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    justifyContent: "space-between",
    position: "relative",
  },
  headerContent: {
    flex: 1,
    alignItems: "center",
  },
  headerActions: {
    position: "absolute",
    top: 24,
    right: 24,
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  languageButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  logoutButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  refreshIconSpinning: {
    transform: [{ rotate: "180deg" }],
  },
  mapLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  mapLinkText: {
    fontSize: 13,
    fontWeight: "600",
  },
  clinicInfoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 6,
    maxWidth: "90%",
  },
  clinicInfoText: {
    fontSize: 13,
    color: "#6B7280",
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  clinicPhoneLink: {
    color: "#2563EB",
    textDecorationLine: "underline",
  },
  clinicLogo: {
    width: 120,
    height: 120,
    marginBottom: 12,
    borderRadius: 8,
  },
  clinicName: {
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 8,
  },
  welcomeMessage: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginTop: 8,
  },
  defaultClinicName: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  poweredBy: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  statusCard: {
    backgroundColor: "#FFFFFF",
    margin: 20,
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statusLabel: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  statusPatientName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
    marginTop: 4,
  },
  statusMessage: {
    fontSize: 14,
    color: "#6B7280",
  },
  progressContainer: {
    flexDirection: "row",
    paddingLeft: 4,
    paddingRight: 4,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  progressStepContainer: {
    flex: 1,
    alignItems: "center",
    minWidth: 60,
    paddingHorizontal: 2,
  },
  progressStepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 4,
  },
  progressStepDotInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
  },
  progressStepLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 4,
    marginBottom: 20,
  },
  progressStepLabel: {
    fontSize: 9,
    color: "#9CA3AF",
    textAlign: "center",
    marginTop: 4,
    flexWrap: "nowrap",
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  actionButtonText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: "600",
  },
  noActionsCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 12,
    alignItems: "center",
  },
  noActionsText: {
    color: "#9CA3AF",
    fontSize: 14,
  },
  upcomingCard: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  upcomingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  upcomingDate: {
    fontSize: 14,
    color: "#6B7280",
  },
  upcomingDetails: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  summaryText: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  summarySubtext: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  messageCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  messageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  messageTitle: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  messagePreview: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 4,
  },
  contactCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
  },
  contactTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  contactText: {
    fontSize: 14,
    color: "#6B7280",
  },
  financialCard: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 20,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: "#2563EB",
  },
  financialTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 16,
  },
  financialRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  financialLabel: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "600",
  },
  financialValue: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "700",
  },
  financialNote: {
    fontSize: 11,
    color: "#9CA3AF",
    marginTop: 8,
    fontStyle: "italic",
  },
});
