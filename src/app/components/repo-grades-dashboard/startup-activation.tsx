"use client";

import { createContext, useContext, type ReactNode } from "react";

const StartupActivationContext = createContext(false);

export function RepoGradesStartupActivation({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return <StartupActivationContext.Provider value={enabled}>{children}</StartupActivationContext.Provider>;
}

export function useRepoGradesStartupActivation() {
  return useContext(StartupActivationContext);
}
