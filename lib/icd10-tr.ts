/**
 * Turkish translations for common dental ICD-10 codes.
 * Used to display patient-friendly descriptions in the patient app.
 */
export const ICD10_TR: Record<string, string> = {
  // K00 — Diş gelişimi ve sürmesi bozuklukları
  "K00.0": "Dişlerin gelişim bozukluğu",
  "K00.1": "Fazla diş (Ek diş)",
  "K00.2": "Diş boyut ve şekil anomalisi",
  "K00.3": "Alacalı dişler (Florozis)",
  "K00.4": "Diş oluşum bozukluğu",
  "K00.5": "Kalıtsal diş yapı bozukluğu",
  "K00.6": "Diş çıkarma bozukluğu",
  "K00.7": "Diş çıkarma sendromu",
  "K00.8": "Diş gelişiminin diğer bozuklukları",
  "K00.9": "Diş gelişim bozukluğu, tanımlanmamış",

  // K01 — Gömülü ve Retansiyonlu Dişler
  "K01.0": "Gömülü diş",
  "K01.1": "Retansiyonlu diş (İmpaksiyon)",

  // K02 — Diş Çürükleri
  "K02.0": "Mine çürüğü",
  "K02.1": "Dentin çürüğü",
  "K02.2": "Sement çürüğü",
  "K02.3": "Durdurulmuş çürük",
  "K02.4": "Odontoklaziasi",
  "K02.5": "Dentin çürüğü (derin)",
  "K02.8": "Diğer diş çürükleri",
  "K02.9": "Diş çürüğü, tanımlanmamış",

  // K03 — Diş Sert Dokularının Diğer Hastalıkları
  "K03.0": "Diş yüzeyi erozyonu",
  "K03.1": "Diş yüzeyi aşınması (Abrazyon)",
  "K03.2": "Diş yıpranması (Atrizyon)",
  "K03.3": "Dentin aşırı oluşumu",
  "K03.4": "Dişin hipersementosis",
  "K03.5": "Diş kökü sementum rezorpsiyonu",
  "K03.6": "Diş renk değişikliği",
  "K03.7": "Mine çatlakları",
  "K03.8": "Diş sert dokusunun diğer hastalıkları",

  // K04 — Dental Pulpa ve Periapikal Doku Hastalıkları
  "K04.0": "Pulpa iltihabı (Pulpitis)",
  "K04.1": "Pulpa nekrozu (Pulpa ölümü)",
  "K04.2": "Pulpa yozlaşması",
  "K04.3": "Pulpada anormal sert doku oluşumu",
  "K04.4": "Akut apikal periodontit (Pulpal kökenli)",
  "K04.5": "Kronik apikal periodontit",
  "K04.6": "Apikal abse (Sinüs yolu ile)",
  "K04.7": "Apikal abse (Sinüs yolu olmaksızın)",
  "K04.8": "Radiküler kist",

  // K05 — Diş Eti (Gingiva) ve Periodontal Doku Hastalıkları
  "K05.0": "Akut gingivit (diş eti iltihabı)",
  "K05.1": "Kronik gingivit",
  "K05.2": "Akut periodontit",
  "K05.3": "Kronik periodontit",
  "K05.4": "Periodontoz",
  "K05.5": "Diğer periodontal hastalıklar",

  // K06 — Diş Eti ve Dişsiz Alveol Kenarının Diğer Bozuklukları
  "K06.0": "Diş eti çekilmesi",
  "K06.1": "Diş eti hiperplazisi (büyümesi)",
  "K06.2": "Travmadan kaynaklanan diş eti lezyonları",

  // K08 — Diş ve Destekleyici Yapıların Diğer Bozuklukları
  "K08.0": "Sistemik hastalık nedeniyle diş kaybı",
  "K08.1": "Kaza, çekim veya lokal periodontal hastalık nedeniyle diş kaybı",
  "K08.2": "Dişsizlik nedeniyle alveol kemiği atrofisi",
  "K08.3": "Diş köküne özgü kalıntı kök",
  "K08.4": "Diş ağrısı, tanımlanmamış",
  "K08.5": "Sağlam diş kaybı",
  "K08.8": "Dişlerin diğer belirlenmiş bozuklukları",

  // Genel
  "K09":   "Ağız bölgesi kisti",
  "K10":   "Çene kemiği diğer hastalıkları",
  "K11":   "Tükürük bezi hastalıkları",
  "K12":   "Stomatit ve benzeri lezyonlar (Ağız yarası)",
  "K13":   "Dudak ve ağız mukozasının diğer hastalıkları",
};

/**
 * Returns Turkish description for an ICD-10 code.
 * Falls back to the provided English description or the code itself.
 */
export function getIcd10Tr(
  code: string | null | undefined,
  fallbackDescription?: string | null,
): string {
  if (!code) return fallbackDescription || "—";
  const tr = ICD10_TR[code.trim()];
  return tr || fallbackDescription || code;
}
