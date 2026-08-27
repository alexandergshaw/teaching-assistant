// Tests for repoGradeStudentName.ts (docs/repo-grades-name-columns-and-
// sorting-acceptance-criteria.md, N2/N3). Fixtures deliberately cover more
// than "Ana Ruiz" (item 20): a comma form, a plain two-token name, a
// multi-part surname, a suffix, a single token, and an empty string - each
// exercises a DIFFERENT branch of the split rules, and a suite that only
// tested the easy case would prove nothing about the ones that make this
// feature honest.
import { describe, it, expect } from "vitest";
import {
  deriveRepoGradeStudentName,
  repoGradeLastNameCellText,
  UNKNOWN_LAST_NAME_MARK,
} from "./repoGradeStudentName";

describe("deriveRepoGradeStudentName - N2 item 4 rule order", () => {
  it("comma form: splits at the first comma, last name before, first name after - source 'explicit', no correction hint", () => {
    const parts = deriveRepoGradeStudentName("Ruiz, Ana");
    expect(parts).toEqual({ firstName: "Ana", lastName: "Ruiz", source: "explicit", correctionHint: null });
  });

  it("plain two-token name (no comma): last-word rule - source 'derived', WITH a correction hint", () => {
    const parts = deriveRepoGradeStudentName("Ana Ruiz");
    expect(parts.firstName).toBe("Ana");
    expect(parts.lastName).toBe("Ruiz");
    expect(parts.source).toBe("derived");
    expect(parts.correctionHint).not.toBeNull();
    // N2 item 4: the hint must actually tell the instructor how to correct
    // it, in "Last, First" order - not just say "this was guessed".
    expect(parts.correctionHint).toContain("Ruiz, Ana");
  });

  it("multi-part surname (no comma): the naive last-word rule still only grabs the final token - this is exactly the case the correction hint exists for", () => {
    const parts = deriveRepoGradeStudentName("Ana van der Berg");
    expect(parts.firstName).toBe("Ana van der");
    expect(parts.lastName).toBe("Berg");
    expect(parts.source).toBe("derived");
    // The hint must name the ACTUAL correct-order string for this row, not a
    // generic template - "van der Berg, Ana" -- the exact fix.
    expect(parts.correctionHint).toContain("Berg, Ana van der");
  });

  it("a suffix (no comma): the last-word rule grabs the suffix token, not the real surname - still 'derived', still hinted", () => {
    const parts = deriveRepoGradeStudentName("John Smith Jr");
    expect(parts.firstName).toBe("John Smith");
    expect(parts.lastName).toBe("Jr");
    expect(parts.source).toBe("derived");
    expect(parts.correctionHint).not.toBeNull();
  });

  it("single token: the last name is UNKNOWN, never guessed - source 'single', lastName stays \"\"", () => {
    const parts = deriveRepoGradeStudentName("Cher");
    expect(parts).toEqual({ firstName: "Cher", lastName: "", source: "single", correctionHint: null });
  });

  it("empty string: no name at all - source 'none', both fields \"\"", () => {
    expect(deriveRepoGradeStudentName("")).toEqual({ firstName: "", lastName: "", source: "none", correctionHint: null });
  });

  it("null/undefined student (a repo with no roster match, N3 item 8): source 'none', never a fabricated name", () => {
    expect(deriveRepoGradeStudentName(null)).toEqual({ firstName: "", lastName: "", source: "none", correctionHint: null });
    expect(deriveRepoGradeStudentName(undefined)).toEqual({ firstName: "", lastName: "", source: "none", correctionHint: null });
  });

  it("whitespace-only student reads as no name at all", () => {
    expect(deriveRepoGradeStudentName("   ")).toEqual({ firstName: "", lastName: "", source: "none", correctionHint: null });
  });
});

describe("deriveRepoGradeStudentName - N2 item 6: preferring Canvas's own sortableName", () => {
  it("a comma-bearing sortableName is authoritative - source 'canvas', NOT 'explicit' (Canvas said it, not the instructor)", () => {
    const parts = deriveRepoGradeStudentName("Ana Ruiz", "Ruiz, Ana");
    expect(parts).toEqual({ firstName: "Ana", lastName: "Ruiz", source: "canvas", correctionHint: null });
  });

  it("sortableName wins even when it disagrees with the plain display name's own naive split", () => {
    // "Ana Ruiz Gomez" would naive-last-word to firstName "Ana Ruiz" /
    // lastName "Gomez" - Canvas's real split says otherwise, and Canvas wins.
    const parts = deriveRepoGradeStudentName("Ana Ruiz Gomez", "Ruiz Gomez, Ana");
    expect(parts.firstName).toBe("Ana");
    expect(parts.lastName).toBe("Ruiz Gomez");
    expect(parts.source).toBe("canvas");
  });

  it("a blank sortableName falls back to deriving from student", () => {
    const parts = deriveRepoGradeStudentName("Ana Ruiz", "");
    expect(parts.source).toBe("derived");
  });

  it("a sortableName with no comma still beats student, but is NOT relabeled 'canvas' - no comma means no confirmed split either way", () => {
    const parts = deriveRepoGradeStudentName("Something Else Entirely", "Ana Ruiz");
    expect(parts.firstName).toBe("Ana");
    expect(parts.lastName).toBe("Ruiz");
    expect(parts.source).toBe("derived");
  });

  it("a single-token sortableName with no student still reads as 'single', not 'canvas'", () => {
    const parts = deriveRepoGradeStudentName(null, "Cher");
    expect(parts).toEqual({ firstName: "Cher", lastName: "", source: "single", correctionHint: null });
  });
});

describe("repoGradeLastNameCellText - the one display-only substitution", () => {
  it("shows the em dash for a single-token name's unknown last name", () => {
    const parts = deriveRepoGradeStudentName("Cher");
    expect(repoGradeLastNameCellText(parts)).toBe(UNKNOWN_LAST_NAME_MARK);
  });

  it("shows nothing for no name at all - never the em dash (that would imply SOME name is known)", () => {
    const parts = deriveRepoGradeStudentName(null);
    expect(repoGradeLastNameCellText(parts)).toBe("");
  });

  it("shows the real last name for every other source", () => {
    expect(repoGradeLastNameCellText(deriveRepoGradeStudentName("Ruiz, Ana"))).toBe("Ruiz");
    expect(repoGradeLastNameCellText(deriveRepoGradeStudentName("Ana Ruiz"))).toBe("Ruiz");
  });
});
