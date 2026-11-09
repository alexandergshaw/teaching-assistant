import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync("src/app/components/discussions/DiscussionsTool.tsx", "utf8");
const rail = readFileSync("src/app/components/manual/manual-rail.ts", "utf8");
const page = readFileSync("src/app/page.tsx", "utf8");
describe("discussions wiring", () => {
  it("provides one reachable Tools view", () => {
    expect(rail).toContain('discussions: "Discussions"');
    expect(page).toContain('manualView === "discussions"');
  });
  it("keeps roster names out of the model call and provides copyable searchable results", () => {
    expect(source).toContain("generateDiscussionTemplateAction(prompt)");
    expect(source).not.toContain("generateDiscussionTemplateAction(roster)");
    expect(source).toContain('label="Search replies"');
    expect(source).toContain("writeClipboardText(row.reply)");
    expect(source).toContain('label="Prompt sent to the model"');
  });
});
