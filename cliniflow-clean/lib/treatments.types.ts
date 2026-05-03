export type Jaw = "upper" | "lower";

export type ProcedureStatus =
  | "PLANNED"
  | "DONE"
  | "FOLLOW_UP"
  | "CANCELLED";

export type Procedure = {
  type: string;
  status: ProcedureStatus;
  date?: string;
  note?: string;
  price?: number;
  showPriceToPatient: boolean;
};

export type TreatmentTooth = {
  jaw: Jaw;
  toothId: string;
  procedures: Procedure[];
};
