// The server-side half of the module-intro-video-script downloadable
// diagnostic log (the repo owner's own request when reporting "the intro
// video script is never actually coming up as a modal... give me a
// downloadable log"). A dependency-free leaf, like kinds.ts and
// script-length.ts (see their own header comments for why): every export
// here is a plain value, a pure function, or a type - no "@/app/actions", no
// Supabase, no Gemini SDK import - so both src/app/actions/media.ts (which
// KNOWS the raw LLM outcome, and nothing else) and
// src/app/actions/lms-generation.ts (which KNOWS the resolved course row and
// the selection, and nothing about the LLM call) can each fill in their own
// half without either importing the other.
//
// REDACTION IS THE WHOLE POINT OF A SEPARATE TYPE. This file's shapes
// deliberately carry no field wide enough for a secret to pass through by
// accident:
//   - `promptHash`/`promptLength` stand in for the literal prompt, which
//     embeds up to 1500 chars of the instructor's own writing sample
//     (getWritingStyleBlock, src/app/actions/shared.ts) - never logged
//     verbatim.
//   - `textLength` stands in for the generated script body - never logged.
//   - `failureBodyRedacted` is the ONE field that starts from a raw,
//     untrusted upstream string (a failed Gemini HTTP response body) and it
//     is passed through redactSensitiveText (below) before it is ever placed
//     on this type, never after - see that function's own comment for why a
//     request URL or an echoed API key is a real risk here, not a
//     hypothetical one.
//   - Nothing here ever carries the Gemini API key, a Canvas token, or a
//     Supabase key/JWT - none of those are known to the functions that build
//     these shapes in the first place (getGeminiApiKey/getCanvasToken/
//     SUPABASE_SERVICE_ROLE_KEY are never read by media.ts's diag-building
//     code or by this file).
//
// See generation-diag.test.ts for the executable, sabotage-checked coverage
// of redactSensitiveText/fnv1aHash/buildScriptGenerationDiag.

/**
 * A short, non-cryptographic content hash (FNV-1a, 32-bit, hex) - good
 * enough to let a human confirm "the same writing-style block produced two
 * different runs" or "these two prompts were byte-identical" without this
 * diagnostic file ever carrying the actual text. Not cryptographically
 * secure and not meant to be: this is a debugging aid, not an integrity
 * check. No `node:crypto` import on purpose, matching this file's own
 * dependency-free-leaf framing above.
 */
export function fnv1aHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

// Gemini sends its API key as a URL QUERY PARAMETER
// (src/lib/llm.ts's callGemini: `...:generateContent?key=<the key>`) - so any
// request URL is itself a secret, and an upstream error body can ECHO the
// request it is rejecting (a validation error routinely quotes the URL or
// parameters it did not like) - never a hypothetical, exactly the failure
// mode this redaction exists for.
const URL_PATTERN = /https?:\/\/\S+/gi;
// A second, independent pass for a bare "key=..." that is NOT part of a URL
// match (e.g. a body that quotes just the offending parameter rather than
// the whole request, with a space or nothing before it rather than a URL's
// own "?"/"&" separator) - either pattern alone would miss that shape.
const KEY_PARAM_PATTERN = /(^|[?&\s])key=[^&\s"'<>]+/gi;

/**
 * Strip anything that could carry a secret out of an upstream string before
 * it is placed on a diagnostic record, then truncate. Two independent
 * passes (see the two patterns' own comments above) - a body containing
 * both a full URL and a bare key mention is cleaned of both.
 */
export function redactSensitiveText(text: string, maxLength = 200): string {
  const withoutUrls = text.replace(URL_PATTERN, "[url redacted]");
  const withoutKeys = withoutUrls.replace(KEY_PARAM_PATTERN, "$1[redacted]");
  return withoutKeys.slice(0, maxLength);
}

/**
 * The LLM-call facts generateModuleIntroScriptAction (media.ts) can see that
 * generateFromSelectionAction (lms-generation.ts) cannot - the raw Gemini
 * response never reaches that action, so this rides along on
 * generateModuleIntroScriptAction's OWN return value, on the success path
 * AND the failure path alike (see `attempted` below for why: the reported
 * bug IS a failure path, so a diag shape that only existed on success would
 * miss the exact case it exists to diagnose).
 */
export interface ScriptGenerationLlmDiag {
  /** False for a refusal BEFORE any LLM call was made (a blank module label,
   * an out-of-range targetMinutes) - every field below is meaningless/absent
   * in that case, since there was nothing to measure yet. */
  attempted: boolean;
  provider: string;
  /** Only meaningful for provider "gemini" - getGeminiModel()'s value at call
   * time. Never the API key: getGeminiApiKey() is not read by the code that
   * builds this. */
  model?: string;
  /** lectureScriptMaxOutputTokens(minutes) - THE number this whole
   * diagnostic exists to surface (see this file's header comment). */
  tokenBudget?: number;
  /** Length and a short hash of the LITERAL prompt sent to the model - see
   * this file's header comment for why never the prompt text itself. */
  promptLength?: number;
  promptHash?: string;
  /** Length only of getWritingStyleBlock's output folded into the prompt -
   * never the instructor's own writing sample. */
  styleBlockLength?: number;
  /** LlmResult.ok - true even when the response was empty (finishReason
   * MAX_TOKENS/SAFETY can produce ok:true with text:""), which is exactly
   * why `textLength` below is checked separately from `ok`. */
  ok?: boolean;
  finishReason?: string;
  /** Length only - never the generated script body. */
  textLength?: number;
  /** Present only when `ok` is false - the upstream failure body, REDACTED
   * (redactSensitiveText) and truncated. Absent (not merely empty) on
   * success, so a caller can tell "no body" from "an ok call with nothing to
   * report". */
  failureBodyRedacted?: string;
}

/** The pre-call refusal case - see `attempted`'s own doc comment above. */
export function unattemptedLlmDiag(provider: string): ScriptGenerationLlmDiag {
  return { attempted: false, provider };
}

/**
 * The full server-side diagnostic record for one "scripts"-kind
 * generateFromSelectionAction call, merging the course/selection facts THAT
 * action knows with the LLM facts media.ts's generateModuleIntroScriptAction
 * reported back via ScriptGenerationLlmDiag above. Attached as the optional
 * `diag` field on GenerateFromSelectionSuccess/GenerationFailure
 * (src/app/actions/lms-generation.ts, src/lib/lms-generation/kinds.ts) -
 * never populated for any other generation kind.
 */
export interface ScriptGenerationServerDiag {
  /** null only when the course row itself never resolved (see
   * buildScriptGenerationDiag's own `course` parameter doc comment) - the
   * top-level GenerationFailure.courseNotLinked flag already carries that
   * fact for the CLIENT record (generationDiagRecord.ts), so this is not
   * duplicated as a boolean here too. */
  course: {
    id: string;
    name: string;
    /** Exactly as stored in course_hub - the RAW value, not a normalized or
     * host-guessed one, so a diagnostic reader can see precisely what
     * resolveGenerationCourseRow matched against. */
    canvasUrlAsStored: string | null;
    institution: string | null;
  } | null;
  /** Which half of resolveGenerationCourseRow (lms-generation.ts) matched -
   * "courseId" when the caller sent an export selection's course_hub id
   * (resolveLmsCourseRowByIdAction), "canvasUrl" for a live selection
   * (resolveLmsCourseRowAction). Reflects which branch was ATTEMPTED, even
   * when it did not resolve. */
  resolvedBy: "courseId" | "canvasUrl";
  moduleLabel: {
    /** The label actually folded into the prompt/saved artifact. */
    final: string;
    /** True when the caller's own moduleLabel was blank/whitespace and this
     * action substituted DEFAULT_MODULE_LABEL (lms-generation.ts:417) -
     * lets a diagnostic reader tell "the instructor's own module name" from
     * "nothing was selected, so a placeholder was used". */
    fellBackToDefault: boolean;
  } | null;
  generator: {
    kindId: string;
    artifactKind: string;
    actionName: string;
    /** The wire value BEFORE resolveScriptMinutes (script-length.ts) ran -
     * null when the caller omitted it entirely. */
    targetMinutesRaw: number | null;
    /** The value actually sent to generateModuleIntroScriptAction, after
     * resolveScriptMinutes - null only if generation never reached that
     * call at all (there is currently no such path for "scripts", but the
     * type stays honest rather than assuming). */
    targetMinutesResolved: number | null;
  };
  /** null only if generation never reached generateModuleIntroScriptAction at
   * all (e.g. the course row itself failed to resolve, or materials-gathering
   * came back empty) - see this file's header comment for the full split of
   * who knows what. */
  llm: ScriptGenerationLlmDiag | null;
}

/** Builds ScriptGenerationServerDiag from the raw facts
 * generateFromSelectionAction's own "scripts" case has in scope - kept as a
 * separate, pure, testable function rather than an inline object literal at
 * that call site, both so generation-diag.test.ts can exercise it directly
 * and so lms-generation.ts's own "scripts" case (a file already near this
 * repo's 1000-line ceiling) stays a short, one-line call. */
export function buildScriptGenerationDiag(input: {
  courseId?: string;
  course: { id: string; name: string; canvasUrl: string | null; institution: string | null } | null;
  moduleLabelRaw?: string;
  moduleLabelFinal?: string;
  kindId: string;
  artifactKind: string;
  actionName: string;
  targetMinutesRaw?: number;
  targetMinutesResolved?: number;
  llm?: ScriptGenerationLlmDiag;
}): ScriptGenerationServerDiag {
  return {
    course: input.course
      ? {
          id: input.course.id,
          name: input.course.name,
          canvasUrlAsStored: input.course.canvasUrl,
          institution: input.course.institution,
        }
      : null,
    resolvedBy: input.courseId ? "courseId" : "canvasUrl",
    moduleLabel:
      input.moduleLabelFinal !== undefined
        ? { final: input.moduleLabelFinal, fellBackToDefault: !(input.moduleLabelRaw ?? "").trim() }
        : null,
    generator: {
      kindId: input.kindId,
      artifactKind: input.artifactKind,
      actionName: input.actionName,
      targetMinutesRaw: input.targetMinutesRaw ?? null,
      targetMinutesResolved: input.targetMinutesResolved ?? null,
    },
    llm: input.llm ?? null,
  };
}
