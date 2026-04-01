// Redirect /doctor/dashboard → /doctor (canonical route)
import { Redirect } from "expo-router";
export default function DoctorDashboardRedirect() {
  return <Redirect href="/doctor" />;
}
