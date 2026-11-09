import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/app/components/presentations/pipeline/PipelineTab.tsx", "utf8");
describe("pipeline asynchronous guards", () => {
  it("checks prerequisites and rejects stale stage and run-to-end results before applying", () => {
    const one = source.slice(source.indexOf("async function runOneStage"), source.indexOf("async function handleRunToEnd"));
    const all = source.slice(source.indexOf("async function handleRunToEnd"), source.indexOf("async function handleGenerateObjectives"));
    expect(one.indexOf("!canRunStage(pipelineState, stage)")).toBeLessThan(one.indexOf("await runStage"));
    expect(one.indexOf("revision !== pipelineRevision.current")).toBeLessThan(one.indexOf("setPipelineState(next)"));
    expect(all.indexOf("revision !== pipelineRevision.current")).toBeLessThan(all.indexOf("setPipelineState(current)"));
    expect(all).toContain("Commit sources before running the pipeline.");
  });
  it("fences deck changes and source edits and releases the operation lock", () => {
    const ask = source.slice(source.indexOf("async function handleApplyToDeck"), source.indexOf("async function handleDownload"));
    expect(ask.indexOf("revision !== pipelineRevision.current")).toBeLessThan(ask.indexOf("setPipelineState((prev)"));
    expect(ask).toContain("operationLock.current = false");
    expect(source).toContain("setPipelineState(invalidateContextDependents); setContextText(value)");
    expect(source).toContain("pipelineRevision.current += 1; setSourcesDraft(value)");
  });
});
