import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// TEST-ONLY. Mirrors src/app/actions/announcement-image.wiring.test.ts's own
// exemption (modalAdoption.wiring.test.ts:619-641 filters importers by
// /\.test\.tsx?$/ before flagging a violator, so a *.wiring.test.ts importer
// is excluded by construction). Imports stripComments/walkFiles from that
// module rather than hand-rolling a comment stripper - see that module's own
// header comment (RULING 79) for why a line-wise regex is wrong on the
// shapes this walk depends on.
//
// This file duplicates announcement-image.wiring.test.ts's partition logic
// rather than importing it - importing a helper from another *.test.ts would
// re-run that file's own describe blocks under the wrong setup (this repo's
// no-cross-test-file-imports rule).
import { stripComments, walkFiles } from "@/app/components/ui/modalAdoptionSourceScan";

const SRC_ROOT = path.join(process.cwd(), "src");

function isNonTestSourceFile(fileName: string): boolean {
  return (fileName.endsWith(".ts") || fileName.endsWith(".tsx")) && !fileName.includes(".test.");
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ");
}

interface Occurrence {
  readonly file: string;
  readonly precedingContext: string;
}

/** Every call-shaped occurrence of `${identifier}(` in `stripped` (comments
 * already removed), each sorted into exactly one bucket by its immediately
 * preceding, whitespace-collapsed source: `declaration` (a `function `
 * definition), `bounded` (a `raceWithTimeout(`-wrapped call), or `other`
 * (the violation). A partition, not a denylist of declaration forms - see
 * docs/g5-test-notes.md section 7. */
function partition(
  identifier: string,
  files: readonly string[]
): { declaration: Occurrence[]; bounded: Occurrence[]; other: Occurrence[] } {
  const idPattern = new RegExp(`(?<![A-Za-z0-9_$])${identifier}\\(`, "g");
  const declaration: Occurrence[] = [];
  const bounded: Occurrence[] = [];
  const other: Occurrence[] = [];

  for (const file of files) {
    const stripped = stripComments(readFileSync(file, "utf8"));
    let match: RegExpExecArray | null;
    idPattern.lastIndex = 0;
    while ((match = idPattern.exec(stripped)) !== null) {
      const before = collapseWhitespace(stripped.slice(0, match.index));
      const occurrence: Occurrence = { file, precedingContext: before.slice(-80) };
      if (before.endsWith("function ")) {
        declaration.push(occurrence);
      } else if (before.endsWith("raceWithTimeout(")) {
        bounded.push(occurrence);
      } else {
        other.push(occurrence);
      }
    }
  }

  return { declaration, bounded, other };
}

function describeOther(occurrences: readonly Occurrence[]): string[] {
  return occurrences.map((o) => `${o.file} after "...${o.precedingContext}"`);
}

const ALL_FILES = walkFiles(SRC_ROOT, isNonTestSourceFile);

describe("W-3: the walk over src/ is not narrowed (generateAnnouncementImageAction)", () => {
  it("walks more than 1200 non-test .ts/.tsx files under src/", () => {
    expect(ALL_FILES.length).toBeGreaterThan(1200);
  });

  it("the walk includes files under src/app/actions, src/app/components, and src/lib", () => {
    expect(ALL_FILES.some((f) => f.includes(`${path.sep}app${path.sep}actions${path.sep}`))).toBe(true);
    expect(ALL_FILES.some((f) => f.includes(`${path.sep}app${path.sep}components${path.sep}`))).toBe(true);
    expect(ALL_FILES.some((f) => f.includes(`${path.sep}lib${path.sep}`))).toBe(true);
  });

  it("generateAnnouncementImageAction has exactly one declaration (src/app/actions/announcement-image.ts)", () => {
    const { declaration } = partition("generateAnnouncementImageAction", ALL_FILES);
    expect(declaration.length).toBe(1);
  });
});

describe("W-1: every generateAnnouncementImageAction( call site is either the declaration or raceWithTimeout(-bounded", () => {
  const { other } = partition("generateAnnouncementImageAction", ALL_FILES);

  it("the other bucket is empty", () => {
    expect(describeOther(other)).toEqual([]);
  });

  it("no non-test file aliases the generateAnnouncementImageAction import (import { generateAnnouncementImageAction as x })", () => {
    const aliasPattern = /import\s*\{[^}]*\bgenerateAnnouncementImageAction\s+as\s+/;
    const offenders = ALL_FILES.filter((f) => aliasPattern.test(stripComments(readFileSync(f, "utf8"))));
    expect(offenders).toEqual([]);
  });
});

describe("W-2 outer: the wait passed to raceWithTimeout is CLIENT_PATIENCE_MS, not an inline numeric literal", () => {
  const source = stripComments(
    readFileSync(path.join(SRC_ROOT, "app/components/recording/announcementImagePipeline.ts"), "utf8")
  );

  // The exact shape walkthrough-announcement.structure.test.ts:350-351 already
  // uses for EXEMPLAR_FETCH_TIMEOUT_MS.
  it("the outer call site wraps generateAnnouncementImageAction( in raceWithTimeout(...CLIENT_PATIENCE_MS)", () => {
    expect(source).toMatch(/raceWithTimeout\([^;]*?CLIENT_PATIENCE_MS/);
  });

  it("the outer site's timeout argument is not an inlined numeric literal", () => {
    expect(source).not.toMatch(/raceWithTimeout\(\s*generateAnnouncementImageAction\([^)]*\),\s*\d/);
  });
});
