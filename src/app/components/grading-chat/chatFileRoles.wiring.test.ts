import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
const h = vi.hoisted(() => { const slots: { value: unknown }[] = []; let cursor = 0; return {
  reset() { slots.length = 0; cursor = 0; }, begin() { cursor = 0; },
  useRef(init: unknown) { const i = cursor++; return (slots[i] ??= { value: { current: init } }).value; },
  useState(init: unknown) { const i = cursor++, slot = slots[i] ??= { value: typeof init === "function" ? (init as () => unknown)() : init }; return [slot.value, (next: unknown) => { slot.value = typeof next === "function" ? (next as (old: unknown) => unknown)(slot.value) : next; }]; },
}; });
vi.mock("react", () => ({ useRef: h.useRef, useState: h.useState }));
const header = vi.hoisted(() => vi.fn());
const prepare = vi.hoisted(() => vi.fn());
vi.mock("@/app/actions/grading-chat-intake", () => ({ resolveChatRunHeaderAction: header, prepareChatSubmissionAction: prepare, prepareCompositeSubmissionAction: vi.fn() }));
import { useContinuousGradingRun } from "./useContinuousGradingRun";
import { createChatFileRolesController } from "./useChatFileRoles";
import { submitFilesSequentially } from "./chatFileBatch";
import { createDirectFileIntake } from "./chatDirectFileIntake";
import { oversizedReviewCandidate } from "./oversizedReviewCandidate";
import { createArchiveReviewQueue } from "./archiveReviewQueue";
import { claimIntake, releaseIntake } from "./intakeFence";
import { createPartialHandoffHandler } from "./partialHandoff";
import { webcrypto } from "node:crypto";
import { resolveSetupFill } from "./chatSetupFill";
import { applyOverride, computeOverrideOffer, countOverriddenFields } from "./chatOverrideOffer";
import { LENGTH_THRESHOLD_ERROR, parseLengthDeductionThreshold, recordLengthDeductionThresholdChange } from "./chatLengthDeduction";
import { LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT } from "@/lib/grade/length-deduction-policy";
import { pastedSubmissionUrl } from "@/lib/grade/pasted-submission-url";
import { readSessionDiagnosticLogState, resetSessionDiagnosticLogForTests } from "@/lib/session-diagnostic-log";
import type { GradeResult } from "@/lib/grade/types";
import type { GradeRunItemRequestBody } from "../grading/incrementalRunPlan";
const panel = readFileSync("src/app/components/grading-chat/GradingChatPanel.tsx", "utf8");
function callback(name: string, bindings: Record<string, unknown>) {
  const source = ts.createSourceFile("Panel.tsx", panel, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) declaration = node; ts.forEachChild(node, visit); }; visit(source);
  if (!declaration) throw new Error(`Missing actual Panel callback ${name}`);
  const code = ts.transpileModule(`const ${declaration.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return ${name};`)(...Object.values(bindings));
}
const result = (student: string): GradeResult => ({ student, totalScore: "1/1", overallComment: "", strengths: "", improvements: "", resubmitNotice: "", rubricAreas: [], feedback: "", mergedFileCount: 0, submittedFiles: [] });
beforeEach(() => { h.reset(); header.mockReset(); prepare.mockReset(); });
function setupCallback(driver: ReturnType<typeof useContinuousGradingRun>, instructions: string, rubric: string, lengthThresholdText = "1", applyLengthDeduction = false) {
  return callback("ensureSession", { driver, instructions, rubric, harshness: "balanced", feedbackLengthText: "", applyNamingDeduction: true, applyLengthDeduction, lengthThresholdText, parseLengthDeductionThreshold, LENGTH_THRESHOLD_ERROR,
    resolveSetupFill, applyOverride, computeOverrideOffer, countOverriddenFields, coerceFeedbackWordTarget: () => undefined,
    sessionRefusalRef: { current: "refused" }, setSubmitError: vi.fn(), setInstructions: vi.fn(), setRubric: vi.fn(), setSetupNote: vi.fn() });
}
describe("actual role controller -> Panel setup/transport callbacks -> continuous driver", () => {
  it("passes the verified owner session into every reviewed ZIP handoff", async () => {
    const records = new Map<string, string>(), storage = { get length() { return records.size; }, key: (i: number) => [...records.keys()][i] ?? null, getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } };
    vi.stubGlobal("navigator", { locks: { request: async (_key: string, _options: unknown, work: (lock: object) => Promise<unknown>) => work({}) } }); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("localStorage", storage);
    try {
      const accountId = "11111111-1111-4111-8111-111111111111", sessionId = "22222222-2222-4222-8222-222222222222", controller = new AbortController(), lease = { signal: controller.signal };
      const authority = { admit: async () => lease, resolve: (candidate: unknown) => candidate === lease ? accountId : null, identity: (candidate: unknown) => candidate === lease ? { accountId, sessionId } : null, revoke: vi.fn(), close: vi.fn() };
      const submitted = vi.fn(async () => [{ kind: "accepted" as const, entryCount: 1 }]);
      const run = createPartialHandoffHandler({ getEpoch: () => 0, account: accountId, capture: () => 0, owns: () => true, latch: { busy: false, generation: 0 }, indexAuthority: () => authority, onRecords: vi.fn(), onOmissions: vi.fn(), submit: submitted });
      const group = { label: "student", sourceIdentifier: "student", members: [{ path: "work.txt" }] } as never;
      expect(await run(new File(["source"], "source.zip"), new File(["subset"], "subset.zip"), [group], [], { student: "Student" }, { current: () => true, onProgress: vi.fn(), bindOwnerSession: true })).toBeNull();
      expect(submitted).toHaveBeenCalledWith(expect.any(File), { "work.txt": "Student" }, undefined, undefined, undefined, { accountId, sessionId });
    } finally { vi.unstubAllGlobals(); }
  });
  it("hashes the same source once per attempt while hashing every submitted batch", async () => {
    const records = new Map<string, string>();
    const storage = { get length() { return records.size; }, key: (i: number) => [...records.keys()][i] ?? null, getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } };
    vi.stubGlobal("navigator", { locks: { request: async (_key: string, _options: unknown, work: (lock: object) => Promise<unknown>) => work({}) } }); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("localStorage", storage);
    try {
      const submitted = vi.fn(async () => [{ kind: "accepted" }]);
      const run = callback("handlePartialHandoff", { createPartialHandoffHandler, sharedIntakeLatch: { busy: false, generation: 0 }, dropSessionEpoch: { current: 0 }, user: { id: "owner" }, zipReview: { capture: () => 0, owns: () => true }, setPartialOmissions: vi.fn(), setPartialRecords: vi.fn(), handleSubmitFiles: submitted });
      const source = new File(["source"], "source.zip"), sourceReads = vi.spyOn(source, "slice"), sourceDigests = new WeakMap<File, string>();
      const group = { label: "student", members: [{ path: "work.txt" }] }, review = { current: () => true, onProgress: vi.fn(), sourceDigests };
      expect(await run(source, new File(["first"], "first.zip"), [group], [], { student: "Student" }, review)).toBeNull();
      expect(await run(source, new File(["second"], "second.zip"), [group], [], { student: "Student" }, review)).toBeNull();
      expect(sourceReads).toHaveBeenCalledOnce(); expect(submitted).toHaveBeenCalledTimes(2);
      const other = new File(["source"], "source.zip"), otherReads = vi.spyOn(other, "slice");
      expect(await run(other, new File(["third"], "third.zip"), [group], [], { student: "Student" }, review)).toBeNull(); expect(otherReads).toHaveBeenCalledOnce();
    } finally { vi.unstubAllGlobals(); }
  });
  it("locks the actual partial handoff, records omissions before dispatch, and permits an explicit resubmission", async () => {
    const records = new Map<string, string>();
    const storage = { get length() { return records.size; }, key: (i: number) => [...records.keys()][i] ?? null, getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } };
    const latch = { busy: false, generation: 0 }, epoch = { current: 0 }, submitted = vi.fn(async () => [{ kind: "accepted" }]);
    const lock = vi.fn(async (_key: string, _options: unknown, work: (lock: object) => Promise<unknown>) => work({}));
    vi.stubGlobal("navigator", { locks: { request: lock } }); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("localStorage", storage);
    const run = callback("handlePartialHandoff", { createPartialHandoffHandler, sharedIntakeLatch: latch, dropSessionEpoch: epoch, user: { id: "owner" }, zipReview: { capture: () => 0, owns: () => true }, setPartialOmissions: vi.fn(), setPartialRecords: vi.fn(), handleSubmitFiles: submitted });
    const group = { label: "archive-name", members: [{ path: "work.txt" }] }, omitted = [{ label: "omitted", reason: "member size", members: [{ path: "video.mp4" }] }];
    const future = { label: "next", members: [{ path: "next.txt" }] };
    expect(await run(new File(["source"], "source.zip"), new File(["subset"], "subset.zip"), [group], omitted, { "archive-name": "Student", next: "Next Student" }, { current: () => true, onProgress: vi.fn(), pendingAtHandoff: [future] })).toBeNull();
    expect(submitted).toHaveBeenCalledWith([expect.any(File)], undefined, { "work.txt": "Student" }, undefined, undefined, true, undefined, undefined, undefined);
    expect([...records.values()][0]).toContain("video.mp4"); expect(JSON.parse([...records.values()][0]).pendingAtHandoff).toEqual([{ student: "Next Student", files: ["next.txt"] }]);
    expect(await run(new File(["source"], "source.zip"), new File(["subset"], "subset.zip"), [group], omitted, { "archive-name": "Student" })).toBeNull();
    expect(submitted).toHaveBeenCalledTimes(2); expect(lock).toHaveBeenCalledTimes(2);
    const interrupted = vi.fn(async () => { throw new Error("connection lost"); });
    const uncertainRun = callback("handlePartialHandoff", { createPartialHandoffHandler, sharedIntakeLatch: latch, dropSessionEpoch: epoch, user: { id: "owner" }, zipReview: { capture: () => 0, owns: () => true }, setPartialOmissions: vi.fn(), setPartialRecords: vi.fn(), handleSubmitFiles: interrupted });
    expect(await uncertainRun(new File(["other"], "source.zip"), new File(["subset"], "subset.zip"), [group], omitted, { "archive-name": "Student" })).toMatch(/could not be confirmed/i);
    expect([...records.values()].some((value) => JSON.parse(value).status === "unknown")).toBe(true);
    expect(await uncertainRun(new File(["other"], "source.zip"), new File(["subset"], "subset.zip"), [group], omitted, { "archive-name": "Student" })).toMatch(/could not be confirmed/i);
    expect(interrupted).toHaveBeenCalledTimes(2);
    const staleRun = callback("handlePartialHandoff", { createPartialHandoffHandler, sharedIntakeLatch: latch, dropSessionEpoch: epoch, user: { id: "owner" }, zipReview: { capture: () => 0, owns: () => false }, setPartialOmissions: vi.fn(), setPartialRecords: vi.fn(), handleSubmitFiles: submitted });
    expect(await staleRun(new File(["stale"], "source.zip"), new File(["subset"], "subset.zip"), [group], omitted, { "archive-name": "Student" })).toMatch(/session changed/i);
    expect(submitted).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
  it("routes the original oversized ZIP into review without starting grading", async () => {
    const file = new File(["synthetic"], "Vector Sorting.zip"); Object.defineProperty(file, "size", { value: 282_107_616 });
    const setReviewFile = vi.fn(), intake = { isPending: () => false, run: vi.fn() }, reviewSequence = { current: 0 }, archiveReviewQueue = { current: createArchiveReviewQueue() };
    const submit = callback("handleSubmitFiles", { directIntake: { current: intake }, preparing: false, driver: { headerState: "ready" }, oversizedReviewCandidate, setReviewFile, reviewSequence, archiveReviewQueue, setWaitingArchiveNames: vi.fn(), submitFilesSequentially, dropSessionEpoch: { current: 0 } });
    const outcome = await submit([file]); expect(setReviewFile).toHaveBeenCalledWith({ file, id: 1, autoSubmit: false }); expect(intake.run).not.toHaveBeenCalled(); expect(outcome[0]).toMatchObject({ kind: "refused", reason: expect.stringContaining("Nothing was submitted") });
    const second = new File(["synthetic2"], "second.zip"), third = new File(["synthetic3"], "third.zip"); Object.defineProperty(second, "size", { value: 282_107_617 }); Object.defineProperty(third, "size", { value: 282_107_618 }); await submit([second, third], undefined, undefined, undefined, undefined, false, "multiple"); expect(setReviewFile).toHaveBeenCalledTimes(1); expect(archiveReviewQueue.current.complete()).toEqual({ file: second, autoSubmit: true }); expect(archiveReviewQueue.current.complete()).toEqual({ file: third, autoSubmit: true });
    expect((await submit([file], undefined, undefined, undefined, undefined, false, "single"))[0]).toMatchObject({ kind: "refused", reason: expect.stringContaining("single-student") });
    const mixed = await submit([second, new File(["part"], "part.txt")]); expect(mixed).toHaveLength(2); expect(mixed.every((item: { kind: string }) => item.kind === "refused")).toBe(true); expect(archiveReviewQueue.current.waitingNames()).toEqual([]);
    expect(panel).toContain("key={`${visibleDropEpoch}:${reviewFile?.id ?? \"idle\"}`}");
    expect(oversizedReviewCandidate([file, new File(["x"], "other.txt")])).toBeNull();
    expect(oversizedReviewCandidate([new File(["x"], "small.zip")])).toBeNull();
  });
  it("forwards the selected student mode from the composer into the panel route", () => {
    const composer = readFileSync("src/app/components/grading-chat/ChatComposer.tsx", "utf8");
    expect(composer).toContain('onMany={(files) => onSubmitFiles(files, undefined, "multiple")}');
    expect(composer).toContain('(items, label) => onSubmitFiles(items, label, "single")');
    expect(panel).toContain("handleSubmitFiles(files, label, undefined, undefined, undefined, false, mode)");
    expect(panel).toContain('archiveReviewQueue.current.enqueue(oversized, mode === "multiple")');
  });
  it("keeps later selected batches pending instead of labeling them omitted", async () => {
    const recovery = readFileSync("src/app/components/grading-chat/LargeZipRecovery.tsx", "utf8");
    expect(recovery).toContain("omittedGroups(result.omitted, selected, admittedLabels)");
    expect(recovery).toContain("[...remaining].filter((label) => !currentBatch.has(label))");
    expect(recovery).toContain("pendingAtHandoff: groups.filter((group) => future.has(group.label))");
    expect(recovery).toContain("remainingGroups(previous, admitted)");
  });
  it("does not queue a later ZIP after the session changes during the first upload", async () => {
    let finish!: (value: unknown[]) => void;
    const run = vi.fn(() => new Promise<unknown[]>((resolve) => { finish = resolve; }));
    const epoch = { current: 0 }, setReviewFile = vi.fn();
    const submit = callback("handleSubmitFiles", { directIntake: { current: { isPending: () => false, run } }, preparing: false, driver: { headerState: "ready" }, oversizedReviewCandidate, setReviewFile, reviewSequence: { current: 0 }, archiveReviewQueue: { current: createArchiveReviewQueue() }, setWaitingArchiveNames: vi.fn(), submitFilesSequentially, dropSessionEpoch: epoch,
      setDirectPreparing: vi.fn(), setPreparing: vi.fn(), setSubmitError: vi.fn(), instructions: "", rubric: "", harshness: "balanced", feedbackLengthText: "", coerceFeedbackWordTarget: Number, applyNamingDeduction: false, applyLengthDeduction: false, lengthThresholdText: "1", parseLengthDeductionThreshold, ensureSession: vi.fn(), handleConfirmedFiles: vi.fn() });
    const later = new File(["x"], "later.zip"); Object.defineProperty(later, "size", { value: 282_107_616 });
    const pending = submit([new File(["x"], "first.zip"), later]);
    expect(run).toHaveBeenCalledOnce(); epoch.current++; finish([{ kind: "refused", reason: "canceled" }]);
    const result = await pending;
    expect(result[1]).toMatchObject({ kind: "refused", reason: expect.stringContaining("later.zip: session changed") });
    expect(setReviewFile).not.toHaveBeenCalled(); expect(run).toHaveBeenCalledOnce();
  });
  it("cancels long source hashing without recording or dispatching", async () => {
    const records = new Map<string, string>(); const storage = { get length() { return records.size; }, key: (i: number) => [...records.keys()][i] ?? null, getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } };
    vi.stubGlobal("navigator", { locks: { request: async (_key: string, _options: unknown, work: (lock: object) => Promise<unknown>) => work({}) } }); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("localStorage", storage);
    const submitted = vi.fn(async () => [{ kind: "accepted" }]); let current = true; const updates: number[] = [];
    const run = callback("handlePartialHandoff", { createPartialHandoffHandler, sharedIntakeLatch: { busy: false, generation: 0 }, dropSessionEpoch: { current: 0 }, user: { id: "owner" }, zipReview: { capture: () => 0, owns: () => true }, setPartialOmissions: vi.fn(), setPartialRecords: vi.fn(), handleSubmitFiles: submitted });
    const group = { label: "Synthetic", members: [{ path: "work.txt" }] }, source = new File([new Uint8Array(8 * 1024 * 1024)], "source.zip");
    const result = await run(source, new File(["subset"], "subset.zip"), [group], [], { Synthetic: "Student" }, { current: () => current, onProgress: (value: { written: number } | null) => { if (value) { updates.push(value.written); if (value.written > 0) current = false; } } });
    expect(result).toMatch(/session changed/i); expect(updates).toEqual([0, 4 * 1024 * 1024]); expect(records.size).toBe(0); expect(submitted).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
  it("reports a hash read failure before dispatch as a safe refusal", async () => {
    vi.stubGlobal("navigator", { locks: { request: vi.fn() } }); vi.stubGlobal("crypto", webcrypto);
    const submitted = vi.fn(); const run = callback("handlePartialHandoff", { createPartialHandoffHandler, sharedIntakeLatch: { busy: false, generation: 0 }, dropSessionEpoch: { current: 0 }, user: { id: "owner" }, zipReview: { capture: () => 0, owns: () => true }, setPartialOmissions: vi.fn(), setPartialRecords: vi.fn(), handleSubmitFiles: submitted });
    const broken = { size: 5, slice: () => new Blob(["four"]) }, group = { label: "Synthetic", members: [{ path: "work.txt" }] };
    expect(await run(broken, new File(["subset"], "subset.zip"), [group], [], { Synthetic: "Student" }, { current: () => true, onProgress: vi.fn() })).toMatch(/verification failed.*nothing was submitted/i);
    expect(submitted).not.toHaveBeenCalled(); vi.unstubAllGlobals();
  });
  it("holds a whole-panel ZIP drop at shared review and fences a second drop", async () => {
    let decide!: (value: boolean) => void;
    const check = vi.fn((_files: readonly File[], _current: () => boolean, _unknown: boolean) => new Promise<boolean>((resolve) => { decide = resolve; }));
    const submit = vi.fn(async () => ({ kind: "accepted", entryCount: 1 }));
    const consume = callback("handleConfirmedFiles", { driver: { submit, pendingVideoCount: () => 0 }, zipReview: { check, capture: () => 0, owns: () => true, remember: vi.fn() }, submitFilesSequentially, submitLooseVideo: vi.fn(async () => null), user: { id: "owner" }, supabase: { storage: {} }, VIDEO_GRADING_ENABLED: false,
      isZipFileName: (name: string) => name.endsWith(".zip"), chooseZipTransport: () => ({ kind: "body" }), chooseSingleFileTransport: () => ({ kind: "body" }), preflightUploadFile: () => ({ ok: true }),
      safeIntake: (fn: () => void) => fn(), recordIntakeGate: vi.fn(), submitStoragedZip: vi.fn(), submitStoragedSingleFile: vi.fn(), sessionRefusalRef: { current: "refused" }, setSubmitError: vi.fn() });
    const latch = { busy: false, generation: 0 }, error = vi.fn();
    const drop = callback("handlePanelDrop", { setIsDragging: vi.fn(), sharedIntakeLatch: latch, claimIntake, releaseIntake, setSubmitError: error, handleSubmitFiles: (files: File[]) => consume(files, undefined, () => true) });
    const zip = new File(["zip"], "class.zip"), event = { preventDefault: vi.fn(), dataTransfer: { files: [zip] } };
    drop(event); await Promise.resolve(); drop(event); expect(check).toHaveBeenCalledTimes(1); expect(submit).not.toHaveBeenCalled(); expect(error).toHaveBeenCalled();
    decide(true); await new Promise((resolve) => setTimeout(resolve, 0)); expect(submit).toHaveBeenCalledTimes(1);
  });
  it("does not dispatch a composite ZIP when its session changes during review", async () => {
    let decide!: (value: boolean) => void; const epoch = { current: 0 }, submit = vi.fn(), setError = vi.fn();
    const composite = callback("handleSubmitComposite", { withPreparing: (work: () => unknown) => work(), dropSessionEpoch: epoch, user: { id: "owner" }, zipReview: { check: () => new Promise<boolean>((resolve) => { decide = resolve; }), capture: () => 0, owns: () => true, remember: vi.fn() }, ensureSession: vi.fn(async () => true), driver: { submit }, sessionRefusalRef: { current: "refused" }, setSubmitError: setError });
    const pending = composite("Student", [{ kind: "file", file: new File(["zip"], "class.zip") }]); epoch.current++; decide(true);
    expect((await pending).kind).toBe("refused"); expect(submit).not.toHaveBeenCalled(); expect(setError).not.toHaveBeenCalled();
  });
  it("discloses unknown URL and LMS comparisons without blocking ordinary submissions", async () => {
    const epoch = { current: 0 }, submit = vi.fn(async () => ({ kind: "accepted", entryCount: 1 })), rememberUnknown = vi.fn(), noteUnknown = vi.fn();
    const route = callback("handleSubmitUrl", { withPreparing: (work: () => unknown) => work(), dropSessionEpoch: epoch, user: { id: "owner" }, zipReview: { noteUnknown, capture: () => 0, owns: () => true, rememberUnknown }, ensureSession: vi.fn(async () => true), driver: { submit }, sessionRefusalRef: { current: "refused" }, setSubmitError: vi.fn() });
    expect((await route("https://canvas.example/courses/1/assignments/2")).kind).toBe("accepted");
    expect(noteUnknown).toHaveBeenCalledTimes(1); expect(submit).toHaveBeenCalledTimes(1); expect(rememberUnknown).toHaveBeenCalledTimes(1);
  });
  it("discloses URL-only text inside a composite without blocking it", async () => {
    const submit = vi.fn(async () => ({ kind: "accepted", entryCount: 1 })), epoch = { current: 0 }, check = vi.fn(async (_files: readonly File[], _current: () => boolean, _unknown: boolean) => true), noteUnknown = vi.fn();
    const composite = callback("handleSubmitComposite", { withPreparing: (work: () => unknown) => work(), dropSessionEpoch: epoch, user: { id: "owner" }, zipReview: { check, noteUnknown, capture: () => 0, owns: () => true, remember: vi.fn(), rememberUnknown: vi.fn() }, pastedSubmissionUrl, ensureSession: vi.fn(async () => true), driver: { submit }, sessionRefusalRef: { current: "refused" }, setSubmitError: vi.fn() });
    expect((await composite("Student", [{ kind: "text", content: "https://drive.google.com/file/d/abc/view" }])).kind).toBe("accepted");
    expect(check.mock.calls[0][2]).toBe(false); expect(noteUnknown).toHaveBeenCalledTimes(1); expect(submit).toHaveBeenCalledTimes(1);
  });
  it("discloses a URL-only composer message and remembers it without blocking ordinary text", async () => {
    const epoch = { current: 0 }, submit = vi.fn(async () => ({ kind: "accepted", entryCount: 1 })), noteUnknown = vi.fn(), rememberUnknown = vi.fn();
    const route = callback("handleSubmitText", { withPreparing: (work: () => unknown) => work(), dropSessionEpoch: epoch, user: { id: "owner" }, zipReview: { noteUnknown, rememberUnknown, capture: () => 0, owns: () => true }, pastedSubmissionUrl, ensureSession: vi.fn(async () => true), driver: { submit }, setSubmitError: vi.fn() });
    await route("An ordinary essay", "Student"); expect(submit).toHaveBeenCalledTimes(1); expect(noteUnknown).not.toHaveBeenCalled();
    await route("https://drive.google.com/file/d/abc/view", "Student"); expect(submit).toHaveBeenCalledTimes(2); expect(noteUnknown).toHaveBeenCalledTimes(1); expect(rememberUnknown).toHaveBeenCalledTimes(1);
  });
  it.each(["resolving", "ready", "preparing"])("Clear all and length toggle preserve visible/frozen policy during %s", async (mode) => {
    resetSessionDiagnosticLogForTests("2026-10-25T00:00:00Z");
    const ready = { kind: "ok", effectiveRubric: "RUBRIC", rubricFingerprint: "fixed", criteriaNames: [], rubricUsed: "provided" };
    let finish!: (value: typeof ready) => void;
    header.mockResolvedValue(ready); if (mode === "resolving") header.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => result(request.entry.student));
    const useDriver = () => { h.begin(); return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch }); };
    let driver = useDriver(), pending: Promise<boolean> | undefined;
    if (mode === "resolving") pending = setupCallback(driver, "Minimum 500 words", "RUBRIC", "25", true)();
    if (mode === "ready") await setupCallback(driver, "Minimum 500 words", "RUBRIC", "25", true)();
    driver = useDriver(); if (mode === "resolving") expect(driver.headerState).toBe("resolving");
    const controller = createChatFileRolesController({ epoch: driver.runKey, locked: false, draft: { instructions: "Minimum 500 words", rubric: "RUBRIC" }, options: { harshness: "balanced", applyNamingDeduction: true, applyLengthDeduction: true, lengthDeductionThresholdWords: 25 }, start: vi.fn(), submit: vi.fn(), applySetup: vi.fn() });
    const visible = { instructions: "Minimum 500 words", rubric: "RUBRIC", threshold: "25", enabled: true }, persist = vi.fn();
    const change = callback("changeLengthThreshold", { lengthThresholdText: "25", recordLengthDeductionThresholdChange, setLengthThresholdText: (next: string) => { visible.threshold = next; } });
    const bindings = { sessionReady: driver.headerState === "ready", driver, preparing: mode === "preparing", roleIntake: controller.snapshot(),
      setInstructions: (next: string) => { visible.instructions = next; }, setRubric: (next: string) => { visible.rubric = next; }, changeLengthThreshold: change, LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT,
      setApplyLengthDeduction: (next: boolean) => { visible.enabled = next; }, persistApplyLengthDeduction: persist };
    callback("handleClearAll", bindings)(); callback("changeApplyLengthDeduction", bindings)(false);
    expect(visible).toEqual({ instructions: "Minimum 500 words", rubric: "RUBRIC", threshold: "25", enabled: true }); expect(persist).not.toHaveBeenCalled();
    expect(readSessionDiagnosticLogState().entries.filter((entry) => entry.operation === "change_length_deduction_threshold")).toHaveLength(0);
    if (mode === "resolving") { finish(ready); expect(await pending).toBe(true); }
    if (mode === "preparing") { controller.snapshot().cancel(); expect(await setupCallback(useDriver(), visible.instructions, visible.rubric, visible.threshold, visible.enabled)()).toBe(true); }
    await useDriver().submit({ kind: "text", content: "STUDENT", label: "Student" }); expect(dispatch.mock.calls[0][0]).toMatchObject({ applyLengthDeduction: true, lengthDeductionThresholdWords: 25 });
  });
  it("keeps invalid threshold text visible, records valid actual setting changes and Clear all restores one", () => {
    resetSessionDiagnosticLogForTests("2026-10-25T00:00:00Z"); const setLengthThresholdText = vi.fn();
    const change = callback("changeLengthThreshold", { lengthThresholdText: "1", recordLengthDeductionThresholdChange, setLengthThresholdText });
    change("1.5"); expect(setLengthThresholdText).toHaveBeenCalledWith("1.5"); expect(readSessionDiagnosticLogState().entries).toHaveLength(0);
    change("25"); expect(readSessionDiagnosticLogState().entries[0].detail).toEqual({ thresholdWords: 25 });
    const reset = callback("handleClearAll", { sessionReady: false, driver: { headerState: "unset" }, preparing: false, roleIntake: { isPending: () => false }, setInstructions: vi.fn(), setRubric: vi.fn(), changeLengthThreshold: change, LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT });
    reset(); expect(setLengthThresholdText).toHaveBeenLastCalledWith("1");
    const newSession = panel.slice(panel.indexOf("const handleNewSession"), panel.indexOf("// Marks the submit intake")); expect(newSession).not.toContain("setLengthThresholdText"); expect(newSession).not.toContain("changeLengthThreshold");
  });
  it.each(["", "0", "1.5", "1e2", "1000001"])("refuses raw threshold %s before any header or preparation", async (raw) => {
    const dispatch = vi.fn(); h.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
    expect(await setupCallback(driver, "Assignment minimum 500 words", "Rubric", raw, true)()).toBe(false);
    expect(header).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
  });
  it("ignores invalid raw threshold in the actual ordinary Panel session when deduction is off", async () => {
    header.mockResolvedValue({ kind: "ok", effectiveRubric: "RUBRIC", rubricFingerprint: "fixed", criteriaNames: [], rubricUsed: "provided" });
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => result(request.entry.student)); h.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
    expect(await setupCallback(driver, "Assignment", "RUBRIC", "1.5", false)()).toBe(true); await driver.submit({ kind: "text", content: "TEXT", label: "Student" });
    expect(dispatch.mock.calls[0][0]).not.toHaveProperty("lengthDeductionThresholdWords"); expect(header).toHaveBeenCalledTimes(1);
  });
  it.each(["success", "refusal", "throw"])("cancel prevents a pending header %s from publishing and later text uses fresh setup", async (mode) => {
    let finish!: (value: unknown) => void, fail!: (error: Error) => void;
    header.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    header.mockImplementation(async (_instructions: string, rubric: string) => ({ kind: "ok", effectiveRubric: rubric, rubricFingerprint: "fresh", criteriaNames: [], rubricUsed: "provided" }));
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => result(request.entry.student));
    const useDriver = () => { h.begin(); return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch }); };
    let driver = useDriver(); const start = setupCallback(driver, "unused", "unused");
    const controller = createChatFileRolesController({ epoch: driver.runKey, locked: false, draft: { instructions: "CANCELED_INSTRUCTIONS", rubric: "CANCELED_RUBRIC" }, options: { harshness: "balanced", applyNamingDeduction: true, applyLengthDeduction: false },
      start: (setup, current) => start(undefined, setup, current), submit: (file) => driver.submit({ kind: "file", file }), applySetup: vi.fn() });
    controller.snapshot().stage([new File(["student"], "student.txt")]); await controller.snapshot().assign(1, "submission");
    const pending = controller.snapshot().confirm(); expect(useDriver().headerState).toBe("resolving"); controller.snapshot().cancel();
    if (mode === "throw") fail(new Error("CANCELED_THROW")); else finish(mode === "refusal" ? { kind: "refused", error: "CANCELED_REFUSAL" } : { kind: "ok", effectiveRubric: "CANCELED_RUBRIC", rubricFingerprint: "old", criteriaNames: [], rubricUsed: "provided" });
    await pending; driver = useDriver(); expect(driver.headerState).toBe("unset"); expect(driver.sessionError).toBeNull(); expect(driver.effectiveRubric).toBe(""); expect(dispatch).not.toHaveBeenCalled();
    expect(await setupCallback(driver, "FRESH_INSTRUCTIONS", "FRESH_RUBRIC")()).toBe(true);
    await driver.submit({ kind: "text", content: "LATER_TEXT", label: "Later" });
    expect(dispatch).toHaveBeenCalledTimes(1); expect(dispatch.mock.calls[0][0]).toMatchObject({ assignmentInstructions: "FRESH_INSTRUCTIONS", rubric: "FRESH_RUBRIC" });
  });
  it.each(["success", "refusal", "throw"])("canceled old header %s cannot restore over a newer successful attempt", async (mode) => {
    let finish!: (value: unknown) => void, fail!: (error: Error) => void;
    header.mockImplementationOnce(() => new Promise((resolve, reject) => { finish = resolve; fail = reject; }));
    header.mockImplementation(async (_instructions: string, rubric: string) => ({ kind: "ok", effectiveRubric: rubric, rubricFingerprint: "new", criteriaNames: [], rubricUsed: "provided" }));
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => result(request.entry.student));
    const useDriver = () => { h.begin(); return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch }); };
    const driver = useDriver(), start = setupCallback(driver, "unused", "unused");
    const controller = createChatFileRolesController({ epoch: driver.runKey, locked: false, draft: { instructions: "OLD_INSTRUCTIONS", rubric: "OLD_RUBRIC" }, options: { harshness: "balanced", applyNamingDeduction: true, applyLengthDeduction: false },
      start: (setup, current) => start(undefined, setup, current), submit: (file) => driver.submit({ kind: "file", file }), applySetup: vi.fn() });
    controller.snapshot().stage([new File(["student"], "student.txt")]); await controller.snapshot().assign(1, "submission");
    const pending = controller.snapshot().confirm(); controller.snapshot().cancel();
    expect(await setupCallback(useDriver(), "NEW_INSTRUCTIONS", "NEW_RUBRIC")()).toBe(true);
    if (mode === "throw") fail(new Error("OLD_THROW")); else finish(mode === "refusal" ? { kind: "refused", error: "OLD_REFUSAL" } : { kind: "ok", effectiveRubric: "OLD_RUBRIC", rubricFingerprint: "old", criteriaNames: [], rubricUsed: "provided" });
    await pending; const latest = useDriver(); expect(latest.headerState).toBe("ready"); expect(latest.sessionError).toBeNull(); expect(latest.effectiveRubric).toBe("NEW_RUBRIC");
    await latest.submit({ kind: "text", content: "NEW_TEXT", label: "New" }); expect(dispatch.mock.calls[0][0]).toMatchObject({ assignmentInstructions: "NEW_INSTRUCTIONS", rubric: "NEW_RUBRIC" });
  });
  it("cancel in an established ready session preserves its frozen setup and grades", async () => {
    header.mockResolvedValue({ kind: "ok", effectiveRubric: "EXISTING_RUBRIC", rubricFingerprint: "existing", criteriaNames: [], rubricUsed: "provided" });
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => result(request.entry.student));
    const useDriver = () => { h.begin(); return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch }); };
    const driver = useDriver(); await driver.beginSession({ assignmentInstructions: "EXISTING_INSTRUCTIONS", rubric: "EXISTING_RUBRIC" });
    await driver.submit({ kind: "text", content: "FIRST", label: "First" }); await new Promise((resolve) => setTimeout(resolve, 0));
    const before = useDriver(), start = setupCallback(before, "IGNORED", "IGNORED"); let finish!: () => void;
    const controller = createChatFileRolesController({ epoch: before.runKey, locked: true, draft: { instructions: "IGNORED", rubric: "IGNORED" }, options: { harshness: "balanced", applyNamingDeduction: true, applyLengthDeduction: false },
      start: (setup, current) => start(undefined, setup, current), submit: () => new Promise((resolve) => { finish = () => resolve({ kind: "accepted", entryCount: 1 }); }), applySetup: vi.fn() });
    controller.snapshot().stage([new File(["student"], "student.txt")]); await controller.snapshot().assign(1, "submission");
    const pending = controller.snapshot().confirm(); await Promise.resolve(); controller.snapshot().cancel(); finish(); await pending;
    const after = useDriver(); expect(after.headerState).toBe("ready"); expect(after.results).toEqual(before.results); expect(after.results).toHaveLength(1); expect(header).toHaveBeenCalledTimes(1);
    await after.submit({ kind: "text", content: "SECOND", label: "Second" }); expect(dispatch.mock.calls[1][0]).toMatchObject({ assignmentInstructions: "EXISTING_INSTRUCTIONS", rubric: "EXISTING_RUBRIC" });
  });
  it.each(["combined", "blank-rubric"])("freezes %s setup and reuses it for a later text submission", async (mode) => {
    header.mockImplementation(async (_instructions: string, rubric: string) => ({ kind: "ok", effectiveRubric: rubric || "GENERATED_RUBRIC", generatedRubric: rubric ? undefined : "GENERATED_RUBRIC", rubricFingerprint: "fixture", criteriaNames: [], rubricUsed: rubric ? "provided" : "generated" }));
    prepare.mockResolvedValue({ kind: "entries", entries: [{ student: "Student", content: "STUDENT", submittedFiles: [], mergedFileCount: 0 }], pointsPossible: 20 });
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => result(request.entry.student));
    h.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
    const start = callback("ensureSession", { driver, sessionRefusalRef: { current: "refused" }, setSubmitError: vi.fn() });
    const options = { harshness: "balanced" as const, applyNamingDeduction: false, applyLengthDeduction: false };
    const controller = createChatFileRolesController({ epoch: driver.runKey, locked: false, draft: { instructions: "", rubric: "" }, options,
      start: (setup, current) => start(undefined, setup, current), submit: (file) => driver.submit({ kind: "file", file }), applySetup: vi.fn() });
    controller.snapshot().stage([new File(["COMPLETE_SETUP_SENTINEL"], "setup.txt"), new File(["student"], "student.txt")]);
    await controller.snapshot().assign(1, mode === "combined" ? "combined" : "instructions"); await controller.snapshot().assign(2, "submission");
    expect(controller.snapshot().resolved.generationNotice).toBe(mode === "blank-rubric"); expect(header).not.toHaveBeenCalled();
    await controller.snapshot().confirm(); await driver.submit({ kind: "text", content: "LATER_TEXT", label: "Later" });
    expect(header).toHaveBeenCalledTimes(1); expect(header.mock.calls[0][1]).toBe(mode === "combined" ? "COMPLETE_SETUP_SENTINEL" : "");
    for (const [request] of dispatch.mock.calls) {
      expect(request).toMatchObject({ assignmentInstructions: "COMPLETE_SETUP_SENTINEL", rubric: mode === "combined" ? "COMPLETE_SETUP_SENTINEL" : "GENERATED_RUBRIC", applyNamingDeduction: false });
      expect(request.harshness ?? "balanced").toBe("balanced"); expect(request.applyLengthDeduction ?? false).toBe(false);
    }
  });
  it("confirms recording and cleans a canceled upload before it can submit", async () => {
    const confirmRecordingSplit = vi.fn(() => ({ kind: "accepted", entryCount: 1 })), setSubmitError = vi.fn();
    const reportSplitOutcome = vi.fn();
    const confirm = callback("handleConfirmSplit", { driver: { confirmRecordingSplit }, setSubmitError, reportSplitOutcome });
    confirm(); expect(confirmRecordingSplit).toHaveBeenCalledOnce(); expect(reportSplitOutcome).toHaveBeenCalledWith({ kind: "accepted", entryCount: 1 });
    let finish!: (value: { ok: true; storagePath: string }) => void, current = true;
    const upload = vi.fn(() => new Promise((resolve) => { finish = resolve; })), remove = vi.fn(async () => {}), submit = vi.fn();
    const consume = callback("submitStoragedZip", { user: { id: "owner" }, supabase: { storage: {} }, setZipPhase: vi.fn(), uploadGradingZip: upload, driver: { submit }, deleteGradingZipBestEffort: remove, safeIntake: vi.fn(), recordIntakeGate: vi.fn() });
    const pending = consume(new File(["zip"], "class.zip"), () => current); current = false; finish({ ok: true, storagePath: "temporary-upload" }); await pending;
    expect(remove).toHaveBeenCalledTimes(1); expect(submit).not.toHaveBeenCalled();
  });
  it("confirms one literal setup before class ZIP extraction and gives duplicate-name students distinct keys with the same frozen options", async () => {
    header.mockImplementation(async (_instructions: string, rubric: string) => ({ kind: "ok", effectiveRubric: rubric, rubricFingerprint: "fixture", criteriaNames: [], rubricUsed: "provided" }));
    prepare.mockResolvedValue({ kind: "entries", entries: [{ student: "Taylor", content: "STUDENT_ONE", submittedFiles: [], mergedFileCount: 0 }, { student: "Taylor", content: "STUDENT_TWO", submittedFiles: [], mergedFileCount: 0 }], pointsPossible: 20 });
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => result(request.entry.student));
    h.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
    const start = callback("ensureSession", { driver, sessionRefusalRef: { current: "refused" }, setSubmitError: vi.fn() });
    const video = vi.fn(async () => null), upload = vi.fn();
    const consume = callback("handleConfirmedFiles", { driver, zipReview: { check: async () => true, capture: () => 0, owns: () => true, remember: vi.fn() }, submitFilesSequentially, submitLooseVideo: video, user: { id: "owner" }, supabase: { storage: {} }, VIDEO_GRADING_ENABLED: false,
      isZipFileName: (name: string) => name.endsWith(".zip"), chooseZipTransport: () => ({ kind: "body" }), chooseSingleFileTransport: () => ({ kind: "body" }), preflightUploadFile: () => ({ ok: true }),
      safeIntake: (fn: () => void) => fn(), recordIntakeGate: vi.fn(), submitStoragedZip: upload, submitStoragedSingleFile: upload, sessionRefusalRef: { current: "refused" }, setSubmitError: vi.fn() });
    const options = { harshness: "strict" as const, feedbackWordTarget: 80, applyNamingDeduction: false, applyLengthDeduction: true, lengthDeductionThresholdWords: 25 };
    const controller = createChatFileRolesController({ epoch: driver.runKey, locked: false, draft: { instructions: "STALE_DRAFT", rubric: "STALE_RUBRIC" }, options,
      start: (setup, current) => start(undefined, setup, current), submit: async (file, label, current) => (await consume([file], label, current))[0], applySetup: vi.fn() });
    const instructions = new File(["ASSIGNMENT_ONLY_SENTINEL"], "assignment.txt"), rubric = new File(["Correctness (12 pts): Required behavior.\nStyle (8 pts): Clear structure."], "rubric.txt"), zip = new File(["ZIP"], "class.zip");
    controller.snapshot().stage([instructions, rubric, zip]); expect(header).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled(); expect(dispatch).not.toHaveBeenCalled();
    await controller.snapshot().assign(1, "instructions"); await controller.snapshot().assign(2, "rubric"); await controller.snapshot().assign(3, "submission"); controller.snapshot().choose("instructions", "file"); controller.snapshot().choose("rubric", "file");
    expect(header).not.toHaveBeenCalled(); expect(video).not.toHaveBeenCalled();
    await Promise.all([controller.snapshot().confirm(), controller.snapshot().confirm()]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(header).toHaveBeenCalledTimes(1); expect(header.mock.calls[0]).toEqual(["ASSIGNMENT_ONLY_SENTINEL", "Correctness (12 pts): Required behavior.\nStyle (8 pts): Clear structure.", "gemini"]);
    expect(prepare).toHaveBeenCalledTimes(1); expect((prepare.mock.calls[0][0] as FormData).get("file")).toBe(zip);
    expect(dispatch).toHaveBeenCalledTimes(2); expect(dispatch.mock.calls.map(([request]) => [request.sourceIndex, request.entry.student])).toEqual([[0, "Taylor"], [1, "Taylor (2)"]]);
    for (const [request] of dispatch.mock.calls) expect(request).toMatchObject({ assignmentInstructions: "ASSIGNMENT_ONLY_SENTINEL", rubric: "Correctness (12 pts): Required behavior.\nStyle (8 pts): Clear structure.", ...options });
    options.lengthDeductionThresholdWords = 99;
    await driver.beginSession({ assignmentInstructions: "CHANGED", rubric: "CHANGED", applyLengthDeduction: true, lengthDeductionThresholdWords: 99 });
    await driver.submit({ kind: "text", content: "LATER_TEXT", label: "Later" }); await new Promise((resolve) => setTimeout(resolve, 0)); driver.regrade("Taylor"); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dispatch).toHaveBeenCalledTimes(4); for (const [request] of dispatch.mock.calls) expect(request.lengthDeductionThresholdWords).toBe(25);
  });
  it.each(["single", "multiple", "zip"])("actual direct router reaches existing transport and frozen driver: %s", async (mode) => {
    header.mockImplementation(async (_instructions: string, rubric: string) => ({ kind: "ok", effectiveRubric: rubric, rubricFingerprint: "fixture", criteriaNames: [], rubricUsed: "provided" }));
    prepare.mockResolvedValue({ kind: "entries", entries: [{ student: "Student", content: "STUDENT", submittedFiles: [], mergedFileCount: 0 }], pointsPossible: 20 });
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => result(request.entry.student));
    const useDriver = () => { h.begin(); return useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch }); };
    let driver = useDriver(); const stage = vi.fn(), intake = createDirectFileIntake();
    const route = (instructions: string) => {
      const start = callback("ensureSession", { driver, sessionRefusalRef: { current: "refused" }, setSubmitError: vi.fn() });
      const consume = callback("handleConfirmedFiles", { driver, zipReview: { check: async () => true, capture: () => 0, owns: () => true, remember: vi.fn() }, submitFilesSequentially, submitLooseVideo: vi.fn(async () => null), user: { id: "owner" }, supabase: { storage: {} }, VIDEO_GRADING_ENABLED: false,
        isZipFileName: (name: string) => name.endsWith(".zip"), chooseZipTransport: () => ({ kind: "body" }), chooseSingleFileTransport: () => ({ kind: "body" }), preflightUploadFile: () => ({ ok: true }),
        safeIntake: (fn: () => void) => fn(), recordIntakeGate: vi.fn(), submitStoragedZip: vi.fn(), submitStoragedSingleFile: vi.fn(), sessionRefusalRef: { current: "refused" }, setSubmitError: vi.fn() });
      return callback("handleSubmitFiles", { directIntake: { current: intake }, preparing: false, driver, oversizedReviewCandidate, setReviewFile: vi.fn(), roleIntake: { isPending: () => false, stage }, includeSetupFiles: false,
        setDirectPreparing: vi.fn(), setPreparing: vi.fn(), setSubmitError: vi.fn(), instructions, rubric: "FROZEN_RUBRIC", harshness: "strict", feedbackLengthText: "80", coerceFeedbackWordTarget: Number,
        applyNamingDeduction: false, applyLengthDeduction: true, lengthThresholdText: "25", parseLengthDeductionThreshold, ensureSession: start, handleConfirmedFiles: consume });
    };
    const files = mode === "multiple" ? [new File(["ONE"], "same.docx"), new File(["TWO"], "same.docx")] : [new File(["ONE"], mode === "zip" ? "class.zip" : "student.pdf")];
    await route("FROZEN_ASSIGNMENT")(files, "Single label"); expect(stage).not.toHaveBeenCalled(); expect(header).toHaveBeenCalledOnce();
    expect(prepare.mock.calls.map((call) => (call[0] as FormData).get("file"))).toEqual(files);
    for (const [request] of dispatch.mock.calls) expect(request).toMatchObject({ assignmentInstructions: "FROZEN_ASSIGNMENT", harshness: "strict", feedbackWordTarget: 80, applyNamingDeduction: false, lengthDeductionThresholdWords: 25 });
    driver = useDriver(); await route("CHANGED_ASSIGNMENT")([new File(["LATER"], "later.pdf")]); expect(header).toHaveBeenCalledOnce();
    expect(dispatch.mock.calls.at(-1)?.[0].assignmentInstructions).toBe("FROZEN_ASSIGNMENT");
  });
  it("routes loose-file entry points directly and removes setup-file review controls", () => {
    expect(panel).not.toContain("Include assignment or rubric files"); expect(panel).not.toContain("roleIntake.stage");
    expect(panel).toContain("claimIntake(sharedIntakeLatch)"); expect(panel).toContain("handleSubmitFiles(files).finally"); expect(panel).toContain("handleSubmitFiles(files, label, undefined, undefined, undefined, false, mode)");
    expect(panel).not.toContain("<ChatFileRolePreview"); expect(panel).toContain("disabled={busy || preparing}");
    expect(panel).toContain('label="Deduct when at least N words below the minimum"'); expect(panel).toContain("disabled={!applyLengthDeduction || sessionReady || busy || preparing}");
    expect(panel).toContain('aria-label="Clear all setup fields" disabled={sessionReady || busy || preparing}');
    expect(panel).toContain('value={lengthThresholdText}'); expect(panel).toContain('inputMode: "numeric"');
  });
});
  it("does not dispatch two concurrent calls from one ZIP action", async () => {
    const records = new Map<string,string>(); const storage = { get length(){return records.size}, key:(i:number)=>[...records.keys()][i]??null,getItem:(k:string)=>records.get(k)??null,setItem:(k:string,v:string)=>{records.set(k,v)} };
    vi.stubGlobal("navigator", {locks:{request:async (_key:string,_options:unknown,work:(lock:object)=>Promise<unknown>)=>work({})}});vi.stubGlobal("crypto",webcrypto);vi.stubGlobal("localStorage",storage);
    let settle!: (value: {kind:"accepted"}[])=>void; const submitted=vi.fn(()=>new Promise<{kind:"accepted"}[]>((resolve)=>{settle=resolve}));
    const run=callback("handlePartialHandoff",{createPartialHandoffHandler,sharedIntakeLatch:{busy:false,generation:0},dropSessionEpoch:{current:0},user:{id:"owner"},zipReview:{capture:()=>0,owns:()=>true},setPartialOmissions:vi.fn(),setPartialRecords:vi.fn(),handleSubmitFiles:submitted});
    const args=[new File(["source"],"source.zip"),new File(["subset"],"subset.zip"),[{label:"student",members:[{path:"work.txt"}]}],[],{student:"Student"}] as const;
    const first=run(...args);expect(await run(...args)).toMatch(/wait for the current submission/i);await vi.waitFor(()=>expect(submitted).toHaveBeenCalledOnce());settle([{kind:"accepted"}]);expect(await first).toBeNull();vi.unstubAllGlobals();
  });
  it("refuses only concurrently active cross-tab submissions and allows a later explicit retry", async () => {
    const records=new Map<string,string>(),storage={get length(){return records.size},key:(i:number)=>[...records.keys()][i]??null,getItem:(k:string)=>records.get(k)??null,setItem:(k:string,v:string)=>{records.set(k,v)}};let locked=false;
    const locks={request:async (_key:string,_options:unknown,work:(lock:object|null)=>Promise<unknown>)=>{if(locked)return work(null);locked=true;try{return await work({})}finally{locked=false}}};
    vi.stubGlobal("navigator",{locks});vi.stubGlobal("crypto",webcrypto);vi.stubGlobal("localStorage",storage);
    let finish!: (v:{kind:"accepted"}[])=>void;const submit=vi.fn().mockImplementationOnce(()=>new Promise((resolve)=>{finish=resolve})).mockResolvedValue([{kind:"accepted"}]);
    const make=()=>callback("handlePartialHandoff",{createPartialHandoffHandler,sharedIntakeLatch:{busy:false,generation:0},dropSessionEpoch:{current:0},user:{id:"owner"},zipReview:{capture:()=>0,owns:()=>true},setPartialOmissions:vi.fn(),setPartialRecords:vi.fn(),handleSubmitFiles:submit});const first=make(),second=make(),args=[new File(["source"],"source.zip"),new File(["subset"],"subset.zip"),[{label:"student",members:[{path:"work.txt"}]}],[],{student:"Student"}] as const;
    const pending=first(...args);await vi.waitFor(()=>expect(submit).toHaveBeenCalledOnce());expect(await second(...args)).toMatch(/another submission.*in progress/i);finish([{kind:"accepted"}]);expect(await pending).toBeNull();expect(await second(...args)).toBeNull();expect(submit).toHaveBeenCalledTimes(2);vi.unstubAllGlobals();
  });
  it("returns exact indices only for the explicitly reviewed ZIP admission", async () => {
    header.mockImplementation(async (_instructions: string,rubric:string)=>({kind:"ok",effectiveRubric:rubric,rubricFingerprint:"fixture",criteriaNames:[],rubricUsed:"provided"}));
    prepare.mockResolvedValue({kind:"entries",entries:[{student:"Student",content:"NEW",submittedFiles:[],mergedFileCount:0}],pointsPossible:10});const dispatch=vi.fn(async(request:GradeRunItemRequestBody)=>result(request.entry.student));h.begin();const driver=useContinuousGradingRun({provider:"gemini",dispatchItem:dispatch});
    await driver.beginSession({assignmentInstructions:"Assignment",rubric:"Rubric"});await driver.submit({kind:"text",label:"Earlier",content:"OLD"});const outcome=await driver.submit({kind:"file",file:new File(["zip"],"class.zip"),captureSourceIndices:true});expect(outcome).toMatchObject({kind:"accepted",sourceIndices:[1]}); await vi.waitFor(()=>expect(dispatch).toHaveBeenCalledTimes(2)); await new Promise((resolve)=>setTimeout(resolve,0)); h.begin();const rendered=useContinuousGradingRun({provider:"gemini",dispatchItem:dispatch}); expect(rendered.run?.results.map((row)=>rendered.getVersionedResult(row)?.sourceIndex)).toEqual([0,1]);
  });
  it("does not prompt for a duplicate after an explicit ZIP review selection", async () => {
    const check=vi.fn(async()=>false),submit=vi.fn(async(input:unknown)=>{void input;return {kind:"accepted",entryCount:1,sourceIndices:[4]}});const consume=callback("handleConfirmedFiles",{driver:{submit,pendingVideoCount:()=>0},zipReview:{check,capture:()=>0,owns:()=>true,remember:vi.fn()},submitFilesSequentially,submitLooseVideo:vi.fn(async()=>null),user:{id:"owner"},supabase:{storage:{}},VIDEO_GRADING_ENABLED:false,isZipFileName:(n:string)=>n.endsWith(".zip"),chooseZipTransport:()=>({kind:"body"}),chooseSingleFileTransport:()=>({kind:"body"}),preflightUploadFile:()=>({ok:true}),safeIntake:(fn:()=>void)=>fn(),recordIntakeGate:vi.fn(),submitStoragedZip:vi.fn(),submitStoragedSingleFile:vi.fn(),setSubmitError:vi.fn()});
    const result=await consume([new File(["zip"],"reviewed.zip")],undefined,()=>true,{"work.txt":"Student"},undefined,undefined,true);expect(check).not.toHaveBeenCalled();expect(result[0]).toMatchObject({kind:"accepted",sourceIndices:[4]});expect(submit.mock.calls[0][0]).toMatchObject({captureSourceIndices:true});
  });
  it("carries the expected owner session through reviewed intake and queued grading", async () => {
    const expectedOwnerSession = { accountId: "11111111-1111-4111-8111-111111111111", sessionId: "22222222-2222-4222-8222-222222222222" };
    header.mockImplementation(async (_instructions: string, rubric: string) => ({ kind: "ok", effectiveRubric: rubric, rubricFingerprint: "fixture", criteriaNames: [], rubricUsed: "provided" }));
    prepare.mockResolvedValue({ kind: "entries", entries: [{ student: "Student", content: "work", submittedFiles: [], mergedFileCount: 0 }], pointsPossible: 10 });
    const dispatch = vi.fn(async (request: GradeRunItemRequestBody) => result(request.entry.student)); h.begin(); const driver = useContinuousGradingRun({ provider: "gemini", dispatchItem: dispatch });
    await driver.beginSession({ assignmentInstructions: "Assignment", rubric: "Rubric" });
    const consume = callback("handleConfirmedFiles", { driver, zipReview: { check: async () => true, capture: () => 0, owns: () => true, remember: vi.fn() }, submitFilesSequentially, submitLooseVideo: vi.fn(async () => null), user: { id: expectedOwnerSession.accountId }, supabase: { storage: {} }, VIDEO_GRADING_ENABLED: false, isZipFileName: (name: string) => name.endsWith(".zip"), chooseZipTransport: () => ({ kind: "body" }), chooseSingleFileTransport: () => ({ kind: "body" }), preflightUploadFile: () => ({ ok: true }), safeIntake: (fn: () => void) => fn(), recordIntakeGate: vi.fn(), submitStoragedZip: vi.fn(), submitStoragedSingleFile: vi.fn(), setSubmitError: vi.fn() });
    await consume([new File(["zip"], "reviewed.zip")], undefined, () => true, { "work.txt": "Student" }, undefined, undefined, true, undefined, expectedOwnerSession);
    expect((prepare.mock.calls[0][0] as FormData).get("expectedOwnerSession")).toBe(JSON.stringify(expectedOwnerSession));
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce()); expect(dispatch.mock.calls[0][0].expectedOwnerSession).toEqual(expectedOwnerSession);
  });

it("records a proven nested intake refusal separately from an uncertain handoff", async () => {
  const records = new Map<string, string>(); const storage = { get length() { return records.size; }, key: (i: number) => [...records.keys()][i] ?? null, getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } };
  vi.stubGlobal("navigator", { locks: { request: async (_key: string, _options: unknown, work: (lock: object) => Promise<unknown>) => work({}) } }); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("localStorage", storage);
  try {
    const onRefused = vi.fn(), submitted = vi.fn(async () => [{ kind: "refused", reason: "Submission is too large. Nothing was graded." }]);
    const run = callback("handlePartialHandoff", { createPartialHandoffHandler, sharedIntakeLatch: { busy: false, generation: 0 }, dropSessionEpoch: { current: 0 }, user: { id: "owner" }, zipReview: { capture: () => 0, owns: () => true }, setPartialOmissions: vi.fn(), setPartialRecords: vi.fn(), handleSubmitFiles: submitted });
    const group = { label: "100-200", members: [{ path: "100-200 - Project-Student-Nov 5, 2026 400 PM.zip" }] };
    const project = { mappedPaths: ["100-200 - Project-Student-Nov 5, 2026 400 PM.zip/src/main.cpp"], excludedPaths: ["100-200 - Project-Student-Nov 5, 2026 400 PM.zip/Debug/main.obj"] };
    expect(await run(new File(["source"], "source.zip"), new File(["subset"], "subset.zip"), [group], [], { "100-200": "Student" }, { current: () => true, onProgress: vi.fn(), onRefused }, project)).toContain("too large");
    expect(onRefused).toHaveBeenCalledOnce(); expect([...records.values()].map((v) => JSON.parse(v).status)).toEqual(["refused"]);
    expect(submitted).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});

it("binds nested omissions to the correct student in a mixed batch", async () => {
  const records = new Map<string, string>(), storage = { get length() { return records.size; }, key: (i: number) => [...records.keys()][i] ?? null, getItem: (key: string) => records.get(key) ?? null, setItem: (key: string, value: string) => { records.set(key, value); } };
  vi.stubGlobal("navigator", { locks: { request: async (_key: string, _options: unknown, work: (lock: object) => Promise<unknown>) => work({}) } }); vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("localStorage", storage);
  try {
    const submitted = vi.fn(async () => [{ kind: "accepted" }]);
    const run = callback("handlePartialHandoff", { createPartialHandoffHandler, sharedIntakeLatch: { busy: false, generation: 0 }, dropSessionEpoch: { current: 0 }, user: { id: "owner" }, zipReview: { capture: () => 0, owns: () => true }, setPartialOmissions: vi.fn(), setPartialRecords: vi.fn(), handleSubmitFiles: submitted });
    const groups = [{ label: "100-200", members: [{ path: "100-200 - project.zip", nestedArchive: true }] }, { label: "101-201", members: [{ path: "101-201 - essay.txt", nestedArchive: false }] }];
    const projects = { "100-200": { mappedPaths: ["100-200 - project.zip/main.cpp"], excludedPaths: ["100-200 - project.zip/build.obj"] } };
    expect(await run(new File(["source"], "source.zip"), new File(["subset"], "subset.zip"), groups, [], { "100-200": "Ada", "101-201": "Lin" }, { current: () => true, onProgress: vi.fn(), projects })).toBeNull();
    expect(submitted).toHaveBeenCalledWith([expect.any(File)], undefined, { "100-200 - project.zip/main.cpp": "Ada", "101-201 - essay.txt": "Lin" }, undefined, undefined, true, undefined, [{ student: "Ada", omissions: ["100-200 - project.zip/build.obj"], staticOnly: true }, { student: "Lin", omissions: [], staticOnly: false }], undefined);
    expect([...records.values()].map((value) => JSON.parse(value).omitted)).toEqual([[{ student: "100-200", files: ["100-200 - project.zip/build.obj"], reason: "build artifact or verified course dataset excluded from grading" }]]);
  } finally { vi.unstubAllGlobals(); }
});
