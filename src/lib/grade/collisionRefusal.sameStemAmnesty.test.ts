import { describe, it, expect } from "vitest";
import { decideCollisionRefusal, describeCollisionRefusal } from "./collisionRefusal";
import { parseSubmissionFileName } from "./utils";
import {
  generateShape,
  DEFAULT_SEED,
  DEFAULT_SWEEP_N,
  type ShapeName,
} from "./submissionShapeGenerator";

/**
 * Same-stem collision amnesty, READING R (docs/same-stem-collision-amnesty-scope.md):
 * a colliding group is not refused when every file shares one base stem AND
 * that stem is a Canvas per-student identity (`<digits>-<digits> - ...`).
 * A name-only amnesty is unsound (measured), so AC-GATE-NEGATIVE pins the gate.
 */

function buildRun(paths: string[]): {
  submissions: Record<string, string>;
  zipParents: Record<string, string[]>;
} {
  const submissions: Record<string, string> = {};
  for (const p of paths) submissions[p] = p;
  return { submissions, zipParents: {} };
}

const OWNER_STEM = "949293-4404402 - Estrada-Damion-Oct 11, 2026 550 PM";
const OWNER_CPP = `${OWNER_STEM}.cpp`;
const OWNER_DOCX = `${OWNER_STEM}.docx`;

describe("AC-POS - the owner's exact case is not refused", () => {
  it("949293-4404402 .cpp + .docx (same Canvas stem) -> ok, no message", () => {
    const { submissions, zipParents } = buildRun([OWNER_CPP, OWNER_DOCX]);
    const decision = decideCollisionRefusal(submissions, zipParents);
    expect(decision.status).toBe("ok");
    expect(describeCollisionRefusal(decision, zipParents)).toBeNull();
  });

  it("the two files really do collide on one stem-fallback key (so the amnesty is what lets them through)", () => {
    const a = parseSubmissionFileName(OWNER_CPP, undefined, []);
    const b = parseSubmissionFileName(OWNER_DOCX, undefined, []);
    expect(a.reachedStemFallback).toBe(true);
    expect(a.studentKey).toBe(b.studentKey);
  });

  it("stem comparison is trimmed and case-insensitive", () => {
    const { submissions, zipParents } = buildRun([
      "949293-4404402 - ESTRADA-DAMION-OCT 11, 2026 550 PM.cpp",
      OWNER_DOCX,
    ]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("ok");
  });
});

describe("AC-GATE-NEGATIVE - generic same-stem collisions must STILL refuse", () => {
  it("midterm.txt + midterm.md (different students, same full stem) -> no-folder-signal", () => {
    const { submissions, zipParents } = buildRun(["midterm.txt", "midterm.md"]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("no-folder-signal");
  });

  it("Report Draft.md + Report Draft.pdf (multi-token generic stem) -> no-folder-signal", () => {
    const { submissions, zipParents } = buildRun(["Report Draft.md", "Report Draft.pdf"]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("no-folder-signal");
  });

  it("leading digits without the `-<digits> - ` shape are not a Canvas identity -> still refused", () => {
    const { submissions, zipParents } = buildRun(["949293 something.txt", "949293 something.md"]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("no-folder-signal");
  });

  it("a Canvas stem with DIFFERENT full stems per file is not amnestied (RES-SS-4)", () => {
    const { submissions, zipParents } = buildRun([
      "949293-4404402 - Estrada-Damion-Oct 11, 2026 550 PM.cpp",
      "949293-4404403 - Estrada-Damion-Oct 12, 2026 600 PM.docx",
    ]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("no-folder-signal");
  });
});

describe("AC-FOLDERED-CANVAS - orthogonal to A45, fires first, needs no roster", () => {
  it("foldered Canvas same-stem pair in a run with a second fallback folder -> ok with no roster", () => {
    const { submissions, zipParents } = buildRun([
      `AlvarezMaria/${OWNER_CPP}`,
      `AlvarezMaria/${OWNER_DOCX}`,
      "BrownTom/paper.docx",
    ]);
    expect(decideCollisionRefusal(submissions, zipParents).status).toBe("ok");
  });

  it("with a roster that matches nobody the amnesty still holds (it does not read the roster)", () => {
    const { submissions, zipParents } = buildRun([
      `AlvarezMaria/${OWNER_CPP}`,
      `AlvarezMaria/${OWNER_DOCX}`,
      "BrownTom/paper.docx",
    ]);
    expect(decideCollisionRefusal(submissions, zipParents, ["Zed Zeta"]).status).toBe("ok");
  });
});

// Duplicated from collisionRefusal.test.ts (never imported across test files).
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

describe("AC-NO-BLEND - the amnesty never fires on the frozen generator", () => {
  it("flat: zero unsound allows at the full sweep (the shape a naive amnesty would break)", () => {
    const { sets, unsoundAllows } = countUnsoundAllows("flat", DEFAULT_SWEEP_N, DEFAULT_SEED);
    expect(sets).toBeGreaterThan(0);
    expect(unsoundAllows).toBe(0);
  });

  it("mixed-perstudent-plus-shared-dropbox stays exactly 2254 of 19936", () => {
    const { sets, unsoundAllows } = countUnsoundAllows(
      "mixed-perstudent-plus-shared-dropbox",
      DEFAULT_SWEEP_N,
      DEFAULT_SEED
    );
    expect(sets).toBe(19936);
    expect(unsoundAllows).toBe(2254);
  });

  it("nested-shared-dropbox-subdirs stays exactly 287 of 19990", () => {
    const { sets, unsoundAllows } = countUnsoundAllows(
      "nested-shared-dropbox-subdirs",
      DEFAULT_SWEEP_N,
      DEFAULT_SEED
    );
    expect(sets).toBe(19990);
    expect(unsoundAllows).toBe(287);
  });
});
