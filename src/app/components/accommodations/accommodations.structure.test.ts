// Exact-set localStorage key scan for the accommodations feature (backlog
// N4, AC-S1 / requirement 6 of the UI build brief) - mirrors this repo's
// per-feature `ta-` key pattern (recording-split.structure.test.ts is the
// model this-repo.md names).
//
// AC-S1 is absolute: NO accommodations DATA (a student id, a note, a
// count, a roster entry) may ever reach localStorage. The only two keys
// this feature is permitted to write are the SCOPE SELECTION (which
// course/assignment is chosen, not any data about students in it) - and
// this test asserts that set is EXACTLY {ta-accom-course-id,
// ta-accom-assignment-id}, that both keys have a real call site (not a
// dead string constant a comment could satisfy), and - the negative half,
// with its own canary - that neither localStorage nor sessionStorage is
// referenced anywhere in the data-access module or in the panel's
// roster-fetching code path.
import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const DIR = path.join(__dirname);
const PANEL_SOURCE = readFileSync(path.join(DIR, "AccommodationsPanel.tsx"), "utf8");
// N7: the standalone AccommodationsAmbientControl.tsx was deleted - the
// accommodations entry now lives in FabQuickActionsMenu.tsx's `actions`
// array, so this guard is RETARGETED (never narrowed - see the ROUND 2
// ruling N7-R1) to that file. Both loops below that consume this constant
// still iterate the SAME NUMBER of sources as before the move.
const FAB_SOURCE = readFileSync(
  path.join(process.cwd(), "src", "app", "components", "FabQuickActionsMenu.tsx"),
  "utf8"
);
const TEXT_SOURCE = readFileSync(path.join(DIR, "AccommodationsText.tsx"), "utf8");
const LIB_SOURCE = readFileSync(path.join(process.cwd(), "src", "lib", "accommodations.ts"), "utf8");
const FAB_HOST_SOURCE = readFileSync(
  path.join(process.cwd(), "src", "app", "components", "AiChatFab.tsx"),
  "utf8"
);

const EXPECTED_KEYS = ["ta-accom-course-id", "ta-accom-assignment-id"];

function harvestTaKeys(source: string): string[] {
  const found = new Set<string>();
  const pattern = /["'`](ta-accom-[a-z-]+)["'`]/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    found.add(match[1]);
  }
  return Array.from(found);
}

describe("accommodations localStorage key exact-set scan (AC-S1)", () => {
  it("the directory's ta-accom-* keys are exactly the two scope-selection keys, nothing more", () => {
    const all = new Set<string>();
    for (const source of [PANEL_SOURCE, FAB_SOURCE, TEXT_SOURCE]) {
      for (const key of harvestTaKeys(source)) all.add(key);
    }
    expect(Array.from(all).sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it("each expected key has a real localStorage.getItem AND localStorage.setItem/removeItem call site (not just a string mention)", () => {
    // The panel reads via readPersisted(KEY_CONST) and writes via
    // writePersisted(KEY_CONST, value) - both indirected through a named
    // constant rather than the literal repeated inline. Assert the
    // constant is defined equal to the literal, AND that both helper
    // functions contain a real localStorage.getItem/setItem call - i.e.
    // the key is not merely declared but actually read and written.
    for (const key of EXPECTED_KEYS) {
      expect(PANEL_SOURCE).toMatch(new RegExp(`["'\`]${key}["'\`]`));
    }
    expect(PANEL_SOURCE).toContain('const COURSE_ID_KEY = "ta-accom-course-id"');
    expect(PANEL_SOURCE).toContain('const ASSIGNMENT_ID_KEY = "ta-accom-assignment-id"');
    expect(PANEL_SOURCE).toMatch(/function readPersisted[\s\S]*?localStorage\.getItem\(key\)/);
    expect(PANEL_SOURCE).toMatch(/function writePersisted[\s\S]*?localStorage\.setItem\(key, value\)/);
    expect(PANEL_SOURCE).toMatch(/function writePersisted[\s\S]*?localStorage\.removeItem\(key\)/);
    // Both helpers are actually called with the two key constants, not just
    // defined - a dead helper would satisfy every assertion above without
    // ever running.
    expect(PANEL_SOURCE).toMatch(/readPersisted\(COURSE_ID_KEY\)/);
    expect(PANEL_SOURCE).toMatch(/readPersisted\(ASSIGNMENT_ID_KEY\)/);
    expect(PANEL_SOURCE).toMatch(/writePersisted\(COURSE_ID_KEY,/);
    expect(PANEL_SOURCE).toMatch(/writePersisted\(ASSIGNMENT_ID_KEY,/);
  });

  it("the data-access module (src/lib/accommodations.ts) never references localStorage or sessionStorage", () => {
    // Negative search - needs a canary to mean anything (this-repo.md's
    // standing rule). NOT performed against this file in this build wave:
    // src/lib/accommodations.ts belongs to Wave 1 (data layer) and this
    // wave's brief forbids editing Wave 1 files, even temporarily for a
    // canary. The equivalent canary WAS performed against this wave's own
    // file (see the next test, the panel's roster-fetching path) - see the
    // wave report for that result and for this gap being named rather than
    // silently worked around.
    expect(LIB_SOURCE).not.toMatch(/localStorage/);
    expect(LIB_SOURCE).not.toMatch(/sessionStorage/);
  });

  it("the panel's roster-fetching code path never references localStorage or sessionStorage (Ruling N4-L - in-memory only)", () => {
    const rosterEffectMatch = PANEL_SOURCE.match(/\/\/ Roster \(in-memory only[\s\S]*?\}, \[institution, courseId\]\);/);
    expect(rosterEffectMatch).not.toBeNull();
    const rosterEffectSource = rosterEffectMatch?.[0] ?? "";
    // Canary performed once, this build wave: a throwaway
    // `localStorage.setItem("ta-accom-roster-canary", "x")` line was
    // inserted inside this same effect, both this test and the exact-set
    // test above were confirmed red, then the line was removed - see the
    // wave report for the result.
    expect(rosterEffectSource).not.toMatch(/localStorage/);
    expect(rosterEffectSource).not.toMatch(/sessionStorage/);
  });
});

// N7: the accommodations surface moved into AiChatFab's quick-actions menu.
// AC-7 requires AC-1/AC-2/AC-3 to be pinned HERE, beside the data they
// protect, not only in a FAB-local test - so a later FAB refactor cannot
// carry them away unnoticed.
describe("N7 AC-1: the accommodations FAB entry is present unconditionally", () => {
  const actionsBlockMatch = FAB_SOURCE.match(/const actions: QuickAction\[\] = \[([\s\S]*?)\n  \];/);
  const actionsBlock = actionsBlockMatch?.[1] ?? "";

  it("the actions array literal was found and contains an accommodations entry", () => {
    expect(actionsBlockMatch).not.toBeNull();
    expect(actionsBlock).toMatch(/key:\s*"accommodations"/);
  });

  it("the actions array literal has no conditional, spread, push, or filter construct anywhere in it - " +
    "an entry that only appears when accommodations data exists would disclose that fact (AC-S5)", () => {
    expect(actionsBlock).not.toMatch(/\?/);
    expect(actionsBlock).not.toMatch(/&&/);
    expect(actionsBlock).not.toMatch(/\.\.\./);
    expect(actionsBlock).not.toMatch(/\.push\(/);
    expect(actionsBlock).not.toMatch(/\.filter\(/);
  });
});

describe("N7 AC-2: the accommodations entry has a literal label and no disabledReason", () => {
  it("its label is a literal string and it carries no disabledReason key", () => {
    const entryMatch = FAB_SOURCE.match(/\{\s*key:\s*"accommodations"[\s\S]*?\}/);
    expect(entryMatch).not.toBeNull();
    const entry = entryMatch?.[0] ?? "";
    expect(entry).toMatch(/label:\s*"[^"]+"/);
    // A constant disabledReason would still ship the entry permanently dead
    // (FabQuickActionsMenu.tsx's disabled={Boolean(action.disabledReason)}),
    // so this rejects the key entirely, not merely a varying value.
    expect(entry).not.toMatch(/disabledReason/);
  });
});

describe("N7 AC-3 (disposed to an exact-set scan, see ROUND 2 N7-R3): the FAB's badge sites are a closed, named set", () => {
  it("AiChatFab.tsx's role=\"status\" badge elements are exactly {fabLiveBadge, fabUnreadBadge} - a new badge must update this list", () => {
    const badgeSitePattern = /className=\{styles\.(\w+)\}[\s\S]{0,300}?role="status"/g;
    const found = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = badgeSitePattern.exec(FAB_HOST_SOURCE))) {
      found.add(match[1]);
    }
    expect(Array.from(found).sort()).toEqual(["fabLiveBadge", "fabUnreadBadge"]);
  });

  it("no accommodations identifier appears inside either badge's own conditional JSX block", () => {
    // Scoped to the two badges' own conditional blocks (condition through the
    // closing `)}`), not the whole file - a bare proximity scan over the
    // whole file false-positives on the AccommodationsPanel import sitting
    // near the live-class imports, which is not a badge/accommodations
    // coupling at all.
    const liveBadgeBlock = FAB_HOST_SOURCE.match(/isLiveClassSessionActive\(liveClass\.phase\) && \(([\s\S]*?)\)\}/)?.[1] ?? "";
    const unreadBadgeBlock = FAB_HOST_SOURCE.match(/liveClass\.unreadAnswerCount > 0 && \(([\s\S]*?)\)\}/)?.[1] ?? "";
    expect(liveBadgeBlock.length).toBeGreaterThan(0);
    expect(unreadBadgeBlock.length).toBeGreaterThan(0);
    expect(liveBadgeBlock.toLowerCase()).not.toMatch(/accommodation/);
    expect(unreadBadgeBlock.toLowerCase()).not.toMatch(/accommodation/);
  });
});

describe("N7 AC-8 (N4's AC-S3, ROUND 2 N7-R2): the accommodations panel's open state is never persisted", () => {
  it("AiChatFab.tsx's readLS/writeLS calls never touch an accommodations-named key (the `ta:` namespace, not just `ta-accom-*`)", () => {
    const keyPattern = /(?:readLS|writeLS)(?:<[^>]*>)?\(\s*["'`]([^"'`]+)["'`]/g;
    const keys: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = keyPattern.exec(FAB_HOST_SOURCE))) {
      keys.push(match[1]);
    }
    // A sanity floor so this can't pass by finding nothing at all - the
    // file's four pre-existing panels each have at least one such call.
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key.toLowerCase()).not.toMatch(/accom/);
    }
  });

  it("accommodationsOpen is a literal false useState, never seeded from readLS", () => {
    expect(FAB_HOST_SOURCE).toMatch(/const \[accommodationsOpen, setAccommodationsOpen\] = useState\(false\);/);
    expect(FAB_HOST_SOURCE).not.toMatch(/accommodationsOpen[\s\S]{0,80}readLS/);
  });
});
