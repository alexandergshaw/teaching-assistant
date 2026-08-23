import { describe, expect, it } from "vitest";
import { buildGenerationDiagRecord, createDiagRecorder, generationDiagRecordFilename } from "./lmsGenerationDiagRecord";
import type { ScriptGenerationServerDiag } from "@/lib/lms-generation/generation-diag";

const BASE = {
  kindId: "scripts" as const,
  itemCount: 3,
  moduleKeys: ["live:1", "export:m2"],
  expandedItemCount: 5,
  moduleLabel: "Week 2",
  scriptMinutesRequested: 2,
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_000_001_500,
};

describe("buildGenerationDiagRecord", () => {
  it("computes durationMs from startedAt/endedAt and formats both as ISO timestamps", () => {
    const record = buildGenerationDiagRecord({ ...BASE, rejected: false, ok: true, setPreviewReached: true });
    expect(record.timing.durationMs).toBe(1500);
    expect(record.timing.startedAt).toBe(new Date(BASE.startedAt).toISOString());
    expect(record.timing.endedAt).toBe(new Date(BASE.endedAt).toISOString());
  });

  it("outcome is 'rejected' only when rejected is true, 'returned' otherwise (even on a returned {error})", () => {
    const returnedError = buildGenerationDiagRecord({
      ...BASE,
      rejected: false,
      ok: false,
      errorText: "The model returned no script. Try again.",
      setPreviewReached: false,
    });
    expect(returnedError.timing.outcome).toBe("returned");

    const rejected = buildGenerationDiagRecord({
      ...BASE,
      rejected: true,
      ok: false,
      errorText: "Could not generate content: fetch failed",
      setPreviewReached: false,
    });
    expect(rejected.timing.outcome).toBe("rejected");
  });

  it("carries the selection shape through unchanged", () => {
    const record = buildGenerationDiagRecord({ ...BASE, rejected: false, ok: true, setPreviewReached: true });
    expect(record.selection).toEqual({
      itemCount: 3,
      moduleKeys: ["live:1", "export:m2"],
      expandedItemCount: 5,
      moduleLabel: "Week 2",
    });
  });

  it("setPreviewReached is taken directly from the caller, not derived from ok", () => {
    // SABOTAGE-CHECKABLE: a caller that always passed `setPreviewReached: ok`
    // would make this test indistinguishable from one that derives it - this
    // asserts the field is independently settable, which is the whole point
    // (see this file's own doc comment on why it is not derived at read
    // time).
    const record = buildGenerationDiagRecord({ ...BASE, rejected: false, ok: true, setPreviewReached: false });
    expect(record.result.ok).toBe(true);
    expect(record.result.setPreviewReached).toBe(false);
  });

  // L1 FIX: `errorText` is not automatically safe (see this file's own
  // header comment) - `recordDiag` runs on the generic branch for every
  // kind, and for every kind but "scripts" the {error} string can be
  // describeLlmFailure's raw upstream Gemini body, which can carry Gemini's
  // own API key as a URL query parameter. Two cases, matching
  // redactSensitiveText's own two independent patterns (generation-diag.ts):
  // a full URL, and a bare "key=..." with no surrounding URL.
  it("redacts a key= query parameter out of errorText before it reaches the record, with or without a surrounding URL", () => {
    const withUrl = buildGenerationDiagRecord({
      ...BASE,
      rejected: false,
      ok: false,
      errorText: "Quiz generation failed: HTTP 400 - https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=AIzaSyFAKESECRET rejected",
      setPreviewReached: false,
    });
    expect(withUrl.result.errorText).not.toContain("AIzaSyFAKESECRET");
    expect(withUrl.result.errorText).not.toContain("key=");

    const bareKey = buildGenerationDiagRecord({
      ...BASE,
      rejected: false,
      ok: false,
      errorText: "Quiz generation failed: the request with key=AIzaSyFAKESECRET was rejected",
      setPreviewReached: false,
    });
    expect(bareKey.result.errorText).not.toContain("AIzaSyFAKESECRET");
    expect(bareKey.result.errorText).not.toContain("key=");
  });

  it("serverDiag is undefined when the action returned none, and passed through unchanged when it did", () => {
    const withoutServerDiag = buildGenerationDiagRecord({ ...BASE, rejected: false, ok: true, setPreviewReached: true });
    expect(withoutServerDiag.serverDiag).toBeUndefined();

    const serverDiag: ScriptGenerationServerDiag = {
      course: { id: "c1", name: "Course", canvasUrlAsStored: null, institution: null },
      resolvedBy: "canvasUrl",
      moduleLabel: { final: "Week 2", fellBackToDefault: false },
      generator: {
        kindId: "scripts",
        artifactKind: "lecture-script",
        actionName: "generateModuleIntroScriptAction",
        targetMinutesRaw: 2,
        targetMinutesResolved: 2,
      },
      llm: {
        attempted: true,
        provider: "gemini",
        model: "gemini-3.1-flash-lite",
        tokenBudget: 960,
        ok: true,
        textLength: 0,
      },
    };
    const withServerDiag = buildGenerationDiagRecord({
      ...BASE,
      rejected: false,
      ok: false,
      errorText: "The model returned no script. Try again.",
      setPreviewReached: false,
      serverDiag,
    });
    expect(withServerDiag.serverDiag).toBe(serverDiag);
  });

  // THE HARD REQUIREMENT (docs/DEV_LOOP.md-style redaction rule the
  // coordinator's brief spelled out): the record must never contain a
  // provider API key, a Canvas token, a Supabase key/JWT, the user's email,
  // the composed prompt, the full materialsText, or the generated script
  // body. Most of those cannot reach this builder at all (nothing here reads
  // a Canvas token/Supabase key, and the prompt/materialsText/script are
  // represented only as lengths/counts) - but `errorText` CAN carry one of
  // them verbatim, because it comes straight from the generic branch's
  // {error} string, which for every kind but "scripts" can itself be
  // describeLlmFailure's raw, truncated upstream Gemini body (see this file's
  // own header comment). THIS is the fixture that must contain a forbidden
  // thing, or the test proves nothing - a fixture built entirely from clean
  // strings can only ever fail if the builder INVENTS a secret, which is
  // exactly the bug this test previously could not catch (L1).
  it("HARD REQUIREMENT: a forbidden secret embedded in errorText does not survive into the record", () => {
    const record = buildGenerationDiagRecord({
      ...BASE,
      rejected: false,
      ok: false,
      errorText:
        "Knowledge check generation failed: HTTP 400 - https://generativelanguage.googleapis.com/v1beta/models/x:generateContent?key=AIzaSyFAKESECRETVALUE0000 rejected the request",
      setPreviewReached: false,
      serverDiag: {
        course: {
          id: "c1",
          name: "Intro to CS",
          canvasUrlAsStored: "https://canvas.example.edu/courses/1",
          institution: "acme",
        },
        resolvedBy: "canvasUrl",
        moduleLabel: { final: "Week 2", fellBackToDefault: false },
        generator: {
          kindId: "scripts",
          artifactKind: "lecture-script",
          actionName: "generateModuleIntroScriptAction",
          targetMinutesRaw: 2,
          targetMinutesResolved: 2,
        },
        llm: {
          attempted: true,
          provider: "gemini",
          model: "gemini-3.1-flash-lite",
          tokenBudget: 960,
          promptLength: 812,
          promptHash: "deadbeef",
          styleBlockLength: 300,
          ok: true,
          textLength: 0,
        },
      },
    });
    const serialized = JSON.stringify(record);
    // No API key shape (Gemini keys look like "AIza..."), no key= query
    // parameter, no bearer/authorization token, no Supabase service-role
    // marker.
    expect(serialized).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/);
    expect(serialized).not.toMatch(/key=/i);
    expect(serialized).not.toMatch(/authorization/i);
    expect(serialized).not.toMatch(/service_role/i);
    expect(serialized).not.toMatch(/bearer /i);
    // No field is a suspiciously long free-text blob (a stand-in check for
    // "the prompt/materialsText/script body were never embedded verbatim") -
    // every string value in this fixture is well under prompt-length scale.
    for (const value of Object.values(JSON.parse(serialized).serverDiag.llm)) {
      if (typeof value === "string") expect(value.length).toBeLessThan(100);
    }
  });
});

describe("createDiagRecorder", () => {
  const COMMON = {
    kindId: "scripts" as const,
    itemCount: 3,
    moduleKeys: ["live:1"],
    expandedItemCount: 5,
    moduleLabel: "Week 2",
    scriptMinutesRequested: 2,
    startedAt: 1_700_000_000_000,
  };

  it("writes the built record to the ref and flips hasDiagLog to true, on an error outcome", () => {
    const ref: { current: ReturnType<typeof buildGenerationDiagRecord> | null } = { current: null };
    let hasDiagLog = false;
    const recordDiag = createDiagRecorder(ref, (v) => (hasDiagLog = v), COMMON);

    recordDiag({ endedAt: 1_700_000_001_000, rejected: true, ok: false, errorText: "boom", setPreviewReached: false });

    expect(hasDiagLog).toBe(true);
    expect(ref.current).not.toBeNull();
    expect(ref.current?.result).toEqual({
      ok: false,
      errorText: "boom",
      courseNotLinked: undefined,
      setPreviewReached: false,
    });
    expect(ref.current?.timing.outcome).toBe("rejected");
  });

  it("writes the built record to the ref and flips hasDiagLog to true, on a success outcome", () => {
    const ref: { current: ReturnType<typeof buildGenerationDiagRecord> | null } = { current: null };
    let hasDiagLog = false;
    const recordDiag = createDiagRecorder(ref, (v) => (hasDiagLog = v), COMMON);

    recordDiag({ endedAt: 1_700_000_001_000, rejected: false, ok: true, setPreviewReached: true });

    expect(hasDiagLog).toBe(true);
    expect(ref.current?.result.ok).toBe(true);
    expect(ref.current?.timing.outcome).toBe("returned");
  });

  // SABOTAGE-CHECKABLE: a recorder that forgot to spread `common` into the
  // call would produce a record missing kindId/selection/request entirely -
  // this pins that the two halves (common, per-call facts) really do merge
  // into one record, not just that SOME record gets built.
  it("merges the common facts (captured once) with the per-call facts (different each time)", () => {
    const ref: { current: ReturnType<typeof buildGenerationDiagRecord> | null } = { current: null };
    const recordDiag = createDiagRecorder(ref, () => {}, COMMON);

    recordDiag({ endedAt: 1_700_000_001_000, rejected: false, ok: true, setPreviewReached: true });

    expect(ref.current?.kindId).toBe("scripts");
    expect(ref.current?.selection).toEqual({
      itemCount: 3,
      moduleKeys: ["live:1"],
      expandedItemCount: 5,
      moduleLabel: "Week 2",
    });
  });
});

describe("generationDiagRecordFilename", () => {
  it("names the file with the kind and a filesystem-safe timestamp (no colons)", () => {
    const record = buildGenerationDiagRecord({ ...BASE, rejected: false, ok: true, setPreviewReached: true });
    const filename = generationDiagRecordFilename(record);
    expect(filename).toMatch(/^generation-diagnostic-scripts-.*\.json$/);
    expect(filename).not.toContain(":");
  });
});
