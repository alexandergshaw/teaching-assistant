import { describe, it, expect } from "vitest";
import {
  parseBacklogYaml,
  serializeBacklogYaml,
  ownerRowsMissingQuestion,
  assertOwnerRowsHaveQuestion,
} from "./yaml-codec";
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
    question: null,
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

  describe("question field", () => {
    it("round-trips a question containing apostrophes, a colon, and a file:line citation", () => {
      const items = [
        item({
          id: "A29",
          question:
            "ANSWERED 2026-09-23: whether to measure the single-recipient Canvas behaviour first, or design a named refusal and ship without knowing - it's a fork Ruling 17 also touches, cited at src/lib/canvas/inbox.ts:384. The owner's call: the named refusal.",
        }),
      ];
      const text = serializeBacklogYaml(items);
      expect(parseBacklogYaml(text)).toEqual(items);
    });

    it("round-trips null (no question) explicitly", () => {
      const items = [item({ question: null })];
      const text = serializeBacklogYaml(items);
      expect(parseBacklogYaml(text)).toEqual(items);
      expect(text).toContain("question: null");
    });

    it("parses a legacy row with no question: line at all as question: null (backward compatible)", () => {
      const raw =
        "- id: 'V1'\n  state: 'verification'\n  kind: 'chore'\n  area: 'loop-and-docs-maintenance'\n  title: 't'\n  owns: []\n  verify: null\n  blocked_by: []\n  instrument: ''\n  from: ''\n  note: ''\n";
      const [parsed] = parseBacklogYaml(raw);
      expect(parsed.question).toBeNull();
    });

    it("serializes a non-null question with the same single-quote escaping as every other scalar", () => {
      const items = [item({ question: "the owner's own words" })];
      const text = serializeBacklogYaml(items);
      expect(text).toContain("question: 'the owner''s own words'");
    });
  });

  describe("ownerRowsMissingQuestion / assertOwnerRowsHaveQuestion", () => {
    it("flags an owner-state row with no question", () => {
      const items = [item({ id: "L3", state: "owner", question: null })];
      expect(ownerRowsMissingQuestion(items)).toEqual(["L3"]);
      expect(() => assertOwnerRowsHaveQuestion(items)).toThrow(/L3/);
    });

    it("flags an owner-state row whose question is blank, not just absent", () => {
      const items = [item({ id: "L3", state: "owner", question: "   " })];
      expect(ownerRowsMissingQuestion(items)).toEqual(["L3"]);
    });

    it("does not flag an owner-state row that carries a non-empty question", () => {
      const items = [item({ id: "A29", state: "owner", question: "Which fork?" })];
      expect(ownerRowsMissingQuestion(items)).toEqual([]);
      expect(() => assertOwnerRowsHaveQuestion(items)).not.toThrow();
    });

    it("never flags a non-owner row regardless of its question", () => {
      const items = [item({ id: "A1", state: "actionable", question: null })];
      expect(ownerRowsMissingQuestion(items)).toEqual([]);
    });
  });

  // The guard is only worth having if PARSING enforces it - an exported
  // helper nobody calls is documentation. These tests bind parseBacklogYaml
  // itself, so render, check-generated and backlog-file.structure.test.ts all
  // inherit the refusal.
  describe("parseBacklogYaml REJECTS an owner row with no usable question", () => {
    // One row per case, written as raw YAML rather than round-tripped from
    // serializeBacklogYaml, because the absent-line case cannot be produced
    // by the serializer at all (it always writes `question: null`).
    const ownerRow = (questionLine: string | null): string =>
      [
        "- id: 'L3'",
        "  state: 'owner'",
        "  kind: 'bug'",
        "  area: 'loop-and-docs-maintenance'",
        "  title: 't'",
        "  owns: []",
        "  verify: null",
        "  blocked_by: []",
        "  instrument: ''",
        "  from: ''",
        "  note: ''",
        ...(questionLine === null ? [] : [questionLine]),
        "",
      ].join("\n");

    it("throws when the owner row has NO question line at all", () => {
      expect(() => parseBacklogYaml(ownerRow(null))).toThrow(/L3/);
    });

    it("throws when the owner row has an explicit question: null", () => {
      expect(() => parseBacklogYaml(ownerRow("  question: null"))).toThrow(/L3/);
    });

    // The blank cases are the ones that decide whether the guard is real.
    // A guard satisfiable by '' buys nothing: the first person in a hurry
    // types two quotes and the row is parked again with no question, while
    // every gate stays green.
    it("throws when the owner row's question is the EMPTY string, not just absent", () => {
      expect(() => parseBacklogYaml(ownerRow("  question: ''"))).toThrow(/L3/);
    });

    it("throws when the owner row's question is only whitespace", () => {
      expect(() => parseBacklogYaml(ownerRow("  question: '   '"))).toThrow(/L3/);
    });

    it("names EVERY offending owner row, not only the first", () => {
      const raw =
        ownerRow(null).replace("- id: 'L3'", "- id: 'L3'") +
        ownerRow("  question: ''").replace("- id: 'L3'", "- id: 'A4'");
      expect(() => parseBacklogYaml(raw)).toThrow(/L3/);
      expect(() => parseBacklogYaml(raw)).toThrow(/A4/);
    });

    it("accepts the same row once it carries a real question", () => {
      const raw = ownerRow("  question: 'Which of the two readings did you mean, and what does being wrong cost?'");
      const [parsed] = parseBacklogYaml(raw);
      expect(parsed.id).toBe("L3");
      expect(parsed.question).toBe("Which of the two readings did you mean, and what does being wrong cost?");
    });

    it("still accepts a NON-owner row with no question line, so the pre-field rows keep parsing", () => {
      const raw = ownerRow(null).replace("  state: 'owner'", "  state: 'actionable'");
      const [parsed] = parseBacklogYaml(raw);
      expect(parsed.state).toBe("actionable");
      expect(parsed.question).toBeNull();
    });
  });

  // The committed file is the thing the guard exists to protect. This binds
  // the real docs/backlog.yml rather than a fixture: if any future hand-edit
  // parks a row in `owner` without a question, this fails here as well as in
  // render and check-generated.
  describe("the committed docs/backlog.yml satisfies the guard", () => {
    it("parses, and reports no owner row missing a question", async () => {
      const { readFileSync } = await import("node:fs");
      const text = readFileSync("docs/backlog.yml", "utf8");
      const items = parseBacklogYaml(text);
      expect(items.length).toBeGreaterThan(0);
      expect(ownerRowsMissingQuestion(items)).toEqual([]);
      expect(items.filter((i) => i.state === "owner").length).toBeGreaterThan(0);
    });
  });
});
