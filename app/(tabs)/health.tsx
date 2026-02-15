// app/health.tsx
// 🦷 TEDAVİ ÖNCESİ HASTA FORMU (DENTAL) - Wizard Form

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { useLanguage } from "../../lib/language-context";
import { Ionicons } from "@expo/vector-icons";

type HealthFormData = {
  // Step 1: Personal Info (confirmation)
  personalInfo?: {
    name?: string;
    birthDate?: string;
    gender?: string;
    phone?: string;
    email?: string;
    country?: string;
  };
  // Step 2: General Health
  generalHealth?: {
    conditions: string[];
    conditionsNotes?: string;
    pregnancyMonth?: number | null;
  };
  // Step 3: Medications & Allergies
  medications?: {
    regularMedication: boolean;
    bloodThinner: boolean;
    cortisone: boolean;
    antibiotics: boolean;
    none: boolean;
    medicationDetails?: string;
  };
  allergies?: {
    localAnesthesia: boolean;
    penicillin: boolean;
    latex: boolean;
    other: boolean;
    none: boolean;
    allergyDetails?: string;
  };
  // Step 4: Dental History & Complaint & Habits & Consent
  dentalHistory?: {
    previousProblems: boolean;
    anesthesiaProblems: boolean;
    previousProcedures: boolean;
  };
  complaint?: {
    mainComplaint?: string;
    painLevel?: "none" | "mild" | "moderate" | "severe";
  };
  habits?: {
    smoking: boolean;
    cigarettesPerDay?: number;
    alcohol: "none" | "occasional" | "regular";
  };
  consent?: {
    infoAccurate: boolean;
    planMayChange: boolean;
    dataUsage: boolean;
  };
};

const HEALTH_CONDITIONS = [
  "diabetes",
  "heart_disease",
  "hypertension",
  "bleeding_disorder",
  "asthma",
  "epilepsy",
  "kidney_disease",
  "liver_disease",
  "thyroid",
  "immune_system",
  "cancer",
  "pregnancy",
  "none",
];

export default function Health() {
  const { user, isAuthReady, isDoctor, isPatient } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<HealthFormData>({});
  const [patientId, setPatientId] = useState("");
  const [isComplete, setIsComplete] = useState(false);
  const [canProceed, setCanProceed] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const aliveRef = useRef(true);
  const validationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Role-based redirect
  useEffect(() => {
    if (!isAuthReady) return;
    
    // Doctors cannot access health form
    if (isDoctor) {
      router.replace("/doctor-dashboard");
      return;
    }
    
    // Only patients can access
    if (!isPatient) {
      router.replace("/login");
      return;
    }
  }, [isAuthReady, isDoctor, isPatient, router]);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.token || !isAuthReady || !isPatient) {
      setLoading(false);
      return;
    }

    loadHealthForm();
  }, [user?.token]);

  const loadHealthForm = async () => {
    try {
      // Get patientId
      let pid = user?.id || "";
      if (!pid) {
        const meRes = await fetch(`${API_BASE}/api/patient/me`, {
          headers: { Authorization: `Bearer ${user?.token}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          pid = meData.patientId || "";
        }
      }

      if (!pid) {
        setLoading(false);
        return;
      }

      setPatientId(pid);

      // Load existing form
      const url = `${API_BASE}/api/patient/${pid}/health`;
      console.log("[HEALTH] Loading form from:", url);
      
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });

      console.log("[HEALTH] Load response status:", res.status);

      // Get patient name and phone from /api/patient/me
      let patientName = "";
      let patientPhone = "";
      try {
        const meRes = await fetch(`${API_BASE}/api/patient/me`, {
          headers: { Authorization: `Bearer ${user?.token}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          patientName = meData.name || "";
          patientPhone = meData.phone || "";
        }
      } catch (e) {
        console.warn("[HEALTH] Could not fetch patient info:", e);
      }

      if (res.ok) {
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          const existingFormData = data.formData || {};
          
          // Auto-fill name and phone from patient registration (read-only)
          if (patientName || patientPhone) {
            setFormData({
              ...existingFormData,
              personalInfo: {
                ...existingFormData.personalInfo,
                name: patientName || existingFormData.personalInfo?.name, // Always use registered name
                phone: patientPhone || existingFormData.personalInfo?.phone, // Always use registered phone
              },
            });
          } else if (data.formData) {
            setFormData(data.formData);
          }
          
          setIsComplete(data.isComplete || false);
        } else {
          const text = await res.text();
          console.warn("[HEALTH] Load response is not JSON:", text.substring(0, 200));
          
          // Even if health form doesn't exist, set patient name and phone
          if (patientName || patientPhone) {
            setFormData({
              personalInfo: {
                name: patientName,
                phone: patientPhone,
              },
            });
          }
        }
      } else {
        const text = await res.text();
        console.warn("[HEALTH] Load failed:", res.status, text.substring(0, 200));
        
        // Even if health form doesn't exist, set patient name and phone
        if (patientName || patientPhone) {
          setFormData({
            personalInfo: {
              name: patientName,
              phone: patientPhone,
            },
          });
        }
      }
    } catch (error) {
      console.error("[HEALTH] Load error:", error);
    } finally {
      if (aliveRef.current) {
        setLoading(false);
      }
    }
  };

  const saveForm = async (complete = false) => {
    if (!user?.token || !patientId) {
      console.warn("[HEALTH] Cannot save - missing token or patientId", {
        hasToken: !!user?.token,
        patientId,
      });
      return false;
    }

    setSaving(true);
    try {
      const url = `${API_BASE}/api/patient/${patientId}/health`;
      console.log("[HEALTH] Saving form to:", url);
      
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          formData,
          isComplete: complete,
        }),
      });

      console.log("[HEALTH] Save response status:", res.status, res.statusText);
      console.log("[HEALTH] Save response headers:", {
        contentType: res.headers.get("content-type"),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[HEALTH] Save failed - response text:", text.substring(0, 200));
        
        // Try to parse as JSON, but handle HTML errors
        let errorMessage = t("health.formCouldNotBeSaved");
        try {
          const errorData = JSON.parse(text);
          errorMessage = errorData.message || errorData.error || errorMessage;
        } catch (e) {
          // If it's HTML or not JSON, show generic error
          if (res.status === 404) {
            errorMessage = t("health.endpointNotFound");
          } else if (res.status === 500) {
            errorMessage = t("health.serverError");
          }
        }
        
        Alert.alert(t("health.error"), errorMessage);
        return false;
      }

      // Check if response is JSON
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.error("[HEALTH] Save response is not JSON:", text.substring(0, 200));
        Alert.alert(t("health.error"), t("health.unexpectedResponse"));
        return false;
      }

      const data = await res.json();
      console.log("[HEALTH] Save success:", { isComplete: data.isComplete });
      setIsComplete(data.isComplete || false);
      return true;
    } catch (error) {
      console.error("[HEALTH] Save error:", error);
      Alert.alert(t("health.error"), t("health.formCouldNotBeSaved") + ". " + t("health.connectionError"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    // Validate current step before proceeding
    if (!canProceed) {
      const stepNames = [t("health.personalInformation"), t("health.generalHealthStatus"), t("health.medicationsAllergies"), t("health.dentalHistoryComplaint")];
      const stepName = stepNames[currentStep - 1];
      Alert.alert(
        t("health.missingInformation"), 
        `${t("health.fillRequiredFields")} ${stepName}.${missingFields.length > 0 ? `\n\n${t("health.missingFields")}: ${missingFields.join(', ')}` : ''}`
      );
      return;
    }

    // Auto-save on step change
    await saveForm(false);

    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      // Final step - complete form
      const canComplete = validateForm();
      if (canComplete) {
        const saved = await saveForm(true);
        if (saved) {
          setIsComplete(true);
          Alert.alert(t("health.success"), t("health.formCompleted"), [
            { text: t("common.ok") },
          ]);
        }
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Validate current step
  const validateCurrentStep = (): boolean => {
    if (currentStep === 1) {
      // Step 1: Personal Info - birthDate and gender are required
      if (!formData.personalInfo?.birthDate || !formData.personalInfo?.gender) {
        return false;
      }
    } else if (currentStep === 2) {
      // Step 2: General Health - at least one condition must be selected
      const conditions = formData.generalHealth?.conditions || [];
      if (conditions.length === 0) {
        return false;
      }
    } else if (currentStep === 3) {
      // Step 3: Medications & Allergies - at least one option must be selected for each
      const medications = formData.medications || {};
      const allergies = formData.allergies || {};
      const hasMedication = medications.regularMedication || medications.bloodThinner || 
                           medications.cortisone || medications.antibiotics || medications.none;
      const hasAllergy = allergies.localAnesthesia || allergies.penicillin || 
                        allergies.latex || allergies.other || allergies.none;
      if (!hasMedication || !hasAllergy) {
        return false;
      }
    } else if (currentStep === 4) {
      // Step 4: Consent - all three must be checked (must be true, not just truthy)
      const consent = formData.consent || {};
      if (consent.infoAccurate !== true || consent.planMayChange !== true || consent.dataUsage !== true) {
        console.log('[HEALTH] Step 4 validation failed:', {
          infoAccurate: consent.infoAccurate,
          planMayChange: consent.planMayChange,
          dataUsage: consent.dataUsage
        });
        return false;
      }
    }
    return true;
  };

  // Validate current step using client-side validation
  const validateFormWithBackend = async () => {
    // Use client-side validation for simplicity and reliability
    const isValid = validateCurrentStep();
    setCanProceed(isValid);
    
    if (!isValid) {
      // Set missing fields based on current step
      if (currentStep === 1) {
        const missing: string[] = [];
        if (!formData.personalInfo?.birthDate) missing.push(t("health.personalInformation"));
        if (!formData.personalInfo?.gender) missing.push(t("health.personalInformation"));
        setMissingFields(missing);
      } else if (currentStep === 2) {
        const conditions = formData.generalHealth?.conditions || [];
        if (conditions.length === 0) {
          setMissingFields(['Please select at least one health condition']);
        } else {
          setMissingFields([]);
        }
      } else if (currentStep === 3) {
        const missing: string[] = [];
        const medications = formData.medications || {};
        const allergies = formData.allergies || {};
        const hasMedication = medications.regularMedication || medications.bloodThinner || 
                             medications.cortisone || medications.antibiotics || medications.none;
        const hasAllergy = allergies.localAnesthesia || allergies.penicillin || 
                          allergies.latex || allergies.other || allergies.none;
        if (!hasMedication) missing.push('Medication usage');
        if (!hasAllergy) missing.push('Allergy status');
        setMissingFields(missing);
      } else if (currentStep === 4) {
        const missing: string[] = [];
        if (!formData.consent?.infoAccurate) missing.push('Information accuracy');
        if (!formData.consent?.planMayChange) missing.push('Treatment plan changes');
        if (!formData.consent?.dataUsage) missing.push('Data usage');
        setMissingFields(missing);
      }
    } else {
      setMissingFields([]);
    }
  };

  // Validate form (for final step)
  const validateForm = (): boolean => {
    if (currentStep === 4) {
      const consent = formData.consent || {};
      if (consent.infoAccurate !== true || consent.planMayChange !== true || consent.dataUsage !== true) {
        Alert.alert(t("health.missingInformation"), t("health.checkAllConsent"));
        return false;
      }
    }
    return true;
  };

  const updateFormData = (section: keyof HealthFormData, data: any) => {
    setFormData((prev) => {
      const updated = {
        ...prev,
        [section]: { ...prev[section], ...data },
      };
      
      // Debounce validation
      clearTimeout(validationTimeoutRef.current);
      validationTimeoutRef.current = setTimeout(() => {
        validateFormWithBackend();
      }, 300);
      
      return updated;
    });
  };

  // Validate when step changes
  useEffect(() => {
    validateFormWithBackend();
  }, [currentStep, formData, user?.token, patientId]);

  if (!isAuthReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  // Redirect doctors away from health form
  if (isDoctor) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yönlendiriliyor...</Text>
      </View>
    );
  }

  // Redirect non-patients
  if (!isPatient) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yönlendiriliyor...</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>{t("health.loadingText")}</Text>
      </View>
    );
  }

  if (isComplete) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons name="checkmark-circle" size={64} color="#10B981" />
        <Text style={styles.completeTitle}>{t("health.formCompleted")}</Text>
        <Text style={styles.completeText}>{t("health.formCompletedMessage")}</Text>
        <Pressable style={styles.button} onPress={() => router.replace("/home")}>
          <Text style={styles.buttonText}>{t("health.returnToHome")}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={100}
    >
      <View style={styles.header}>
        <Text style={styles.title}>🦷 {t("health.preTreatmentForm")}</Text>
        <View style={styles.progressBar}>
          {[1, 2, 3, 4].map((step) => (
            <View
              key={step}
              style={[
                styles.progressStep,
                step <= currentStep && styles.progressStepActive,
              ]}
            />
          ))}
        </View>
        <Text style={styles.stepText}>
          {t("health.step")} {currentStep} / 4
        </Text>
      </View>

      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        {currentStep === 1 && <Step1PersonalInfo formData={formData} updateFormData={updateFormData} />}
        {currentStep === 2 && <Step2GeneralHealth formData={formData} updateFormData={updateFormData} />}
        {currentStep === 3 && <Step3MedicationsAllergies formData={formData} updateFormData={updateFormData} />}
        {currentStep === 4 && <Step4DentalComplaintConsent formData={formData} updateFormData={updateFormData} />}
      </ScrollView>

      <View style={styles.footer}>
        {currentStep > 1 && (
          <Pressable style={styles.backButton} onPress={handleBack} disabled={saving}>
            <Text style={styles.backButtonText}>{t("health.back")}</Text>
          </Pressable>
        )}
        <Pressable
          style={[
            styles.nextButton, 
            (saving || !canProceed) && styles.nextButtonDisabled
          ]}
          onPress={handleNext}
          disabled={saving || !canProceed}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.nextButtonText}>
              {currentStep === 4 ? t("health.complete") : t("health.next")}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// Step 1: Personal Info (Confirmation)
function Step1PersonalInfo({
  formData,
  updateFormData,
}: {
  formData: HealthFormData;
  updateFormData: (section: keyof HealthFormData, data: any) => void;
}) {
  const { t } = useLanguage();
  const personalInfo = formData.personalInfo || {};

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>1️⃣ {t("health.personalInformation")}</Text>
      <Text style={styles.stepDescription}>
        {t("health.reviewAndUpdate")}
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("health.fullName")}</Text>
        <TextInput
          style={[styles.input, styles.inputReadOnly]}
          value={personalInfo.name || ""}
          editable={false}
          placeholder={t("health.fullNamePlaceholder")}
        />
        <Text style={styles.readOnlyHint}>{t("health.registeredName")}</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("health.dateOfBirth")}</Text>
        <TextInput
          style={styles.input}
          value={personalInfo.birthDate || ""}
          onChangeText={(text) =>
            updateFormData("personalInfo", { birthDate: text })
          }
          placeholder={t("health.dateOfBirthPlaceholder")}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("health.gender")}</Text>
        <View style={styles.radioGroup}>
          {[
            { value: "Male", label: t("health.male") },
            { value: "Female", label: t("health.female") },
            { value: "Other", label: t("health.other") },
          ].map((item) => (
            <Pressable
              key={item.value}
              style={[
                styles.radioOption,
                personalInfo.gender === item.value && styles.radioOptionSelected,
              ]}
              onPress={() => updateFormData("personalInfo", { gender: item.value })}
            >
              <Text
                style={[
                  styles.radioText,
                  personalInfo.gender === item.value && styles.radioTextSelected,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("health.phoneWhatsApp")}</Text>
        <TextInput
          style={[styles.input, styles.inputReadOnly]}
          value={personalInfo.phone || ""}
          editable={false}
          placeholder={t("health.phonePlaceholder")}
          keyboardType="phone-pad"
        />
        <Text style={styles.readOnlyHint}>{t("health.registeredPhone")}</Text>
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("health.email")}</Text>
        <TextInput
          style={styles.input}
          value={personalInfo.email || ""}
          onChangeText={(text) =>
            updateFormData("personalInfo", { email: text })
          }
          placeholder={t("health.emailPlaceholder")}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("health.country")}</Text>
        <TextInput
          style={styles.input}
          value={personalInfo.country || ""}
          onChangeText={(text) =>
            updateFormData("personalInfo", { country: text })
          }
          placeholder={t("health.countryPlaceholder")}
        />
      </View>
    </View>
  );
}

// Step 2: General Health
function Step2GeneralHealth({
  formData,
  updateFormData,
}: {
  formData: HealthFormData;
  updateFormData: (section: keyof HealthFormData, data: any) => void;
}) {
  const generalHealth = formData.generalHealth || { conditions: [] };
  const conditions = generalHealth.conditions || [];

  const toggleCondition = (condition: string) => {
    let newConditions = [...conditions];
    if (condition === "none") {
      newConditions = ["none"];
    } else {
      newConditions = newConditions.filter((c) => c !== "none");
      if (newConditions.includes(condition)) {
        newConditions = newConditions.filter((c) => c !== condition);
      } else {
        newConditions.push(condition);
      }
      if (newConditions.length === 0) {
        newConditions = ["none"];
      }
    }
    updateFormData("generalHealth", { conditions: newConditions });
  };

  const hasAnyCondition = conditions.length > 0 && !conditions.includes("none");

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>2️⃣ {t("health.generalHealthStatus")}</Text>
      <Text style={styles.stepDescription}>
        {t("health.anyConditions")}
      </Text>

      {HEALTH_CONDITIONS.map((condition) => {
        const label = t(`health.condition.${condition}`);

        return (
          <Pressable
            key={condition}
            style={styles.checkboxRow}
            onPress={() => toggleCondition(condition)}
          >
            <View
              style={[
                styles.checkbox,
                conditions.includes(condition) && styles.checkboxChecked,
              ]}
            >
              {conditions.includes(condition) && (
                <Ionicons name="checkmark" size={16} color="#FFFFFF" />
              )}
            </View>
            <Text style={styles.checkboxLabel}>{label}</Text>
          </Pressable>
        );
      })}

      {conditions.includes("pregnancy") && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t("health.pregnancyMonth")}</Text>
          <TextInput
            style={styles.input}
            value={
              generalHealth.pregnancyMonth
                ? String(generalHealth.pregnancyMonth)
                : ""
            }
            onChangeText={(text) => {
              const month = text ? parseInt(text, 10) : null;
              updateFormData("generalHealth", {
                pregnancyMonth: month && month > 0 ? month : null,
              });
            }}
            placeholder={t("health.pregnancyMonthPlaceholder")}
            keyboardType="number-pad"
          />
        </View>
      )}

      {hasAnyCondition && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t("health.brieflyExplain")}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={generalHealth.conditionsNotes || ""}
            onChangeText={(text) =>
              updateFormData("generalHealth", { conditionsNotes: text })
            }
            placeholder={t("health.notesPlaceholder")}
            multiline
            numberOfLines={4}
          />
        </View>
      )}
    </View>
  );
}

// Step 3: Medications & Allergies
function Step3MedicationsAllergies({
  formData,
  updateFormData,
}: {
  formData: HealthFormData;
  updateFormData: (section: keyof HealthFormData, data: any) => void;
}) {
  const medications = formData.medications || {
    regularMedication: false,
    bloodThinner: false,
    cortisone: false,
    antibiotics: false,
    none: false,
  };

  const allergies = formData.allergies || {
    localAnesthesia: false,
    penicillin: false,
    latex: false,
    other: false,
    none: false,
  };

  const toggleMedication = (key: keyof typeof medications) => {
    if (key === "none") {
      updateFormData("medications", {
        regularMedication: false,
        bloodThinner: false,
        cortisone: false,
        antibiotics: false,
        none: true,
      });
    } else {
      updateFormData("medications", {
        ...medications,
        [key]: !medications[key],
        none: false,
      });
    }
  };

  const toggleAllergy = (key: keyof typeof allergies) => {
    if (key === "none") {
      updateFormData("allergies", {
        localAnesthesia: false,
        penicillin: false,
        latex: false,
        other: false,
        none: true,
      });
    } else {
      updateFormData("allergies", {
        ...allergies,
        [key]: !allergies[key],
        none: false,
      });
    }
  };

  const hasMedication =
    medications.regularMedication ||
    medications.bloodThinner ||
    medications.cortisone ||
    medications.antibiotics;

  const hasAllergy =
    allergies.localAnesthesia ||
    allergies.penicillin ||
    allergies.latex ||
    allergies.other;

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>3️⃣ {t("health.medicationsAllergies")}</Text>

      <Text style={styles.sectionTitle}>{t("health.medicationsUsed")}</Text>
      {[
        { key: "regularMedication", label: t("health.medication.regular") },
        {
          key: "bloodThinner",
          label: t("health.medication.bloodThinner"),
        },
        { key: "cortisone", label: t("health.medication.cortisone") },
        {
          key: "antibiotics",
          label: t("health.medication.antibiotics"),
        },
        { key: "none", label: t("health.medication.none") },
      ].map((item) => (
        <Pressable
          key={item.key}
          style={styles.checkboxRow}
          onPress={() => toggleMedication(item.key as keyof typeof medications)}
        >
          <View
            style={[
              styles.checkbox,
              medications[item.key as keyof typeof medications] &&
                styles.checkboxChecked,
            ]}
          >
            {medications[item.key as keyof typeof medications] && (
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.checkboxLabel}>{item.label}</Text>
        </Pressable>
      ))}

      {hasMedication && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>
            {t("health.medicationNameDosage")}
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={medications.medicationDetails || ""}
            onChangeText={(text) =>
              updateFormData("medications", { medicationDetails: text })
            }
            placeholder={t("health.medicationPlaceholder")}
            multiline
            numberOfLines={3}
          />
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t("health.allergies")}</Text>
      {[
        { key: "localAnesthesia", label: t("health.allergy.localAnesthesia") },
        { key: "penicillin", label: t("health.allergy.penicillin") },
        { key: "latex", label: t("health.allergy.latex") },
        { key: "other", label: t("health.allergy.other") },
        { key: "none", label: t("health.allergy.none") },
      ].map((item) => (
        <Pressable
          key={item.key}
          style={styles.checkboxRow}
          onPress={() => toggleAllergy(item.key as keyof typeof allergies)}
        >
          <View
            style={[
              styles.checkbox,
              allergies[item.key as keyof typeof allergies] &&
                styles.checkboxChecked,
            ]}
          >
            {allergies[item.key as keyof typeof allergies] && (
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.checkboxLabel}>{item.label}</Text>
        </Pressable>
      ))}

      {hasAllergy && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t("health.details")}</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={allergies.allergyDetails || ""}
            onChangeText={(text) =>
              updateFormData("allergies", { allergyDetails: text })
            }
            placeholder={t("health.allergyDetailsPlaceholder")}
            multiline
            numberOfLines={3}
          />
        </View>
      )}
    </View>
  );
}

// Step 4: Dental History, Complaint, Habits, Consent
function Step4DentalComplaintConsent({
  formData,
  updateFormData,
}: {
  formData: HealthFormData;
  updateFormData: (section: keyof HealthFormData, data: any) => void;
}) {
  const dentalHistory = formData.dentalHistory || {
    previousProblems: false,
    anesthesiaProblems: false,
    previousProcedures: false,
  };

  const complaint = formData.complaint || {};
  const habits = formData.habits || {
    smoking: false,
    alcohol: "none",
  };
  const consent = formData.consent || {
    infoAccurate: false,
    planMayChange: false,
    dataUsage: false,
  };

  return (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>4️⃣ {t("health.dentalHistoryComplaint")}</Text>

      <Text style={styles.sectionTitle}>{t("health.dentalHistory")}</Text>
      <Text style={styles.question}>
        {t("health.problemsPrevious")}
      </Text>
      <View style={styles.radioGroup}>
        {[
          { value: true, label: t("health.yes") },
          { value: false, label: t("health.no") },
        ].map((item) => (
          <Pressable
            key={String(item.value)}
              style={[
                styles.radioOption,
                dentalHistory.previousProblems === item.value &&
                  styles.radioOptionSelected,
              ]}
            onPress={() =>
              updateFormData("dentalHistory", {
                previousProblems: item.value,
              })
            }
          >
            <Text
              style={[
                styles.radioText,
                dentalHistory.previousProblems === item.value &&
                  styles.radioTextSelected,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.question}>
        {t("health.badExperienceAnesthesia")}
      </Text>
      <View style={styles.radioGroup}>
        {[
          { value: true, label: t("health.yes") },
          { value: false, label: t("health.no") },
        ].map((item) => (
          <Pressable
            key={String(item.value)}
            style={[
              styles.radioOption,
              dentalHistory.anesthesiaProblems === item.value &&
                styles.radioOptionSelected,
            ]}
            onPress={() =>
              updateFormData("dentalHistory", {
                anesthesiaProblems: item.value,
              })
            }
          >
            <Text
              style={[
                styles.radioText,
                dentalHistory.anesthesiaProblems === item.value &&
                  styles.radioTextSelected,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.question}>
        {t("health.previousProcedures")}
      </Text>
      <View style={styles.radioGroup}>
        {[
          { value: true, label: t("health.yes") },
          { value: false, label: t("health.no") },
        ].map((item) => (
          <Pressable
            key={String(item.value)}
            style={[
              styles.radioOption,
              dentalHistory.previousProcedures === item.value &&
                styles.radioOptionSelected,
            ]}
            onPress={() =>
              updateFormData("dentalHistory", {
                previousProcedures: item.value,
              })
            }
          >
            <Text
              style={[
                styles.radioText,
                dentalHistory.previousProcedures === item.value &&
                  styles.radioTextSelected,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        {t("health.currentComplaint")}
      </Text>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>{t("health.mainComplaint")}</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={complaint.mainComplaint || ""}
          onChangeText={(text) =>
            updateFormData("complaint", { mainComplaint: text })
          }
          placeholder={t("health.complaintPlaceholder")}
          multiline
          numberOfLines={4}
        />
      </View>

      <Text style={styles.label}>{t("health.isTherePain")}</Text>
      <View style={styles.radioGroup}>
        {["none", "mild", "moderate", "severe"].map((level) => {
          const labels = {
            none: t("health.none"),
            mild: t("health.mild"),
            moderate: t("health.moderate"),
            severe: t("health.severe"),
          };
          return (
            <Pressable
              key={level}
              style={[
                styles.radioOption,
                complaint.painLevel === level && styles.radioOptionSelected,
              ]}
              onPress={() =>
                updateFormData("complaint", {
                  painLevel: level as "none" | "mild" | "moderate" | "severe",
                })
              }
            >
              <Text
                style={[
                  styles.radioText,
                  complaint.painLevel === level && styles.radioTextSelected,
                ]}
              >
                {labels[level as keyof typeof labels]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t("health.habits")}</Text>
      <Text style={styles.question}>{t("health.doYouSmoke")}</Text>
      <View style={styles.radioGroup}>
        {[
          { value: false, label: t("health.no") },
          { value: true, label: t("health.yes") },
        ].map((item) => (
          <Pressable
            key={String(item.value)}
            style={[
              styles.radioOption,
              habits.smoking === item.value &&
                styles.radioOptionSelected,
            ]}
            onPress={() =>
              updateFormData("habits", { smoking: item.value })
            }
          >
            <Text
              style={[
                styles.radioText,
                habits.smoking === item.value &&
                  styles.radioTextSelected,
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {habits.smoking && (
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{t("health.howManyPerDay")}</Text>
          <TextInput
            style={styles.input}
            value={
              habits.cigarettesPerDay ? String(habits.cigarettesPerDay) : ""
            }
            onChangeText={(text) =>
              updateFormData("habits", {
                cigarettesPerDay: text ? parseInt(text, 10) : undefined,
              })
            }
            placeholder={t("health.cigarettesPlaceholder")}
            keyboardType="number-pad"
          />
        </View>
      )}

      <Text style={styles.question}>{t("health.alcoholConsumption")}</Text>
      <View style={styles.radioGroup}>
        {["none", "occasional", "regular"].map((level) => {
          const labels = {
            none: t("health.noLabel"),
            occasional: t("health.occasional"),
            regular: t("health.regular"),
          };
          return (
            <Pressable
              key={level}
              style={[
                styles.radioOption,
                habits.alcohol === level && styles.radioOptionSelected,
              ]}
              onPress={() =>
                updateFormData("habits", {
                  alcohol: level as "none" | "occasional" | "regular",
                })
              }
            >
              <Text
                style={[
                  styles.radioText,
                  habits.alcohol === level && styles.radioTextSelected,
                ]}
              >
                {labels[level as keyof typeof labels]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
        {t("health.consentInformation")}
      </Text>
      {[
        {
          key: "infoAccurate",
          label: t("health.infoAccurate"),
        },
        {
          key: "planMayChange",
          label: t("health.planMayChange"),
        },
        {
          key: "dataUsage",
          label: t("health.dataUsage"),
        },
      ].map((item) => (
        <Pressable
          key={item.key}
          style={styles.checkboxRow}
          onPress={() =>
            updateFormData("consent", {
              [item.key]: !consent[item.key as keyof typeof consent],
            })
          }
        >
          <View
            style={[
              styles.checkbox,
              consent[item.key as keyof typeof consent] &&
                styles.checkboxChecked,
            ]}
          >
            {consent[item.key as keyof typeof consent] && (
              <Ionicons name="checkmark" size={16} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.checkboxLabel}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFFFFF",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
  },
  completeTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#10B981",
    marginTop: 16,
    marginBottom: 8,
  },
  completeText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 24,
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: "#F9FAFB",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 16,
  },
  progressBar: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
  },
  progressStepActive: {
    backgroundColor: "#2563EB",
  },
  stepText: {
    fontSize: 14,
    color: "#6B7280",
    marginTop: 8,
  },
  content: {
    flex: 1,
  },
  stepContainer: {
    padding: 20,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginTop: 16,
    marginBottom: 12,
  },
  question: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginTop: 16,
    marginBottom: 8,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#111827",
    backgroundColor: "#FFFFFF",
  },
  inputReadOnly: {
    backgroundColor: "#F3F4F6",
    color: "#6B7280",
  },
  readOnlyHint: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    fontStyle: "italic",
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: "top",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 4,
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: "#374151",
  },
  radioGroup: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  radioOption: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    alignItems: "center",
  },
  radioOptionSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  radioText: {
    fontSize: 14,
    color: "#374151",
  },
  radioTextSelected: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    gap: 12,
  },
  backButton: {
    flex: 1,
    padding: 16,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
  },
  nextButton: {
    flex: 2,
    padding: 16,
    backgroundColor: "#2563EB",
    borderRadius: 8,
    alignItems: "center",
  },
  nextButtonDisabled: {
    opacity: 0.5,
  },
  nextButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  button: {
    padding: 16,
    backgroundColor: "#2563EB",
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});

