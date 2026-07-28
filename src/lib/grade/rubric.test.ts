import { describe, it, expect, vi, beforeEach } from "vitest";

// synthesizeFullCreditChecklist (the eager, grading-time path) and
// deriveFullCreditChecklist (the on-demand, drafted-grades path) share one
// LLM call + parser (callChecklistLlm in ./rubric) so the two paths can never
// synthesize different checklists for the same inputs. callLlm is mocked so
// both paths run for real without a live Gemini call.
vi.mock("../llm", async () => {
  const actual = await vi.importActual<typeof import("../llm")>("../llm");
  return {
    ...actual,
    callLlm: vi.fn(),
  };
});

import { callLlm } from "../llm";
import { synthesizeFullCreditChecklist, deriveFullCreditChecklist } from "./rubric";

const checklistResponse = (items: string[]) => ({
  ok: true as const,
  text: JSON.stringify({ fullCreditChecklist: items }),
});

const failResponse = { ok: false as const, status: 500, body: "server error" };

describe("deriveFullCreditChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the parsed items on success", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(checklistResponse(["A", "B", "C"]));

    const result = await deriveFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect(result).toEqual({ items: ["A", "B", "C"] });
  });

  it("surfaces an HTTP failure as an error instead of swallowing it", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(failResponse);

    const result = await deriveFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect("error" in result).toBe(true);
  });

  it("surfaces a thrown network error as an error instead of throwing", async () => {
    vi.mocked(callLlm).mockRejectedValueOnce(new Error("network down"));

    const result = await deriveFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect(result).toEqual({ error: "network down" });
  });
});

describe("synthesizeFullCreditChecklist (regression: eager grading-time path)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("still returns the parsed items on success after the shared-helper refactor", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(checklistResponse(["A", "B", "C"]));

    const result = await synthesizeFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect(result).toEqual(["A", "B", "C"]);
  });

  it("still degrades to the default checklist on HTTP failure, never throwing", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce(failResponse);

    const result = await synthesizeFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect(result).toHaveLength(3);
    expect(result.every((item) => typeof item === "string" && item.length > 0)).toBe(true);
  });

  it("still degrades to the default checklist on a thrown network error, never throwing", async () => {
    vi.mocked(callLlm).mockRejectedValueOnce(new Error("network down"));

    const result = await synthesizeFullCreditChecklist("Write a sorting function.", "Correctness (100%)");

    expect(result).toHaveLength(3);
  });
});
