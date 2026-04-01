// app/components/TeethFDISelector.tsx

import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, Dimensions } from "react-native";
import { useLanguage } from "../lib/language-context";

const SCREEN_W = Dimensions.get("window").width;

type Diagnosis = {
  id: string
  tooth_number?: string | number
}

type Props = {
  value?: string
  onChange: (toothId: string) => void
  diagnoses?: Diagnosis[]
  title?: string
}

const TEETH = [
  [18,17,16,15,14,13,12,11],
  [21,22,23,24,25,26,27,28],
  [48,47,46,45,44,43,42,41],
  [31,32,33,34,35,36,37,38]
]

export default function TeethFDISelector({
  value = "",
  onChange,
  diagnoses = [],
  title = "Dental Chart (FDI)"
}: Props){

  const { t } = useLanguage();
  const [selectedTooth, setSelectedTooth] = useState(value)

  // Responsive tooth size: fit 8 teeth per row with 4px gap
  // Card padding = 14px × 2, outer screen padding = 14px × 2
  const toothSize = Math.floor((SCREEN_W - 14 * 2 - 14 * 2 - 4 * 7) / 8)

  // diagnosis map
  const diagnosisMap = useMemo(()=>{
    const map:Record<string,boolean> = {}

    diagnoses.forEach(d=>{
      if(d?.tooth_number){
        map[String(d.tooth_number)] = true
      }
    })

    return map
  },[diagnoses])

  function handleClick(tooth:number){

    const t = String(tooth)

    if(t===selectedTooth) return

    console.log("TOOTH CLICKED:",t)

    setSelectedTooth(t)

    onChange?.(t)
  }

  return(
    <View
      style={{
        backgroundColor:"white",
        borderRadius:16,
        padding:14,
        borderWidth:1,
        borderColor:"rgba(0,0,0,0.10)"
      }}
    >

      <Text style={{fontSize:16,fontWeight:"900"}}>{title}</Text>

      <Text style={{
        marginTop:6,
        fontSize:12,
        color:"rgba(0,0,0,0.55)"
      }}>
        {t('diagnosis.upper')}: 11–18 / 21–28 • {t('diagnosis.lower')}: 31–38 / 41–48
      </Text>

      <View style={{ marginTop: 12, gap: 4 }}>
        {TEETH.map((row, i) => (
          <View
            key={i}
            style={{ flexDirection: "row", gap: 4, justifyContent: "center" }}
          >
            {row.map((tooth) => {
              const active = String(tooth) === selectedTooth;
              const hasDiagnosis = diagnosisMap[String(tooth)];

              return (
                <Pressable
                  key={tooth}
                  onPress={() => handleClick(tooth)}
                  style={{
                    width: toothSize,
                    height: toothSize,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: active ? "#1D4ED8" : "rgba(0,0,0,0.15)",
                    backgroundColor: hasDiagnosis
                      ? active ? "#DC2626" : "#FEE2E2"
                      : active ? "#1D4ED8" : "rgba(0,0,0,0.03)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: toothSize < 38 ? 10 : 11,
                      fontWeight: "800",
                      color: active || (hasDiagnosis && active)
                        ? "#fff"
                        : hasDiagnosis
                          ? "#DC2626"
                          : "rgba(0,0,0,0.75)",
                    }}
                  >
                    {tooth}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

    </View>
  )
}