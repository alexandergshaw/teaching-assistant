import { describe, it, expect } from "vitest";
import { decideCollisionRefusal, describeCollisionRefusal } from "./collisionRefusal";
import { parseSubmissionFileName } from "./utils";
import {
  generateShape,
  SHAPE_NAMES,
  DEFAULT_SEED,
  DEFAULT_SWEEP_N,
  type ShapeName,
} from "./submissionShapeGenerator";

/**
 * A44 wave 2 - RULING 87's refined collision refusal. Fixture ids and
 * DECISION verdicts follow docs/a44-test-notes.md section 1.3's frozen
 * 27-fixture table; R8's copy rules follow that document's section 5.
 *
 * The identity-key oracle (R13), the frozen row/display oracle (R1),
 * INVARIANT M (R14) and INVARIANT D (R15) all live in Wave 1's
 * identityInvariants.test.ts and are not re-derived here - this file's job
 * is the REFUSAL PREDICATE only, over exactly the same fixtures where they
 * matter.
 */

interface FixtureFile {
  path: string;
  zipChain?: string[];
}

function buildRun(files: FixtureFile[]): {
  submissions: Record<string, string>;
  zipParents: Record<string, string[]>;
} {
  const submissions: Record<string, string> = {};
  const zipParents: Record<string, string[]> = {};
  for (const file of files) {
    submissions[file.path] = file.path;
    if (file.zipChain && file.zipChain.length > 0) {
      zipParents[file.path] = file.zipChain;
    }
  }
  return { submissions, zipParents };
}

describe("A44 R2 - the decision, fixture by fixture (docs/a44-test-notes.md section 1.3's DECISION column)", () => {
  it("F1: the A14 sanitized-name collision resolves at step 2 - the refusal cannot see it and must not refuse (RES-A44T-1)", () => {
    const { submissions, zipParents } = buildRun([
      { path: "johnsmith_1001_0_report.docx" },
      { path: "johnsmith_1002_0_report.docx" },
    ]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("ok");
  });

  it("F4: two flat files with no folder signal at all - REFUSE, no-folder-signal", () => {
    const { submissions, zipParents } = buildRun([
      { path: "Homework Final.docx" },
      { path: "Homework Draft.docx" },
    ]);
    const decision = decideCollisionRefusal(submissions, zipParents);
    expect(decision.status).toBe("no-folder-signal");
  });

  it("F6: one owner's two drafts share a folder, but the run shows only that one folder - REFUSE (RULING 87's pinned conservative case)", () => {
    const { submissions, zipParents } = buildRun([
      { path: "AlvarezMaria/Homework Final.docx" },
      { path: "AlvarezMaria/Homework Draft.docx" },
    ]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("no-folder-signal");
  });

  it("F9/G9/G4: flat same-stem collisions with no folder signal - REFUSE", () => {
    const f9 = buildRun([{ path: "Essay.docx" }, { path: "essay.docx" }]);
    expect(decideCollisionRefusal(f9.submissions, f9.zipParents).status).toBe("no-folder-signal");

    const g4 = buildRun([{ path: "Submissions/essay.docx" }, { path: "Submissions/essay.pdf" }]);
    expect(decideCollisionRefusal(g4.submissions, g4.zipParents).status).toBe("no-folder-signal");
  });

  it("F5: two convention matches plus a flat README - ALLOW (convention branch never reaches the fallback)", () => {
    const { submissions, zipParents } = buildRun([
      { path: "alvarezmaria_2024-01-01_120000_essay.docx" },
      { path: "browntom_2024-01-01_120000_essay.docx" },
      { path: "README.txt" },
    ]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("ok");
  });

  it("G1/G2/G8: per-student folders - ALLOW, no collision at all", () => {
    const g8 = buildRun([
      { path: "Submissions/AlvarezMaria/essay.txt" },
      { path: "Submissions/BrownTom/essay.txt" },
    ]);
    expect(decideCollisionRefusal(g8.submissions, g8.zipParents).status).toBe("ok");
  });

  it("G3/K2: one or two owners split across their own subdirectories - ALLOW (RULING 95's accepted split, no collision to refuse)", () => {
    const k2 = buildRun([
      { path: "Submissions/AlvarezMaria/src/main.py" },
      { path: "Submissions/AlvarezMaria/docs/r.txt" },
      { path: "Submissions/BrownTom/src/main.py" },
      { path: "Submissions/BrownTom/docs/r.txt" },
    ]);
    expect(decideCollisionRefusal(k2.submissions, k2.zipParents).status).toBe("ok");
  });

  it("G5: two per-student folders plus a two-student Shared folder - ALLOW (RULING 87's accepted unsound case: the run gate is open)", () => {
    const { submissions, zipParents } = buildRun([
      { path: "AlvarezMaria/homework.txt" },
      { path: "BrownTom/homework.txt" },
      { path: "Shared/essay.docx" },
      { path: "Shared/essay.pdf" },
    ]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("ok");
  });

  it("G6: a two-student folder plus one clean folder elsewhere - ALLOW (same accepted-unsound class as G5, a different route)", () => {
    const { submissions, zipParents } = buildRun([
      { path: "JohnSmith/report.docx" },
      { path: "JohnSmith/report.pdf" },
      { path: "AlvarezMaria/essay.txt" },
    ]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("ok");
  });

  it("G12: a two-student flat collision inside an otherwise-foldered run - REFUSE, flat-collision-in-foldered-run", () => {
    const { submissions, zipParents } = buildRun([
      { path: "AlvarezMaria/homework.txt" },
      { path: "BrownTom/homework.txt" },
      { path: "essay.docx" },
      { path: "essay.pdf" },
    ]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("flat-collision-in-foldered-run");
  });

  it("K1: the three forged keys are invisible to the refusal - ALLOW, because collidingGroups is 0 (the refusal is not the only instrument for identity)", () => {
    const { submissions, zipParents } = buildRun([
      { path: "AlvarezMaria/essay.docx" },
      { path: " 12:alvarezmariaessay.docx" },
      { path: " 12:alvarezmaria5:essay.docx" },
      { path: "12:alvarezmaria5:essay_2026-09-01_120000_x.docx" },
    ]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("ok");
  });

  it("F7/G10: crossing-chain and convention resolutions never reach the fallback - ALLOW", () => {
    const f7 = buildRun([
      { path: "janedoe_2024-01-01_120000_project.zip/main.py", zipChain: ["janedoe_2024-01-01_120000_project.zip"] },
      { path: "johndoe_2024-01-01_130000_project.zip/main.py", zipChain: ["johndoe_2024-01-01_130000_project.zip"] },
    ]);
    expect(decideCollisionRefusal(f7.submissions, f7.zipParents).status).toBe("ok");
  });
});

describe("A44 R8 - the refusal copy, bound to emitted values by equality", () => {
  it("C-D / no-folder-signal with a folder: names the folder verbatim (case-preserving), quoted, preceded by the word 'folder'", () => {
    const { submissions, zipParents } = buildRun([
      { path: "AlvarezMaria/Homework Final.docx" },
      { path: "AlvarezMaria/Homework Draft.docx" },
    ]);
    const decision = decideCollisionRefusal(submissions, zipParents);
    const message = describeCollisionRefusal(decision, zipParents);
    // "the same student name" is bound to `studentDisplay` for the group
    // (R8's clause table) - which under RULE D already carries the fold, so
    // it reads "AlvarezMaria/Homework" here, not the bare stem "Homework".
    expect(message).toBe(
      'Refused: 2 files in folder "AlvarezMaria" resolve to the same student name "AlvarezMaria/Homework", ' +
        "so they would have been graded together as one row: AlvarezMaria/Homework Draft.docx, AlvarezMaria/Homework Final.docx. " +
        "This archive has no other student folders, so the folder name is not enough to tell these apart. " +
        "Put each student's files in their own folder inside the zip, or rename each file to studentname_date_time_filename, then upload again. No grades were produced."
    );
  });

  it("a purely flat no-folder-signal collision names no folder at all (there is none to name)", () => {
    const { submissions, zipParents } = buildRun([
      { path: "Homework Final.docx" },
      { path: "Homework Draft.docx" },
    ]);
    const decision = decideCollisionRefusal(submissions, zipParents);
    const message = describeCollisionRefusal(decision, zipParents);
    expect(message).toBe(
      'Refused: 2 files resolve to the same student name "Homework", ' +
        "so they would have been graded together as one row: Homework Draft.docx, Homework Final.docx. " +
        "This archive has no other student folders, so the folder name is not enough to tell these apart. " +
        "Put each student's files in their own folder inside the zip, or rename each file to studentname_date_time_filename, then upload again. No grades were produced."
    );
  });

  it("C-D on a TWO-SEGMENT directory (G8's shape, forced flat): the whole container-relative path is named, not just its last segment", () => {
    const { submissions, zipParents } = buildRun([
      { path: "Submissions/AlvarezMaria/Homework Final.docx" },
      { path: "Submissions/AlvarezMaria/Homework Draft.docx" },
    ]);
    const decision = decideCollisionRefusal(submissions, zipParents);
    const message = describeCollisionRefusal(decision, zipParents);
    expect(message).toContain('in folder "Submissions/AlvarezMaria"');
    expect(message).not.toContain('in folder "AlvarezMaria"');
  });

  it("the flat-collision-in-foldered-run variant does NOT claim there are no other student folders (C-D's negative constraint)", () => {
    const { submissions, zipParents } = buildRun([
      { path: "AlvarezMaria/homework.txt" },
      { path: "BrownTom/homework.txt" },
      { path: "essay.docx" },
      { path: "essay.pdf" },
    ]);
    const decision = decideCollisionRefusal(submissions, zipParents);
    const message = describeCollisionRefusal(decision, zipParents);
    expect(message).not.toContain("no other student folders");
    expect(message).toContain("Other files in this archive have their own student folders");
  });

  it("truncates the path list at 5 with ', ...' for a 6-path colliding group, never silently dropping the count", () => {
    // Every path's leaf-stem-fallback regex (/^([A-Za-z0-9]+)/) matches
    // "Homework" and stops at the space, so all six collide onto one key.
    const files = Array.from({ length: 6 }, (_, i) => ({ path: `Homework ${i}.docx` }));
    const { submissions, zipParents } = buildRun(files);
    const decision = decideCollisionRefusal(submissions, zipParents);
    expect(decision.status).toBe("no-folder-signal");
    const message = describeCollisionRefusal(decision, zipParents);
    expect(message).toContain("Refused: 6 files");
    expect(message).toContain(", ...");
    expect(message).toContain(
      "Homework 0.docx, Homework 1.docx, Homework 2.docx, Homework 3.docx, Homework 4.docx, ..."
    );
  });

  it("never claims the colliding files ARE the same student, only that they resolve to the same student NAME (C-F)", () => {
    const { submissions, zipParents } = buildRun([
      { path: "Homework Final.docx" },
      { path: "Homework Draft.docx" },
    ]);
    const message = describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents), zipParents)!;
    expect(message).toContain('resolve to the same student name "Homework"');
    expect(message).not.toContain("are the same student");
  });

  it("null on ok - no proceed-anyway sentence exists for any decision (C-E)", () => {
    const { submissions, zipParents } = buildRun([{ path: "essay.docx" }]);
    expect(describeCollisionRefusal(decideCollisionRefusal(submissions, zipParents), zipParents)).toBeNull();
  });
});

/**
 * Shared by the property sweep below and the RULING 89 frozen-literal pins:
 * for each generated set, ground truth (recovered by content MARKER, never
 * by file name - K1's forgeries make name-based recovery provably wrong) is
 * crossed with `decideCollisionRefusal`'s verdict. A set counts as
 * unsound-and-allowed when some fallback-reaching group actually blends two
 * or more distinct declared owners AND the refusal predicate said "ok".
 */
function countUnsoundAllows(
  shape: ShapeName,
  n: number,
  seed: number
): { sets: number; unsoundAllows: number } {
  const sets = generateShape(shape, n, seed);
  let unsoundAllows = 0;
  for (const set of sets) {
    const submissions: Record<string, string> = {};
    const zipParents: Record<string, string[]> = {};
    for (const f of set) {
      submissions[f.path] = f.content;
      if (f.zipChain.length > 0) zipParents[f.path] = f.zipChain;
    }
    const decision = decideCollisionRefusal(submissions, zipParents);

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
  return { sets: sets.length, unsoundAllows };
}

describe("A44 R2 - the soundness sweep over generated input (the shape generator, RULING 97)", () => {
  const SOUND_SHAPES: ShapeName[] = [
    "flat",
    "folder",
    "convention",
    "convention-resubmit",
    "folder-distinct-stems",
    "shared-wrapper-folder",
    "nested-bulk-perstudent-folders",
    "nested-perstudent-subdirs",
    "single-student-multi-folder-shared-filename",
    "folder-resubmit",
    "flat-forgery",
    "flat-forgery-perpart",
    "conv-forgery",
    "crossstep-ambiguity",
  ];

  it("the shape list generator exposes all seventeen frozen shape names", () => {
    expect(SHAPE_NAMES).toHaveLength(17);
  });

  it.each(SOUND_SHAPES)("shape %s: zero fallback-caused blends are ever ALLOWED", (shape) => {
    const { sets, unsoundAllows } = countUnsoundAllows(shape, 5000, 20260927);
    expect(sets).toBeGreaterThan(0);
    expect(unsoundAllows).toBe(0);
  });

  it("convention / convention-resubmit / folder-distinct-stems: never refuses (second direction of R2)", () => {
    for (const shape of ["convention", "convention-resubmit", "folder-distinct-stems"] as ShapeName[]) {
      const sets = generateShape(shape, 5000, 20260927);
      expect(sets.length).toBeGreaterThan(0);
      let refusals = 0;
      for (const set of sets) {
        const submissions: Record<string, string> = {};
        const zipParents: Record<string, string[]> = {};
        for (const f of set) {
          submissions[f.path] = f.content;
          if (f.zipChain.length > 0) zipParents[f.path] = f.zipChain;
        }
        if (decideCollisionRefusal(submissions, zipParents).status !== "ok") refusals += 1;
      }
      expect(refusals).toBe(0);
    }
  });
});

describe("A44 RULING 89 - the accepted-unsound count is a FROZEN LITERAL, not a property (docs/a44-test-notes.md 1.5(d) and 0.8a)", () => {
  // These pin the exact integers docs/a44-test-notes.md section 1.5(d) and
  // 0.8a measured against THIS generator at its own SWEEP_N/seed - not the
  // 5000-set sample the property assertions above use. A property
  // ("unsoundAllows !== 0") passes whether the count is 287 or 4000; only a
  // literal fails loudly when RULE K's amnesty widens. RULING 87's accepted
  // cost is unchanged only if these two numbers do not move upward.
  it("mixed-perstudent-plus-shared-dropbox: unsound-and-allowed is exactly 2254 of 19936 sets", () => {
    const { sets, unsoundAllows } = countUnsoundAllows(
      "mixed-perstudent-plus-shared-dropbox",
      DEFAULT_SWEEP_N,
      DEFAULT_SEED
    );
    expect(sets).toBe(19936);
    expect(unsoundAllows).toBe(2254);
  });

  it("nested-shared-dropbox-subdirs: unsound-and-allowed is exactly 287 of 19990 sets", () => {
    const { sets, unsoundAllows } = countUnsoundAllows(
      "nested-shared-dropbox-subdirs",
      DEFAULT_SWEEP_N,
      DEFAULT_SEED
    );
    expect(sets).toBe(19990);
    expect(unsoundAllows).toBe(287);
  });
});
