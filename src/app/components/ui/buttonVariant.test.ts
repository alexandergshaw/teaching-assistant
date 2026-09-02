// docs/recording-controls-ux-acceptance-criteria.md CC1/section 6.
// `variantFor`'s own contract, plus a self-test of the scanner logic the
// orchestrator will use to FREEZE the two repo-wide canaries after wave 1
// (the ternary canary - the literal `? "contained" : "outlined"` appears
// only in buttonVariant.ts - and the one-primary canary - a frozen
// per-file count of static `variant="contained"` sites). Both canaries
// assert the END state of a wave that has not run yet: at wave 0 most of
// section 4's files still spell the ternary locally (eleven sites, section
// 0's survey), so asserting the real counts here would be red on arrival
// and green by accident once wave 1 lands, which proves nothing. Per the
// group's brief, this file stops at proving the scanner ITSELF is correct,
// against synthetic fixtures - the orchestrator wires it to the real file
// list once wave 1 is on disk.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { variantFor } from "./buttonVariant";

describe("variantFor", () => {
  it("maps true to contained and false to outlined - the one legal spelling of a state-dependent primary", () => {
    expect(variantFor(true)).toBe("contained");
    expect(variantFor(false)).toBe("outlined");
  });
});

/** Finds every `? "contained" : "outlined"` ternary in a source string,
 *  independent of the variable names around it - this is the shape the
 *  frozen repo-wide canary will look for across section 4's files. */
function findContainedOutlinedTernaries(source: string): number {
  const matches = source.match(/\?\s*"contained"\s*:\s*"outlined"/g);
  return matches ? matches.length : 0;
}

/** Counts static `variant="contained"` sites, excluding one that also
 *  carries `color="error"` or `color="warning"` on the same attribute list
 *  (a danger/warning-toned button, out of CC1's one-primary count) - the
 *  shape the frozen one-primary canary will apply per file. Deliberately a
 *  single-line heuristic (matches this repo's actual JSX style, one prop
 *  set per opening tag on one logical line after formatting) rather than a
 *  full JSX parser. */
function countStaticContainedPrimaries(source: string): number {
  const tagRegex = /<[A-Za-z][^<>]*>/g;
  let count = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(source))) {
    const tag = match[0];
    if (!/variant="contained"/.test(tag)) continue;
    if (/color="error"/.test(tag) || /color="warning"/.test(tag)) continue;
    count += 1;
  }
  return count;
}

describe("findContainedOutlinedTernaries (scanner fixture self-test - the frozen ternary canary's logic)", () => {
  it("finds the literal ternary regardless of the variable name feeding it", () => {
    expect(findContainedOutlinedTernaries('variant={isPrimary ? "contained" : "outlined"}')).toBe(1);
    expect(findContainedOutlinedTernaries('variant={primaryAction === "draft" ? "contained" : "outlined"}')).toBe(1);
  });

  it("counts every occurrence, and is exactly what buttonVariant.ts itself contains", () => {
    const fixture = [
      'variant={a ? "contained" : "outlined"}',
      'variant={b ? "contained" : "outlined"}',
    ].join("\n");
    expect(findContainedOutlinedTernaries(fixture)).toBe(2);
  });

  it("does not match a variantFor(...) call, which is the legal spelling everywhere else", () => {
    expect(findContainedOutlinedTernaries('variant={variantFor(isPrimary)}')).toBe(0);
  });

  it("SABOTAGE TARGET: buttonVariant.ts's CODE contains exactly one such ternary - the function body - proving the scanner is not blind to the one file allowed to contain it (comments stripped first: this file's own header comment quotes the literal in prose, which must not double-count)", () => {
    const source = readFileSync(join(process.cwd(), "src/app/components/ui/buttonVariant.ts"), "utf8");
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    expect(findContainedOutlinedTernaries(stripped)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The frozen canaries (orchestrator, after wave 1 landed on 2026-09-02).
// Section 4's file lists, walked as directories so a new sibling file is
// inside the fence from the day it is created. Comments are stripped first:
// prose that quotes the literal must never count.
// ---------------------------------------------------------------------------
const SECTION_4_DIRS = [
  "src/app/components/recording",
  "src/app/components/grading-recording",
  "src/app/components/module-deck-capture",
  "src/app/components/caption-studio",
  "src/app/components/slide-studio",
  "src/app/components/ui",
];
const SECTION_4_EXTRA_FILES = ["src/app/components/RecordingTab.tsx"];

function stripComments(source: string): string {
  // JSX comments first, then block comments, then line comments.
  return source
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function sectionFourTsxFiles(): string[] {
  const out: string[] = [];
  for (const dir of SECTION_4_DIRS) {
    const abs = join(process.cwd(), dir);
    for (const name of readdirSync(abs)) {
      if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) out.push(`${dir}/${name}`);
    }
  }
  return [...out, ...SECTION_4_EXTRA_FILES].sort();
}

/** Brace-aware opening-tag scan: from each `<Name`, walk forward counting
 *  `{`/`}` so a `>` inside an arrow-function prop does not end the tag
 *  early. Returns each opening tag's full attribute text. */
function openingTags(source: string): string[] {
  const tags: string[] = [];
  const re = /<[A-Za-z][A-Za-z0-9.]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 0;
    let i = m.index + m[0].length;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ">" && depth === 0) break;
    }
    tags.push(source.slice(m.index, i + 1));
    re.lastIndex = m.index + m[0].length;
  }
  return tags;
}

function countPrimaries(source: string): number {
  let count = 0;
  for (const tag of openingTags(source)) {
    if (!/variant="contained"/.test(tag) && !/variantFor\(/.test(tag) && !/idleVariant="contained"/.test(tag)) continue;
    if (/color="error"/.test(tag) || /color="warning"/.test(tag)) continue;
    count += 1;
  }
  return count;
}

/** Frozen 2026-09-02 from the measured tree: one entry per file that
 *  carries any primary spelling (static contained, variantFor, or
 *  idleVariant contained). A file absent here has zero. Adding a second
 *  filled button anywhere moves one of these numbers - bump it
 *  deliberately, in the same commit, with the reason. */
const FROZEN_PRIMARY_SITES: Record<string, number> = {
  "src/app/components/caption-studio/CaptionStudio.tsx": 1,
  "src/app/components/caption-studio/CaptionsList.tsx": 1,
  // 3: Start/Stop, Add rubric and Grade submissions each carry a
  // state predicate; exactly one is contained per state (fix wave, CC1).
  "src/app/components/grading-recording/GradingRecordingPanel.tsx": 3,
  "src/app/components/grading-recording/LegibilityProbeModal.tsx": 2,
  "src/app/components/grading-recording/RubricInputModal.tsx": 1,
  "src/app/components/module-deck-capture/ModuleDeckCapturePanel.tsx": 2,
  "src/app/components/recording/AvatarStudioPanel.tsx": 7,
  "src/app/components/recording/DiscussionRepliesPanel.tsx": 1,
  "src/app/components/recording/DiscussionReplyToolbar.tsx": 1,
  // 0: Generate script is outlined and the Teleprompter toggle uses the
  // pressed treatment, never the primary fill (fix wave, CC1/AM11).
  "src/app/components/recording/LectureScriptPanel.tsx": 0,
  "src/app/components/recording/SpeedPanel.tsx": 1,
  // 5: Mute left the primary fill for the pressed treatment, and the
  // paused-state pair no longer double-counts (fix wave).
  "src/app/components/recording/StagePanel.tsx": 5,
  // 7: Post (idleVariant contained), Play it back, and one contained
  // recovery action in each of the five mutually exclusive failure
  // branches (fix wave, CC1 "zero primaries in a failed state").
  "src/app/components/recording/TakeAnnouncementPanel.tsx": 7,
  // 4: the paused-state Resume/Stop pair resolved to real predicates.
  "src/app/components/recording/WalkthroughPanel.tsx": 4,
  // 3: Choose PowerPoint joined Draft narration and Generate audio as a
  // state-gated primary so the empty deck state has one (fix wave).
  "src/app/components/slide-studio/DeckModeSection.tsx": 3,
  // 3: same for Choose video (fix wave).
  "src/app/components/slide-studio/VideoModeSection.tsx": 3,
  "src/app/components/ui/ConfirmArmButtons.tsx": 0,
};

describe("frozen ternary canary (CC1): the literal lives in buttonVariant.ts and nowhere else in section 4", () => {
  it("finds zero `? \"contained\" : \"outlined\"` literals across every section-4 component", () => {
    const offenders: string[] = [];
    for (const rel of sectionFourTsxFiles()) {
      const stripped = stripComments(readFileSync(join(process.cwd(), rel), "utf8"));
      if (findContainedOutlinedTernaries(stripped) > 0) offenders.push(rel);
    }
    expect(offenders, "spell a state-dependent primary as variantFor(...)").toEqual([]);
  });

  it("scans a non-empty file list that includes the nine surfaces", () => {
    const files = sectionFourTsxFiles();
    expect(files.length).toBeGreaterThan(30);
    expect(files).toContain("src/app/components/recording/DiscussionRepliesPanel.tsx");
    expect(files).toContain("src/app/components/RecordingTab.tsx");
  });
});

describe("frozen one-primary canary (CC1): per-file count of primary spellings", () => {
  it("matches the 2026-09-02 measurement exactly (bump deliberately, with a reason, in the same commit)", () => {
    const actual: Record<string, number> = {};
    for (const rel of sectionFourTsxFiles()) {
      const n = countPrimaries(stripComments(readFileSync(join(process.cwd(), rel), "utf8")));
      if (n > 0 || rel in FROZEN_PRIMARY_SITES) actual[rel] = n;
    }
    expect(actual).toEqual(FROZEN_PRIMARY_SITES);
  });

  it("the brace-aware tag scanner is not fooled by an arrow function before the variant", () => {
    const fixture = '<Button onClick={() => go()} variant="contained" color="error">x</Button>\n<Button onClick={() => go()} variant={variantFor(ok)}>y</Button>';
    expect(countPrimaries(fixture)).toBe(1);
  });
});

describe("countStaticContainedPrimaries (scanner fixture self-test - the frozen one-primary canary's logic)", () => {
  it("counts a bare static primary", () => {
    expect(countStaticContainedPrimaries('<Button variant="contained">Save</Button>')).toBe(1);
  });

  it("excludes a danger or warning contained button from the primary count", () => {
    expect(countStaticContainedPrimaries('<Button variant="contained" color="error">Confirm delete</Button>')).toBe(
      0
    );
    expect(
      countStaticContainedPrimaries('<Button variant="contained" color="warning">Confirm redraft</Button>')
    ).toBe(0);
  });

  it("counts multiple independent sites in one file", () => {
    const fixture = [
      '<Button variant="contained">Save</Button>',
      '<Button variant="outlined">Cancel</Button>',
      '<Button variant="contained" color="error">Delete</Button>',
    ].join("\n");
    expect(countStaticContainedPrimaries(fixture)).toBe(1);
  });
});
