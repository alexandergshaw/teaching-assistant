import { describe, it, expect, vi, beforeEach } from "vitest";

// deriveAssignmentChecklistAction calls requireOwner() (auth) and, via
// deriveFullCreditChecklist in src/lib/grade/rubric.ts, callLlm() (network) -
// both mocked so the action's own logic (owner gate, blank-instructions
// guard, pass-through of the shared checklist synthesis) runs for real
// without a Supabase session or a live Gemini call. Mirrors the pattern in
// src/app/actions/current-events.test.ts.
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
import { requireOwner } from "@/lib/supabase/auth";
import { deriveAssignmentChecklistAction } from "./grading";

const checklistResponse = (items: string[]) => ({
  ok: true as const,
  text: JSON.stringify({ fullCreditChecklist: items }),
});

const failResponse = { ok: false as const, status: 500, body: "server error" };

describe("deriveAssignmentChecklistAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  });

  it("returns an error rather than throwing when requireOwner rejects", async () => {
    vi.mocked(requireOwner).mockRejectedValueOnce(new Error("Not authorized. Sign in with an approved account."));

    const result = await deriveAssignmentChecklistAction("Write a binary search tree.", "Correctness (100%)");

    expect(result).toEqual({ error: "Not authorized. Sign in with an approved account." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns a clear error for blank instructions without calling the LLM", async () => {
    const result = await deriveAssignmentChecklistAction("   ", "Correctness (100%)");

    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error).toContain("instructions");
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("returns the derived items on a successful call", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(
      checklistResponse(["Implements insert and search", "Handles duplicate keys", "Includes unit tests"])
    );

    const result = await deriveAssignmentChecklistAction("Write a binary search tree.", "Correctness (100%)");

    expect("error" in result).toBe(false);
    if ("error" in result) return;
    expect(result.items).toEqual([
      "Implements insert and search",
      "Handles duplicate keys",
      "Includes unit tests",
    ]);
    expect(requireOwner).toHaveBeenCalled();
  });

  it("returns an error and does not throw when the LLM call fails", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(failResponse);

    const result = await deriveAssignmentChecklistAction("Write a binary search tree.", "Correctness (100%)");

    expect("error" in result).toBe(true);
    if (!("error" in result)) return;
    expect(result.error.length).toBeGreaterThan(0);
  });
});
