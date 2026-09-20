// The registry of backlog areas. An area is a topical tag clustering related
// rows - render.ts sorts and labels by it, never alphabetically - THE ARRAY
// ORDER BELOW IS THE RENDER ORDER (plan-v2.md "GROUP ORDER is the registry
// array's own order", carried forward under the new name). This is
// deliberately the one edit point for both the cluster list and its order,
// the same construction render.ts's own SECTION_ORDER already uses for
// state. Product-facing areas come first, process/loop debt last.
//
// NAMED "area", not "group": docs/DEV_LOOP.md:145-147 already uses "backlog
// group" to mean a PUSH AND REGRESSION UNIT ("one pass per backlog group,
// its own push, never per feature and never several groups rolled
// together"). This field is a topical tag, a different thing entirely -
// reusing "group" would make a future reader mistake a topical cluster for a
// push unit.
//
// A slug names a SUBJECT, never a proposed solution. Two earlier drafts of
// this registry used "llm-call-timeout-bound" and
// "auth-guard-reclassification" - each naming an approach the row's own note
// records as already considered and REJECTED, which would have written a
// dead answer into a durable key. Renamed to "llm-call-platform-ceiling" and
// "owner-guard-call-sites", which name the subject, not a fix.
//
// An area slug in docs/backlog.yml MUST appear here. yaml-codec.ts throws on
// an unregistered slug rather than accepting it, because free text would let
// a typo silently mint a new singleton cluster on every misspelling - the
// same failure mode a bare string `state` would have had without
// isBacklogState.
export interface BacklogArea {
  slug: string;
  label: string;
}

export const BACKLOG_AREAS: readonly BacklogArea[] = [
  { slug: "grading-run-survival-and-disclosure", label: "Grading runs: bounds, failures, not-attempted rows, class-trends signal" },
  { slug: "assessment-shared-rows-and-feedback", label: "assessment-shared: row restore and feedback composition" },
  { slug: "discussion-reply-grading", label: "Discussion replies graded as independent posts" },
  { slug: "one-upload-per-student-grading", label: "One upload per student: boundary, auto-grade, rubric ingest" },
  { slug: "repo-grader-workflow", label: "Repo grader workflow and state legibility" },
  { slug: "ask-ai-modal", label: "Ask AI modal: persistence and chip copy" },
  { slug: "rich-text-copy-fidelity", label: "Rich-text draft rendering and clipboard" },
  { slug: "llm-call-platform-ceiling", label: "LLM calls against the platform invocation ceiling" },
  { slug: "owner-guard-call-sites", label: "requireOwner() call-site authorization" },
  { slug: "orphan-upload-sweep", label: "Orphan-upload sweep" },
  { slug: "loop-and-docs-maintenance", label: "The loop's own docs, gates and process debt" },
  { slug: "walkthrough-announcement-surface", label: "Announcement from a walkthrough: draft controls and what the tool says it reads" },
  { slug: "recording-capture-surfaces", label: "Screen-capture surfaces: what they record, keep and hand back" },
];

export function isBacklogArea(slug: string): boolean {
  return BACKLOG_AREAS.some((a) => a.slug === slug);
}

/** Throws-never lookup is deliberately NOT provided here: a caller that needs the label for a slug it has not validated should fail loudly, so areaLabel throws on an unregistered slug rather than returning a placeholder that could be mistaken for real registry data. */
export function areaLabel(slug: string): string {
  const found = BACKLOG_AREAS.find((a) => a.slug === slug);
  if (!found) {
    throw new Error(`areas: unregistered area slug "${slug}"`);
  }
  return found.label;
}

/** Position in the registry array - the sort key render.ts uses so cluster order matches this file, never localeCompare on the label. Throws on an unregistered slug for the same reason areaLabel does. */
export function areaIndex(slug: string): number {
  const index = BACKLOG_AREAS.findIndex((a) => a.slug === slug);
  if (index === -1) {
    throw new Error(`areas: unregistered area slug "${slug}"`);
  }
  return index;
}
