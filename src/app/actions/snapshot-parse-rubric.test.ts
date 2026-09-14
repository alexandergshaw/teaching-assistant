import { describe, it, expect, vi, beforeEach } from "vitest";

// Backlog 3.5 (scratchpad/b35-rulings.md, Ruling B35-16/B35-21). Mocks only
// what this action actually calls, mirroring this repo's own idiom
// (legibility-probe.test.ts). The load-bearing fact under test: requireUser()
// REJECTS on an auth failure - it does not resolve to an {error} shape on its
// own - so without a try/catch wrapping it, the declared error branch would
// be unreachable and a caller's `await` would throw instead of receiving a
// message it can render and retry from (Ruling B35-16). Ruling B35-21:
// requireUser() must sit INSIDE the try, unlike snapshot-grade.ts's own
// (pre-existing, untouched by this backlog) `await requireUser();` outside
// its try.

vi.mock("@/lib/supabase/auth", () => ({
  requireUser: vi.fn(),
}));

vi.mock("@/lib/grade/rubric", () => ({
  extractRubricCriteria: vi.fn(),
}));

import { requireUser } from "@/lib/supabase/auth";
import { extractRubricCriteria } from "@/lib/grade/rubric";
import { snapshotParseRubricAction } from "./snapshot-parse-rubric";

const USER = { id: "user-1", email: "user@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUser).mockResolvedValue(USER as never);
  vi.mocked(extractRubricCriteria).mockReturnValue([]);
});

describe("snapshotParseRubricAction", () => {
  it("resolves to { areas } shaped from extractRubricCriteria's own output on success", async () => {
    vi.mocked(extractRubricCriteria).mockReturnValue([
      { name: "Thesis", points: 20 },
      { name: "Grammar", points: null },
    ]);

    const result = await snapshotParseRubricAction("Thesis (20 pts): ... Grammar: ...");

    expect(result).toEqual({
      areas: [
        { name: "Thesis", points: 20 },
        { name: "Grammar", points: null },
      ],
    });
  });

  it("a REJECTING requireUser resolves to { error }, never rejects the returned promise (Ruling B35-16)", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    const result = await snapshotParseRubricAction("Rubric text.");

    expect("error" in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/not authorized/i);
  });

  it("a throwing extractRubricCriteria also resolves to { error }, not a rejection", async () => {
    vi.mocked(extractRubricCriteria).mockImplementationOnce(() => {
      throw new Error("could not parse");
    });

    const result = await snapshotParseRubricAction("Rubric text.");

    expect("error" in result).toBe(true);
  });

  it("calls requireUser() (auth is enforced, not skipped)", async () => {
    await snapshotParseRubricAction("Rubric text.");
    expect(requireUser).toHaveBeenCalledTimes(1);
  });
});
