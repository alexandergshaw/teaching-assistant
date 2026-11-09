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
  it("uses existing course rosters without exposing roster editing or writing courses", () => {
    expect(source).not.toContain('value="rosters"');
    expect(source).not.toContain('saveDiscussionRosterAction');
    expect(source).not.toContain('Save roster');
    expect(source).toContain('listDiscussionRostersAction()');
    expect(source).toContain('discussionRosterNames(course.roster)');
    expect(source).toContain('selectedId={responseCourse}');
    expect(source).toContain('Replace the current response roster?');
    expect(source).toContain('writeDiscussionDraft(localStorage, userId');
    expect(source).toContain('readDiscussionDraft(localStorage, userId)');
  });
  it("ignores stale class refreshes", () => {
    const retry = source.slice(source.indexOf("const retryCourses = async"), source.indexOf("if (!draftReady)"));
    expect(retry).toContain("const courseRevision = ++courseDataRevision.current");
    expect(retry.indexOf("if (courseRevision !== courseDataRevision.current) return")).toBeLessThan(retry.indexOf("setCourses(result.rosters)"));
    expect(source).toContain('Refresh classes');
    expect(retry).not.toContain('setRoster("")');
  });
  it("does not replace a newer roster after the confirmation was opened", () => {
    expect(source).toContain('setPendingUse({ course, revision: rosterRevision.current })');
    expect(source).toContain('pendingUse.revision !== rosterRevision.current');
    expect(source).toContain('current.roster !== pendingUse.course.roster');
    expect(source).toContain('if (revision !== rosterRevision.current) return; rosterRevision.current++; setRoster(text)');
  });
  it("holds class selection and generation while a roster file is being read", () => {
    expect(source).toContain('selectedId={responseCourse} disabled={busy || fileReading}');
    expect(source).toContain('if (fileReadLock.current) return; const course');
    expect(source).toContain('if (fileReadLock.current) { setError("Wait for the roster file to finish loading.")');
    expect(source).toContain('finally { fileReadLock.current = false; setFileReading(false); }');
    expect(source).toContain('Reading roster file...');
  });
});
