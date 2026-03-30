// app/components/TeethFDISelector.tsx

import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";

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
  value = "11",
  onChange,
  diagnoses = [],
  title = "Dental Chart (FDI)"
}: Props){

  const [selectedTooth,setSelectedTooth] = useState(value)

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
        Upper: 11–18 / 21–28 • Lower: 31–38 / 41–48
      </Text>

      <ScrollView
        style={{marginTop:12}}
        contentContainerStyle={{paddingBottom:4}}
      >

        <View style={{gap:8}}>

          {TEETH.map((row,i)=>(
            <View
              key={i}
              style={{
                flexDirection:"row",
                gap:8,
                justifyContent:"center"
              }}
            >

              {row.map((tooth)=>{

                const active = String(tooth)===selectedTooth

                const hasDiagnosis = diagnosisMap[String(tooth)]

                return(
                  <Pressable
                    key={tooth}
                    onPress={()=>handleClick(tooth)}
                    style={{
                      width:48,
                      paddingVertical:10,
                      borderRadius:14,
                      borderWidth:1,
                      borderColor:active
                        ?"rgba(0,0,0,0.85)"
                        :"rgba(0,0,0,0.12)",
                      backgroundColor:active
                        ?"rgba(0,0,0,0.90)"
                        :"rgba(0,0,0,0.03)",
                      alignItems:"center",
                      justifyContent:"center"
                    }}
                  >

                    {/* tooth number */}
                    <Text
                      style={{
                        fontWeight:"900",
                        color:active
                          ?"white"
                          :"rgba(0,0,0,0.75)"
                      }}
                    >
                      {tooth}
                    </Text>

                    {/* diagnosis indicator */}
                    {hasDiagnosis && (
                      <View
                        style={{
                          position:"absolute",
                          top:4,
                          right:4,
                          width:8,
                          height:8,
                          borderRadius:4,
                          backgroundColor:"#ef4444"
                        }}
                      />
                    )}

                  </Pressable>
                )
              })}

            </View>
          ))}

        </View>

      </ScrollView>

    </View>
  )
}