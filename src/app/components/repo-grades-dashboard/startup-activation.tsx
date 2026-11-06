"use client";

import { createContext, useContext, type ReactNode } from "react";

const StartupActivationContext = createContext(false);
const EmbeddedPilotContext = createContext(false);
const DurableStartupContext = createContext(false);

export function RepoGradesStartupActivation({ enabled, embeddedPilot, durable, children }: {
  enabled: boolean;
  embeddedPilot: boolean;
  durable: boolean;
  children: ReactNode;
}) {
  return <StartupActivationContext.Provider value={enabled}>
    <EmbeddedPilotContext.Provider value={embeddedPilot}>
      <DurableStartupContext.Provider value={durable}>{children}</DurableStartupContext.Provider>
    </EmbeddedPilotContext.Provider>
  </StartupActivationContext.Provider>;
}

export function useRepoGradesStartupActivation() {
  return useContext(StartupActivationContext);
}

export function useRepoGradesEmbeddedPilot() {
  return useContext(EmbeddedPilotContext);
}

export function useRepoGradesDurableStartupActivation() {
  return useContext(DurableStartupContext);
}