"use client";

import { useSyncExternalStore } from "react";
import type { LlmProvider } from "./llm";

/**
 * Client-side store for the active LLM provider. Persisted in localStorage so
 * the choice survives reloads (mirrors how the active tab is persisted), and
 * synced across mounted components via a storage event. Server code receives
 * the choice by argument — read it here and pass it into actions / fetch bodies.
 */

const STORAGE_KEY = "ta-llm-provider";
const DEFAULT_PROVIDER: LlmProvider = "gemini";

function coerce(value: string | null): LlmProvider {
  if (value === "other") return "other";
  if (value === "embedded") return "embedded";
  return "gemini";
}

export function getStoredProvider(): LlmProvider {
  if (typeof window === "undefined") return DEFAULT_PROVIDER;
  return coerce(window.localStorage.getItem(STORAGE_KEY));
}

// Subscribe to provider changes (cross-tab native storage events, and same-tab
// synthetic ones dispatched by setProvider below).
function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

const getServerSnapshot = (): LlmProvider => DEFAULT_PROVIDER;

/** React hook exposing the active provider and a setter that persists + broadcasts. */
export function useLlmProvider(): [LlmProvider, (next: LlmProvider) => void] {
  // useSyncExternalStore reads localStorage as the store: the default on the
  // server, the stored value on the client (no mount-time setState needed).
  const provider = useSyncExternalStore(subscribe, getStoredProvider, getServerSnapshot);

  const setProvider = (next: LlmProvider) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
      // Notify components in this tab (native storage events only fire cross-tab).
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: next }));
    }
  };

  return [provider, setProvider];
}
