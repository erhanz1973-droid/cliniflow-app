// lib/types/treatment.ts

/* =========================
   ENUM / UNION TYPES
   ========================= */

export type TreatmentStatus =
  | "PLANNING"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "CANCELLED";

export type PaymentStatus =
  | "PENDING"
  | "PARTIAL"
  | "PAID";

export type PaymentPlan =
  | "ONE_TIME"
  | "2_INSTALLMENTS"
  | "3_INSTALLMENTS";

/* =========================
   PAYMENT
   ========================= */

export type Payment = {
  id: string;
  date: string;        // ISO string
  amount: number;
  method: string;      // Card, Cash, Transfer, etc.
};

/* =========================
   TREATMENT STEP
   ========================= */

export type TreatmentStepStatus =
  | "TODO"
  | "IN_PROGRESS"
  | "DONE";

export type TreatmentStep = {
  id: string;
  title: string;
  status: TreatmentStepStatus;
  date?: string;               // optional
  visibleToPatient: boolean;
  note?: string;
  noteVisibleToPatient: boolean;
};

/* =========================
   APPOINTMENT
   ========================= */

export type Appointment = {
  id: string;
  dateTime: string;            // ISO string
  type: string;                // Control, Surgery, etc.
  location?: string;
  visibleToPatient: boolean;
};

/* =========================
   FILE
   ========================= */

export type TreatmentFile = {
  id: string;
  name: string;
  fileType: string;            // CT, PLAN_PDF, XRAY, etc.
  url: string;
  visibleToPatient: boolean;
  uploadedAt: string;          // ISO string
};

/* =========================
   MAIN TREATMENT
   ========================= */

export type Treatment = {
  id: string;

  patientName: string;
  treatmentName: string;
  doctorName: string;
  status: TreatmentStatus;

  /* ---- Pricing ---- */
  showPriceToPatient: boolean;
  currency: string;            // EUR, GBP, USD
  totalPrice: number;
  paidAmount: number;
  paymentStatus: PaymentStatus;
  paymentPlan: PaymentPlan;
  payments: Payment[];

  /* ---- Patient Note ---- */
  patientNote: string;
  patientNoteVisible: boolean;

  /* ---- Timeline ---- */
  steps: TreatmentStep[];

  /* ---- Logistics ---- */
  appointments: Appointment[];

  /* ---- Documents ---- */
  files: TreatmentFile[];

  /* ---- Meta ---- */
  createdAt: string;
  updatedAt: string;
};
