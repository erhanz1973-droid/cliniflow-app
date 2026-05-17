import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language-context";
import {
  INQUIRY_ATTACHMENT_SECTION_ORDER,
  inquiryAttachmentSectionTitle,
  type InquiryAttachment,
  type InquiryAttachmentKind,
} from "../../lib/treatmentGuide/collectInquiryAttachments";

type Props = {
  attachments: InquiryAttachment[];
  excludedIds: ReadonlySet<string>;
  onToggleExclude: (id: string) => void;
};

function previewUri(att: InquiryAttachment): string | null {
  const thumb = String(att.thumbnailUrl || "").trim();
  if (/^https?:\/\//i.test(thumb)) return thumb;
  const url = String(att.url || "").trim();
  if (/^https?:\/\//i.test(url) && att.kind !== "pdf") return url;
  return null;
}

function isPdf(att: InquiryAttachment): boolean {
  if (att.kind === "pdf") return true;
  return String(att.mimeType || "").toLowerCase().includes("pdf");
}

function sectionIcon(kind: InquiryAttachmentKind) {
  if (kind === "xray" || kind === "ct") return "scan-outline" as const;
  if (kind === "pdf") return "document-text-outline" as const;
  if (kind === "photo") return "image-outline" as const;
  return "folder-open-outline" as const;
}

export function ClinicInquiryAttachmentsPreview({
  attachments,
  excludedIds,
  onToggleExclude,
}: Props) {
  const { t } = useLanguage();

  const included = useMemo(
    () => attachments.filter((a) => !excludedIds.has(a.id)),
    [attachments, excludedIds],
  );

  const grouped = useMemo(() => {
    const map = new Map<InquiryAttachmentKind, InquiryAttachment[]>();
    for (const kind of INQUIRY_ATTACHMENT_SECTION_ORDER) map.set(kind, []);
    for (const att of attachments) {
      const list = map.get(att.kind) || [];
      list.push(att);
      map.set(att.kind, list);
    }
    return INQUIRY_ATTACHMENT_SECTION_ORDER.filter((k) => (map.get(k)?.length || 0) > 0).map(
      (kind) => ({ kind, items: map.get(kind)! }),
    );
  }, [attachments]);

  if (attachments.length === 0) {
    return (
      <Text style={styles.empty}>{t("treatmentGuide.inquiry.attachments.noneHint")}</Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("treatmentGuide.inquiry.attachmentsTitle")}</Text>
      <Text style={styles.sub}>
        {t("treatmentGuide.inquiry.attachmentsIncluded", { count: included.length })}
      </Text>

      {grouped.map(({ kind, items }) => (
        <View key={kind} style={styles.section}>
          <View style={styles.sectionHead}>
            <Ionicons name={sectionIcon(kind)} size={16} color="#475569" />
            <Text style={styles.sectionTitle}>{inquiryAttachmentSectionTitle(kind, t)}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.row}>
            {items.map((att) => {
              const excluded = excludedIds.has(att.id);
              const uri = previewUri(att);
              return (
                <View key={att.id} style={[styles.card, excluded && styles.cardExcluded]}>
                  {uri && !isPdf(att) ? (
                    <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Ionicons
                        name={isPdf(att) ? "document-text" : sectionIcon(kind)}
                        size={28}
                        color="#94a3b8"
                      />
                    </View>
                  )}
                  <Text style={styles.cardLabel} numberOfLines={2}>
                    {att.label}
                  </Text>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => onToggleExclude(att.id)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={
                      excluded
                        ? t("treatmentGuide.inquiry.attachment.include")
                        : t("treatmentGuide.inquiry.attachment.exclude")
                    }
                  >
                    <Ionicons
                      name={excluded ? "add-circle-outline" : "close-circle"}
                      size={22}
                      color={excluded ? "#2563eb" : "#64748b"}
                    />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 12 },
  title: { fontSize: 13, fontWeight: "700", color: "#334155", marginBottom: 4 },
  sub: { fontSize: 12, color: "#64748b", marginBottom: 10, lineHeight: 17 },
  empty: { fontSize: 12, color: "#94a3b8", marginBottom: 12, lineHeight: 17 },
  section: { marginBottom: 12 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  sectionTitle: { fontSize: 12, fontWeight: "600", color: "#475569" },
  row: { marginHorizontal: -2 },
  card: {
    width: 108,
    marginRight: 10,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    paddingBottom: 8,
  },
  cardExcluded: { opacity: 0.45 },
  thumb: { width: "100%", height: 72, backgroundColor: "#f1f5f9" },
  thumbPlaceholder: {
    width: "100%",
    height: 72,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    fontSize: 11,
    color: "#475569",
    paddingHorizontal: 6,
    paddingTop: 6,
    lineHeight: 14,
    minHeight: 32,
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 12,
  },
});
