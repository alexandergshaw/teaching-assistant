// Selection archive planning - the TDD gate for
// docs/lms-selection-export-download-acceptance-criteria.md.
//
// Written before the implementation; currently failing. These pin the CONTRACT
// the AC states, not an implementation.
//
// THIS IS THE THIRD VERSION, and every fixture below is shaped by a specific
// implementation that defeated an earlier one. Audits of the first two wrote:
//   - a planner that included NOTHING (passed 12/13);
//   - a type-blind, format-blind planner (passed 13/13);
//   - a planner that ABANDONED the whole archive as soon as any one item failed
//     to fetch, which is the exact inverse of AC6 (passed 14/14, because the
//     fail-forward fixture had only one entry, making "carry on" and "give up"
//     observationally identical);
//   - a planner whose classification was a DENYLIST of exactly the three type
//     strings the tests named, so a Quiz, an ExternalTool and any type invented
//     next year were silently swallowed into a cartridge that has no slot for
//     them - inverting AC4's required default of omit-with-a-reason;
//   - a planner with the two byte caps wired to each other, which no membership
//     assertion could see because a single-item fixture is symmetric under that
//     swap.
// Each of those is now pinned by a fixture that changes MEMBERSHIP, not just a
// string, so the test cannot be satisfied by wording.
//
// Deliberately NOT pinned: the wording of any reason, how a size is formatted
// (an instructor-facing "1.5 KB" must be as legal as "1500"), the archive's
// internal directory shape, and which bucket a type lands in beyond what the
// cartridge writer provably does and does not have a slot for.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  planSelectionArchive,
  renderArchiveManifest,
  archiveFileName,
  type ArchiveCaps,
  type SelectionArchiveEntry,
} from "./selection-archive";
// A pure function/constants reused straight from the client half of this
// feature (a "use client" module, but selectionDownloadUnavailableReason
// itself calls no hook - see that file's own header comment) - the same
// cross-boundary import selection-archive-build.ts and useSelectionDownload.ts
// already make of THIS file's own SELECTION_ARCHIVE_MAX_ITEMS, and the
// established precedent (grep any src/**/*.test.ts importing from
// @/app/components) for testing a client module's pure logic under vitest's
// node environment without rendering anything.
import {
  selectionDownloadUnavailableReason,
  COURSE_URL_UNAVAILABLE_REASON,
  COURSE_ID_UNAVAILABLE_REASON,
  IMSCC_UNAVAILABLE_REASON,
} from "@/app/components/content-tab/modules/useSelectionDownload";

const CAPS: ArchiveCaps = { maxItems: 5, maxItemBytes: 1000, maxTotalBytes: 2500 };

function entry(
  key: string,
  title: string,
  over: Partial<SelectionArchiveEntry> = {}
): SelectionArchiveEntry {
  return {
    key,
    title,
    type: "Page",
    source: "live",
    moduleId: "1",
    moduleLabel: "Module 1",
    content: { kind: "html", html: `<p>${title}</p>` },
    ...over,
  };
}

function binary(key: string, title: string, bytes: number, fileName = "notes.docx"): SelectionArchiveEntry {
  return entry(key, title, {
    type: "File",
    content: { kind: "binary", bytes, mimeType: "application/octet-stream", fileName },
  });
}

function plan(entries: SelectionArchiveEntry[], format: "imscc" | "zip", caps: ArchiveCaps = CAPS) {
  const result = planSelectionArchive(entries, format, caps);
  if ("error" in result) throw new Error(`expected a plan, got a refusal: ${result.error}`);
  return result;
}

describe("planSelectionArchive - classification", () => {
  it("accounts for every selected item exactly once, whatever its type", () => {
    const entries = [
      entry("live:1:1", "Syllabus"),
      entry("live:1:2", "Essay", { type: "Assignment" }),
      entry("live:1:3", "Week 1 discussion", { type: "Discussion" }),
      entry("live:1:4", "Quiz 1", { type: "Quiz" }),
      entry("live:1:5", "Publisher tool", { type: "ExternalTool" }),
    ];
    const result = plan(entries, "imscc");
    const seen = [...result.included.map((i) => i.key), ...result.omitted.map((o) => o.key)];
    expect(seen.sort()).toEqual(entries.map((e) => e.key).sort());
    expect(new Set(seen).size).toBe(entries.length);
  });

  it("actually includes what the cartridge writer has a slot for", () => {
    // Kills the planner that omits everything and still satisfies accounting.
    const entries = [entry("live:1:1", "Syllabus"), entry("live:1:2", "Essay", { type: "Assignment" })];
    const result = plan(entries, "imscc");
    expect(result.included.map((i) => i.key).sort()).toEqual(["live:1:1", "live:1:2"]);
    expect(result.omitted).toEqual([]);
  });

  it("omits from a cartridge every type it has no slot for, INCLUDING ones it has never seen", () => {
    // The denylist-of-three defeat: neither CanvasModuleItem.type nor
    // CartridgeModuleItem.type is a union, so an unrecognised type must default
    // to omitted-with-a-reason, never to silently included as nothing.
    for (const type of ["Discussion", "ExternalUrl", "SubHeader", "Quiz", "ExternalTool", "SomeTypeInventedNextYear"]) {
      const result = plan([entry("live:1:9", `A ${type}`, { type })], "imscc");
      expect(result.included, `${type} has no slot in a cartridge`).toEqual([]);
      expect(result.omitted).toHaveLength(1);
      expect(result.omitted[0].title).toBe(`A ${type}`);
      expect(result.omitted[0].reason.trim().length).toBeGreaterThan(0);
    }
  });

  it("carries those same items in a plain zip, which has no format restrictions", () => {
    // Kills format-blindness: the SAME entry lands in different buckets.
    for (const type of ["Discussion", "ExternalUrl", "Quiz", "SomeTypeInventedNextYear"]) {
      const result = plan([entry("live:1:9", `A ${type}`, { type })], "zip");
      expect(result.included, `${type} is just a file in a zip`).toHaveLength(1);
      expect(result.omitted).toEqual([]);
    }
  });

  it("records one item's fetch failure and still builds the archive around it", () => {
    // TWO entries, deliberately: with one, "carry on" and "abandon everything"
    // are indistinguishable, and a planner that abandoned everything passed.
    const entries = [
      entry("live:1:1", "Syllabus"),
      entry("live:1:7", "Locked page", { content: { kind: "unavailable", reason: "Canvas returned 403" } }),
    ];
    const result = plan(entries, "zip");
    expect(result.included.map((i) => i.key), "the healthy item must survive its neighbour's failure").toEqual([
      "live:1:1",
    ]);
    expect(result.omitted.map((o) => o.key)).toEqual(["live:1:7"]);
    expect(result.omitted[0].reason).toContain("403");
  });

  it("refuses a cartridge built from an export-sourced selection, and says why", () => {
    // AC12: an export item's body was already stripped and truncated at parse
    // time, so a cartridge of stubs would be reported as complete.
    const result = planSelectionArchive([entry("export:m1:i1", "Stub", { source: "export" })], "imscc", CAPS);
    if (!("error" in result)) throw new Error("expected a refusal for an export-sourced cartridge");
    expect(result.error.trim().length).toBeGreaterThan(0);
  });

  it("still builds a zip from an export-sourced selection", () => {
    const result = plan([entry("export:m1:i1", "Stub", { source: "export" })], "zip");
    expect(result.included).toHaveLength(1);
  });

  it("keeps a binary item's own file extension in its path", () => {
    const result = plan([binary("live:1:8", "Lecture notes", 100, "lecture.pptx")], "zip");
    expect(result.included[0].path.endsWith(".pptx")).toBe(true);
  });
});

describe("planSelectionArchive - caps", () => {
  it("refuses the whole archive over the item cap, naming the limit and the count", () => {
    const entries = Array.from({ length: 9 }, (_, i) => entry(`live:1:${i}`, `Item ${i}`));
    const result = planSelectionArchive(entries, "zip", CAPS);
    if (!("error" in result)) throw new Error("expected a refusal over the item cap");
    // Distinct digits, so a refusal cannot pass by concatenating them.
    expect(result.error).toMatch(/\b5\b/);
    expect(result.error).toMatch(/\b9\b/);
  });

  it("distinguishes the per-item cap from the total cap by what it includes, not by wording", () => {
    // Wiring the two caps to each other changes MEMBERSHIP here: correct gives
    // two included; swapped gives one. A single-item fixture is symmetric under
    // that swap and cannot see it, which is how the swap survived before.
    const entries = [
      binary("live:1:a", "First", 900),
      binary("live:1:b", "Oversized", 1500, "clip.mp4"),
      binary("live:1:c", "Second", 900),
      binary("live:1:d", "Third", 900),
    ];
    const result = plan(entries, "zip", CAPS);
    expect(result.included.map((i) => i.key)).toEqual(["live:1:a", "live:1:c"]);

    const oversized = result.omitted.find((o) => o.key === "live:1:b");
    const didNotFit = result.omitted.find((o) => o.key === "live:1:d");
    expect(oversized, "the oversized item must be reported, not dropped").toBeDefined();
    expect(didNotFit, "the item that busted the total must be reported too").toBeDefined();
    // Two different causes must read as two different reasons - the property
    // that matters. How a size is formatted is the implementer's to choose.
    expect(oversized?.reason).not.toBe(didNotFit?.reason);
    expect(result.included.reduce((sum, i) => sum + i.bytes, 0)).toBeLessThanOrEqual(CAPS.maxTotalBytes);
  });
});

describe("planSelectionArchive - paths", () => {
  it("names each entry's path after the item, not after a counter", () => {
    const paths = plan([entry("live:1:1", "Week One Notes")], "zip").included.map((i) => i.path.toLowerCase());
    expect(paths[0]).toContain("notes");
  });

  it("gives two identically titled items in different modules distinct paths", () => {
    const entries = [
      entry("live:1:1", "Notes", { moduleId: "1", moduleLabel: "Module 1" }),
      entry("live:2:1", "Notes", { moduleId: "2", moduleLabel: "Module 2" }),
    ];
    const paths = plan(entries, "zip").included.map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("never emits a path that is illegal on Windows or escapes the archive", () => {
    const entries = [
      entry("live:1:1", "../../etc/passwd"),
      entry("live:1:2", 'a:b*c?d"e<f>g|h'),
      entry("live:1:3", "back\\slash"),
    ];
    for (const item of plan(entries, "zip").included) {
      expect(item.path).not.toMatch(/[:*?"<>|\\]/);
      expect(item.path.split("/").some((seg) => seg === ".." || seg === "")).toBe(false);
    }
  });
});

describe("renderArchiveManifest", () => {
  it("lists every included item and every omission with its reason", () => {
    const entries = [entry("live:1:1", "Syllabus"), entry("live:1:3", "Week 1 discussion", { type: "Discussion" })];
    const result = plan(entries, "imscc");
    expect(result.omitted.length, "fixture must actually produce an omission").toBeGreaterThan(0);
    const manifest = renderArchiveManifest(result, { courseName: "Biology", format: "imscc" });

    for (const item of result.included) expect(manifest).toContain(item.title);
    for (const omission of result.omitted) {
      expect(manifest).toContain(omission.title);
      expect(manifest).toContain(omission.reason);
    }
  });

  it("states the omission count even when it is zero, rather than going silent", () => {
    // Course name deliberately digit-free: "BIO 101" made this pass by accident
    // on the "0" in "101", which is how a manifest with no counts at all
    // survived the previous version.
    const result = plan([entry("live:1:1", "Syllabus")], "zip");
    expect(result.omitted).toEqual([]);
    const manifest = renderArchiveManifest(result, { courseName: "Biology", format: "zip" });
    expect(manifest).toContain("Biology");
    expect(manifest).toMatch(/\b0\b/);
  });
});

describe("renderArchiveManifest - AC12 reduced fidelity", () => {
  it("flags every export-sourced included item as reduced fidelity, and leaves live items unflagged", () => {
    // Two sources side by side in the SAME zip plan, so the assertion can
    // see the flag is keyed off each item's own source, not applied
    // blanket-wide across the whole manifest.
    const entries = [entry("live:1:1", "Live page"), entry("export:m1:i1", "Export page", { source: "export" })];
    const result = plan(entries, "zip");
    const manifest = renderArchiveManifest(result, { courseName: "Biology", format: "zip" });

    const liveLine = manifest.split("\n").find((line) => line.includes("Live page"));
    const exportLine = manifest.split("\n").find((line) => line.includes("Export page"));
    expect(liveLine, "fixture must actually produce a live included line").toBeDefined();
    expect(exportLine, "fixture must actually produce an export included line").toBeDefined();
    expect(exportLine).toMatch(/reduced fidelity/i);
    expect(liveLine).not.toMatch(/reduced fidelity/i);
  });
});

describe("archiveFileName", () => {
  it("names the course and the date, and is safe on Windows", () => {
    const name = archiveFileName("BIO 101: Intro/Advanced", "imscc", new Date("2026-08-12T15:04:05Z"));
    expect(name).toMatch(/\.imscc$/);
    expect(name).not.toMatch(/[:*?"<>|/\\]/);
    expect(name.toLowerCase(), "the course must be identifiable from the filename").toContain("bio");
    expect(name).toContain("2026");
    expect(name).toMatch(/\b0?8\b|-08-/);
  });
});

// ---------------------------------------------------------------------------
// Verification-pass finding: the item-count cap was declared as a literal
// `150` in TWO places - useSelectionDownload.ts's own SELECTION_DOWNLOAD_
// MAX_ITEMS and selection-archive-build.ts's ARCHIVE_CAPS.maxItems - written
// concurrently by two independent implementers with nothing keeping the two
// numbers equal. The fix moved the one real number here, to
// SELECTION_ARCHIVE_MAX_ITEMS (this file), with the other two importing it.
// vitest here is node-env and collects only src/**/*.test.ts, so nothing can
// import and compare the client hook and the route's build module against
// each other at runtime in a way that would catch a REDECLARED (not
// imported) duplicate - the two files don't reference each other at all, so
// an import-based check has nothing to assert on. What CAN be checked is the
// same source-reading idiom generatedPreviewModal.wiring.test.ts already
// uses for structural facts vitest cannot otherwise see: read the three
// files as TEXT and prove the cap's numeric literal appears in exactly one
// of them, with the other two importing the shared symbol instead.
describe("the item-count cap has exactly one owner (source-reading guard)", () => {
  const ARCHIVE_PATH = join(process.cwd(), "src/lib/lms-generation/selection-archive.ts");
  const BUILD_PATH = join(process.cwd(), "src/lib/lms-generation/selection-archive-build.ts");
  const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useSelectionDownload.ts");

  /** Strips both comment forms, so a value merely MENTIONED in prose (this
   * repo's comments narrate constantly, including ones that spell out the
   * exact number under discussion) can never be mistaken for a real
   * assignment. */
  function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  }

  /** How many times `150` is ASSIGNED to something (`= 150`, `: 150`)
   * outside a comment - the shape a real duplicate declaration takes, as
   * opposed to prose that merely contains the digits. `\b` after the digits
   * keeps this from matching inside a longer number like `1500`. */
  function literalAssignmentCount(text: string): number {
    const matches = stripComments(text).match(/[:=]\s*150\b/g);
    return matches ? matches.length : 0;
  }

  it("canary: the check counts a real assignment and ignores the same number in a comment", () => {
    expect(literalAssignmentCount("// the cap used to be 150\nexport const X = SHARED;")).toBe(0);
    expect(literalAssignmentCount("export const CAP = 150;")).toBe(1);
    expect(literalAssignmentCount("export const A = 150;\nexport const B = 150;")).toBe(2);
    // Proves the trailing \b: a longer number containing "150" as a
    // substring must not be miscounted as the cap.
    expect(literalAssignmentCount("export const UNRELATED = 1500;")).toBe(0);
  });

  it("selection-archive.ts declares the cap as a real literal exactly once - the one owner", () => {
    const source = readFileSync(ARCHIVE_PATH, "utf8");
    expect(literalAssignmentCount(source)).toBe(1);
    expect(source).toMatch(/export const SELECTION_ARCHIVE_MAX_ITEMS\s*=\s*150\b/);
  });

  it("useSelectionDownload.ts (the client pre-flight guard) imports the cap rather than redeclaring it", () => {
    const source = readFileSync(HOOK_PATH, "utf8");
    expect(literalAssignmentCount(source), "expected no hardcoded numeric cap in the client hook").toBe(0);
    expect(source).toMatch(/import\s*\{[^}]*\bSELECTION_ARCHIVE_MAX_ITEMS\b[^}]*\}\s*from\s*["'][^"']*selection-archive["']/);
  });

  it("selection-archive-build.ts (ARCHIVE_CAPS) imports the cap rather than redeclaring it", () => {
    const source = readFileSync(BUILD_PATH, "utf8");
    expect(literalAssignmentCount(source), "expected no hardcoded numeric cap in the route's build module").toBe(0);
    expect(source).toMatch(/import\s*\{[^}]*\bSELECTION_ARCHIVE_MAX_ITEMS\b[^}]*\}\s*from\s*["'][^"']*selection-archive["']/);
    expect(source).toMatch(/maxItems\s*:\s*SELECTION_ARCHIVE_MAX_ITEMS\b/);
  });
});

// ---------------------------------------------------------------------------
// Regression pass fix (docs/REGRESSION.md entry 274, FINDING 1): the .zip
// control for an export-sourced selection was permanently unavailable.
// ContentTab.tsx derives `courseUrl` as "" for EVERY export selection (there
// is no Canvas URL for an export-only course at all), and
// selectionDownloadUnavailableReason used to check courseUrl unconditionally,
// BEFORE it ever looked at `source` - so an export selection always looked
// identical to a courseUrl-less live one and both controls were disabled,
// not merely the .imscc control AC12 already restricts. The fix makes the
// check per-source: a live selection still needs `courseUrl`; an export
// selection needs `courseId` (a course_hub row id) instead - `courseUrl`
// being empty is simply not a fact about whether an export request can
// succeed.
describe("selectionDownloadUnavailableReason - FINDING 1 (export identifies itself by courseId, not courseUrl)", () => {
  it("makes the .zip control available for an export selection with a courseId but NO courseUrl - the exact fixture that used to be permanently dead", () => {
    // courseUrl: "" here is not a stand-in - it is EXACTLY what
    // ContentTab.tsx's `courseUrl` derivation sends for every export
    // selection (selection.source === "live" ? selection.courseUrl : "").
    const reason = selectionDownloadUnavailableReason("zip", "", "export", "course-hub-row-1");
    expect(reason).toBeNull();
  });

  it("still refuses the .imscc control for that same export selection, for the AC12 fidelity reason - not the courseUrl reason", () => {
    const reason = selectionDownloadUnavailableReason("imscc", "", "export", "course-hub-row-1");
    expect(reason).toBe(IMSCC_UNAVAILABLE_REASON);
  });

  it("disables BOTH controls for an export selection with no usable courseId, regardless of courseUrl", () => {
    for (const format of ["zip", "imscc"] as const) {
      expect(selectionDownloadUnavailableReason(format, "", "export", undefined)).toBe(COURSE_ID_UNAVAILABLE_REASON);
      expect(selectionDownloadUnavailableReason(format, "", "export", "")).toBe(COURSE_ID_UNAVAILABLE_REASON);
      expect(selectionDownloadUnavailableReason(format, "", "export", "   ")).toBe(COURSE_ID_UNAVAILABLE_REASON);
      // A courseUrl being present must not paper over a missing courseId -
      // the two identifiers are not interchangeable.
      expect(selectionDownloadUnavailableReason(format, "https://canvas.example/courses/1", "export", undefined)).toBe(
        COURSE_ID_UNAVAILABLE_REASON
      );
    }
  });

  it("still requires courseUrl for a live (canvas) selection, unaffected by this fix, even when a courseId happens to be present", () => {
    for (const format of ["zip", "imscc"] as const) {
      expect(selectionDownloadUnavailableReason(format, "", "canvas", "some-export-id")).toBe(COURSE_URL_UNAVAILABLE_REASON);
    }
  });

  it("makes both controls available for a live selection that has a usable courseUrl, exactly as before this fix", () => {
    expect(selectionDownloadUnavailableReason("zip", "https://canvas.example/courses/1", "canvas", undefined)).toBeNull();
    expect(selectionDownloadUnavailableReason("imscc", "https://canvas.example/courses/1", "canvas", undefined)).toBeNull();
  });
});

// Source-reading structural checks (the same idiom the item-count-cap suite
// above already uses) for the parts of this fix vitest cannot otherwise see:
// this repo's node-env vitest run collects only src/**/*.test.ts and never
// renders a component, so ModulesView.tsx/ContentTab.tsx's actual prop wiring
// - and route.ts's request-handling control flow - can only be verified by
// reading the files as text, not by rendering or invoking them.
describe("FINDING 1 wiring (source-reading guard) - the export .zip path is reachable end to end", () => {
  const ROUTE_PATH = join(process.cwd(), "src/app/api/lms-export/selection/route.ts");
  const CONTENT_TAB_PATH = join(process.cwd(), "src/app/components/ContentTab.tsx");
  const MODULES_VIEW_PATH = join(process.cwd(), "src/app/components/content-tab/ModulesView.tsx");

  it("route.ts validates courseUrl only for a live selection and courseId only for an export one, never courseUrl unconditionally", () => {
    const source = readFileSync(ROUTE_PATH, "utf8");
    expect(source).toMatch(/if\s*\(\s*source\s*===\s*"live"\s*&&\s*!courseUrl\s*\)/);
    expect(source).toMatch(/if\s*\(\s*source\s*===\s*"export"\s*&&\s*!courseId\s*\)/);
    // The old defect: an unconditional courseUrl check that ran before
    // `source` was read at all, refusing every export request outright.
    expect(source).not.toMatch(/if\s*\(\s*!courseUrl\s*\)\s*return/);
  });

  it("route.ts loads an export selection's content by courseId via readExportCourseContentById, never by courseUrl", () => {
    const source = readFileSync(ROUTE_PATH, "utf8");
    expect(source).toMatch(
      /import\s*\{[^}]*\breadExportCourseContentById\b[^}]*\}\s*from\s*["']@\/lib\/lms-export-source["']/
    );
    expect(source).toMatch(/readExportCourseContentById\(supabase,\s*courseId\)/);
  });

  it("route.ts sends the accurate Common Cartridge media type for .imscc, and keeps application/zip for .zip (FINDING 8)", () => {
    const source = readFileSync(ROUTE_PATH, "utf8");
    expect(source).toMatch(/format === "imscc" \? "application\/vnd\.ims\.imsccv1p1" : "application\/zip"/);
  });

  it("route.ts's streaming comment names the real re-buffering the .imscc path performs, correcting the prior comment's false claim (FINDING 5)", () => {
    const source = readFileSync(ROUTE_PATH, "utf8");
    expect(source).toMatch(/FINDING 5/);
    expect(source).toMatch(/cartridgeBlob\.arrayBuffer\(\)/);
    expect(source).toMatch(/JSZip\.loadAsync/);
    expect(source).toMatch(/generateAsync/);
  });

  it("ContentTab.tsx derives an export selection's courseId and threads it into ModulesView, without touching courseUrl's own derivation", () => {
    const source = readFileSync(CONTENT_TAB_PATH, "utf8");
    expect(source).toMatch(/exportCourseId\s*=\s*selection\.source\s*===\s*"export"\s*\?\s*selection\.courseId\s*:\s*undefined/);
    expect(source).toMatch(/<ModulesView[\s\S]*?exportCourseId=\{exportCourseId\}/);
    // The brief this fix was built against explicitly forbids changing this
    // line (other callers depend on it) - prove it survived untouched.
    expect(source).toContain('const courseUrl = selection.source === "live" ? selection.courseUrl : "";');
  });

  it("ModulesView.tsx passes exportCourseId into useSelectionDownload, the same way it already passes courseUrl", () => {
    const source = readFileSync(MODULES_VIEW_PATH, "utf8");
    expect(source).toMatch(/useSelectionDownload\(\s*courseUrl,\s*exportCourseId,/);
  });
});
