"use server";

// A21 (docs/a21-scope.md section 4.7, docs/a21-instrument-notes.md sections
// 3, 7, 8.2): the live drafting endpoint for "an announcement from a typed
// prompt, with a template optionally supplied". ALONE in this file so
// AC-9a's transitive-import wall (this file must never reach any Canvas
// capability) is satisfiable - merging it with the posting action would
// make that wall unsatisfiable by construction.
//
// Every export is `export async function` at column zero (AC-16), and this
// is the only export in the file.

// This file's own transitive closure must never contain the model client
// directly (AC-10(e), a source-text scan for "@/lib/llm" and "callLlm") -
// `PromptAnnouncementDraftRequest["provider"]` and
// `ResolvedTemplate["kind"]` below are read off the ALREADY-IMPORTED request
// and route types rather than importing `LlmProvider` from "@/lib/llm"
// directly, which would put that literal specifier in this file's own text
// even as a type-only import.
import { requireUser } from "@/lib/supabase/auth";
import { getWritingStyleBlock } from "./writing-style-block";
import { jsonObjectSlice } from "@/lib/json-slice";
import { stripUnpermittedUrls } from "@/lib/walkthrough-announcement-link-guard";
import { newBriefNonce, PROMPT_ANNOUNCEMENT_MAX_CHARS } from "@/lib/prompt-announcement-prompt";
import { routePromptAnnouncement } from "@/lib/prompt-announcement-route";
import { callPromptAnnouncementModel } from "@/lib/prompt-announcement-model-call";
import type {
  PromptAnnouncementDraftRequest,
  PromptAnnouncementDraftResult,
} from "@/lib/prompt-announcement-types";

const VALID_PROVIDERS: ReadonlySet<PromptAnnouncementDraftRequest["provider"]> = new Set([
  "gemini",
  "other",
  "embedded",
] as const);
const VALID_RESOLVED_KINDS: ReadonlySet<PromptAnnouncementDraftRequest["resolvedTemplate"]["kind"]> = new Set([
  "pasted",
  "saved",
  "none",
] as const);

/**
 * AC-24: a JSON wire payload erases TypeScript's own type system - an
 * off-union `provider` or `resolvedTemplate.kind` is a real, reachable
 * runtime value, not a contrived test double. Measured against a reference
 * action with no such check: `provider: "garbage"` fell through to the
 * model arm (a live model call on a value outside `LlmProvider`), and
 * `resolvedTemplate.kind: "house"` threw an uncaught TypeError from a live
 * server action behind `requireUser()`. Both are rejected here, before
 * either value reaches routing.
 */
export async function draftPromptAnnouncementAction(
  request: PromptAnnouncementDraftRequest
): Promise<PromptAnnouncementDraftResult> {
  try {
    const user = await requireUser();

    if (!VALID_PROVIDERS.has(request.provider)) {
      return { ok: false, error: "Unrecognized model provider." };
    }
    if (!request.resolvedTemplate || !VALID_RESOLVED_KINDS.has(request.resolvedTemplate.kind)) {
      return { ok: false, error: "Unrecognized template kind." };
    }
    if (!request.promptText.trim()) {
      return { ok: false, error: "Describe what the announcement should say first." };
    }
    if (request.promptText.length > PROMPT_ANNOUNCEMENT_MAX_CHARS) {
      return { ok: false, error: `The brief is too long (max ${PROMPT_ANNOUNCEMENT_MAX_CHARS} characters).` };
    }

    const styleBlock = await getWritingStyleBlock(user.id);
    // AC-6n(iv): one fresh nonce per call, generated HERE at the production
    // call site - never hoisted to module scope, never hardcoded. The
    // composer never generates its own (docs/a21-instrument-notes.md
    // section 7.2).
    const briefNonce = newBriefNonce();

    const route = routePromptAnnouncement({
      courseLabel: request.courseLabel,
      promptText: request.promptText,
      // AC-5(h): threaded through UNMODIFIED - never substituted with
      // EMPTY_ANNOUNCEMENT_OUTLINE or a re-derived look-alike.
      outline: request.outline,
      resolvedKind: request.resolvedTemplate.kind,
      styleBlock,
      briefNonce,
      provider: request.provider,
    });

    if (route.kind === "deterministic") {
      // AC-10(d): the `embedded` provider reaches no model call at all -
      // `route.kind === "deterministic"` carries no `prompt` value, so
      // there is nothing here to hand to a model client even if this
      // function tried.
      return {
        ok: true,
        title: route.draft.title,
        message: route.draft.message,
        templateApplied: false,
        resolvedTemplate: request.resolvedTemplate,
      };
    }

    const result = await callPromptAnnouncementModel(route, request.provider);
    if (!result.ok) {
      return { ok: false, error: `Draft failed: HTTP ${result.status} — ${result.body.slice(0, 200)}` };
    }

    const jsonText = jsonObjectSlice(result.text);
    if (!jsonText) {
      return { ok: false, error: "Could not parse the draft from the model response." };
    }
    let parsed: { title?: string; message?: string };
    try {
      parsed = JSON.parse(jsonText) as { title?: string; message?: string };
    } catch {
      return { ok: false, error: "Could not parse the draft from the model response." };
    }

    // AC-8: strip any URL the model's output introduces that was in no
    // input - the leverage mechanism this feature ships.
    const { text: strippedMessage } = stripUnpermittedUrls((parsed.message ?? "").trim(), route.permittedUrls);

    return {
      ok: true,
      title: (parsed.title ?? "").trim(),
      message: strippedMessage,
      templateApplied: true,
      resolvedTemplate: request.resolvedTemplate,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not draft the announcement." };
  }
}
