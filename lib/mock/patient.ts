export type Patient = {
  id: string;
  name: string;
  surname: string;
  email: string;
  phone: string;
};

export const mockPatient: Patient = {
  id: "mock-1",
  name: "Erhan",
  surname: "Zorlu",
  email: "erhan@test.com",
  phone: "+995000000000",
};