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
  { value: "embedded", label: "Embedded Deterministic Engine" },
];

export default function ProviderToggle() {
  const [provider, setProvider] = useLlmProvider();

  return (
    <div
      role="radiogroup"
      aria-label="LLM provider"
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: "var(--space-1)",
        padding: "var(--space-1)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--field-border)",
        background: "var(--field-bg)",
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
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "var(--control-height-sm)",
              fontSize: "var(--font-size-sm)",
              fontWeight: active ? 600 : 500,
              padding: "0 var(--space-3)",
              borderRadius: "var(--radius-xs)",
              border: "none",
              cursor: "pointer",
              // Selected = --accent-soft fill + a 2px inset accent ring
              // (AM11), not a solid accent fill: the old solid fill needed
              // white text with no legal spelling until --text-on-accent was
              // added mid-wave for exactly this call site (globals.css
              // 2026-09-01 note) - moving to accent-soft sidesteps it and
              // matches the segmented-control idiom other surfaces use.
              color: active ? "var(--accent-hover)" : "var(--text-secondary)",
              background: active ? "var(--accent-soft)" : "transparent",
              boxShadow: active ? "inset 0 0 0 2px var(--accent)" : "none",
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
