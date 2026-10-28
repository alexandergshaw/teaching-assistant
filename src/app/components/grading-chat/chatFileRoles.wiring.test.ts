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
import { resolveSetupFill } from "./chatSetupFill";
import { applyOverride, computeOverrideOffer, countOverriddenFields } from "./chatOverrideOffer";
import { LENGTH_THRESHOLD_ERROR, parseLengthDeductionThreshold, recordLengthDeductionThresholdChange } from "./chatLengthDeduction";
import { LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT } from "@/lib/grade/length-deduction-policy";
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
  it.each(["resolving", "ready", "preparing", "role-preview"])("Clear all and length toggle preserve visible/frozen policy during %s", async (mode) => {
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
    if (mode === "role-preview") controller.snapshot().stage([new File(["student"], "student.txt")]);
    const visible = { instructions: "Minimum 500 words", rubric: "RUBRIC", threshold: "25", enabled: true }, persist = vi.fn();
    const change = callback("changeLengthThreshold", { lengthThresholdText: "25", recordLengthDeductionThresholdChange, setLengthThresholdText: (next: string) => { visible.threshold = next; } });
    const bindings = { sessionReady: driver.headerState === "ready", driver, preparing: mode === "preparing", roleIntake: controller.snapshot(),
      setInstructions: (next: string) => { visible.instructions = next; }, setRubric: (next: string) => { visible.rubric = next; }, changeLengthThreshold: change, LENGTH_DEDUCTION_THRESHOLD_WORDS_DEFAULT,
      setApplyLengthDeduction: (next: boolean) => { visible.enabled = next; }, persistApplyLengthDeduction: persist };
    callback("handleClearAll", bindings)(); callback("changeApplyLengthDeduction", bindings)(false);
    expect(visible).toEqual({ instructions: "Minimum 500 words", rubric: "RUBRIC", threshold: "25", enabled: true }); expect(persist).not.toHaveBeenCalled();
    expect(readSessionDiagnosticLogState().entries.filter((entry) => entry.operation === "change_length_deduction_threshold")).toHaveLength(0);
    if (mode === "resolving") { finish(ready); expect(await pending).toBe(true); }
    if (mode === "preparing" || mode === "role-preview") { controller.snapshot().cancel(); expect(await setupCallback(useDriver(), visible.instructions, visible.rubric, visible.threshold, visible.enabled)()).toBe(true); }
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
  it("blocks competing recording confirmation and cleans a canceled upload before it can submit", async () => {
    const confirmRecordingSplit = vi.fn(() => ({ kind: "accepted", entryCount: 1 })), setSubmitError = vi.fn();
    const confirm = callback("handleConfirmSplit", { roleIntake: { isPending: () => true }, driver: { confirmRecordingSplit }, setSubmitError, reportSplitOutcome: vi.fn() });
    confirm(); expect(confirmRecordingSplit).not.toHaveBeenCalled(); expect(setSubmitError).toHaveBeenCalledWith("Finish or cancel the file preview before grading this recording.");
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
    const consume = callback("handleConfirmedFiles", { driver, submitFilesSequentially, submitLooseVideo: video, user: { id: "owner" }, supabase: { storage: {} }, VIDEO_GRADING_ENABLED: false,
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
      const consume = callback("handleConfirmedFiles", { driver, submitFilesSequentially, submitLooseVideo: vi.fn(async () => null), user: { id: "owner" }, supabase: { storage: {} }, VIDEO_GRADING_ENABLED: false,
        isZipFileName: (name: string) => name.endsWith(".zip"), chooseZipTransport: () => ({ kind: "body" }), chooseSingleFileTransport: () => ({ kind: "body" }), preflightUploadFile: () => ({ ok: true }),
        safeIntake: (fn: () => void) => fn(), recordIntakeGate: vi.fn(), submitStoragedZip: vi.fn(), submitStoragedSingleFile: vi.fn(), sessionRefusalRef: { current: "refused" }, setSubmitError: vi.fn() });
      return callback("handleSubmitFiles", { directIntake: { current: intake }, preparing: false, driver, roleIntake: { isPending: () => false, stage }, includeSetupFiles: false,
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
  it("pins both loose-file entry points to the shared direct-or-preview router, guards other inputs and retains accessible preview", () => {
    expect(panel).toContain("useState(false)"); expect(panel).toContain("if (includeSetupFiles && !blocked)"); expect(panel).toContain("Include assignment or rubric files");
    expect(panel).toContain("roleIntake.stage(files, label)"); expect(panel).toContain("if (files.length > 0) handleSubmitFiles(files)"); expect(panel).toContain("onSubmitFiles={handleSubmitFiles}");
    expect(panel.match(/if \(roleIntake.isPending\(\)\) return/g)).toHaveLength(3); expect(panel).toContain("disabled={busy || preparing || roleIntake.pending}"); expect(panel).toContain("<ChatFileRolePreview intake={roleIntake}");
    const ui = readFileSync("src/app/components/grading-chat/ChatFileRolePreview.tsx", "utf8"); expect(ui).toContain("Confirm roles and grade"); expect(ui).toContain("Use setup"); expect(ui).toContain("Cancel file preview"); expect(ui).toContain("readOnly value={intake.resolved.effective[field]}");
    expect(panel).toContain('label="Deduct when at least N words below the minimum"'); expect(panel).toContain("disabled={!applyLengthDeduction || sessionReady || busy || preparing || roleIntake.pending}");
    expect(panel).toContain('aria-label="Clear all setup fields" disabled={sessionReady || busy || preparing || roleIntake.pending}');
    expect(panel).toContain('value={lengthThresholdText}'); expect(panel).toContain('inputMode: "numeric"');
  });
});
