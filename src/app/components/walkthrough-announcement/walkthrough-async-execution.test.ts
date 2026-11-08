import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it, vi } from "vitest";

// Execute the actual callback bodies with injected dependencies. This does not
// render React or test the panel's wiring of those dependencies.
const source = readFileSync("src/app/components/walkthrough-announcement/WalkthroughAnnouncementPanel.tsx", "utf8");
function callback(name: string, dependencies: Record<string, unknown>): () => Promise<void> {
  const file = ts.createSourceFile("panel.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let arrow: ts.ArrowFunction | undefined;
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(file) === name && node.initializer && ts.isCallExpression(node.initializer)) {
      const first = node.initializer.arguments[0];
      if (first && ts.isArrowFunction(first)) arrow = first;
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!arrow) throw new Error(`Missing callback ${name}`);
  const javascript = ts.transpile(`return (${(arrow as ts.ArrowFunction).getText(file)});`, { target: ts.ScriptTarget.ES2022 });
  return Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies)) as () => Promise<void>;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

it("drops a late extraction result after the capture epoch changes", async () => {
  const response = deferred<{ blocks: string[] }>();
  const epoch = { current: 1 };
  const blocks = { current: [] as string[][] };
  const count = vi.fn();
  const extracting = vi.fn();
  const inFlight = { current: false };
  const extract = vi.fn(() => response.promise);
  const run = callback("runExtraction", {
    takeFrameBatch: () => [{ base64: "frame" }], MODULE_EXTRACT_BATCH_SIZE: 1, EXTRACT_BATCH_WIRE_BUDGET: 100,
    extractionEpoch: epoch, batchInFlightRef: inFlight, setExtracting: extracting,
    sumBase64WireBytes: () => 5, checkWireBudget: () => ({ ok: true }), pushNotice: vi.fn(),
    extractModuleContentAction: extract, moduleLabel: "", notesText: "", provider: "gemini",
    batchBlocksRef: blocks, setLegibleBlockCount: count,
  });
  const pending = run();
  await Promise.resolve();
  expect(extract).toHaveBeenCalledWith([{ base64: "frame" }], "", "", "gemini");
  epoch.current++;
  response.resolve({ blocks: ["old"] });
  await pending;
  expect(blocks.current).toEqual([]);
  expect(count).not.toHaveBeenCalled();
  expect(inFlight.current).toBe(true);
  expect(extracting).not.toHaveBeenCalledWith(false);
});

it("reports a rejected script request without replacing the previous script", async () => {
  const setText = vi.fn();
  const setError = vi.fn();
  const setGenerating = vi.fn();
  const action = vi.fn(() => Promise.reject(new Error("transport")));
  const run = callback("handleGenerateScript", {
    capturing: false, extracting: false, pendingFrames: 0, batchInFlightRef: { current: false }, upload: { busy: false, result: null }, uploadSnapshot: { current: null }, hasMaterial: true, extractionEpoch: { current: 1 }, uploadedVideoMaterialText: () => "captured", setScriptGenerating: setGenerating, setScriptError: setError, setScriptText: setText, scriptRevisionRef: { current: 0 },
    reduceCaptureToMaterials: () => ({ text: "captured" }), batchBlocksRef: { current: [] }, WALKTHROUGH_SCRIPT_MATERIALS_CAP: 100,
    draftWalkthroughVideoScriptAction: action,
    selectedCourse: { name: "Course" }, moduleLabel: "", notesText: "", provider: "gemini",
  });
  await run();
  expect(action).toHaveBeenCalledWith({ courseName: "Course", moduleLabel: "", materialsText: "captured", notes: "", provider: "gemini" });
  expect(setText).not.toHaveBeenCalled();
  expect(setError).toHaveBeenLastCalledWith("Could not generate the video script. Please try again.");
  expect(setGenerating).toHaveBeenLastCalledWith(false);
});

it("adds a successful current-epoch extraction", async () => {
  const blocks = { current: [] as string[][] };
  let count = 0;
  const extract = vi.fn().mockResolvedValue({ blocks: ["current"] });
  const run = callback("runExtraction", {
    takeFrameBatch: () => [{ base64: "frame" }], MODULE_EXTRACT_BATCH_SIZE: 1, EXTRACT_BATCH_WIRE_BUDGET: 100,
    extractionEpoch: { current: 1 }, batchInFlightRef: { current: false }, setExtracting: vi.fn(),
    sumBase64WireBytes: () => 5, checkWireBudget: () => ({ ok: true }), pushNotice: vi.fn(),
    extractModuleContentAction: extract, moduleLabel: "module", notesText: "notes", provider: "gemini",
    batchBlocksRef: blocks, setLegibleBlockCount: (update: (n: number) => number) => { count = update(count); },
  });
  await run();
  expect(extract).toHaveBeenCalledWith([{ base64: "frame" }], "module", "notes", "gemini");
  expect(blocks.current).toEqual([["current"]]);
  expect(count).toBe(1);
});

it.each([false, true])("reports extraction rejection only for the current epoch (stale=%s)", async (stale) => {
  let reject!: (reason: Error) => void;
  const promise = new Promise<never>((_, r) => { reject = r; });
  const epoch = { current: 1 };
  const notice = vi.fn();
  const extract = vi.fn(() => promise);
  const run = callback("runExtraction", {
    takeFrameBatch: () => [{ base64: "frame" }], MODULE_EXTRACT_BATCH_SIZE: 1, EXTRACT_BATCH_WIRE_BUDGET: 100,
    extractionEpoch: epoch, batchInFlightRef: { current: false }, setExtracting: vi.fn(),
    sumBase64WireBytes: () => 5, checkWireBudget: () => ({ ok: true }), pushNotice: notice,
    extractModuleContentAction: extract, moduleLabel: "", notesText: "", provider: "gemini",
    batchBlocksRef: { current: [] }, setLegibleBlockCount: vi.fn(),
  });
  const pending = run();
  await Promise.resolve();
  expect(extract).toHaveBeenCalledTimes(1);
  if (stale) epoch.current++;
  reject(new Error("transport"));
  await pending;
  if (stale) expect(notice).not.toHaveBeenCalled();
  else expect(notice).toHaveBeenCalledWith("danger", expect.stringContaining("Could not read this batch"));
});

it("applies a successful script response", async () => {
  const setText = vi.fn();
  const setGenerating = vi.fn();
  const action = vi.fn().mockResolvedValue({ script: "new script" });
  const run = callback("handleGenerateScript", {
    capturing: false, extracting: false, pendingFrames: 0, batchInFlightRef: { current: false }, upload: { busy: false, result: null }, uploadSnapshot: { current: null }, hasMaterial: true, extractionEpoch: { current: 1 }, uploadedVideoMaterialText: () => "captured", setScriptGenerating: setGenerating, setScriptError: vi.fn(), setScriptText: setText, scriptRevisionRef: { current: 0 },
    reduceCaptureToMaterials: () => ({ text: "captured" }), batchBlocksRef: { current: [] }, WALKTHROUGH_SCRIPT_MATERIALS_CAP: 100,
    draftWalkthroughVideoScriptAction: action, selectedCourse: { name: "Course" }, moduleLabel: " module ", notesText: "notes", provider: "gemini",
  });
  await run();
  expect(action).toHaveBeenCalledWith({ courseName: "Course", moduleLabel: "module", materialsText: "captured", notes: "notes", provider: "gemini" });
  expect(setText).toHaveBeenCalledWith("new script");
  expect(setGenerating).toHaveBeenLastCalledWith(false);
});

it("preserves an edit made while a script request is in flight", async () => {
  const result = deferred<{ script: string }>();
  const revision = { current: 1 };
  const setText = vi.fn();
  const setError = vi.fn();
  const run = callback("handleGenerateScript", {
    capturing: false, extracting: false, pendingFrames: 0, batchInFlightRef: { current: false }, upload: { busy: false, result: null }, uploadSnapshot: { current: null }, hasMaterial: true, extractionEpoch: { current: 1 }, uploadedVideoMaterialText: () => "captured", setScriptGenerating: vi.fn(), setScriptError: setError, setScriptText: setText, scriptRevisionRef: revision,
    reduceCaptureToMaterials: () => ({ text: "captured" }), batchBlocksRef: { current: [] }, WALKTHROUGH_SCRIPT_MATERIALS_CAP: 100,
    draftWalkthroughVideoScriptAction: () => result.promise, selectedCourse: { name: "Course" }, moduleLabel: "", notesText: "", provider: "gemini",
  });
  const pending = run();
  revision.current++;
  result.resolve({ script: "replacement" });
  await pending;
  expect(setText).not.toHaveBeenCalled();
  expect(setError).toHaveBeenLastCalledWith(expect.stringContaining("edits were kept"));
});
