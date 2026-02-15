// lib/mock/treatments.ts
import { Treatment } from "@/lib/types/treatment";

/**
 * MOCK TREATMENTS
 * Guaranteed safe structure (no runtime crash)
 *
 * Not: paymentPlan değerleri Treatment type'ına uymalı.
 * Eğer type "ONE_TIME" kabul etmiyorsa, "2_INSTALLMENTS" gibi bir değere çevir.
 */

export const mockTreatments: Treatment[] = [
  {
    id: "TR-2041",
    patientName: "John Smith",
    treatmentName: "All-on-4 – Upper Jaw",
    doctorName: "Dr. Ilona",
    status: "IN_PROGRESS",

    // ---- Pricing ----
    showPriceToPatient: false,
    currency: "GBP",
    totalPrice: 3500,
    paidAmount: 1500,
    paymentStatus: "PARTIAL",
    paymentPlan: "2_INSTALLMENTS",
    payments: [
      {
        id: "P1",
        date: "2025-12-10T10:00:00Z",
        amount: 1500,
        method: "Card",
      },
    ],

    // ---- Patient Note ----
    patientNote: "We are currently in the healing stage. Next control is scheduled.",
    patientNoteVisible: true,

    // ---- Steps ----
    steps: [
      {
        id: "S1",
        title: "Consultation",
        status: "DONE",
        date: "2025-12-01",
        visibleToPatient: true,
        note: "",
        noteVisibleToPatient: false,
      },
      {
        id: "S2",
        title: "CT Scan",
        status: "DONE",
        date: "2025-12-02",
        visibleToPatient: true,
        note: "",
        noteVisibleToPatient: false,
      },
      {
        id: "S3",
        title: "Surgery",
        status: "IN_PROGRESS",
        visibleToPatient: true,
        note: "Vitals check & pre-op preparation",
        noteVisibleToPatient: false,
      },
      {
        id: "S4",
        title: "Healing",
        status: "TODO",
        visibleToPatient: true,
        note: "",
        noteVisibleToPatient: false,
      },
      {
        id: "S5",
        title: "Final Teeth",
        status: "TODO",
        visibleToPatient: true,
        note: "",
        noteVisibleToPatient: false,
      },
    ],

    // ---- Appointments ----
    appointments: [
      {
        id: "A1",
        dateTime: "2025-12-23T09:30:00Z",
        type: "Control",
        location: "Tbilisi Clinic",
        visibleToPatient: true,
      },
    ],

    // ---- Files ----
    files: [
      {
        id: "F1",
        name: "CT Scan.pdf",
        fileType: "CT",
        url: "#",
        visibleToPatient: true,
        uploadedAt: "2025-12-02T12:00:00Z",
      },
      {
        id: "F2",
        name: "Treatment Plan.pdf",
        fileType: "PLAN_PDF",
        url: "#",
        visibleToPatient: true,
        uploadedAt: "2025-12-02T13:00:00Z",
      },
    ],

    createdAt: "2025-12-01T08:00:00Z",
    updatedAt: "2025-12-20T12:00:00Z",
  },

  {
    id: "TR-3007",
    patientName: "Emily Brown",
    treatmentName: "Veneers – 10 Teeth",
    doctorName: "Dr. Nika",
    status: "PLANNING",

    // ---- Pricing ----
    showPriceToPatient: true,
    currency: "EUR",
    totalPrice: 2200,
    paidAmount: 0,
    paymentStatus: "PENDING",

    // ⚠ Eğer Treatment type "ONE_TIME" kabul etmiyorsa bunu "2_INSTALLMENTS" yap
    paymentPlan: "ONE_TIME",
    payments: [],

    // ---- Patient Note ----
    patientNote: "",
    patientNoteVisible: false,

    // ---- Steps ----
    steps: [
      {
        id: "S1",
        title: "Consultation",
        status: "TODO",
        visibleToPatient: true,
        note: "",
        noteVisibleToPatient: false,
      },
      {
        id: "S2",
        title: "Design / Mockup",
        status: "TODO",
        visibleToPatient: true,
        note: "",
        noteVisibleToPatient: false,
      },
    ],

    // ---- Appointments ----
    appointments: [],

    // ---- Files ----
    files: [],

    createdAt: "2025-12-18T10:00:00Z",
    updatedAt: "2025-12-18T10:00:00Z",
  },
];

/**
 * Get treatment by ID
 */
export function getTreatmentById(id: string): Treatment | undefined {
  return mockTreatments.find((t) => t.id === id);
}
