// TDD for Slice B's core (docs/repo-grades-ux-overhaul-acceptance-criteria.md,
// U1.1-U1.6d). WRITTEN BEFORE THE IMPLEMENTATION - ./repoGradesFolderSelection
// does not exist yet, so this file currently fails to collect. The implementer
// makes it pass without changing what it asserts; if an assertion is wrong,
// report it rather than editing it.
//
// WHAT THE INSTRUCTOR ASKED FOR, in their own words, twice:
//   "i should be able to choose which assignment folder i want graded from
//    this view"
//   "i don't want to select an assignment from the lms, i want to select a
//    folder from the repo in the drop down to grade"
//
// Today folders exist ONLY as table columns. The single dropdown in a column
// header is the CANVAS ASSIGNMENT mapping picker, which exists solely to
// decide where a grade gets POSTED - grading itself never reads it
// (gradeRepoAction takes a repo, a folder and instructions, and has no
// assignment parameter). So there is no folder chooser anywhere in the view,
// and the one dropdown that exists is for a different job.
//
// This module is the pure core of the folder dropdown: what goes in it, how
// each option is described, and which folder is selected once a stale or
// filtered scan is taken into account. It must import no React.
import { describe, expect, it } from "vitest";
import {
  ALL_FOLDERS,
  buildFolderOptions,
  describeFolderOption,
  resolveSelectedFolder,
  shouldPersistFolderDrop,
} from "./repoGradesFolderSelection";

/** Matches the scan row shape buildRepoGradeColumns already consumes:
 *  `folders: string[] | null`, where null means THIS repo's tree fetch failed
 *  so its folder set is unknown - never "it has none". */
const repo = (folders: string[] | null) => ({ folders });

describe("buildFolderOptions - what goes in the dropdown", () => {
  it("lists every folder found across the org, not just the first repo's", () => {
    const options = buildFolderOptions([repo(["week-1"]), repo(["week-2"]), repo(["week-1", "week-3"])]).options;
    expect(options.map((o) => o.folder)).toEqual(["week-1", "week-2", "week-3"]);
  });

  it("counts how many repos actually contain each folder (U1.4)", () => {
    const result = buildFolderOptions([
      repo(["week-1", "week-2"]),
      repo(["week-1"]),
      repo(["week-1"]),
      repo(["week-2"]),
    ]);
    const byFolder = Object.fromEntries(result.options.map((o) => [o.folder, o.presentIn]));

    expect(byFolder["week-1"]).toBe(3);
    expect(byFolder["week-2"]).toBe(2);
  });

  it("reports the scanned total so an option can read 'in 3 of 30'", () => {
    const result = buildFolderOptions([repo(["a"]), repo(["a"]), repo([])]);
    expect(result.scannedRepos).toBe(3);
  });

  it("counts a failed-scan repo as UNKNOWN, never as missing the folder", () => {
    // repoGradesRows.ts:108-112 makes `folders === null` a "scan-error" cell
    // for EVERY column, and both that file and repoGradesBulkGrade.ts go out
    // of their way to forbid conflating it with "missing-folder". A folder
    // present in 2 of 3 readable repos must not be reported as "2 of 4"
    // because a fourth repo could not be read.
    const result = buildFolderOptions([repo(["a"]), repo(["a"]), repo(null), repo([])]);
    const a = result.options.find((o) => o.folder === "a");

    expect(a?.presentIn).toBe(2);
    expect(result.unknownRepos).toBe(1);
  });

  it("reports unknownRepos as ONE scan-wide number, not a per-folder one", () => {
    // A repo whose tree failed is unknown for every folder simultaneously, so
    // the count cannot vary between options. Putting it on each option would
    // imply it can.
    const result = buildFolderOptions([repo(["a"]), repo(["b"]), repo(null), repo(null)]);
    expect(result.unknownRepos).toBe(2);
    for (const option of result.options) {
      expect(option).not.toHaveProperty("unknownRepos");
    }
  });

  it("contributes nothing from a failed-scan repo to the folder list itself", () => {
    const result = buildFolderOptions([repo(null)]);
    expect(result.options).toEqual([]);
    expect(result.unknownRepos).toBe(1);
  });

  it("keeps folder names raw - two names differing only by case stay two options", () => {
    // The raw string IS the assignment-mapping key and the value
    // buildBulkGradePlan matches on, so normalizing for display would collapse
    // two real columns into one option that maps ambiguously to two mappings.
    const result = buildFolderOptions([repo(["Module-3"]), repo(["module-3"])]);
    expect(result.options).toHaveLength(2);
    expect(result.options.map((o) => o.folder).sort()).toEqual(["Module-3", "module-3"]);
  });

  it("orders options the same way the grid orders its columns", () => {
    // The dropdown and the columns must not disagree about order; the grid
    // sorts naturally, so "week-2" precedes "week-10".
    const result = buildFolderOptions([repo(["week-10", "week-2", "week-1"])]);
    expect(result.options.map((o) => o.folder)).toEqual(["week-1", "week-2", "week-10"]);
  });

  it("handles an empty scan without inventing options", () => {
    const result = buildFolderOptions([]);
    expect(result.options).toEqual([]);
    expect(result.scannedRepos).toBe(0);
    expect(result.unknownRepos).toBe(0);
  });
});

describe("describeFolderOption - what the instructor reads before grading", () => {
  it("names the folder and how many repos have it", () => {
    const text = describeFolderOption({ folder: "week-3", presentIn: 12 }, { scannedRepos: 30, unknownRepos: 0 });
    expect(text).toContain("week-3");
    expect(text).toContain("12");
    expect(text).toContain("30");
  });

  it("distinguishes a folder almost nobody has from one almost everybody has", () => {
    const rare = describeFolderOption({ folder: "week-3", presentIn: 3 }, { scannedRepos: 30, unknownRepos: 0 });
    const common = describeFolderOption({ folder: "week-3", presentIn: 30 }, { scannedRepos: 30, unknownRepos: 0 });
    expect(rare).not.toBe(common);
  });

  it("says so when some repos could not be read, rather than silently shrinking the denominator", () => {
    const text = describeFolderOption({ folder: "week-3", presentIn: 12 }, { scannedRepos: 30, unknownRepos: 4 });
    expect(text).toContain("4");
  });

  it("does not mention unreadable repos when there were none", () => {
    const text = describeFolderOption({ folder: "week-3", presentIn: 12 }, { scannedRepos: 30, unknownRepos: 0 });
    expect(text.toLowerCase()).not.toContain("could not");
  });
});

describe("resolveSelectedFolder - which folder the dropdown shows", () => {
  const options = [
    { folder: "week-1", presentIn: 3 },
    { folder: "week-2", presentIn: 3 },
  ];

  it("keeps a persisted folder that still exists", () => {
    expect(resolveSelectedFolder(options, "week-2")).toBe("week-2");
  });

  it("falls back to All folders when the persisted one is gone (U1.6)", () => {
    expect(resolveSelectedFolder(options, "week-9")).toBe(ALL_FOLDERS);
  });

  it("keeps an explicit All folders choice", () => {
    expect(resolveSelectedFolder(options, ALL_FOLDERS)).toBe(ALL_FOLDERS);
  });

  it("selects the first folder when nothing is persisted, so the view opens scoped (U0a)", () => {
    // U0b: All folders is available but is NOT the resting default, or the
    // overhaul is opt-in and the view opens exactly as it does today.
    expect(resolveSelectedFolder(options, "")).toBe("week-1");
  });

  it("falls back to All folders when there are no folders at all", () => {
    expect(resolveSelectedFolder([], "week-1")).toBe(ALL_FOLDERS);
    expect(resolveSelectedFolder([], "")).toBe(ALL_FOLDERS);
  });

  it("matches folder names exactly, never case-insensitively", () => {
    expect(resolveSelectedFolder([{ folder: "Module-3", presentIn: 1 }], "module-3")).toBe(ALL_FOLDERS);
  });
});

describe("shouldPersistFolderDrop - the rule that stops a keystroke eating the choice", () => {
  // THE DEFECT THIS EXISTS FOR. The org-prefix filter is fed by an undebounced
  // onChange and is part of the scan key, so every character retriggers the
  // scan. Each of those scans SETTLES SUCCESSFULLY, with a narrower column
  // set. A drop-and-persist that fires on any successful scan therefore
  // erases the instructor's saved folder the moment they type one character
  // into the filter - and clearing the filter does not bring it back.
  //
  // A folder missing from a PREFIXED scan is hidden. A folder missing from an
  // UNFILTERED scan of the org is genuinely gone.
  it("does not persist a drop while a prefix filter is narrowing the scan", () => {
    expect(shouldPersistFolderDrop({ persisted: "week-3", resolved: ALL_FOLDERS, orgPrefix: "wee" })).toBe(false);
  });

  it("does not persist a drop for a whitespace-only prefix, which filters nothing", () => {
    expect(shouldPersistFolderDrop({ persisted: "week-3", resolved: ALL_FOLDERS, orgPrefix: "   " })).toBe(true);
  });

  it("persists a drop when an unfiltered scan genuinely lacks the folder", () => {
    expect(shouldPersistFolderDrop({ persisted: "week-3", resolved: ALL_FOLDERS, orgPrefix: "" })).toBe(true);
  });

  it("never persists when nothing was dropped", () => {
    expect(shouldPersistFolderDrop({ persisted: "week-3", resolved: "week-3", orgPrefix: "" })).toBe(false);
    expect(shouldPersistFolderDrop({ persisted: "", resolved: "week-1", orgPrefix: "" })).toBe(false);
  });

  it("never persists a drop of a value that was never set", () => {
    expect(shouldPersistFolderDrop({ persisted: "", resolved: ALL_FOLDERS, orgPrefix: "" })).toBe(false);
  });
});

describe("ALL_FOLDERS is out of band, so it cannot collide with a real folder", () => {
  it("is not a string a top-level directory could be named", () => {
    // Folder names are raw top-level directory segments, so any in-band
    // sentinel - "", "*", "all", "__all__" - is a name some repo could
    // genuinely have.
    const options = buildFolderOptions([repo(["", "*", "all", "__all__", "ALL_FOLDERS"])]).options;
    for (const option of options) {
      expect(option.folder).not.toBe(ALL_FOLDERS);
    }
  });

  it("survives a round trip through resolveSelectedFolder", () => {
    expect(resolveSelectedFolder([{ folder: "week-1", presentIn: 1 }], ALL_FOLDERS)).toBe(ALL_FOLDERS);
  });
});
