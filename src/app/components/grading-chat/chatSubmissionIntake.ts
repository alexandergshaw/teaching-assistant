/**
 * GRADING-CHAT wave 1 (docs/grading-chat-waves.md section 3, N1): the pure,
 * client-safe leaf behind the chat surface's ingestion taxonomy. Everything
 * here is synchronous and side-effect-free - no fetch, no Buffer, no
 * "use client"/"use server" directive needed - so it is importable from both
 * the server intake action (grading-chat-intake.ts, N2) and the client driver
 * (useContinuousGradingRun.ts, N3) with no client-bundle risk.
 *
 * Deliberately does NOT re-export `classifyGradingUpload`
 * (src/lib/grade/single-file-entry.ts): that module imports
 * `extractTextFromBuffer` from `../office-extract`, which uses `Buffer` -
 * server-only. Pulling it into this client-safe leaf would drag a server-only
 * module into the client bundle, exactly the violation
 * runtime-import-graph.test.ts exists to catch. File/zip classification runs
 * SERVER-side only, inside N2's prepareChatSubmissionAction; the composer's
 * file-mode `accept` filter uses a plain extension list, not this module.
 */
import type { StudentSubmissionEntry } from "@/lib/grade/types";

/** The owner's "text submissions, zip submissions, url submissions, other
 * file submissions" taxonomy. `file` covers a single supported file OR a
 * zip - both arrive as a dropped/picked File and are disambiguated
 * server-side by extension (N2), so the composer needs one file control, not
 * two. */
export type ChatSubmissionInput =
  | { readonly kind: "text"; readonly label?: string; readonly content: string }
  | { readonly kind: "file"; readonly file: File }
  | { readonly kind: "url"; readonly url: string };

/**
 * What every submission kind resolves to: zero-or-more gradable entries, or a
 * NAMED refusal. `pointsPossible` is carried on the "entries" branch (wave
 * plan BLOCKER-1) so a Canvas-URL submission's point scale threads through to
 * the dispatched GradeRunItemRequestBody unchanged - dropping it here would
 * silently regrade a Canvas assignment on a different scale than the same URL
 * graded on the batch `run` surface.
 */
export type IntakeOutcome =
  | { readonly kind: "entries"; readonly entries: StudentSubmissionEntry[]; readonly pointsPossible: number | null }
  | { readonly kind: "refused"; readonly reason: string };

/** Matches route.ts's MAX_STUDENT_CHARS (the wire-level bound every
 * dispatched entry's `student` field is already checked against) - reused
 * here, not redeclared, so the two figures cannot silently disagree. */
export const CHAT_LABEL_MAX_CHARS = 500;

/**
 * Builds the one entry a text submission represents. `ordinal` is the
 * driver's own monotonic per-session counter (N3), used only when no custom
 * label was given, so every text submission gets a non-empty, distinct
 * `student` and the route never 400s a valid text paste (route.ts:88-90).
 *
 * F4 Gap 2 (docs/grading-chat-security.md, SEC-GC-4): the label is sliced to
 * CHAT_LABEL_MAX_CHARS AFTER defaulting/trimming, so an overlong custom label
 * degrades gracefully (a truncated label, still gradable) instead of failing
 * closed at the route's own 500-char rejection - the same bound-and-trim
 * treatment `boundedItemTitle` (src/lib/supabase/accessibility.ts) already
 * gives a caller-controlled title.
 */
export function buildTextEntry(input: { readonly label?: string; readonly content: string }, ordinal: number): StudentSubmissionEntry {
  const trimmedLabel = input.label?.trim() ?? "";
  const label = trimmedLabel.length > 0 ? trimmedLabel : `Submission ${ordinal}`;
  const student = label.length > CHAT_LABEL_MAX_CHARS ? label.slice(0, CHAT_LABEL_MAX_CHARS) : label;
  return {
    student,
    content: input.content,
    mergedFileCount: 0,
    submittedFiles: [],
  };
}
