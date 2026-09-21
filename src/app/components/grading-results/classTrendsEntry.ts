// A16-1 (docs/a16-scope.md section 4.1): the adapter that lets any of the
// four LMS Grading surfaces sharing GradingResults.tsx (zip, canvas,
// livefeed, github) mount ClassTrendsPanel - the same panel Drafted Grades
// already uses - without ClassTrendsPanel's own prop type changing at all.
//
// For A16-1 the adapter passes `run` BY REFERENCE and rewrites nothing:
// no filtering, no reordering, no truncating, no per-result rewrite. Three
// reasons (section 4.1): computeClassTrends only reads result.rubricAreas
// and the graded/ungraded split, so a copy adds nothing; any per-result
// rewrite is exactly where an identity mistake would live; and this keeps
// the entry identical in shape to the one DraftedGradesTab.tsx already
// hands the panel (real `student`, and `userId` where postable) - stripping
// or blanking either would break N13b's per-student attribution before it
// is even built (section 4.2, blocker B7).
//
// This file is a canary-3 root in classTrendsDraft.not-postable.test.ts
// (section 4.2's "Both:" bullet): its output is built in render and handed
// straight to the panel, never written anywhere, so it must never import a
// posting or persisting capability (app/actions, lib/canvas*,
// lib/lms-generation, lib/llm*, lib/gemini*).
//
// Imports the two GradingRun types through the narrow type surface,
// "@/lib/grade/types", and never through the "@/lib/grade" barrel: a VALUE
// import of that barrel is a client-bundle hazard (see GradingResults.tsx's
// own header comment on gradingResultsHelpers.ts for the shipped incident).
//
// NOTE FOR FUTURE EDITORS (corrected by A23): the client-bundle guard in
// gradingResultsHelpersWiring.test.ts is a transitive runtime-import-graph
// walk with edge extraction by the TypeScript parser - it reads the AST, not
// raw source, so a banned specifier appearing in a comment (like this one)
// does not reach it. Still: name the barrel without a preceding "from"
// anywhere in this file's own prose, for a human reader's sake.
import type { GradingRun, GradingRunEntry } from "@/lib/grade/types";

export interface ClassTrendsEntryMeta {
  courseName: string;
  assignmentName: string;
  canvasUrl: string;
}

/** Builds the GradingRunEntry ClassTrendsPanel expects, from a plain
 * GradingRun plus the metadata a caller already has. `run` is carried by
 * REFERENCE (`entry.run === run`) - see this file's header comment. */
export function toClassTrendsEntry(run: GradingRun, meta: ClassTrendsEntryMeta): GradingRunEntry {
  return { ...meta, run };
}

/** True when at least one graded result in `entry` carries at least one
 * rubric area - the gate for showing the trends panel at all (section 4.6).
 * Without this gate, the shipped panel renders a Button reading "Trends (0)"
 * for a run with nothing to summarize yet. */
export function hasTrendableResults(entry: GradingRunEntry): boolean {
  return entry.run.results.some((r) => !r.ungraded && r.rubricAreas.length > 0);
}
