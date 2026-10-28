import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createDirectFileIntake } from "./chatDirectFileIntake";
import { ROLE_BYTE_LIMIT, ROLE_FILE_LIMIT } from "./chatFileRoles";
import type { ConfirmedRoleSetup } from "./chatFileRoles";
import type { SubmitOutcome } from "./useContinuousGradingRun";
import * as diagnostic from "./chatFileRoleDiagnostic";

const source = ts.createSourceFile("Panel.tsx", readFileSync("src/app/components/grading-chat/GradingChatPanel.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function actual(name: string, bindings: Record<string, unknown>) {
  let found: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) found = node; ts.forEachChild(node, visit); }; visit(source);
  if (!found) throw new Error(`Missing ${name}`);
  const code = ts.transpileModule(`const ${found.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return ${name}`)(...Object.values(bindings));
}
const file = (name = "student.docx") => new File(["student"], name);
function harness() {
  const intake = createDirectFileIntake(), errors: (string | null)[] = [], busy: boolean[] = [];
  const stage = vi.fn(), start = vi.fn(async (_url?: string, _setup?: ConfirmedRoleSetup, _current?: () => boolean): Promise<boolean> => { void _url; void _setup; void _current; return true; });
  const submit = vi.fn(async (_files: File[], _label?: string, _current?: () => boolean): Promise<SubmitOutcome[]> => { void _files; void _label; void _current; return [{ kind: "accepted", entryCount: 1 }]; });
  const bindings = { directIntake: { current: intake }, preparing: false, driver: { headerState: "unset" }, roleIntake: { isPending: () => false, stage },
    includeSetupFiles: false, setDirectPreparing: vi.fn(), setPreparing: (value: boolean) => busy.push(value), setSubmitError: (value: string | null) => errors.push(value),
    instructions: "Assignment", rubric: "Rubric", harshness: "strict", feedbackLengthText: "80", coerceFeedbackWordTarget: Number,
    applyNamingDeduction: false, applyLengthDeduction: true, lengthThresholdText: "25", parseLengthDeductionThreshold: Number,
    ensureSession: start, handleConfirmedFiles: submit };
  return { intake, errors, busy, stage, start, submit, bindings, route: () => actual("handleSubmitFiles", bindings) };
}
describe("actual Panel direct upload router", () => {
  it.each([{ names: ["student.pdf"] }, { names: ["same.docx", "same.docx"] }, { names: ["class.zip"] }])("grades ordinary files directly: $names", async ({ names }) => {
    const h = harness(), files = names.map((name) => file(name)); await h.route()(files, "One student");
    expect(h.stage).not.toHaveBeenCalled(); expect(h.start).toHaveBeenCalledTimes(1);
    expect(h.start.mock.calls[0]).toEqual([undefined, { instructions: "Assignment", rubric: "Rubric", harshness: "strict", feedbackWordTarget: 80,
      applyNamingDeduction: false, applyLengthDeduction: true, lengthDeductionThresholdWords: 25 }, expect.any(Function)]);
    expect(h.submit.mock.calls.map((call) => call[0])).toEqual(files.map((f) => [f]));
    for (const call of h.submit.mock.calls) expect(call[1]).toBe(files.length === 1 ? "One student" : undefined);
    expect(h.busy).toEqual([true, false]); expect(h.intake.isPending()).toBe(false);
  });
  it("explicit mixed intent stages only and pending preview cannot bypass it", async () => {
    const h = harness(); h.bindings.includeSetupFiles = true; const files = [file("assignment.txt"), file("rubric.txt"), file("class.zip")];
    await h.route()(files); expect(h.stage).toHaveBeenCalledWith(files, undefined); expect(h.start).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled();
    h.bindings.includeSetupFiles = false; h.bindings.roleIntake.isPending = () => true; await h.route()([file()]); expect(h.start).not.toHaveBeenCalled(); expect(h.errors.at(-1)).toContain("Finish or cancel");
  });
  it("holds synchronous admission before awaiting header and snapshots setup", async () => {
    const h = harness(); let finish!: (ready: boolean) => void; h.start.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = h.route()([file()]); h.bindings.instructions = "Changed"; await h.route()([file("second.pdf")]);
    expect(h.start).toHaveBeenCalledTimes(1); expect(h.busy).toEqual([true]); finish(true); await pending; expect(h.submit).toHaveBeenCalledTimes(1);
    expect(h.start.mock.calls[0][1]).toMatchObject({ instructions: "Assignment" }); expect(h.busy).toEqual([true, false]);
  });
  it.each(["refused", "throw"])("releases admission on header %s", async (mode) => {
    const h = harness(); h.start.mockImplementation(async () => { if (mode === "throw") throw new Error("private"); return false; });
    await h.route()([file()]); expect(h.submit).not.toHaveBeenCalled(); expect(h.busy).toEqual([true, false]); expect(h.intake.isPending()).toBe(false);
  });
  it("continues later files after a throw and aggregates refusals", async () => {
    const h = harness(); h.submit.mockRejectedValueOnce(new Error("private"));
    h.submit.mockResolvedValueOnce([{ kind: "refused", reason: "too large" }] as never);
    await h.route()([file("first.pdf"), file("second.pdf"), file("third.pdf")]);
    expect(h.submit).toHaveBeenCalledTimes(3); expect(h.errors.at(-1)).toContain("first.pdf: File preparation failed"); expect(h.errors.at(-1)).toContain("second.pdf: too large"); expect(h.errors.join()).not.toContain("private");
  });
  it.each(["header", "upload"])("reset invalidates old %s without releasing newer busy/error", async (phase) => {
    const h = harness(); let finish!: () => void;
    if (phase === "header") h.start.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = () => resolve(true); }));
    else h.submit.mockImplementationOnce(() => new Promise<SubmitOutcome[]>((resolve) => { finish = () => resolve([{ kind: "accepted", entryCount: 1 }]); }));
    const old = h.route()([file("old.pdf"), file("old-tail.pdf")]); await Promise.resolve();
    h.intake.cancel(); let finishNew!: (value: boolean) => void; h.start.mockImplementationOnce(() => new Promise((resolve) => { finishNew = resolve; }));
    const fresh = h.route()([file("new.pdf")]); const before = [...h.busy]; finish(); await old;
    expect(h.busy).toEqual(before); expect(h.submit.mock.calls.flatMap((call) => call[0]).map((f: File) => f.name)).not.toContain("old-tail.pdf");
    finishNew(true); await fresh; expect(h.busy.at(-1)).toBe(false);
  });
  it("confirmed reset cancels; canceled confirmation leaves intent and attempt intact", () => {
    const h = harness(), reset = vi.fn(), cancel = vi.fn(), intent = vi.fn();
    const bindings = { window: { confirm: () => false }, directIntake: { current: { cancel } }, setIncludeSetupFiles: intent, setDirectPreparing: vi.fn(), setPreparing: vi.fn(), setZipPhase: vi.fn(), driver: { reset },
      setupRef: { current: null }, roleIntake: { cancel: vi.fn() }, repositoryProposals: { reset: vi.fn() }, setRepositoryEvidence: vi.fn(), emptyRepositoryEvidence: vi.fn(), setRepositoryEvidenceSession: vi.fn(), setSubmitError: vi.fn(), setSetupNote: vi.fn() };
    actual("handleNewSession", bindings)(); expect(cancel).not.toHaveBeenCalled(); expect(intent).not.toHaveBeenCalled();
    bindings.window.confirm = () => true; actual("handleNewSession", bindings)(); expect(cancel).toHaveBeenCalledOnce(); expect(intent).toHaveBeenCalledWith(false); expect(reset).toHaveBeenCalledOnce(); expect(h.intake.isPending()).toBe(false);
  });
  it.each(["count", "bytes"])("admits exact %s limits and refuses overflow before header", async (kind) => {
    const h = harness(); const boundary = kind === "count" ? Array.from({ length: ROLE_FILE_LIMIT }, () => file()) : [Object.assign(file(), { })];
    if (kind === "bytes") Object.defineProperty(boundary[0], "size", { value: ROLE_BYTE_LIMIT });
    await h.route()(boundary); expect(h.start).toHaveBeenCalledOnce(); h.start.mockClear(); h.submit.mockClear();
    await h.route()([...boundary, file()]); expect(h.start).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled(); expect(h.errors.at(-1)).toMatch(/limit|40/);
  });
  it("diagnostic recorder throws cannot change admission, continuation or cleanup", async () => {
    const recorder = vi.spyOn(diagnostic, "recordChatFileRoleDiagnostic").mockImplementation(() => { throw new Error("private recorder failure"); });
    try {
      const h = harness(); await h.route()([file()]); expect(h.submit).toHaveBeenCalledOnce(); expect(h.busy).toEqual([true, false]);
      await h.route()(Array.from({ length: ROLE_FILE_LIMIT + 1 }, () => file())); expect(h.start).toHaveBeenCalledOnce(); expect(h.errors.at(-1)).toContain("40");
      expect(recorder.mock.calls[0][0].rows[0]).toMatchObject({ name: "", file: null, role: "submission" });
    } finally { recorder.mockRestore(); }
  });
});
