import React, { memo, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import { useLanguage } from "../lib/language-context";
import { TEETH_FDI_CHART_SOURCE, TEETH_FDI_CHART_ASPECT } from "../lib/toothNumberingAssets";

export type ToothNumberingChartProps = {
  title?: string;
  /** Smaller chart for doctor diagnosis reference strip */
  compact?: boolean;
  highlightedTeeth?: Array<string | number>;
  selectedTooth?: string | number | null;
  onHighlightedToothPress?: (toothId: string) => void;
  /** Reserved for future tap-to-select on chart regions */
  onChartToothPress?: (toothId: string) => void;
  showLegend?: boolean;
  showZoomControl?: boolean;
  style?: ViewStyle;
};

function normalizeToothIds(raw: Array<string | number> | undefined): string[] {
  const set = new Set<string>();
  for (const v of raw || []) {
    const s = String(v ?? "").trim();
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => Number(a) - Number(b));
}

function ToothNumberingChartInner({
  title,
  compact = false,
  highlightedTeeth = [],
  selectedTooth = null,
  onHighlightedToothPress,
  showLegend = true,
  showZoomControl = true,
  style,
}: ToothNumberingChartProps) {
  const { t } = useLanguage();
  const { width: screenW } = useWindowDimensions();
  const [zoomOpen, setZoomOpen] = useState(false);

  const selected = selectedTooth != null ? String(selectedTooth).trim() : "";
  const chips = useMemo(() => {
    const ids = normalizeToothIds(highlightedTeeth);
    if (selected && !ids.includes(selected)) return [selected, ...ids];
    return ids;
  }, [highlightedTeeth, selected]);

  const horizontalPad = compact ? 12 : 16;
  const imgWidth = Math.min(screenW - horizontalPad * 2 - (compact ? 24 : 0), compact ? screenW * 0.92 : screenW - 32);
  const imgHeight = imgWidth * TEETH_FDI_CHART_ASPECT;

  const openZoom = useCallback(() => setZoomOpen(true), []);
  const closeZoom = useCallback(() => setZoomOpen(false), []);

  const chartTitle = title || t("treatment.chartTitle");

  return (
    <View style={[styles.card, compact && styles.cardCompact, style]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, compact && styles.titleCompact]}>{chartTitle}</Text>
        {showZoomControl ? (
          <Pressable
            onPress={openZoom}
            style={({ pressed }) => [styles.zoomBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={t("diagnosis.chartZoomHint")}
          >
            <Text style={styles.zoomBtnText}>🔍</Text>
          </Pressable>
        ) : null}
      </View>

      {showLegend ? (
        <View style={styles.legendBlock}>
          <Text style={styles.legendLine}>
            <Text style={styles.legendStrong}>FDI</Text>
            {" · "}
            {t("diagnosis.upper")} 11–18 / 21–28
            {" · "}
            {t("diagnosis.lower")} 31–38 / 41–48
          </Text>
          <View style={styles.quadrantRow}>
            <Text style={styles.quadrantLabel}>{t("diagnosis.quadrantRight")}</Text>
            <Text style={styles.quadrantCenter}>↑ {t("diagnosis.upper")}</Text>
            <Text style={styles.quadrantLabel}>{t("diagnosis.quadrantLeft")}</Text>
          </View>
          <View style={styles.quadrantRow}>
            <Text style={styles.quadrantLabel}>{t("diagnosis.quadrantRight")}</Text>
            <Text style={styles.quadrantCenter}>↓ {t("diagnosis.lower")}</Text>
            <Text style={styles.quadrantLabel}>{t("diagnosis.quadrantLeft")}</Text>
          </View>
        </View>
      ) : null}

      <Pressable onPress={showZoomControl ? openZoom : undefined} style={styles.imageWrap}>
        <Image
          source={TEETH_FDI_CHART_SOURCE}
          style={{ width: imgWidth, height: imgHeight, borderRadius: 10 }}
          resizeMode="contain"
          accessibilityRole="image"
          accessibilityLabel={chartTitle}
        />
      </Pressable>

      {showZoomControl ? (
        <Text style={styles.zoomHint}>{t("diagnosis.chartZoomHint")}</Text>
      ) : null}

      {chips.length > 0 ? (
        <View style={styles.chipsBlock}>
          <Text style={styles.chipsLabel}>{t("treatment.treatedTeeth")}</Text>
          <View style={styles.chipsRow}>
            {chips.map((tooth) => {
              const isSelected = tooth === selected;
              return (
                <Pressable
                  key={tooth}
                  disabled={!onHighlightedToothPress}
                  onPress={() => onHighlightedToothPress?.(tooth)}
                  style={({ pressed }) => [
                    styles.chip,
                    isSelected && styles.chipSelected,
                    pressed && onHighlightedToothPress ? styles.pressed : null,
                  ]}
                >
                  <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                    {tooth}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Modal visible={zoomOpen} animationType="fade" transparent onRequestClose={closeZoom}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{chartTitle}</Text>
            <Pressable onPress={closeZoom} style={styles.modalClose}>
              <Text style={styles.modalCloseText}>✕</Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalScrollContent}
            maximumZoomScale={3}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
          >
            <Image
              source={TEETH_FDI_CHART_SOURCE}
              style={{ width: screenW - 24, height: (screenW - 24) * TEETH_FDI_CHART_ASPECT }}
              resizeMode="contain"
            />
          </ScrollView>
          {showLegend ? (
            <Text style={styles.modalLegend}>
              {t("diagnosis.upper")} 11–18 / 21–28 · {t("diagnosis.lower")} 31–38 / 41–48
            </Text>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FAFBFC",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  cardCompact: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#111827",
    flex: 1,
  },
  titleCompact: {
    fontSize: 14,
  },
  zoomBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    alignItems: "center",
    justifyContent: "center",
  },
  zoomBtnText: {
    fontSize: 18,
  },
  legendBlock: {
    marginBottom: 8,
    gap: 2,
  },
  legendLine: {
    fontSize: 11,
    color: "#4B5563",
    lineHeight: 16,
  },
  legendStrong: {
    fontWeight: "800",
    color: "#1D4ED8",
  },
  quadrantRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  quadrantLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
    width: 72,
  },
  quadrantCenter: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9CA3AF",
    flex: 1,
    textAlign: "center",
  },
  imageWrap: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#F3F4F6",
  },
  zoomHint: {
    marginTop: 6,
    fontSize: 11,
    color: "#9CA3AF",
    textAlign: "center",
  },
  chipsBlock: {
    marginTop: 10,
  },
  chipsLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    marginBottom: 6,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    backgroundColor: "#DBEAFE",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#93C5FD",
  },
  chipSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#1D4ED8",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
  },
  chipTextSelected: {
    color: "#FFFFFF",
  },
  pressed: {
    opacity: 0.85,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.92)",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 8,
  },
  modalTitle: {
    color: "#F8FAFC",
    fontSize: 16,
    fontWeight: "800",
    flex: 1,
  },
  modalClose: {
    padding: 8,
  },
  modalCloseText: {
    color: "#F8FAFC",
    fontSize: 22,
    fontWeight: "700",
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  modalLegend: {
    color: "#CBD5E1",
    fontSize: 12,
    textAlign: "center",
    paddingHorizontal: 16,
    paddingBottom: 28,
  },
});

export const ToothNumberingChart = memo(ToothNumberingChartInner);
export default ToothNumberingChart;
