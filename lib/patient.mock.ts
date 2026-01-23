export type Jaw = "upper" | "lower";

export type ProcedureStatus =
  | "PLANNED"
  | "DONE"
  | "FOLLOW_UP"
  | "CANCELLED";

export type Procedure = {
  type: string;                 // IMPLANT, CROWN, FILLING, ROOT_CANAL, ...
  status: ProcedureStatus;
  date?: string;                // varsa göster
  note?: string;
  price?: number;               // sadece izinliyse
  showPriceToPatient: boolean;  // default false
};

export type TreatmentTooth = {
  jaw: Jaw;
  toothId: string;              // "11".."48"
  procedures: Procedure[];
};

export type Patient = {
  id: string;
  fullName: string;
  treatmentPlan: TreatmentTooth[];
};

export const mockPatient: Patient = {
  id: "patient_001",
  fullName: "Demo Patient",
  treatmentPlan: [
    {
      jaw: "upper",
      toothId: "11",
      procedures: [
        {
          type: "IMPLANT",
          status: "PLANNED",
          date: "2025-01-10",
          note: "First stage implant",
          price: 900,
          showPriceToPatient: false,
        },
        {
          type: "CROWN",
          status: "FOLLOW_UP",
          note: "Crown after healing",
          price: 350,
          showPriceToPatient: true,
        },
      ],
    },
    {
      jaw: "upper",
      toothId: "12",
      procedures: [
        {
          type: "FILLING",
          status: "DONE",
          date: "2025-12-18",
          note: "Composite filling",
          price: 120,
          showPriceToPatient: true,
        },
      ],
    },
    {
      jaw: "lower",
      toothId: "36",
      procedures: [
        {
          type: "ROOT_CANAL",
          status: "PLANNED",
          note: "Waiting for appointment",
          price: 200,
          showPriceToPatient: false,
        },
        {
          type: "CLEANING",
          status: "DONE",
          date: "2025-12-01",
          note: "Routine cleaning",
          price: 50,
          showPriceToPatient: true,
        },
      ],
    },
  ],
};
