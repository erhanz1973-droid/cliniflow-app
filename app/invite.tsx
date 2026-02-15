// app/invite.tsx
import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Share,
  Alert,
  ScrollView,
} from "react-native";

// Eğer sende PatientContext varsa burayı bağlayacağız.
// Şimdilik fallback ile çalışır.
function safeRandomCode(prefix = "CLN") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}-${s}`;
}

type ReferralStatus = "PENDING" | "APPROVED" | "REJECTED";
type ReferralItem = {
  id: string;
  friendName?: string; // hasta tarafında gizlilik için opsiyonel
  status: ReferralStatus;
  createdAt: number;
  // admin onayladıysa percent gelebilir ama hasta tarafında göstermek istersen açarsın:
  discountPercent?: number;
};

export default function InviteScreen() {
  // ✅ Gerçekte bunu PatientContext’ten alacağız:
  const [myCode] = React.useState<string>(() => safeRandomCode());

  // ✅ MVP: local list (sonra API’den gelecek)
  const [referrals, setReferrals] = React.useState<ReferralItem[]>(() => [
    {
      id: "r1",
      friendName: "Friend #1",
      status: "PENDING",
      createdAt: Date.now() - 1000 * 60 * 60 * 5,
    },
    {
      id: "r2",
      friendName: "Friend #2",
      status: "APPROVED",
      createdAt: Date.now() - 1000 * 60 * 60 * 26,
      // discountPercent: 7, // istersek hasta görsün diye açarız
    },
  ]);

  const pendingCount = referrals.filter((r) => r.status === "PENDING").length;
  const approvedCount = referrals.filter((r) => r.status === "APPROVED").length;

  const inviteMessage =
    `Cliniflow ile tedavi planımı takip ediyorum.\n` +
    `Uygulamayı indirip kayıt olurken davet kodunu gir:\n\n` +
    `Davet kodum: ${myCode}\n\n` +
    `Not: İndirim oranını klinik/admin belirliyor.`;

  const onShare = async () => {
    try {
      await Share.share({ message: inviteMessage });
    } catch (e) {
      console.error("Share failed:", e);
      Alert.alert("Error", "Paylaşım başarısız.");
    }
  };

  const onCopy = async () => {
    // Clipboard için expo-clipboard kullanmak daha iyi.
    // Şimdilik kullanıcıya seçip kopyalaması için gösteriyoruz.
    Alert.alert("Kopyala", `Kod: ${myCode}\n\n(Şimdilik seçip kopyalayabilirsin)`);
  };

  const onHowItWorks = () => {
    Alert.alert(
      "Nasıl çalışır?",
      "1) Kodunu arkadaşınla paylaş.\n" +
        "2) Arkadaşın kayıt olurken bu kodu girsin.\n" +
        "3) Arkadaşın kliniğe geldiğinde davet onaylanır.\n" +
        "4) İndirim yüzdesini admin belirler ve ikinize tanımlar."
    );
  };

  // ✅ Demo: test için yeni pending eklemek istersen
  const addDummyPending = () => {
    setReferrals((prev) => [
      {
        id: String(Date.now()),
        friendName: `Friend #${prev.length + 1}`,
        status: "PENDING",
        createdAt: Date.now(),
      },
      ...prev,
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Arkadaşını Davet Et</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Davet Kodun</Text>

        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{myCode}</Text>
        </View>

        <View style={styles.row}>
          <Pressable onPress={onCopy} style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryText}>Kopyala</Text>
          </Pressable>

          <Pressable onPress={onShare} style={styles.btnPrimary}>
            <Text style={styles.btnPrimaryText}>Paylaş</Text>
          </Pressable>
        </View>

        <Pressable onPress={onHowItWorks} style={styles.linkBtn}>
          <Text style={styles.linkText}>Nasıl çalışır?</Text>
        </Pressable>

        <Text style={styles.helper}>
          İndirim oranını klinik/admin belirler. Onaylanınca burada görünür.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Davet Durumu</Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{pendingCount}</Text>
            <Text style={styles.statLabel}>Beklemede</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statValue}>{approvedCount}</Text>
            <Text style={styles.statLabel}>Onaylandı</Text>
          </View>
        </View>

        <View style={{ height: 8 }} />

        {referrals.length === 0 ? (
          <Text style={styles.emptyText}>
            Henüz davet yok. Kodu paylaşınca burada görünecek.
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {referrals.map((r) => (
              <View key={r.id} style={styles.refItem}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.refName}>
                    {r.friendName ?? "Davet edilen kişi"}
                  </Text>
                  <Text style={styles.refMeta}>
                    {new Date(r.createdAt).toLocaleString()}
                  </Text>
                </View>

                <StatusPill status={r.status} />
              </View>
            ))}
          </View>
        )}

        {/* ✅ test butonu (istersen sil) */}
        <Pressable onPress={addDummyPending} style={styles.btnGhost}>
          <Text style={styles.btnGhostText}>+ Test: Bekleyen davet ekle</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Paylaşım Metni</Text>
        <Text style={styles.previewText}>{inviteMessage}</Text>
      </View>
    </ScrollView>
  );
}

function StatusPill({ status }: { status: ReferralStatus }) {
  const label =
    status === "PENDING" ? "Beklemede" : status === "APPROVED" ? "Onaylandı" : "Reddedildi";

  return (
    <View
      style={[
        styles.pill,
        status === "PENDING" && styles.pillPending,
        status === "APPROVED" && styles.pillApproved,
        status === "REJECTED" && styles.pillRejected,
      ]}
    >
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "900" },

  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#fff",
    gap: 10,
  },

  cardTitle: { fontSize: 16, fontWeight: "900" },

  codeBox: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },

  codeText: { fontSize: 22, fontWeight: "900", letterSpacing: 1 },

  row: { flexDirection: "row", gap: 10 },

  btnPrimary: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "900" },

  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  btnSecondaryText: { color: "#111827", fontWeight: "900" },

  linkBtn: { alignSelf: "flex-start", paddingVertical: 4 },
  linkText: { fontWeight: "900", color: "#2563eb" },

  helper: { fontSize: 12, color: "#6b7280", fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: 10 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  statValue: { fontSize: 18, fontWeight: "900" },
  statLabel: { fontSize: 12, fontWeight: "800", color: "#6b7280" },

  emptyText: { color: "#6b7280", fontWeight: "700" },

  refItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  refName: { fontWeight: "900" },
  refMeta: { fontSize: 12, color: "#6b7280", fontWeight: "700" },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillPending: { backgroundColor: "#fff7ed", borderColor: "#f59e0b" },
  pillApproved: { backgroundColor: "#f0fdf4", borderColor: "#22c55e" },
  pillRejected: { backgroundColor: "#fef2f2", borderColor: "#ef4444" },
  pillText: { fontWeight: "900", color: "#111827" },

  btnGhost: {
    marginTop: 8,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  btnGhostText: { fontWeight: "900", color: "#374151" },

  previewText: { fontSize: 13, color: "#111827", fontWeight: "600", lineHeight: 18 },
});
