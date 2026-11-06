"use client";

import { createContext, useContext, type ReactNode } from "react";

const StartupActivationContext = createContext(false);
const EmbeddedPilotContext = createContext(false);

export function RepoGradesStartupActivation({ enabled, embeddedPilot, children }: {
  enabled: boolean;
  embeddedPilot: boolean;
  children: ReactNode;
}) {
  return <StartupActivationContext.Provider value={enabled}>
    <EmbeddedPilotContext.Provider value={embeddedPilot}>{children}</EmbeddedPilotContext.Provider>
  </StartupActivationContext.Provider>;
}

export function useRepoGradesStartupActivation() {
  return useContext(StartupActivationContext);
}

export function useRepoGradesEmbeddedPilot() {
  return useContext(EmbeddedPilotContext);
}
