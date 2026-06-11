import { Slot } from "expo-router";
import { memo, useEffect } from "react";
import { logLaunchPhaseOnce } from "../../lib/launchAudit";
import { LanguageProvider } from "../../lib/language-context";
import { AuthProvider } from "../../lib/auth";
import { DeviceGuidanceProvider } from "../../lib/deviceGuidanceContext";
import { ClinicBootstrap } from "../../components/ClinicBootstrap";
import { PushNotificationNavigation } from "../../components/PushNotificationNavigation";
import { PatientOfferUnreadWatcher } from "../../components/PatientOfferUnreadWatcher";
import { PatientForegroundClinicMessageWatcher } from "../../components/PatientForegroundClinicMessageWatcher";
import { DoctorForegroundMessageWatcher } from "../../components/DoctorForegroundMessageWatcher";
import { ClinicInviteBootstrap } from "../../components/ClinicInviteBootstrap";
import { MetaAppEventsBootstrap } from "../../components/MetaAppEventsBootstrap";

const AppOutlet = memo(function AppOutlet() {
  return <Slot />;
});

/** All app routes + providers live under this shell so the root navigator stays isolated from context churn. */
export default function AppShellLayout() {
  useEffect(() => {
    logLaunchPhaseOnce("App Shell Layout Mounted");
  }, []);

  return (
    <LanguageProvider>
      <AuthProvider>
        <DeviceGuidanceProvider>
          <MetaAppEventsBootstrap />
          <ClinicBootstrap />
          <ClinicInviteBootstrap />
          <PushNotificationNavigation />
          <PatientOfferUnreadWatcher />
          <PatientForegroundClinicMessageWatcher />
          <DoctorForegroundMessageWatcher />
          <AppOutlet />
        </DeviceGuidanceProvider>
      </AuthProvider>
    </LanguageProvider>
  );
}
