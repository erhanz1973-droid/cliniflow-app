/**
 * Maliyet tahmini (Clinifly — referans aralıkları, MVP).
 *
 * Basit başlangıç: `TREATMENT_COST` → `{ min, max }` (varsayılan ülke GE).
 * Gerçekçi: `estimateCost(type, country)` → `PRICING_BY_COUNTRY[country][type]`.
 *
 * Gerçek fiyatlar klinik / kura göre değişir; bu rakamlar yönlendirme içindir.
 */

/** ISO benzeri kısa kodlar (ör. Gürcistan, Türkiye, ABD) */
export type PricingCountry = keyof typeof PRICING_BY_COUNTRY;

export const DEFAULT_PRICING_COUNTRY: PricingCountry = "GE";

/**
 * Ülke başına [min, max] — para birimi `COUNTRY_CURRENCY[country]`.
 * Tek kaynak: tablolar buradan; `TREATMENT_COST` GE için buradan türetilir.
 */
export const PRICING_BY_COUNTRY = {
  GE: {
    filling: [40, 120],
    root_canal: [100, 280],
    implant: [450, 1100],
  },
  TR: {
    filling: [80, 200],
    root_canal: [180, 480],
    implant: [800, 2000],
  },
  US: {
    filling: [200, 600],
    root_canal: [500, 1400],
    implant: [2500, 5500],
  },
} as const;

export const COUNTRY_CURRENCY: Record<PricingCountry, string> = {
  GE: "GEL",
  TR: "TRY",
  US: "USD",
};

export const COUNTRY_LABEL: Record<PricingCountry, string> = {
  GE: "Gürcistan",
  TR: "Türkiye",
  US: "ABD",
};

export type TreatmentCostKey = keyof (typeof PRICING_BY_COUNTRY)["GE"];

export type CostRange = { min: number; max: number };

function tupleToRange(tuple: readonly [number, number]): CostRange {
  return { min: tuple[0], max: tuple[1] };
}

/**
 * Basit tablo (ülke GE — `PRICING_BY_COUNTRY.GE` ile aynı veri, `{ min, max }` formu).
 *
 * @example
 * TREATMENT_COST.filling // { min: 40, max: 120 }
 */
export const TREATMENT_COST: Record<TreatmentCostKey, CostRange> = {
  filling: tupleToRange(PRICING_BY_COUNTRY.GE.filling),
  root_canal: tupleToRange(PRICING_BY_COUNTRY.GE.root_canal),
  implant: tupleToRange(PRICING_BY_COUNTRY.GE.implant),
};

/**
 * Ülkeye göre fiyat aralığı.
 *
 * @param type — `"filling" | "root_canal" | "implant"`
 * @param country — varsayılan `"GE"` (`DEFAULT_PRICING_COUNTRY`)
 * @returns `{ min, max }` veya bilinmeyen tip/ülke için `null`
 *
 * @example
 * estimateCost("filling", "TR") // { min: 80, max: 200 }
 */
export function estimateCost(
  type: string,
  country: PricingCountry = DEFAULT_PRICING_COUNTRY
): CostRange | null {
  const row = PRICING_BY_COUNTRY[country]?.[type as TreatmentCostKey];
  if (!row) return null;
  return tupleToRange(row);
}

/** Ham tuple döndürür (ör. harici rapor / export) */
export function estimateCostTuple(
  type: string,
  country: PricingCountry = DEFAULT_PRICING_COUNTRY
): readonly [number, number] | null {
  const row = PRICING_BY_COUNTRY[country]?.[type as TreatmentCostKey];
  return row ?? null;
}

/** Seçili ülke için para birimi (UI) */
export function currencyForCountry(country: PricingCountry): string {
  return COUNTRY_CURRENCY[country];
}

/** Tüm tanımlı tedaviler (liste için) */
export function listTreatmentCostKeys(): TreatmentCostKey[] {
  return Object.keys(PRICING_BY_COUNTRY.GE) as TreatmentCostKey[];
}

export function listPricingCountries(): PricingCountry[] {
  return Object.keys(PRICING_BY_COUNTRY) as PricingCountry[];
}

/** UI için kısa metin (örn. "40 – 120 GEL") */
export function formatCostRange(
  range: CostRange,
  currency: string = "TRY"
): string {
  return `${range.min} – ${range.max} ${currency}`;
}
