import { Slot } from "expo-router";
import { memo } from "react";
import { LanguageProvider } from "../../lib/language-context";
import { AuthProvider } from "../../lib/auth";
import { DeviceGuidanceProvider } from "../../lib/deviceGuidanceContext";
import { ClinicBootstrap } from "../../components/ClinicBootstrap";
import { PushNotificationNavigation } from "../../components/PushNotificationNavigation";
import { PatientOfferUnreadWatcher } from "../../components/PatientOfferUnreadWatcher";

const AppOutlet = memo(function AppOutlet() {
  return <Slot />;
});

/** All app routes + providers live under this shell so the root navigator stays isolated from context churn. */
export default function AppShellLayout() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <DeviceGuidanceProvider>
          <ClinicBootstrap />
          <PushNotificationNavigation />
          <PatientOfferUnreadWatcher />
          <AppOutlet />
        </DeviceGuidanceProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
