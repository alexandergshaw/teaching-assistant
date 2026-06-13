---
name: llm-provider-toggle
description: How LLM calls are dispatched and the provider toggle that controls them
metadata:
  type: project
---

All LLM calls route through `callLlm(req, provider)` in `src/lib/llm.ts` (single dispatcher; the old per-site Gemini `fetch` blocks were consolidated here on 2026-06-13). Provider is `"gemini"` (implemented) or `"other"` (stub in `callOtherProvider` — the alternative API is to be wired in shortly).

The active provider is chosen via an in-app UI toggle (`src/app/components/ProviderToggle.tsx`), persisted in localStorage and read through `src/lib/llm-provider.ts` (`getStoredProvider` / `useLlmProvider`). The choice is passed to the server as an **argument**: server actions take a trailing `provider: LlmProvider = "gemini"` param; API routes (`ai-chat`, `parse-calendar`) read it from the request body/formData; the grading form sends it via a hidden `provider` input.

To add the real second provider: implement `callOtherProvider` in `src/lib/llm.ts`. No call sites need to change.
