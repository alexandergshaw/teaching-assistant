// The pre-migration BINDING oracle for every shipped preset.
//
// `preset-bindings.oracle.json` beside this file was captured at commit 1df8e38, BEFORE
// the step-id migration: for all 49 presets, every expanded step's fully-resolved
// bindings and runIf gate, in EXPANDED coordinates. 228 steps, 847 bindings, 307 of them
// step-bindings.
//
// WHY THIS EXISTS, and why the sibling shape oracle is not enough. `preset-shape.oracle`
// pins step types, `topIndices`, and the run-form field list. None of those move when a
// step-binding points at the WRONG STEP: a mis-resolved `{source:"step"}` binding is
// still `source:"step"`, so it contributes no run-form field and changes no step type.
// The shape oracle stays green while every binding after an include step is silently
// off by the number of steps that include absorbed.
//
// That is not hypothetical. The step-id migration must resolve an id to its EXPANDED
// index (`defToExpanded` in types.expand.ts, which skips include steps and accounts for
// the many steps each absorbs). An implementation that instead resolves against the raw
// `def.steps` array gives the same answer for every step BEFORE an include and a wrong
// answer for every step after one. COURSE_BUILD includes course-refresh mid-list and
// absorbs ~19 steps, so `integrate-source-into-lms` and everything past it would be
// mis-wired by ~18 positions - silently, with no compile or runtime error.
//
// Do NOT regenerate this JSON to make a failure go away. A diff here means a preset's
// wiring changed, which is either a defect or a deliberate change needing its own entry.
import { describe, it, expect } from "vitest";
import { expandWorkflowDef, type InputBinding } from "@/lib/workflows/types";
import { PRESET_WORKFLOWS, getPresetDef } from "@/lib/workflows/presets";
import oracle from "./preset-bindings.oracle.json";

type StepSnapshot = { i: number; type: string; bindings: Record<string, string>; runIf: string | null };

const ORACLE = oracle as unknown as Record<string, StepSnapshot[]>;

function describeBinding(b: InputBinding): string {
  if (b.source === "step") {
    // An EXPANDED binding must never still carry a stepId: expandWorkflowDef lowers
    // every id to an index before either run engine sees it, and both engines read
    // `stepIndex` unconditionally. Assert it rather than coercing, so a lowering bug
    // surfaces here as a named failure instead of rendering as "step:undefined.key"
    // and quietly diffing against the oracle.
    if (!("stepIndex" in b)) {
      throw new Error(`expanded binding still carries a stepId (it was not lowered): ${JSON.stringify(b)}`);
    }
    return `step:${b.stepIndex}.${b.outputKey}`;
  }
  if (b.source === "runtime") return `runtime:${b.fieldKey}`;
  return `literal:${b.value}`;
}

function snapshot(id: string): StepSnapshot[] {
  const wf = PRESET_WORKFLOWS.find((w) => w.id === id)!;
  return expandWorkflowDef(wf, getPresetDef).steps.map((s, i) => ({
    i,
    type: s.type,
    bindings: Object.fromEntries(
      Object.entries(s.bindings)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, b]) => [k, describeBinding(b)])
    ),
    // Gates go through the SAME describeBinding, so a runIf whose id was not lowered
    // trips the same assertion. The expander translates runIf in a separate code path
    // from bindings, and an unlowered gate fails OPEN at run time - `String(undefined)`
    // is "undefined", which is truthy - so this is worth catching here too.
    runIf: s.runIf ? `${describeBinding(s.runIf.binding)}=${s.runIf.expected}` : null,
  }));
}

describe("every shipped preset keeps its resolved wiring", () => {
  it.each(Object.keys(ORACLE))("%s", (id) => {
    expect(snapshot(id)).toEqual(ORACLE[id]);
  });
});

describe("the oracle itself is meaningful", () => {
  // Canaries. If the capture ever degenerates to empty structures, every assertion above
  // passes vacuously. These are the numbers measured at capture time.
  it("covers every shipped preset, not just the four in the shape oracle", () => {
    // 49 -> 50: "schedule-weekly-announcements" (docs/weekly-announcement-
    // scheduling-acceptance-criteria.md) added ONE entry deliberately - see
    // that preset's own comment in src/lib/workflows/presets/communication.ts.
    // Every other entry is untouched (verified via `git diff` - a pure
    // 14-line insertion, zero deletions, before this canary was bumped).
    expect(Object.keys(ORACLE)).toHaveLength(50);
    expect(PRESET_WORKFLOWS).toHaveLength(50);
  });

  it("records the step count, binding count and step-binding count it was captured with", () => {
    // +1 step, +5 bindings (hubCourse/weekday/postTime/title/message, all
    // "runtime:" sourced) from the new preset above - 0 step-bindings, since
    // none of its bindings are `{source:"step"}`.
    //
    // docs/weekly-announcement-module-content-acceptance-criteria.md AC6
    // item 26 then bound two more runtime fields (draftFrom, extraNotes) on
    // that SAME step - no new step, so the step count does not move; +2
    // bindings, 854 -> 856, both "runtime:" sourced so the step-binding
    // count stays 309.
    //
    // docs/weekly-announcement-package-io-acceptance-criteria.md AC6 item 37
    // then bound SIX more runtime fields on that SAME step - cartridge,
    // deliver, emailCopy, packageFormats, startDate, weekCount - again no
    // new step (the step count stays 230) and all six are "runtime:"
    // sourced, so 856 -> 862 while the step-binding count stays 309.
    const all = Object.values(ORACLE).flat();
    const bindings = all.flatMap((s) => Object.values(s.bindings));
    expect(all).toHaveLength(230);
    expect(bindings).toHaveLength(862);
    expect(bindings.filter((b) => b.startsWith("step:"))).toHaveLength(309);
  });

  // THE point of the file: Course Build's include sits mid-list, so steps after it have
  // an expanded index far from their raw array position. If this assertion ever reads
  // like a small number, the oracle has stopped guarding the thing it exists for.
  it("pins bindings that sit AFTER an include step, where raw and expanded indices diverge", () => {
    const cb = ORACLE["course-build"];
    const afterInclude = cb.filter((s) => s.i > 10 && Object.values(s.bindings).some((b) => b.startsWith("step:")));
    expect(afterInclude.length).toBeGreaterThan(5);
  });
});
