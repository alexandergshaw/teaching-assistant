// Job 4 of the intro-video-script bug report fix (the repo owner's own
// request: "give me a downloadable log"). The CLIENT-side half of the
// diagnostic record `generate()` (useLmsGeneration.ts) captures on every
// call through generateFromSelectionAction - merges the facts `generate()`
// itself already holds (the selection shape, timings, whether the call
// RETURNED or REJECTED, whether setPreview was reached) with the optional
// `diag` field that action's own success/failure shape now carries for
// server-side facts (src/lib/lms-generation/generation-diag.ts's
// ScriptGenerationServerDiag, populated only for the "scripts" kind).
//
// A pure, DI-free builder - not inlined at the call site - so
// generation-diag-record.test.ts can exercise it directly with real objects,
// and so useLmsGeneration.ts (a file already near this repo's 1000-line
// ceiling) only needs a short call at each of `generate()`'s two outcomes.
//
// REDACTION: every field here is either a count, a label already shown
// on-screen (moduleLabel), or a raw selection key the instructor's own click
// produced (moduleKeys - "live:<id>"/"export:<ref>", never file contents) -
// except `errorText`, which is NOT automatically safe. `recordDiag` runs on
// the GENERIC branch (generateFromSelectionAction) for EVERY generation kind,
// not only "scripts" - for kinds other than "scripts" the error string can
// originate from describeLlmFailure (src/lib/llm.ts), which embeds up to 200
// raw characters of the upstream Gemini HTTP body. Gemini sends its API key
// as a URL query parameter (see generation-diag.ts's own header comment), so
// an unredacted upstream error string is a real credential-leak vector into
// this record's own downloadable JSON file, exactly like `failureBodyRedacted`
// on `serverDiag.llm` - buildGenerationDiagRecord below passes `errorText`
// through the SAME redactSensitiveText this file's server-side counterpart
// uses, before it is ever placed on this type, never after.
// `serverDiag` (populated only for "scripts") is passed through unchanged -
// see generation-diag.ts's own header comment for that half's own redaction,
// already applied by the caller before this type ever sees it.

import type { GenerationKindId } from "@/lib/lms-generation/kinds";
import { redactSensitiveText, type ScriptGenerationServerDiag } from "@/lib/lms-generation/generation-diag";

export interface GenerationDiagRecord {
  capturedAt: string;
  kindId: GenerationKindId;
  selection: {
    itemCount: number;
    /** The raw "live:<id>"/"export:<ref>" selection keys (useModuleSelection.ts's
     * own scheme) - never Canvas content, just identifiers. */
    moduleKeys: string[];
    expandedItemCount: number;
    moduleLabel: string;
  };
  request: {
    /** Sent unconditionally, matching generateFromSelectionAction's own
     * targetMinutes field (GenerateFromSelectionInput's doc comment) -
     * meaningless for every kind but "scripts", same convention. */
    scriptMinutesRequested: number;
  };
  timing: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
    /** Whether the generateFromSelectionAction call RETURNED (even with its
     * own {error} shape) or REJECTED (a thrown/network failure caught by
     * runGenerationCall, lmsGenerationSafeCall.ts) - the fact Job 2's fix
     * exists to make survivable, and Job 4's log exists to make visible. */
    outcome: "returned" | "rejected";
  };
  result: {
    ok: boolean;
    /** Redacted (redactSensitiveText) before it is ever placed here - see
     * this file's header comment for why: this string can originate from a
     * raw, untrusted upstream body for every kind but "scripts". */
    errorText?: string;
    courseNotLinked?: boolean;
    /** Whether the hook's own setPreview was reached for this call -
     * finishGenerateSuccess reaches it unconditionally once called, so this
     * is true exactly when `ok` is true (kept as its own field, rather than
     * derived at read time, because THAT unconditional-reach property is
     * exactly what a future regression in finishGenerateSuccess could
     * silently break - see this file's own generate() call sites, which set
     * it explicitly at each outcome rather than inferring it from `ok`). */
    setPreviewReached: boolean;
  };
  /** Present only when the server action itself returned one - today, only
   * ever for kindId "scripts" (see generation-diag.ts's own header comment). */
  serverDiag?: ScriptGenerationServerDiag;
}

export function buildGenerationDiagRecord(input: {
  kindId: GenerationKindId;
  itemCount: number;
  moduleKeys: string[];
  expandedItemCount: number;
  moduleLabel: string;
  scriptMinutesRequested: number;
  startedAt: number;
  endedAt: number;
  rejected: boolean;
  ok: boolean;
  errorText?: string;
  courseNotLinked?: boolean;
  setPreviewReached: boolean;
  serverDiag?: ScriptGenerationServerDiag;
}): GenerationDiagRecord {
  return {
    capturedAt: new Date().toISOString(),
    kindId: input.kindId,
    selection: {
      itemCount: input.itemCount,
      moduleKeys: input.moduleKeys,
      expandedItemCount: input.expandedItemCount,
      moduleLabel: input.moduleLabel,
    },
    request: { scriptMinutesRequested: input.scriptMinutesRequested },
    timing: {
      startedAt: new Date(input.startedAt).toISOString(),
      endedAt: new Date(input.endedAt).toISOString(),
      durationMs: input.endedAt - input.startedAt,
      outcome: input.rejected ? "rejected" : "returned",
    },
    result: {
      ok: input.ok,
      // L1 FIX: `errorText` is not automatically safe (see this file's own
      // header comment) - it goes through the SAME redaction pass as
      // `serverDiag.llm.failureBodyRedacted`, never verbatim.
      errorText: input.errorText !== undefined ? redactSensitiveText(input.errorText) : undefined,
      courseNotLinked: input.courseNotLinked,
      setPreviewReached: input.setPreviewReached,
    },
    serverDiag: input.serverDiag,
  };
}

/** The filename the download control saves the record under - one place, so
 * the hook and any future caller cannot spell it two different ways. */
export function generationDiagRecordFilename(record: GenerationDiagRecord): string {
  const stamp = record.capturedAt.replace(/[:.]/g, "-");
  return `generation-diagnostic-${record.kindId}-${stamp}.json`;
}

/**
 * Builds the `recordDiag` closure useLmsGeneration.ts's `generate()` calls at
 * each of its two outcomes (error, success) for the generic
 * (generateFromSelectionAction) branch - factored out here, rather than
 * defined inline in that hook, purely to keep that file (already near this
 * repo's 1000-line ceiling) under it. `lastDiagRef`/`setHasDiagLog` are the
 * hook's own ref/state, passed in rather than imported, since this module
 * has no React dependency of its own; `common` is every fact identical
 * across both outcomes (the selection shape, timing start) so each call site
 * only has to state what differs (see buildGenerationDiagRecord's own
 * parameter shape for the split).
 */
export function createDiagRecorder(
  lastDiagRef: { current: GenerationDiagRecord | null },
  setHasDiagLog: (v: boolean) => void,
  common: {
    kindId: GenerationKindId;
    itemCount: number;
    moduleKeys: string[];
    expandedItemCount: number;
    moduleLabel: string;
    scriptMinutesRequested: number;
    startedAt: number;
  }
): (facts: {
  endedAt: number;
  rejected: boolean;
  ok: boolean;
  errorText?: string;
  courseNotLinked?: boolean;
  setPreviewReached: boolean;
  serverDiag?: ScriptGenerationServerDiag;
}) => void {
  return (facts) => {
    lastDiagRef.current = buildGenerationDiagRecord({ ...common, ...facts });
    setHasDiagLog(true);
  };
}
