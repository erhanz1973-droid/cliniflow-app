// app/waiting-approval.tsx
// "Waiting for clinic approval" screen - shown when patient status is PENDING

import React, { useEffect, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";

export default function WaitingApprovalScreen() {
  const router = useRouter();
  const { user, signOut, isAuthReady } = useAuth();
  const intervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const isRedirectingRef = React.useRef(false);
  const [networkError, setNetworkError] = useState(false);
  const failureCountRef = React.useRef(0);
  const nextCheckAtRef = React.useRef(0);

  const checkStatus = useCallback(async () => {
    if (!user?.token) {
      console.log("[WAITING-APPROVAL] No token, skipping status check");
      return;
    }

    // Prevent multiple redirects
    if (isRedirectingRef.current) {
      console.log("[WAITING-APPROVAL] Already redirecting, skipping check");
      return;
    }

    const nowTs = Date.now();
    if (nowTs < nextCheckAtRef.current) {
      return;
    }

    try {
      console.log("[WAITING-APPROVAL] Checking status...");
      const res = await fetch(`${API_BASE}/api/patient/me`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        console.error("[WAITING-APPROVAL] Failed to check status:", res.status);
        return;
      }

      const data = await res.json();
      console.log("[WAITING-APPROVAL] Status check response:", {
        ok: data.ok,
        status: data.status,
        patientId: data.patientId,
      });
      failureCountRef.current = 0;
      nextCheckAtRef.current = 0;
      setNetworkError(false);

      if (data.ok && data.status === "APPROVED") {
        // Status approved, stop interval and redirect to home
        console.log("[WAITING-APPROVAL] Patient approved! Stopping interval and redirecting to home");
        isRedirectingRef.current = true;
        
        // Clear interval immediately
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        
        // Redirect to home immediately
        console.log("[WAITING-APPROVAL] Executing redirect to /home");
        router.replace("/home");
      } else if (data.status === "REJECTED") {
        // Status rejected, show message and allow logout
        console.log("[WAITING-APPROVAL] Patient rejected");
        // TODO: Show rejection message to user
      } else {
        console.log("[WAITING-APPROVAL] Status still pending:", data.status);
      }
    } catch (error) {
      const message = String((error as any)?.message || "");
      const isNetErr = message.toLowerCase().includes("network request failed");
      console.error("[WAITING-APPROVAL] Error checking status:", error);
      if (isNetErr) {
        failureCountRef.current += 1;
        const backoffMs = Math.min(30000, 1000 * 2 ** Math.min(failureCountRef.current, 5));
        nextCheckAtRef.current = Date.now() + backoffMs;
        setNetworkError(true);
      }
    }
  }, [user?.token, router]);

  useEffect(() => {
    // Wait for auth to be ready before checking status
    if (!isAuthReady) {
      console.log("[WAITING-APPROVAL] Auth not ready yet, waiting...");
      return;
    }
    
    // Check status immediately on mount (only if we have a token)
    if (!user?.token) {
      console.log("[WAITING-APPROVAL] No token in useEffect, skipping");
      return; // No token, don't check status
    }
    
    // Don't set up interval if already redirecting
    if (isRedirectingRef.current) {
      console.log("[WAITING-APPROVAL] Already redirecting, skipping interval setup");
      return;
    }
    
    console.log("[WAITING-APPROVAL] Setting up status check interval");
    
    // Initial check
    checkStatus();
    
    // Then check status every 3 seconds (more frequent for faster response)
    const interval = setInterval(() => {
      // Don't check if already redirecting
      if (isRedirectingRef.current) {
        console.log("[WAITING-APPROVAL] Already redirecting, clearing interval");
        clearInterval(interval);
        intervalRef.current = null;
        return;
      }
      
      if (user?.token) {
        console.log("[WAITING-APPROVAL] Interval check triggered");
        checkStatus();
      } else {
        console.log("[WAITING-APPROVAL] No token in interval, skipping");
      }
    }, 3000); // Check every 3 seconds instead of 5
    
    // Store interval reference
    intervalRef.current = interval;
    
    return () => {
      console.log("[WAITING-APPROVAL] Cleaning up interval");
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthReady, user?.token, checkStatus]); // Re-run if auth ready, token or checkStatus changes

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>⏳</Text>
        </View>

        <Text style={styles.title}>Onay Bekleniyor</Text>
        <Text style={styles.subtitle}>
          Hesabınız klinik tarafından onaylanmayı bekliyor.
        </Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>📋 Durum Bilgisi</Text>
          <Text style={styles.infoText}>
            Kaydınız başarıyla oluşturuldu. Klinik yönetimi hesabınızı inceleyip
            onayladıktan sonra uygulamanın tüm özelliklerini kullanabileceksiniz.
          </Text>
        </View>

        {networkError ? (
          <View style={styles.networkBox}>
            <Text style={styles.networkText}>
              Bağlantı sorunu: Sunucuya ulaşılamıyor. İnternet bağlantınızı kontrol edin.
            </Text>
          </View>
        ) : null}

        <Pressable style={styles.logoutButton} onPress={signOut}>
          <Text style={styles.logoutButtonText}>Çıkış Yap</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#F5F5F5",
    justifyContent: "center",
    padding: 20,
  },
  content: {
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  icon: {
    fontSize: 80,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  infoBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 20,
  },
  networkBox: {
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  networkText: {
    color: "#B91C1C",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  // Status check UI styles removed
  logoutButton: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  logoutButtonText: {
    color: "#6B7280",
    textAlign: "center",
    fontWeight: "600",
    fontSize: 16,
  },
});

