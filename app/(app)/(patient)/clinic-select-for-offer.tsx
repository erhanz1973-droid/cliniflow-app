import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Image,
  BackHandler,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  type KeyboardEvent,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../../lib/auth";
import { API_BASE } from "../../../lib/api";
import { useLanguage } from "../../../lib/language-context";
import {
  loadPendingAiOfferForClinicSelect,
  clearPendingAiOfferForClinicSelect,
  sendOfferRequest,
  goToOffers,
  type SendOfferRequestResult,
} from "../../../lib/offerRequestFlow";
import {
  buildSmileQuoteClinicMessageFromAnalysis,
  isSmileScoreQuoteAnalysis,
} from "../../../lib/smileQuoteRequest";
import { leaveToPatientHome } from "../../../lib/safePatientNavigation";
import {
  extractDentalSearchTokens,
  filterClinicsByCityHint,
  rankClinicsForQuoteRequest,
  type QuoteClinicRow,
} from "../../../lib/quoteClinicFilter";
import { formatClinicCityLabel } from "../../../lib/clinicCityDisplay";
import { formatCountryDisplay, normalizeCountryCode } from "../../../lib/countryDisplay";

const MAX_CLINICS = 5;

/** Preferred country ISO-2 (same key as clinic-onboarding). */
const PREFERRED_DESTINATION_KEY = "@clinifly:preferredDestination";

async function readPreferredCountryIso2(): Promise<string> {
  try {
    const raw = (await AsyncStorage.getItem(PREFERRED_DESTINATION_KEY))?.trim() || "";
    if (!raw || raw === "nearby") return "";
    if (/^[A-Za-z]{2}$/.test(raw)) {
      const iso = normalizeCountryCode(raw);
      return iso || raw.toUpperCase();
    }
  } catch {
    /* ignore */
  }
  return "";
}

type BrowseRow = QuoteClinicRow;

export default function ClinicSelectForOfferScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboardVerticalOffsetIos = insets.top + 8;
  const keyboardVerticalOffsetAndroid = (StatusBar.currentHeight ?? 0) + 8;
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { t } = useLanguage();
  const safeT = useCallback((key: string, fallback: string) => {
    const raw = t(key);
    return !raw || raw === key ? fallback : raw;
  }, [t]);
  const { user } = useAuth();
  const token = user?.token;
  const patientId = String(user?.patientId || "").trim();

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  /** Only your clinic (patient has clinic_id). */
  const [singleTarget, setSingleTarget] = useState<{ id: string; name: string } | null>(null);
  /** Ranked / capped list for marketplace patients. */
  const [poolClinics, setPoolClinics] = useState<BrowseRow[]>([]);
  const [cityRefine, setCityRefine] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [payload, setPayload] = useState<{ image: string; analysis: Record<string, unknown>; message?: string } | null>(
    null
  );
  const [filterHint, setFilterHint] = useState<string | null>(null);
  const isSmileQuote = isSmileScoreQuoteAnalysis(payload?.analysis);

  useEffect(() => {
    if (payload?.message?.trim()) {
      setMessage(payload.message.trim());
      return;
    }
    const built = buildSmileQuoteClinicMessageFromAnalysis(payload?.analysis);
    if (built) {
      setMessage(built);
      return;
    }
    setMessage(t("messages.defaultComposerText"));
  }, [payload, t]);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e: KeyboardEvent) => setKeyboardHeight(e.endCoordinates?.height ?? 0);
    const onHide = () => setKeyboardHeight(0);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      leaveToPatientHome(router);
      return true;
    });
    return () => sub.remove();
  }, [router]);

  const displayClinics = useMemo(
    () => filterClinicsByCityHint(poolClinics, cityRefine),
    [poolClinics, cityRefine]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await loadPendingAiOfferForClinicSelect();
      if (cancelled) return;
      if (!p?.image) {
        Alert.alert(t("common.error"), t("messages.connectionError") || "Missing data");
        leaveToPatientHome(router);
        return;
      }
      setPayload(p);
      if (!token) {
        setLoading(false);
        Alert.alert(t("chat.sessionError"), t("chat.sessionExpired"));
        leaveToPatientHome(router);
        return;
      }

      const clinicIdFromUser = String(user?.clinicId || "").trim();

      if (clinicIdFromUser) {
        try {
          const mr = await fetch(`${API_BASE}/api/patient/me/clinic`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          });
          const mc = (await mr.json().catch(() => null)) as {
            id?: string;
            name?: string;
          } | null;
          const id = clinicIdFromUser;
          const name =
            (mc?.name && String(mc.name).trim()) ||
            safeT("quoteRequest.yourClinicFallback", "Your clinic");
          if (!cancelled) {
            setSingleTarget({ id, name });
            setSelected(new Set([id]));
            setPoolClinics([]);
            setFilterHint(
              safeT(
                "quoteRequest.singleClinicHint",
                "Your request is sent only to your registered clinic."
              )
            );
          }
        } catch {
          if (!cancelled) {
            setSingleTarget({ id: clinicIdFromUser, name: safeT("quoteRequest.yourClinicFallback", "Your clinic") });
            setSelected(new Set([clinicIdFromUser]));
            setFilterHint(
              safeT(
                "quoteRequest.singleClinicHint",
                "Your request is sent only to your registered clinic."
              )
            );
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      try {
        const country = await readPreferredCountryIso2();
        const qs = new URLSearchParams();
        if (country) qs.set("country", country);
        qs.set("limit", country ? "120" : "55");
        const suffix = qs.toString() ? `?${qs.toString()}` : "";
        const res = await fetch(`${API_BASE}/api/patient/clinics${suffix}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; clinics?: any[] };
        const rows = Array.isArray(json.clinics) ? json.clinics : [];
        const mapped: BrowseRow[] = rows.map((c: any) => ({
          id: String(c.id),
          name: String(c.name || "Clinic"),
          city: c.city ?? null,
          rating: typeof c.rating === "number" ? c.rating : null,
          clinicCode: c.clinicCode ?? null,
        }));
        const tokens = extractDentalSearchTokens(p.analysis || {});
        const ranked = rankClinicsForQuoteRequest(mapped, tokens);
        if (!cancelled) {
          setPoolClinics(ranked);
          setSelected(new Set());
          const parts: string[] = [];
          if (country) {
            parts.push(
              safeT("quoteRequest.filterCountry", "Region: {code}").replace(
                "{code}",
                formatCountryDisplay(country)
              )
            );
          }
          if (tokens.length) {
            parts.push(
              safeT("quoteRequest.filterTreatment", "Matched care: {list}").replace(
                "{list}",
                tokens.join(", ")
              )
            );
          }
          parts.push(
            safeT("quoteRequest.filterCap", "Showing top {n} matches.").replace(
              "{n}",
              String(ranked.length)
            )
          );
          setFilterHint(parts.join(" · "));
        }
      } catch {
        if (!cancelled) {
          setPoolClinics([]);
          setFilterHint(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router, t, user?.clinicId]);

  const toggle = useCallback(
    (id: string) => {
      if (singleTarget) return;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else {
          if (next.size >= MAX_CLINICS) {
            Alert.alert(
              t("common.error"),
              t("messages.clinicSelectorHint")?.replace("{max}", String(MAX_CLINICS)) ||
                `En fazla ${MAX_CLINICS} klinik.`
            );
            return prev;
          }
          next.add(id);
        }
        return next;
      });
    },
    [t, singleTarget]
  );

  const onSubmit = useCallback(async () => {
    if (!token || !patientId) {
      Alert.alert(t("chat.sessionError"), t("chat.sessionExpired"));
      return;
    }
    if (!payload?.image) return;
    const img = String(payload.image || "").trim();
    if (!/^https?:\/\//i.test(img)) {
      Alert.alert(t("common.error"), t("quoteRequest.photoMustBeUploaded"));
      return;
    }
    const clinicIds = singleTarget ? [singleTarget.id] : [...selected];
    if (clinicIds.length === 0) {
      Alert.alert(t("common.error"), t("messages.selectAtLeastOneClinic") || "Select a clinic");
      return;
    }
    setSending(true);
    try {
      const result = await sendOfferRequest({
        token,
        clinicIds,
        image: img,
        photos: payload.photos?.length ? payload.photos : [img],
        analysis: payload.analysis,
        message: message.trim(),
      });
      if (!result.ok) {
        const failed = result as Extract<SendOfferRequestResult, { ok: false }>;
        Alert.alert(t("common.error"), failed.message || failed.error || t("messages.sendFailed"));
        return;
      }
      await clearPendingAiOfferForClinicSelect();
      goToOffers(router);
    } finally {
      setSending(false);
    }
  }, [token, patientId, payload, selected, message, router, t, singleTarget]);

  if (!payload && loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const paddingTop = Math.max(insets.top + 12, 20);

  return (
    <View style={[styles.outer, { paddingTop }]}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoid}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={
          Platform.OS === "ios" ? keyboardVerticalOffsetIos : keyboardVerticalOffsetAndroid
        }
        enabled
      >
        <ScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator
          contentContainerStyle={[
            styles.scrollInner,
            { paddingBottom: 24 + keyboardHeight },
          ]}
        >
          <Text style={styles.title}>
            {isSmileQuote ? t("smileQuote.selectClinicTitle") : t("quoteRequest.title")}
          </Text>
          <Text style={styles.sub}>
            {isSmileQuote
              ? t("smileQuote.selectClinicSub")
              : singleTarget
              ? safeT(
                  "quoteRequest.singleClinicSub",
                  "We will send this only to your clinic — no marketplace broadcast."
                )
              : t("messages.clinicSelectorHint")?.replace("{max}", String(MAX_CLINICS)) ||
                `En fazla ${MAX_CLINICS} klinik seçin.`}
          </Text>

          {filterHint ? <Text style={styles.hint}>{filterHint}</Text> : null}

          {payload?.image ? (
            <View style={styles.photoWrap}>
              <Text style={styles.photoLabel}>{t("quoteRequest.photoAttached")}</Text>
              <Image source={{ uri: payload.image }} style={styles.photoThumb} resizeMode="cover" />
            </View>
          ) : null}

          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} color="#2563eb" />
          ) : singleTarget ? (
            <View style={styles.singleCard}>
              <Text style={styles.singleLabel}>
                {safeT("quoteRequest.recipientClinic", "Recipient")}
              </Text>
              <Text style={styles.singleName}>{singleTarget.name}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.cityLabel}>
                {safeT("quoteRequest.cityRefineLabel", "Refine by city (optional)")}
              </Text>
              <TextInput
                style={styles.cityInput}
                value={cityRefine}
                onChangeText={setCityRefine}
                placeholder={safeT("quoteRequest.cityRefinePlaceholder", "e.g. Tbilisi, Kadıköy")}
                placeholderTextColor="#94a3b8"
              />
              {displayClinics.length === 0 ? (
                <Text style={styles.empty}>
                  {cityRefine.trim().length >= 2
                    ? safeT(
                        "quoteRequest.noClinicCity",
                        "No clinics match this city — try another spelling or clear the filter."
                      )
                    : t("messages.clinicSelectorEmpty")}
                </Text>
              ) : (
                displayClinics.map((item) => {
                  const on = selected.has(item.id);
                  const cityLbl = item.city ? formatClinicCityLabel(item.city, t) : null;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.row, on && styles.rowOn]}
                      onPress={() => toggle(item.id)}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.rowCheck}>{on ? "☑" : "☐"}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowName}>{item.name}</Text>
                        {cityLbl ? <Text style={styles.rowMeta}>{cityLbl}</Text> : null}
                        {item.clinicCode ? (
                          <Text style={styles.rowCode}>{item.clinicCode}</Text>
                        ) : null}
                      </View>
                      {item.rating != null ? (
                        <Text style={styles.rowRating}>⭐ {item.rating.toFixed(1)}</Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          )}

          <Text style={styles.label}>{t("quoteRequest.descLabel")}</Text>
          <TextInput
            style={styles.input}
            multiline
            value={message}
            onChangeText={setMessage}
            placeholder={t("quoteRequest.descPlaceholder")}
            placeholderTextColor="#9ca3af"
            textAlignVertical="top"
          />

          <TouchableOpacity
            style={[styles.cta, sending && styles.ctaDisabled]}
            onPress={() => void onSubmit()}
            disabled={sending}
            activeOpacity={0.88}
          >
            {sending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaText}>
                {(t("quoteRequest.sendBtn") || "").replace("{count}", String(selected.size || 1))}
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 20,
  },
  keyboardAvoid: { flex: 1 },
  scroll: { flex: 1 },
  scrollInner: { flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  sub: { fontSize: 14, color: "#64748b", marginBottom: 8, lineHeight: 20 },
  hint: { fontSize: 12, color: "#64748b", marginBottom: 12, lineHeight: 17 },
  photoWrap: { marginBottom: 16 },
  photoLabel: { fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 },
  photoThumb: {
    width: "100%",
    height: 140,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
  },
  cityLabel: { fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 6 },
  cityInput: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#fff",
    fontSize: 15,
    color: "#0f172a",
    marginBottom: 12,
  },
  singleCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#bae6fd",
    marginBottom: 12,
  },
  singleLabel: { fontSize: 12, fontWeight: "600", color: "#0369a1", marginBottom: 4 },
  singleName: { fontSize: 17, fontWeight: "800", color: "#0c4a6e" },
  empty: { color: "#64748b", marginTop: 24, textAlign: "center", paddingHorizontal: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowOn: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  rowCheck: { fontSize: 22, marginRight: 12, color: "#0f172a" },
  rowName: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  rowMeta: { fontSize: 13, color: "#64748b", marginTop: 2 },
  rowCode: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  rowRating: { fontSize: 13, color: "#ca8a04", fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "700", color: "#475569", marginTop: 8, marginBottom: 6 },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
    fontSize: 15,
    color: "#0f172a",
    textAlignVertical: "top",
    marginBottom: 16,
  },
  cta: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
