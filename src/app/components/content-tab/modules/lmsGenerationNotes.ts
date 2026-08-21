// The pure `setNote`-shaped copy-builders extracted from useLmsGeneration.ts
// to keep that file under this repo's 1000-line ceiling - a STRUCTURAL split
// only, no behaviour change. Every generate/refine/edit/post success path in
// the hook funnels through one of these; kept together because they all
// share the same save-version vs save-and-post split (P6) driven by
// kindOffersPost. Re-exported from useLmsGeneration.ts so every existing
// import of that file keeps compiling unchanged. See useLmsGeneration.test.ts
// for the executable coverage of every export here.

import type { PostSummary } from "@/lib/lms-generation/commit-plan";
import type { GenerationKindId } from "@/lib/lms-generation/kinds";
import { kindLabelFor, kindOffersPost } from "./lmsGenerationKindHelpers";

/**
 * P6: the note text for a successful generate. Takes the KIND ID (not the
 * label directly - the label is still resolved from it via kindLabelFor)
 * because the sentence itself now depends on the kind: the three original
 * "save-version" kinds keep the EXACT sentence they always have (their tests
 * assert it verbatim), while a "save-and-post" kind gets an accurate
 * replacement - generating alone still never touches Canvas (do not
 * overcorrect into implying it does), but the instructor still needs to know
 * posting is available as a separate step.
 */
export function generationSuccessNote(kindId: GenerationKindId, version: number, selectionLabel: string): string {
  const kindLabel = kindLabelFor(kindId);
  const base = `Generated "${kindLabel}" (version ${version}) from ${selectionLabel}. Saved to this course's generated content`;
  return kindOffersPost(kindId)
    ? `${base} - not yet posted to Canvas. Use "Post to Canvas" below when you're ready.`
    : `${base} - nothing was written to Canvas.`;
}

/** Same split as generationSuccessNote, for a refine's own success note. */
export function refineSuccessNote(kindId: GenerationKindId, version: number): string {
  const kindLabel = kindLabelFor(kindId);
  const base = `Created a new version of "${kindLabel}" (version ${version}) from your instructions. Saved to this course's generated content`;
  return kindOffersPost(kindId)
    ? `${base} - not yet posted to Canvas. Use "Post to Canvas" below when you're ready.`
    : `${base} - nothing was written to Canvas.`;
}

/**
 * E12 (chunk 3e): the note text for a successful manual edit save - same
 * split as generationSuccessNote/refineSuccessNote above (a "save-and-post"
 * kind still needs the "not yet posted" reminder; editing is offered for
 * SOME of those kinds too - objectives and assignments carry no
 * `renderStructured`, so kindSupportsTextEdit and kindOffersPost overlap for
 * them - never only the "save-version" ones). Deliberately says "saved your
 * edit" rather than reusing generationSuccessNote/refineSuccessNote's own
 * wording verbatim, so a note in the UI never claims a model produced text
 * the instructor typed themselves.
 */
export function editSuccessNote(kindId: GenerationKindId, version: number): string {
  const kindLabel = kindLabelFor(kindId);
  const base = `Saved your edit as a new version of "${kindLabel}" (version ${version}). Saved to this course's generated content`;
  return kindOffersPost(kindId)
    ? `${base} - not yet posted to Canvas. Use "Post to Canvas" below when you're ready.`
    : `${base} - nothing was written to Canvas.`;
}

/**
 * P6's third and fourth places: the preview modal's own header meta line
 * repeats generationSuccessNote/refineSuccessNote's Canvas claim a THIRD
 * time, for whichever version is currently on screen (not necessarily the
 * one a generate/refine just produced - the instructor may have switched to
 * an older version via the version picker). Same split, phrased for "this is
 * the state of what's on screen" rather than "this is what this action just
 * did": deliberately NOT "nothing has been posted" (unlike the two notes
 * above) - unlike those two, which report on the generate/refine call that
 * just ran, this line has no way to know whether THIS SPECIFIC version was
 * posted at some earlier point (posting does not mark the artifact row in
 * any way this client can see), so it states the always-true fact - posting
 * is a separate, explicit step - rather than reasserting a Canvas state that
 * could by then be stale.
 */
export function previewMetaText(kindId: GenerationKindId, version: number): string {
  return kindOffersPost(kindId)
    ? `Version ${version} - saved to this course's generated content. Posting to Canvas is a separate, explicit step below.`
    : `Version ${version} - saved to this course's generated content. Nothing was written to Canvas.`;
}

/**
 * P4: turn a completed post's PostSummary into the two-valued `setNote`
 * shape this whole tab already reports through. Mirrors
 * useBulkModuleActions.ts's own `describeOrphans` precedent exactly: a
 * PARTIAL result (the orphan case - created but not linked, or partly
 * landed) is reported with `kind: "error"`, never `"success"` - P4's "never a
 * bare success when it was not linked" - but with `summary.text`, which
 * already names what WAS created, never a bare "failed" either. Only a TRUE
 * "success" status gets `kind: "success"`.
 */
export function postResultNote(summary: PostSummary): { kind: "success" | "error"; text: string } {
  return { kind: summary.status === "success" ? "success" : "error", text: summary.text };
}

/**
 * e.g. "v3 (current) - 2026-08-11". The date is sliced from the ISO
 * timestamp rather than run through `toLocaleDateString` so the label is
 * deterministic across locales/timezones - it is asserted verbatim in
 * useLmsGeneration.test.ts.
 *
 * DEFECT FIX: a generation kind's config label can be re-geared out from
 * under versions saved under an EARLIER meaning of that kind (e.g.
 * "scripts" moved from a 5-30 minute "Lecture script" to a 1-5 minute
 * "Intro video script" while deliberately keeping `artifactKind` as
 * "lecture-script" so the old versions stay reachable - see
 * GeneratedPreviewModal.tsx's own header comment). Because every version in
 * one history then renders under the SAME live kind label regardless of
 * which meaning produced it, the version+date pair above is no longer
 * enough to tell "Week 2 Lecture Script" apart from "Week 2 Intro Video
 * Script" in the picker - `title` is the only field that still does, so it
 * is appended when the artifact has one. Suffixed, not prefixed: v/current/
 * date is the identity a returning instructor already scans for first, and
 * the title is confirming detail. A null/blank title (some kinds - e.g.
 * qa/currentEvents/sampleAnswers - never save one) omits the suffix
 * entirely rather than rendering a trailing "- " or a bare "-". `date` gets
 * the identical guard (M15, adversarial review, WAVE 11C, DEFECT 4): the
 * generated_artifacts.created_at column is NOT NULL today, so a blank/null
 * `createdAt` cannot reach this function in production, but this promise is
 * stated as a property of the LABEL, not of the database schema backing it -
 * guarding only `title` and leaving `createdAt.slice(0, 10)` unguarded would
 * have let a future caller with a blank/null `createdAt` (a test fixture, a
 * relaxed column, a different table) render exactly the dangling "v1 - " this
 * comment promises never to produce, or throw outright on a null. Guarded
 * here rather than narrowing the promise, since the guard costs nothing and
 * keeps the comment's claim true for every input this function's own type
 * signature admits, not merely the one row shape today's schema happens to
 * guarantee.
 */
export function versionOptionLabel(artifact: {
  version: number;
  isCurrent: boolean;
  createdAt: string;
  title: string | null;
}): string {
  const date = artifact.createdAt ? artifact.createdAt.slice(0, 10) : "";
  const versionPart = `v${artifact.version}${artifact.isCurrent ? " (current)" : ""}`;
  const base = date === "" ? versionPart : `${versionPart} - ${date}`;
  const trimmedTitle = (artifact.title ?? "").trim();
  return trimmedTitle === "" ? base : `${base} - ${trimmedTitle}`;
}

/**
 * The preview modal header's own title - same DEFECT FIX as
 * versionOptionLabel above, for the `<h3>` (and matching aria "Preview of…"
 * label) rather than the version picker. The header used to render
 * `kindLabelFor(kindId)` unconditionally, so reopening a version saved under
 * a since-re-geared kind meaning showed the CURRENT kind's name rather than
 * the name the instructor actually generated. Applies the SAME trim-then-
 * fallback rule `artifactDownloadFilename`
 * (src/lib/lms-generation/artifact-download.ts) already established as this
 * feature's precedent for "the artifact's own name vs. the kind's name":
 * prefer the artifact's own saved `title`, falling back to `kindLabel` only
 * when the title is null/blank.
 *
 * M15 (adversarial review, WAVE 11C, DEFECT 3): this is a SEPARATE,
 * hand-written implementation of that rule, not an import of
 * artifactDownloadFilename - that function additionally folds in the
 * version number and a format extension, which this function's plain
 * header-title return value has no use for, so the two were kept apart
 * rather than merged into one call. Keep them in sync by hand if the
 * trim-then-fallback rule itself ever changes.
 */
export function previewHeaderTitle(artifact: { title: string | null }, kindLabel: string): string {
  const trimmedTitle = (artifact.title ?? "").trim();
  return trimmedTitle === "" ? kindLabel : trimmedTitle;
}
