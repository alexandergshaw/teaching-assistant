import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// TEST-ONLY. Mirrors modalAdoptionSourceScan.ts's own bundle-guard exemption
// (modalAdoption.wiring.test.ts:619-641 filters importers by
// /\.test\.tsx?$/ before flagging a violator, so a *.wiring.test.ts importer
// is excluded by construction). Imports stripComments/walkFiles from that
// module rather than hand-rolling a comment stripper: docs/g5-test-notes.md
// section 8 measured that neither the brief's unanchored nor anchored
// line-wise regex strips comments correctly on every shape these walkers
// depend on (RULING 79), while this repo's own character-scanning tokenizer
// is correct on all eight measured shapes.
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
const PARTITION = partition("generateGeminiImage", SOURCE_SNAPSHOT);
const ALIAS_PATTERN = /import\s*\{[^}]*\bgenerateGeminiImage\s+as\s+/;

function findAliases(files: readonly SourceFile[]): string[] {
  return files.filter(({ stripped }) => ALIAS_PATTERN.test(stripped)).map(({ file }) => file);
}

describe("W-3: the walk over src/ is not narrowed", () => {
  it("walks more than 1200 non-test .ts/.tsx files under src/", () => {
    expect(ALL_FILES.length).toBeGreaterThan(1200);
  });

  it("the walk includes files under src/app/actions, src/app/components, and src/lib", () => {
    expect(ALL_FILES.some((f) => f.includes(`${path.sep}app${path.sep}actions${path.sep}`))).toBe(true);
    expect(ALL_FILES.some((f) => f.includes(`${path.sep}app${path.sep}components${path.sep}`))).toBe(true);
    expect(ALL_FILES.some((f) => f.includes(`${path.sep}lib${path.sep}`))).toBe(true);
  });

  it("generateGeminiImage has exactly one declaration (src/lib/llm.ts)", () => {
    const { declaration } = PARTITION;
    expect(declaration.length).toBe(1);
  });
});

describe("W-1: every generateGeminiImage( call site is either the declaration or raceWithTimeout(-bounded", () => {
  const { other } = PARTITION;

  it("the other bucket is empty", () => {
    expect(describeOther(other)).toEqual([]);
  });

  it("no non-test file aliases the generateGeminiImage import (import { generateGeminiImage as x })", () => {
    const offenders = findAliases(SOURCE_SNAPSHOT);
    expect(offenders).toEqual([]);
  });
});

describe("W-2 inner: the wait passed to raceWithTimeout is a variable, not an inline numeric literal", () => {
  const source = SOURCE_SNAPSHOT.find(({ file }) => file === path.join(SRC_ROOT, "app/actions/announcement-image.ts"))!.stripped;

  it("the inner call site wraps generateGeminiImage( in raceWithTimeout(", () => {
    expect(source).toMatch(/raceWithTimeout\(\s*generateGeminiImage\(/);
  });

  it("the inner site's timeout argument is not an inlined numeric literal", () => {
    expect(source).not.toMatch(/raceWithTimeout\(\s*generateGeminiImage\([^)]*\),\s*\d/);
  });
});

// Section 8 canaries: the two shapes docs/g5-test-notes.md measured as
// defeating a line-wise regex stripper, proven against the tokenizer this
// wave's walker actually uses.
describe("comment-stripping canaries (docs/g5-test-notes.md section 8, C2 and C7)", () => {
  it("C2: a wrap that exists ONLY inside a full-line comment produces no occurrence at all", () => {
    const src = "// raceWithTimeout(generateGeminiImage(prompt), waitMs);\n";
    const stripped = stripComments(src);
    const { declaration, bounded, other } = partitionSourceOnly("generateGeminiImage", stripped);
    expect({ declaration, bounded, other }).toEqual({ declaration: 0, bounded: 0, other: 0 });
  });

  it("C7: a bare call inside a TRAILING comment does not enter the other bucket", () => {
    const src =
      'const outcome = raceWithTimeout(generateGeminiImage(prompt), waitMs); // falls back to generateGeminiImage(prompt) directly if this times out\n';
    const stripped = stripComments(src);
    const { declaration, bounded, other } = partitionSourceOnly("generateGeminiImage", stripped);
    expect({ declaration, bounded, other }).toEqual({ declaration: 0, bounded: 1, other: 0 });
  });
});

/** Same bucket logic as partition() above, but over an already-stripped
 * in-memory source string rather than a walked file list - used only by the
 * section-8 canaries, which need to feed synthetic fixtures directly. */
function partitionSourceOnly(
  identifier: string,
  stripped: string
): { declaration: number; bounded: number; other: number } {
  const idPattern = new RegExp(`(?<![A-Za-z0-9_$])${identifier}\\(`, "g");
  let declaration = 0;
  let bounded = 0;
  let other = 0;
  let match: RegExpExecArray | null;
  while ((match = idPattern.exec(stripped)) !== null) {
    const before = collapseWhitespace(stripped.slice(0, match.index));
    if (before.endsWith("function ")) declaration++;
    else if (before.endsWith("raceWithTimeout(")) bounded++;
    else other++;
  }
  return { declaration, bounded, other };
}

describe("complete source snapshot scan controls", () => {
  it.each([
    { name: "extra declaration", source: "function generateGeminiImage(prompt) {}\nfunction generateGeminiImage(prompt) {}", expected: [2, 0, 0, 0] },
    { name: "unbounded call", source: "generateGeminiImage(prompt);", expected: [0, 0, 1, 0] },
    { name: "bounded call", source: "raceWithTimeout(generateGeminiImage(prompt), waitMs);", expected: [0, 1, 0, 0] },
    { name: "alias", source: 'import { generateGeminiImage as image } from "./image";', expected: [0, 0, 0, 1] },
    { name: "comment only", source: '// generateGeminiImage(prompt);\n/* import { generateGeminiImage as image } from "./image"; */', expected: [0, 0, 0, 0] },
    { name: "block fragment call", source: "generate/* removed */GeminiImage(prompt);", expected: [0, 0, 1, 0] },
    { name: "block fragment alias", source: 'import { generate/* removed */GeminiImage as image } from "./image";', expected: [0, 0, 0, 1] },
  ])("$name", ({ source, expected }) => {
    const snapshot = Object.freeze([Object.freeze({ file: "fixture.ts", stripped: stripComments(source) })]);
    const { declaration, bounded, other } = partition("generateGeminiImage", snapshot);
    expect([declaration.length, bounded.length, other.length, findAliases(snapshot).length]).toEqual(expected);
    for (const occurrence of [...declaration, ...bounded, ...other]) {
      expect(occurrence.file).toBe("fixture.ts");
    }
  });
});
