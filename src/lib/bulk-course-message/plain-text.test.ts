import { describe, it, expect } from "vitest";
import { canvasInboxPlainText } from "./plain-text";

const TABLE: Array<[string, string]> = [
  ["# Heading", "Heading"],
  ["## Week 3 update", "Week 3 update"],
  ["**bold**", "bold"],
  ["__bold__", "bold"],
  ["*italic*", "italic"],
  ["- first\n- second", "first\nsecond"],
  ["* bullet", "bullet"],
  ["`code`", "code"],
  ["Office hours moved to room 5", "Office hours moved to room 5"],
  ["Problem #1 is due Friday", "Problem #1 is due Friday"],
  ["See item #42 and #1 today", "See item #42 and #1 today"],
  ["Email me at a_b@x.edu", "Email me at a_b@x.edu"],
  ["<b>hi</b> there", "hi there"],
  ["Meet **Dr. Lee** in #1", "Meet Dr. Lee in #1"],
  ["#1 priority is the quiz", "#1 priority is the quiz"],
];

describe("canvasInboxPlainText", () => {
  it.each(TABLE)("%j -> %j", (input, expected) => {
    expect(canvasInboxPlainText(input)).toBe(expected);
  });

  it("corpus facts: no heading marker, no **, no tag survives; #1 does", () => {
    const out = TABLE.map(([i]) => canvasInboxPlainText(i)).join("\n");
    expect(out.split("\n").some((l) => /^\s*#{1,6}[ \t]/.test(l))).toBe(false);
    expect(out.includes("**")).toBe(false);
    expect(/<\/?[a-zA-Z][^>]*>/.test(out)).toBe(false);
    expect(out.includes("#1")).toBe(true);
  });
});
