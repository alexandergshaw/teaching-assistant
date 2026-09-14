import { describe, it, expect } from "vitest";
import { dispatch } from "./cli";
import { serializeBacklogYaml } from "./yaml-codec";
import { renderBacklogMarkdown } from "./render";
import type { BacklogItem } from "./types";

const scopedItem: BacklogItem = {
  id: "A1",
  state: "actionable",
  title: "Do the thing",
  owns: ["src/a.ts"],
  verify: "npx vitest run src/a.test.ts",
  blocked_by: [],
  instrument: "",
  from: "",
  note: "",
};
const unscopedItem: BacklogItem = { ...scopedItem, id: "N1", state: "unscoped", owns: [], verify: null };

function deps(items: BacklogItem[], markdownOverride?: string) {
  const yamlText = serializeBacklogYaml(items);
  return {
    readYaml: () => yamlText,
    readMarkdown: () => markdownOverride ?? renderBacklogMarkdown(items),
  };
}

describe("cli dispatch", () => {
  it("render exits 0 and prints the fresh markdown", () => {
    const result = dispatch(["render"], deps([scopedItem]));
    expect(result.exitCode).toBe(0);
    expect(result.output).toBe(renderBacklogMarkdown([scopedItem]));
  });

  it("check-generated exits 0 when the markdown is current", () => {
    const result = dispatch(["check-generated"], deps([scopedItem]));
    expect(result.exitCode).toBe(0);
  });

  it("check-generated exits non-zero when the markdown is stale", () => {
    const result = dispatch(["check-generated"], deps([scopedItem], "# stale\n"));
    expect(result.exitCode).not.toBe(0);
  });

  it("next exits 0 and names the item when one is ready", () => {
    const result = dispatch(["next"], deps([scopedItem]));
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("A1");
  });

  it("next exits a distinct non-zero code for the unscoped result, never silently empty", () => {
    const result = dispatch(["next"], deps([unscopedItem]));
    expect(result.exitCode).toBe(2);
    expect(result.output).toMatch(/unscoped: 1/);
  });

  it("next exits a distinct non-zero code for the empty-drained result", () => {
    const result = dispatch(["next"], deps([]));
    expect(result.exitCode).toBe(3);
    expect(result.output).toMatch(/empty:/);
  });

  it("wave exits 0 and lists items when a wave is available", () => {
    const b1 = { ...scopedItem, id: "A2", owns: ["src/b.ts"] };
    const result = dispatch(["wave"], deps([scopedItem, b1]));
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("A1");
    expect(result.output).toContain("A2");
  });

  it("wave exits non-zero and explains itself when no wave can be formed", () => {
    const result = dispatch(["wave"], deps([scopedItem]));
    expect(result.exitCode).toBe(3);
    expect(result.output).toMatch(/insufficient:/);
  });

  it("an unknown command exits a distinct non-zero code naming the valid commands", () => {
    const result = dispatch(["bogus"], deps([]));
    expect(result.exitCode).toBe(64);
    expect(result.output).toMatch(/render, check-generated, next, wave/);
  });

  // Duplicate ids (Ruling BA-4) must block every selector, not just be a
  // theoretical property of ids.ts - this proves the CLI actually checks
  // before render/next/wave trust the parsed list.
  it("render refuses to proceed when the yaml has duplicate ids", () => {
    const dup = { ...scopedItem, id: "A1" };
    const result = dispatch(["render"], deps([scopedItem, dup]));
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toMatch(/duplicate/);
  });

  it("next refuses to proceed when the yaml has duplicate ids", () => {
    const dup = { ...scopedItem, id: "A1" };
    const result = dispatch(["next"], deps([scopedItem, dup]));
    expect(result.exitCode).not.toBe(0);
    expect(result.output).toMatch(/duplicate/);
  });

  it("is deterministic across repeated calls on the same input", () => {
    const d = deps([scopedItem]);
    expect(dispatch(["next"], d)).toEqual(dispatch(["next"], d));
  });
});
