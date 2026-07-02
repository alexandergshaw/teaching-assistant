import { describe, it, expect, vi, afterEach } from "vitest";
import { routeRequest, GUIDANCE_REPLY } from "./router";

// The router must never touch the external web (the vitest env blanks the
// Supabase config, so knowledge lookups fall back to the in-repo curated base).
afterEach(() => {
  vi.unstubAllGlobals();
});

function guardFetch() {
  const fetchSpy = vi.fn(async () => {
    throw new Error("router must not fetch");
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("routeRequest intents", () => {
  it("drafts an announcement", async () => {
    const r = await routeRequest("Draft an announcement that the midterm moved to Friday");
    expect(r.intent).toBe("announcement");
    expect(r.reply).toContain("Title:");
    expect(r.reply).toContain("Friday");
  });

  it("asks for details when the announcement request has no content", async () => {
    const r = await routeRequest("write an announcement");
    expect(r.intent).toBe("announcement");
    expect(r.reply).toContain("Tell me what the announcement should say");
  });

  it("generates a tiered rubric for a topic", async () => {
    const r = await routeRequest("Make a rubric for a python assignment: submit a PDF of at least 300 words");
    expect(r.intent).toBe("rubric");
    expect(r.reply).toMatch(/\(\d+%\):/);
    expect(r.reply).toContain("Excellent (100%");
  });

  it("serves verified practice problems with example and solution", async () => {
    const fetchSpy = guardFetch();
    const r = await routeRequest("Give me practice problems on loops");
    expect(r.intent).toBe("practice_problems");
    expect(r.reply).toContain("Worked example (not the solution):");
    expect(r.reply).toContain("Solution:");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("serves a case study for a matching topic", async () => {
    const r = await routeRequest("Show me a case study about integer overflow");
    expect(r.intent).toBe("case_study");
    expect(r.reply.length).toBeGreaterThan(40);
  });

  it("quizzes over pasted material with an answer key", async () => {
    const history = [
      {
        role: "user",
        text:
          "Recursion is when a function calls itself to solve a smaller version of the problem. " +
          "A base case is the condition that stops the recursion. " +
          "A stack frame is the memory allocated for one function call. " +
          "The midterm exam is worth 150 points.",
      },
    ];
    const r = await routeRequest("Quiz me on this", history);
    expect(r.intent).toBe("quiz");
    expect(r.reply).toContain("Answer key:");
    expect(r.reply).toContain("________");
  });

  it("answers questions about pasted material, including follow-ups", async () => {
    const history = [
      {
        role: "user",
        text:
          "The midterm exam is on October 12 in room 204. Office hours are Tuesdays 2pm to 4pm. " +
          "The final project is due December 5 and counts for thirty percent of the grade.",
      },
      { role: "user", text: "Tell me about the midterm exam" },
    ];
    const r = await routeRequest("when is it?", history);
    expect(r.intent).toBe("qa");
    expect(r.reply).toContain("October 12");
  });

  it("falls back to the stored knowledge base for topic questions", async () => {
    const fetchSpy = guardFetch();
    const r = await routeRequest("Tell me about the Therac-25 radiation incidents");
    expect(r.intent).toBe("knowledge");
    expect(r.reply).toContain("Here is what I know about that:");
    expect(r.reply.toLowerCase()).toContain("therac");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns guidance for an unroutable message with no material", async () => {
    const r = await routeRequest("zzz qqq");
    expect(r.intent).toBe("guidance");
    expect(r.reply).toBe(GUIDANCE_REPLY);
  });
});

describe("routeRequest with explicit context (selection chat)", () => {
  it("answers questions about a short selection, no 20-word minimum", async () => {
    const r = await routeRequest("when is the exam?", [], {
      contextText: "The midterm exam is on October 12.",
    });
    expect(r.intent).toBe("qa");
    expect(r.reply).toContain("October 12");
  });

  it("quizzes over the selection when it carries enough facts", async () => {
    const context =
      "Recursion is when a function calls itself to solve a smaller version of the problem. " +
      "A base case is the condition that stops the recursion. " +
      "A stack frame is the memory allocated for one function call.";
    const r = await routeRequest("quiz me on this", [], { contextText: context });
    expect(r.intent).toBe("quiz");
    expect(r.reply).toContain("Answer key:");
  });

  it("still dispatches non-QA intents while a selection is present", async () => {
    const r = await routeRequest("give me practice problems on loops", [], {
      contextText: "Some highlighted sentence about the course.",
    });
    expect(r.intent).toBe("practice_problems");
    expect(r.reply).toContain("Solution:");
  });
});
