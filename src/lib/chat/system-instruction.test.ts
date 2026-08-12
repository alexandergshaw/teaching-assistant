import { describe, it, expect } from "vitest";
import {
  buildChatSystemInstruction,
  PLAIN_TEXT_ONLY_INSTRUCTION,
  INSTRUCTOR_AUDIENCE_INSTRUCTION,
} from "./system-instruction";

// The reported defect: the chatbot "keeps trying to respond as though the
// target audience is a student."
//
// The cause was an ABSENCE, not a bad instruction. The system instruction
// carried a plain-text formatting rule and an optional tone sample, and said
// nothing at all about who the user is. Given an app full of course material
// and no stated audience, the model inferred the reader was a student. The fix
// is to say who is actually asking.
//
// These tests pin the FACTS - that the framing exists, on every path, and that
// the formatting rule still outranks the tone instruction - and deliberately
// not the wording, which must stay free to be tuned.

describe("buildChatSystemInstruction", () => {
  it("states who the user is even when there is no writing sample", () => {
    // The regression this exists to prevent: adding the framing only to the
    // styled branch, so an instructor with no writing sample keeps getting
    // talked to like a student.
    const result = buildChatSystemInstruction("");
    expect(result).toContain(INSTRUCTOR_AUDIENCE_INSTRUCTION);
    expect(result).toContain(PLAIN_TEXT_ONLY_INSTRUCTION);
  });

  it("states who the user is when a writing sample is present", () => {
    const result = buildChatSystemInstruction("\n\nWRITING SAMPLE\nSome prose.");
    expect(result).toContain(INSTRUCTOR_AUDIENCE_INSTRUCTION);
    expect(result).toContain(PLAIN_TEXT_ONLY_INSTRUCTION);
    expect(result).toContain("Some prose.");
  });

  it("keeps the formatting rule ahead of the tone instruction", () => {
    // Pre-existing invariant: a matched tone that starts emitting markdown is a
    // regression, so the plain-text rule must stay dominant.
    const result = buildChatSystemInstruction("\n\nWRITING SAMPLE\nSome prose.");
    const plainTextAt = result.indexOf(PLAIN_TEXT_ONLY_INSTRUCTION);
    const mimicAt = result.toLowerCase().indexOf("mimic");
    expect(plainTextAt).toBeGreaterThanOrEqual(0);
    expect(mimicAt).toBeGreaterThan(plainTextAt);
  });

  it("carries a substantive audience framing, not a token phrase", () => {
    // A one-word constant would satisfy every containment check above while
    // telling the model nothing.
    expect(INSTRUCTOR_AUDIENCE_INSTRUCTION.length).toBeGreaterThan(120);
    expect(INSTRUCTOR_AUDIENCE_INSTRUCTION.toLowerCase()).toContain("instructor");
  });

  it("does not tell the model to write for students by default", () => {
    // The framing may - and should - mention student-facing MATERIALS, since
    // producing them is much of the job. What it must never do is cast the
    // person in the conversation as the student.
    const lowered = INSTRUCTOR_AUDIENCE_INSTRUCTION.toLowerCase();
    for (const phrase of ["you are a student", "the user is a student", "explain to the student"]) {
      expect(lowered).not.toContain(phrase);
    }
  });
});
