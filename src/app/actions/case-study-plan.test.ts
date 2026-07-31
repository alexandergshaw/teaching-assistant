import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return { ...actual, callLlm: vi.fn() };
});

import { callLlm } from "@/lib/llm";
import { planCourseCaseStudies } from "./case-study-plan";
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
});
