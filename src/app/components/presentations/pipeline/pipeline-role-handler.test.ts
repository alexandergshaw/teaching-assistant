import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

/** Execute the real role-download handler with isolated dependencies; this does not render React. */
function downloadHandler(bindings: Record<string, unknown>) {
  const source = ts.createSourceFile("RoleAwareTemplateFill.tsx", readFileSync("src/app/components/presentations/RoleAwareTemplateFill.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) { if (ts.isFunctionDeclaration(node) && node.name?.text === "download") declaration = node; ts.forEachChild(node, visit); }
  visit(source);
  if (!declaration) throw new Error("Missing role download handler");
  const js = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(bindings), `${js}\nreturn download;`)(...Object.values(bindings)) as () => Promise<void>;
}

describe("pipeline role download handler", () => {
  it("starts the snapshot before checking it and releases it when it is invalid", async () => {
    let started = false;
    const onStart = vi.fn(() => { started = true; return true; });
    const onEnd = vi.fn();
    const action = vi.fn();
    const run = downloadHandler({ disabled: false, lock: { current: false }, stale: false, roles: ["title"], slides: [{ title: "Title", bullets: [] }], onStart, onEnd, isSelectionCurrent: () => started && false, fillRoleAwarePowerPointAction: action });
    await run();
    expect(onStart).toHaveBeenCalledOnce();
    expect(onEnd).toHaveBeenCalledOnce();
    expect(action).not.toHaveBeenCalled();
  });
  it("drops an in-flight result after the source or template changes", async () => {
    let valid = true;
    let finish!: (result: unknown) => void;
    const action = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const onEnd = vi.fn();
    const run = downloadHandler({ disabled: false, lock: { current: false }, stale: false, roles: ["title"], slides: [{ title: "Title", bullets: [] }], onStart: () => true, onEnd, isSelectionCurrent: () => valid, fillRoleAwarePowerPointAction: action, setBusy: vi.fn(), setError: vi.fn(), revision: { current: 0 }, alive: { current: true }, libraryId: "lib", sourceFileId: "source", title: "Deck" });
    const pending = run(); valid = false; finish({ base64: "YQ==", name: "Deck" }); await pending;
    expect(onEnd).toHaveBeenCalledOnce();
  });
});
