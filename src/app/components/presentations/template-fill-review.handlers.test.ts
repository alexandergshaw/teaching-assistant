import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = ts.createSourceFile("TemplateFillReview.tsx", readFileSync("src/app/components/presentations/TemplateFillReview.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = source.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === "useTemplateFillReview");
if (!declaration) throw new Error("missing hook");
const js = ts.transpileModule(declaration.getText(source).replace(/^export\s+/, ""), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
function harness(action: ReturnType<typeof vi.fn>) {
  const slots: Array<{ value: unknown }> = []; let cursor = 0; let cleanup: (() => void) | undefined;
  const useState = (initial: unknown) => { const slot = slots[cursor++] ??= { value: initial }; return [slot.value, (value: unknown) => { slot.value = value; }]; };
  const useRef = (initial: unknown) => { const slot = slots[cursor++] ??= { value: { current: initial } }; return slot.value; };
  const useLayoutEffect = (effect: () => (() => void)) => { cleanup ??= effect(); };
  const jsx = (type: string, props: Record<string, unknown>) => ({ type, props });
  const hook = new Function("exports", "useState", "useRef", "useLayoutEffect", "fillDeckTemplateFileAction", "require", "Dialog", "DialogTitle", "DialogContent", "DialogActions", "Alert", "Typography", "Button", `${js}; return useTemplateFillReview;`)({}, useState, useRef, useLayoutEffect, action, () => ({ jsx, jsxs: jsx }), "Dialog", "DialogTitle", "DialogContent", "DialogActions", "Alert", "Typography", "Button");
  return { render: () => { cursor = 0; return hook(); }, unmount: () => cleanup?.() };
}
const deck = { presentationTitle: "Lesson", slides: [{ title: "Title", bullets: [] }] };
function deferred() { let finish!: (value: unknown) => void; const promise = new Promise((resolve) => { finish = resolve; }); return { promise, finish }; }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nodes(node: any): any[] { return Array.isArray(node) ? node.flatMap(nodes) : !node || typeof node !== "object" ? [] : [node, ...nodes(node.props?.children)]; }
describe("reviewed template fill handler", () => {
  it("does not return a late success or open a preview after unmount", async () => {
    for (const result of [{ base64: "abc", name: "deck" }, { error: "review", preview: { token: "t", paragraphs: [] } }]) {
      const held = deferred(), h = harness(vi.fn(() => held.promise)); const pending = h.render().fill("id", deck); h.unmount(); held.finish(result);
      expect(await pending).toHaveProperty("error", expect.stringContaining("changed"));
    }
  });
  it("drops preview when the input changes before it arrives", async () => {
    const held = deferred(); let valid = true; const h = harness(vi.fn(() => held.promise));
    const pending = h.render().fill("id", deck, () => valid); valid = false; held.finish({ error: "review", preview: { token: "t", paragraphs: [] } });
    expect(await pending).toHaveProperty("error", expect.stringContaining("changed"));
  });
  it("fences changed input and unmount while the confirmed request is pending", async () => {
    for (const unmount of [false, true]) {
      const held = deferred(); let valid = true;
      const action = vi.fn().mockResolvedValueOnce({ error: "review", preview: { token: "t", paragraphs: [{ slide: 1, text: "Footer" }] } }).mockReturnValueOnce(held.promise);
      const h = harness(action); const pending = h.render().fill("id", deck, () => valid); await Promise.resolve();
      const dialog = h.render().dialog; const accept = nodes(dialog).find((node) => node.type === "Button" && node.props.children === "Clear listed text and continue"); accept.props.onClick(); await Promise.resolve();
      if (unmount) h.unmount(); else valid = false; held.finish({ base64: "abc", name: "deck" });
      expect(await pending).toHaveProperty("error", expect.stringContaining("changed"));
    }
  });
  it("does not send confirmation after the reviewed input changes", async () => {
    let valid = true;
    const action = vi.fn().mockResolvedValue({ error: "review", preview: { token: "t", paragraphs: [] } });
    const h = harness(action); const pending = h.render().fill("id", deck, () => valid); await Promise.resolve();
    valid = false;
    nodes(h.render().dialog).find((node) => node.type === "Button" && node.props.children === "Clear listed text and continue").props.onClick();
    expect(await pending).toHaveProperty("error", expect.stringContaining("changed"));
    expect(action).toHaveBeenCalledTimes(1);
  });
});
