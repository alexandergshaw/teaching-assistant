// resolve-codebase-repo (steps.course-build-codebase.ts) - the "Codebase and
// associated assignments" output family's own gate/resolver step. Three
// behaviors to prove, matching that step's own header comment:
//  - deselected: does no work, returns a blank "repo" output, regardless of
//    what "repo" input it was given (AC2 - "deselected passes files through
//    unchanged" for a step that touches no `files` at all means "does
//    nothing observable downstream").
//  - selected with a codebase-anchored source (a non-blank "repo" input,
//    course-schedule-from-source's own "repo" output): passes that
//    repository through unchanged.
//  - selected without a codebase-anchored source (a blank "repo" input):
//    fails loudly, naming the fix - never a silent empty success (the
//    "Honesty requirement"/incompatible-source case this family's own AC
//    calls out explicitly).
import { describe, it, expect } from "vitest";
import { courseBuildCodebaseSteps } from "./steps.course-build-codebase";

const step = courseBuildCodebaseSteps.find((s) => s.type === "resolve-codebase-repo")!;

const noop = () => {};

describe("resolve-codebase-repo step", () => {
  it("is registered with the expected inputs and a single 'repo' output", () => {
    expect(step, "resolve-codebase-repo is registered").toBeTruthy();
    expect(step.inputs.map((i) => i.key).sort()).toEqual(["repo", "selected"]);
    expect(step.outputs).toEqual([{ key: "repo", label: "Repository", type: "repo" }]);
  });

  it("deselected: does no work and returns a blank repo output even when a repo WAS supplied", async () => {
    const result = await step.run({ repo: "org/repo", selected: "" }, undefined as never, noop);
    expect(result.outputs).toEqual({ repo: "" });
    expect(result.summary).toEqual({
      kind: "text",
      text: "Skipped - Codebase and associated assignments was not selected in this run's output selection.",
    });
  });

  it("selected with a codebase-anchored source: passes the resolved repo through unchanged", async () => {
    const result = await step.run({ repo: "org/repo", selected: "1" }, undefined as never, noop);
    expect(result.outputs).toEqual({ repo: "org/repo" });
    expect(result.summary).toEqual({
      kind: "text",
      text: "Using org/repo for the codebase and its associated assignments.",
    });
  });

  it("selected without a codebase-anchored source (blank repo): throws a clear, actionable error rather than silently producing nothing", async () => {
    await expect(step.run({ repo: "", selected: "1" }, undefined as never, noop)).rejects.toThrow(
      /no codebase to attach it to/
    );
  });

  it("selected with only whitespace in the repo input: treated the same as blank (fails loudly, not a silent empty success)", async () => {
    await expect(step.run({ repo: "   ", selected: "1" }, undefined as never, noop)).rejects.toThrow(
      /no codebase to attach it to/
    );
  });

  it("an unbound 'selected' input (undefined) defaults to generate - matches isGeneratorSelected's own unbound-means-on convention", async () => {
    const result = await step.run({ repo: "org/repo" }, undefined as never, noop);
    expect(result.outputs).toEqual({ repo: "org/repo" });
  });
});
