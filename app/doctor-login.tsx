// Redirect legacy /doctor-login route to the canonical login screen
import { Redirect } from "expo-router";
export default function DoctorLoginLegacy() {
  return <Redirect href="/login/doctor" />;
}
