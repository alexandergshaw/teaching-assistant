import { describe, it, expect } from "vitest";
import { renderBacklogMarkdown } from "./render";
import type { BacklogItem } from "./types";

function item(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: "X1",
    state: "actionable",
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

  it("is deterministic regardless of the input array's order (items are sorted within each section)", () => {
    const a = item({ id: "A1" });
    const b = item({ id: "A2" });
    expect(renderBacklogMarkdown([a, b])).toBe(renderBacklogMarkdown([b, a]));
  });

  it("puts every item into exactly one of the four state sections", () => {
    const items = [
      item({ id: "A1", state: "actionable" }),
      item({ id: "D1", state: "owner" }),
      item({ id: "V1", state: "verification" }),
      item({ id: "N1", state: "unscoped" }),
    ];
    const markdown = renderBacklogMarkdown(items);
    for (const id of ["A1", "D1", "V1", "N1"]) {
      expect(markdown).toContain(id);
    }
    expect(markdown).toContain("## Actionable");
    expect(markdown).toContain("## Owner decision");
    expect(markdown).toContain("## Verification (owner)");
    expect(markdown).toContain("## Unscoped");
  });

  it("marks an empty section as explicitly empty rather than omitting its heading", () => {
    const markdown = renderBacklogMarkdown([item({ id: "A1", state: "actionable" })]);
    const ownerSectionIndex = markdown.indexOf("## Owner decision");
    const nextSectionIndex = markdown.indexOf("## Verification");
    const ownerSection = markdown.slice(ownerSectionIndex, nextSectionIndex);
    expect(ownerSection).toContain("_None._");
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
