// A21 (docs/a21-instrument-notes.md section 3.3): the ONLY module on the
// prompt-driven draft path that value-imports the LLM client. Kept out of
// both the route leaf (which must never reach `lib/llm`/`lib/gemini`,
// AC-10a) and the draft action itself (AC-10(e): the action's own source
// text must not contain `@/lib/llm` or `callLlm`) - the action calls THIS
// function instead.
//
// Measured with tsc (docs/a21-instrument-notes.md section 3.3): handing an
// unnarrowed `PromptAnnouncementRoute` to this function is TS2345, naming
// `prompt`, `maxOutputTokens` and `permittedUrls` as missing from the
// deterministic arm - so a caller cannot reach this function on the
// deterministic arm without a type error. `provider` is threaded through as
// its own parameter (never read off `PromptAnnouncementRoute`, which does
// not carry it) so "other" and "gemini" both reach the real model call.

import { callLlm, type LlmProvider, type LlmResult } from "@/lib/llm";
import type { PromptAnnouncementRoute } from "./prompt-announcement-route";

export type PromptAnnouncementModelArm = Extract<PromptAnnouncementRoute, { kind: "model" }>;

export async function callPromptAnnouncementModel(
  arm: PromptAnnouncementModelArm,
  provider: LlmProvider
): Promise<LlmResult> {
  return callLlm(
    {
      contents: [{ role: "user", parts: [{ text: arm.prompt }] }],
      generationConfig: { temperature: 0.5, maxOutputTokens: arm.maxOutputTokens },
    },
    provider
  );
}
