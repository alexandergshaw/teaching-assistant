import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getDbClient: vi.fn(),
}));

import {
  slugifyTerm,
  rememberDefinitions,
  lookupDefinitionsForPhrases,
  answerFromGlossary,
} from "./glossary";
import { getDbClient } from "./db";

const mockGetDbClient = vi.mocked(getDbClient);

interface StoredRow {
  id: string;
  term: string;
  definition: string;
  source: string;
  created_at: string;
}

/** A fake service client backed by an in-memory row store. */
function fakeClient(store: Map<string, StoredRow>) {
  return {
    from: () => ({
      upsert: async (
        rows: Array<{ id: string; term: string; definition: string }>,
        options: { ignoreDuplicates: boolean }
      ) => {
        for (const row of rows) {
          if (options.ignoreDuplicates && store.has(row.id)) continue;
          store.set(row.id, { ...row, source: "materials", created_at: "" });
        }
        return { error: null };
      },
      select: () => ({
        in: async (_column: string, values: string[]) => ({
          data: values.map((v) => store.get(v)).filter(Boolean),
          error: null,
        }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("slugifyTerm", () => {
  it("canonicalizes terms", () => {
    expect(slugifyTerm("Binary Search Tree")).toBe("binary-search-tree");
    expect(slugifyTerm("  SQL!! ")).toBe("sql");
  });
});

describe("glossary without a database", () => {
  it("stores nothing and finds nothing, without throwing", async () => {
    mockGetDbClient.mockResolvedValue(null);
    expect(await rememberDefinitions([{ term: "Recursion", definition: "Recursion is when a function calls itself." }])).toBe(0);
    expect((await lookupDefinitionsForPhrases(["recursion"])).size).toBe(0);
    expect(await answerFromGlossary("What is recursion?")).toBeNull();
  });
});

describe("glossary with a database", () => {
  it("remembers definitions first-wins and resolves them for phrases", async () => {
    const store = new Map<string, StoredRow>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetDbClient.mockResolvedValue(fakeClient(store) as any);

    const stored = await rememberDefinitions([
      { term: "Recursion", definition: "Recursion is when a function calls itself to solve a smaller problem." },
      { term: "x", definition: "Too-short term is skipped despite a long definition." },
      { term: "Stack", definition: "short" }, // definition too short, skipped
    ]);
    expect(stored).toBe(1);

    // First-wins: a later definition for the same term does not overwrite.
    await rememberDefinitions([{ term: "recursion", definition: "A different, later definition that should not replace it." }]);
    expect(store.get("recursion")!.definition).toContain("calls itself");

    const defs = await lookupDefinitionsForPhrases(["understand recursion deeply", "unrelated phrase"]);
    expect(defs.get("understand recursion deeply")).toContain("calls itself");
    expect(defs.has("unrelated phrase")).toBe(false);
  });

  it("answers define-intent questions from the glossary with attribution", async () => {
    const store = new Map<string, StoredRow>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockGetDbClient.mockResolvedValue(fakeClient(store) as any);
    await rememberDefinitions([
      { term: "Recursion", definition: "Recursion is when a function calls itself to solve a smaller problem." },
    ]);

    const answer = await answerFromGlossary("What is recursion?");
    expect(answer).toContain("calls itself");
    expect(answer).toContain("(From your course glossary.)");

    // Non-definition questions never fire the glossary.
    expect(await answerFromGlossary("When is the recursion homework due?")).toBeNull();
  });
});
