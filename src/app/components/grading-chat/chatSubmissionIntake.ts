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
import type { StudentSubmissionEntry, SubmittedFileInfo } from "@/lib/grade/types";
import { assignUnclaimedLabel } from "@/lib/grade/utils";

/** The owner's "text submissions, zip submissions, url submissions, other
 * file submissions" taxonomy. `file` covers a single supported file OR a
 * zip - both arrive as a dropped/picked File and are disambiguated
 * server-side by extension (N2), so the composer needs one file control, not
 * two. */
export type ChatSubmissionInput =
  | { readonly kind: "text"; readonly label?: string; readonly content: string }
  | { readonly kind: "file"; readonly file: File; readonly label?: string }
  | { readonly kind: "url"; readonly url: string; readonly label?: string }
  | { readonly kind: "composite"; readonly student: string; readonly parts: readonly CompositePartInput[] }
  // BULK-ZIP BW1: a class zip too large for the request body, already uploaded
  // to private Storage under `${userId}/grading-uploads/<uuid>.zip`. Carries
  // only the path; BW2's streaming ingest reads, parses and deletes it. The
  // driver does not consume this member until BW2.
  | { readonly kind: "storaged-zip"; readonly storagePath: string; readonly name: string };

/** One part of a composite submission. Each part resolves to EXACTLY ONE
 * entry (see extractSingleEntry); a part that would resolve to zero or many
 * (a class zip, a multi-submission Canvas URL) is refused by name, never
 * merged. `file` is a SINGLE File: "several files" is several file parts. */
export type CompositePartInput =
  | { readonly kind: "text"; readonly content: string }
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

const COMPOSITE_PART_SEPARATOR = "\n\n---\n\n";

/**
 * Pure merge of already-resolved single-entry parts into ONE entry
 * (docs/grading-chat-composite-scope.md section 4). The content format extends
 * the separator both existing merge sites use (utils.ts zip path,
 * extraction.ts Canvas path) with a per-part header carrying the 1-based
 * ordinal and the part's own label, so provenance survives truncation.
 *
 * mergedFileCount is the SUM of each part's own count over the allowed part
 * kinds (text 0, single file 1, repo fileCount): it counts constituent FILES,
 * not parts. The zip and Canvas precedents differ on this field, so neither
 * is mirrored. `student` is the argument verbatim; single-source provenance
 * fields (userId, gradedRepo, submissionUrl, codeRun, ...) are left unset.
 */
export function mergeCompositeEntries(resolvedParts: readonly StudentSubmissionEntry[], student: string): StudentSubmissionEntry {
  const content = resolvedParts
    .map((part, index) => `Part ${index + 1} - ${part.student}:\n\n${part.content}`)
    .join(COMPOSITE_PART_SEPARATOR);

  const takenNames = new Set<string>();
  const submittedFiles: SubmittedFileInfo[] = [];
  let mergedFileCount = 0;
  for (const part of resolvedParts) {
    mergedFileCount += part.mergedFileCount;
    for (const file of part.submittedFiles) {
      const name = assignUnclaimedLabel(file.name, takenNames);
      takenNames.add(name);
      submittedFiles.push(name === file.name ? file : { ...file, name });
    }
  }

  return { student, content, mergedFileCount, submittedFiles };
}

/**
 * Enforces exactly ONE entry per composite part, on cardinality rather than
 * source kind. A single-entry Canvas/zip IS admitted; its outcome-level
 * pointsPossible is intentionally dropped here (it lives on IntakeOutcome, not
 * on the entry) - a composite is graded on the session rubric.
 */
export function extractSingleEntry(
  outcome: IntakeOutcome,
  partLabel: string
): { readonly ok: true; readonly entry: StudentSubmissionEntry } | { readonly ok: false; readonly reason: string } {
  if (outcome.kind === "refused") return { ok: false, reason: outcome.reason };
  if (outcome.entries.length === 0) return { ok: false, reason: `${partLabel} had nothing to grade.` };
  if (outcome.entries.length > 1) {
    return {
      ok: false,
      reason: `${partLabel} resolved to more than one student's submission, so it can't be one student's composite part - grade it as its own submission instead.`,
    };
  }
  return { ok: true, entry: outcome.entries[0] };
}
