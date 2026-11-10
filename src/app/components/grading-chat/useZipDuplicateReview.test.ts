/* eslint-disable @typescript-eslint/no-explicit-any -- Hook and JSX are exercised through a small handler harness. */
import { beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import ts from "typescript";

const slots: any[] = []; let cursor = 0;
const useRef = (value: unknown) => (slots[cursor++] ??= { current: value });
const useState = (value: unknown) => { const slot = slots[cursor++] ??= { value }; return [slot.value, (next: unknown) => { slot.value = next; }]; };
const useEffect = (effect: () => (() => void), deps: unknown[]) => { const slot = slots[cursor++] ??= {}; if (!slot.deps || deps.some((item, i) => slot.deps[i] !== item)) { slot.cleanup?.(); slot.deps = deps; slot.cleanup = effect(); } };
const compare = vi.fn();
const source = readFileSync("src/app/components/grading-chat/useZipDuplicateReview.tsx", "utf8");
const parsed = ts.createSourceFile("hook.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "useZipDuplicateReview")!;
const code = ts.transpileModule(declaration.getText(parsed).replace(/^export\s+/, ""), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const jsx = (type: any, props: any) => ({ type, props });
const components = ["Alert", "Button", "Dialog", "DialogActions", "DialogContent", "DialogTitle", "Typography"];
const factory = new Function("exports", "require", "useEffect", "useLayoutEffect", "useRef", "useState", "compareZipCandidates", ...components, `${code}; return useZipDuplicateReview;`);
const hook = factory({}, () => ({ jsx, jsxs: jsx, Fragment: "Fragment" }), useEffect, useEffect, useRef, useState, compare, ...components);
const render = (owner = "owner") => { cursor = 0; return hook(owner); };
const nodes = (node: any): any[] => Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props?.children)];
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
beforeEach(() => { slots.length = 0; cursor = 0; compare.mockReset(); });

it("holds the gate across the modal, revalidates the session and prevents concurrent prompts", async () => {
  compare.mockResolvedValue({ possibleDuplicate: true, incomplete: false });
  let current = true; const zip = new File(["bytes"], "submissions.zip"); let review = render();
  const first = review.check([zip], () => current); await flush(); review = render();
  expect(nodes(review.view).find((node) => node.type === "Dialog").props.open).toBe(true);
  expect(await review.check([zip], () => current)).toBe(false);
  current = false;
  nodes(review.view).find((node) => node.type === "Button" && node.props.children === "I checked; grade anyway").props.onClick();
  expect(await first).toBe(false);
});

it("preserves accepted-file history and drops a pending decision on account change", async () => {
  compare.mockResolvedValue({ possibleDuplicate: true, incomplete: false });
  const previous = new File(["old"], "old.zip"), next = new File(["new"], "new.zip"); let review = render();
  review.remember([previous]); const first = review.check([next], () => true); await flush();
  expect(compare).toHaveBeenCalledWith([next], [previous]);
  review = render("another-owner"); expect(await first).toBe(false);
  expect(nodes(review.view).find((node) => node.type === "Dialog").props.open).toBe(false);
});

it("does not admit a late comparison after account A changes to B and back", async () => {
  let finish!: (value: { possibleDuplicate: boolean; incomplete: boolean }) => void;
  compare.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const review = render(); const token = review.capture(), zip = new File(["bytes"], "next.zip");
  const first = review.check([zip], () => true); render("another-owner"); render("owner");
  finish({ possibleDuplicate: false, incomplete: false }); expect(await first).toBe(false);
  expect(render().owns("owner", token)).toBe(false);
});

it("holds an uninspectable ZIP before dispatch until the user acknowledges it", async () => {
  compare.mockResolvedValue({ possibleDuplicate: false, incomplete: true });
  const zip = new File(["invalid"], "unknown.zip"); let review = render();
  const first = review.check([zip], () => true); await flush(); review = render();
  expect(nodes(review.view).find((node) => node.type === "Dialog").props.open).toBe(true);
  nodes(review.view).find((node) => node.type === "Button" && node.props.children === "Keep for later").props.onClick();
  expect(await first).toBe(false);
});

it("holds a ZIP mixed with an uninspectable source and later ZIPs after an unknown source", async () => {
  compare.mockResolvedValue({ possibleDuplicate: false, incomplete: false });
  let review = render(); const first = review.check([new File(["x"], "first.zip")], () => true, true); await flush(); review = render();
  expect(nodes(review.view).find((node) => node.type === "Dialog").props.open).toBe(true);
  nodes(review.view).find((node) => node.type === "Button" && node.props.children === "I checked; grade anyway").props.onClick();
  expect(await first).toBe(true); review = render(); review.rememberUnknown();
  const second = review.check([new File(["x"], "next.zip")], () => true); await flush(); review = render();
  expect(nodes(review.view).find((node) => node.type === "Dialog").props.open).toBe(true);
  review.cancel(); expect(await second).toBe(false);
});
