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

interface SourceFile {
  readonly file: string;
  readonly stripped: string;
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
  files: readonly SourceFile[]
): { readonly declaration: readonly Occurrence[]; readonly bounded: readonly Occurrence[]; readonly other: readonly Occurrence[] } {
  const idPattern = new RegExp(`(?<![A-Za-z0-9_$])${identifier}\\(`, "g");
  const declaration: Occurrence[] = [];
  const bounded: Occurrence[] = [];
  const other: Occurrence[] = [];

  for (const { file, stripped } of files) {
    let match: RegExpExecArray | null;
    idPattern.lastIndex = 0;
    while ((match = idPattern.exec(stripped)) !== null) {
      const before = collapseWhitespace(stripped.slice(0, match.index));
      const occurrence: Occurrence = Object.freeze({ file, precedingContext: before.slice(-80) });
      if (before.endsWith("function ")) {
        declaration.push(occurrence);
      } else if (before.endsWith("raceWithTimeout(")) {
        bounded.push(occurrence);
      } else {
        other.push(occurrence);
      }
    }
  }

  return Object.freeze({
    declaration: Object.freeze(declaration),
    bounded: Object.freeze(bounded),
    other: Object.freeze(other),
  });
}

function describeOther(occurrences: readonly Occurrence[]): string[] {
  return occurrences.map((o) => `${o.file} after "...${o.precedingContext}"`);
}

const ALL_FILES = walkFiles(SRC_ROOT, isNonTestSourceFile);
// These tests only read sources. Capture every walked file once per module run;
// all assertions inspect the same immutable bytes, with the original tokenizer.
const SOURCE_SNAPSHOT: readonly SourceFile[] = Object.freeze(ALL_FILES.map((file) =>
  Object.freeze({ file, stripped: stripComments(readFileSync(file, "utf8")) })
));
const PARTITION = partition("generateAnnouncementImageAction", SOURCE_SNAPSHOT);
const ALIAS_PATTERN = /import\s*\{[^}]*\bgenerateAnnouncementImageAction\s+as\s+/;

function findAliases(files: readonly SourceFile[]): string[] {
  return files.filter(({ stripped }) => ALIAS_PATTERN.test(stripped)).map(({ file }) => file);
}

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
    const { declaration } = PARTITION;
    expect(declaration.length).toBe(1);
  });
});

describe("W-1: every generateAnnouncementImageAction( call site is either the declaration or raceWithTimeout(-bounded", () => {
  const { other } = PARTITION;

  it("the other bucket is empty", () => {
    expect(describeOther(other)).toEqual([]);
  });

  it("no non-test file aliases the generateAnnouncementImageAction import (import { generateAnnouncementImageAction as x })", () => {
    const offenders = findAliases(SOURCE_SNAPSHOT);
    expect(offenders).toEqual([]);
  });
});

describe("W-2 outer: the wait passed to raceWithTimeout is CLIENT_PATIENCE_MS, not an inline numeric literal", () => {
  const source = SOURCE_SNAPSHOT.find(({ file }) => file === path.join(SRC_ROOT, "app/components/recording/announcementImagePipeline.ts"))!.stripped;

  // The exact shape walkthrough-announcement.structure.test.ts:350-351 already
  // uses for EXEMPLAR_FETCH_TIMEOUT_MS.
  it("the outer call site wraps generateAnnouncementImageAction( in raceWithTimeout(...CLIENT_PATIENCE_MS)", () => {
    expect(source).toMatch(/raceWithTimeout\([^;]*?CLIENT_PATIENCE_MS/);
  });

  it("the outer site's timeout argument is not an inlined numeric literal", () => {
    expect(source).not.toMatch(/raceWithTimeout\(\s*generateAnnouncementImageAction\([^)]*\),\s*\d/);
  });
});

describe("complete source snapshot scan controls", () => {
  it.each([
    { name: "extra declaration", source: "function generateAnnouncementImageAction(prompt) {}\nfunction generateAnnouncementImageAction(prompt) {}", expected: [2, 0, 0, 0] },
    { name: "unbounded call", source: "generateAnnouncementImageAction(prompt);", expected: [0, 0, 1, 0] },
    { name: "bounded call", source: "raceWithTimeout(generateAnnouncementImageAction(prompt), waitMs);", expected: [0, 1, 0, 0] },
    { name: "alias", source: 'import { generateAnnouncementImageAction as image } from "./image";', expected: [0, 0, 0, 1] },
    { name: "comment only", source: '// generateAnnouncementImageAction(prompt);\n/* import { generateAnnouncementImageAction as image } from "./image"; */', expected: [0, 0, 0, 0] },
    { name: "block fragment call", source: "generate/* removed */AnnouncementImageAction(prompt);", expected: [0, 0, 1, 0] },
    { name: "block fragment alias", source: 'import { generate/* removed */AnnouncementImageAction as image } from "./image";', expected: [0, 0, 0, 1] },
  ])("$name", ({ source, expected }) => {
    const snapshot = Object.freeze([Object.freeze({ file: "fixture.ts", stripped: stripComments(source) })]);
    const { declaration, bounded, other } = partition("generateAnnouncementImageAction", snapshot);
    expect([declaration.length, bounded.length, other.length, findAliases(snapshot).length]).toEqual(expected);
    for (const occurrence of [...declaration, ...bounded, ...other]) {
      expect(occurrence.file).toBe("fixture.ts");
    }
  });
});
