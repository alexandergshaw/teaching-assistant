import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import type { CanvasModule } from "@/lib/canvas-modules";
import type { ModulePatternPlan, ModulePatternPlanItem, ModulePatternPlanTargetResult } from "@/lib/module-pattern-plan";
import type { CarryModulePatternApplyOutcome } from "@/app/actions/carry-module-pattern";
import {
  carryTemplateOptionsFrom,
  carryLiveSelectionRefusalReason,
  buildCarryReviewRows,
  describeCarryApplyOutcome,
  draftContainsPatternToken,
  initialCarryDraftText,
  isUniformlyBlockedRow,
  isCarryReviewVisible,
} from "./useCarryModulePattern";

// Pure-logic contract for useCarryModulePattern.ts (docs/carry-module-
// pattern-forward-acceptance-criteria.md, chunk D - agent 2E's slice: D14,
// D15, D16, D18, D19, D20, D21). vitest here is node-env and renders no
// component (this repo's own "vitest is node-env... no component is ever
// rendered" note - see useVisualizerCoverage.test.ts's identical posture),
// so this covers everything an executable test CAN reach without a
// renderer: the four pure helpers this hook's own React wiring calls. The
// hook's own useState/useMemo closures are verified by READING
// (bulkModulesSection.wiring.test.ts's own source-text assertions and
// CarryModulePatternReviewModal.wiring.test.ts), not by rendering.

function mod(id: number, name: string, itemTitles: string[] = []): CanvasModule {
  return {
    id,
    name,
    position: id,
    items: itemTitles.map((title, i) => ({
      id: i + 1,
      title,
      type: "Page",
      position: i + 1,
      indent: 0,
      published: true,
      pageUrl: null,
      contentId: null,
      dueAt: null,
      pointsPossible: null,
    })),
  } as unknown as CanvasModule;
}

describe("carryTemplateOptionsFrom (D14): options scoped to the SELECTED live modules only, sorted lowest-numbered first", () => {
  it("includes only modules whose id is in liveModuleIds, even when `modules` holds more", () => {
    const modules = [mod(1, "Module 1"), mod(2, "Module 2"), mod(3, "Module 3")];
    const options = carryTemplateOptionsFrom(modules, new Set([1, 3]));
    expect(options.map((o) => o.id)).toEqual([1, 3]);
  });

  it("sorts ascending by inferred week number, so options[0] is the D14 default (lowest-numbered selected module)", () => {
    const modules = [mod(10, "Week 5"), mod(11, "Week 2"), mod(12, "Week 9")];
    const options = carryTemplateOptionsFrom(modules, new Set([10, 11, 12]));
    expect(options.map((o) => o.id)).toEqual([11, 10, 12]);
  });

  // SABOTAGE-checkable: an unnumbered module must sort LAST, not first (a
  // naive `week ?? 0` comparator would put it first, ahead of every real
  // week number, which would make it the D14 default - the opposite of
  // "lowest-numbered").
  it("sorts a module with no recognizable number last, not first", () => {
    const modules = [mod(1, "Orientation"), mod(2, "Week 3")];
    const options = carryTemplateOptionsFrom(modules, new Set([1, 2]));
    expect(options.map((o) => o.id)).toEqual([2, 1]);
  });

  it("ties on week number break by ascending id", () => {
    const modules = [mod(5, "Week 1: Part B"), mod(4, "Week 1: Part A")];
    const options = carryTemplateOptionsFrom(modules, new Set([4, 5]));
    expect(options.map((o) => o.id)).toEqual([4, 5]);
  });
});

describe("carryLiveSelectionRefusalReason (D14/D20): the arm-time gate", () => {
  it("returns null (proceed) once at least two live modules are selected", () => {
    expect(carryLiveSelectionRefusalReason(2, 2)).toBeNull();
    expect(carryLiveSelectionRefusalReason(5, 5)).toBeNull();
  });

  // D14: "with exactly one module selected there are no targets and the
  // group refuses with that reason stated".
  it("names 'select one more module' when exactly one live module is selected and nothing else", () => {
    const reason = carryLiveSelectionRefusalReason(1, 1);
    expect(reason).not.toBeNull();
    expect(reason).toMatch(/one more module/i);
  });

  it("names 'select at least two' when nothing at all is selected", () => {
    const reason = carryLiveSelectionRefusalReason(0, 0);
    expect(reason).toMatch(/at least two/i);
  });

  // D20: the export/live mismatch - facts.moduleCount counts non-live keys
  // too, so the total can exceed the live count. SABOTAGE-checkable: if this
  // branch were removed, an instructor who selected two export-sourced
  // modules plus nothing live would get the generic "select at least two"
  // message instead of being told those two do not count.
  it("distinguishes 'mostly non-live' from 'just too few selected' when the total exceeds the live count", () => {
    const reason = carryLiveSelectionRefusalReason(3, 1);
    expect(reason).toMatch(/export- or repo-sourced/i);
    expect(reason).toMatch(/1 live module/);
  });
});

// ---------------------------------------------------------------------------
// buildCarryReviewRows (D18) fixtures - hand-built ModulePatternPlan shapes,
// mirroring carry-module-pattern.test.ts's own makePlanItem/makeTarget style
// rather than importing it (that file's helpers are local, not exported).

function planItem(overrides: Partial<ModulePatternPlanItem>): ModulePatternPlanItem {
  return {
    itemId: 1,
    itemType: "Assignment",
    sourceTitle: "Week 1 Homework",
    decision: "create",
    patternTemplate: "Week {n} Homework",
    resolvedTitle: "Week 3 Homework",
    dueAtIso: null,
    dueDateOutcome: null,
    matchedExistingId: null,
    blockedReasonCode: null,
    blockedMessage: null,
    notCarried: [],
    checkpointsUnknown: false,
    writeSupported: true,
    ...overrides,
  };
}

function target(targetModuleId: number, items: ModulePatternPlanItem[]): ModulePatternPlanTargetResult {
  return {
    targetModuleId,
    targetModuleName: `Module ${targetModuleId}`,
    targetWeek: targetModuleId,
    items,
    counts: { create: 0, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 },
  };
}

function plan(targets: ModulePatternPlanTargetResult[], excludedItems: ModulePatternPlan["excludedItems"] = []): ModulePatternPlan {
  const includedIds = Array.from(new Set(targets.flatMap((t) => t.items.map((i) => i.itemId))));
  const excludedIds = excludedItems.map((i) => i.itemId);
  return {
    sourceModuleId: 1,
    sourceModuleName: "Module 1",
    sourceWeek: 1,
    targets,
    totals: { create: 0, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 },
    excludedSourceTargetId: null,
    sourceReadFailures: [],
    excludedItems,
    sourceItemOrder: [...includedIds, ...excludedIds],
  };
}

describe("buildCarryReviewRows (D18): groups by SOURCE ITEM, not by target module", () => {
  it("one row per item id, with create/skip/blocked counted across every target", () => {
    const p = plan([
      target(10, [planItem({ itemId: 1, decision: "create", resolvedTitle: "Week 3 Homework" })]),
      target(11, [planItem({ itemId: 1, decision: "skip", resolvedTitle: "Week 4 Homework" })]),
    ]);
    const rows = buildCarryReviewRows(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].createCount).toBe(1);
    expect(rows[0].skipCount).toBe(1);
    expect(rows[0].blockedCount).toBe(0);
    expect(rows[0].targetCount).toBe(2);
    expect(rows[0].patternTemplate).toBe("Week {n} Homework");
    // Uses a resolved title from a NON-blocked target as the D3b example.
    expect(rows[0].exampleResolvedTitle).toMatch(/^Week [34] Homework$/);
  });

  // D3b/D4b: a false positive (or any other per-item block) is uniform
  // across targets - one message, not one per target.
  it("shows ONE uniform blocked message when every target blocks the item for the SAME item-level reason", () => {
    const p = plan([
      target(10, [planItem({ itemId: 2, decision: "blocked-unnumbered", patternTemplate: null, resolvedTitle: null, blockedReasonCode: "no-token-match", blockedMessage: "no digit run matches" })]),
      target(11, [planItem({ itemId: 2, decision: "blocked-unnumbered", patternTemplate: null, resolvedTitle: null, blockedReasonCode: "no-token-match", blockedMessage: "no digit run matches" })]),
    ]);
    const rows = buildCarryReviewRows(p);
    expect(rows[0].uniformBlockedMessage).toBe("no digit run matches");
    expect(rows[0].blockedCount).toBe(2);
  });

  // SABOTAGE TARGET: target-module-unnumbered is a property of the TARGET,
  // not the item, and an authored {n} pattern can never fix it (module-
  // pattern-plan.ts checks the target's own week independently of where the
  // pattern came from) - so it must NEVER produce a uniform blocked message,
  // even when every target happens to block for it. If this exclusion were
  // removed, the review modal would offer a doomed {n} override for a block
  // typing can never resolve.
  it("does NOT produce a uniform blocked message when every target blocks for 'target-module-unnumbered'", () => {
    const p = plan([
      target(10, [planItem({ itemId: 3, decision: "blocked-unnumbered", patternTemplate: null, resolvedTitle: null, blockedReasonCode: "target-module-unnumbered", blockedMessage: "target has no number" })]),
      target(11, [planItem({ itemId: 3, decision: "blocked-unnumbered", patternTemplate: null, resolvedTitle: null, blockedReasonCode: "target-module-unnumbered", blockedMessage: "target has no number" })]),
    ]);
    const rows = buildCarryReviewRows(p);
    expect(rows[0].uniformBlockedMessage).toBeNull();
    expect(rows[0].blockedCount).toBe(2);
  });

  it("a MIXED item (blocked in one target, resolved in another) is not treated as uniformly blocked", () => {
    const p = plan([
      target(10, [planItem({ itemId: 4, decision: "create", resolvedTitle: "Week 3 Lab" })]),
      target(11, [planItem({ itemId: 4, decision: "blocked-unnumbered", patternTemplate: null, resolvedTitle: null, blockedReasonCode: "target-module-unnumbered", blockedMessage: "target has no number" })]),
    ]);
    const rows = buildCarryReviewRows(p);
    expect(rows[0].uniformBlockedMessage).toBeNull();
    expect(rows[0].createCount).toBe(1);
    expect(rows[0].blockedCount).toBe(1);
    expect(rows[0].patternTemplate).not.toBeNull();
  });

  // C2: a "create" decision whose kind cannot be written must not inflate
  // createCount - it belongs in unsupportedCount instead, so the review
  // never over-promises what will actually be produced.
  it("splits a 'create' decision into createCount or unsupportedCount by writeSupported", () => {
    const p = plan([
      target(10, [planItem({ itemId: 5, decision: "create", writeSupported: false, resolvedTitle: "Syllabus Link 3" })]),
      target(11, [planItem({ itemId: 5, decision: "create", writeSupported: false, resolvedTitle: "Syllabus Link 4" })]),
    ]);
    const rows = buildCarryReviewRows(p);
    expect(rows[0].createCount).toBe(0);
    expect(rows[0].unsupportedCount).toBe(2);
    expect(rows[0].writeSupported).toBe(false);
  });
});

// C1: the exclude checkbox used to be a one-way trapdoor because an excluded
// item produced no row anywhere (module-pattern-plan.ts filtered it out of
// every target's item list before buildCarryReviewRows ever saw it) - so a
// row's own checkbox vanished the moment it was unchecked, with nothing left
// to click to bring it back. The fix moved exclusion to a separate
// `plan.excludedItems` roster; this pins that buildCarryReviewRows still
// renders exactly ONE row per source item either way, in source order.
describe("buildCarryReviewRows (C1): an excluded item still gets a row, so its checkbox survives", () => {
  it("renders an excluded item as a zero-count row with excluded: true, in source order", () => {
    const p = plan(
      [target(10, [planItem({ itemId: 1, decision: "create" })])],
      [{ itemId: 2, itemType: "Assignment", sourceTitle: "Chapter 12 Discussion" }]
    );
    const rows = buildCarryReviewRows(p);
    expect(rows.map((r) => r.itemId)).toEqual([1, 2]);
    const excludedRow = rows[1];
    expect(excludedRow.excluded).toBe(true);
    expect(excludedRow.sourceTitle).toBe("Chapter 12 Discussion");
    expect(excludedRow.createCount).toBe(0);
    expect(excludedRow.skipCount).toBe(0);
    expect(excludedRow.blockedCount).toBe(0);
    expect(excludedRow.unsupportedCount).toBe(0);
    expect(excludedRow.targetCount).toBe(0);
  });

  it("round-trips: re-including the item (removing it from excludedItems) replaces the row with a real one", () => {
    const excludedPlan = plan([], [{ itemId: 1, itemType: "Assignment", sourceTitle: "Lab 2" }]);
    const excludedRows = buildCarryReviewRows(excludedPlan);
    expect(excludedRows).toHaveLength(1);
    expect(excludedRows[0].excluded).toBe(true);

    const reincludedPlan = plan([target(10, [planItem({ itemId: 1, decision: "create", resolvedTitle: "Lab 5" })])]);
    const reincludedRows = buildCarryReviewRows(reincludedPlan);
    expect(reincludedRows).toHaveLength(1);
    expect(reincludedRows[0].excluded).toBe(false);
    expect(reincludedRows[0].createCount).toBe(1);
    expect(reincludedRows[0].exampleResolvedTitle).toBe("Lab 5");
  });
});

// F3: a checkpoint-refused item is already rendered, with its real reason
// and no interactive affordance, in the modal's own dedicated "Refused (not
// included)" list (checkpointRefusedItems, a separate prop entirely - see
// CarryModulePatternReviewModal.tsx). Before this fix, buildCarryReviewRows
// had no way to know which of plan.excludedItems were checkpoint refusals
// vs. genuine manual exclusions, so it built a generic "excluded" row for
// BOTH - producing a second listing whose checkbox could never do anything:
// a checkpoint-refused id is unconditionally folded back into excludedItemIds
// by useCarryModulePattern.ts regardless of manualExcluded, so unchecking it
// had no effect.
describe("buildCarryReviewRows (F3): a checkpoint-refused item gets no row here at all - it lives ONLY in the modal's dedicated Refused list", () => {
  it("omits a checkpoint-refused item from the collapsed rows entirely, while a genuinely manual exclusion still gets its round-tripping row", () => {
    const p = plan(
      [target(10, [planItem({ itemId: 1, decision: "create" })])],
      [
        { itemId: 2, itemType: "Discussion", sourceTitle: "Intro Discussion" }, // checkpoint-refused
        { itemId: 3, itemType: "Assignment", sourceTitle: "Chapter 12 Discussion" }, // manually excluded
      ]
    );

    const rows = buildCarryReviewRows(p, new Set([2]));

    expect(rows.map((r) => r.itemId)).toEqual([1, 3]);
    const manualRow = rows.find((r) => r.itemId === 3);
    expect(manualRow?.excluded).toBe(true);
  });

  // SABOTAGE TARGET: this is the exact bug report - without the
  // checkpointRefusedIds filter, the checkpoint-refused item (id 2) would
  // get a generic excluded row here too, duplicating the modal's own
  // dedicated Refused section and offering a checkbox with no effect.
  // Passing an empty Set (the old, unfiltered behavior) must restore the
  // duplicate so this test can actually fail.
  it("SABOTAGE: reverting to no filtering (empty checkpointRefusedIds) brings the duplicate row back", () => {
    const p = plan([], [{ itemId: 2, itemType: "Discussion", sourceTitle: "Intro Discussion" }]);
    const unfiltered = buildCarryReviewRows(p, new Set());
    expect(unfiltered.map((r) => r.itemId)).toEqual([2]); // the bug, reproduced on demand

    const filtered = buildCarryReviewRows(p, new Set([2]));
    expect(filtered).toHaveLength(0); // the fix
  });
});

// C9: the modal used to inline these two decisions directly as JSX boolean
// expressions, and its wiring test pinned the LITERAL source text
// (`useState(authoredText ?? row.sourceTitle)`, `disabled={!draft.includes
// ("{n}")}`) - this repo's own recorded "source-text tests over-specify"
// failure, since a harmless rename or ternary inversion would redden those
// assertions with no behavior change. Both decisions are now pure exported
// predicates; these tests pin the FACT each one decides, so
// CarryModulePatternReviewModal.wiring.test.ts only has to pin that the
// call site invokes them.
describe("draftContainsPatternToken / initialCarryDraftText / isUniformlyBlockedRow (C9)", () => {
  it("draftContainsPatternToken is true iff the literal {n} token is present", () => {
    expect(draftContainsPatternToken("Week {n} Reflection")).toBe(true);
    expect(draftContainsPatternToken("Final Project")).toBe(false);
    expect(draftContainsPatternToken("{n}")).toBe(true);
    expect(draftContainsPatternToken("")).toBe(false);
  });

  it("initialCarryDraftText prefers authoredText, falling back to sourceTitle only when undefined", () => {
    expect(initialCarryDraftText("Week {n} Reflection", "Final Project")).toBe("Week {n} Reflection");
    expect(initialCarryDraftText(undefined, "Final Project")).toBe("Final Project");
    // An empty-string authored draft is still a real (if invalid) authored
    // value - it must NOT fall back to sourceTitle, only `undefined` does.
    expect(initialCarryDraftText("", "Final Project")).toBe("");
  });

  it("isUniformlyBlockedRow is true iff uniformBlockedMessage is non-null", () => {
    expect(isUniformlyBlockedRow({ uniformBlockedMessage: "no digit run matches" })).toBe(true);
    expect(isUniformlyBlockedRow({ uniformBlockedMessage: null })).toBe(false);
  });
});

// C8: a selection change mid-fetch reseeds `sourceModuleId` (D15), which
// changes `templateSig` and can null out `template`/`plan` while `reviewOpen`
// is still true from the click that started the fetch. Without this
// predicate, ModulesView.tsx's bulk-bar fact (`carryReviewOpen`) and
// ModulesViewSecondaryModals.tsx's modal mount gate can each independently
// decide "is this visible" and drift apart - which is exactly the defect
// this predicate exists to make unrepresentable, by giving both call sites
// exactly one boolean to read instead of two hand-written expressions.
describe("isCarryReviewVisible (C8): the one fact both the bulk bar's consequence tier and the modal's mount must read", () => {
  it("is false while reviewOpen is true but template/plan have not resolved yet - the exact C8 race", () => {
    expect(isCarryReviewVisible(true, null, null)).toBe(false);
    expect(isCarryReviewVisible(true, {}, null)).toBe(false);
    expect(isCarryReviewVisible(true, null, {})).toBe(false);
  });

  it("is false once reviewOpen is false, even with a fully resolved template and plan", () => {
    expect(isCarryReviewVisible(false, {}, {})).toBe(false);
  });

  it("is true only once all three are satisfied", () => {
    expect(isCarryReviewVisible(true, {}, {})).toBe(true);
  });

  // SABOTAGE TARGET: this is precisely the regression C8 reports - if this
  // predicate ever degrades back to "return reviewOpen" alone (dropping the
  // template/plan checks), this case flips from false to true and the bulk
  // bar's `carryPattern` group pins open at its destructive tier with no
  // reachable control to dismiss it, since the modal that offers
  // `closeReview` can no longer mount.
  it("does not degrade to reviewOpen alone", () => {
    expect(isCarryReviewVisible(true, null, null)).toBe(false);
  });
});

describe("describeCarryApplyOutcome (AC6): every outcome status is counted and named distinctly", () => {
  const base = { targetModuleId: 10, targetModuleName: "Module 10", itemId: 1, itemType: "Assignment" } as const;

  it("reports a clean run as success", () => {
    const outcomes: CarryModulePatternApplyOutcome[] = [
      { ...base, status: "success", resolvedTitle: "Week 3 Homework" },
      { ...base, itemId: 2, status: "skipped" },
    ];
    const result = describeCarryApplyOutcome(outcomes);
    expect(result.kind).toBe("success");
    expect(result.text).toMatch(/1 item created/);
    expect(result.text).toMatch(/1 already present/);
  });

  // SABOTAGE TARGET: a write-failed or generation-failed row must flip the
  // whole summary to "error" - if this check were dropped, a partially
  // failed apply would be reported as a plain success.
  it("reports kind 'error' when at least one row failed to write or generate", () => {
    const outcomes: CarryModulePatternApplyOutcome[] = [
      { ...base, status: "success", resolvedTitle: "Week 3 Homework" },
      { ...base, itemId: 2, status: "write-failed", reason: "Canvas rejected this item." },
    ];
    const result = describeCarryApplyOutcome(outcomes);
    expect(result.kind).toBe("error");
    expect(result.text).toMatch(/1 failed to write to Canvas/);
  });

  it("names a checkpoint refusal distinctly from a plain block", () => {
    const outcomes: CarryModulePatternApplyOutcome[] = [
      { ...base, status: "refused-checkpoint-unknown", reason: "checkpoint structure unreadable" },
      { ...base, itemId: 2, status: "blocked", reason: "no number found" },
    ];
    const result = describeCarryApplyOutcome(outcomes);
    expect(result.text).toMatch(/discussion\(s\) refused/);
    expect(result.text).toMatch(/1 blocked/);
    // Neither a disclosed refusal nor a disclosed block is a FAILURE.
    expect(result.kind).toBe("success");
  });

  it("appends the orphan clause (reusing describeOrphans) and marks the run as error", () => {
    const outcomes: CarryModulePatternApplyOutcome[] = [{ ...base, status: "orphaned", kind: "Quiz", title: "Week 3 Quiz", contentId: 42 }];
    const result = describeCarryApplyOutcome(outcomes);
    expect(result.kind).toBe("error");
    expect(result.text).toMatch(/created but not linked/);
    expect(result.text).toMatch(/Week 3 Quiz/);
  });

  it("names an overwrite-not-implemented row distinctly, per the coordinator's correction that no overwrite path exists", () => {
    const outcomes: CarryModulePatternApplyOutcome[] = [{ ...base, status: "overwrite-not-implemented", reason: "not supported" }];
    const result = describeCarryApplyOutcome(outcomes);
    expect(result.text).toMatch(/need overwrite, which is not implemented/);
  });

  // F2: names the refused-external-tool status, with a reason (Canvas needs a
  // launch URL this app cannot read back, so carrying it as a plain
  // assignment would silently change what students are asked to do), never
  // silently folding it into "N items created" with the refused item simply
  // missing.
  it("names a refused-external-tool row with its reason, never silently dropping it from the count", () => {
    const outcomes: CarryModulePatternApplyOutcome[] = [
      { ...base, status: "refused-external-tool", reason: "Canvas requires an external-tool launch URL this app cannot read back." },
    ];
    const result = describeCarryApplyOutcome(outcomes);
    expect(result.text).toMatch(/external-tool/i);
    expect(result.text).toMatch(/refused/i);
  });
});

// F2: make the class of bug impossible - fails if applyModulePatternCarryAction
// (src/app/actions/carry-module-pattern.ts) can ever return a status
// describeCarryApplyOutcome does not render. Derives the expected status set
// from the ACTION'S OWN union type declaration rather than hand-listing it
// here a second time, so a status added there without a matching line here
// (this exact defect - "refused-external-tool" was added by a sibling
// working in a different file, and the summarizer silently fell one behind)
// cannot pass silently again. Uses the same read-the-source-text idiom this
// repo's recording-files.kinds.test.ts already establishes for "a union
// declared in one file must stay in step with logic in another".
describe("describeCarryApplyOutcome (F2): renders every status CarryModulePatternApplyOutcome can produce", () => {
  const ACTION_PATH = path.resolve(process.cwd(), "src/app/actions/carry-module-pattern.ts");

  function outcomeStatusesFromSource(): string[] {
    const src = fs.readFileSync(ACTION_PATH, "utf-8");
    const start = src.indexOf("export type CarryModulePatternApplyOutcome");
    if (start === -1) {
      throw new Error("CarryModulePatternApplyOutcome's declaration was not found - has it moved or been renamed?");
    }
    // The union is a sequence of `| { ... status: "x" ... }` members and ends
    // at its own top-level `;`. Find that by BRACE DEPTH, not by the first
    // `;\n` in the text: several members span multiple lines and contain their
    // own `;`, so a naive scan stops INSIDE a member and silently derives a
    // short set. That is not hypothetical - the first cut of this guard ended
    // at `src.indexOf(";\n", start)`, landed inside the multi-line `orphaned`
    // member, and covered only the eight single-line statuses. `orphaned` and
    // `success` were invisible to it, and so was any new member appended at
    // the union's natural end - which is the one place a tenth status would
    // actually be added, so the guard protected 0% of the position it existed
    // to protect while reporting green.
    let depth = 0;
    let end = -1;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (ch === ";" && depth === 0) {
        end = i;
        break;
      }
    }
    const block = src.slice(start, end === -1 ? undefined : end);
    const statuses = Array.from(new Set([...block.matchAll(/status:\s*"([a-z-]+)"/g)].map((m) => m[1])));
    if (statuses.length === 0) {
      throw new Error("parsed zero statuses out of CarryModulePatternApplyOutcome - the regex or the union's shape has changed");
    }
    // Canary for the truncation above, in the direction that actually failed:
    // both of these live in multi-line members, `success` being the LAST one,
    // so their presence is what proves the block reached the union's end
    // rather than stopping somewhere plausible in the middle.
    for (const mustSee of ["orphaned", "success"]) {
      if (!statuses.includes(mustSee)) {
        throw new Error(
          `the extracted union block is truncated - it does not contain "${mustSee}", so this guard is checking only part of the union`,
        );
      }
    }
    return statuses;
  }

  function minimalOutcomeFor(status: string): CarryModulePatternApplyOutcome {
    const shared = { targetModuleId: 1, targetModuleName: "Target", itemId: 1, itemType: "Assignment" } as const;
    if (status === "orphaned") return { ...shared, status, kind: "Assignment", title: "X" } as CarryModulePatternApplyOutcome;
    if (status === "success") return { ...shared, status, resolvedTitle: "X" } as CarryModulePatternApplyOutcome;
    if (status === "skipped") return { ...shared, status } as CarryModulePatternApplyOutcome;
    return { ...shared, status, reason: "because" } as CarryModulePatternApplyOutcome;
  }

  it("every status parsed from the action's own union type changes the summary text vs. an empty run", () => {
    const statuses = outcomeStatusesFromSource();
    const baseline = describeCarryApplyOutcome([]).text;
    for (const status of statuses) {
      const text = describeCarryApplyOutcome([minimalOutcomeFor(status)]).text;
      expect(text, `describeCarryApplyOutcome renders status "${status}" identically to zero outcomes - it is not named at all`).not.toBe(baseline);
    }
  });
});

// Coordinator correction (mid-flight, from the sibling who finished
// carry-module-pattern.ts): applyModulePatternCarryAction's write paths only
// CREATE - a matched-item "overwrite" decision resolves to the outcome
// "overwrite-not-implemented", never an actual overwrite. This hook must
// therefore always pass onExisting: "skip" to buildModulePatternPlan and
// never expose a toggle for it - a canary against someone later wiring an
// overwrite control in the UI without first implementing the write path.
describe("D3b/coordinator correction: onExisting is hardcoded to \"skip\", never offered as a choice", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "useCarryModulePattern.ts"), "utf-8");

  it("passes onExisting: \"skip\" to buildModulePatternPlan", () => {
    expect(source).toMatch(/onExisting:\s*"skip"/);
  });

  // SABOTAGE-checkable: change the literal above to a variable/prop and this
  // goes red, since a value that can vary is exactly what this guard exists
  // to catch before the write path silently ships a dead "Overwrite" option.
  it("never passes the literal \"overwrite\" as onExisting's value", () => {
    expect(source).not.toMatch(/onExisting:\s*"overwrite"/);
  });
});
