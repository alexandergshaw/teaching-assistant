import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import ts from "typescript";
import { pipelineTemplateFailureCategory, resolveTemplateForDownload } from "./template-choice";

// Execute actual handler declarations with isolated dependencies; no component is rendered.
function callerFunction(name: string, bindings: Record<string, unknown>) {
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
  it("carries the selected choice through a fresh identity resolution into positional fill", () => {
    const caller = readFileSync("src/app/components/presentations/pipeline/PipelineTab.tsx", "utf8");
    const picker = readFileSync("src/app/components/presentations/pipeline/PipelineTemplatePicker.tsx", "utf8");
    expect(caller).toContain("resolveTemplateForDownload(choiceAtStart, pipelineLibraryActions)");
    expect(caller).toContain("downloadDeckPptx(deck, resolution.source.sourceFileId)");
    expect(caller).toContain("fillDeckTemplateFileAction(templateFileId");
    expect(caller).toContain("onChoiceChange={(choice) => {");
    expect(caller).toContain("setTemplateChoice(choice)");
    expect(caller).toContain("effectiveChoice={templateChoice}");
    expect(caller).toContain('templateChoice.kind !== "own"');
    expect(caller).toContain("templateChoiceGeneration.current !== selectionGeneration");
    expect(caller).toContain("disabled={downloading}");
    expect(caller).toContain("templateResolutionPending || !pipelineState.deck.artifact");
    expect(picker).toContain("choiceStateRef.current");
    expect(picker).toContain("initialTemplateChoiceState(effectiveChoice)");
    expect(picker).toContain("const currentChoice = effectiveChoice");
    expect(picker).toContain("gate.current.current(choiceStateRef.current.generation)");
    expect(picker).toContain("onRawTemplateFileIdChange(\"\")");
    expect(picker).toContain("onResolutionPendingChange(true)");
    expect(picker).toContain("<fieldset disabled={disabled}");
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
        pipelineState: { deck: { artifact: { presentationTitle: "private title", slides: [] } } },
        templateResolutionPending: false, templateChoiceGeneration: { current: 0 }, templateChoiceRef: { current: choice },
        setDownloading: vi.fn(), setDownloadError: vi.fn(), recordTemplateDownload, pipelineTemplateFailureCategory,
        pipelineLibraryActions: { getLibrary: vi.fn().mockResolvedValue({ library: { id: "private-library-id", sourceFileId: "private-source-id", name: "private library name" } }), reuseLibrary: vi.fn().mockResolvedValue({ sourceFileId: "private-source-id" }) },
        resolveTemplateForDownload, downloadDeckPptx,
      });
      await handle();
      expect(downloadDeckPptx).toHaveBeenCalledWith(expect.anything(), "private-source-id");
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
      pipelineState: { deck: { artifact: { presentationTitle: "private title", slides: [] } } },
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
});
