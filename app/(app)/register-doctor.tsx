// app/register-doctor.tsx
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { handleDoctorRegistration } from "../../lib/doctor/register";
import { useAuth } from "../../lib/auth";
import { useLanguage } from "../../lib/language-context";

export default function RegisterDoctorScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    password: "",
    clinicCode: "",
    licenseNumber: "",
    department: "Dentistry",
    specialties: "General",
  });
  const [showPassword, setShowPassword] = useState(false);

  const isFormValid = formData.fullName.trim() &&
                    formData.phone.trim() &&
                    formData.email.trim().includes("@") &&
                    formData.password.trim().length >= 6 &&
                    formData.clinicCode.trim() &&
                    formData.licenseNumber.trim();

  const handleRegister = async () => {
    if (!isFormValid) {
      Alert.alert(t('login.error'), t('register.fillRequired'));
      return;
    }

    console.log('[DOCTOR REG] Form data:', formData);
    console.log('[DOCTOR REG] Clinic code:', formData.clinicCode.trim());

    setLoading(true);
    try {
      const result = await handleDoctorRegistration({
        name: formData.fullName.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim(),
        password: formData.password.trim(),
        clinicCode: formData.clinicCode.trim(),
        licenseNumber: formData.licenseNumber.trim(),
        department: formData.department.trim(),
        specialties: formData.specialties.trim(),
      });

      if (result.ok) {
        // Check if doctor is already approved
        if (result.status === 'APPROVED' || result.status === 'ACTIVE') {
          if (result.token) {
            await signIn({
              token: result.token,
              doctorId: result.doctorId,
              clinicId: result.clinicId,
              role: "DOCTOR",
              type: "doctor",
              status: result.status,
            });
          }

          Alert.alert(
            t('register.success'),
            t('register.successApproved'),
            [
              {
                text: t('register.ok'),
                onPress: () => {
                  router.replace("/doctor");
                },
              },
            ]
          );
        } else {
          Alert.alert(
            t('register.pending'),
            t('register.pendingMessage'),
            [
              {
                text: t('register.ok'),
                onPress: () => {
                  router.replace("/login/doctor");
                },
              },
            ]
          );
        }
      } else {
        Alert.alert(t('login.error'), result.error || t('register.failed'));
      }
    } catch (error: any) {
      console.error("Doctor registration error:", error);
      
      if (error.message && error.message.includes("409")) {
        Alert.alert(
          t('register.alreadyExists'),
          t('register.alreadyExistsMessage'),
          [
            {
              text: t('register.goToLogin'),
              onPress: () => {
                router.replace("/login/doctor");
              },
            },
            {
              text: t('register.cancel'),
              style: "cancel"
            }
          ]
        );
      } else {
        Alert.alert(t('login.error'), error.message || t('register.failed'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('register.doctorTitle')}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>{t('auth.full_name')}</Text>
        <TextInput
          value={formData.fullName}
          onChangeText={(text) => setFormData({ ...formData, fullName: text })}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('auth.phone')}</Text>
        <TextInput
          value={formData.phone}
          onChangeText={(text) => setFormData({ ...formData, phone: text })}
          keyboardType="phone-pad"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('register.emailRequired')}</Text>
        <TextInput
          value={formData.email}
          onChangeText={(text) => setFormData({ ...formData, email: text })}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('auth.password_create')}</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            value={formData.password}
            onChangeText={(text) => setFormData({ ...formData, password: text })}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            style={styles.passwordInput}
          />
          <Pressable onPress={() => setShowPassword(p => !p)} style={styles.eyeBtn}>
            <Text style={styles.eyeText}>{showPassword ? "🙈" : "👁"}</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('auth.clinic_code')}</Text>
        <TextInput
          value={formData.clinicCode}
          onChangeText={(text) => setFormData({ ...formData, clinicCode: text.toUpperCase() })}
          autoCapitalize="characters"
          style={styles.input}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>{t('auth.license_number')}</Text>
        <TextInput
          value={formData.licenseNumber}
          onChangeText={(text) => setFormData({ ...formData, licenseNumber: text })}
          style={styles.input}
        />
      </View>

      <TouchableOpacity
        onPress={handleRegister}
        disabled={loading || !isFormValid}
        style={styles.registerButton}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.registerButtonText}>
            {t('register.submit')}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push("/register-patient")}
        style={styles.linkButton}
      >
        <Text style={styles.linkText}>
          {t('register.isPatient')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    color: "#111827",
  },
  field: {
    marginBottom: 16,
    width: "100%",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 15,
    borderRadius: 8,
    width: "100%",
    backgroundColor: "#fff",
  },
  registerButton: {
    backgroundColor: "#2563eb",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  registerButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  linkButton: {
    marginTop: 15,
    alignItems: "center",
  },
  linkText: {
    color: "#2563eb",
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  passwordInput: {
    flex: 1,
    padding: 15,
  },
  eyeBtn: {
    paddingHorizontal: 12,
  },
  eyeText: {
    fontSize: 18,
  },
});
