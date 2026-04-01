// app/register-patient.tsx
import React, { useState, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { usePatientRegistration } from "../lib/patient/register";
import { classifyApiError } from "../lib/api";
import { useLanguage } from "../lib/language-context";

export default function RegisterPatientScreen() {
  const router = useRouter();
  const { handlePatientRegistration } = usePatientRegistration();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [netError, setNetError] = useState<"network" | "warmingUp" | null>(null);
  const [infoMsg, setInfoMsg] = useState<{ text: string; goToLogin?: boolean } | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [formData, setFormData] = useState({
    clinicCode: "",
    phone: "",
    patientName: "",
    email: "",
    referralCode: "",
  });

  const doRegister = async () => {
    if (!formData.clinicCode || !formData.phone || !formData.patientName) {
      Alert.alert(t("common.error"), t("register.patientFillRequired"));
      return;
    }

    setNetError(null);
    setInfoMsg(null);
    setLoading(true);

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    try {
      await handlePatientRegistration({
        name: formData.patientName,
        email: formData.email,
        phone: formData.phone,
        clinicCode: formData.clinicCode,
        inviterReferralCode: formData.referralCode,
      });
    } catch (error: any) {
      const kind = classifyApiError(error);

      if (kind === "network" || kind === "warmingUp") {
        setNetError(kind === "warmingUp" ? "warmingUp" : "network");
        // Auto-retry after 30 s for cold-start; don't auto-retry for plain network errors
        if (kind === "warmingUp") {
          retryTimerRef.current = setTimeout(() => doRegister(), 30_000);
        }
      } else {
        const msg = error.message || "";
        // "Soft" conflicts — show as info notice, not a blocking error
        if (msg.includes("phone_already_exists")) {
          setInfoMsg({ text: t("register.patientAlreadyExists"), goToLogin: true });
        } else if (msg.includes("email_already_exists")) {
          setInfoMsg({ text: t("register.patientEmailExists"), goToLogin: true });
        } else {
          // Real errors — alert
          let friendlyMsg = t("common.serverError");
          if (msg.includes("missing_required_fields")) friendlyMsg = t("register.patientFillRequired");
          else if (msg.includes("invalid_clinic")) friendlyMsg = t("register.invalidClinic");
          else if (msg.includes("email_required")) friendlyMsg = t("register.emailRequired");
          Alert.alert(t("common.error"), friendlyMsg);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t("register.patientTitle")}</Text>

        {/* Soft info notice (phone/email already registered) */}
        {infoMsg && (
          <View style={styles.infoBanner}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoText}>{infoMsg.text}</Text>
              {infoMsg.goToLogin && (
                <TouchableOpacity onPress={() => router.push("/login/patient" as any)}>
                  <Text style={styles.infoLink}>{t("register.goToLogin")} →</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Cold-start / network error banner */}
        {netError && (
          <View style={[styles.errorBanner, netError === "warmingUp" && styles.warmBanner]}>
            <Text style={styles.errorIcon}>{netError === "warmingUp" ? "⏳" : "📡"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>
                {netError === "warmingUp"
                  ? t("register.serverStarting")
                  : t("register.networkError")}
              </Text>
              <Text style={styles.errorSub}>
                {netError === "warmingUp"
                  ? t("register.serverStartingMsg")
                  : t("register.networkErrorMsg")}
              </Text>
            </View>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder={t("register.patientClinicCode")}
          placeholderTextColor="#9CA3AF"
          value={formData.clinicCode}
          onChangeText={(text) => setFormData({ ...formData, clinicCode: text.toUpperCase() })}
          autoCapitalize="characters"
        />

        <TextInput
          style={styles.input}
          placeholder={t("register.patientName")}
          placeholderTextColor="#9CA3AF"
          value={formData.patientName}
          onChangeText={(text) => setFormData({ ...formData, patientName: text })}
        />

        <TextInput
          style={styles.input}
          placeholder={t("register.patientPhone")}
          placeholderTextColor="#9CA3AF"
          value={formData.phone}
          onChangeText={(text) => setFormData({ ...formData, phone: text })}
          keyboardType="phone-pad"
        />

        <TextInput
          style={styles.input}
          placeholder={t("register.patientEmail")}
          placeholderTextColor="#9CA3AF"
          value={formData.email}
          onChangeText={(text) => setFormData({ ...formData, email: text })}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder={t("register.referralCode")}
          placeholderTextColor="#9CA3AF"
          value={formData.referralCode}
          onChangeText={(text) => setFormData({ ...formData, referralCode: text })}
          autoCapitalize="none"
        />

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={doRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitBtnText}>
              {netError ? t("common.retry") : t("register.patientSubmit")}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.push("/register-doctor" as any)}
        >
          <Text style={styles.linkText}>{t("register.isDoctor")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.push("/login/patient" as any)}
        >
          <Text style={styles.linkText}>{t("login.loginButton")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    justifyContent: "center",
    flexGrow: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 28,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 10,
    marginBottom: 14,
    fontSize: 15,
    color: "#111827",
  },
  submitBtn: {
    backgroundColor: "#16a34a",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  linkText: {
    color: "#2563EB",
    fontSize: 14,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  warmBanner: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  errorIcon: {
    fontSize: 22,
  },
  errorTitle: {
    fontWeight: "700",
    fontSize: 14,
    color: "#111827",
    marginBottom: 2,
  },
  errorSub: {
    fontSize: 12,
    color: "#6B7280",
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  infoIcon: {
    fontSize: 18,
  },
  infoText: {
    fontSize: 13,
    color: "#374151",
    marginBottom: 6,
  },
  infoLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
});
