import { describe, it, expect } from "vitest";
import { PLAIN_LANGUAGE_CONTRACT, CONCRETE_DIRECTION_CONTRACT } from "./artifact-voice";

describe("PLAIN_LANGUAGE_CONTRACT", () => {
  it("demands writing for a reader with no prior experience of the subject", () => {
    expect(PLAIN_LANGUAGE_CONTRACT).toContain("NO prior experience");
  });

  it("prefers the everyday word over the professional one", () => {
    expect(PLAIN_LANGUAGE_CONTRACT).toContain("everyday word over the professional one");
  });

  it("requires a required field term to be defined in plain English on first use", () => {
    expect(PLAIN_LANGUAGE_CONTRACT).toContain("plain English on first use");
  });

  it("bans abstract filler that could describe any topic, naming the failure modes actually seen", () => {
    expect(PLAIN_LANGUAGE_CONTRACT).toContain("abstract filler");
    expect(PLAIN_LANGUAGE_CONTRACT).toContain("levers of success");
    expect(PLAIN_LANGUAGE_CONTRACT).toContain("social architecture");
  });

  it("requires short, concrete sentences", () => {
    expect(PLAIN_LANGUAGE_CONTRACT).toContain("short, concrete sentences");
  });

  it("addresses the reader as 'you'", () => {
    expect(PLAIN_LANGUAGE_CONTRACT).toContain('"you"');
  });

  it("stays professional - plain is not casual, no slang, no talking down", () => {
    expect(PLAIN_LANGUAGE_CONTRACT).toContain("plain is not casual");
    expect(PLAIN_LANGUAGE_CONTRACT).toContain("no slang");
    expect(PLAIN_LANGUAGE_CONTRACT).toContain("never talk down");
  });
});

describe("CONCRETE_DIRECTION_CONTRACT", () => {
  it("requires 2-4 specific, recognizable example directions, not categories", () => {
    expect(CONCRETE_DIRECTION_CONTRACT).toContain("2-4 specific example directions");
    expect(CONCRETE_DIRECTION_CONTRACT).toContain("never abstract categories");
  });

  it("requires the expected scope to be stated explicitly", () => {
    expect(CONCRETE_DIRECTION_CONTRACT).toContain("expected scope explicitly");
    expect(CONCRETE_DIRECTION_CONTRACT).toContain("how many items, how long, what format");
  });

  it("requires exactly one worked mini-example of the expected output", () => {
    expect(CONCRETE_DIRECTION_CONTRACT).toContain("ONE worked mini-example");
    expect(CONCRETE_DIRECTION_CONTRACT).toContain("a single filled-in row, quadrant, or entry");
  });

  it("says explicitly that the example is a model to learn from, not a template to copy", () => {
    expect(CONCRETE_DIRECTION_CONTRACT).toContain("model to learn the pattern from");
    expect(CONCRETE_DIRECTION_CONTRACT).toContain("not a template to copy");
  });
});
