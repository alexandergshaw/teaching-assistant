import { describe, it, expect } from "vitest";
import { parseBacklogYaml, serializeBacklogYaml } from "./yaml-codec";
import type { BacklogItem } from "./types";

function item(overrides: Partial<BacklogItem> = {}): BacklogItem {
  return {
    id: "V1",
    state: "verification",
    kind: "chore",
    area: "loop-and-docs-maintenance",
    title: "Check the thing",
    owns: [],
    verify: null,
    blocked_by: [],
    instrument: "manual check",
    from: "abc1234",
    note: "",
    ...overrides,
  };
}

describe("yaml-codec round trip", () => {
  it("round-trips a single simple item", () => {
    const items = [item()];
    const text = serializeBacklogYaml(items);
    expect(parseBacklogYaml(text)).toEqual(items);
  });

  it("round-trips multiple items with owns/blocked_by arrays and a real verify command", () => {
    const items = [
      item({
        id: "A1",
        state: "actionable",
        owns: ["src/config/resolver.ts", "src/config/resolver.test.ts"],
        verify: "npx vitest run src/config/resolver.test.ts",
        blocked_by: ["V1"],
      }),
      item({ id: "A2", state: "actionable", owns: [], verify: null }),
    ];
    const text = serializeBacklogYaml(items);
    expect(parseBacklogYaml(text)).toEqual(items);
  });

  it("round-trips text containing single quotes (apostrophes)", () => {
    const items = [
      item({
        title: "Confirm the sweep's prefix form matches; it's the owner's call, not Canvas's.",
        instrument: "It's measured, not assumed",
      }),
    ];
    const text = serializeBacklogYaml(items);
    expect(parseBacklogYaml(text)).toEqual(items);
  });

  it("round-trips an empty string field", () => {
    const items = [item({ instrument: "", from: "", note: "" })];
    const text = serializeBacklogYaml(items);
    expect(parseBacklogYaml(text)).toEqual(items);
  });

  it("round-trips a verify command containing a colon and a doubled-quote-like sequence", () => {
    const items = [
      item({
        id: "A3",
        state: "actionable",
        owns: ["src/x.ts"],
        verify: 'npx vitest run src/x.test.ts -t "some: filter"',
      }),
    ];
    const text = serializeBacklogYaml(items);
    expect(parseBacklogYaml(text)).toEqual(items);
  });

  it("ignores blank lines and whole-line comments when parsing", () => {
    const items = [item({ id: "V2" }), item({ id: "V3" })];
    const raw = serializeBacklogYaml(items);
    const withNoise = `# a leading comment\n\n${raw}\n# a trailing comment\n\n`;
    expect(parseBacklogYaml(withNoise)).toEqual(items);
  });

  it("is deterministic - serializing the same items twice gives byte-identical output", () => {
    const items = [item({ id: "V1" }), item({ id: "V2", owns: ["a"], verify: "cmd" })];
    expect(serializeBacklogYaml(items)).toBe(serializeBacklogYaml(items));
  });

  it("throws on a scalar containing a raw newline rather than silently corrupting the grammar", () => {
    expect(() => serializeBacklogYaml([item({ title: "line one\nline two" })])).toThrow();
  });

  it("throws on a malformed field line instead of guessing", () => {
    expect(() => parseBacklogYaml("- id: 'V1'\n  not a key value pair\n")).toThrow();
  });

  it("throws on an unknown state rather than silently accepting it", () => {
    const raw = "- id: 'V1'\n  state: 'bogus'\n  kind: 'chore'\n  area: 'loop-and-docs-maintenance'\n  title: 't'\n  owns: []\n  verify: null\n  blocked_by: []\n  instrument: ''\n  from: ''\n  note: ''\n";
    expect(() => parseBacklogYaml(raw)).toThrow();
  });

  it("throws on an unknown kind rather than silently accepting it", () => {
    const raw = "- id: 'V1'\n  state: 'verification'\n  kind: 'bogus'\n  area: 'loop-and-docs-maintenance'\n  title: 't'\n  owns: []\n  verify: null\n  blocked_by: []\n  instrument: ''\n  from: ''\n  note: ''\n";
    expect(() => parseBacklogYaml(raw)).toThrow();
  });

  it("throws on an unregistered area slug rather than silently minting a new cluster", () => {
    const raw = "- id: 'V1'\n  state: 'verification'\n  kind: 'chore'\n  area: 'not-a-real-area'\n  title: 't'\n  owns: []\n  verify: null\n  blocked_by: []\n  instrument: ''\n  from: ''\n  note: ''\n";
    expect(() => parseBacklogYaml(raw)).toThrow();
  });

  it("throws when a required field is missing", () => {
    const raw = "- id: 'V1'\n  state: 'owner'\n  kind: 'chore'\n  area: 'loop-and-docs-maintenance'\n  title: 't'\n  owns: []\n  verify: null\n  blocked_by: []\n  instrument: ''\n  from: ''\n";
    expect(() => parseBacklogYaml(raw)).toThrow();
  });
});
