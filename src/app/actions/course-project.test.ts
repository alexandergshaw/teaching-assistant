import { describe, it, expect, vi, beforeEach } from "vitest";

// generateCourseProjectAction calls callLlm() (network); requireOwner() is
// mocked for parity with this file's sibling action tests even though this
// function itself never calls it (only setCourseProjectAction does).
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "@/lib/llm";
import { generateCourseProjectAction } from "./course-project";
import { PROJECT_HANDS_ON_CONTRACT } from "@/lib/course-project";

const planFixture = (overrides: Partial<{ name: string; brief: string }> = {}) => ({
  name: overrides.name ?? "Capstone Build",
  brief: overrides.brief ?? "Build the thing.",
  milestones: [
    { week: 1, title: "Kickoff", deliverable: "Plan" },
    { week: 2, title: "Build", deliverable: "Draft" },
  ],
});

describe("generateCourseProjectAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a blank definition with course facts and a schedule asks the model to PROPOSE a hands-on project", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify(planFixture()),
    });

    const result = await generateCourseProjectAction(
      "",
      "Project Management 101, 12 weeks",
      2,
      "Week 1,Planning\nWeek 2,Execution",
      "gemini",
      "applied"
    );

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.name).toBe("Capstone Build");
    expect(result.milestones).toHaveLength(2);

    const promptText = vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0];
    const prompt = "text" in promptText ? promptText.text : "";
    expect(prompt).toContain("PROPOSE");
    expect(prompt.toLowerCase()).toContain("hands-on");
    // The instructor idea section still names the label, but carries no
    // instructor text since none was given.
    expect(prompt).toContain("THE INSTRUCTOR'S PROJECT IDEA:");
    expect(prompt).not.toMatch(/THE INSTRUCTOR'S PROJECT IDEA:\n\n/);
  });

  it("a non-blank definition keeps today's prompt wording - no PROPOSE branch", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify(planFixture()),
    });

    await generateCourseProjectAction(
      "Build a personal budgeting app",
      "Intro to CS, 12 weeks",
      2,
      "Week 1,Intro\nWeek 2,Loops",
      "gemini",
      "coding"
    );

    const promptText = vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0];
    const prompt = "text" in promptText ? promptText.text : "";
    expect(prompt).toContain("THE INSTRUCTOR'S PROJECT IDEA:\nBuild a personal budgeting app");
    expect(prompt).not.toContain("PROPOSE");
  });

  // A generated ethical-hacking course project named itself "Project Aegis" -
  // an operation-style codename with nothing in the prompt steering the model
  // away from it. Pins the fix so a future edit cannot silently drop the
  // steering: the model must be told to describe the deliverable plainly, and
  // explicitly warned off codenames, "Project X" constructions, and
  // mythological/military/brand-like words.
  it("instructs the model to name the project plainly rather than as a codename", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify(planFixture()),
    });

    await generateCourseProjectAction(
      "Build an ethical hacking lab",
      "Ethical Hacking, 12 weeks",
      2,
      "Week 1,Recon\nWeek 2,Exploitation",
      "gemini",
      "coding"
    );

    const promptText = vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0];
    const prompt = "text" in promptText ? promptText.text : "";
    expect(prompt).toContain("plainly describes what the student actually produces over the term");
    expect(prompt).toContain('Do not invent a codename, operation name, or "Project <word>" construction');
    expect(prompt.toLowerCase()).toContain("mythological, military, or brand-like words");
  });

  // AC4/AC5/AC6: the hands-on + authorized-targets contract must reach the
  // project-design prompt regardless of whether the instructor gave an idea
  // to elaborate on or the model is proposing one from scratch - a real
  // generated ethical hacking course's project produced documentation-only
  // deliverables ("a visual network diagram exported as PNG or PDF") with
  // nothing in this prompt pushing back on that.
  it("AC4/AC5/AC6: composes PROJECT_HANDS_ON_CONTRACT verbatim when the instructor gives an idea", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify(planFixture()),
    });

    await generateCourseProjectAction(
      "Build an ethical hacking lab",
      "Ethical Hacking, 12 weeks",
      2,
      "Week 1,Recon\nWeek 2,Exploitation",
      "gemini",
      "coding"
    );

    const promptText = vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0];
    const prompt = "text" in promptText ? promptText.text : "";
    expect(prompt).toContain(PROJECT_HANDS_ON_CONTRACT);
  });

  it("AC4/AC5/AC6: composes PROJECT_HANDS_ON_CONTRACT verbatim when the model is proposing the project (no idea given)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify(planFixture()),
    });

    await generateCourseProjectAction(
      "",
      "Ethical Hacking, 12 weeks",
      2,
      "Week 1,Recon\nWeek 2,Exploitation",
      "gemini",
      "coding"
    );

    const promptText = vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0];
    const prompt = "text" in promptText ? promptText.text : "";
    expect(prompt).toContain(PROJECT_HANDS_ON_CONTRACT);
  });

  // AC6: the legal/safety boundary specifically, not just "hands-on" -
  // pinned as its own assertion so a later edit that keeps the hands-on push
  // but quietly drops the authorization boundary is caught.
  it("AC6: the project-design prompt states the authorized-targets legal boundary", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify(planFixture()),
    });

    await generateCourseProjectAction(
      "Build an ethical hacking lab",
      "Ethical Hacking, 12 weeks",
      2,
      "Week 1,Recon\nWeek 2,Exploitation",
      "gemini",
      "coding"
    );

    const promptText = vi.mocked(callLlm).mock.calls[0][0].contents[0].parts[0];
    const prompt = "text" in promptText ? promptText.text : "";
    expect(prompt).toContain("AUTHORIZED TARGETS ONLY");
    expect(prompt).toContain(
      "Never direct a student at a real system, network, account, or organization they do not own or do not have explicit written permission to test."
    );
  });

  it("errors when the definition, course facts, and weekly topics are all blank", async () => {
    const result = await generateCourseProjectAction("", "", 4, "", "gemini", "coding");
    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error.toLowerCase()).toContain("describe the course project");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("does not error on a blank definition alone when course facts are given", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify(planFixture()),
    });

    const result = await generateCourseProjectAction("", "Ethics in AI, 8 weeks", 2, "", "gemini", "coding");
    expect("error" in result).toBe(false);
  });

  it("does not error on a blank definition alone when a weekly schedule is given", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({
      ok: true,
      text: JSON.stringify(planFixture()),
    });

    const result = await generateCourseProjectAction("", "", 2, "Week 1,Intro\nWeek 2,Loops", "gemini", "coding");
    expect("error" in result).toBe(false);
  });

  it("the embedded provider with a blank definition names the project from the first weekly topic", async () => {
    const result = await generateCourseProjectAction(
      "",
      "Ethics in AI, 2 weeks",
      2,
      "Foundations of AI ethics\nCase studies",
      "embedded",
      "coding"
    );
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.name).toBe("Foundations of AI ethics");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("the embedded provider with a blank definition and no weekly topics falls back to a generic name", async () => {
    const result = await generateCourseProjectAction("", "Ethics in AI, 2 weeks", 2, "", "embedded", "coding");
    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.name).toBe("Course project");
  });
});
