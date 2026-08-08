// TDD suite for the PURE layer of "draft each scheduled weekly announcement
// from that week's Canvas module content"
// (docs/weekly-announcement-module-content-acceptance-criteria.md AC1 items
// 1/2/4, AC2 item 8, AC4 item 16).
//
// Written BEFORE the implementation exists. Everything asserted here is
// observable behavior - which module a week resolves to, what text the model is
// given, what title actually gets sent - never internal structure.
//
// HTML conversion (AC1 item 3) belongs to the FETCH layer and is pinned in
// src/lib/canvas-modules/module-content.test.ts: the bodies reaching this
// formatter are already plain text.
import { describe, it, expect } from "vitest";
import {
  selectModuleForWeek,
  formatModuleMaterials,
  buildWeeklyAnnouncementInstruction,
  resolveAnnouncementTitle,
  MODULE_MATERIALS_CAP,
  type ModuleContent,
} from "./announcement-module-content";

function item(overrides: Partial<ModuleContent["items"][number]> & { title: string }) {
  return {
    type: "Page",
    body: "",
    dueAt: null,
    pointsPossible: null,
    ...overrides,
  };
}

const named = (...names: string[]) => names.map((name) => ({ name }));

describe("selectModuleForWeek: name matching (AC1 item 1a)", () => {
  it("matches week N by module NAME, so a leading non-module entry never shifts the term by one", () => {
    const modules = named("Start Here", "Module 01: Intro", "Module 02: Loops", "Module 03: Functions");

    const picked = selectModuleForWeek(modules, 2, 15);

    // Position 2 in this list is "Module 01" - the exact off-by-one that
    // produced the "Module 07 announcement described Module 06" bug.
    expect(picked.matchedBy).toBe("name");
    expect(picked.module?.name).toBe("Module 02: Loops");
  });

  it("matches a 'Week N' naming scheme too, and tolerates zero padding", () => {
    const picked = selectModuleForWeek(named("Week 1 - Kickoff", "Week 03 - Recursion"), 3, 15);

    expect(picked.matchedBy).toBe("name");
    expect(picked.module?.name).toBe("Week 03 - Recursion");
  });

  it("REFUSES to guess in a numbered course when the week has no module of its own", () => {
    // The failure this rule exists for: a course numbered 01..14 with a leading
    // "Start Here", asked for week 15. A positional fallback would land on
    // "Module 14" and report it as plausible - drafting week 15's announcement
    // from week 14's content.
    const modules = named("Start Here", ...Array.from({ length: 14 }, (_, i) => `Module ${String(i + 1).padStart(2, "0")}`));

    const picked = selectModuleForWeek(modules, 15, 15);

    expect(picked.matchedBy).toBe("none");
    expect(picked.module).toBeNull();
  });

  it("REFUSES to guess for a week beyond a partly-built course", () => {
    const picked = selectModuleForWeek(named("Module 01", "Module 02"), 5, 15);

    expect(picked.matchedBy).toBe("none");
    expect(picked.module).toBeNull();
  });
});

describe("selectModuleForWeek: the narrow positional fallback (AC1 items 1b/1c)", () => {
  it("uses position when NO module is numbered and the module count matches the term", () => {
    const picked = selectModuleForWeek(named("Unit A", "Unit B", "Unit C"), 2, 3);

    expect(picked.matchedBy).toBe("position");
    expect(picked.module?.name).toBe("Unit B");
  });

  it("REFUSES position when an unnumbered course carries a leading extra entry", () => {
    // Four modules, three weeks: the counts disagree, which is the only signal
    // available that the list does not map one-to-one onto weeks. Guessing here
    // shifts EVERY week of the term - the exact case AC1 item 1 names.
    const picked = selectModuleForWeek(named("Start Here", "Unit A", "Unit B", "Unit C"), 2, 3);

    expect(picked.matchedBy).toBe("none");
    expect(picked.module).toBeNull();
  });

  it("returns no module for an empty course", () => {
    expect(selectModuleForWeek([], 1, 15)).toMatchObject({ module: null, matchedBy: "none" });
  });
});

describe("formatModuleMaterials (AC1 items 2/4)", () => {
  const courseModule: ModuleContent = {
    name: "Module 05: Recursion",
    items: [
      item({ type: "Page", title: "Lecture notes", body: "Recursion is a function calling itself." }),
      item({
        type: "Assignment",
        title: "Lab 5",
        body: "Implement factorial and fibonacci.",
        pointsPossible: 20,
        dueAt: "2026-02-06T18:00:00.000Z",
      }),
      item({ type: "File", title: "recursion-slides.pdf" }),
      item({ type: "SubHeader", title: "Optional extras" }),
    ],
  };

  it("carries every item's type and title, and the body text of the ones that have one", () => {
    const { text } = formatModuleMaterials(courseModule);

    expect(text).toContain("Page: Lecture notes");
    expect(text).toContain("Recursion is a function calling itself.");
    expect(text).toContain("Assignment: Lab 5");
    expect(text).toContain("Implement factorial and fibonacci.");
    // A File item still tells the model something is there, even with no body.
    expect(text).toContain("File: recursion-slides.pdf");
    expect(text).toContain("SubHeader: Optional extras");
  });

  it("carries points and the due date on the items Canvas reports them for", () => {
    const { text } = formatModuleMaterials(courseModule);

    expect(text).toContain("20 points");
    expect(text).toMatch(/due Feb \d/);
  });

  it("writes a single point in the singular", () => {
    const { text } = formatModuleMaterials({
      name: "Module 01",
      items: [item({ type: "Quiz", title: "Warm-up", pointsPossible: 1 })],
    });

    expect(text).toContain("1 point");
    expect(text).not.toContain("1 points");
  });

  it("caps the material at 8000 characters and marks the cut in the text itself", () => {
    const long = "x".repeat(MODULE_MATERIALS_CAP * 3);
    const { text, truncated } = formatModuleMaterials({
      name: "Module 02",
      items: [item({ type: "Page", title: "Huge page", body: long })],
    });

    expect(MODULE_MATERIALS_CAP).toBe(8000);
    expect(text.length).toBeLessThanOrEqual(MODULE_MATERIALS_CAP);
    expect(truncated).toBe(true);
    // The model must never be handed a sentence that simply stops.
    expect(text).toContain("[truncated]");
  });

  it("does not claim truncation for material that fits", () => {
    const formatted = formatModuleMaterials(courseModule);

    expect(formatted.truncated).toBe(false);
    expect(formatted.text).not.toContain("[truncated]");
  });

  it("returns empty text for a module with no items, so the caller can fall back", () => {
    const { text, truncated } = formatModuleMaterials({ name: "Module 09", items: [] });

    expect(text.trim()).toBe("");
    expect(truncated).toBe(false);
  });
});

describe("buildWeeklyAnnouncementInstruction (AC2 item 8)", () => {
  const instruction = buildWeeklyAnnouncementInstruction({
    week: 5,
    moduleName: "Module 05: Recursion",
    courseName: "CS 101 Programming I",
    materials: "Page: Lecture notes\nRecursion is a function calling itself.",
    extraNotes: "No class Monday - campus holiday.",
  });

  it("grounds the draft in that week's actual materials", () => {
    expect(instruction).toContain("Page: Lecture notes");
    expect(instruction).toContain("Recursion is a function calling itself.");
  });

  it("names the week, the module and the course", () => {
    expect(instruction).toContain("Week 5");
    expect(instruction).toContain("Module 05: Recursion");
    expect(instruction).toContain("CS 101 Programming I");
  });

  it("folds in the instructor's extra notes verbatim", () => {
    expect(instruction).toContain("No class Monday - campus holiday.");
  });

  it("asks for what students will learn, what they will do, and the deadlines", () => {
    expect(instruction).toMatch(/learn/i);
    expect(instruction).toMatch(/deadline/i);
  });

  it("tells the model to write from the materials rather than restate the module title", () => {
    expect(instruction).toMatch(/not just restate|rather than restating|do not simply restate/i);
  });

  it("still produces a usable instruction with no extra notes and no course name", () => {
    const bare = buildWeeklyAnnouncementInstruction({
      week: 2,
      moduleName: "Module 02",
      materials: "Assignment: Lab 2",
    });

    expect(bare).toContain("Week 2");
    expect(bare).toContain("Assignment: Lab 2");
    expect(bare).not.toMatch(/undefined|null/);
  });
});

describe("resolveAnnouncementTitle (AC4 item 16)", () => {
  it("prefers the instructor's own rendered title template", () => {
    expect(resolveAnnouncementTitle("Week 5", "Recursion, and why it works", 5)).toBe("Week 5");
  });

  it("uses the drafted title when the instructor left the template blank", () => {
    expect(resolveAnnouncementTitle("", "Recursion, and why it works", 5)).toBe(
      "Recursion, and why it works"
    );
  });

  it("falls back to the week number when neither is given", () => {
    expect(resolveAnnouncementTitle("", "", 5)).toBe("Week 5");
    expect(resolveAnnouncementTitle("   ", "  ", 12)).toBe("Week 12");
  });
});
