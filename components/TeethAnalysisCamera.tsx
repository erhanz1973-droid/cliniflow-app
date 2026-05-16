/**
 * Intraoral photo → POST /analyze-teeth → overlay tooth bounding boxes.
 *
 * URL: `ANALYZE_TEETH_URL` from `lib/api.ts` (same host as production backend).
 *
 * @example
 * import { TeethAnalysisCamera } from "../components/TeethAnalysisCamera";
 * <TeethAnalysisCamera onClose={() => router.back()} />
 */

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  LayoutChangeEvent,
  ImageLoadEventData,
  NativeSyntheticEvent,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  ensureCameraAccess,
  ensureMediaLibraryAccessForPicker,
  launchImageLibraryPlayStoreSafe,
} from "../lib/mediaPicker";
import { mapTeethToFDI } from "../lib/mapTeethToFDI";
import { getTreatmentSuggestions } from "../lib/treatmentSuggestions";
import {
  COUNTRY_LABEL,
  DEFAULT_PRICING_COUNTRY,
  currencyForCountry,
  estimateCost,
  formatCostRange,
  listPricingCountries,
  listTreatmentCostKeys,
  type PricingCountry,
  type TreatmentCostKey,
} from "../lib/treatmentCost";
import { ANALYZE_TEETH_URL } from "../lib/api";

const ANALYZE_URL = ANALYZE_TEETH_URL;

export type ToothDetection = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence?: number;
  /** Varsa çizimde kullanılır; yoksa `mapTeethToFDI` atar */
  toothNumber?: number;
};

export type AnalyzeTeethResponse = {
  teethCount: number;
  detections: ToothDetection[];
};

type Props = {
  /** Optional header back / close */
  onClose?: () => void;
};

/**
 * Transform for matching React Native Image `resizeMode="contain"`.
 * Detections are in image pixel space (top-left origin); same space as the bitmap sent to the API.
 */
export type ContainTransform = {
  /** Uniform scale from image pixels → screen pixels */
  scale: number;
  /** Horizontal inset of the letterboxed image inside the container */
  offsetX: number;
  /** Vertical inset of the letterboxed image inside the container */
  offsetY: number;
  /** Width of the drawn image after scale (≤ container width) */
  drawnWidth: number;
  /** Height of the drawn image after scale (≤ container height) */
  drawnHeight: number;
};

/**
 * Compute scale and offsets for `contain`: image fits inside container, centered.
 */
export function getContainTransform(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number
): ContainTransform | null {
  if (
    !imageWidth ||
    !imageHeight ||
    !containerWidth ||
    !containerHeight
  ) {
    return null;
  }
  const scale = Math.min(
    containerWidth / imageWidth,
    containerHeight / imageHeight
  );
  const drawnWidth = imageWidth * scale;
  const drawnHeight = imageHeight * scale;
  const offsetX = (containerWidth - drawnWidth) / 2;
  const offsetY = (containerHeight - drawnHeight) / 2;
  return { scale, offsetX, offsetY, drawnWidth, drawnHeight };
}

/**
 * Map one detection from image coordinates → overlay View style (container space).
 * Transformation: screenPos = offset + imagePos * scale
 */
export function detectionToOverlayStyle(
  d: ToothDetection,
  t: ContainTransform
): {
  position: "absolute";
  left: number;
  top: number;
  width: number;
  height: number;
} {
  return {
    position: "absolute",
    left: t.offsetX + d.x * t.scale,
    top: t.offsetY + d.y * t.scale,
    width: d.width * t.scale,
    height: d.height * t.scale,
  };
}

/** Etiket yazı/padding/border — görüntü `contain` ölçeği ile uyumlu */
export function getScaledLabelMetrics(scale: number) {
  const s = scale;
  return {
    paddingH: Math.max(4, 6 * s),
    paddingV: Math.max(2, 4 * s),
    borderRadius: Math.max(4, 6 * s),
    fontSize: Math.max(9, Math.round(11 * s)),
  };
}

function coverageMessage(teethCount: number): string {
  if (teethCount < 5) return "Photo incomplete";
  if (teethCount > 15) return "Good coverage";
  return "Detection complete";
}

const COST_LABEL_TR: Record<TreatmentCostKey, string> = {
  filling: "Dolgu",
  root_canal: "Kanal tedavisi",
  implant: "İmplant",
};

export function TeethAnalysisCamera({ onClose }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  /** Pixel size of the image file (must match API / model coordinate space) */
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [container, setContainer] = useState({ w: 0, h: 0 });
  const [result, setResult] = useState<AnalyzeTeethResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricingCountry, setPricingCountry] = useState<PricingCountry>(
    DEFAULT_PRICING_COUNTRY
  );

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setContainer({ w: width, h: height });
  }, []);

  /** Authoritative decoded dimensions (handles EXIF; matches what RN draws with contain) */
  useEffect(() => {
    if (!uri) {
      setNatural({ w: 0, h: 0 });
      return;
    }
    let cancelled = false;
    Image.getSize(
      uri,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) setNatural({ w, h });
      },
      () => {
        /* fallback: onLoad / picker asset may still set natural */
      }
    );
    return () => {
      cancelled = true;
    };
  }, [uri]);

  const onImageLoad = useCallback((e: NativeSyntheticEvent<ImageLoadEventData>) => {
    const src = e.nativeEvent.source;
    const w = src.width;
    const h = src.height;
    if (w && h) {
      setNatural((prev) => (!prev.w || !prev.h ? { w, h } : prev));
    }
  }, []);

  const pickImage = useCallback(async (useCamera: boolean) => {
    setError(null);
    setResult(null);

    if (useCamera) {
      if (!(await ensureCameraAccess())) {
        setError("Camera or photo library permission is required.");
        return;
      }
    } else if (!(await ensureMediaLibraryAccessForPicker())) {
      setError("Camera or photo library permission is required.");
      return;
    }

    const res = useCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          quality: 0.92,
          base64: true,
        })
      : await launchImageLibraryPlayStoreSafe({
          quality: 0.92,
          base64: true,
        });

    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    setUri(a.uri);
    // Immediate hint (often matches API); Image.getSize overwrites with decoded size
    if (a.width && a.height && a.width > 0 && a.height > 0) {
      setNatural({ w: a.width, h: a.height });
    } else {
      setNatural({ w: 0, h: 0 });
    }
    let b64 = a.base64;
    if (!b64 && a.uri) {
      try {
        b64 = await FileSystem.readAsStringAsync(a.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      } catch {
        setError("Could not read image as base64.");
        return;
      }
    }
    if (!b64) {
      setError("No image data.");
      return;
    }

    // Strip data URL prefix if present
    const cleanB64 = b64.replace(/^data:image\/\w+;base64,/, "").trim();

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ image: cleanB64 }),
      });

      let data: AnalyzeTeethResponse & { error?: string; message?: string };
      try {
        data = await response.json();
      } catch {
        throw new Error(
          `Server did not return JSON (HTTP ${response.status}). Check ANALYZE_TEETH_URL / API_BASE (POST /analyze-teeth).`
        );
      }

      if (!response.ok) {
        throw new Error(data.message || data.error || `HTTP ${response.status}`);
      }

      if (typeof data.teethCount !== "number" || !Array.isArray(data.detections)) {
        throw new Error("Unexpected response shape");
      }

      setResult({
        teethCount: data.teethCount,
        detections: data.detections,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const containTransform = useMemo(
    () => getContainTransform(natural.w, natural.h, container.w, container.h),
    [natural.w, natural.h, container.w, container.h]
  );

  /** FDI-style labels (MVP): upper 11–18, lower 31–38, left→right by `x` */
  const detectionsWithFDI = useMemo(() => {
    if (!result?.detections?.length || !natural.w || !natural.h) return [];
    return mapTeethToFDI(result.detections, natural.w, natural.h);
  }, [result?.detections, natural.w, natural.h]);

  /** Rule engine: öneriler (görüntü kalitesi + arka dişler) */
  const treatmentSuggestions = useMemo(
    () => getTreatmentSuggestions(detectionsWithFDI),
    [detectionsWithFDI]
  );

  const overlays = useMemo(() => {
    if (!detectionsWithFDI.length || !containTransform) return [];
    const t = containTransform;
    const m = getScaledLabelMetrics(t.scale);
    return detectionsWithFDI.map((d, i) => (
      <View
        key={`fdi-${d.toothNumber}-${i}-${d.confidence ?? 0}`}
        style={[styles.bbox, detectionToOverlayStyle(d, t)]}
      >
        <View
          style={[
            styles.bboxLabelWrap,
            {
              paddingHorizontal: m.paddingH,
              paddingVertical: m.paddingV,
              borderRadius: m.borderRadius,
            },
          ]}
        >
          <Text style={[styles.bboxLabel, { fontSize: m.fontSize }]}>
            {String(d.toothNumber)}
          </Text>
        </View>
      </View>
    ));
  }, [detectionsWithFDI, containTransform]);

  const msg = result ? coverageMessage(result.teethCount) : "";

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scrollContent}>
      <View style={styles.toolbar}>
        {onClose ? (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>← Close</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 72 }} />
        )}
        <Text style={styles.title}>Teeth analysis</Text>
        <View style={{ width: 72 }} />
      </View>

      <Text style={styles.endpointHint} numberOfLines={2}>
        {ANALYZE_URL}
      </Text>

      <View style={styles.row}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => pickImage(false)} disabled={loading}>
          <Text style={styles.actionText}>Gallery</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => pickImage(true)} disabled={loading}>
          <Text style={styles.actionText}>Camera</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={styles.loadingBanner}>
          <ActivityIndicator color="#2563eb" />
          <Text style={styles.loadingText}>Analyzing…</Text>
        </View>
      )}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Error</Text>
          <Text style={styles.errorBody}>{error}</Text>
        </View>
      ) : null}

      {uri ? (
        <View style={styles.stage} onLayout={onContainerLayout}>
          <Image
            source={{ uri }}
            style={styles.image}
            resizeMode="contain"
            onLoad={onImageLoad}
          />
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {overlays}
          </View>
        </View>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>Take or choose a photo</Text>
        </View>
      )}

      {result && !loading && (
        <View style={styles.resultCard}>
          <Text style={styles.countLabel}>Teeth detected</Text>
          <Text style={styles.countValue}>{result.teethCount}</Text>
          <Text
            style={[
              styles.coverage,
              result.teethCount < 5 && styles.coverageWarn,
              result.teethCount > 15 && styles.coverageGood,
            ]}
          >
            {msg}
          </Text>

          {treatmentSuggestions.length > 0 ? (
            <View style={styles.suggestionsBlock}>
              <Text style={styles.suggestionsTitle}>Tedavi / çekim önerileri</Text>
              {treatmentSuggestions.map((s, idx) => (
                <View key={`${s.type}-${idx}`} style={styles.suggestionRow}>
                  <Text style={styles.suggestionBullet}>•</Text>
                  <Text style={styles.suggestionText}>{s.message}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.costBlock}>
            <Text style={styles.costTitle}>Referans maliyet</Text>
            <View style={styles.countryRow}>
              {listPricingCountries().map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.countryChip,
                    pricingCountry === c && styles.countryChipActive,
                  ]}
                  onPress={() => setPricingCountry(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: pricingCountry === c }}
                >
                  <Text
                    style={[
                      styles.countryChipText,
                      pricingCountry === c && styles.countryChipTextActive,
                    ]}
                  >
                    {COUNTRY_LABEL[c]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.costDisclaimer}>
              {currencyForCountry(pricingCountry)} — örnek aralıklar; gerçek
              ücret kliniğe göre değişir
            </Text>
            {listTreatmentCostKeys().map((key, idx, arr) => {
              const range = estimateCost(key, pricingCountry);
              if (!range) return null;
              const isLast = idx === arr.length - 1;
              return (
                <View
                  key={key}
                  style={[styles.costRow, isLast && styles.costRowLast]}
                >
                  <Text style={styles.costLabel}>{COST_LABEL_TR[key]}</Text>
                  <Text style={styles.costValue}>
                    {formatCostRange(
                      range,
                      currencyForCountry(pricingCountry)
                    )}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const STAGE_HEIGHT = 320;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },
  scrollContent: { paddingBottom: 32 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  closeBtn: { padding: 8 },
  closeText: { color: "#93c5fd", fontSize: 16 },
  title: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  endpointHint: {
    color: "#64748b",
    fontSize: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    backgroundColor: "#1e293b",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  actionText: { color: "#e2e8f0", fontWeight: "600" },
  loadingBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  loadingText: { color: "#94a3b8" },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#450a0a",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#991b1b",
  },
  errorTitle: { color: "#fecaca", fontWeight: "700", marginBottom: 4 },
  errorBody: { color: "#fecaca", fontSize: 14 },
  stage: {
    marginHorizontal: 16,
    height: STAGE_HEIGHT,
    backgroundColor: "#020617",
    borderRadius: 12,
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  bbox: {
    borderWidth: 2,
    borderColor: "#22c55e",
    backgroundColor: "rgba(34, 197, 94, 0.12)",
  },
  bboxLabelWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    backgroundColor: "#16a34a",
  },
  bboxLabel: {
    color: "#ffffff",
    fontWeight: "800",
  },
  placeholder: {
    marginHorizontal: 16,
    height: STAGE_HEIGHT,
    backgroundColor: "#1e293b",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: { color: "#64748b" },
  resultCard: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    backgroundColor: "#1e293b",
    borderRadius: 12,
  },
  countLabel: { color: "#94a3b8", fontSize: 14 },
  countValue: { color: "#f8fafc", fontSize: 32, fontWeight: "800", marginTop: 4 },
  coverage: { color: "#cbd5e1", marginTop: 8, fontSize: 16 },
  coverageWarn: { color: "#fbbf24" },
  coverageGood: { color: "#4ade80" },
  suggestionsBlock: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  suggestionsTitle: {
    color: "#e2e8f0",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 8,
  },
  suggestionBullet: { color: "#38bdf8", fontSize: 16, lineHeight: 20 },
  suggestionText: { flex: 1, color: "#cbd5e1", fontSize: 14, lineHeight: 20 },
  costBlock: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  costTitle: {
    color: "#a7f3d0",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 8,
  },
  countryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  countryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  countryChipActive: {
    borderColor: "#34d399",
    backgroundColor: "#064e3b",
  },
  countryChipText: { color: "#94a3b8", fontSize: 13, fontWeight: "600" },
  countryChipTextActive: { color: "#a7f3d0" },
  costDisclaimer: {
    color: "#64748b",
    fontSize: 11,
    marginBottom: 10,
  },
  costRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#334155",
  },
  costRowLast: {
    borderBottomWidth: 0,
  },
  costLabel: { color: "#e2e8f0", fontSize: 14 },
  costValue: { color: "#34d399", fontSize: 14, fontWeight: "600" },
});

export default TeethAnalysisCamera;
