/* eslint-disable @typescript-eslint/no-explicit-any -- The JSX shim traverses dynamic handler props. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { markSessionChanged, submitAssignedFiles, submitDropBatch, suggestFileGroups } from "./submissionDropRoutes";

type Node = { type: string; props: Record<string, any> };
const slots: { value: any; deps?: unknown[] }[] = [];
let cursor = 0;
const useState = (initial: unknown) => { const slot = slots[cursor++] ??= { value: initial }; return [slot.value, (next: any) => { slot.value = typeof next === "function" ? next(slot.value) : next; }]; };
const useRef = (initial: unknown) => { const slot = slots[cursor++] ??= { value: { current: initial } }; return slot.value; };
const useEffect = (effect: () => unknown, deps: unknown[]) => { const slot = slots[cursor++] ??= { value: undefined }; if (!slot.deps || deps.some((v, i) => v !== slot.deps?.[i])) { slot.deps = deps; effect(); } };
const source = readFileSync("src/app/components/grading-chat/SubmissionDrop.tsx", "utf8");
const file = ts.createSourceFile("SubmissionDrop.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declarations = file.statements.filter((statement) => ts.isFunctionDeclaration(statement) && ["SubmissionDrop", "reconcileRowAfterReset"].includes(statement.name?.text ?? ""));
const code = ts.transpileModule(declarations.map((d) => d.getText(file).replace(/^export\s+/, "")).join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
const components = ["Alert", "Box", "Button", "Dialog", "DialogActions", "DialogContent", "DialogTitle", "FormControl", "FormControlLabel", "FormLabel", "Radio", "RadioGroup", "TextField", "Typography"];
const factory = new Function("exports", "require", "useState", "useRef", "useEffect", "ROLE_FILE_LIMIT", "submitAssignedFiles", "submitDropBatch", "suggestFileGroups", "markSessionChanged", "window", ...components, `${code}; return SubmissionDrop;`);
const component = factory({}, (id: string) => id === "react/jsx-runtime" ? { jsx, jsxs: jsx } : {}, useState, useRef, useEffect, 40, submitAssignedFiles, submitDropBatch, suggestFileGroups, markSessionChanged, { addEventListener() {}, removeEventListener() {} }, ...components);
function nodes(node: any): Node[] { if (Array.isArray(node)) return node.flatMap(nodes); if (!node || typeof node !== "object") return []; return [node, ...nodes(node.props?.children)]; }
const text = (node: any): string => Array.isArray(node) ? node.map(text).join("") : typeof node === "string" ? node : !node || typeof node !== "object" ? "" : text(node.props?.children);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => { slots.length = 0; cursor = 0; });
function harness(onOne = vi.fn(async () => ({ kind: "accepted", entryCount: 1 })), onMany = vi.fn(async () => [] as any[])) {
  let epoch = 0;
  const render = () => { cursor = 0; return component({ disabled: false, onOne, onMany, getSessionEpoch: () => epoch, sessionEpoch: epoch }); };
  const find = (tree: Node, type: string) => nodes(tree).find((node) => node.type === type)!;
  const button = (tree: Node, label: string) => nodes(tree).find((node) => node.type === "Button" && text(node) === label)!;
  const reset = () => { epoch++; };
  return { render, find, button, reset, onOne, onMany };
}
const work = (name: string) => new File(["work"], name);

describe("SubmissionDrop actual handlers", () => {
  it("holds multiple files, confirms the visible suggestion, and allows selecting the same file again", async () => {
    const h = harness(); let tree = h.render(); h.find(tree, "RadioGroup").props.onChange(null, "many"); tree = h.render();
    const input = h.find(tree, "input"), first = work("Alice_101_1_a.pdf"); input.props.onChange({ target: { files: [first], value: "x" } }); await flush();
    tree = h.render(); expect(text(tree)).toContain("Alice_101_1_a.pdf"); expect(h.onOne).not.toHaveBeenCalled();
    h.button(tree, "Accept and grade this group").props.onClick(); await flush(); expect(h.onOne).toHaveBeenCalledTimes(1);
    tree = h.render(); h.find(tree, "input").props.onChange({ target: { files: [first], value: "x" } }); await flush(); tree = h.render();
    expect(text(tree).match(/Alice_101_1_a.pdf/g)!.length).toBeGreaterThan(1);
  });
  it("handles dropped refusal and partial results and changes queued rows after reset", async () => {
    const h = harness(vi.fn().mockResolvedValueOnce({ kind: "refused", reason: "too large" }).mockResolvedValueOnce({ kind: "partial", reason: "check results", dispatchedCount: 1, refusedCount: 1 }).mockResolvedValueOnce({ kind: "accepted", entryCount: 1 }));
    let tree = h.render(); const drop = () => h.find(tree, "Box");
    const area = () => nodes(tree).find((n) => typeof n.props?.onDrop === "function")!;
    const event = () => ({ preventDefault() {}, stopPropagation() {}, dataTransfer: { items: [], files: [work("one.pdf")] } });
    area().props.onDrop(event()); await flush(); tree = h.render(); expect(text(tree)).toContain("too large");
    h.button(tree, "Retry unsubmitted files").props.onClick(); await flush(); tree = h.render(); expect(text(tree)).toContain("Needs review");
    void drop;
    const h2 = harness(); slots.length = 0; tree = h2.render(); nodes(tree).find((n) => typeof n.props?.onDrop === "function")!.props.onDrop(event()); await flush(); tree = h2.render(); expect(text(tree)).toContain("Queued"); h2.reset(); tree = h2.render(); tree = h2.render(); expect(text(tree)).toContain("Needs review");
  });
});
