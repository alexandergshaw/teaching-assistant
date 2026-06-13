"use client";

import { useEffect, useState } from "react";
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
  return value === "other" ? "other" : "gemini";
}

export function getStoredProvider(): LlmProvider {
  if (typeof window === "undefined") return DEFAULT_PROVIDER;
  return coerce(window.localStorage.getItem(STORAGE_KEY));
}

/** React hook exposing the active provider and a setter that persists + broadcasts. */
export function useLlmProvider(): [LlmProvider, (next: LlmProvider) => void] {
  const [provider, setProviderState] = useState<LlmProvider>(DEFAULT_PROVIDER);

  useEffect(() => {
    setProviderState(getStoredProvider());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setProviderState(coerce(e.newValue));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const setProvider = (next: LlmProvider) => {
    setProviderState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
      // Notify other components in this tab (storage events only fire cross-tab).
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: next }));
    }
  };

  return [provider, setProvider];
}
