import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

vi.mock("@/lib/research/db", async () => {
  const actual = await vi.importActual<typeof import("@/lib/research/db")>("@/lib/research/db");
  return { ...actual, searchKnowledgeRows: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { searchKnowledgeRows, type KnowledgeRow } from "@/lib/research/db";
import { makeKnowledgeRow } from "@/lib/research/test-support";
import { planCourseCaseStudies, type CaseStudyPlanDiagnostics } from "./case-study-plan";
import type { ScheduleWeekPlan } from "../actions-types";

function week(overrides: Partial<ScheduleWeekPlan> = {}): ScheduleWeekPlan {
  return {
    week: 1,
    topic: "",
    summary: "",
    assignmentTitle: null,
    assignmentSlug: null,
    testName: null,
    ...overrides,
  };
}

describe("planCourseCaseStudies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns a curated entry to a week whose topic matches, without calling the LLM", async () => {
    const weeks = [
      week({ week: 1, topic: "Scope Management", summary: "Scope creep, vendor management, and schedule risk." }),
    ];

    const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini");

    expect(callLlm).not.toHaveBeenCalled();
    expect(plan.size).toBe(1);
    const assignment = plan.get(1);
    expect(assignment).toBeDefined();
    expect(assignment!.organization.trim()).not.toBe("");
    expect(assignment!.hook.trim()).not.toBe("");
  });

  it("skips weeks with no topic entirely", async () => {
    const weeks = [week({ week: 1, topic: "" }), week({ week: 2, topic: "  " })];
    const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini");
    expect(plan.size).toBe(0);
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("never assigns the same curated entry to two different weeks - the second matching week falls through to the LLM pass", async () => {
    vi.mocked(callLlm).mockResolvedValue({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify({
        assignments: [{ week: 2, organization: "A Different Organization", period: "2015", hook: "hook text" }],
      }),
    } as never);

    // "automation", "logistics", and "complex systems" together uniquely
    // identify the denver-baggage entry - no other curated entry carries all
    // three, so once week 1 claims it, an IDENTICAL week 2 text has nothing
    // else in the library left to match and must fall through to the model.
    const topic = "Automated Baggage Logistics";
    const summary = "Automation of complex systems logistics.";
    const weeks = [
      week({ week: 1, topic, summary }),
      week({ week: 2, topic, summary }),
    ];

    const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini");

    expect(plan.get(1)!.organization).not.toBe(plan.get(2)!.organization);
    // The LLM pass ran (for the second, now-unmatched week).
    expect(callLlm).toHaveBeenCalledTimes(1);
  });

  it("calls the LLM only for weeks the curated library could not match, and merges the result", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify({
        assignments: [{ week: 2, organization: "Zephyr Corp Meltdown", period: "the early 2000s", hook: "It collapsed." }],
      }),
    } as never);

    const weeks = [
      week({ week: 1, topic: "Scope Management", summary: "Scope creep and vendor management issues." }),
      week({ week: 2, topic: "Completely Unmatched Nonsense Topic", summary: "" }),
    ];

    const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini");

    expect(callLlm).toHaveBeenCalledTimes(1);
    const prompt = (vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0] as { text: string }).text;
    // Only the unmatched week is sent to the model.
    expect(prompt).toContain("Week 2");
    expect(prompt).not.toContain("Week 1:");

    expect(plan.get(2)).toEqual({
      organization: "Zephyr Corp Meltdown",
      period: "the early 2000s",
      hook: "It collapsed.",
    });
  });

  it("never asserts a period the model left blank", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify({
        assignments: [{ week: 1, organization: "Some Org", period: "", hook: "hook" }],
      }),
    } as never);

    const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
    const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini");

    expect(plan.get(1)!.period).toBeUndefined();
  });

  it("skips a model-proposed assignment that reuses an already-claimed organization", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: "",
      text: JSON.stringify({
        assignments: [
          // Week 2 reuses week 1's curated organization exactly - must be dropped.
          { week: 2, organization: "Denver International Airport's automated baggage system", period: "", hook: "x" },
        ],
      }),
    } as never);

    const weeks = [
      week({ week: 1, topic: "Automated Baggage Systems", summary: "systems integration testing schedule risk vendor management" }),
      week({ week: 2, topic: "Completely Unmatched Nonsense Topic", summary: "" }),
    ];

    const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini");
    expect(plan.has(2)).toBe(false);
  });

  it("degrades gracefully (never throws) when the LLM call fails - curated matches still ship", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "boom" } as never);

    const weeks = [
      week({ week: 1, topic: "Scope Management", summary: "Scope creep and vendor management issues." }),
      week({ week: 2, topic: "Completely Unmatched Nonsense Topic", summary: "" }),
    ];

    const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini");
    expect(plan.has(1)).toBe(true);
    expect(plan.has(2)).toBe(false);
  });

  it("degrades gracefully when the LLM returns unparseable text", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: true, status: 200, body: "", text: "not json at all" } as never);

    const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
    const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini");
    expect(plan.size).toBe(0);
  });

  it("never calls the LLM for the embedded provider", async () => {
    const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
    const plan = await planCourseCaseStudies(weeks, "A PM course", "embedded");
    expect(callLlm).not.toHaveBeenCalled();
    expect(plan.size).toBe(0);
  });

  it("defaults to \"applied\" when courseKind is omitted (every pre-existing caller/test)", async () => {
    const weeks = [
      week({ week: 1, topic: "Scope Management", summary: "Scope creep, vendor management, and schedule risk." }),
    ];
    const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini");
    // "Scope Management" only matches an APPLIED_CASE_STUDIES entry
    // (denver-baggage) - if this silently matched against CASE_STUDIES
    // instead, it would not match at all and fall through to the LLM.
    expect(callLlm).not.toHaveBeenCalled();
    expect(plan.get(1)!.organization).toContain("Denver");
  });

  // Z1 (Group Z): courseKind "coding" matches against CASE_STUDIES
  // (src/lib/research/case-studies.ts, a software bank) instead of
  // APPLIED_CASE_STUDIES - same mechanism, same guarantees.
  describe("courseKind: \"coding\" (Z1)", () => {
    it("assigns a CASE_STUDIES entry to a week whose topic matches, without calling the LLM", async () => {
      const weeks = [
        week({ week: 1, topic: "Type Conversion and Overflow", summary: "Integers, exceptions, and code reuse." }),
      ];

      const plan = await planCourseCaseStudies(weeks, "An intro programming course", "gemini", "coding");

      expect(callLlm).not.toHaveBeenCalled();
      expect(plan.size).toBe(1);
      const assignment = plan.get(1);
      expect(assignment).toBeDefined();
      expect(assignment!.organization).toBe("European Space Agency");
    });

    it("states a real, verified year directly (CASE_STUDIES entries are established facts, unlike APPLIED_CASE_STUDIES' hedged periods)", async () => {
      const weeks = [
        week({ week: 1, topic: "Concurrency and Race Conditions", summary: "Testing, safety, and threads in medical software." }),
      ];

      const plan = await planCourseCaseStudies(weeks, "A course", "gemini", "coding");

      expect(plan.get(1)!.period).toBe("1986");
    });

    it("never assigns the same CASE_STUDIES entry to two different weeks - the second matching week falls through to the LLM pass", async () => {
      vi.mocked(callLlm).mockResolvedValue({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [{ week: 2, organization: "A Different Coding Incident", period: "2015", hook: "hook text" }],
        }),
      } as never);

      // "data representation", "dates", "technical debt", "maintenance", and
      // "legacy code" together uniquely identify the y2k entry - no other
      // curated entry carries any of these five tags, so once week 1 claims
      // it, an IDENTICAL week 2 text has nothing else in the library left to
      // match and must fall through to the model.
      const topic = "Data Representation and Technical Debt";
      const summary = "Dates, maintenance, and legacy code decisions.";
      const weeks = [
        week({ week: 1, topic, summary }),
        week({ week: 2, topic, summary }),
      ];

      const plan = await planCourseCaseStudies(weeks, "A course", "gemini", "coding");

      expect(plan.get(1)!.organization).not.toBe(plan.get(2)!.organization);
      expect(callLlm).toHaveBeenCalledTimes(1);
      const prompt = (vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0] as { text: string }).text;
      expect(prompt).toContain("programming course");
    });

    it("calls the LLM only for weeks CASE_STUDIES could not match, phrasing the prompt for a programming course", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [{ week: 1, organization: "Some Startup Outage", period: "2019", hook: "It went down." }],
        }),
      } as never);

      const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
      const plan = await planCourseCaseStudies(weeks, "A course", "gemini", "coding");

      const prompt = (vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0] as { text: string }).text;
      expect(prompt).toContain("programming course");
      expect(prompt).not.toContain("applied (no-code)");
      expect(plan.get(1)!.organization).toBe("Some Startup Outage");
    });

    it("degrades gracefully (never throws) for a coding course when the LLM call fails", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "boom" } as never);

      const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
      const plan = await planCourseCaseStudies(weeks, "A course", "gemini", "coding");
      expect(plan.has(1)).toBe(false);
    });
  });

  // Group F (backlog: "validated case studies, one per week per course"),
  // decision 4: "if the library runs out of qualifying distinct entries
  // mid-course, say so in the run's own reporting rather than silently
  // repeating one." No-repeat itself (decision 2/3) is unchanged - this only
  // covers the NEW, optional, additive diagnostics parameter.
  describe("diagnostics: library exhaustion (decision 4)", () => {
    it("records the week as exhausted when its topic DOES match a curated entry, but every such entry was already claimed by an earlier week", async () => {
      vi.mocked(callLlm).mockResolvedValue({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [{ week: 2, organization: "A Different Organization", period: "2015", hook: "hook text" }],
        }),
      } as never);

      // Same fixture as the existing "never assigns the same curated entry
      // to two different weeks" test above: these three tags uniquely
      // identify denver-baggage, so week 2 (identical text) has a real
      // library candidate that is gone specifically because week 1 already
      // claimed it - textbook exhaustion, not a content gap.
      const topic = "Automated Baggage Logistics";
      const summary = "Automation of complex systems logistics.";
      const weeks = [
        week({ week: 1, topic, summary }),
        week({ week: 2, topic, summary }),
      ];
      const diagnostics: CaseStudyPlanDiagnostics = { exhaustedWeeks: [] };

      const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini", "applied", diagnostics);

      expect(plan.get(1)!.organization).toContain("Denver");
      expect(diagnostics.exhaustedWeeks).toEqual([2]);
    });

    it("does NOT record exhaustion for a week whose topic never had a qualifying curated candidate at all (a content gap, not exhaustion)", async () => {
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [{ week: 1, organization: "Some Org", period: "2015", hook: "hook text" }],
        }),
      } as never);

      const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
      const diagnostics: CaseStudyPlanDiagnostics = { exhaustedWeeks: [] };

      await planCourseCaseStudies(weeks, "A PM course", "gemini", "applied", diagnostics);

      expect(diagnostics.exhaustedWeeks).toEqual([]);
    });

    it("never repeats the claimed entry even when nothing is listening for the diagnostic (diagnostics omitted entirely)", async () => {
      vi.mocked(callLlm).mockResolvedValue({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [{ week: 2, organization: "A Different Organization", period: "2015", hook: "hook text" }],
        }),
      } as never);

      const topic = "Automated Baggage Logistics";
      const summary = "Automation of complex systems logistics.";
      const weeks = [
        week({ week: 1, topic, summary }),
        week({ week: 2, topic, summary }),
      ];

      // No 5th argument at all - mirrors every pre-existing call site.
      const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini", "applied");

      expect(plan.get(1)!.organization).not.toBe(plan.get(2)!.organization);
    });

    it("also detects exhaustion for a coding course (Z1 parity)", async () => {
      vi.mocked(callLlm).mockResolvedValue({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [{ week: 2, organization: "A Different Coding Incident", period: "2015", hook: "hook text" }],
        }),
      } as never);

      // Same fixture as the existing coding-kind "never assigns the same
      // CASE_STUDIES entry to two different weeks" test above - uniquely
      // identifies the y2k entry.
      const topic = "Data Representation and Technical Debt";
      const summary = "Dates, maintenance, and legacy code decisions.";
      const weeks = [
        week({ week: 1, topic, summary }),
        week({ week: 2, topic, summary }),
      ];
      const diagnostics: CaseStudyPlanDiagnostics = { exhaustedWeeks: [] };

      await planCourseCaseStudies(weeks, "A course", "gemini", "coding", diagnostics);

      expect(diagnostics.exhaustedWeeks).toEqual([2]);
    });

    it("reports every exhausted week, in the order pass 1 encountered them, across more than two weeks", async () => {
      vi.mocked(callLlm).mockResolvedValue({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [
            { week: 2, organization: "Second Org", period: "2015", hook: "hook" },
            { week: 3, organization: "Third Org", period: "2016", hook: "hook" },
          ],
        }),
      } as never);

      const topic = "Automated Baggage Logistics";
      const summary = "Automation of complex systems logistics.";
      const weeks = [
        week({ week: 1, topic, summary }),
        week({ week: 2, topic, summary }),
        week({ week: 3, topic, summary }),
      ];
      const diagnostics: CaseStudyPlanDiagnostics = { exhaustedWeeks: [] };

      const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini", "applied", diagnostics);

      // Only week 1 gets the curated entry; weeks 2 and 3 both had a real
      // candidate (the same one) that was already gone by the time they were
      // considered, so both are reported - never silently repeated (plan.get(2)
      // and plan.get(3) come from the mocked LLM pass, not the library).
      expect(diagnostics.exhaustedWeeks).toEqual([2, 3]);
      expect(plan.get(1)!.organization).toContain("Denver");
    });
  });

  // Group C (researched pass): a corroborated knowledge_entries row sits
  // between pass 1 (curated library) and pass 2 (LLM) in trust order, and -
  // unlike pass 2 - runs for the embedded provider too. See
  // planCourseCaseStudies' own doc comment above the researched-pass block in
  // case-study-plan.ts for exactly why.
  describe("researched pass (Group C): knowledge_entries between pass 1 and pass 2", () => {
    function dbCaseStudyRow(overrides: Partial<KnowledgeRow> = {}): KnowledgeRow {
      return makeKnowledgeRow({
        id: "db-entry",
        organization: "DB-Sourced Org",
        year: 1999,
        lesson: "The lesson the database already corroborated.",
        summary: "First bullet.\nSecond bullet.",
        ...overrides,
      });
    }

    it("assigns a week the curated library could not match from the DB pass, with the correct shape", async () => {
      vi.mocked(searchKnowledgeRows).mockResolvedValue([dbCaseStudyRow()]);

      const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
      const plan = await planCourseCaseStudies(weeks, "A course", "gemini");

      expect(callLlm).not.toHaveBeenCalled();
      expect(plan.get(1)).toEqual({
        organization: "DB-Sourced Org",
        period: "1999",
        hook: "First bullet. Second bullet. The lesson the database already corroborated.",
      });
    });

    it("runs for the embedded provider and DOES assign - the researched pass sits ABOVE the embedded early return", async () => {
      vi.mocked(searchKnowledgeRows).mockResolvedValue([dbCaseStudyRow({ organization: "Embedded DB Org" })]);

      const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
      const plan = await planCourseCaseStudies(weeks, "A course", "embedded");

      expect(callLlm).not.toHaveBeenCalled();
      expect(plan.get(1)!.organization).toBe("Embedded DB Org");
    });

    it("does not send a week the DB pass already assigned to the LLM pass - only the still-unmatched week reaches it", async () => {
      vi.mocked(searchKnowledgeRows).mockImplementation(async (topic) =>
        topic === "DB Matched Topic" ? [dbCaseStudyRow({ organization: "DB Rescued Org" })] : []
      );
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [{ week: 2, organization: "LLM Org", period: "2010", hook: "hook text" }],
        }),
      } as never);

      const weeks = [
        week({ week: 1, topic: "DB Matched Topic", summary: "" }),
        week({ week: 2, topic: "Completely Unmatched Nonsense Topic", summary: "" }),
      ];
      const plan = await planCourseCaseStudies(weeks, "A course", "gemini");

      expect(plan.get(1)!.organization).toBe("DB Rescued Org");
      expect(callLlm).toHaveBeenCalledTimes(1);
      const prompt = (vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0] as { text: string }).text;
      // Only the still-unmatched week is sent to the model.
      expect(prompt).toContain("Week 2");
      expect(prompt).not.toContain("Week 1:");
    });

    it("trust order: a curated match wins over a DB match for the same week", async () => {
      // "Scope Management" matches the curated denver-baggage entry (same
      // fixture the very first test in this file uses). If the DB pass ever
      // ran for a week pass 1 already matched, this mock would let it
      // overwrite the curated assignment - it must never get the chance to.
      vi.mocked(searchKnowledgeRows).mockResolvedValue([dbCaseStudyRow({ organization: "Should Never Win" })]);

      const weeks = [
        week({ week: 1, topic: "Scope Management", summary: "Scope creep, vendor management, and schedule risk." }),
      ];
      const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini");

      expect(plan.get(1)!.organization).toContain("Denver");
      expect(plan.get(1)!.organization).not.toBe("Should Never Win");
      // A week pass 1 already matched never enters the researched pass's loop.
      expect(searchKnowledgeRows).not.toHaveBeenCalled();
    });

    it("shares usedLibraryIds with pass 1: the same DB entry cannot be assigned to two different weeks", async () => {
      vi.mocked(searchKnowledgeRows).mockResolvedValue([
        dbCaseStudyRow({ id: "shared-db-entry", organization: "Shared DB Org" }),
      ]);
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [{ week: 2, organization: "LLM Org 2", period: "2012", hook: "hook text" }],
        }),
      } as never);

      const weeks = [
        week({ week: 1, topic: "Completely Unmatched Nonsense Topic A", summary: "" }),
        week({ week: 2, topic: "Completely Unmatched Nonsense Topic B", summary: "" }),
      ];
      const plan = await planCourseCaseStudies(weeks, "A course", "gemini");

      expect(plan.get(1)!.organization).toBe("Shared DB Org");
      // Week 2 could not reclaim the same DB entry, so it fell through to the
      // LLM pass instead of silently repeating week 1's organization.
      expect(plan.get(2)!.organization).toBe("LLM Org 2");
      expect(callLlm).toHaveBeenCalledTimes(1);
    });

    it("skips a DB row rowToCaseStudy rejects (missing year) and falls through to the LLM pass", async () => {
      vi.mocked(searchKnowledgeRows).mockResolvedValue([dbCaseStudyRow({ year: null })]);
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [{ week: 1, organization: "LLM Rescue Org", period: "2013", hook: "hook text" }],
        }),
      } as never);

      const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
      const plan = await planCourseCaseStudies(weeks, "A course", "gemini");

      expect(callLlm).toHaveBeenCalledTimes(1);
      expect(plan.get(1)!.organization).toBe("LLM Rescue Org");
    });

    it("treats searchKnowledgeRows returning null (database unavailable) as no results, never as an error", async () => {
      vi.mocked(searchKnowledgeRows).mockResolvedValue(null);
      vi.mocked(callLlm).mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: "",
        text: JSON.stringify({
          assignments: [{ week: 1, organization: "LLM Org", period: "2014", hook: "hook text" }],
        }),
      } as never);

      const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
      const plan = await planCourseCaseStudies(weeks, "A course", "gemini");

      expect(plan.get(1)!.organization).toBe("LLM Org");
      expect(callLlm).toHaveBeenCalledTimes(1);
    });

    it("does not propagate when searchKnowledgeRows throws - the week falls through instead of the call rejecting", async () => {
      vi.mocked(searchKnowledgeRows).mockRejectedValue(new Error("db boom"));
      vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "boom" } as never);

      const weeks = [week({ week: 1, topic: "Completely Unmatched Nonsense Topic", summary: "" })];
      const plan = await planCourseCaseStudies(weeks, "A course", "gemini");

      expect(plan.has(1)).toBe(false);
    });

    it("removes a week from diagnostics.exhaustedWeeks when the DB pass rescues it after pass 1 recorded it as exhausted", async () => {
      vi.mocked(searchKnowledgeRows).mockResolvedValue([
        dbCaseStudyRow({ id: "rescue-row", organization: "Rescue Org" }),
      ]);

      // Same fixture as the existing exhaustion test above: these three tags
      // uniquely identify denver-baggage, so week 2 (identical text) is a
      // textbook exhaustion case - pass 1 records it as exhausted, then the
      // researched pass rescues it before this function returns.
      const topic = "Automated Baggage Logistics";
      const summary = "Automation of complex systems logistics.";
      const weeks = [
        week({ week: 1, topic, summary }),
        week({ week: 2, topic, summary }),
      ];
      const diagnostics: CaseStudyPlanDiagnostics = { exhaustedWeeks: [] };

      const plan = await planCourseCaseStudies(weeks, "A PM course", "gemini", "applied", diagnostics);

      expect(plan.get(1)!.organization).toContain("Denver");
      expect(plan.get(2)!.organization).toBe("Rescue Org");
      expect(diagnostics.exhaustedWeeks).toEqual([]);
      expect(callLlm).not.toHaveBeenCalled();
    });
  });
});
