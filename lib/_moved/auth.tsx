import React, { createContext, useContext, useState } from "react";

type AuthContextType = {
  isAuthed: boolean;
  signIn: (contact: string) => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(false);

  const signIn = (contact: string) => {
    // MVP: sadece giriş state'i
    setIsAuthed(true);
  };

  const signOut = () => {
    setIsAuthed(false);
  };

  return (
    <AuthContext.Provider value={{ isAuthed, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
