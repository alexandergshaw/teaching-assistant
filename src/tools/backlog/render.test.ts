import { describe, it, expect } from "vitest";
import { renderBacklogMarkdown } from "./render";
import type { BacklogItem } from "./types";

function item(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: "X1",
    state: "actionable",
    kind: "chore",
    area: "loop-and-docs-maintenance",
    title: "t",
    owns: [],
    verify: null,
    blocked_by: [],
    instrument: "",
    from: "",
    note: "",
    ...overrides,
  };
}

describe("renderBacklogMarkdown", () => {
  it("is deterministic - rendering the same items twice gives byte-identical output", () => {
    const items = [item({ id: "A1" }), item({ id: "V1", state: "verification" })];
    expect(renderBacklogMarkdown(items)).toBe(renderBacklogMarkdown(items));
  });

  // Rewritten per plan-v2.md B4a: the previous version of this test varied
  // only `id`, which under a default factory is the one dimension that was
  // already sorted correctly - so it could not have caught a broken KIND or
  // AREA sort. This version varies id, kind, AND area across two input
  // orderings, and pins the exact expected id sequence per section as a
  // FROZEN LITERAL rather than re-deriving the sort in the assertion (a test
  // that re-sorts to build its own expectation is a tautology - it can never
  // fail on a broken sort, only on a broken renderer that also breaks the
  // same way).
  it("is deterministic regardless of the input array's order, across kind and area, against a frozen expected id sequence", () => {
    // Two areas, chosen out of registry order on purpose: "ask-ai-modal"
    // sits AFTER "one-upload-per-student-grading" in areas.ts, so a correct
    // sort must reorder them by registry position, not by first-seen order.
    const bugA = item({ id: "B2", kind: "bug", area: "ask-ai-modal" });
    const bugB = item({ id: "B1", kind: "bug", area: "one-upload-per-student-grading" });
    const featureA = item({ id: "F2", kind: "feature", area: "ask-ai-modal" });
    const featureB = item({ id: "F1", kind: "feature", area: "one-upload-per-student-grading" });
    const choreA = item({ id: "C1", kind: "chore", area: "ask-ai-modal" });

    const forward = [bugA, bugB, featureA, featureB, choreA];
    const reversed = [choreA, featureB, featureA, bugB, bugA];

    const forwardMarkdown = renderBacklogMarkdown(forward);
    const reversedMarkdown = renderBacklogMarkdown(reversed);
    expect(forwardMarkdown).toBe(reversedMarkdown);

    // Frozen literal: one-upload-per-student-grading sorts before
    // ask-ai-modal in areas.ts, so within each kind section B1/F1
    // (one-upload-per-student-grading) must precede B2/F2 (ask-ai-modal),
    // regardless of input order.
    const bugsSection = forwardMarkdown.slice(forwardMarkdown.indexOf("## Bugs"), forwardMarkdown.indexOf("## Features"));
    const featuresSection = forwardMarkdown.slice(forwardMarkdown.indexOf("## Features"), forwardMarkdown.indexOf("## Chores"));
    const bugIds = [...bugsSection.matchAll(/\| ([BF]\d) \|/g)].map((m) => m[1]);
    const featureIds = [...featuresSection.matchAll(/\| ([BF]\d) \|/g)].map((m) => m[1]);
    expect(bugIds).toEqual(["B1", "B2"]);
    expect(featureIds).toEqual(["F1", "F2"]);
  });

  it("puts every item into exactly one of the three kind sections, headed Bugs/Features/Chores in that fixed order", () => {
    const items = [
      item({ id: "BUG1", kind: "bug" }),
      item({ id: "FEAT1", kind: "feature" }),
      item({ id: "CHORE1", kind: "chore" }),
    ];
    const markdown = renderBacklogMarkdown(items);
    for (const id of ["BUG1", "FEAT1", "CHORE1"]) {
      expect(markdown).toContain(id);
    }
    const bugsIndex = markdown.indexOf("## Bugs");
    const featuresIndex = markdown.indexOf("## Features");
    const choresIndex = markdown.indexOf("## Chores");
    expect(bugsIndex).toBeGreaterThan(-1);
    expect(featuresIndex).toBeGreaterThan(bugsIndex);
    expect(choresIndex).toBeGreaterThan(featuresIndex);
  });

  it("marks an empty kind section as explicitly empty rather than omitting its heading", () => {
    const markdown = renderBacklogMarkdown([item({ id: "BUG1", kind: "bug" })]);
    const featuresIndex = markdown.indexOf("## Features");
    const choresIndex = markdown.indexOf("## Chores");
    const featuresSection = markdown.slice(featuresIndex, choresIndex);
    expect(featuresSection).toContain("_None._");
  });

  it("renders state as a table column rather than a section heading", () => {
    const markdown = renderBacklogMarkdown([item({ id: "A1", state: "actionable" })]);
    expect(markdown).toContain("| area | id | state | title |");
    expect(markdown).toMatch(/\| A1 \| actionable \|/);
  });

  it("renders area as the human label in the first column, not the raw slug", () => {
    const markdown = renderBacklogMarkdown([item({ id: "A1", area: "ask-ai-modal" })]);
    expect(markdown).toContain("Ask AI modal: persistence and chip copy");
    expect(markdown).not.toContain("| ask-ai-modal |");
  });

  it("carries the state legend and the 2026-09-15 owner ruling in the header prose", () => {
    const markdown = renderBacklogMarkdown([]);
    expect(markdown).toMatch(/`actionable`/);
    expect(markdown).toMatch(/`owner`/);
    expect(markdown).toMatch(/`verification`/);
    expect(markdown).toMatch(/`unscoped`/);
    expect(markdown).toMatch(/2026-09-15/);
    expect(markdown).toMatch(/reads under Bugs/);
  });

  it("escapes a pipe character inside a title so it cannot break the table grammar", () => {
    const markdown = renderBacklogMarkdown([item({ id: "A1", title: "a | b" })]);
    expect(markdown).toContain("a \\| b");
  });

  it("carries the GENERATED banner so a reader knows not to hand-edit it", () => {
    expect(renderBacklogMarkdown([])).toMatch(/GENERATED/);
  });

  it("never emits emoji or a no-emoji-policy violation in its own template text", () => {
    // Cheap in-file guard, independent of src/lib/no-emojis.test.ts's own
    // scan, on the literal template strings this function owns.
    const markdown = renderBacklogMarkdown([item({ id: "A1" })]);
    expect(/[\u{1F300}-\u{1FAFF}]/u.test(markdown)).toBe(false);
  });
});
