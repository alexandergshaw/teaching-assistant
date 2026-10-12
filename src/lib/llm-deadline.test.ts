import { describe, expect, it } from "vitest";
import {
  MODEL_WAIT_MAX_MS,
  MODEL_WAIT_MIN_MS,
  MODEL_WAIT_RESERVE_MS,
  TOTAL_BUDGET_MS,
  remainingModelBudgetMs,
} from "@/lib/llm-deadline";

// Expected values below are hand-frozen literals (docs/g4-w1-oracle.md section 4),
// never recomputed from the imported constants.
interface Row {
  id: string;
  startedAtMs: number;
  now: number;
  expected: number;
}

const ROWS: Row[] = [
  { id: "R1 plenty of budget, capped at MAX", startedAtMs: 1000000, now: 1000000, expected: 24000 },
  { id: "R2 shift twin of R1", startedAtMs: 7000000, now: 7000000, expected: 24000 },
  { id: "R3 boundary exactly at MAX", startedAtMs: 1000000, now: 1024000, expected: 24000 },
  { id: "R4 mid linear region", startedAtMs: 1000000, now: 1030000, expected: 18000 },
  { id: "R5 shift twin of R4", startedAtMs: 9000000, now: 9030000, expected: 18000 },
  { id: "R6 boundary exactly at MIN", startedAtMs: 1000000, now: 1040000, expected: 8000 },
  { id: "R7 one ms below MIN -> sentinel", startedAtMs: 1000000, now: 1040001, expected: 0 },
  { id: "R8 over-budget boundary", startedAtMs: 1000000, now: 1048000, expected: 0 },
  { id: "R9 well over budget, never negative", startedAtMs: 1000000, now: 1055000, expected: 0 },
];

describe("llm-deadline constants", () => {
  it("pins the four oracle values", () => {
    expect(TOTAL_BUDGET_MS).toBe(50000);
    expect(MODEL_WAIT_RESERVE_MS).toBe(2000);
    expect(MODEL_WAIT_MIN_MS).toBe(8000);
    expect(MODEL_WAIT_MAX_MS).toBe(24000);
  });
});

describe("remainingModelBudgetMs frozen table", () => {
  // Mutant kills: M1 drop MAX clamp -> R1/R2; M2 drop sentinel -> R7/R9;
  // M3 drop reserve -> R4/R5/R6/R7; M4 order swap -> R1/R2/R3;
  // M5 floor-to-MIN instead of sentinel 0 -> R7/R8/R9.
  for (const row of ROWS) {
    it(row.id, () => {
      expect(remainingModelBudgetMs(row.startedAtMs, row.now)).toBe(row.expected);
    });
  }
});
