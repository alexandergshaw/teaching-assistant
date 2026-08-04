import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// Guards the Schedule/Trigger form draft persistence feature's core safety
// invariants:
//
// AC3 (docs/REGRESSION.md): a stored draft (ta-workflow-schedule-draft-<id> /
// ta-workflow-trigger-draft-<id>) must never be able to overwrite a REAL
// saved schedule's/trigger's values once loaded for editing.
//
// Cross-workflow: switching the selected workflow must never leave one
// workflow's in-progress scheduleForm/triggerForm displayed under - or later
// written under - a DIFFERENT workflow's storage key.
//
// useAutomation.ts enforces AC3 structurally: the draft parsers
// (parseScheduleDraft/parseTriggerDraft, tested directly in
// workflow-form-helpers.test.ts) are called in exactly two places - inside
// scheduleForm's/triggerForm's useState lazy initializer (mount), and inside
// the SINGLE "reseed on workflow switch" effect, which is keyed ONLY on
// selectedDef?.id, never on scheduleForm/triggerForm themselves. They are
// never called from an effect keyed on the form values. ScheduleSection's/
// TriggerSection's "Edit" button loads a REAL saved row via a plain
// setScheduleForm(scheduleToForm(s)) / setTriggerForm(triggerToForm(t)) call
// while staying on the SAME workflow - that changes the form but not
// selectedDef?.id, so it cannot retrigger the reseed effect. If a future
// change made the draft-write effects (keyed on scheduleForm/triggerForm)
// also re-read the stored draft, it could refire after that Edit call and
// silently replace the real values with a stale draft - the exact defect
// AC3 exists to prevent. This test reads useAutomation.ts as text, extracts
// every useState(() => {...}) block and every useEffect(() => {...}, [...])
// block (body AND dependency array) by brace-matching, and asserts on those.
//
// The cross-workflow property is guarded by asserting that exactly one
// effect - keyed on selectedDef?.id alone - both retargets selectedDefIdRef
// and resets scheduleForm/triggerForm, in that order, atomically. That is
// what makes it structurally impossible for a write effect (which trusts
// selectedDefIdRef.current to name the right storage key) to fire while the
// ref still names the OLD workflow and the form still holds content meant
// for a DIFFERENT one.
//
// It also guards AC4 (the draft clears when the form is cleared): the two
// draft-WRITE effects (keyed on scheduleForm/triggerForm respectively) must
// actively remove the stored draft - not just skip writing it - whenever the
// form becomes falsy (a successful create/save, or an explicit Cancel, both
// already null the form).

const SOURCE_PATH = path.resolve(
  process.cwd(),
  "src/app/components/workflows/useAutomation.ts"
);

// Brace-matches the body of every occurrence of `headRegex` (which must end
// in an opening "{") and returns each body's text. Naive (no string/comment
// awareness), matching the sophistication of this repo's other structural
// text guard (see page-module-css-classes.test.ts) - sufficient here because
// none of the bodies being scanned contain unbalanced braces in strings or
// comments (template-literal interpolations like `${id}` are individually
// balanced, so they do not upset the depth count).
function extractBraceBodies(source: string, headRegex: RegExp): string[] {
  const bodies: string[] = [];
  const flags = headRegex.flags.includes("g") ? headRegex.flags : `${headRegex.flags}g`;
  const re = new RegExp(headRegex.source, flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    let i = match.index + match[0].length; // just past the opening "{"
    let depth = 1;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    bodies.push(source.slice(match.index + match[0].length, i - 1));
    re.lastIndex = i;
  }
  return bodies;
}

// Same brace-matching as extractBraceBodies, but for useEffect(() => {...})
// specifically, and it also captures the dependency array text that follows
// the body's closing brace (e.g. "scheduleForm", "selectedDef?.id",
// "user, supabase"). Needed because the safety property this file guards is
// no longer just "which effect contains the parser calls" but "which effect,
// keyed on WHAT, contains them" - two effects can otherwise share a
// substring (both the reseed effect and the schedule-draft write effect
// mention "ta-workflow-schedule-draft-"), so identifying an effect by its
// dependency array is the unambiguous way to pick the right one out.
function extractEffectsWithDeps(source: string): Array<{ body: string; deps: string }> {
  const effects: Array<{ body: string; deps: string }> = [];
  const re = /useEffect\(\(\)\s*=>\s*\{/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source)) !== null) {
    let i = match.index + match[0].length;
    let depth = 1;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    const body = source.slice(match.index + match[0].length, i - 1);
    const tail = source.slice(i, i + 300);
    const depsMatch = tail.match(/^\s*,\s*\[([^\]]*)\]/);
    effects.push({ body, deps: depsMatch ? depsMatch[1].trim() : "" });
    re.lastIndex = i;
  }
  return effects;
}

const USE_STATE_INITIALIZER = /useState(?:<[^>]*>)?\(\(\)\s*=>\s*\{/;
const USE_EFFECT_BODY = /useEffect\(\(\)\s*=>\s*\{/;

describe("useAutomation.ts draft persistence structural guard", () => {
  const source = fs.readFileSync(SOURCE_PATH, "utf-8");

  it("canary: the source actually mentions the draft parsers and storage keys (a broken extraction must not silently report clean)", () => {
    expect(source).toContain("parseScheduleDraft(");
    expect(source).toContain("parseTriggerDraft(");
    expect(source).toContain("ta-workflow-schedule-draft-");
    expect(source).toContain("ta-workflow-trigger-draft-");
  });

  it("canary: brace-matching extraction finds real useState/useEffect blocks with real content", () => {
    const initializerBodies = extractBraceBodies(source, USE_STATE_INITIALIZER);
    const effectBodies = extractBraceBodies(source, USE_EFFECT_BODY);
    // Known from a direct read of useAutomation.ts: exactly 2
    // useState(() => {...}) lazy initializers (scheduleForm, triggerForm)
    // and 5 useEffect(() => {...}, [...]) blocks: the workflow-switch reseed
    // effect, the two draft-write effects, and the two once-per-mount
    // schedule/trigger load effects.
    expect(initializerBodies.length).toBeGreaterThanOrEqual(2);
    expect(effectBodies.length).toBeGreaterThanOrEqual(5);
    expect(effectBodies.some((b) => b.includes("selectedDefIdRef.current"))).toBe(true);
    // Sanity: an extraction that always returned [] or empty strings would
    // otherwise make every assertion below vacuously pass.
    expect(initializerBodies.some((b) => b.trim().length > 20)).toBe(true);
  });

  it("canary: dependency-array extraction captures real, non-empty deps text (a regex that always returns \"\" would make the deps-based assertions below vacuously pass)", () => {
    const effects = extractEffectsWithDeps(source);
    expect(effects.length).toBeGreaterThanOrEqual(5);
    const scheduleWrite = effects.find((e) => e.deps === "scheduleForm");
    const triggerWrite = effects.find((e) => e.deps === "triggerForm");
    const loadEffects = effects.filter((e) => e.deps === "user, supabase");
    expect(scheduleWrite).toBeDefined();
    expect(triggerWrite).toBeDefined();
    expect(loadEffects.length).toBe(2);
  });

  it("parseScheduleDraft/parseTriggerDraft are read inside a useState lazy initializer, or inside the single workflow-switch reseed effect - never inside an effect keyed on scheduleForm/triggerForm itself", () => {
    const initializerBodies = extractBraceBodies(source, USE_STATE_INITIALIZER);
    const effects = extractEffectsWithDeps(source);

    const initializersText = initializerBodies.join("\n");
    expect(initializersText).toContain("parseScheduleDraft(");
    expect(initializersText).toContain("parseTriggerDraft(");

    // Exactly one effect may parse a draft, and it must be the SAME effect
    // for both parsers (a single, unified reseed effect - not two separate
    // ones that could run independently or out of order).
    const scheduleParsingEffects = effects.filter((e) => e.body.includes("parseScheduleDraft("));
    const triggerParsingEffects = effects.filter((e) => e.body.includes("parseTriggerDraft("));
    expect(scheduleParsingEffects.length).toBe(1);
    expect(triggerParsingEffects.length).toBe(1);
    expect(scheduleParsingEffects[0]).toBe(triggerParsingEffects[0]);

    const reseedEffect = scheduleParsingEffects[0];
    // The defining safety property: this effect is keyed on the WORKFLOW,
    // never on the form values it resets. If it depended on scheduleForm or
    // triggerForm, a real edit loaded via setScheduleForm(scheduleToForm(s))
    // would retrigger it and the freshly-loaded real values could be
    // clobbered by a re-parsed stale draft - the AC3 defect.
    expect(reseedEffect.deps).not.toMatch(/scheduleForm/);
    expect(reseedEffect.deps).not.toMatch(/triggerForm/);
    expect(reseedEffect.deps).toMatch(/selectedDef/);

    // No OTHER effect (in particular, the two draft-write effects keyed on
    // scheduleForm/triggerForm) may parse a draft.
    for (const effect of effects) {
      if (effect === reseedEffect) continue;
      expect(effect.body).not.toContain("parseScheduleDraft(");
      expect(effect.body).not.toContain("parseTriggerDraft(");
    }
  });

  it("cross-workflow: the workflow-switch reseed effect atomically retargets selectedDefIdRef AND resets scheduleForm/triggerForm/editingScheduleId/editingTriggerId - not split across separate effects that could run independently", () => {
    const effects = extractEffectsWithDeps(source);
    const reseedEffect = effects.find((e) => e.body.includes("parseScheduleDraft("));
    expect(reseedEffect).toBeDefined();
    const body = reseedEffect!.body;

    expect(body).toContain("selectedDefIdRef.current = ");
    expect(body).toContain("setScheduleForm(");
    expect(body).toContain("setTriggerForm(");
    expect(body).toContain("setEditingScheduleId(null)");
    expect(body).toContain("setEditingTriggerId(null)");

    // The ref must be retargeted to the new workflow BEFORE the forms are
    // reset, matching the causal story: by the time a write effect can
    // possibly observe scheduleForm/triggerForm having changed, it must read
    // selectedDefIdRef.current as the NEW workflow, never the old one.
    const refIdx = body.indexOf("selectedDefIdRef.current = ");
    const scheduleFormIdx = body.indexOf("setScheduleForm(");
    const triggerFormIdx = body.indexOf("setTriggerForm(");
    expect(refIdx).toBeGreaterThan(-1);
    expect(refIdx).toBeLessThan(scheduleFormIdx);
    expect(refIdx).toBeLessThan(triggerFormIdx);
  });

  it("AC4: the schedule/trigger draft persistence write effects remove the stored draft (not just skip writing it) whenever the form is falsy", () => {
    const effects = extractEffectsWithDeps(source);
    // Identified by dependency array (deps === "scheduleForm" / "triggerForm"),
    // not by a body substring: the reseed effect above also mentions the
    // "ta-workflow-schedule-draft-"/"ta-workflow-trigger-draft-" key
    // templates (it reads them), so a substring-based lookup would be
    // ambiguous about which effect it found.
    const scheduleDraftEffect = effects.find((e) => e.deps === "scheduleForm");
    const triggerDraftEffect = effects.find((e) => e.deps === "triggerForm");
    expect(scheduleDraftEffect).toBeDefined();
    expect(triggerDraftEffect).toBeDefined();
    expect(scheduleDraftEffect!.body).toContain("ta-workflow-schedule-draft-");
    expect(triggerDraftEffect!.body).toContain("ta-workflow-trigger-draft-");
    expect(scheduleDraftEffect!.body).toContain("removeItem");
    expect(triggerDraftEffect!.body).toContain("removeItem");
    // Genuinely conditional on the form's truthiness, not unconditional
    // (which would delete an in-progress draft the user is actively typing).
    expect(scheduleDraftEffect!.body).toMatch(/if\s*\(\s*scheduleForm\s*\)/);
    expect(triggerDraftEffect!.body).toMatch(/if\s*\(\s*triggerForm\s*\)/);
  });
});
