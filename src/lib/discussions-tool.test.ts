import { describe, expect, it } from "vitest";
import { defaultDiscussionPrompt, detectDiscussionRosterExport, discussionRosterProblem, discussionRosterWarnings, discussionTemplateProblem, parseDiscussionRoster, personalizeDiscussionReply, readDiscussionDraft, writeDiscussionDraft } from "./discussions-tool";

describe("generic discussions", () => {
  it("keeps roster lines intact, including commas and repeated names", () => {
    expect(parseDiscussionRoster(" Lee, Alex \nMorgan Park\nLee, Alex\n\n")).toEqual(["Lee, Alex", "Morgan Park", "Lee, Alex"]);
  });
  it("uses only the provided name and template for each reply", () => {
    expect(personalizeDiscussionReply("Hello {{name}}! Thanks for sharing.", "Ava $&")).toBe("Hello Ava $&! Thanks for sharing.");
    expect(() => personalizeDiscussionReply("Hi Alex, thanks for sharing.", "Ava")).toThrow();
    expect(() => personalizeDiscussionReply("Hello Alex, thanks {{name}}.", "Ava")).toThrow();
  });
  it("requires a placeholder and rejects fixed greetings even when another placeholder exists", () => {
    expect(discussionTemplateProblem("Thanks for sharing.")).toMatch(/{{name}}/);
    expect(discussionTemplateProblem("Hi Alex,\nThanks {{name}}.")).toMatch(/fixed name/);
    expect(discussionTemplateProblem("Hi {{name}},\nThanks for sharing.")).toBeNull();
  });
  it("flags ambiguous roster lines and duplicate identities without deleting any", () => {
    const names = parseDiscussionRoster("Lee, Alex\nLEE, ALEX\nTaylor\tstudent@example.com\nMorgan Park");
    expect(names).toHaveLength(4);
    expect(discussionRosterWarnings(names)).toHaveLength(2);
    expect(discussionRosterWarnings(["Morgan Park", "Ava Patel"])).toEqual([]);
  });
  it("extracts labeled CSV or TSV names only when every record is complete", () => {
    expect(detectDiscussionRosterExport('Student,ID,Email\r\n"Lee, Alex",1,a@example.org\r\nMorgan Park,2,b@example.org')).toEqual(["Lee, Alex", "Morgan Park"]);
    expect(detectDiscussionRosterExport("First Name\tLast Name\tID\nAva\tPatel\t1")).toEqual(["Ava Patel"]);
    expect(detectDiscussionRosterExport("Name,Email\n,missing@example.org")).toBeNull();
    expect(detectDiscussionRosterExport("Name,Email\nAlex")).toBeNull();
    expect(detectDiscussionRosterExport('Name,Email\n"Alex,a@example.org')).toBeNull();
    expect(detectDiscussionRosterExport("Lee, Alex\nMorgan, Park")).toBeNull();
    expect(detectDiscussionRosterExport("Name,Name\nAva,Alex")).toBeNull();
  });
  it("refuses a detected export even when the instructor has acknowledged roster warnings", () => {
    const csv = "Name,Email\nAva,ava@example.org";
    expect(discussionRosterProblem(csv, true)).toMatch(/Apply the detected roster import/);
    expect(discussionRosterProblem("Ava", false)).toBeNull();
    expect(discussionRosterProblem("Ava\nAva", false)).toMatch(/confirm/);
    expect(discussionRosterProblem("Ava\nAva", true)).toBeNull();
  });
  it("persists only draft inputs under the resolved user and never for signed-out state", () => {
    const data = new Map<string, string>();
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
    const draft = { discussion: "Prompt", roster: "Ava", promptOverride: null, overrideDiscussion: "", template: "Hi {{name}}", generatedFromDiscussion: null };
    writeDiscussionDraft(storage, "user-one", draft);
    writeDiscussionDraft(storage, null, { ...draft, roster: "Not saved" });
    expect(readDiscussionDraft(storage, "user-one")).toEqual(draft);
    expect(readDiscussionDraft(storage, "user-two")).toBeNull();
    expect(readDiscussionDraft(storage, null)).toBeNull();
    expect(data.size).toBe(1);
    data.set("ta-discussions-draft-v1:user-two", '{"roster":"invalid"}');
    expect(() => readDiscussionDraft(storage, "user-two")).toThrow();
  });
  it("requests a generic response without claiming to have read individual posts", () => {
    const prompt = defaultDiscussionPrompt("Discuss recursion");
    expect(prompt).toContain("Discuss recursion");
    expect(prompt).toContain("without claiming to have read");
    expect(prompt).toContain("{{name}}");
  });
});
