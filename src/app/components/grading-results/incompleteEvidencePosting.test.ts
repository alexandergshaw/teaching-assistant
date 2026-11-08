import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import type { GradeResult } from "../../../lib/grade/types";
import { evidencePostRefusal } from "../../../lib/grade/evidence-review";

const source = ts.createSourceFile("GradingResults.tsx", readFileSync("src/app/components/GradingResults.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function handler(name: string, bindings: Record<string, unknown>) {
  let declaration: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) declaration = node; ts.forEachChild(node, visit); };
  visit(source);
  if (!declaration?.initializer) throw new Error(`Missing ${name}`);
  const initializer = declaration.initializer;
  const fn = ts.isCallExpression(initializer) ? initializer.arguments[0] : initializer;
  const code = ts.transpileModule(`const callback = ${fn.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(bindings), `${code}; return callback;`)(...Object.values(bindings));
}
const row = (student: string, linkFetch?: "failed" | "ok"): GradeResult => ({ student, userId: student === "Alice" ? 1 : 2, totalScore: "1/1", rubricAreas: [], overallComment: "ok", linkFetch } as unknown as GradeResult);
function setup(rows: GradeResult[], reviewedEvidence: ReadonlySet<GradeResult>) {
  const write = vi.fn(async () => ({ posted: 1, failures: [], skipped: [] }));
  let status: Record<string, unknown> = {};
  const bindings = { gradableResults: rows, reviewedEvidence, evidencePostRefusal, edits: {}, postingRowsRef: { current: new Set<string>() }, acceptingRowsRef: { current: new Set<string>() }, defaultRowEdit: () => ({ total: "1", overall: "ok" }),
    checkRowPostability: () => ({ postable: true }), parseEarnedPoints: (v: string) => v, buildRowPostPayload: (r: GradeResult) => ({ userId: r.userId }),
    setPostStatus: (update: (old: typeof status) => typeof status) => { status = update(status); }, setPostSummary: vi.fn(), setPosting: vi.fn(),
    timePostGrades: (fn: () => unknown) => fn(), postCanvasGradesAction: write, canvasUrl: "https://example.test", onPosted: undefined,
    fanOutGradingPostResult: () => ({}), postStatus: {}, armedPostOne: null, postOneRowSignature: () => "s", decidePostOneClick: () => "post", setArmedPostOne: vi.fn() };
  return { bindings, write, getStatus: () => status };
}
describe("posting with incomplete evidence", () => {
  it("does not accept a replacement while an old grade is being posted", async () => {
    const alice = row("Alice", "ok"), candidate = { ...alice, totalScore: "2/2" };
    const h = setup([alice], new Set());
    let finish!: (value: { posted: number; failures: never[]; skipped: never[] }) => void;
    h.write.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const accept = vi.fn(() => true), clear = vi.fn(), edits = vi.fn();
    const bindings = { ...h.bindings, regradeCandidates: new Map([["Alice", candidate]]), onAcceptRegrade: accept, clearPostStatus: clear, setEdits: edits };
    const post = handler("handlePostGrades", bindings)(false);
    handler("handleAcceptRegrade", bindings)("Alice");
    expect(accept).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled(); expect(edits).not.toHaveBeenCalled();
    finish({ posted: 1, failures: [], skipped: [] }); await post;
    handler("handleAcceptRegrade", bindings)("Alice");
    expect(accept).toHaveBeenCalledWith("Alice", candidate);
  });
  it("bulk posts complete rows and refuses incomplete rows until explicitly reviewed", async () => {
    const alice = row("Alice", "failed"), bob = row("Bob", "ok"); const h = setup([alice, bob], new Set());
    await handler("handlePostGrades", h.bindings)(false);
    expect(h.write).toHaveBeenCalledWith(expect.anything(), [{ userId: 2 }]);
    expect(h.getStatus()).toMatchObject({ Alice: { status: "skipped", message: expect.stringContaining("could not be fetched") } });
    const reviewed = setup([alice], new Set([alice])); await handler("handlePostGrades", reviewed.bindings)(false);
    expect(reviewed.write).toHaveBeenCalledOnce();
  });
  it("does not post either same-named student when one row needs evidence review", async () => {
    const first = row("Alice", "failed"), second = { ...row("Alice", "ok"), userId: 2 } as GradeResult;
    const h = setup([first, second], new Set());
    const outcome = await handler("handlePostGrades", h.bindings)(false);
    expect(h.write).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ posted: 0, skipped: 2 });
  });  it("blocks an old saved row with unknown provenance until explicitly reviewed", async () => {
    const legacy = { ...row("Alice"), evidenceProvenanceUnknown: true } as GradeResult;
    const h = setup([legacy], new Set()); await handler("handlePostOne", h.bindings)(legacy);
    expect(h.write).not.toHaveBeenCalled();
    expect(h.getStatus()).toMatchObject({ Alice: { status: "skipped", message: expect.stringContaining("provenance is unknown") } });
    const reviewed = setup([legacy], new Set([legacy])); await handler("handlePostOne", reviewed.bindings)(legacy);
    expect(reviewed.write).toHaveBeenCalledOnce();
  });  it("refuses an incomplete row even when its label is an object prototype key", async () => {
    const special = { ...row("Alice", "failed"), student: "__proto__" } as GradeResult;
    const h = setup([special], new Set());
    const outcome = await handler("handlePostGrades", h.bindings)(false);
    expect(h.write).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ posted: 0, skipped: 1 });
    expect(Object.hasOwn(h.getStatus(), "__proto__")).toBe(true);
  });  it("individual posting refuses an unreviewed row before arming or writing", async () => {
    const alice = row("Alice", "failed"), h = setup([alice], new Set());
    await handler("handlePostOne", h.bindings)(alice);
    expect(h.write).not.toHaveBeenCalled(); expect(h.getStatus()).toMatchObject({ Alice: { status: "skipped" } });
  });
});
