import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { useLanguage } from "../lib/language-context";
import type { ActiveClinic } from "../store/useClinicStore";
import { formatCountryDisplay } from "../lib/countryDisplay";

export type ClinicHeaderProps = {
  clinic: ActiveClinic | null;
  /** When false and clinic is null, render nothing (e.g. before hydration). */
  showDisconnected?: boolean;
  style?: ViewStyle;
  /** Optional small action (e.g. referrals later). */
  showReferButton?: boolean;
};

function InitialAvatar({ name }: { name: string }) {
  const letter = useMemo(() => {
    const ch = name.trim().charAt(0);
    return ch ? ch.toUpperCase() : "?";
  }, [name]);

  return (
    <View style={[styles.logoBox, styles.avatarFallback]}>
      <Text style={styles.avatarLetter}>{letter}</Text>
    </View>
  );
}

export function ClinicHeader({
  clinic,
  showDisconnected = true,
  style,
  showReferButton = true,
}: ClinicHeaderProps) {
  const { t } = useLanguage();
  const router = useRouter();
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => {
    setImgBroken(false);
  }, [clinic?.id, clinic?.logo_url]);

  if (!clinic) {
    if (!showDisconnected) return null;
    return (
      <View style={[styles.wrap, styles.disconnectedWrap, style]}>
        <Text style={styles.disconnectedText}>{t("home.clinicHeader.notConnected")}</Text>
      </View>
    );
  }

  const uri = clinic.logo_url && String(clinic.logo_url).trim() ? String(clinic.logo_url).trim() : "";
  const showImage = !!uri && !imgBroken;

  return (
    <View style={[styles.wrap, style]}>
      <Pressable
        onPress={() => router.push("/clinic-detail")}
        style={styles.rowPressable}
        accessibilityRole="button"
        accessibilityLabel={clinic.name}
      >
        {showImage ? (
          <Image
            source={{ uri }}
            style={styles.logo}
            accessibilityIgnoresInvertColors
            onError={() => setImgBroken(true)}
          />
        ) : (
          <InitialAvatar name={clinic.name} />
        )}
        <View style={styles.textCol}>
          <Text style={styles.name} numberOfLines={1}>
            {clinic.name}
          </Text>
          {!!clinic.country && (
            <Text style={styles.country} numberOfLines={1}>
              {formatCountryDisplay(clinic.country)}
            </Text>
          )}
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t("home.clinicHeader.connected")}</Text>
          </View>
        </View>
      </Pressable>
      {showReferButton ? (
        <Pressable
          onPress={() => router.push("/referrals")}
          style={styles.referBtn}
          hitSlop={8}
        >
          <Text style={styles.referBtnText}>{t("home.clinicHeader.refer")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 4,
    gap: 8,
  },
  disconnectedWrap: {
    paddingVertical: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  disconnectedText: {
    fontSize: 13,
    color: "#92400E",
    fontWeight: "600",
  },
  rowPressable: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
    gap: 12,
  },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: "hidden",
  },
  avatarFallback: {
    backgroundColor: "#E0E7FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "800",
    color: "#3730A3",
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 17,
    fontWeight: "800",
    color: "#111827",
  },
  country: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
  },
  badge: {
    alignSelf: "flex-start",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "#D1FAE5",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
  },
  referBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  referBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#1D4ED8",
  },
});
