// A21 Ruling A (docs/a21-scope.md section 4.6): the `embedded` provider must
// make NO MODEL CALL. This leaf holds that decision as a discriminated
// union whose deterministic arm carries no `prompt` field at all, so there
// is no value on that arm a caller could hand `callLlm` - "embedded reaches
// the model" is unrepresentable AT THIS LEAF.
//
// THIS IS NOT THE WHOLE GUARANTEE (docs/a21-instrument-notes.md section 3).
// `PromptAnnouncementRouteArgs` still carries `promptText` (inherited from
// `PromptAnnouncementPromptArgs`) because the ACTION necessarily receives it
// as its wire payload - that value is in scope at the action by necessity,
// and a fabricated `{ kind: "model", prompt: request.promptText, ... }`
// literal, built directly rather than obtained by narrowing `route`,
// type-checks fine. AC-10(d) (measured at the live action, under a mock of
// `@/lib/llm`) is therefore the load-bearing instrument for "embedded makes
// no model call"; AC-10(a)/(b)/(c) here cover only this leaf's own,
// narrower claim: it cannot reach the model client, and it cannot itself
// fabricate the deterministic arm's result.
//
// This leaf cannot value-import `lib/llm` or `lib/gemini` (AC-10a) - the
// model call itself lives one file further down, in
// prompt-announcement-model-call.ts, specifically so this file's own
// transitive closure stays free of the model client.

import type { LlmProvider } from "@/lib/llm";
import { scaffoldAnnouncement, type AnnouncementScaffold } from "@/lib/embedded/communication";
import {
  buildPromptAnnouncementPrompt,
  collectPromptAnnouncementPermittedUrls,
  promptAnnouncementMaxOutputTokens,
  type PromptAnnouncementPromptArgs,
} from "./prompt-announcement-prompt";

export interface PromptAnnouncementRouteArgs extends PromptAnnouncementPromptArgs {
  readonly provider: LlmProvider;
}

export type PromptAnnouncementRoute =
  | { readonly kind: "deterministic"; readonly draft: AnnouncementScaffold; readonly templateApplied: false }
  | {
      readonly kind: "model";
      readonly prompt: string;
      readonly maxOutputTokens: number;
      readonly permittedUrls: ReadonlySet<string>;
      readonly templateApplied: true;
    };

export function routePromptAnnouncement(args: PromptAnnouncementRouteArgs): PromptAnnouncementRoute {
  if (args.provider === "embedded") {
    return { kind: "deterministic", draft: scaffoldAnnouncement(args.promptText), templateApplied: false };
  }
  return {
    kind: "model",
    prompt: buildPromptAnnouncementPrompt(args),
    maxOutputTokens: promptAnnouncementMaxOutputTokens(args.outline),
    permittedUrls: collectPromptAnnouncementPermittedUrls(args),
    templateApplied: true,
  };
}
