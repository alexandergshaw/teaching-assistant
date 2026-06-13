"use client";

import { useLlmProvider } from "@/lib/llm-provider";
import type { LlmProvider } from "@/lib/llm";

/**
 * Small control for switching which LLM provider the app routes calls through.
 * The choice is persisted in localStorage and read by callers at request time.
 */
const OPTIONS: Array<{ value: LlmProvider; label: string }> = [
  { value: "gemini", label: "Gemini" },
  { value: "other", label: "Other API" },
];

export default function ProviderToggle() {
  const [provider, setProvider] = useLlmProvider();

  return (
    <div
      role="radiogroup"
      aria-label="LLM provider"
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 2,
        borderRadius: 8,
        border: "1px solid var(--field-border)",
        background: "var(--field-bg, transparent)",
      }}
    >
      {OPTIONS.map((opt) => {
        const active = provider === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setProvider(opt.value)}
            style={{
              font: "inherit",
              fontSize: "0.8rem",
              fontWeight: active ? 600 : 500,
              padding: "4px 12px",
              borderRadius: 6,
              border: "none",
              cursor: "pointer",
              color: active ? "var(--accent-contrast, #fff)" : "var(--text-secondary)",
              background: active ? "var(--accent)" : "transparent",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
