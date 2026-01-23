export type PatientLite = {
  id: string;
  fullName: string;
  phone?: string;
};

export const PATIENTS: PatientLite[] = [
  { id: "p1", fullName: "John Doe", phone: "+44 7700 900111" },
  { id: "p2", fullName: "Sarah Smith", phone: "+44 7700 900222" },
  { id: "p3", fullName: "Ahmet Yılmaz", phone: "+90 532 000 1122" },
  { id: "p4", fullName: "Giorgi Beridze", phone: "+995 555 12 34 56" },
];

