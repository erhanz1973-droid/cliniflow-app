import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  Platform,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language-context";
import {
  archiveFileDisplayUrl,
  fetchPatientArchiveFiles,
  isArchiveVisualFile,
  type PatientArchiveFile,
} from "../../lib/treatmentGuide/patientFileArchive";

type Props = {
  visible: boolean;
  patientId: string;
  onClose: () => void;
  onSelect: (file: PatientArchiveFile) => void;
};

export function PatientFileArchivePicker({
  visible,
  patientId,
  onClose,
  onSelect,
}: Props) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<PatientArchiveFile[]>([]);

  const load = useCallback(async () => {
    if (!patientId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const all = await fetchPatientArchiveFiles(patientId);
      setFiles(all.filter(isArchiveVisualFile));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  const cols = 3;
  const gap = 6;
  const cell = (width - 32 - gap * (cols - 1)) / cols;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t("treatmentGuide.upload.archive.title")}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button">
            <Ionicons name="close" size={26} color="#0f172a" />
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>{t("treatmentGuide.upload.archive.hint")}</Text>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563eb" />
          </View>
        ) : files.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyIcon}>🖼️</Text>
            <Text style={styles.emptyTitle}>{t("treatmentGuide.upload.archive.empty")}</Text>
            <Text style={styles.emptySub}>{t("treatmentGuide.upload.archive.emptySub")}</Text>
          </View>
        ) : (
          <FlatList
            data={files}
            keyExtractor={(item) => item.id}
            numColumns={cols}
            columnWrapperStyle={{ gap }}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.cell, { width: cell, height: cell }]}
                onPress={() => onSelect(item)}
                activeOpacity={0.88}
              >
                <Image
                  source={{ uri: archiveFileDisplayUrl(item) }}
                  style={styles.cellImg}
                  resizeMode="cover"
                />
                {item.fileType === "xray" ? (
                  <View style={styles.xrayBadge}>
                    <Text style={styles.xrayBadgeText}>🩻</Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0f172a", flex: 1 },
  hint: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 19,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  emptyIcon: { fontSize: 40, marginBottom: 8 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#334155", marginBottom: 6 },
  emptySub: { fontSize: 13, color: "#94a3b8", textAlign: "center", lineHeight: 18 },
  gridContent: { paddingHorizontal: 16, paddingBottom: Platform.OS === "ios" ? 24 : 16 },
  cell: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
    marginBottom: 6,
  },
  cellImg: { width: "100%", height: "100%" },
  xrayBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  xrayBadgeText: { fontSize: 11 },
});
