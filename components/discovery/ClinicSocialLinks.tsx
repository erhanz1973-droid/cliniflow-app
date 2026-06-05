import React, { useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { normalizeExternalUrl } from "../../lib/normalizeExternalUrl";

export type ClinicSocialLinkInput = {
  websiteUrl?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  linkedinUrl?: string | null;
  youtubeUrl?: string | null;
  googleReviewsUrl?: string | null;
  googleMapsUrl?: string | null;
};

type SocialItem = {
  id: string;
  url: string;
  label: string;
  bg: string;
  color: string;
  border: string;
};

type Props = {
  links: ClinicSocialLinkInput;
  onOpen: (url: string) => void;
  style?: StyleProp<ViewStyle>;
  sectionTitle?: string;
  labels: {
    website: string;
    facebook: string;
    instagram: string;
    tiktok: string;
    linkedin: string;
    youtube: string;
    google: string;
    map: string;
  };
};

function resolveUrl(v: string | null | undefined): string | null {
  return normalizeExternalUrl(v);
}

export function ClinicSocialLinks({ links, onOpen, style, sectionTitle, labels }: Props) {
  const items: SocialItem[] = useMemo(() => {
    const out: SocialItem[] = [];

    const push = (
      id: string,
      url: string | null | undefined,
      label: string,
      bg: string,
      color: string,
      border: string,
    ) => {
      const resolved = resolveUrl(url);
      if (!resolved) return;
      out.push({ id, url: resolved, label, bg, color, border });
    };

    push("website", links.websiteUrl, labels.website, "#EFF6FF", "#1D4ED8", "#BFDBFE");
    push("facebook", links.facebookUrl, labels.facebook, "#E7F0FF", "#1877F2", "#93C5FD");
    push("instagram", links.instagramUrl, labels.instagram, "#FCE7F3", "#DB2777", "#F9A8D4");
    push("tiktok", links.tiktokUrl, labels.tiktok, "#F3F4F6", "#111827", "#D1D5DB");
    push("linkedin", links.linkedinUrl, labels.linkedin, "#E0F2FE", "#0A66C2", "#7DD3FC");
    push("youtube", links.youtubeUrl, labels.youtube, "#FEE2E2", "#DC2626", "#FCA5A5");
    push("google", links.googleReviewsUrl, labels.google, "#E8F0FE", "#4285F4", "#93C5FD");
    push("map", links.googleMapsUrl, labels.map, "#ECFDF5", "#047857", "#6EE7B7");

    return out;
  }, [links, labels]);

  useEffect(() => {
    if (__DEV__ && items.length) {
      console.log(
        "[ClinicSocialLinks]",
        items.map((i) => `${i.id}:${i.label}`).join(", "),
      );
    }
  }, [items]);

  if (!items.length) return null;

  return (
    <View style={[styles.wrap, style]}>
      {sectionTitle ? <Text style={styles.sectionTitle}>{sectionTitle}</Text> : null}
      <View style={styles.row}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.pill,
              { backgroundColor: item.bg, borderColor: item.border },
            ]}
            onPress={() => onOpen(item.url)}
            accessibilityRole="link"
            accessibilityLabel={item.label}
          >
            <Text style={[styles.pillText, { color: item.color }]}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#374151",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1.5,
    marginRight: 8,
    marginBottom: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  pillText: {
    fontSize: 13,
    fontWeight: "800",
  },
});
