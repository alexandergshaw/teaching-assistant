import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getDbClient: vi.fn(),
}));

import { rubricFingerprint, pickBankedRubric, rememberRubric, findRubricForTopic } from "./rubric-bank";
import { getDbClient } from "./db";
import type { Database } from "@/lib/supabase/types";

type RubricRow = Database["public"]["Tables"]["rubric_bank"]["Row"];

const mockGetDbClient = vi.mocked(getDbClient);

function row(overrides: Partial<RubricRow>): RubricRow {
  return {
    id: "abc",
    topics: ["loops", "iteration", "python"],
    instructions_excerpt: "Write a python program using loops and iteration.",
    rubric_text: "Correct loop usage (50%): ...\nOutput correctness (50%): ...",
    source: "supplied",
    created_at: "",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetDbClient.mockResolvedValue(null);
});

describe("rubricFingerprint", () => {
  it("is stable across whitespace and case differences", () => {
    expect(rubricFingerprint("Criterion A (50%): do the thing")).toBe(
      rubricFingerprint("  criterion a  (50%):  do THE thing \n")
    );
    expect(rubricFingerprint("a")).not.toBe(rubricFingerprint("b"));
  });
});

describe("pickBankedRubric", () => {
  it("picks a strongly matching rubric for the same topic", () => {
    const best = pickBankedRubric([row({})], "A python assignment about loops and iteration.");
    expect(best?.rubric_text).toContain("Correct loop usage");
  });

  it("refuses weak matches so generation stays grounded in the instructions", () => {
    // Only one topic term overlaps: below the match threshold.
    expect(pickBankedRubric([row({})], "An essay about python snakes in the wild")).toBeNull();
    expect(pickBankedRubric([row({})], "A history essay about ancient Rome")).toBeNull();
  });

  it("prefers the higher-scoring rubric", () => {
    const weak = row({ id: "weak", topics: ["loops"], rubric_text: "WEAK" });
    const strong = row({ id: "strong", rubric_text: "STRONG" });
    const best = pickBankedRubric([weak, strong], "python loops and iteration practice");
    expect(best?.rubric_text).toBe("STRONG");
  });
});

describe("without a database", () => {
  it("remembers nothing and finds nothing, without throwing", async () => {
    expect(
      await rememberRubric("Loops assignment", "Criterion A (50%): loop usage.\nCriterion B (50%): output.")
    ).toBe(0);
    expect(await findRubricForTopic("Loops assignment")).toBeNull();
  });
});

describe("with a database", () => {
  it("stores supplied rubrics idempotently and serves them back for the topic", async () => {
    const store = new Map<string, RubricRow>();
    const fake = {
      from: () => ({
        upsert: async (
          rows: Array<{ id: string; topics: string[]; instructions_excerpt: string; rubric_text: string }>,
          options: { ignoreDuplicates: boolean }
        ) => {
          for (const r of rows) {
            if (options.ignoreDuplicates && store.has(r.id)) continue;
            store.set(r.id, { ...r, source: "supplied", created_at: "" });
          }
          return { error: null };
        },
        select: () => ({
          overlaps: (_c: string, terms: string[]) => ({
            limit: async () => ({
              data: [...store.values()].filter((r) => r.topics.some((t) => terms.includes(t))),
              error: null,
            }),
          }),
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetDbClient.mockResolvedValue(fake as any);

    const rubricText = "Correct loop usage (50%): uses for/while correctly.\nOutput correctness (50%): matches spec.";
    expect(await rememberRubric("Write a python program using loops and iteration.", rubricText)).toBe(1);
    // Same rubric again: still one stored row.
    await rememberRubric("Write a python program using loops and iteration.", rubricText);
    expect(store.size).toBe(1);

    const found = await findRubricForTopic("Another python assignment on loops and iteration");
    expect(found).toBe(rubricText);

    // A different topic gets nothing.
    expect(await findRubricForTopic("A pottery glazing assignment")).toBeNull();
  });
});
