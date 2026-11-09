import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";

function handler(name: string, bindings: Record<string, unknown>) {
  const source = ts.createSourceFile("SlideRegenView.tsx", readFileSync("src/app/components/presentations/pipeline/SlideRegenView.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node; ts.forEachChild(node, visit); };
  visit(source); if (!found) throw new Error("Missing handler");
  const code = ts.transpileModule(found.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return ${name};`)(...Object.values(bindings));
}
describe("slide regeneration source fence", () => {
  it("does not generate when sources have uncommitted changes", async () => {
    const fetch = vi.fn();
    const run = handler("handleGenerate", { sourcesDirty: true, pipelineState: { deck: { status: "done" } }, instruction: "Edit", fetch });
    await run(); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not accept a candidate if sources became dirty", () => {
    const setPipelineState = vi.fn(), setError = vi.fn();
    const accept = handler("handleAccept", { candidate: { title: "Candidate" }, candidateBase: { current: {} }, sourcesDirty: true, setError, setCandidate: vi.fn(), recordPipelineDiagnostic: vi.fn(), setPipelineState });
    accept(); expect(setPipelineState).not.toHaveBeenCalled(); expect(setError).toHaveBeenCalledWith(expect.stringContaining("out of date"));
  });
  it("keeps the candidate when a queued state update invalidates acceptance", () => {
    const original = { title: "Original" }, candidate = { title: "Candidate" };
    const setCandidate = vi.fn(), setAcceptPending = vi.fn();
    const state = { deck: { status: "done", artifact: { slides: [original] } } };
    const changed = { deck: { status: "done", artifact: { slides: [original, { title: "Changed" }] } } };
    const setPipelineState = vi.fn((update) => { expect(update(changed)).toBe(changed); });
    const accept = handler("handleAccept", { candidate, candidateBase: { current: original }, candidateSignature: { current: "old" }, signature: "old", sourcesDirty: false, pipelineState: state, selectedIndex: 0, setAcceptPending, setPipelineState, latest: { current: { sourcesDirty: false } }, regenInputSignature: () => "changed", contextText: "", appliedObjectives: [], applyRegenDecision: vi.fn(), countDeckDependents: () => 0, setCandidate });
    accept(); expect(setAcceptPending).toHaveBeenCalledOnce(); expect(setCandidate).not.toHaveBeenCalled();
  });
  it("discards a delayed response when the source draft changes", async () => {
    let finish!: (value: unknown) => void;
    const waiting = new Promise((resolve) => { finish = resolve; });
    const slide = { title: "Original", bullets: [] }, state = { deck: { status: "done", artifact: { slides: [slide] } } };
    const latest = { current: { pipelineState: state, signature: "snapshot", sourcesDirty: false } };
    const setCandidate = vi.fn(), setError = vi.fn();
    const run = handler("handleGenerate", { sourcesDirty: false, pipelineState: state, instruction: "Edit", setBusy: vi.fn(), setError, setCandidate, candidateBase: { current: null }, candidateSignature: { current: "" }, requestId: { current: 0 }, current: slide, buildPipelineRequest: () => ({}), contextText: "", selectedIndex: 0, appliedObjectives: [], fetch: () => waiting, PIPELINE_URL: "/", extractRegenCandidate: () => ({ title: "Candidate", bullets: [] }), latest, signature: "snapshot", alive: { current: true }, recordPipelineDiagnostic: vi.fn() });
    const pending = run(); latest.current.sourcesDirty = true;
    finish({ status: 200, json: async () => ({}) }); await pending;
    expect(setCandidate).not.toHaveBeenCalledWith(expect.objectContaining({ title: "Candidate" }));
    expect(setError).toHaveBeenCalledWith(expect.stringContaining("could not be regenerated"));
  });
});
