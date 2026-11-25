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
  it("does not mount repository evidence in the grading chat panel", () => {
    const panel = source("GradingChatPanel.tsx");
    expect(scanRuntimeEdges(panel, "GradingChatPanel.tsx").edges.map((edge) => edge.specifier)).not.toContain("./ChatRepositoryEvidence");
    expect(panel).not.toContain("<ChatRepositoryEvidence");
    expect(panel).not.toContain("setRepositoryEvidence");
  });
  it("executes the actual reset handler only after confirmation", () => {
    const panel = source("GradingChatPanel.tsx");
    const handler = panel.slice(panel.indexOf("const handleNewSession"), panel.indexOf("const withPreparing"));
    for (const confirmed of [false, true]) {
      const effects: string[] = [];
      const epoch = { current: 7 };
      const record = (effect: string) => () => effects.push(effect);
      const bindings = {
        window: { confirm: () => confirmed },
        dropSessionEpoch: epoch,
        setVisibleDropEpoch: record("epoch"),
        zipReview: { cancel: record("zip review") },
        resetIntake: record("shared intake"),
        sharedIntakeLatch: {},
        directIntake: { current: { cancel: record("direct intake") } },
        setDirectPreparing: record("direct preparing"),
        setPreparing: record("preparing"),
        setZipPhase: record("zip phase"),
        driver: { reset: record("driver") },
        setPrioritySourceIndices: record("priority"),
        setSetupExpanded: record("setup expanded"),
        archiveReviewQueue: { current: { reset: () => {
          effects.push("archive queue");
          return { wasActive: false, waiting: [] };
        } } },
        setWaitingArchiveNames: record("waiting names"),
        setSubmitError: record("error"),
        setReviewFile: record("review file"),
        setPartialOmissions: record("omissions"),
        setSetupNote: record("setup note"),
      };
      const run = new Function(...Object.keys(bindings), `${handler}; return handleNewSession;`)(...Object.values(bindings));
      run();
      expect(epoch.current).toBe(confirmed ? 8 : 7);
      expect(effects).toEqual(confirmed ? ["epoch", "zip review", "shared intake", "direct intake", "direct preparing", "preparing", "zip phase", "driver", "priority", "setup expanded", "archive queue", "waiting names", "error", "review file", "omissions", "setup note"] : []);
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
