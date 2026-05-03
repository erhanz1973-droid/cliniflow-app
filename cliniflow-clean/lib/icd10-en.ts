/**
 * English translations for common dental ICD-10 codes.
 * Used to display patient-friendly descriptions in the patient app.
 */
export const ICD10_EN: Record<string, string> = {
  // Parent / group codes
  "K00": "Disorders of tooth development and eruption",
  "K01": "Embedded and impacted teeth",
  "K02": "Dental caries",
  "K03": "Other diseases of hard tissues of teeth",
  "K04": "Diseases of pulp and periapical tissues",
  "K05": "Gingivitis and periodontal diseases",
  "K06": "Other disorders of gingiva and edentulous alveolar ridge",
  "K07": "Dentofacial anomalies including malocclusion",
  "K08": "Other disorders of teeth and supporting structures",

  // K00 — Disorders of tooth development and eruption
  "K00.0": "Tooth development disorder",
  "K00.1": "Supernumerary tooth",
  "K00.2": "Anomaly of tooth size and shape",
  "K00.3": "Mottled teeth (Fluorosis)",
  "K00.4": "Disturbance in tooth formation",
  "K00.5": "Hereditary disturbance in tooth structure",
  "K00.6": "Disturbance in tooth eruption",
  "K00.7": "Teething syndrome",
  "K00.8": "Other disorders of tooth development",
  "K00.9": "Disorder of tooth development, unspecified",

  // K01 — Embedded and impacted teeth
  "K01.0": "Embedded tooth",
  "K01.1": "Impacted tooth",

  // K02 — Dental caries
  "K02.0": "Enamel caries",
  "K02.1": "Dentine caries",
  "K02.2": "Cementum caries",
  "K02.3": "Arrested dental caries",
  "K02.4": "Odontoclasia",
  "K02.5": "Dentine caries (deep)",
  "K02.8": "Other dental caries",
  "K02.9": "Dental caries, unspecified",

  // K03 — Other diseases of hard tissues of teeth
  "K03.0": "Excessive attrition of teeth",
  "K03.1": "Abrasion of teeth",
  "K03.2": "Erosion of teeth",
  "K03.3": "Pathological resorption of teeth",
  "K03.4": "Hypercementosis",
  "K03.5": "Ankylosis of teeth",
  "K03.6": "Deposits on teeth",
  "K03.7": "Posteruptive colour changes of dental hard tissues",
  "K03.8": "Other specified diseases of hard tissues of teeth",

  // K04 — Diseases of pulp and periapical tissues
  "K04.0": "Pulpitis (Pulp inflammation)",
  "K04.1": "Pulp necrosis",
  "K04.2": "Pulp degeneration",
  "K04.3": "Abnormal hard tissue formation in pulp",
  "K04.4": "Acute apical periodontitis",
  "K04.5": "Chronic apical periodontitis",
  "K04.6": "Periapical abscess with sinus",
  "K04.7": "Periapical abscess without sinus",
  "K04.8": "Radicular cyst",

  // K05 — Gingivitis and periodontal diseases
  "K05.0": "Acute gingivitis",
  "K05.1": "Chronic gingivitis",
  "K05.2": "Acute periodontitis",
  "K05.3": "Chronic periodontitis",
  "K05.4": "Periodontosis",
  "K05.5": "Other periodontal diseases",

  // K06 — Other disorders of gingiva and edentulous alveolar ridge
  "K06.0": "Gingival recession",
  "K06.1": "Gingival enlargement",
  "K06.2": "Gingival and edentulous alveolar ridge lesions",

  // K07 — Dentofacial anomalies
  "K07.0": "Major anomalies in jaw size",
  "K07.1": "Anomalies of jaw-cranial base relationship",
  "K07.2": "Anomalies of dental arch relationship (Malocclusion)",
  "K07.3": "Anomalies of tooth position",
  "K07.4": "Malocclusion, unspecified",

  // K08 — Other disorders of teeth and supporting structures
  "K08.0": "Exfoliation of teeth due to systemic causes",
  "K08.1": "Loss of teeth due to accident, extraction or local disease",
  "K08.2": "Atrophy of edentulous alveolar ridge",
  "K08.3": "Retained dental root",
  "K08.4": "Toothache, unspecified",
  "K08.5": "Loss of teeth",
  "K08.8": "Other specified disorders of teeth",

  // General
  "K09":   "Cyst of oral region",
  "K10":   "Other diseases of jaws",
  "K11":   "Diseases of salivary glands",
  "K12":   "Stomatitis and related lesions",
  "K13":   "Other diseases of lip and oral mucosa",

  // Trauma
  "S02.5":  "Fracture of tooth",
  "S02.50": "Tooth fracture without enamel loss",

  // Preventive / check-up
  "Z01.2":  "Dental examination",
  "Z46.3":  "Fitting of dental prosthetic device",
};

/**
 * Returns English description for an ICD-10 code.
 * Falls back to the provided fallback description or the code itself.
 */
export function getIcd10En(
  code: string | null | undefined,
  fallbackDescription?: string | null,
): string {
  if (!code) return fallbackDescription || "—";
  const en = ICD10_EN[code.trim()];
  return en || fallbackDescription || code;
}
