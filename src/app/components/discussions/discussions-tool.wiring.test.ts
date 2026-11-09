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
  it("waits for initial auth before mounting editable state and keys it to the user", () => {
    const wrapper = source.slice(source.indexOf("export default function DiscussionsTool()"), source.indexOf("function DiscussionsSession()"));
    expect(wrapper).toMatch(/if \(loading\) return <Alert/);
    expect(wrapper.indexOf("if (loading)")).toBeLessThan(wrapper.indexOf("<DiscussionsSession"));
    expect(wrapper).toContain('key={user?.id ?? "signed-out"}');
  });
  it("keeps roster names out of the model call and provides copyable searchable results", () => {
    expect(source).toContain("generateDiscussionTemplateAction(prompt)");
    expect(source).not.toContain("generateDiscussionTemplateAction(roster)");
    expect(source).toContain('label="Search replies"');
    expect(source).toContain("writeClipboardText(row.reply)");
    expect(source).toContain('label="Prompt sent to the model"');
  });
  it("checks the roster decision before creating reply rows", () => {
    const run = source.slice(source.indexOf("const run = async"), source.indexOf("const copy = async"));
    expect(run).toContain("discussionRosterProblem(roster, rosterReviewed)");
    expect(run.indexOf("if (rosterProblem)")).toBeLessThan(run.indexOf("setRows(names.map"));
  });
  it("exposes responses and roster views with saved-class selection and conditional saves", () => {
    expect(source).toContain('value="responses" label="Responses"');
    expect(source).toContain('value="rosters" label="Rosters"');
    expect(source).toContain('aria-pressed={responseCourse === course.id}');
    expect(source).toContain('aria-pressed={selectedCourse === course.id}');
    expect(source).toContain('expectedRoster: editorSource');
    expect(source).toContain('Replace the current response roster?');
    expect(source).toContain('Discard roster edits?');
  });
  it("invalidates an older class refresh when a roster save starts", () => {
    const retry = source.slice(source.indexOf("const retryCourses = async"), source.indexOf("const saveCourse = async"));
    const save = source.slice(source.indexOf("const saveCourse = async"), source.indexOf("if (!draftReady)"));
    expect(retry).toContain("const courseRevision = ++courseDataRevision.current");
    expect(retry.indexOf("if (courseRevision !== courseDataRevision.current) return")).toBeLessThan(retry.indexOf("setCourses(result.rosters)"));
    expect(save).toContain("courseDataRevision.current++");
  });
});
