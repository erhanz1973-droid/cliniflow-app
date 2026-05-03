import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  Modal,
  StyleSheet,
} from "react-native";
import type { Tooth } from "../lib/api";
import { MOUTH_CROP_TOP, MOUTH_CROP_BOTTOM } from "../lib/api";

/* ── Mouth region bounds (normalized 0-1) ───────────────── *
 * Mirror the crop window used in analyzeTeethUri so detections
 * that survived the crop but land slightly outside due to
 * floating-point remapping are still accepted (±0.03 margin).
 */
const MOUTH_Y_MIN = MOUTH_CROP_TOP    - 0.03;   // ≈ 0.37
const MOUTH_Y_MAX = MOUTH_CROP_BOTTOM + 0.03;   // ≈ 0.78
const MOUTH_X_MIN = 0.02;
const MOUTH_X_MAX = 0.98;

function isInMouthRegion(tooth: Tooth): boolean {
  return (
    tooth.y > MOUTH_Y_MIN &&
    tooth.y < MOUTH_Y_MAX &&
    tooth.x > MOUTH_X_MIN &&
    tooth.x < MOUTH_X_MAX
  );
}

/* ── Colors ────────────────────────────────────────────── */

const STATUS_COLOR: Record<Tooth["status"], string> = {
  healthy: "#22c55e",
  caries:  "#ef4444",
  missing: "#9ca3af",
};

const STATUS_LABEL: Record<Tooth["status"], string> = {
  healthy: "Sağlıklı",
  caries:  "Çürük tespit edildi",
  missing: "Eksik diş",
};

/* ── Component ─────────────────────────────────────────── */

type Props = {
  teeth: Tooth[];
  /** Pass false during countdown / capture to hide dots */
  visible?: boolean;
  /**
   * true  (default) → tapping a dot opens the popup — use on preview screen
   * false           → dots shown but non-interactive — use on live camera feed
   */
  interactive?: boolean;
  /**
   * true (default) → only render dots inside the mouth region (y 40–75%, x 5–95%)
   * false          → render all detections as-is
   */
  filterMouth?: boolean;
  /**
   * true → draw a dashed guide rectangle showing the valid mouth zone.
   * Useful on live-camera screens that don't have their own frame UI.
   */
  showMouthGuide?: boolean;
};

export default function TeethOverlay({
  teeth,
  visible = true,
  interactive = true,
  filterMouth = true,
  showMouthGuide = false,
}: Props) {
  const [selected, setSelected] = useState<Tooth | null>(null);

  const visibleTeeth = filterMouth ? teeth.filter(isInMouthRegion) : teeth;

  if (!visible) return null;

  return (
    <>
      {/* Optional mouth-region guide rectangle */}
      {showMouthGuide && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <View style={styles.guideWrapper}>
            <View style={styles.guideRect}>
              <Text style={styles.guideLabel}>Dişlerinizi çerçeve içine getirin</Text>
            </View>
          </View>
        </View>
      )}

      {/* Dots — positioned relative to the container via absoluteFill */}
      {visibleTeeth.length > 0 && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {visibleTeeth.map((tooth, idx) => (
            <Pressable
              key={`${tooth.id}-${idx}`}
              onPress={() => interactive && setSelected(tooth)}
              style={[
                styles.dot,
                {
                  left:            `${tooth.x * 100}%` as any,
                  top:             `${tooth.y * 100}%` as any,
                  backgroundColor: STATUS_COLOR[tooth.status],
                },
              ]}
            >
              <Text style={styles.dotLabel}>{tooth.id}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Tap popup */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)}>
          {selected && (
            <View style={styles.popup}>
              <View
                style={[
                  styles.popupDot,
                  { backgroundColor: STATUS_COLOR[selected.status] },
                ]}
              />
              <Text style={styles.popupTitle}>Diş {selected.id}</Text>
              <Text
                style={[
                  styles.popupStatus,
                  { color: STATUS_COLOR[selected.status] },
                ]}
              >
                {STATUS_LABEL[selected.status]}
              </Text>
              <Text style={styles.popupClose}>Kapat</Text>
            </View>
          )}
        </Pressable>
      </Modal>
    </>
  );
}

/* ── Styles ────────────────────────────────────────────── */

const DOT = 28;

const styles = StyleSheet.create({
  /* Mouth-region guide */
  guideWrapper: {
    position:       "absolute",
    top:            `${MOUTH_CROP_TOP    * 100}%` as any,
    left:           "10%",
    right:          "10%",
    height:         `${(MOUTH_CROP_BOTTOM - MOUTH_CROP_TOP) * 100}%` as any,
    justifyContent: "flex-start",
    alignItems:     "center",
  },
  guideRect: {
    flex:          1,
    width:         "100%",
    borderWidth:   2,
    borderColor:   "rgba(255,255,255,0.65)",
    borderStyle:   "dashed",
    borderRadius:  16,
    alignItems:    "center",
    paddingTop:    10,
  },
  guideLabel: {
    color:           "rgba(255,255,255,0.85)",
    fontSize:        12,
    fontWeight:      "600",
    backgroundColor: "rgba(0,0,0,0.35)",
    paddingHorizontal: 10,
    paddingVertical:   3,
    borderRadius:    8,
    overflow:        "hidden",
  },

  dot: {
    position:       "absolute",
    width:          DOT,
    height:         DOT,
    borderRadius:   DOT / 2,
    justifyContent: "center",
    alignItems:     "center",
    // Centre the dot on the coordinate point
    transform: [{ translateX: -(DOT / 2) }, { translateY: -(DOT / 2) }],
    // Subtle shadow so dots are readable on any background
    shadowColor:    "#000",
    shadowOffset:   { width: 0, height: 1 },
    shadowOpacity:  0.4,
    shadowRadius:   3,
    elevation:      4,
  },
  dotLabel: {
    color:      "#fff",
    fontSize:   10,
    fontWeight: "800",
  },

  /* Popup */
  backdrop: {
    flex:            1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent:  "center",
    alignItems:      "center",
  },
  popup: {
    backgroundColor: "#1f2937",
    borderRadius:    20,
    padding:         28,
    alignItems:      "center",
    minWidth:        200,
    gap:             8,
  },
  popupDot: {
    width:        40,
    height:       40,
    borderRadius: 20,
    marginBottom: 4,
  },
  popupTitle: {
    color:      "#f9fafb",
    fontSize:   22,
    fontWeight: "700",
  },
  popupStatus: {
    fontSize:   15,
    fontWeight: "600",
  },
  popupClose: {
    marginTop:  12,
    color:      "#6b7280",
    fontSize:   13,
  },
});
