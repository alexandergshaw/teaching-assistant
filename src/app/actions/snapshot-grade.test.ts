import { describe, it, expect, vi, beforeEach } from "vitest";

// Backlog 3.5 (scratchpad/b35-rulings.md, Ruling B35-14/B35-20). The
// load-bearing invariant under test: snapshotGradeAction sends the
// INSTRUCTOR-CONFIRMED rubric-area list (request.confirmedRubricAreas)
// verbatim into the system prompt and back out as pinnedRubricAreas - it no
// longer derives criteria from rubricText itself (extractRubricCriteria is
// no longer imported or called here at all; that import now lives solely in
// snapshot-parse-rubric.ts, Ruling B35-20). Mirrors legibility-probe.test.ts's
// mocking idiom: mock only what this action actually calls; "@/lib/llm"
// partially mocked so describeLlmFailure/describeEmptyLlmText run as their
// REAL implementations via importActual, while callLlm is a vi.fn()
// controlled per case.

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/llm", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm")>("@/lib/llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { requireUser } from "@/lib/supabase/auth";
import { callLlm } from "@/lib/llm";
import { snapshotGradeAction } from "./snapshot-grade";
import type { SnapshotGradeRequestInput } from "@/app/components/snapshot-grading/snapshot-row";

const USER = { id: "user-1", email: "user@example.com" };

function llmResponse(overrides: Partial<{
  overallComment: string;
  improvements: string;
  rubricResults: { area: string; score: string }[];
  instructionLikeContent: boolean;
  missingRoles: string[];
}> = {}) {
  return {
    ok: true,
    text: JSON.stringify({
      overallComment: "Nice work.",
      improvements: "",
      rubricResults: [{ area: "Thesis", score: "18/20" }],
      instructionLikeContent: false,
      missingRoles: [],
      ...overrides,
    }),
  };
}

function baseRequest(overrides: Partial<SnapshotGradeRequestInput> = {}): SnapshotGradeRequestInput {
  return {
    assignmentText: "Write an essay.",
    rubricText: "Thesis (20 pts): ... Grammar: ...",
    transcriptBlock: "Shot 1 (role: submission):\nThe essay text.",
    shots: [],
    confirmedRubricAreas: [{ name: "Thesis", points: 20 }],
    provider: "gemini",
    ...overrides,
  } as SnapshotGradeRequestInput;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(USER as never);
  vi.mocked(callLlm).mockResolvedValue(llmResponse() as never);
});

describe("snapshotGradeAction - the confirmed list, not a re-parse, is what gets sent and echoed back", () => {
  it("sends the confirmed area names into the system prompt sent to callLlm", async () => {
    await snapshotGradeAction(
      baseRequest({
        confirmedRubricAreas: [{ name: "Voice and Tone", points: null }],
      })
    );

    const call = vi.mocked(callLlm).mock.calls[0][0] as { contents: { parts: { text?: string }[] }[] };
    const systemPromptPart = call.contents[0].parts[0];
    expect(systemPromptPart.text).toContain("Voice and Tone");
  });

  it("does NOT send a name only extractRubricCriteria would have parsed from rubricText but the instructor removed from the confirmed list", async () => {
    await snapshotGradeAction(
      baseRequest({
        rubricText: "Thesis (20 pts): ... Grammar (10 pts): ...",
        confirmedRubricAreas: [{ name: "Thesis", points: 20 }], // Grammar deliberately removed
      })
    );

    const call = vi.mocked(callLlm).mock.calls[0][0] as { contents: { parts: { text?: string }[] }[] };
    const systemPromptPart = call.contents[0].parts[0];
    expect(systemPromptPart.text).not.toMatch(/REQUIRED RUBRIC AREAS[\s\S]*Grammar/);
  });

  it("echoes request.confirmedRubricAreas back as pinnedRubricAreas on success", async () => {
    const confirmedRubricAreas = [
      { name: "Thesis", points: 20 },
      { name: "Grammar", points: null },
    ];
    const result = await snapshotGradeAction(baseRequest({ confirmedRubricAreas }));

    expect("error" in result).toBe(false);
    expect((result as { pinnedRubricAreas: unknown }).pinnedRubricAreas).toEqual(confirmedRubricAreas);
  });

  it("an empty confirmed list grades unpinned and echoes back an empty pinnedRubricAreas", async () => {
    const result = await snapshotGradeAction(baseRequest({ confirmedRubricAreas: [] }));

    expect("error" in result).toBe(false);
    expect((result as { pinnedRubricAreas: unknown }).pinnedRubricAreas).toEqual([]);
    const call = vi.mocked(callLlm).mock.calls[0][0] as { contents: { parts: { text?: string }[] }[] };
    expect(call.contents[0].parts[0].text).not.toContain("REQUIRED RUBRIC AREAS");
  });
});
