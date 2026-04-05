import type { Language } from "./i18n";

/**
 * Pick human-readable ICD row text for the active UI language.
 * Uses title_* / description_* when present; falls back across languages then category / generic description.
 */
export function localizedIcdTitle(item: Record<string, unknown>, lang: Language): string {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

  const byLang: Record<Language, string[]> = {
    tr: [s(item.title_tr), s(item.description_tr)],
    en: [s(item.title_en), s(item.description_en)],
    ru: [s(item.title_ru), s(item.description_ru)],
    ka: [s(item.title_ka), s(item.description_ka)],
  };

  const primary = byLang[lang]?.find(Boolean);
  if (primary) return primary;

  const fallbacks = [
    s(item.title_en),
    s(item.title_tr),
    s(item.description_en),
    s(item.description_tr),
    s(item.description_ru),
    s(item.description_ka),
    s(item.description),
    s(item.icd10_description),
    s(item.category),
  ];
  return fallbacks.find(Boolean) || "";
}

/** Static bilingual dental ICD-10 map (mirrors backend ICD10_DENTAL_STATIC) */
const ICD10_LABELS: Record<string, { tr: string; en: string }> = {
  "K00.0": { tr: "Anodontia (Diş eksikliği)", en: "Anodontia (Missing teeth)" },
  "K00.1": { tr: "Fazla diş (Hyperdontia)", en: "Supernumerary teeth (Hyperdontia)" },
  "K00.2": { tr: "Diş boyutu ve şekil anomalileri", en: "Abnormalities of size and form of teeth" },
  "K00.4": { tr: "Dişlerin oluşum bozukluğu (Hipoplazi)", en: "Disturbances in tooth formation (Hypoplasia)" },
  "K00.6": { tr: "Diş sürmesi bozuklukları", en: "Disturbances in tooth eruption" },
  "K01.0": { tr: "Gömülü diş", en: "Embedded tooth" },
  "K01.1": { tr: "İmpakte (gömük) diş", en: "Impacted tooth" },
  "K02.0": { tr: "Mine çürüğü", en: "Dental caries of enamel" },
  "K02.1": { tr: "Dentin çürüğü", en: "Dental caries of dentine" },
  "K02.2": { tr: "Sement çürüğü", en: "Dental caries of cementum" },
  "K02.3": { tr: "Durdurulmuş diş çürüğü", en: "Arrested dental caries" },
  "K02.5": { tr: "Pulpayı ilgilendiren diş çürüğü", en: "Dental caries with pulp exposure" },
  "K02.9": { tr: "Diş çürüğü, belirtilmemiş", en: "Dental caries, unspecified" },
  "K03.0": { tr: "Diş aşınması (Atrizyon)", en: "Excessive attrition of teeth" },
  "K03.1": { tr: "Diş erozyonu (Abrazyon)", en: "Abrasion of teeth" },
  "K03.2": { tr: "Erozyon", en: "Erosion of teeth" },
  "K03.3": { tr: "Patolojik diş rezorpsiyonu", en: "Pathological resorption of teeth" },
  "K03.4": { tr: "Hipersementoz", en: "Hypercementosis" },
  "K03.6": { tr: "Mine renk değişikliği", en: "Deposits on teeth" },
  "K03.7": { tr: "Eruption sonrası dentin kolorasyon", en: "Posteruptive colour changes of dental hard tissues" },
  "K04.0": { tr: "Pulpitis (Pulpa iltihabı)", en: "Pulpitis" },
  "K04.1": { tr: "Pulpa nekrozu", en: "Necrosis of pulp" },
  "K04.2": { tr: "Pulpa dejenerasyonu", en: "Pulp degeneration" },
  "K04.3": { tr: "Pulpada yanlış sert doku oluşumu", en: "Abnormal hard tissue formation in pulp" },
  "K04.4": { tr: "Akut apikal periodontitis", en: "Acute apical periodontitis" },
  "K04.5": { tr: "Kronik apikal periodontitis", en: "Chronic apical periodontitis" },
  "K04.6": { tr: "Apikal periodontitis ile periapikal apse", en: "Periapical abscess with sinus" },
  "K04.7": { tr: "Sinüs yollu periapikal apse", en: "Periapical abscess without sinus" },
  "K04.8": { tr: "Kök kisti", en: "Radicular cyst" },
  "K05.0": { tr: "Akut gingivitis", en: "Acute gingivitis" },
  "K05.1": { tr: "Kronik gingivitis", en: "Chronic gingivitis" },
  "K05.2": { tr: "Akut periodontitis", en: "Acute periodontitis" },
  "K05.3": { tr: "Kronik periodontitis", en: "Chronic periodontitis" },
  "K05.4": { tr: "Periodontosis", en: "Periodontosis" },
  "K05.5": { tr: "Diğer periodontal hastalıklar", en: "Other periodontal diseases" },
  "K06.0": { tr: "Diş eti gerilemesi", en: "Gingival recession" },
  "K06.1": { tr: "Diş eti büyümesi", en: "Gingival enlargement" },
  "K06.2": { tr: "Travmaya bağlı diş eti lezyonları", en: "Gingival and edentulous alveolar ridge lesions associated with trauma" },
  "K07.0": { tr: "Çene boyutu büyük anomaliler", en: "Major anomalies in jaw size" },
  "K07.1": { tr: "Çene kemeri ilişkisi anomalileri", en: "Anomalies of jaw-cranial base relationship" },
  "K07.2": { tr: "Diş ilişkisi anomalileri (Maloklüzyon)", en: "Anomalies of dental arch relationship (Malocclusion)" },
  "K07.3": { tr: "Diş pozisyonu anomalileri", en: "Anomalies of tooth position" },
  "K07.4": { tr: "Maloklüzyon, belirtilmemiş", en: "Malocclusion, unspecified" },
  "K08.0": { tr: "Sistemik bozukluklara bağlı diş kaybı", en: "Exfoliation of teeth due to systemic causes" },
  "K08.1": { tr: "Kazaya bağlı diş kaybı", en: "Loss of teeth due to accident" },
  "K08.2": { tr: "Dişsizlik sonrası alveolar kret atrofisi", en: "Atrophy of edentulous alveolar ridge" },
  "K08.3": { tr: "Retansiyon kökü", en: "Retained dental root" },
  "K08.4": { tr: "Diş ağrısı, belirtilmemiş", en: "Toothache, unspecified" },
  "K08.8": { tr: "Dişlerin diğer belirtilen bozuklukları", en: "Other specified disorders of teeth" },
  "K09.0": { tr: "Gelişimsel odontojenik kistler", en: "Developmental odontogenic cysts" },
  "K09.1": { tr: "Gelişimsel (odontojenik dışı) ağız kistleri", en: "Developmental (nonodontonogenic) cysts of oral region" },
  "K10.0": { tr: "Çene gelişimsel bozuklukları", en: "Developmental disorders of jaws" },
  "K10.2": { tr: "Osteitis ve osteomyelitis", en: "Inflammatory conditions of jaws" },
  "K11.5": { tr: "Tükürük bezi taşı", en: "Sialolithiasis (Salivary calculus)" },
  "K12.0": { tr: "Tekrarlayan oral aftlar (Aft)", en: "Recurrent oral aphthae" },
  "K12.1": { tr: "Stomatit'in diğer biçimleri", en: "Other forms of stomatitis" },
  "K13.0": { tr: "Dudak hastalıkları", en: "Diseases of lips" },
  "K13.3": { tr: "Saçlı lökoplaki", en: "Hairy leukoplakia" },
  "K13.6": { tr: "Dişeti hiperplazisi", en: "Gingival hyperplasia" },
  "S02.5": { tr: "Diş kırığı", en: "Fracture of tooth" },
  "S02.50": { tr: "Kaplama kaybı olmadan diş kırığı", en: "Fracture of tooth without loss of crown" },
  "Z01.2": { tr: "Diş muayenesi", en: "Dental examination" },
  "Z46.3": { tr: "Dental protez uyarlaması", en: "Fitting of dental prosthesis" },
};

/**
 * Returns the localized ICD-10 description for a given code.
 * Falls back to the stored description if the code is not in the static map.
 */
export function getIcdDescription(
  code: string,
  storedDescription: string,
  lang: Language,
): string {
  if (!code) return storedDescription || "";
  const entry = ICD10_LABELS[code.trim()];
  if (!entry) return storedDescription || code;
  if (lang === "en") return entry.en || entry.tr || storedDescription;
  return entry.tr || entry.en || storedDescription;
}
