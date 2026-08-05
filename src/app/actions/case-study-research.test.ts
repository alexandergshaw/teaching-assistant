import { describe, it, expect, vi, beforeEach } from "vitest";

// researchCourseCaseStudiesAction calls requireOwner() (auth), callLlm() (network,
// TWICE per run - see the grounding-split test below), and upsertKnowledge()
// (db write). All three are mocked so the pipeline logic itself (the grounding
// split, verification/corroboration, dedupe, idempotent ids, truncation
// reporting, degraded-path handling) runs for real without a Supabase session,
// the Gemini API, or a live database. verifyItemUrls (current-events-report.ts)
// is NOT mocked - it is pure, and is exercised with real test-domain URLs/
// sources the same way current-events.test.ts does.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

vi.mock("@/lib/research/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/research/db")>("@/lib/research/db");
  return { ...actual, upsertKnowledge: vi.fn() };
});

import { callLlm, type LlmResult } from "@/lib/llm";
import { requireOwner } from "@/lib/supabase/auth";
import { upsertKnowledge, type KnowledgeInsert } from "@/lib/research/db";
import { researchCourseCaseStudiesAction } from "./case-study-research";

const weeks = [{ week: 1, topic: "Ethics in Technology", summary: "Case studies in professional ethics." }];

// Call 1 of the pair: grounded prose search.
function proseResult(text: string, sources: Array<{ title: string; uri: string }> = []): LlmResult {
  return { ok: true, text, sources };
}

// Call 2 of the pair: structuring that prose into {"caseStudies": [...]}.
function structureResult(caseStudies: Array<Record<string, unknown>>): LlmResult {
  return { ok: true, text: JSON.stringify({ caseStudies }) };
}

interface CandidateFixture {
  organization?: string;
  title?: string;
  year?: string;
  topics?: string[];
  summary?: string[];
  lesson?: string;
  url?: string;
}

function candidate(overrides: CandidateFixture = {}): Record<string, unknown> {
  return {
    organization: "Test Org",
    title: "Test Title",
    year: "2010",
    topics: ["topic"],
    summary: ["Something happened."],
    lesson: "A lesson learned.",
    url: "https://real-source.test/story",
    ...overrides,
  };
}

const REAL_SOURCE = { title: "Real Source", uri: "https://real-source.test/article" };

function rowsPassedToUpsert(callIndex = 0): KnowledgeInsert[] {
  return vi.mocked(upsertKnowledge).mock.calls[callIndex][0];
}

describe("researchCourseCaseStudiesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  // ── 1. THE GROUNDING SPLIT ──────────────────────────────────────────────────
  // Load-bearing: pairing "search the web" with a strict JSON contract in ONE
  // call silently disables Gemini's grounding (module doc comment in
  // case-study-research.ts). If these two calls are ever merged back into one,
  // this test must fail.
  it("makes exactly two llm calls: call 1 grounded with no strict-JSON instruction, call 2 ungrounded demanding valid JSON", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce(proseResult("Some research prose about an organization.", [REAL_SOURCE]))
      .mockResolvedValueOnce(structureResult([]));

    await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");

    expect(callLlm).toHaveBeenCalledTimes(2);

    const [firstReq] = vi.mocked(callLlm).mock.calls[0];
    const [secondReq] = vi.mocked(callLlm).mock.calls[1];
    const firstPrompt = (firstReq.contents[0].parts[0] as { text: string }).text;
    const secondPrompt = (secondReq.contents[0].parts[0] as { text: string }).text;

    expect(firstReq.webSearch).toBe(true);
    expect(firstPrompt).not.toMatch(/ONLY valid JSON/i);

    expect(secondReq.webSearch).toBeFalsy();
    expect(secondPrompt).toMatch(/ONLY valid JSON/i);
  });

  // ── 2. EMBEDDED GUARD ────────────────────────────────────────────────────────
  // callLlm ignores its provider argument and always calls Gemini - a real,
  // billed call - so the embedded guard must run before anything else,
  // including requireOwner().
  it("returns a zeroed summary and makes zero llm calls or auth checks for the embedded provider", async () => {
    const result = await researchCourseCaseStudiesAction(weeks, "A course description", "embedded");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.stored).toBe(0);
    expect(result.corroborated).toBe(0);
    expect(result.uncorroborated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.organizations).toEqual([]);
    expect(result.notes.some((n) => n.includes("Embedded provider"))).toBe(true);

    expect(callLlm).not.toHaveBeenCalled();
    expect(requireOwner).not.toHaveBeenCalled();
    expect(upsertKnowledge).not.toHaveBeenCalled();
  });

  // ── 3. VERIFICATION GATES THE YEAR, NOT THE ENTRY ───────────────────────────
  it("stores a candidate with a corroborated url WITH its year, and a candidate with an uncorroborated url STILL STORED but WITHOUT a year", async () => {
    const corroborated = candidate({
      organization: "Corroborated Org",
      year: "2010",
      url: "https://real-source.test/story-a", // same host as REAL_SOURCE -> corroborated
    });
    const uncorroborated = candidate({
      organization: "Uncorroborated Org",
      year: "2012",
      url: "https://unrelated-domain.test/story-b", // different host -> not corroborated
    });

    vi.mocked(callLlm)
      .mockResolvedValueOnce(proseResult("Prose describing both organizations.", [REAL_SOURCE]))
      .mockResolvedValueOnce(structureResult([corroborated, uncorroborated]));
    vi.mocked(upsertKnowledge).mockImplementation(async (rows) => rows.length);

    const result = await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");
    expect("error" in result).toBe(false);

    const rows = rowsPassedToUpsert();
    expect(rows).toHaveLength(2);

    const rowA = rows.find((r) => r.organization === "Corroborated Org");
    const rowB = rows.find((r) => r.organization === "Uncorroborated Org");
    expect(rowA?.year).toBe(2010);
    expect(rowB?.year).toBeNull();
  });

  // ── 4. CORROBORATED COUNT MEANS PLANNER-USABLE ──────────────────────────────
  it("stores a candidate with a corroborated year but no lesson, and counts it as uncorroborated (not corroborated) with a note naming what is missing", async () => {
    const noLesson = candidate({
      organization: "No Lesson Org",
      year: "2015",
      url: "https://real-source.test/story-c",
      lesson: "",
    });

    vi.mocked(callLlm)
      .mockResolvedValueOnce(proseResult("Prose describing the organization.", [REAL_SOURCE]))
      .mockResolvedValueOnce(structureResult([noLesson]));
    vi.mocked(upsertKnowledge).mockImplementation(async (rows) => rows.length);

    const result = await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.stored).toBe(1);
    expect(result.corroborated).toBe(0);
    expect(result.uncorroborated).toBe(1);
    expect(result.notes.some((n) => n.includes("No Lesson Org") && n.includes("no lesson"))).toBe(true);

    const rows = rowsPassedToUpsert();
    expect(rows[0].year).toBe(2015); // the year itself is still stored - only the reported bucket changes
  });

  // ── 5. IDEMPOTENT ID ─────────────────────────────────────────────────────────
  it("derives a deterministic id from the organization name alone (same id across two runs even at a different position in the candidate list), distinct from the curated id space", async () => {
    const org = candidate({ organization: "Consistency Corp", url: "https://real-source.test/story-d" });
    // A second, unrelated candidate that only appears in run two, ahead of
    // "Consistency Corp" in the array - this pins the target organization to
    // index 0 in run one but index 1 in run two, so an id that (incorrectly)
    // incorporated the candidate's array position would differ between runs
    // even though the organization name is identical.
    const decoy = candidate({ organization: "Decoy Org", url: "https://real-source.test/story-decoy" });

    vi.mocked(callLlm)
      .mockResolvedValueOnce(proseResult("Prose about Consistency Corp.", [REAL_SOURCE]))
      .mockResolvedValueOnce(structureResult([org]))
      .mockResolvedValueOnce(proseResult("Prose about Consistency Corp, run two.", [REAL_SOURCE]))
      .mockResolvedValueOnce(structureResult([decoy, org]));
    vi.mocked(upsertKnowledge).mockImplementation(async (rows) => rows.length);

    await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");
    await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");

    expect(upsertKnowledge).toHaveBeenCalledTimes(2);
    const idRun1 = rowsPassedToUpsert(0)[0].id;
    const idRun2 = rowsPassedToUpsert(1).find((r) => r.organization === "Consistency Corp")?.id;

    expect(idRun1).toBe(idRun2);
    // Carries the researched-entry prefix, never a curated id like "therac-25" -
    // so a researched run can never silently overwrite a curated entry.
    expect(idRun1).toMatch(/^researched-case-study-/);
  });

  // ── 6. IN-RUN DUPLICATE DEDUPE ───────────────────────────────────────────────
  it("collapses two candidates that resolve to the same organization into exactly one upserted row, counting the second as skipped", async () => {
    const first = candidate({ organization: "Duplicate Org", url: "https://real-source.test/story-e" });
    const second = candidate({ organization: "Duplicate Org", url: "https://real-source.test/story-f", year: "1999" });

    vi.mocked(callLlm)
      .mockResolvedValueOnce(proseResult("Prose mentioning Duplicate Org twice.", [REAL_SOURCE]))
      .mockResolvedValueOnce(structureResult([first, second]));
    vi.mocked(upsertKnowledge).mockImplementation(async (rows) => rows.length);

    const result = await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(upsertKnowledge).toHaveBeenCalledTimes(1);
    const rows = rowsPassedToUpsert();
    expect(rows).toHaveLength(1); // a duplicate conflict id in one upsert call would be rejected by Postgres

    expect(result.skipped).toBe(1);
    expect(result.notes.some((n) => n.toLowerCase().includes("duplicate"))).toBe(true);
  });

  // ── 7. STORAGE INVARIANTS ────────────────────────────────────────────────────
  it("stores every row with verified: false, source: 'researched', kind: 'case_study' - never verified: true", async () => {
    const corroborated = candidate({
      organization: "Invariant Org A",
      year: "2005",
      url: "https://real-source.test/story-g",
    });
    const uncorroborated = candidate({
      organization: "Invariant Org B",
      year: "",
      url: "https://unrelated-domain.test/story-h",
    });

    vi.mocked(callLlm)
      .mockResolvedValueOnce(proseResult("Prose about both organizations.", [REAL_SOURCE]))
      .mockResolvedValueOnce(structureResult([corroborated, uncorroborated]));
    vi.mocked(upsertKnowledge).mockImplementation(async (rows) => rows.length);

    await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");

    const rows = rowsPassedToUpsert();
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.verified).toBe(false);
      expect(row.source).toBe("researched");
      expect(row.kind).toBe("case_study");
    }
  });

  // ── 8. TRUNCATION IS REPORTED, NOT SILENT ───────────────────────────────────
  it("surfaces a note when the grounded prose exceeds the structuring input cap, naming that later weeks may be missing", async () => {
    // STRUCTURE_INPUT_CHAR_CAP (case-study-research.ts) is 40000 characters -
    // this comfortably exceeds it without needing to import the private constant.
    const oversizedProse = "A".repeat(45000);

    vi.mocked(callLlm)
      .mockResolvedValueOnce(proseResult(oversizedProse, [REAL_SOURCE]))
      .mockResolvedValueOnce(structureResult([]));

    const result = await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");
    expect("error" in result).toBe(false);
    if ("error" in result) return;

    expect(result.notes.some((n) => /too long/i.test(n) && /later weeks/i.test(n))).toBe(true);
  });

  // ── 9. DEGRADED PATHS - NEVER THROWS ────────────────────────────────────────
  describe("degraded paths", () => {
    it("reports a failed database write in notes with stored: 0, without throwing", async () => {
      const org = candidate({ organization: "Write Failure Org", url: "https://real-source.test/story-i" });

      vi.mocked(callLlm)
        .mockResolvedValueOnce(proseResult("Prose about the organization.", [REAL_SOURCE]))
        .mockResolvedValueOnce(structureResult([org]));
      vi.mocked(upsertKnowledge).mockResolvedValue(0);

      const result = await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(result.stored).toBe(0);
      expect(result.notes.some((n) => n.includes("Database write failed"))).toBe(true);
    });

    it("returns a summary with an explanatory note (not a throw) when the grounded call fails", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "server error" });

      const result = await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(result.stored).toBe(0);
      expect(result.notes.some((n) => /grounded research call failed/i.test(n))).toBe(true);
      // The structuring call never fires when there is no prose to structure.
      expect(callLlm).toHaveBeenCalledTimes(1);
      expect(upsertKnowledge).not.toHaveBeenCalled();
    });

    it("returns a summary with an explanatory note (not a throw) when the grounded call returns empty text", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce(proseResult("   ", [REAL_SOURCE]));

      const result = await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");
      expect("error" in result).toBe(false);
      if ("error" in result) return;

      expect(result.stored).toBe(0);
      expect(result.notes.some((n) => /grounded research call failed|no usable text/i.test(n))).toBe(true);
      expect(callLlm).toHaveBeenCalledTimes(1);
    });

    it("returns { error } when requireOwner rejects the caller", async () => {
      vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized"));

      const result = await researchCourseCaseStudiesAction(weeks, "A course description", "gemini");

      expect(result).toEqual({ error: "Not authorized" });
      expect(callLlm).not.toHaveBeenCalled();
    });
  });
});
