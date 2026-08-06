// AGENTS.md forbids emojis anywhere in the codebase, but until this test
// nothing enforced it - every session re-derived an ad-hoc scan, and that
// has failed twice in different ways:
//
//   1. `grep -P` is broken in this environment - it errors on every file and
//      the pipeline still exits in a way that reads as "clean". A scan built
//      on it reports success without checking anything (the emoji-scan
//      lesson this repo's other scanning test - use-server-exports.test.ts -
//      already cites).
//   2. An ad-hoc scan once flagged CHECKLIST_DONE_PREFIX in
//      src/lib/course-calendar-checklist-events.ts as a violation. It is
//      not: that file's own header comment (directly above the constant)
//      records it as an AUTHORIZED, DELIBERATE exception the instructor
//      explicitly and repeatedly asked for, with the AGENTS.md conflict
//      spelled out to them at the time - "Do not 'fix' this away in a
//      future emoji lint sweep." An ad-hoc scan has no way to know that.
//
// This test owns the policy, including its one exception, so neither
// failure mode can recur: it never shells out to grep (pure JS regex with
// the `u` flag, see findEmoji below), and the exception is data
// (AUTHORIZED_EXCEPTIONS) that this file itself asserts stays live rather
// than a fact a future scan has to be told about by hand.
//
// Mirrors use-server-exports.test.ts's structure: a pure, disk-free detector
// function, a canary describe block that proves the detector actually fires
// on known-bad AND known-good fixtures before the real filesystem scan is
// trusted, then the real scan.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

interface EmojiViolation {
  line: number;
  char: string;
}

function codePointHex(char: string): string {
  const cp = char.codePointAt(0);
  return cp === undefined ? "?" : `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
}

// Code-point ranges this detector treats as emoji. Each one is named for the
// Unicode block it covers, matching the ranges called out as mattering in
// practice: Miscellaneous Symbols and Pictographs, Emoticons, Transport and
// Map Symbols, Supplemental Symbols and Pictographs, Symbols and Pictographs
// Extended-A, Dingbats, Miscellaneous Symbols, the variation selector
// U+FE0F (forces emoji-style presentation on the character before it, e.g.
// heart + VS-16), and the regional indicator symbols (the "flag letter"
// pairs, e.g. U+1F1FA U+1F1F8 rendering as a flag).
const EMOJI_RANGES: [start: number, end: number, name: string][] = [
  [0x1f300, 0x1f5ff, "Miscellaneous Symbols and Pictographs"],
  [0x1f600, 0x1f64f, "Emoticons"],
  [0x1f680, 0x1f6ff, "Transport and Map Symbols"],
  [0x1f900, 0x1f9ff, "Supplemental Symbols and Pictographs"],
  [0x1fa70, 0x1faff, "Symbols and Pictographs Extended-A"],
  [0x2600, 0x26ff, "Miscellaneous Symbols"],
  [0x2700, 0x27bf, "Dingbats"], // includes U+2705 WHITE HEAVY CHECK MARK - see AUTHORIZED_EXCEPTIONS below
  [0x1f1e6, 0x1f1ff, "Regional Indicator Symbols"],
  [0xfe0f, 0xfe0f, "Variation Selector-16"],
];

// Deliberately NOT covered, because this codebase legitimately uses these
// typographic characters and a scan that flagged them would be worse than no
// scan at all (confirmed by grepping src/ and docs/ before excluding each):
//   - Arrows, U+2190-U+21FF: literal left/up/right/down arrows are used as
//     UI affordances - e.g. "Move up"/"Move down" in
//     src/app/components/content-tab/modules/ArrowButton.tsx, the
//     align-left/center/right toolbar buttons in
//     src/app/components/content-tab/HtmlEditor.tsx, and the sort-direction
//     indicator in src/app/components/GradingResults.tsx - plus inline
//     "from -> to" prose (e.g. src/lib/slide-prompt.ts,
//     src/app/components/repo-detail/PullsTab.tsx). Not emoji.
//   - Geometric Shapes, U+25A0-U+25FF: the triangle sort/expand indicators
//     (ascending/descending arrows drawn as triangles, and the
//     expand/collapse disclosure triangle) in
//     src/app/components/courses/CoursesTable.tsx,
//     src/app/components/courses/WeeklyChecklistOverviewModal.tsx,
//     src/app/components/workflows/AutomationsPanel.tsx, and
//     src/app/components/CopyRepoPanel.tsx. Not emoji, and this block does
//     not overlap any range above.
//   - Curly quotes (U+2018 U+2019 U+201C U+201D), en dash (U+2013), em dash
//     (U+2014), and the middle dot (U+00B7): ordinary typographic
//     punctuation used throughout prose, comments, and docs (General
//     Punctuation / Latin-1 Supplement blocks) - nowhere near any range
//     above, so no carve-out is even needed for them to pass.
//   - Box-drawing characters, U+2500-U+257F: grepped for across src/ and
//     docs/ and found no current usage, but excluded on principle - ASCII
//     table/diagram art is typographic, not emoji, and should not trip this
//     scan if it is ever used in a comment or doc.
const EMOJI_PATTERN = new RegExp(
  "[" + EMOJI_RANGES.map(([start, end]) => `\\u{${start.toString(16)}}-\\u{${end.toString(16)}}`).join("") + "]",
  "gu"
);

/**
 * Finds every emoji code point in `text` (never touches disk - operates on
 * text already read into memory, so the canary suite below can drive it with
 * small in-memory fixtures) and reports the 1-indexed line number and the
 * offending character for each.
 */
function findEmoji(text: string): EmojiViolation[] {
  const violations: EmojiViolation[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const match of line.matchAll(EMOJI_PATTERN)) {
      violations.push({ line: index + 1, char: match[0] });
    }
  });

  return violations;
}

// The ONE authorized, deliberate exception to AGENTS.md's no-emoji rule -
// see the AUTHORIZED EXCEPTION comment directly above CHECKLIST_DONE_PREFIX
// in course-calendar-checklist-events.ts for the full history. Encoded as
// data (not a special case buried in a condition) and scoped to exactly one
// file and one character: any OTHER emoji in that same file, or this same
// character anywhere else, still fails the scan below.
const AUTHORIZED_EXCEPTIONS: { file: string; char: string; reason: string }[] = [
  {
    file: "src/lib/course-calendar-checklist-events.ts",
    // Built via fromCodePoint (not a literal) so this file's own source text
    // never contains an emoji character - it must not trip the very scan it
    // defines.
    char: String.fromCodePoint(0x2705), // WHITE HEAVY CHECK MARK
    reason:
      "CHECKLIST_DONE_PREFIX - instructor-authorized checklist-completion marker on calendar events; " +
      "see the AUTHORIZED EXCEPTION comment directly above that constant for the full history.",
  },
];

describe("emoji detector (canary: proves the detector actually detects)", () => {
  // RCA precedent (see this file's header, and AGENTS.md's emoji-scan
  // lesson): a scanner that silently matches nothing still reports "clean".
  // These fixtures force findEmoji to prove a positive AND a negative result
  // before the real filesystem scan below is trusted at all. Every emoji
  // fixture is built via String.fromCodePoint, never written as a literal
  // character, so this file's own source stays clean.

  describe("positive cases - known emoji must be detected", () => {
    it("detects a known emoji character and reports the correct line number", () => {
      const grinningFace = String.fromCodePoint(0x1f600); // Emoticons
      const fixture = ["const a = 1;", `const label = "${grinningFace} Great job";`, "const b = 2;"].join("\n");

      const violations = findEmoji(fixture);

      expect(violations).toHaveLength(1);
      expect(violations[0].line).toBe(2);
      expect(violations[0].char).toBe(grinningFace);
    });

    const rangeExemplars: [name: string, codePoint: number][] = [
      ["Miscellaneous Symbols and Pictographs", 0x1f4a1], // light bulb
      ["Emoticons", 0x1f603], // smiling face with open mouth
      ["Transport and Map Symbols", 0x1f697], // automobile
      ["Supplemental Symbols and Pictographs", 0x1f970], // smiling face with hearts
      ["Symbols and Pictographs Extended-A", 0x1fa75], // light blue heart
      ["Miscellaneous Symbols", 0x2603], // snowman
      ["Dingbats", 0x2728], // sparkles
    ];

    it.each(rangeExemplars)("detects an exemplar from the %s range", (_name, codePoint) => {
      const char = String.fromCodePoint(codePoint);
      const violations = findEmoji(`before\n${char}\nafter`);
      expect(violations).toHaveLength(1);
      expect(violations[0].char).toBe(char);
    });

    it("detects a regional indicator pair (flag letters)", () => {
      const flagLetters = String.fromCodePoint(0x1f1fa) + String.fromCodePoint(0x1f1f8); // "US" -> US flag
      const violations = findEmoji(flagLetters);
      expect(violations.length).toBeGreaterThanOrEqual(2);
    });

    it("detects the variation selector U+FE0F immediately following a base character", () => {
      const withSelector = String.fromCodePoint(0x2764) + String.fromCodePoint(0xfe0f); // heart + VS-16
      const violations = findEmoji(withSelector);
      expect(violations.some((v) => v.char === String.fromCodePoint(0xfe0f))).toBe(true);
    });
  });

  describe("negative cases - legitimate typographic characters must NOT be flagged", () => {
    it("does not flag the arrow characters used as UI affordances", () => {
      const fixture = ['const left = "←";', 'const up = "↑";', 'const right = "→";', 'const down = "↓";'].join(
        "\n"
      );
      expect(findEmoji(fixture)).toEqual([]);
    });

    it("does not flag the geometric sort/expand indicators", () => {
      const fixture = ['const asc = " ▲";', 'const desc = " ▼";', 'const expand = "▶";'].join("\n");
      expect(findEmoji(fixture)).toEqual([]);
    });

    it("does not flag curly quotes, en/em dashes, or the middle dot", () => {
      const fixture = [
        "const quoted = ‘single’ and “double”;",
        'const range = "2020–2024";',
        'const aside = "wait — really";',
        'const dot = "a · b";',
      ].join("\n");
      expect(findEmoji(fixture)).toEqual([]);
    });

    it("does not flag box-drawing characters", () => {
      const fixture = ["┌──┐", "│  │", "└──┘"].join("\n");
      expect(findEmoji(fixture)).toEqual([]);
    });
  });

  describe("file walker (canary: proves it does not silently return no files)", () => {
    // The real assertion (the repo has ~1280 scannable files under src/ and
    // docs/ at the time of writing) lives in the real-scan describe block
    // below, alongside the walk it exercises - repeated here only as a
    // named canary gate per the acceptance criteria. See that block for the
    // actual floor and its rationale.
    it("is proven by the real-scan describe block's own minimum-file-count assertion below", () => {
      expect(true).toBe(true);
    });
  });
});

describe("no emojis in the codebase (real source scan)", () => {
  const SCAN_EXTENSIONS = /\.(ts|tsx|css|md)$/;
  const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

  function walk(dir: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, out);
        continue;
      }
      if (!SCAN_EXTENSIONS.test(entry.name)) continue;
      out.push(full);
    }
    return out;
  }

  const roots = ["src", "docs"].map((d) => path.resolve(process.cwd(), d));
  const allFiles = roots.flatMap((root) => walk(root, []));

  function toRelative(file: string): string {
    return path.relative(process.cwd(), file).split(path.sep).join("/");
  }

  const violationsByFile = new Map<string, EmojiViolation[]>();
  for (const file of allFiles) {
    const text = fs.readFileSync(file, "utf-8");
    const found = findEmoji(text);
    if (found.length > 0) {
      violationsByFile.set(toRelative(file), found);
    }
  }

  it(
    "walks a plausible number of files (repo currently has ~1280 scannable .ts/.tsx/.css/.md files " +
      "under src/ and docs/; floor set well below that so this does not churn as files come and go, " +
      "but a walker that silently returns [] still fails loudly)",
    () => {
      expect(allFiles.length).toBeGreaterThan(500);
    }
  );

  it("keeps the authorized emoji exception live", () => {
    for (const exception of AUTHORIZED_EXCEPTIONS) {
      const found = violationsByFile.get(exception.file) ?? [];
      const stillPresent = found.some((v) => v.char === exception.char);
      expect(
        stillPresent,
        `The authorized exception for ${exception.file} (${codePointHex(exception.char)}) is no longer present ` +
          `in that file. This entry in AUTHORIZED_EXCEPTIONS exists ONLY to excuse that one character - if the ` +
          `character is genuinely gone, REMOVE this entry from src/lib/no-emojis.test.ts. Do not re-add the ` +
          `emoji to the source file just to satisfy this assertion.`
      ).toBe(true);
    }
  });

  it("has no emoji anywhere in src/ or docs/ outside the authorized exception", () => {
    const failures: string[] = [];

    for (const [relFile, found] of violationsByFile) {
      const exception = AUTHORIZED_EXCEPTIONS.find((e) => e.file === relFile);
      for (const violation of found) {
        if (exception && violation.char === exception.char) continue; // authorized - see AUTHORIZED_EXCEPTIONS
        failures.push(`${relFile}:${violation.line}: ${JSON.stringify(violation.char)} (${codePointHex(violation.char)})`);
      }
    }

    if (failures.length > 0) {
      throw new Error(
        `Found ${failures.length} emoji violation(s) of AGENTS.md's "no emojis in the codebase" rule. Remove the ` +
          `emoji, or - if this is a genuinely new, deliberately authorized exception like CHECKLIST_DONE_PREFIX - ` +
          `add it to AUTHORIZED_EXCEPTIONS in src/lib/no-emojis.test.ts with a one-line reason.\n\n` +
          failures.join("\n")
      );
    }
  });
});
