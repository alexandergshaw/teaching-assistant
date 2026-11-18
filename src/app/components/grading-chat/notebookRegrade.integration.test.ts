import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => { const slots: { value: unknown }[] = []; let i = 0; return { reset: () => { slots.length = 0; i = 0; }, begin: () => { i = 0; }, useRef: (x: unknown) => { const n = i++; return (slots[n] ??= { value: { current: x } }).value; }, useState: (x: unknown) => { const n = i++; const s = slots[n] ??= { value: typeof x === "function" ? (x as () => unknown)() : x }; return [s.value, (v: unknown) => { s.value = typeof v === "function" ? (v as (old: unknown) => unknown)(s.value) : v; }]; } }; });
vi.mock("react", () => ({ useState: h.useState, useRef: h.useRef }));
vi.mock("@/app/actions/grading-chat-intake", () => ({ resolveChatRunHeaderAction: vi.fn(async (_instructions: string, rubric: string) => ({ kind: "ok", effectiveRubric: rubric, criteriaNames: [], rubricUsed: "", rubricFingerprint: "" })), prepareChatSubmissionAction: vi.fn(), prepareCompositeSubmissionAction: vi.fn() }));
const session = { accountId: "account", sessionId: "session" };
vi.mock("@/lib/grade/single-zip-browser-authority", () => ({ createSingleZipBrowserAuthority: () => { const lease = { signal: new AbortController().signal }; return { admit: async () => lease, identity: () => session, close: () => {} }; } }));
import { useContinuousGradingRun } from "./useContinuousGradingRun";
import { prepareNotebookGrade } from "./prepareNotebookGrade";
import type { SupabaseAuthObserver } from "@/context/supabase-auth-observer";
const observer = {} as SupabaseAuthObserver;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(() => { h.reset(); vi.unstubAllGlobals(); });
it("regrade starts a fresh wire request without its retained receipt", async () => {
  const starts: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.body) return new Response(JSON.stringify({ enabled: true }));
    const body = JSON.parse(init.body as string);
    if (body.operation === "discover") return new Response(JSON.stringify({ notebook: { kind: "notebook", owner: "a", repo: "b", commit: "a".repeat(40), path: "work.ipynb" } }));
    if (body.operation === "list") return new Response(JSON.stringify({ attempts: [] }));
    if (body.operation === "start") { starts.push(body); return new Response(JSON.stringify({ status: "succeeded", attempt: body.attempt })); }
    throw new Error("unexpected request");
  }));
  const dispatch = vi.fn(async (request: import("@/app/components/grading/incrementalRunPlan").GradeRunItemRequestBody) => ({ student: request.entry.student, overallComment: "", strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], totalScore: "10", feedback: "", mergedFileCount: 0, submittedFiles: [] }));
  const params = { provider: "gemini" as const, dispatchItem: dispatch, enableSetupCorrections: true, prepareNotebook: (body: import("@/app/components/grading/incrementalRunPlan").GradeRunItemRequestBody, current: () => boolean) => prepareNotebookGrade(body, observer, current) };
  h.begin(); let driver = useContinuousGradingRun(params);
  await driver.beginSession({ assignmentInstructions: "Instructions", rubric: "Rubric" });
  h.begin(); driver = useContinuousGradingRun(params);
  await driver.submit({ kind: "text", content: "https://github.com/a/b", label: "Student" });
  await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1)); await flush();
  h.begin(); driver = useContinuousGradingRun(params);
  expect((await driver.correctSetup({ assignmentInstructions: "Instructions", rubric: "Updated rubric" })).kind).toBe("ready");
  h.begin(); driver = useContinuousGradingRun(params); driver.regrade("Student", true);
  await vi.waitFor(() => expect(starts).toHaveLength(2)); await flush();
  expect(starts).toHaveLength(2);
  expect(starts[1].gradeRequest).not.toHaveProperty("notebookAttempt");
  expect(starts[1].gradeRequest).toHaveProperty("rubric", "Updated rubric");
  expect(dispatch).toHaveBeenCalledTimes(2);
});
