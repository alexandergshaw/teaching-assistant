import { afterEach, expect, it, vi } from "vitest";
import { chatEditScope, newChatEditInstance, savedChatEdits, savedLegacyChatEdits } from "./chatEditScope";
import { gradingResultsEditsKey, loadGradingResultsEdits, persistGradingResultsEdits, seedEdits, type GradingRun } from "../grading-results/gradingResultsHelpers";

afterEach(() => vi.unstubAllGlobals());

it("keeps edits in the same session while isolating new tabs, new sessions and accounts", () => {
  const values = new Map<string, string>();
  const localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  vi.stubGlobal("window", { localStorage }); vi.stubGlobal("localStorage", localStorage);
  const run = { results: [{ student: "Student", strengths: "New success", improvements: "", resubmitNotice: "", overallComment: "New success", feedback: "New success", totalScore: "15/15", rubricAreas: [], mergedFileCount: 0, submittedFiles: [] }] } as unknown as GradingRun;
  const oldScope = chatEditScope("old-tab", "account-a", 0);
  const oldEdit = seedEdits(run); oldEdit.Student.strengths = "Prior failure"; oldEdit.Student.total = "";
  persistGradingResultsEdits("", oldEdit, oldScope);
  values.set("ta-grading-results-edits:", JSON.stringify({ Student: { strengths: "Legacy failure" } }));
  expect(loadGradingResultsEdits("", run, oldScope).Student.strengths).toBe("Prior failure");
  for (const scope of [chatEditScope("new-tab", "account-a", 0), chatEditScope("old-tab", "account-a", 1), chatEditScope("old-tab", "account-b", 0)]) {
    expect(gradingResultsEditsKey("", scope)).not.toBe(gradingResultsEditsKey("", oldScope));
    expect(loadGradingResultsEdits("", run, scope).Student.strengths).toBe("New success");
    expect(loadGradingResultsEdits("", run, scope).Student.total).toBe("15/15");
  }
});
it("reports malformed records and exports only shared legacy keys on explicit request", () => {
  const legacy = "ta-grading-results-edits:https://example.test/course::grading-chat-0";
  const other = gradingResultsEditsKey("", chatEditScope("tab", "account-b", 0));
  const signedOut = gradingResultsEditsKey("", chatEditScope("tab", undefined, 1));
  const values = new Map([[legacy, "not-json"], ["ta-grading-results-edits:", "{}"], [other, "{}"], [signedOut, "{}"]]);
  const storage = { length: values.size, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null } as Storage;
  expect(savedLegacyChatEdits(storage)).toEqual([{ key: legacy, malformedRaw: "not-json" }, { key: "ta-grading-results-edits:", edits: {} }, { key: signedOut, edits: {} }]);
  values.set(other, "broken");
  expect(savedChatEdits(storage, "account-b")).toEqual([{ key: other, malformedRaw: "broken" }]);
});
it("gives separately mounted chats different edit instances", () => {
  expect(newChatEditInstance()).not.toBe(newChatEditInstance());
});
it("recovers stored edits after a new mount only for the signed-in account", () => {
  const own = gradingResultsEditsKey("", chatEditScope("earlier-tab", "account-a", 0));
  const other = gradingResultsEditsKey("", chatEditScope("earlier-tab", "account-b", 0));
  const values = new Map([[own, JSON.stringify({ Student: { strengths: "Saved feedback" } })], [other, JSON.stringify({ Student: { strengths: "Other account" } })], ["ta-grading-results-edits::grading-chat-0", "{}"]]);
  const storage = { length: values.size, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null } as Storage;
  expect(savedChatEdits(storage, "account-a")).toEqual([{ key: own, edits: { Student: { strengths: "Saved feedback" } } }]);
  expect(savedChatEdits(storage, "account-b").map((record) => record.key)).toEqual([other]);
  expect(savedChatEdits(storage, "")).toEqual([]);
});
