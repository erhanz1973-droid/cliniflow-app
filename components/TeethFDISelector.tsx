// app/components/TeethFDISelector.tsx
import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, Image, LayoutChangeEvent } from "react-native";

type Props = {
  value?: string; // "11"..."48"
  onChange: (toothId: string) => void;
  title?: string;
  mode?: "image" | "grid"; // default image
};

// ✅ DOĞRU PATH (dosya: app/components/...  ->  assets/images/...)
const TEETH_IMAGE = require("../../assets/images/teeth-fdi.jpeg");

function makeFDIList(): string[] {
  const out: string[] = [];
  const add = (s: number, e: number) => {
    for (let i = s; i <= e; i++) out.push(String(i));
  };
  add(11, 18);
  add(21, 28);
  add(31, 38);
  add(41, 48);
  return out;
}

type Marker = { toothId: string; x: number; y: number };
const MARKERS: Marker[] = [
  // UPPER
  { toothId: "18", x: 0.08, y: 0.22 },
  { toothId: "17", x: 0.14, y: 0.20 },
  { toothId: "16", x: 0.20, y: 0.19 },
  { toothId: "15", x: 0.27, y: 0.18 },
  { toothId: "14", x: 0.33, y: 0.17 },
  { toothId: "13", x: 0.40, y: 0.16 },
  { toothId: "12", x: 0.46, y: 0.16 },
  { toothId: "11", x: 0.50, y: 0.16 },

  { toothId: "21", x: 0.54, y: 0.16 },
  { toothId: "22", x: 0.58, y: 0.16 },
  { toothId: "23", x: 0.64, y: 0.16 },
  { toothId: "24", x: 0.70, y: 0.17 },
  { toothId: "25", x: 0.76, y: 0.18 },
  { toothId: "26", x: 0.82, y: 0.19 },
  { toothId: "27", x: 0.88, y: 0.20 },
  { toothId: "28", x: 0.94, y: 0.22 },

  // LOWER
  { toothId: "48", x: 0.08, y: 0.80 },
  { toothId: "47", x: 0.14, y: 0.82 },
  { toothId: "46", x: 0.20, y: 0.83 },
  { toothId: "45", x: 0.27, y: 0.84 },
  { toothId: "44", x: 0.33, y: 0.85 },
  { toothId: "43", x: 0.40, y: 0.86 },
  { toothId: "42", x: 0.46, y: 0.86 },
  { toothId: "41", x: 0.50, y: 0.86 },

  { toothId: "31", x: 0.54, y: 0.86 },
  { toothId: "32", x: 0.58, y: 0.86 },
  { toothId: "33", x: 0.64, y: 0.86 },
  { toothId: "34", x: 0.70, y: 0.85 },
  { toothId: "35", x: 0.76, y: 0.84 },
  { toothId: "36", x: 0.82, y: 0.83 },
  { toothId: "37", x: 0.88, y: 0.82 },
  { toothId: "38", x: 0.94, y: 0.80 },
];

export default function TeethFDISelector({
  value = "11",
  onChange,
  title = "Dental Chart (FDI)",
  mode = "image",
}: Props) {
  const teeth = useMemo(() => makeFDIList(), []);
  const [w, setW] = useState(0);
  const [h, setH] = useState(0);
  const [showGrid, setShowGrid] = useState(mode === "grid");

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setW(width);
    setH(height);
  }

  if (showGrid) {
    return (
      <View
        style={{
          backgroundColor: "white",
          borderRadius: 16,
          padding: 14,
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.10)",
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "900" }}>{title}</Text>
        <Text style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
          Upper: 11–18 / 21–28 • Lower: 31–38 / 41–48
        </Text>

        <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ paddingBottom: 4 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {teeth.map((t) => {
              const active = t === value;
              return (
                <Pressable
                  key={t}
                  onPress={() => onChange(t)}
                  style={{
                    width: 64,
                    paddingVertical: 10,
                    borderRadius: 14,
                    borderWidth: 1,
                    borderColor: active ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.12)",
                    backgroundColor: active ? "rgba(0,0,0,0.90)" : "rgba(0,0,0,0.03)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontWeight: "900", color: active ? "white" : "rgba(0,0,0,0.75)" }}>
                    {t}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        <Pressable
          onPress={() => setShowGrid(false)}
          style={{
            marginTop: 10,
            alignSelf: "flex-start",
            paddingVertical: 6,
            paddingHorizontal: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "rgba(0,0,0,0.12)",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "900", color: "rgba(0,0,0,0.75)" }}>
            Use image mode
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: "white",
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: "rgba(0,0,0,0.10)",
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "900" }}>{title}</Text>
      <Text style={{ marginTop: 6, fontSize: 12, color: "rgba(0,0,0,0.55)" }}>
        Tap a tooth number on the image
      </Text>

      <View
        onLayout={onLayout}
        style={{
          marginTop: 12,
          width: "100%",
          aspectRatio: 16 / 9,
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.10)",
          backgroundColor: "rgba(0,0,0,0.03)",
        }}
      >
        <Image source={TEETH_IMAGE} resizeMode="contain" style={{ width: "100%", height: "100%" }} />

        {w > 0 &&
          h > 0 &&
          MARKERS.map((m) => {
            const left = m.x * w;
            const top = m.y * h;
            const active = m.toothId === value;

            return (
              <Pressable
                key={m.toothId}
                onPress={() => onChange(m.toothId)}
                style={{
                  position: "absolute",
                  left: left - 16,
                  top: top - 16,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: active ? "rgba(0,0,0,0.90)" : "rgba(255,255,255,0.85)",
                  borderWidth: 1,
                  borderColor: "rgba(0,0,0,0.20)",
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: "900", color: active ? "white" : "rgba(0,0,0,0.75)" }}>
                  {m.toothId}
                </Text>
              </Pressable>
            );
          })}
      </View>

      <Pressable
        onPress={() => setShowGrid(true)}
        style={{
          marginTop: 10,
          alignSelf: "flex-start",
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "rgba(0,0,0,0.12)",
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: "900", color: "rgba(0,0,0,0.75)" }}>
          Use grid instead
        </Text>
      </Pressable>
    </View>
  );
}
