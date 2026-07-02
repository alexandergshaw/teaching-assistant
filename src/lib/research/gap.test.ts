import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./db", () => ({
  searchKnowledgeRows: vi.fn(),
  upsertKnowledge: vi.fn(),
}));
vi.mock("./external", () => ({
  searchWikipedia: vi.fn(),
  searchStackExchange: vi.fn(),
}));

import { measureCoverage, ensureTopicKnowledge, gapThreshold } from "./gap";
import { searchKnowledgeRows, upsertKnowledge, type KnowledgeRow } from "./db";
import { searchWikipedia, searchStackExchange } from "./external";

const mockSearchRows = vi.mocked(searchKnowledgeRows);
const mockUpsert = vi.mocked(upsertKnowledge);
const mockWiki = vi.mocked(searchWikipedia);
const mockStack = vi.mocked(searchStackExchange);

function coveringRow(id: string, topics: string[]): KnowledgeRow {
  return {
    id,
    kind: "case_study",
    source: "curated",
    title: id,
    topics,
    summary: "s",
    lesson: null,
    organization: null,
    year: null,
    language: null,
    difficulty: null,
    prompt: null,
    example_code: null,
    solution_code: null,
    url: null,
    verified: true,
    created_at: "",
    updated_at: "",
  };
}

const FIVE_COVERING = Array.from({ length: 5 }, (_, i) =>
  coveringRow(`row-${i}`, ["loops", "iteration"])
);

beforeEach(() => {
  vi.clearAllMocks();
  mockWiki.mockResolvedValue([]);
  mockStack.mockResolvedValue([]);
  mockUpsert.mockResolvedValue(0);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("measureCoverage", () => {
  it("reports full coverage when every term matches with depth", async () => {
    mockSearchRows.mockResolvedValue(FIVE_COVERING);
    const report = await measureCoverage("loops and iteration");
    expect(report.coverage).toBe(1);
    expect(report.gap).toBe(0);
    expect(report.uncoveredTerms).toEqual([]);
  });

  it("reports a full gap when the knowledge base has nothing", async () => {
    mockSearchRows.mockResolvedValue([]);
    const report = await measureCoverage("quantum entanglement basics");
    expect(report.coverage).toBe(0);
    expect(report.gap).toBe(1);
    expect(report.uncoveredTerms.length).toBeGreaterThan(0);
  });

  it("blends partial term coverage with depth", async () => {
    // One row matching one of two terms.
    mockSearchRows.mockResolvedValue([coveringRow("r", ["loops"])]);
    const report = await measureCoverage("loops recursion");
    expect(report.termCoverage).toBe(0.5);
    expect(report.depth).toBeCloseTo(0.2);
    expect(report.coverage).toBeCloseTo(0.6 * 0.5 + 0.4 * 0.2);
  });

  it("treats an unmeasurable topic as covered so no loop runs", async () => {
    const report = await measureCoverage("   ");
    expect(report.gap).toBe(0);
  });
});

describe("gapThreshold", () => {
  it("defaults to 0.5 and honors a valid override", () => {
    expect(gapThreshold()).toBe(0.5);
    vi.stubEnv("KNOWLEDGE_GAP_THRESHOLD", "0.8");
    expect(gapThreshold()).toBe(0.8);
    vi.stubEnv("KNOWLEDGE_GAP_THRESHOLD", "nonsense");
    expect(gapThreshold()).toBe(0.5);
  });
});

describe("ensureTopicKnowledge", () => {
  it("skips the loop when coverage is above the threshold", async () => {
    mockSearchRows.mockResolvedValue(FIVE_COVERING);
    const report = await ensureTopicKnowledge("loops and iteration");
    expect(report.loopRan).toBe(false);
    expect(report.stored).toBe(0);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockWiki).not.toHaveBeenCalled();
  });

  it("runs the loop above the threshold: retrieves, stores, re-measures", async () => {
    // Before: nothing known. After the round's upsert: fully covered.
    mockSearchRows.mockResolvedValueOnce([]).mockResolvedValue(FIVE_COVERING);
    mockWiki.mockResolvedValue([
      { source: "wikipedia", id: "wikipedia:loops", title: "Loop (computing)", summary: "A loop repeats.", url: "https://en.wikipedia.org/wiki/Loop" },
    ]);
    mockStack.mockResolvedValue([
      { source: "stackexchange", id: "stackexchange:1", title: "How do loops work?", summary: "Q", url: "https://stackoverflow.com/q/1" },
    ]);
    mockUpsert.mockImplementation(async (rows) => rows.length);

    const report = await ensureTopicKnowledge("loops iteration");
    expect(report.loopRan).toBe(true);
    expect(report.rounds).toBe(1);
    expect(report.stored).toBe(2);
    expect(report.after.gap).toBe(0);

    // Stored rows are unverified and keep their provenance.
    const rows = mockUpsert.mock.calls[0][0];
    const wikiRow = rows.find((r) => r.id === "wikipedia:loops");
    expect(wikiRow).toMatchObject({ kind: "case_study", source: "wikipedia", verified: false });
    expect(rows.find((r) => r.id === "stackexchange:1")).toMatchObject({
      kind: "practice_problem",
      source: "stackexchange",
    });
  });

  it("stops when the network yields nothing instead of spinning", async () => {
    mockSearchRows.mockResolvedValue([]);
    const report = await ensureTopicKnowledge("obscure topic nothing knows");
    expect(report.loopRan).toBe(true);
    expect(report.stored).toBe(0);
    expect(report.rounds).toBe(1);
    expect(report.after.gap).toBe(1);
  });

  it("is bounded by the round budget when the gap never closes", async () => {
    mockSearchRows.mockResolvedValue([]);
    mockWiki.mockResolvedValue([
      { source: "wikipedia", id: "wikipedia:x", title: "X", summary: "s", url: "https://en.wikipedia.org/wiki/X" },
    ]);
    mockUpsert.mockImplementation(async (rows) => rows.length);
    const report = await ensureTopicKnowledge("topic that stays uncovered");
    expect(report.rounds).toBe(2);
    expect(report.loopRan).toBe(true);
  });
});
