import { describe, it, expect } from "vitest";
import { decideCollisionRefusal, describeCollisionRefusal } from "./collisionRefusal";
import { parseSubmissionFileName } from "./utils";
import {
  generateShape,
  SHAPE_NAMES,
  DEFAULT_SEED,
  DEFAULT_SWEEP_N,
  type ShapeName,
  type GeneratedFile,
} from "./submissionShapeGenerator";

/**
 * A45 wave 1 - the pure corroboration core. The colliding group's FOLDER
 * (decoded key part 0, never the compound display) must match exactly one
 * known student for the A44 amnesty to apply. Absent/empty list = A44
 * unchanged. docs/a45-external-identity-corroboration-scope.md sections 4.3, 6.
 */

function buildRun(paths: string[]): {
  submissions: Record<string, string>;
  zipParents: Record<string, string[]>;
} {
  const submissions: Record<string, string> = {};
  for (const p of paths) submissions[p] = p;
  return { submissions, zipParents: {} };
}

function runOf(set: GeneratedFile[]): {
  submissions: Record<string, string>;
  zipParents: Record<string, string[]>;
} {
  const submissions: Record<string, string> = {};
  const zipParents: Record<string, string[]> = {};
  for (const f of set) {
    submissions[f.path] = f.content;
    if (f.zipChain.length > 0) zipParents[f.path] = f.zipChain;
  }
  return { submissions, zipParents };
}

function ownersOf(set: GeneratedFile[]): string[] {
  return Array.from(new Set(set.map((f) => f.owner)));
}

/** Duplicated from collisionRefusal.test.ts (never imported across test files). */
function countUnsoundAllows(
  shape: ShapeName,
  n: number,
  seed: number,
  rosterFor?: (set: GeneratedFile[]) => string[] | undefined
): { sets: number; unsoundAllows: number; refusals: number } {
  const sets = generateShape(shape, n, seed);
  let unsoundAllows = 0;
  let refusals = 0;
  for (const set of sets) {
    const { submissions, zipParents } = runOf(set);
    const decision = decideCollisionRefusal(submissions, zipParents, rosterFor?.(set));
    if (decision.status !== "ok") refusals += 1;

    const groups = new Map<string, Set<string>>();
    for (const f of set) {
      const parsed = parseSubmissionFileName(f.path, undefined, f.zipChain);
      if (!parsed.reachedStemFallback) continue;
      const markerMatch = f.content.match(/^<<M\d+-\d+>> (.+)$/);
      const owner = markerMatch ? markerMatch[1] : f.owner;
      const existing = groups.get(parsed.studentKey) ?? new Set<string>();
      existing.add(owner);
      groups.set(parsed.studentKey, existing);
    }
    const trueBlend = Array.from(groups.values()).some((owners) => owners.size >= 2);
    if (trueBlend && decision.status === "ok") unsoundAllows += 1;
  }
  return { sets: sets.length, unsoundAllows, refusals };
}

describe("A45 AC-POS - one fixture, only the roster toggled", () => {
  const { submissions, zipParents } = buildRun([
    "AlvarezMaria/Homework Final.docx",
    "AlvarezMaria/Homework Draft.docx",
    "BrownTom/paper.docx",
  ]);

  it("POSITIVE: roster contains the folder's student -> amnesty (ok)", () => {
    const decision = decideCollisionRefusal(submissions, zipParents, ["AlvarezMaria", "BrownTom"]);
    expect(decision).toEqual({ status: "ok" });
  });

  it("NEGATIVE: non-empty roster omitting her -> uncorroborated-shared-folder", () => {
    const decision = decideCollisionRefusal(submissions, zipParents, ["CarterLee", "DiazRosa"]);
    expect(decision.status).toBe("uncorroborated-shared-folder");
    if (decision.status !== "uncorroborated-shared-folder") return;
    expect(decision.group.paths.sort()).toEqual([
      "AlvarezMaria/Homework Draft.docx",
      "AlvarezMaria/Homework Final.docx",
    ]);
    expect(describeCollisionRefusal(decision, zipParents)).toBe(
      'Refused: 2 files in folder "AlvarezMaria" resolve to the same student name "AlvarezMaria/Homework", ' +
        "so they would have been graded together as one row: AlvarezMaria/Homework Draft.docx, AlvarezMaria/Homework Final.docx. " +
        "This folder does not match exactly one student on the course roster, so the folder name is not enough to tell these apart. " +
        "Put each student's files in their own folder inside the zip, or rename each file to studentname_date_time_filename, then upload again. No grades were produced."
    );
  });

  it("MULTIPLE: a roster with two entries canonicalizing equal to the folder -> refuse", () => {
    const decision = decideCollisionRefusal(submissions, zipParents, ["AlvarezMaria", "alvarezmaria"]);
    expect(decision.status).toBe("uncorroborated-shared-folder");
  });

  it("binds to the FOLDER, not the compound display: a roster holding the display string does not corroborate", () => {
    const decision = decideCollisionRefusal(submissions, zipParents, ["AlvarezMaria/Homework"]);
    expect(decision.status).toBe("uncorroborated-shared-folder");
  });

  it("the run gate (i) is unchanged: a single-folder run still refuses as no-folder-signal even with a matching roster", () => {
    const run = buildRun(["AlvarezMaria/Homework Final.docx", "AlvarezMaria/Homework Draft.docx"]);
    const decision = decideCollisionRefusal(run.submissions, run.zipParents, ["AlvarezMaria"]);
    expect(decision.status).toBe("no-folder-signal");
  });
});

describe("A45 AC-5 - no roster is byte-identical to A44", () => {
  const { submissions, zipParents } = buildRun([
    "AlvarezMaria/Homework Final.docx",
    "AlvarezMaria/Homework Draft.docx",
    "BrownTom/paper.docx",
  ]);

  it("undefined and empty roster both amnesty exactly as A44 did", () => {
    expect(decideCollisionRefusal(submissions, zipParents)).toEqual({ status: "ok" });
    expect(decideCollisionRefusal(submissions, zipParents, undefined)).toEqual({ status: "ok" });
    expect(decideCollisionRefusal(submissions, zipParents, [])).toEqual({ status: "ok" });
  });

  it("frozen A44 literals hold with no roster (2254 / 19936 and 287 / 19990)", () => {
    const a = countUnsoundAllows("mixed-perstudent-plus-shared-dropbox", DEFAULT_SWEEP_N, DEFAULT_SEED);
    expect(a.sets).toBe(19936);
    expect(a.unsoundAllows).toBe(2254);
    const b = countUnsoundAllows("nested-shared-dropbox-subdirs", DEFAULT_SWEEP_N, DEFAULT_SEED);
    expect(b.sets).toBe(19990);
    expect(b.unsoundAllows).toBe(287);
  });

  it.each(SHAPE_NAMES as readonly ShapeName[])("shape %s: undefined and [] roster decide identically to none", (shape) => {
    const sets = generateShape(shape, 300, DEFAULT_SEED);
    expect(sets.length).toBeGreaterThan(0);
    for (const set of sets) {
      const { submissions: s, zipParents: z } = runOf(set);
      const base = decideCollisionRefusal(s, z);
      expect(decideCollisionRefusal(s, z, undefined)).toEqual(base);
      expect(decideCollisionRefusal(s, z, [])).toEqual(base);
    }
  });
});

describe("A45 AC-1 / AC-2 - with a complete roster no blend is ever allowed", () => {
  it("AC-1 mixed-perstudent-plus-shared-dropbox: 19936 sets, unsoundAllows 0", () => {
    const r = countUnsoundAllows("mixed-perstudent-plus-shared-dropbox", DEFAULT_SWEEP_N, DEFAULT_SEED, ownersOf);
    expect(r.sets).toBe(19936);
    expect(r.unsoundAllows).toBe(0);
  });

  it("AC-2 nested-shared-dropbox-subdirs: 19990 sets, unsoundAllows 0", () => {
    const r = countUnsoundAllows("nested-shared-dropbox-subdirs", DEFAULT_SWEEP_N, DEFAULT_SEED, ownersOf);
    expect(r.sets).toBe(19990);
    expect(r.unsoundAllows).toBe(0);
  });

  it("AC-1-ordinary: a reflowed ('First Last') roster stays sound (refusals may only rise)", () => {
    const reflow = (set: GeneratedFile[]): string[] =>
      ownersOf(set).map((o) => o.replace(/([a-z])([A-Z])/g, "$1 $2"));
    const complete = countUnsoundAllows("mixed-perstudent-plus-shared-dropbox", 5000, DEFAULT_SEED, ownersOf);
    const ordinary = countUnsoundAllows("mixed-perstudent-plus-shared-dropbox", 5000, DEFAULT_SEED, reflow);
    expect(ordinary.unsoundAllows).toBe(0);
    expect(ordinary.refusals).toBeGreaterThanOrEqual(complete.refusals);
  });
});

describe("A45 AC-3 - no new false refusals on folder-resubmit (within-run, counts only)", () => {
  it("complete-roster refusals <= no-roster refusals over the same sets", () => {
    const pre = countUnsoundAllows("folder-resubmit", 5000, DEFAULT_SEED);
    const post = countUnsoundAllows("folder-resubmit", 5000, DEFAULT_SEED, ownersOf);
    expect(pre.sets).toBeGreaterThan(0);
    expect(post.refusals).toBeLessThanOrEqual(pre.refusals);
  });
});
