import { describe, it, expect } from "vitest";
import { checkGeneratedText } from "./check-generated";
import { serializeBacklogYaml } from "./yaml-codec";
import { renderBacklogMarkdown } from "./render";
import type { BacklogItem } from "./types";

const items: BacklogItem[] = [
  {
    id: "A1",
    state: "actionable",
    title: "Do the thing",
    owns: ["src/a.ts"],
    verify: "npx vitest run src/a.test.ts",
    blocked_by: [],
    instrument: "",
    from: "abc1234",
    note: "",
  },
];

describe("checkGeneratedText (Ruling BA-6: the hand-edit detector must be PROVEN, not assumed)", () => {
  it("passes when the markdown is exactly a fresh render of the yaml", () => {
    const yamlText = serializeBacklogYaml(items);
    const markdown = renderBacklogMarkdown(items);
    const result = checkGeneratedText(yamlText, markdown);
    expect(result.ok).toBe(true);
  });

  // This is the mutant Ruling BA-6 requires: hand-edit a rendered fixture -
  // exactly what a well-meaning person editing docs/BACKLOG.md directly
  // would do - and prove check-generated actually notices. If this test
  // does not fail on the mutant, the check does not ship.
  it("fails (non-zero-equivalent ok:false) when the committed markdown is hand-edited after rendering", () => {
    const yamlText = serializeBacklogYaml(items);
    const freshMarkdown = renderBacklogMarkdown(items);
    const handEdited = freshMarkdown.replace("Do the thing", "Do the thing (I tweaked this by hand)");
    const result = checkGeneratedText(yamlText, handEdited);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/STALE or hand-edited/);
  });

  it("fails when the yaml gained an item that was never re-rendered into the markdown", () => {
    const freshMarkdown = renderBacklogMarkdown(items);
    const yamlWithExtraItem = serializeBacklogYaml([
      ...items,
      { ...items[0], id: "A2", title: "A second item nobody rendered" },
    ]);
    const result = checkGeneratedText(yamlWithExtraItem, freshMarkdown);
    expect(result.ok).toBe(false);
  });

  it("names the first differing line number so a failure points somewhere useful", () => {
    const yamlText = serializeBacklogYaml(items);
    const handEdited = renderBacklogMarkdown(items).replace("# Backlog", "# My Backlog");
    const result = checkGeneratedText(yamlText, handEdited);
    expect(result.message).toMatch(/line 1/);
  });

  it("is deterministic across repeated calls on the same input", () => {
    const yamlText = serializeBacklogYaml(items);
    const markdown = renderBacklogMarkdown(items);
    expect(checkGeneratedText(yamlText, markdown)).toEqual(checkGeneratedText(yamlText, markdown));
  });
});
