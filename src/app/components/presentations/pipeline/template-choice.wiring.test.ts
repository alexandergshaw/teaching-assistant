import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { pipelineTemplateFailureCategory, resolveTemplateForDownload } from "./template-choice";

// Execute actual handler declarations with isolated dependencies; no component is rendered.
function callerFunction(name: string, bindings: Record<string, unknown>) {
  if (name === "handleDownload" && !("downloadLock" in bindings)) bindings = { ...bindings, downloadLock: { current: false } };
  const source = ts.createSourceFile("PipelineTab.tsx", readFileSync("src/app/components/presentations/pipeline/PipelineTab.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration: ts.FunctionDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!declaration) throw new Error(`Missing caller function: ${name}`);
  const js = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return new Function(...Object.keys(bindings), `${js}\nreturn ${name};`)(...Object.values(bindings));
}

describe("pipeline saved-template caller wiring", () => {
  it("clears an existing selection when the empty option is chosen, unless locked", async () => {
    const source = ts.createSourceFile("PipelineTemplatePicker.tsx", readFileSync("src/app/components/presentations/pipeline/PipelineTemplatePicker.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let declaration: ts.FunctionDeclaration | undefined;
    const visit = (node: ts.Node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === "selectLibrary") declaration = node; ts.forEachChild(node, visit); };
    visit(source);
    if (!declaration) throw new Error("Missing selectLibrary handler");
    const js = ts.transpileModule(declaration.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
    const clear = vi.fn();
    const make = new Function("disabled", "choiceState", "clearChoice", `${js}; return selectLibrary;`);
    await make(false, { libraryLoading: false }, clear)("");
    expect(clear).toHaveBeenCalledOnce();
    await make(true, { libraryLoading: false }, clear)("");
    await make(false, { libraryLoading: true }, clear)("");
    expect(clear).toHaveBeenCalledOnce();
  });
  it("carries the selected choice through a fresh identity resolution into positional fill", () => {
    const caller = readFileSync("src/app/components/presentations/pipeline/PipelineTab.tsx", "utf8");
    const picker = readFileSync("src/app/components/presentations/pipeline/PipelineTemplatePicker.tsx", "utf8");
    expect(caller).toContain("resolveTemplateForDownload(choiceAtStart, pipelineLibraryActions)");
    expect(caller).toContain("downloadDeckPptx(deck, resolution.source.sourceFileId, () => revision === pipelineRevision.current && selectionGeneration === templateChoiceGeneration.current && !templatePendingRef.current, reviewFill)");
    expect(caller).toContain("fillDeckTemplateFileAction(templateFileId");
    expect(caller).toContain("onChoiceChange={(choice) => {");
    expect(caller).toContain("setTemplateChoice(choice)");
    expect(caller).toContain("effectiveChoice={templateChoice}");
    expect(caller).toContain('templateChoice.kind !== "own"');
    expect(caller).toContain("templateChoiceGeneration.current !== selectionGeneration");
    expect(caller).toContain("disabled={downloading || roleDownloading}");
    expect(caller).toContain("templateResolutionPending || !pipelineState.deck.artifact");
    expect(picker).toContain("choiceStateRef.current");
    expect(picker).toContain("initialTemplateChoiceState(effectiveChoice)");
    expect(picker).toContain("const currentChoice = effectiveChoice");
    expect(picker).toContain("gate.current.current(choiceStateRef.current.generation)");
    expect(picker).toContain("onRawTemplateFileIdChange(\"\")");
    expect(picker).toContain("onResolutionPendingChange(true)");
    expect(picker).toContain("<fieldset disabled={disabled}");
    expect(picker).toContain("disabled={disabled || choiceState.libraryLoading}");
    expect(picker).toContain("if (disabled || choiceState.libraryLoading) return;");
    expect(picker).toContain("if (!libraryId) { clearChoice(); return; }");
  });

  it("routes rejected library action promises through the same visible selection-error result", () => {
    const choice = readFileSync("src/app/components/presentations/pipeline/template-choice.ts", "utf8");
    const picker = readFileSync("src/app/components/presentations/pipeline/PipelineTemplatePicker.tsx", "utf8");
    expect(choice).toMatch(/try \{[\s\S]*?Promise\.all\(\[actions\.getLibrary\(libraryId\), actions\.reuseLibrary\(libraryId\)\]\)[\s\S]*?catch \{/);
    expect(choice).toContain("Your current template choice was kept.");
    expect(picker).toContain('if ("error" in result) {');
    expect(picker).toContain("dispatch({ type: \"library-failed\", generation, error: result.error });");
    expect(picker).toContain("{choiceState.libraryError && <Alert severity=\"error\">");
  });

  it("offers a reload that invalidates the prior list request", () => {
    const picker = readFileSync("src/app/components/presentations/pipeline/PipelineTemplatePicker.tsx", "utf8");
    expect(picker).toContain("Reload saved libraries");
    expect(picker).toContain("setRefreshVersion((version) => version + 1)");
    expect(picker).toContain("}, [refreshVersion]);");
    expect(picker).toContain("if (cancelled) return;");
  });

  it("invalidates held library lookups during picker unmount cleanup", () => {
    const choice = readFileSync("src/app/components/presentations/pipeline/template-choice.ts", "utf8");
    const picker = readFileSync("src/app/components/presentations/pipeline/PipelineTemplatePicker.tsx", "utf8");
    expect(picker).toContain("gate.current.invalidate();");
    expect(picker).toContain("onResolutionPendingChange(false);");
    expect(picker).toContain("resolveLibraryChoiceIfCurrent(libraryId, libraryActions, gate.current, generation");
    expect(choice).toContain("if (!gate.current(generation)) return false;");
    expect(choice).toContain("resolveAvailableLibraryTemplateChoice(libraryId, libraries, actions)");
    expect(picker).toContain("}, libraries);");
  });

  it.each(["raw", "library"] as const)("records content-free %s fill success, refusal and errors from the real download handler", async (kind) => {
    for (const result of [null, "Your template has 1 slide and this deck needs 3. Pick a shorter shape or a longer template.", "That template no longer exists.", new Error("private provider content")]) {
      const entries: Record<string, unknown>[] = [];
      const recordTemplateDownload = callerFunction("recordTemplateDownload", { recordSessionDiagnosticEntry: (entry: Record<string, unknown>) => entries.push(entry) });
      const downloadDeckPptx = result instanceof Error ? vi.fn().mockRejectedValue(result) : vi.fn().mockResolvedValue(result);
      const choice = { kind, libraryId: "private-library-id", sourceFileId: "private-source-id", name: "private library name" };
      const handle = callerFunction("handleDownload", {
        pipelineState: { deck: { status: "done", artifact: { presentationTitle: "private title", slides: [] } } }, pipelineRevision: { current: 0 }, sourcesDirty: false,
        templateResolutionPending: false, templateChoiceGeneration: { current: 0 }, templateChoiceRef: { current: choice },
        setDownloading: vi.fn(), setDownloadError: vi.fn(), recordTemplateDownload, pipelineTemplateFailureCategory,
        pipelineLibraryActions: { getLibrary: vi.fn().mockResolvedValue({ library: { id: "private-library-id", sourceFileId: "private-source-id", name: "private library name" } }), reuseLibrary: vi.fn().mockResolvedValue({ sourceFileId: "private-source-id" }) },
        resolveTemplateForDownload, downloadDeckPptx, reviewFill: vi.fn(),
      });
      await handle();
      expect(downloadDeckPptx).toHaveBeenCalledWith(expect.anything(), "private-source-id", expect.any(Function), expect.any(Function));
      const expectedCode = result === null ? undefined : result instanceof Error ? "PPT_DOWNLOAD_ERROR" : result.startsWith("Your template") ? "PPT_FIT_REFUSED" : "PPT_UNAVAILABLE";
      expect(entries).toEqual([
        expect.objectContaining({ operation: `pipeline_template_${kind}_resolve`, outcome: "success" }),
        expect.objectContaining({ operation: `pipeline_template_${kind}_fill`, outcome: expectedCode ? "failure" : "success", ...(expectedCode ? { code: expectedCode, error: expectedCode } : {}) }),
      ]);
      expect(JSON.stringify(entries)).not.toContain("private");
    }
  });

  it.each(["PPT_NOT_FOUND", "PPT_STORAGE", "PPT_SELECTION"])("records a safe resolve refusal for %s without filling or falling back", async (code) => {
    const entries: Record<string, unknown>[] = [];
    const recordTemplateDownload = callerFunction("recordTemplateDownload", { recordSessionDiagnosticEntry: (entry: Record<string, unknown>) => entries.push(entry) });
    const downloadDeckPptx = vi.fn();
    const setDownloadError = vi.fn();
    const handle = callerFunction("handleDownload", {
      pipelineState: { deck: { status: "done", artifact: { presentationTitle: "private title", slides: [] } } }, pipelineRevision: { current: 0 }, sourcesDirty: false,
      templateResolutionPending: false, templateChoiceGeneration: { current: 0 },
      templateChoiceRef: { current: { kind: "library", libraryId: "private-library-id", sourceFileId: "private-source-id", name: "private library name" } },
      setDownloading: vi.fn(), setDownloadError, recordTemplateDownload, pipelineTemplateFailureCategory,
      pipelineLibraryActions: { getLibrary: vi.fn().mockResolvedValue({ error: "private upstream message", code }), reuseLibrary: vi.fn().mockResolvedValue({ sourceFileId: "private-source-id" }) },
      resolveTemplateForDownload, downloadDeckPptx,
    });
    await handle();
    expect(downloadDeckPptx).not.toHaveBeenCalled();
    expect(setDownloadError).toHaveBeenCalledWith("private upstream message");
    const safeCode = code === "PPT_NOT_FOUND" ? "PPT_UNAVAILABLE" : code === "PPT_SELECTION" ? "PPT_SELECTION" : "PPT_RESOLVE_REFUSED";
    expect(entries).toEqual([expect.objectContaining({ operation: "pipeline_template_library_resolve", outcome: "failure", error: safeCode, code: safeCode })]);
    expect(JSON.stringify(entries)).not.toContain("private");
  });

  it("does not download when inputs change while template resolution is pending", async () => {
    let finish!: (value: unknown) => void;
    const resolveTemplateForDownload = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const downloadDeckPptx = vi.fn(), setDownloadError = vi.fn(), pipelineRevision = { current: 0 };
    const handle = callerFunction("handleDownload", {
      pipelineState: { deck: { status: "done", artifact: { presentationTitle: "Deck", slides: [] } } }, pipelineRevision, sourcesDirty: false,
      templateResolutionPending: false, templateChoiceGeneration: { current: 0 }, templateChoiceRef: { current: { kind: "own" } },
      setDownloading: vi.fn(), setDownloadError, recordTemplateDownload: vi.fn(), pipelineTemplateFailureCategory,
      pipelineLibraryActions: {}, resolveTemplateForDownload, downloadDeckPptx,
    });
    const pending = handle(); pipelineRevision.current++; finish({ source: { sourceFileId: "" } }); await pending;
    expect(downloadDeckPptx).not.toHaveBeenCalled();
    expect(setDownloadError).toHaveBeenCalledWith(expect.stringContaining("changed while preparing"));
  });
  it("does not create a download when selection changes during deck preparation", async () => {
    let finish!: (value: unknown) => void;
    const fillDeckTemplateFileAction = vi.fn(() => new Promise((resolve) => { finish = resolve; }));
    const createObjectURL = vi.fn(), selection = { current: 0 };
    const download = callerFunction("downloadDeckPptx", {
      chooseDeckDownloadPlan: () => "template", fillDeckTemplateFileAction,
      base64ToArrayBuffer: () => new ArrayBuffer(0), URL: { createObjectURL },
    });
    const pending = download({ presentationTitle: "Deck", slides: [] }, "template", () => selection.current === 0);
    selection.current++; finish({ base64: "" });
    expect(await pending).toContain("changed while preparing");
    expect(createObjectURL).not.toHaveBeenCalled();
  });
  it("invalidates the active download as soon as library selection becomes pending", async () => {
    let finish!: () => void;
    const templatePendingRef = { current: false }, generation = { current: 0 };
    const downloadDeckPptx = vi.fn((_deck, _id, isCurrent: () => boolean) => new Promise<string | null>((resolve) => { finish = () => resolve(isCurrent() ? null : "selection changed"); }));
    const setDownloadError = vi.fn();
    const handle = callerFunction("handleDownload", {
      pipelineState: { deck: { status: "done", artifact: { slides: [] } } }, sourcesDirty: false, pipelineRevision: { current: 0 },
      templateResolutionPending: false, templatePendingRef, templateChoiceGeneration: generation, templateChoiceRef: { current: { kind: "own" } },
      setDownloading: vi.fn(), setDownloadError, recordTemplateDownload: vi.fn(), pipelineTemplateFailureCategory,
      pipelineLibraryActions: {}, resolveTemplateForDownload: async () => ({ source: { sourceFileId: "" } }), downloadDeckPptx, reviewFill: vi.fn(),
    });
    const pending = handle(); await Promise.resolve();
    templatePendingRef.current = true; generation.current++;
    finish(); await pending;
    expect(setDownloadError).toHaveBeenCalledWith("selection changed");
    const source = readFileSync("src/app/components/presentations/pipeline/PipelineTab.tsx", "utf8");
    expect(source).toContain("templatePendingRef.current = pending; if (pending) templateChoiceGeneration.current += 1");
  });
  it("does not send a whole-deck instruction for stale slides", async () => {
    const fetch = vi.fn();
    const handle = callerFunction("handleApplyToDeck", { pipelineState: { deck: { status: "stale", artifact: { slides: [] } } }, sourcesDirty: false, askInstruction: "Change", operationLock: { current: false }, fetch });
    await handle();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("names and opens the stage that fails during run-to-end", async () => {
    const setActiveStage = vi.fn(), setPipelineError = vi.fn();
    const handle = callerFunction("handleRunToEnd", {
      operationLock: { current: false }, sourcesDirty: false, setPipelineError, setRegenOpen: vi.fn(), setRunningToEnd: vi.fn(), setRunningStage: vi.fn(),
      objectiveRevision: { current: 0 }, pipelineRevision: { current: 0 }, pipelineState: {}, ALL_STAGE_IDS: ["outline"],
      runToEnd: () => ["outline"], runStage: async () => ({ outline: { status: "error" } }), contextText: "", appliedObjectives: [],
      isObjectiveRevisionCurrent: () => true, setPipelineState: vi.fn(), setActiveStage, STAGE_LABELS: { outline: "Outline" },
    });
    await handle();
    expect(setActiveStage).toHaveBeenCalledWith("outline");
    expect(setPipelineError).toHaveBeenCalledWith(expect.stringContaining("Outline failed"));
  });
  it("refuses run and download while source changes are uncommitted", async () => {
    const setPipelineError = vi.fn(), setDownloadError = vi.fn(), runStage = vi.fn(), downloadDeckPptx = vi.fn();
    const run = callerFunction("runOneStage", { operationLock: { current: false }, sourcesDirty: true, setPipelineError, runStage });
    const download = callerFunction("handleDownload", { pipelineState: { deck: { status: "done", artifact: { slides: [] } } }, sourcesDirty: true, setDownloadError, downloadDeckPptx });
    await run("outline"); await download();
    expect(runStage).not.toHaveBeenCalled(); expect(downloadDeckPptx).not.toHaveBeenCalled();
    expect(setPipelineError).toHaveBeenCalledWith(expect.stringContaining("Commit"));
    expect(setDownloadError).toHaveBeenCalledWith(expect.stringContaining("Commit"));
  });
});
