import { describe, it, expect } from "vitest";
import { classifyRecipientCount, type SendDecision } from "./refusal";

describe("classifyRecipientCount", () => {
  const table: Array<[number, "send" | "one-student" | "over-max"]> = [
    [0, "one-student"],
    [1, "one-student"],
    [2, "send"],
    [100, "send"],
    [101, "over-max"],
    [2001, "over-max"],
  ];

  it.each(table)("count %i -> %s", (count, expected) => {
    const d: SendDecision = classifyRecipientCount(count);
    if (expected === "send") {
      expect(d.send).toBe(true);
    } else {
      expect(d.send).toBe(false);
      if (!d.send) {
        expect(d.kind).toBe(expected);
        expect(d.count).toBe(count);
      }
    }
  });

  it("3b: one student and over-max are distinct kinds", () => {
    const a = classifyRecipientCount(1);
    const b = classifyRecipientCount(101);
    expect(a.send).toBe(false);
    expect(b.send).toBe(false);
    if (!a.send && !b.send) expect(a.kind).not.toBe(b.kind);
  });
});
