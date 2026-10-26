import { beforeEach, describe, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => {
  const slots: { value: unknown }[] = []; let cursor = 0;
  return { reset() { slots.length = 0; cursor = 0; }, begin() { cursor = 0; },
    useEffect(effect: () => void, deps: unknown[]) { const i = cursor++; const old = slots[i]?.value as unknown[] | undefined; if (!old || deps.some((dep, index) => dep !== old[index])) { slots[i] = { value: deps }; effect(); } },
    useState(init: unknown) { const i = cursor++; const slot = slots[i] ??= { value: typeof init === "function" ? (init as () => unknown)() : init }; return [slot.value, (next: unknown) => { slot.value = typeof next === "function" ? (next as (old: unknown) => unknown)(slot.value) : next; }]; } };
});
vi.mock("react", () => ({ useEffect: harness.useEffect, useState: harness.useState }));
import { useChatRepositoryProposals, postRepositoryCollection } from "./useChatRepositoryProposals";
import { stageRepositoryBatch, emptyRepositoryEvidence } from "./chatRepositoryBatch";
import { studentKeyId } from "./chatRepositoryProposals";
import type { RepositoryCollectRequest, RepositoryCollectResponse } from "@/lib/grade/repository-evidence-types";
const sha = "a".repeat(40);
const students = [
  { key: { sessionEpoch: "session-1", sourceIndex: 0 }, label: "Sam", sourceCue: "original sentinel A", retainedBytes: 300 },
  { key: { sessionEpoch: "session-1", sourceIndex: 1 }, label: "Sam (2)", sourceCue: "original sentinel B", retainedBytes: 300 },
];
function responseFor(request: RepositoryCollectRequest): RepositoryCollectResponse {
  return { ...request, evidence: request.mappings.map((mapping) => ({ files: [{ id: "repo-0", path: "main.ts", text: "source", truncated: false }], manifest: {
    originalUrl: mapping.originalUrl, scope: mapping.scope, commitSha: sha, collectedAt: "2026-10-25T00:00:00Z", pin: "immutable", digest: "fixed-digest",
    timing: { kind: "unknown", reason: "no-trusted-submission-time" }, files: [{ id: "repo-0", path: "main.ts", bytes: 6, truncated: false }],
    coverage: { treeTruncated: false, complete: true, omitted: [], unenumerated: false },
  } })) };
}
beforeEach(() => { harness.reset(); vi.restoreAllMocks(); });
describe("repository hook actual callbacks", () => {
  it("confirming/removing another student's source and unchanged confirmation preserve prior evidence and attempts", async () => {
    let evidence = stageRepositoryBatch(`https://github.com/acme/one/commit/${sha}\nhttps://github.com/acme/two/commit/${sha}`, emptyRepositoryEvidence());
    const collect = vi.fn(async (request: RepositoryCollectRequest) => responseFor(request));
    const useTestHook = () => { harness.begin(); return useChatRepositoryProposals({ sessionEpoch: "session-1", evidence, students: () => students, collect }); };
    let hook = useTestHook(); const a = studentKeyId(students[0].key), b = studentKeyId(students[1].key);
    const first = { id: evidence.lines[0].key!, studentId: a };
    hook.confirm([first]); await hook.collect(a); hook = useTestHook();
    const saved = hook.collections.get(a)!.response, revision = hook.mappings[0].mappingRevision;
    hook.confirm([first]); hook = useTestHook(); expect(hook.mappings[0].mappingRevision).toBe(revision);
    hook.confirm([{ id: evidence.lines[1].key!, studentId: b }]); hook = useTestHook();
    expect(hook.collections.get(a)?.response).toBe(saved);
    evidence = { ...evidence, lines: evidence.lines.slice(0, 1) }; hook = useTestHook(); hook = useTestHook();
    expect(hook.collections.get(a)?.response).toBe(saved); await hook.collect(a); expect(collect).toHaveBeenCalledTimes(1);
  });
  it("blank unresolved revokes a prior confirmed mapping and aborts its late collection", async () => {
    const evidence = stageRepositoryBatch(`https://github.com/acme/work/commit/${sha}`, emptyRepositoryEvidence());
    let finish!: (response: RepositoryCollectResponse) => void, request!: RepositoryCollectRequest, signal!: AbortSignal;
    const collect = vi.fn((body: RepositoryCollectRequest, abort: AbortSignal) => { request = body; signal = abort; return new Promise<RepositoryCollectResponse>((resolve) => { finish = resolve; }); });
    const useTestHook = () => { harness.begin(); return useChatRepositoryProposals({ sessionEpoch: "session-1", evidence, students: () => students, collect }); };
    let hook = useTestHook(); const id = evidence.lines[0].key!; hook.confirm([{ id, studentId: studentKeyId(students[0].key) }]);
    const pending = hook.collect(studentKeyId(students[0].key)); expect(hook.confirm([{ id, studentId: "" }])).toBe(true);
    expect(signal.aborted).toBe(true); finish(responseFor(request)); await pending; hook = useTestHook();
    expect(hook.mappings).toEqual([]); expect([...hook.collections.values()].every((item) => !item.response)).toBe(true); expect(hook.nextBatch).toEqual([]);
  });
  it("exhaustion survives unrelated confirmation and explicit new revision recovers while preserving a prior valid result", async () => {
    const evidence = stageRepositoryBatch(`https://github.com/acme/one/commit/${sha}\nhttps://github.com/acme/two/commit/${sha}`, emptyRepositoryEvidence());
    const collect = vi.fn(async (request: RepositoryCollectRequest) => responseFor(request));
    const useTestHook = () => { harness.begin(); return useChatRepositoryProposals({ sessionEpoch: "session-1", evidence, students: () => students, collect }); };
    let hook = useTestHook(); const id = studentKeyId(students[0].key);
    hook.confirm([{ id: evidence.lines[0].key!, studentId: id }]); await hook.collect(id); hook = useTestHook(); const saved = hook.collections.get(id)!.response;
    collect.mockRejectedValue(new Error("private failure")); await hook.collect(id, true); await hook.collect(id); hook = useTestHook();
    expect(hook.exhausted.has(id)).toBe(true); expect(hook.collections.get(id)?.response).toBe(saved);
    hook.confirm([{ id: evidence.lines[1].key!, studentId: studentKeyId(students[1].key) }]); hook = useTestHook();
    expect(hook.exhausted.has(id)).toBe(true); await hook.collect(id); expect(collect).toHaveBeenCalledTimes(3);
    collect.mockImplementation(async (request) => responseFor(request)); await hook.collect(id, true); hook = useTestHook();
    expect(hook.exhausted.has(id)).toBe(false); expect(hook.collections.get(id)?.status).toBe("collected"); expect(collect).toHaveBeenCalledTimes(4);
  });
  it("admits at most three named confirmed students per explicit click, then requires another click", async () => {
    const four = [0, 1, 2, 3].map((sourceIndex) => ({ key: { sessionEpoch: "session-1", sourceIndex }, label: `Student ${sourceIndex + 1}`, sourceCue: "original", retainedBytes: 100 }));
    const evidence = stageRepositoryBatch(four.map((_, index) => `https://github.com/acme/work${index}/commit/${sha}`).join("\n"), emptyRepositoryEvidence());
    const collect = vi.fn(async (request: RepositoryCollectRequest) => responseFor(request));
    const useTestHook = () => { harness.begin(); return useChatRepositoryProposals({ sessionEpoch: "session-1", evidence, students: () => four, collect }); };
    let hook = useTestHook(); hook.confirm(evidence.lines.map((line, index) => ({ id: line.key!, studentId: studentKeyId(four[index].key) })));
    hook = useTestHook(); expect(hook.nextBatch).toEqual(four.slice(0, 3).map((student) => studentKeyId(student.key))); expect(hook.remainingAfterBatch).toBe(1);
    await hook.collectAll(); expect(collect).toHaveBeenCalledTimes(3);
    hook = useTestHook(); expect(hook.nextBatch).toEqual([studentKeyId(four[3].key)]);
    await hook.collectAll(); expect(collect).toHaveBeenCalledTimes(4);
  });
  it("reads all confirmed targets sequentially from one explicit batch action and suppresses double dispatch", async () => {
    const evidence = stageRepositoryBatch(`https://github.com/acme/one/commit/${sha}\nhttps://github.com/acme/two/commit/${sha}`, emptyRepositoryEvidence());
    let release!: () => void;
    const collect = vi.fn(async (request: RepositoryCollectRequest) => {
      if (request.studentKey.sourceIndex === 0) await new Promise<void>((resolve) => { release = resolve; });
      return responseFor(request);
    });
    const useTestHook = () => { harness.begin(); return useChatRepositoryProposals({ sessionEpoch: "session-1", evidence, students: () => students, collect }); };
    let hook = useTestHook();
    hook.confirm(evidence.lines.map((line, index) => ({ id: line.key!, studentId: studentKeyId(students[index].key) })));
    const pending = hook.collectAll(); await hook.collectAll();
    expect(collect).toHaveBeenCalledTimes(1);
    release(); await pending;
    expect(collect).toHaveBeenCalledTimes(2);
    expect(collect.mock.calls.map(([request]) => request.studentKey.sourceIndex)).toEqual([0, 1]);
    hook = useTestHook(); expect([...hook.collections.values()].map((item) => item.status)).toEqual(["collected", "collected"]);
    await hook.collectAll(); expect(collect).toHaveBeenCalledTimes(2);
  });
  it("reset aborts a batch's active read and prevents queued targets from starting", async () => {
    const evidence = stageRepositoryBatch(`https://github.com/acme/one/commit/${sha}\nhttps://github.com/acme/two/commit/${sha}`, emptyRepositoryEvidence());
    let release!: () => void;
    const collect = vi.fn(async (request: RepositoryCollectRequest) => { await new Promise<void>((resolve) => { release = resolve; }); return responseFor(request); });
    const useTestHook = () => { harness.begin(); return useChatRepositoryProposals({ sessionEpoch: "session-1", evidence, students: () => students, collect }); };
    let hook = useTestHook(); hook.confirm(evidence.lines.map((line, index) => ({ id: line.key!, studentId: studentKeyId(students[index].key) })));
    const pending = hook.collectAll(); hook.reset(); release(); await pending;
    hook = useTestHook(); expect(collect).toHaveBeenCalledTimes(1); expect(hook.collections.size).toBe(0); expect(hook.busy).toBe(false);
  });
  it("stage -> explicit target confirm -> endpoint collect preserves SHA, and double click/completed click does not redispatch", async () => {
    const evidence = stageRepositoryBatch(`github.com/acme/work/commit/${sha}`, emptyRepositoryEvidence());
    const fetchMock = vi.fn(async (_url: unknown, init: RequestInit) => Response.json(responseFor(JSON.parse(init.body as string))));
    vi.stubGlobal("fetch", fetchMock);
    const useTestHook = () => { harness.begin(); return useChatRepositoryProposals({ sessionEpoch: "session-1", evidence, students: () => students }); };
    let hook = useTestHook();
    await hook.collect(studentKeyId(students[1].key)); expect(fetchMock).not.toHaveBeenCalled();
    expect(hook.confirm([{ id: evidence.lines[0].key!, studentId: studentKeyId(students[1].key), ref: sha, path: "" }])).toBe(true);
    hook = useTestHook();
    const one = hook.collect(studentKeyId(students[1].key)); const two = hook.collect(studentKeyId(students[1].key));
    await Promise.all([one, two]);
    hook = useTestHook(); await hook.collect(studentKeyId(students[1].key));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/grading-chat-repository");
    const request = JSON.parse(init.body as string);
    expect(request.studentKey).toEqual({ sessionEpoch: "session-1", sourceIndex: 1 });
    expect(request.mappings[0].scope.requestedRef).toBe(sha);
    expect(request.mappings[0].scope.requestedPath).toBeNull();
    expect(request.mappings[0].originalUrl).toBe(`https://github.com/acme/work/commit/${sha}`);
    expect(evidence.lines[0].original).toBe(`github.com/acme/work/commit/${sha}`);
    expect(request).not.toHaveProperty("userId");
    expect(hook.collections.get(studentKeyId(students[1].key))?.status).toBe("collected");
    vi.unstubAllGlobals();
  });
  it.each(["reset", "remove", "remap", "epoch"])("discards late collection after %s and aborts transport", async (mode) => {
    let evidence = stageRepositoryBatch(`https://github.com/acme/work/commit/${sha}`, emptyRepositoryEvidence());
    let epoch = "session-1";
    let finish!: (response: RepositoryCollectResponse) => void;
    let request!: RepositoryCollectRequest; let signal!: AbortSignal;
    const transport = vi.fn((body: RepositoryCollectRequest, abort: AbortSignal) => { request = body; signal = abort; return new Promise<RepositoryCollectResponse>((resolve) => { finish = resolve; }); });
    const useTestHook = () => { harness.begin(); return useChatRepositoryProposals({ sessionEpoch: epoch, evidence, students: () => students, collect: transport }); };
    let hook = useTestHook(); const id = evidence.lines[0].key!;
    hook.confirm([{ id, studentId: studentKeyId(students[0].key) }]);
    const pending = hook.collect(studentKeyId(students[0].key));
    if (mode === "reset") hook.reset();
    if (mode === "remove") evidence = emptyRepositoryEvidence();
    if (mode === "remap") hook.confirm([{ id, studentId: studentKeyId(students[1].key) }]);
    if (mode === "epoch") epoch = "session-2";
    hook = useTestHook();
    expect(signal.aborted).toBe(true);
    finish(responseFor(request)); await pending; hook = useTestHook();
    expect([...hook.collections.values()].every((item) => !item.response)).toBe(true); expect(hook.busy).toBe(false);
  });
  it("closes raw failures, caps explicit retries and isolates diagnostic throws", async () => {
    const evidence = stageRepositoryBatch(`https://github.com/acme/work/commit/${sha}`, emptyRepositoryEvidence());
    const collect = vi.fn(async () => { throw new Error("secret source provider error"); });
    const useTestHook = () => { harness.begin(); return useChatRepositoryProposals({ sessionEpoch: "session-1", evidence, students: () => students, collect, onSettled: () => { throw new Error("recorder"); } }); };
    let hook = useTestHook(); hook.confirm([{ id: evidence.lines[0].key!, studentId: studentKeyId(students[0].key) }]);
    await hook.collect(studentKeyId(students[0].key)); await hook.collect(studentKeyId(students[0].key)); await hook.collect(studentKeyId(students[0].key));
    hook = useTestHook(); expect(collect).toHaveBeenCalledTimes(2); expect(hook.busy).toBe(false);
    expect(JSON.stringify([...hook.collections])).not.toContain("secret");
  });
  it("transport refuses failed HTTP without exposing raw response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("private", { status: 500 })));
    await expect(postRepositoryCollection({ operation: "collect", attemptId: "a", studentKey: students[0].key, mappings: [] }, new AbortController().signal)).rejects.toThrow("Repository collection failed.");
    vi.unstubAllGlobals();
  });
});
