import { beforeEach, expect, it, vi } from "vitest";
import JSZip from "jszip";
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: vi.fn(async () => ({ id: "owner" })) }));
vi.mock("../github", () => ({ getRepo: vi.fn(async () => ({ defaultBranch: "main" })), listCommits: vi.fn(async () => [{ sha: "fixed" }]), getRepoTreeWithMeta: vi.fn(), getFileText: vi.fn() }));
vi.mock("../llm", async (original) => ({ ...await original<typeof import("../llm")>(), callLlm: vi.fn() }));
vi.mock("../gemini", async (original) => ({ ...await original<typeof import("../gemini")>(), getGeminiInterRequestDelayMs: () => 0, getGeminiMaxCharsPerSubmission: () => 100000, getGeminiMaxOutputTokens: () => 700, getGeminiMaxSubmissions: () => 5 }));
vi.mock("../code-runner", () => ({ runSubmittedCode: vi.fn(async () => null) }));
import { prepareChatSubmissionAction } from "../../app/actions/grading-chat-intake";
import { POST } from "../../app/api/grade-run-item/route";
import { getRepoTreeWithMeta, getFileText } from "../github";
import { callLlm } from "../llm";
import { canvasWorkToEntry, ingestZipEntries } from "./extraction";
import type { StudentSubmissionEntry } from "./types";
const url = "https://github.com/org/student";
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getRepoTreeWithMeta).mockResolvedValue({ entries: [{ path: "src/Main.py", type: "blob", size: 5, sha: "a" }, { path: "tests/Main.py", type: "blob", size: 5, sha: "b" }, { path: "REQUIRED", type: "blob", size: 0, sha: "c" }, { path: "proof.png", type: "blob", size: 2, sha: "d" }], truncated: true });
  vi.mocked(getFileText).mockImplementation(async (_owner, _repo, path) => { if (path === "tests/Main.py") throw new Error("unreadable"); return "print('real source')"; });
  vi.mocked(callLlm).mockResolvedValue({ ok: true, text: JSON.stringify({ overallComment: "Reviewed.", rubricResults: [{ area: "Correctness", score: "8/10" }], totalScore: "8/10" }), finishReason: "STOP" });
});
async function modelPrompt(entry: StudentSubmissionEntry): Promise<string> {
  const request = new Request("http://localhost/api/grade-run-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceIndex: 0, entry, assignmentInstructions: "Require src/Main.py, REQUIRED and proof.png.", rubric: "Correctness (10 pts): Meets the instructions.", provider: "gemini", pointsPossible: null }) });
  const response = await POST(request as Parameters<typeof POST>[0]);
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.result?.ungraded, JSON.stringify(body)).toBeUndefined();
  const call = vi.mocked(callLlm).mock.calls.at(-1)!;
  return call[0].contents.flatMap((content) => content.parts).map((part) => "text" in part ? part.text : "").join("\n");
}
function check(prompt: string) {
  expect(prompt).toContain("REPOSITORY FILE INVENTORY"); expect(prompt).toContain('"path":"REQUIRED","content":"unsupported"');
  expect(prompt).toContain('"path":"proof.png","content":"unsupported"'); expect(prompt).toContain('"path":"tests/Main.py","content":"unreadable"');
  expect(prompt).toContain('"enumerationComplete":false'); expect(prompt).toContain("an unlisted file is unknown");
  expect(prompt).not.toContain("exact, complete list"); expect(prompt).not.toContain("File: proof.png");
}
it("chat URL intake survives the actual POST validator and reaches the model with independent presence evidence", async () => {
  const form = new FormData(); form.set("kind", "url"); form.set("url", url);
  const outcome = await prepareChatSubmissionAction(form);
  if (outcome.kind !== "entries") throw new Error("Intake refused: " + JSON.stringify(outcome));
  check(await modelPrompt(outcome.entries[0]));
});
it("Canvas URL and inline/deferred ZIP links retain the same independent inventory", async () => {
  const canvas = await canvasWorkToEntry({ student: "Student", userId: 1, text: "", files: [], submissionUrl: url, contributionCount: 1 });
  check(await modelPrompt(canvas));
  const zip = new JSZip(); zip.file("student_123_456_link.html", '<html><head><meta http-equiv="Refresh" content="0; url=' + url + '" /></head><body><a href="' + url + '">Click Here to go to the submission</a><p>This submission was a url.</p></body></html>');
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  for (const deferLinks of [false, true]) {
    const { entries } = await ingestZipEntries(bytes, { deferLinks });
    expect(entries).toHaveLength(1); check(await modelPrompt(entries[0]));
  }
});

it("the actual POST rejects JSON enum coercions before any model call", async () => {
  const valid = { source: "org/repo", scope: { kind: "blob", path: "src/Main.py" }, enumerationComplete: true, files: [{ path: "src/Main.py", content: "read" }] };
  const malformed = [
    ...[["read"], { value: "read" }, 1, null, true].map((content) => ({ ...valid, files: [{ path: "src/Main.py", content }] })),
    ...[["blob"], ["tree"], { value: "blob" }, 1, null, true].map((kind) => ({ ...valid, scope: { kind, path: "src" }, files: [{ path: "src/sibling.py", content: "read" }] }))
  ];
  for (const inventory of malformed) {
    const request = new Request("http://localhost/api/grade-run-item", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceIndex: 0, entry: { student: "Student", content: "code", mergedFileCount: 1, submittedFiles: [], repositoryInventories: [inventory] }, assignmentInstructions: "Grade.", rubric: "Correctness (10 pts): Meets instructions.", provider: "gemini", pointsPossible: null }) });
    expect((await POST(request as Parameters<typeof POST>[0])).status).toBe(400);
  }
  expect(callLlm).not.toHaveBeenCalled();
  const prompt = await modelPrompt({ student: "Student", content: "code", mergedFileCount: 1, submittedFiles: [], repositoryInventories: [valid as NonNullable<StudentSubmissionEntry["repositoryInventories"]>[number]] });
  expect(prompt).toContain('"kind":"blob","path":"src/Main.py"');
});
it("two inline ZIP links for one student preserve both scoped inventories through the actual model prompt", async () => {
  vi.mocked(getFileText).mockImplementation(async (_owner, _repo, path) => "source from " + path);
  const zip = new JSZip();
  zip.file("student_123_456_link.html", '<meta http-equiv="Refresh" content="0; url=https://github.com/org/student/tree/main/src" /><p>This submission was a url.</p>');
  zip.file("student_123_456_second.html", '<meta http-equiv="Refresh" content="0; url=https://github.com/org/student/tree/main/tests" /><p>This submission was a url.</p>');
  const { entries } = await ingestZipEntries(await zip.generateAsync({ type: "arraybuffer" }));
  expect(entries).toHaveLength(1);
  expect(entries[0].repositoryInventories?.map((inventory) => inventory.scope)).toEqual([{ kind: "tree", path: "src" }, { kind: "tree", path: "tests" }]);
  expect(entries[0].gradedRepo).toBeUndefined(); expect(entries[0].gradedRef).toBeUndefined();
  expect(entries[0].submittedFiles.filter((file) => file.name === "src/Main.py")).toHaveLength(1);
  expect(entries[0].submittedFiles.filter((file) => file.name === "tests/Main.py")).toHaveLength(1);
  const prompt = await modelPrompt(entries[0]);
  expect(prompt).toContain('"scope":{"kind":"tree","path":"src"}'); expect(prompt).toContain('"scope":{"kind":"tree","path":"tests"}');
  expect(prompt).toContain('"path":"src/Main.py","content":"read"'); expect(prompt).toContain('"path":"tests/Main.py","content":"read"');
});
it("refuses an inline ZIP inventory aggregate beyond the existing sixteen-source wire limit", async () => {
  const zip = new JSZip();
  for (let index = 0; index < 17; index++) zip.file("student_123_456_link" + index + ".html", '<meta http-equiv="Refresh" content="0; url=' + url + '" /><p>This submission was a url.</p>');
  await expect(ingestZipEntries(await zip.generateAsync({ type: "arraybuffer" }))).rejects.toThrow("inventories exceed supported metadata limits");
  expect(callLlm).not.toHaveBeenCalled();
});
