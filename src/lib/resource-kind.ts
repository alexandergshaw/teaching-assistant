// Dependency-free leaf for the shared "resource kind" vocabulary.
//
// Two independent pipelines need this five-way union: the shipped Learning
// Resources page (src/app/actions/learning-resource-links.ts, REGRESSION
// entry 324, which historically only ever emitted "doc" | "video" |
// "tutorial") and the discussion-reply resources feature
// (docs/discussion-reply-resources-acceptance-criteria.md), whose capture
// pipeline (src/app/components/recording/discussion-capture.ts) is a CLIENT
// module. This file therefore has NO imports from anywhere in the repo -
// see docs/discussion-reply-resources-acceptance-criteria.md section 1 (R1):
// src/lib/resource-links.ts, the OTHER "resource" module in this codebase,
// is a completely different, curated-map module (its own ResourceLink.kind
// is "tool" | "field") that drags @/lib/urls and the whole curated map
// behind it - dragging that weight into a client bundle for a five-member
// string union would be exactly backwards, hence this leaf living on its
// own rather than being added there (trade-off 4 in that AC's section 9).
//
// Deliberately NOT in src/lib/resource-links.ts (see that file's own doc
// comment for its distinct ResourceLink type) - two same-shaped exported
// names one file apart is the near-miss trap this repo keeps falling into.

export type ResourceKind = "doc" | "video" | "tutorial" | "news" | "paper";

export const RESOURCE_KINDS: readonly ResourceKind[] = ["doc", "video", "tutorial", "news", "paper"];

export const RESOURCE_KIND_LABELS: Record<ResourceKind, string> = {
  doc: "Docs",
  video: "Video",
  tutorial: "Tutorial",
  news: "News",
  paper: "Paper",
};

const RESOURCE_KIND_SET: ReadonlySet<string> = new Set(RESOURCE_KINDS);

/**
 * Coerce an arbitrary "kind" value (typically parsed from a model's JSON
 * output) to the fixed five-way union, defaulting any unrecognized value -
 * including a value of the wrong type - to "doc". Never throws: the same
 * tolerant-coercion posture used across this repo's other model-JSON
 * parsers (e.g. parseTextbookFields), because a model that returns a
 * slightly different string than asked for is an expected input, not an
 * error condition.
 */
export function coerceResourceKind(raw: unknown): ResourceKind {
  return typeof raw === "string" && RESOURCE_KIND_SET.has(raw) ? (raw as ResourceKind) : "doc";
}
