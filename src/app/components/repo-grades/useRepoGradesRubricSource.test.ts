// Tests for useRepoGradesRubricSource.ts. vitest here is node-env and never
// renders a component (no @testing-library, per this project's own testing
// posture), so the hook itself cannot be mounted. What CAN be genuinely
// exercised without rendering:
//
// 1. Its three exported pure helpers (choiceToSelectValue,
//    findExportRubricByIdentity, resolutionToResolvedRubric) - real unit
//    tests, no source-reading involved.
// 2. Two structural properties that matter for correctness but have no other
//    way to be proven without a renderer - each a source-reading guard,
//    paired with a canary that proves the guard can actually fail (this
//    file's own precedent for that idiom is
//    repoGradesSliceA.guards.test.ts:58-65).
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  choiceToSelectValue,
  findExportRubricByIdentity,
  resolutionToResolvedRubric,
} from "./useRepoGradesRubricSource";
import { resolvedRubric, failedRubricLookup } from "./repoGradesRubricCache";
import { defaultRepoGradeRubricChoice } from "./repoGradesUiState";

const source = readFileSync(join(process.cwd(), "src/app/components/repo-grades/useRepoGradesRubricSource.ts"), "utf8");

// ---------------------------------------------------------------------------
// choiceToSelectValue - converts a per-course persisted {source, identity}
// pair into the select-value string repoGradesRubricSource.ts's
// parseRepoGradeRubricValue understands. This exact conversion is the fix for
// a real bug this hook's own header comment names: encodeRepoGradeRubricChoice
// (repoGradesUiState.ts) always emits a trailing colon for the three fixed
// sources ("generate:", "assignment:", "manual:"), which parseRepoGradeRubricValue
// does NOT recognise (it matches only the bare tokens) - so choiceToSelectValue
// must NOT delegate to that encoder.
describe("choiceToSelectValue", () => {
  it("emits the bare sentinel token for the three fixed sources, with no trailing separator", () => {
    expect(choiceToSelectValue({ source: "generate", identity: "" })).toBe("generate");
    expect(choiceToSelectValue({ source: "assignment", identity: "" })).toBe("assignment");
    expect(choiceToSelectValue({ source: "manual", identity: "" })).toBe("manual");
  });

  it("prefixes a live choice's identity with 'live:'", () => {
    expect(choiceToSelectValue({ source: "live", identity: "482" })).toBe("live:482");
  });

  it("prefixes an export choice's identity with 'export:' (identity already carries the occurrence:title shape)", () => {
    expect(choiceToSelectValue({ source: "export", identity: "1:Grading Rubric" })).toBe("export:1:Grading Rubric");
  });

  it("round-trips through parseRepoGradeRubricValue for every source - the property this function exists for", async () => {
    const { parseRepoGradeRubricValue } = await import("./repoGradesRubricSource");
    const choices: Array<{ source: "generate" | "assignment" | "manual" | "live" | "export"; identity: string }> = [
      { source: "generate", identity: "" },
      { source: "assignment", identity: "" },
      { source: "manual", identity: "" },
      { source: "live", identity: "7" },
      { source: "export", identity: "0:Lab 1: Setup" },
    ];
    for (const choice of choices) {
      const value = choiceToSelectValue(choice);
      const parsed = parseRepoGradeRubricValue(value);
      expect(parsed).not.toBeNull();
      expect(parsed?.source).toBe(choice.source);
    }
  });

  it("CANARY - proves the round-trip assertion can fail: the discarded encodeRepoGradeRubricChoice shape does not parse back", async () => {
    const { parseRepoGradeRubricValue } = await import("./repoGradesRubricSource");
    const { encodeRepoGradeRubricChoice } = await import("./repoGradesUiState");
    const wrongShape = encodeRepoGradeRubricChoice({ source: "assignment", identity: "" });
    expect(wrongShape).toBe("assignment:");
    expect(parseRepoGradeRubricValue(wrongShape)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// findExportRubricByIdentity - must use the SAME occurrence-counting
// algorithm (original array order, not display order) that
// buildRepoGradeRubricOptions (repoGradesRubricSource.ts) used to construct
// the identity in the first place, or a duplicate-titled export rubric would
// resolve to the WRONG one at grade time.
describe("findExportRubricByIdentity", () => {
  const items = [{ title: "Grading Rubric" }, { title: "Style Guide" }, { title: "Grading Rubric" }];

  it("finds the first occurrence of a duplicated title at occurrence 0", () => {
    expect(findExportRubricByIdentity(items, 0, "Grading Rubric")).toBe(items[0]);
  });

  it("finds the second occurrence of a duplicated title at occurrence 1, not the first", () => {
    expect(findExportRubricByIdentity(items, 1, "Grading Rubric")).toBe(items[2]);
  });

  it("finds a non-duplicated title at occurrence 0", () => {
    expect(findExportRubricByIdentity(items, 0, "Style Guide")).toBe(items[1]);
  });

  it("returns null for a title that is not present", () => {
    expect(findExportRubricByIdentity(items, 0, "Nonexistent")).toBeNull();
  });

  it("returns null when the occurrence index exceeds how many times the title actually appears", () => {
    expect(findExportRubricByIdentity(items, 2, "Grading Rubric")).toBeNull();
  });

  it("CANARY - proves occurrence order matters: searching from the END of the array finds the wrong item", () => {
    // A naive "last occurrence" search would return items[2] for occurrence 0
    // instead of items[0] - demonstrating the real, non-vacuous failure mode
    // the ordering rule above guards against.
    const lastOccurrenceFirst = [...items].reverse().find((item) => item.title === "Grading Rubric");
    expect(lastOccurrenceFirst).toBe(items[2]);
    expect(findExportRubricByIdentity(items, 0, "Grading Rubric")).not.toBe(lastOccurrenceFirst);
  });
});

// ---------------------------------------------------------------------------
// resolutionToResolvedRubric - the one place a cache resolution is translated
// into the contract's ResolvedRubric shape. AC item 13's whole point is that
// a failure never blocks grading (text always becomes "", never propagates
// the failure as an exception) while still carrying the reason forward.
describe("resolutionToResolvedRubric", () => {
  it("a resolved entry becomes {text, failureReason: null}", () => {
    const result = resolutionToResolvedRubric(resolvedRubric("Area (10 pts): description"), "live", "My Rubric");
    expect(result).toEqual({ text: "Area (10 pts): description", source: "live", identity: "My Rubric", failureReason: null });
  });

  it("a failed entry becomes {text: '', failureReason: <reason>} - the reason is never dropped", () => {
    const result = resolutionToResolvedRubric(failedRubricLookup("404 from Canvas"), "export", "My Export Rubric");
    expect(result).toEqual({ text: "", source: "export", identity: "My Export Rubric", failureReason: "404 from Canvas" });
  });

  it("CANARY - proves the assertion can fail: a resolved entry's text is not silently discarded like a failed one's is", () => {
    const resolved = resolutionToResolvedRubric(resolvedRubric("some text"), "assignment", "123");
    expect(resolved.text).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// Structural guard 1: no useEffect body calls a setState updater before an
// `await` inside that same effect - eslint's react-hooks/set-state-in-effect
// rule this hook's own header comment names. This is proven structurally
// (brace-depth extraction of each `useEffect(() => { ... })` body) rather
// than by rendering, since this project's vitest cannot render a hook.
function extractEffectBodies(text: string): string[] {
  const bodies: string[] = [];
  const marker = "useEffect(() => {";
  let searchFrom = 0;
  for (;;) {
    const start = text.indexOf(marker, searchFrom);
    if (start === -1) break;
    const bodyStart = start + marker.length;
    let depth = 1;
    let i = bodyStart;
    while (i < text.length && depth > 0) {
      if (text[i] === "{") depth += 1;
      else if (text[i] === "}") depth -= 1;
      i += 1;
    }
    bodies.push(text.slice(bodyStart, i - 1));
    searchFrom = i;
  }
  return bodies;
}

/** True when a `set<Something>(` call appears in `body` before the first
 * `await ` - i.e. a synchronous setState reached directly from an effect
 * body, the exact pattern eslint's react-hooks/set-state-in-effect rejects. */
function hasSetStateBeforeAwait(body: string): boolean {
  const awaitIndex = body.indexOf("await ");
  const relevant = awaitIndex === -1 ? body : body.slice(0, awaitIndex);
  return /\bset[A-Z]\w*\(/.test(relevant);
}

describe("no useEffect in this hook calls setState synchronously", () => {
  const effectBodies = extractEffectBodies(source);

  it("finds the effects this file actually declares (a guard over zero bodies proves nothing)", () => {
    expect(effectBodies.length).toBeGreaterThanOrEqual(3);
  });

  it("every effect body's setState calls (if any) come after an await, never before", () => {
    for (const body of effectBodies) {
      expect(hasSetStateBeforeAwait(body)).toBe(false);
    }
  });

  it("CANARY - proves hasSetStateBeforeAwait can detect the exact violation it exists to catch", () => {
    const violating = `
      if (!ready) return;
      setLoading(true);
      (async () => {
        const result = await fetchThing();
        setLoading(false);
      })();
    `;
    expect(hasSetStateBeforeAwait(violating)).toBe(true);
  });

  it("CANARY - a setState call that only appears AFTER an await is correctly accepted", () => {
    const compliant = `
      let cancelled = false;
      (async () => {
        const result = await fetchThing();
        if (cancelled) return;
        setLoading(false);
      })();
    `;
    expect(hasSetStateBeforeAwait(compliant)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Structural guard 2: the live/export textarea preview effect reaches the
// rubric text through resolveRubricForColumn itself - not a second,
// independently-written resolution path. This is the concrete mechanism
// behind this file's own header claim ("THE SHARED RESOLVER IS LITERALLY
// SHARED, NOT MERELY SIMILAR"): if a future edit gave the preview its own
// inline fetch instead of calling the shared resolver, the textarea could
// show text a grade click would never actually send (AC item 14), with
// every other test in this suite still green.
describe("the live/export textarea preview reuses resolveRubricForColumn, not a second resolution path", () => {
  it("the preview effect calls resolveRubricForColumn", () => {
    expect(source).toMatch(/await resolveRubricForColumn\(null\)/);
  });

  it("resolveRubricForColumn is defined exactly once in this file", () => {
    const definitions = source.match(/const resolveRubricForColumn = async/g) ?? [];
    expect(definitions.length).toBe(1);
  });

  it("CANARY - proves the first assertion is checking real text, not matching everything: a renamed call site fails it", () => {
    const rewritten = source.replace("await resolveRubricForColumn(null)", "await fetchLiveOrExportTextDirectly(null)");
    expect(rewritten).not.toMatch(/await resolveRubricForColumn\(null\)/);
  });
});

// Sanity: defaultRepoGradeRubricChoice (imported above only to exercise the
// same repoGradesUiState.ts module path choiceToSelectValue's own tests
// import from) still encodes to the hook's own "generate" sentinel - keeps
// this file honest about the module boundary it is testing across.
describe("module boundary sanity", () => {
  it("defaultRepoGradeRubricChoice round-trips through choiceToSelectValue to the generate sentinel", () => {
    expect(choiceToSelectValue(defaultRepoGradeRubricChoice())).toBe("generate");
  });
});
