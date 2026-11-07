/* eslint-disable @typescript-eslint/no-explicit-any -- JSX test shim inspects dynamic handlers. */
import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { dispatchComposite } from "./compositeSubmission";

const slots: { value: any }[] = [];
let cursor = 0;
const useState = (initial: any) => { const slot = slots[cursor++] ??= { value: typeof initial === "function" ? initial() : initial }; return [slot.value, (next: any) => { slot.value = typeof next === "function" ? next(slot.value) : next; }]; };
const useRef = (initial: any) => (slots[cursor++] ??= { value: { current: initial } }).value;
const useEffect = () => { cursor++; };
const source = readFileSync("src/app/components/grading-chat/ChatComposer.tsx", "utf8");
const file = ts.createSourceFile("ChatComposer.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = file.statements.find((s) => ts.isFunctionDeclaration(s) && s.name?.text === "ChatComposer")!;
const code = ts.transpileModule(declaration.getText(file).replace(/^export\s+/, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const jsx = (type: string, props: any) => ({ type, props });
const names = ["TextField", "MenuItem", "Button", "Alert", "Accordion", "AccordionSummary", "AccordionDetails", "SubmissionDrop"];
const factory = new Function("exports", "require", "useState", "useRef", "useEffect", "loadInputMode", "useLmsSubmissionPicker", "useChatScreenFrameCapture", "MAX_RECORDING_FRAMES", "loadComposerHeight", "persistComposerHeight", "persistInputMode", "describePart", "submitOnEnter", "dispatchComposite", "styles", "chatStyles", ...names, `${code}; return ChatComposer;`);
const component = factory({}, (id: string) => id === "react/jsx-runtime" ? { jsx, jsxs: jsx, Fragment: "Fragment" } : {}, useState, useRef, useEffect, () => "text", () => ({}), () => ({ recording: false, snapping: false }), 30, () => null, () => null, () => {}, (part: any) => part.content ?? part.file.name, () => () => {}, dispatchComposite, {}, {}, ...names);
function nodes(value: any): any[] { if (Array.isArray(value)) return value.flatMap(nodes); if (!value || typeof value !== "object") return []; return [value, ...nodes(value.props?.children)]; }
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
beforeEach(() => { slots.length = 0; cursor = 0; });
it("blocks same-turn add and remove while a deferred submission is pending", async () => {
  let finish!: (result: any) => void;
  const submit = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
  const render = () => { cursor = 0; return component({ disabled: false, onSubmitFiles: vi.fn(), onSubmitUrl: vi.fn(), onSubmitComposite: submit, getSessionEpoch: () => 1 }); };
  const button = (tree: any, label: string) => nodes(tree).find((n) => n.type === "Button" && n.props["aria-label"] === label);
  let tree = render();
  nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Text for combined submission").props.onChange({ target: { value: "first" } });
  tree = render(); nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add text part").props.onClick();
  tree = render();
  nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Text for combined submission").props.onChange({ target: { value: "second" } });
  tree = render();
  const grade = button(tree, "Grade submission"), remove = button(tree, "Remove part 1");
  const add = nodes(tree).find((n) => n.type === "Button" && n.props.children === "Add text part");
  grade.props.onClick(); remove.props.onClick(); add.props.onClick();
  expect(submit).toHaveBeenCalledTimes(1);
  finish({ kind: "refused", reason: "retry" }); await flush(); tree = render();
  expect(button(tree, "Remove part 1")).toBeDefined();
  expect(button(tree, "Remove part 2")).toBeUndefined();
  expect(nodes(tree).find((n) => n.type === "TextField" && n.props.label === "Text for combined submission").props.value).toBe("second");
});
