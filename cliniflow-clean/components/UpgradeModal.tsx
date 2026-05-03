import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";

interface UpgradeModalProps {
  visible: boolean;
  onClose: () => void;
  /** Optional headline override */
  title?: string;
  /** Optional body text override */
  message?: string;
}

export default function UpgradeModal({
  visible,
  onClose,
  title = "You just got a new patient 🎉",
  message = "Unlock unlimited referrals and grow your clinic with Clinifly Pro",
}: UpgradeModalProps) {
  const router = useRouter();

  const handleUpgrade = () => {
    onClose();
    router.push("/pricing" as any);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Gradient-style header band */}
          <View style={styles.headerBand}>
            <Text style={styles.sparkle}>✨</Text>
            <Text style={styles.proBadge}>CLINIFLY PRO</Text>
          </View>

          <View style={styles.body}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            {/* Feature bullets */}
            <View style={styles.featureList}>
              {[
                "Unlimited referrals every month",
                "Referral rewards system",
                "Patient growth analytics",
                "Full workflow access",
              ].map((f) => (
                <View key={f} style={styles.featureRow}>
                  <Text style={styles.checkmark}>✓</Text>
                  <Text style={styles.featureText}>{f}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            <TouchableOpacity style={styles.upgradeBtn} onPress={handleUpgrade} activeOpacity={0.85}>
              <Text style={styles.upgradeBtnText}>Upgrade to Pro →</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.laterBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.laterText}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 20,
    overflow: "hidden",
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 20 },
      android: { elevation: 12 },
    }),
  },
  headerBand: {
    backgroundColor: "#2563EB",
    paddingVertical: 20,
    alignItems: "center",
    gap: 4,
  },
  sparkle: { fontSize: 32 },
  proBadge: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 13,
    letterSpacing: 2,
  },
  body: { padding: 24, gap: 16 },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    lineHeight: 28,
  },
  message: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  featureList: { gap: 8, marginVertical: 4 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkmark: { color: "#16A34A", fontWeight: "800", fontSize: 16, width: 20 },
  featureText: { color: "#374151", fontSize: 14, flex: 1 },
  upgradeBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  upgradeBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  laterBtn: { alignItems: "center", paddingVertical: 4 },
  laterText: { color: "#9CA3AF", fontSize: 14 },
});
