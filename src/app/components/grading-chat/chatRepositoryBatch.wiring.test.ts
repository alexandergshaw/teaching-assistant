import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { scanRuntimeEdges, walkRuntimeGraph } from "@/lib/module-graph/runtime-import-graph";
import { ALLOWED_ASSET_EXTENSIONS, ALLOWED_BARE_SPECIFIERS } from "@/lib/module-graph/client-boundary-policy";

const src = join(process.cwd(), "src");
const directory = join(src, "app/components/grading-chat");
const source = (name: string) => ts.transpileModule(readFileSync(join(directory, name), "utf8"), { compilerOptions: { removeComments: true, jsx: ts.JsxEmit.Preserve, target: ts.ScriptTarget.ESNext } }).outputText;
describe("repository staging live caller boundary (source only)", () => {
  it("mounts in the live panel and keeps state above navigation and confirmed reset", () => {
    const panel = source("GradingChatPanel.tsx");
    expect(scanRuntimeEdges(panel, "GradingChatPanel.tsx").edges.map((edge) => edge.specifier)).toContain("./ChatRepositoryEvidence");
    expect(panel).toContain("useState(emptyRepositoryEvidence)");
    expect(panel).toMatch(/<ChatRepositoryEvidence key=\{repositoryEvidenceSession\} evidence=\{repositoryEvidence\} onChange=\{setRepositoryEvidence\}/);
    const reset = panel.slice(panel.indexOf("const handleNewSession"), panel.indexOf("const withPreparing"));
    expect(reset.indexOf("window.confirm")).toBeLessThan(reset.indexOf("return;"));
    expect(reset.indexOf("return;")).toBeLessThan(reset.indexOf("setRepositoryEvidence(emptyRepositoryEvidence())"));
    expect(panel.match(/setRepositoryEvidence\(emptyRepositoryEvidence\(\)\)/g)).toHaveLength(1);
    expect(panel.match(/setRepositoryEvidenceSession\(/g)).toHaveLength(1);
    expect(reset).toContain("setRepositoryEvidenceSession((session) => session + 1)");
    expect(source("ChatRepositoryEvidence.tsx")).toContain('useState("")');
  });
  it("executes the actual reset handler: cancellation preserves the draft key and confirmation changes it", () => {
    const panel = source("GradingChatPanel.tsx");
    const handler = panel.slice(panel.indexOf("const handleNewSession"), panel.indexOf("const withPreparing"));
    for (const confirmed of [false, true]) {
      let key = 7;
      const effects: string[] = [];
      const run = new Function("window", "driver", "roleIntake", "repositoryProposals", "setRepositoryEvidence", "emptyRepositoryEvidence", "setRepositoryEvidenceSession", "setSubmitError", "setSetupNote", `${handler}; return handleNewSession;`)({ confirm: () => confirmed }, { reset: () => effects.push("driver") }, { cancel: () => effects.push("roles") }, { reset: () => effects.push("proposals") }, () => effects.push("evidence"), () => ({ lines: [], error: null }), (update: (value: number) => number) => { key = update(key); }, () => effects.push("error"), () => effects.push("setup"));
      run();
      expect(key).toBe(confirmed ? 8 : 7);
      expect(effects).toEqual(confirmed ? ["driver", "roles", "proposals", "evidence", "error", "setup"] : []);
    }
  });
  it("calls the parser and safe diagnostics without grading controls", () => {
    const component = source("ChatRepositoryEvidence.tsx");
    expect(component).toContain("stageRepositoryBatchResult(draft, evidence)");
    expect(component).toContain("recordRepositoryBatchResult(next, {");
    expect(component).toContain("onChange(next.state)");
    expect(component).toContain("Confirm existing students and scopes below before fetching.");
    expect(component).not.toMatch(/onSubmit|driver\.|fetch\(|Grade<|Review</);
  });
  it("keeps staging policy aligned with the current session and URL limits without importing server code", () => {
    const hook = source("useContinuousGradingRun.ts");
    const route = ts.transpileModule(readFileSync(join(src, "app/api/grade-run-item/route.ts"), "utf8"), { compilerOptions: { removeComments: true } }).outputText;
    expect(hook).toContain("DEFAULT_MAX_ENTRIES = 40");
    expect(route).toContain("MAX_URL_CHARS = 2048");
    const parser = source("chatRepositoryBatch.ts");
    expect(parser).toContain("REPOSITORY_BATCH_LINES = 40");
    expect(parser).toContain("REPOSITORY_RETAINED_LINKS = 40");
    expect(parser).toContain("REPOSITORY_URL_LENGTH = 2048");
  });
  it("walks the staging import closure without a server wall, forbidding network, grading, posting and execution modules", () => {
    const options = { srcRoot: src, forbiddenPathPrefixes: ["app/actions", "app/api", "lib/grade/engine", "lib/grade/repo-content", "lib/github", "lib/canvas", "lib/llm", "lib/gemini", "lib/code-runner", "lib/supabase"], browserSafeModules: [], forbiddenBareSpecifiers: ["node:https", "node:http", "https", "http", "child_process", "node:child_process"], allowedBareSpecifiers: ALLOWED_BARE_SPECIFIERS, allowedAssetExtensions: ALLOWED_ASSET_EXTENSIONS, treatUseServerAsWall: false };
    expect(walkRuntimeGraph([join(directory, "ChatRepositoryEvidence.tsx")], options).violations).toEqual([]);
    expect(walkRuntimeGraph([join(directory, "GradingChatPanel.tsx")], options).violations.length).toBeGreaterThan(0);
  });
});
