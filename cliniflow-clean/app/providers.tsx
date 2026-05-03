import React from "react";
import { AuthProvider } from "../lib/auth";
import { LanguageProvider } from "../lib/language-context";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <LanguageProvider>
        {children}
      </LanguageProvider>
    </AuthProvider>
  );
}

export default AppProviders;
