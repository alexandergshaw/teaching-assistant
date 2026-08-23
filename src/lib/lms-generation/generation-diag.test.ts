import { describe, expect, it } from "vitest";
import {
  buildScriptGenerationDiag,
  fnv1aHash,
  redactSensitiveText,
  unattemptedLlmDiag,
  type ScriptGenerationLlmDiag,
} from "./generation-diag";

describe("redactSensitiveText", () => {
  // THE HARD REQUIREMENT this file exists to satisfy: Gemini sends its API
  // key as a URL QUERY PARAMETER (src/lib/llm.ts's callGemini), and an
  // upstream error body can echo the request it is rejecting - so a request
  // URL, key included, is a real and not hypothetical risk in a failure
  // body.
  it("SABOTAGE TARGET: strips a full request URL, key included", () => {
    const body =
      'Bad Request: the request to https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=AIzaSyFAKE1234567890 could not be processed';
    const redacted = redactSensitiveText(body);
    expect(redacted).not.toContain("AIzaSyFAKE1234567890");
    expect(redacted).not.toContain("https://");
    expect(redacted).toContain("[url redacted]");
  });

  it("strips a bare key= mention that is not part of a URL", () => {
    const body = "Invalid parameter key=AIzaSyBareKeyNotInAUrl in request";
    const redacted = redactSensitiveText(body);
    expect(redacted).not.toContain("AIzaSyBareKeyNotInAUrl");
    expect(redacted).toContain("[redacted]");
  });

  it("truncates to the given length", () => {
    const body = "x".repeat(500);
    expect(redactSensitiveText(body, 50)).toHaveLength(50);
    expect(redactSensitiveText(body)).toHaveLength(200); // default
  });

  it("leaves ordinary text alone", () => {
    expect(redactSensitiveText("The model returned no script.")).toBe("The model returned no script.");
  });
});

describe("fnv1aHash", () => {
  it("is deterministic for the same input", () => {
    expect(fnv1aHash("hello world")).toBe(fnv1aHash("hello world"));
  });

  // SABOTAGE-CHECKABLE: a hash function that ignored its input (e.g. always
  // returning a constant) would still pass the determinism test above but
  // fail this one.
  it("differs for different input", () => {
    expect(fnv1aHash("hello world")).not.toBe(fnv1aHash("hello there"));
  });

  it("never reveals the input - fixed-length hex output regardless of input length", () => {
    expect(fnv1aHash("")).toHaveLength(8);
    expect(fnv1aHash("a".repeat(1500))).toHaveLength(8);
  });
});

describe("unattemptedLlmDiag", () => {
  it("marks attempted false and carries only the provider", () => {
    expect(unattemptedLlmDiag("gemini")).toEqual({ attempted: false, provider: "gemini" });
  });
});

describe("buildScriptGenerationDiag", () => {
  const llm: ScriptGenerationLlmDiag = {
    attempted: true,
    provider: "gemini",
    model: "gemini-3.1-flash-lite",
    tokenBudget: 960,
    promptLength: 1234,
    promptHash: "deadbeef",
    styleBlockLength: 40,
    ok: true,
    textLength: 0,
  };

  it("resolvedBy is courseId when courseId is present, canvasUrl otherwise", () => {
    const byId = buildScriptGenerationDiag({
      courseId: "course-hub-1",
      course: null,
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
    });
    expect(byId.resolvedBy).toBe("courseId");

    const byUrl = buildScriptGenerationDiag({
      course: null,
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
    });
    expect(byUrl.resolvedBy).toBe("canvasUrl");
  });

  it("carries the resolved course row's fields exactly, or null when it never resolved", () => {
    const resolved = buildScriptGenerationDiag({
      course: { id: "c1", name: "Intro to CS", canvasUrl: "https://canvas.example.edu/courses/1", institution: "acme" },
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
    });
    expect(resolved.course).toEqual({
      id: "c1",
      name: "Intro to CS",
      canvasUrlAsStored: "https://canvas.example.edu/courses/1",
      institution: "acme",
    });

    const unresolved = buildScriptGenerationDiag({
      course: null,
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
    });
    expect(unresolved.course).toBeNull();
  });

  // SABOTAGE TARGET: fellBackToDefault must reflect the RAW moduleLabel the
  // caller sent, never the (already-substituted) final one - comparing
  // final-to-final would always read false.
  it("fellBackToDefault is true only when the RAW moduleLabel was blank", () => {
    const fellBack = buildScriptGenerationDiag({
      course: null,
      moduleLabelRaw: "",
      moduleLabelFinal: "the selected material",
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
    });
    expect(fellBack.moduleLabel).toEqual({ final: "the selected material", fellBackToDefault: true });

    const didNotFallBack = buildScriptGenerationDiag({
      course: null,
      moduleLabelRaw: "Week 2",
      moduleLabelFinal: "Week 2",
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
    });
    expect(didNotFallBack.moduleLabel).toEqual({ final: "Week 2", fellBackToDefault: false });
  });

  it("moduleLabel is null when moduleLabelFinal was never supplied (generation never reached that point)", () => {
    const result = buildScriptGenerationDiag({
      course: null,
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
    });
    expect(result.moduleLabel).toBeNull();
  });

  it("carries generator identity and both raw/resolved targetMinutes", () => {
    const result = buildScriptGenerationDiag({
      course: null,
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
      targetMinutesRaw: 7,
      targetMinutesResolved: 2,
    });
    expect(result.generator).toEqual({
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
      targetMinutesRaw: 7,
      targetMinutesResolved: 2,
    });
  });

  it("defaults targetMinutes fields to null rather than undefined when omitted (a stable, serializable shape)", () => {
    const result = buildScriptGenerationDiag({
      course: null,
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
    });
    expect(result.generator.targetMinutesRaw).toBeNull();
    expect(result.generator.targetMinutesResolved).toBeNull();
  });

  it("carries the llm diag through unchanged, or null when generation never reached the LLM call", () => {
    const withLlm = buildScriptGenerationDiag({
      course: null,
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
      llm,
    });
    expect(withLlm.llm).toBe(llm);

    const withoutLlm = buildScriptGenerationDiag({
      course: null,
      kindId: "scripts",
      artifactKind: "lecture-script",
      actionName: "generateModuleIntroScriptAction",
    });
    expect(withoutLlm.llm).toBeNull();
  });

  // D-TEST-3 (step-10c review): a test previously stood here
  // ("a full record with a redacted failure body never contains a raw key or
  // URL") that pre-redacted its own fixture by calling redactSensitiveText
  // BEFORE passing it to buildScriptGenerationDiag, then asserted the
  // OUTPUT was clean - which only proves redactSensitiveText redacts, a
  // second time, on a value the builder never touches. buildScriptGenerationDiag
  // performs no redaction of its own by design (this file's own header
  // comment: failureBodyRedacted "is passed through redactSensitiveText...
  // before it is ever placed on this type, never after") - it just carries
  // the field through, and that pass-through is already pinned, by reference
  // equality, by "carries the llm diag through unchanged... " above. Deleted
  // rather than kept as a duplicate: the two things it looked like it was
  // testing are each already covered elsewhere - redactSensitiveText's own
  // correctness (the describe block at the top of this file) and this
  // builder's pass-through behavior (the reference-equality test above).
});
