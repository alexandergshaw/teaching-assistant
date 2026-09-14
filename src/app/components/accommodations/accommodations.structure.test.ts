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
const AMBIENT_SOURCE = readFileSync(path.join(DIR, "AccommodationsAmbientControl.tsx"), "utf8");
const TEXT_SOURCE = readFileSync(path.join(DIR, "AccommodationsText.tsx"), "utf8");
const LIB_SOURCE = readFileSync(path.join(process.cwd(), "src", "lib", "accommodations.ts"), "utf8");

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
    for (const source of [PANEL_SOURCE, AMBIENT_SOURCE, TEXT_SOURCE]) {
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
