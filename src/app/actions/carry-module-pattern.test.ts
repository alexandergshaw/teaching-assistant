import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// Chunk D of the Modules-view backlog (docs/carry-module-pattern-forward-
// acceptance-criteria.md) - agent 2C's slice: AC6, AC7, D7, D8, D9, D10, D13.
// Every server-side dependency is mocked, so the fan-out/join/write-routing
// logic in carry-module-pattern.ts runs for real without a Supabase session,
// a model call, or a live Canvas write.
vi.mock("@/lib/supabase/auth", () => ({
  requireOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));

vi.mock("./lms-generation-course-row", () => ({
  resolveGenerationCourseRow: vi.fn(),
}));

vi.mock("@/lib/llm", () => ({
  callLlm: vi.fn(),
}));

vi.mock("./canvas-modules", () => ({
  createCourseAssignmentAction: vi.fn(),
}));

vi.mock("./canvas-files-bulk", () => ({
  bulkAssociateRubricAction: vi.fn(),
}));

vi.mock("../components/content-tab/modules/moduleContentActions", () => ({
  addContentToModuleDetailed: vi.fn(),
}));

import { requireOwner } from "@/lib/supabase/auth";
import { resolveGenerationCourseRow } from "./lms-generation-course-row";
import { callLlm } from "@/lib/llm";
import { createCourseAssignmentAction } from "./canvas-modules";
import { bulkAssociateRubricAction } from "./canvas-files-bulk";
import { addContentToModuleDetailed } from "../components/content-tab/modules/moduleContentActions";
import {
  applyModulePatternCarryAction,
  generateCarryModulePatternBody,
  type CarryModulePatternBodyContext,
} from "./carry-module-pattern";
import type { ModuleTemplate, TemplateItem } from "./module-template";
import type { ModulePatternPlan, ModulePatternPlanItem, ModulePatternPlanTargetResult } from "@/lib/module-pattern-plan";

const baseCourse = {
  id: "course-1",
  name: "Intro to Testing",
  courseCode: "CS 101",
  institution: "State U",
  startDate: "2026-01-05",
  description: "A testing course.",
  topicOutline: "Loops, Recursion",
  courseKind: "coding",
  assignmentDueRule: "sun|23:59",
};

function makeTemplateItem(overrides: Partial<TemplateItem>): TemplateItem {
  return {
    id: 1,
    title: "Source Item",
    type: "Assignment",
    position: 1,
    indent: 0,
    published: true,
    pageUrl: null,
    contentId: 100,
    dueAt: null,
    pointsPossible: 10,
    description: "Source body about loops.",
    submissionTypes: ["online_text_entry"],
    notCarried: [],
    checkpointsUnknown: false,
    ...overrides,
  };
}

function makePlanItem(overrides: Partial<ModulePatternPlanItem>): ModulePatternPlanItem {
  return {
    itemId: 1,
    itemType: "Assignment",
    sourceTitle: "Week 1 Homework",
    decision: "create",
    resolvedTitle: "Week 3 Homework",
    dueAtIso: null,
    dueDateOutcome: null,
    matchedExistingId: null,
    blockedReasonCode: null,
    blockedMessage: null,
    patternTemplate: null,
    notCarried: [],
    checkpointsUnknown: false,
    // isCarryWriteSupportedKind's own concern (C2, module-pattern-plan.ts) -
    // this file's apply step re-derives the same answer itself rather than
    // trusting the plan's precomputed field (see the import of
    // isCarryWriteSupportedKind above), so a default of `true` here is inert
    // for every existing test; only the dedicated
    // isCarryWriteSupportedKind-parity tests below override the item's own
    // `type`/`contentId` to exercise the real decision.
    writeSupported: true,
    ...overrides,
  };
}

function makeTarget(targetModuleId: number, items: ModulePatternPlanItem[]): ModulePatternPlanTargetResult {
  return {
    targetModuleId,
    targetModuleName: `Module ${targetModuleId}`,
    targetWeek: targetModuleId,
    items,
    counts: { create: 0, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 },
  };
}

function makePlan(source: ModuleTemplate, targets: ModulePatternPlanTargetResult[]): ModulePatternPlan {
  return {
    sourceModuleId: source.moduleId,
    sourceModuleName: source.moduleName,
    targets,
    totals: { create: 0, skip: 0, overwrite: 0, blocked: 0, unsupported: 0 },
    excludedSourceTargetId: null,
    sourceReadFailures: [],
    // Not read by this file's implementation at all (D18's addition, wave 1) -
    // a fixed value is fine since carry-module-pattern.ts never inspects it.
    sourceWeek: null,
    // Neither field is read by this file's implementation (C1, wave 1's
    // exclude-checkbox roster - carry-module-pattern.ts only ever consumes
    // `targets[].items`) - fixed empty values are fine for the same reason
    // `sourceWeek: null` above is.
    excludedItems: [],
    sourceItemOrder: source.items.map((it) => it.id),
  };
}

function makeTemplate(items: TemplateItem[]): ModuleTemplate {
  return { moduleId: 1, moduleName: "Module 1", items, failures: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireOwner).mockResolvedValue({ id: "owner-1", email: "owner@example.com" });
  vi.mocked(resolveGenerationCourseRow).mockResolvedValue({ course: baseCourse } as never);
  vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "Generated body text." } as never);
  vi.mocked(createCourseAssignmentAction).mockResolvedValue({ id: 999, name: "x", htmlUrl: "", addedToModule: true } as never);
  vi.mocked(bulkAssociateRubricAction).mockResolvedValue({ updated: [], failures: [] } as never);
  vi.mocked(addContentToModuleDetailed).mockResolvedValue({ status: "success" } as never);
});

describe("applyModulePatternCarryAction - call-count discipline (AC7)", () => {
  it("calls requireOwner and resolveGenerationCourseRow exactly once for three targets", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1 })]);
    const targets = [
      makeTarget(10, [makePlanItem({ itemId: 1 })]),
      makeTarget(11, [makePlanItem({ itemId: 1 })]),
      makeTarget(12, [makePlanItem({ itemId: 1 })]),
    ];
    const plan = makePlan(source, targets);

    await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);

    expect(requireOwner).toHaveBeenCalledTimes(1);
    expect(resolveGenerationCourseRow).toHaveBeenCalledTimes(1);
    // Sabotage: change this to toBe(1) and it goes red - one Assignment
    // "create" row per target, three targets, one LLM call each (AC7).
    expect(callLlm).toHaveBeenCalledTimes(3);
  });

  // AC7: a rejected generation call for one row must not abort its siblings,
  // and each keeps its own outcome. Sabotage: change the middle target's
  // expected status to "success" and this goes red because the
  // implementation correctly reports it as "generation-failed".
  it("keeps every sibling outcome intact when one target's generation call rejects", async () => {
    vi.mocked(callLlm)
      .mockResolvedValueOnce({ ok: true, text: "body for target 10" } as never)
      .mockRejectedValueOnce(new Error("model timed out"))
      .mockResolvedValueOnce({ ok: true, text: "body for target 12" } as never);

    const source = makeTemplate([makeTemplateItem({ id: 1 })]);
    const targets = [
      makeTarget(10, [makePlanItem({ itemId: 1 })]),
      makeTarget(11, [makePlanItem({ itemId: 1 })]),
      makeTarget(12, [makePlanItem({ itemId: 1 })]),
    ];
    const plan = makePlan(source, targets);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("success");
    expect(result.outcomes[1]).toMatchObject({ status: "generation-failed", reason: "model timed out" });
    expect(result.outcomes[2].status).toBe("success");
    // The failed generation must never reach the write phase for that row.
    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(2);
  });

  it("never attempts a Canvas write for a row whose generation failed (two phases, never interleaved)", async () => {
    vi.mocked(callLlm).mockResolvedValueOnce({ ok: false, status: 500, body: "boom" } as never);
    const source = makeTemplate([makeTemplateItem({ id: 1 })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1 })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("generation-failed");
    expect(createCourseAssignmentAction).not.toHaveBeenCalled();
    expect(addContentToModuleDetailed).not.toHaveBeenCalled();
  });

  it("returns a top-level { error }, with no LLM call made, when the course row cannot resolve", async () => {
    vi.mocked(resolveGenerationCourseRow).mockResolvedValue({ error: "No saved course is linked." });
    const source = makeTemplate([makeTemplateItem({ id: 1 })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1 })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);

    expect(result).toEqual({ error: "No saved course is linked." });
    expect(callLlm).not.toHaveBeenCalled();
  });

  it("never throws - a rejected course-row resolve is caught and reported as { error }", async () => {
    vi.mocked(resolveGenerationCourseRow).mockRejectedValue(new Error("supabase unavailable"));
    const source = makeTemplate([makeTemplateItem({ id: 1 })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1 })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);

    expect(result).toEqual({ error: "supabase unavailable" });
  });
});

describe("applyModulePatternCarryAction - AC8: the title always comes from the plan", () => {
  // Sabotage-checkable: if the implementation ever used the generated body
  // (or anything model-authored) as the assignment's `name`, this would
  // fail, since the mocked LLM text ("Generated body text.") never equals
  // the plan's resolvedTitle ("Week 3 Homework").
  it("passes the plan's resolvedTitle, never the generated body, as the Canvas title", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Assignment" })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, resolvedTitle: "Week 3 Homework" })])]);

    await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);

    expect(createCourseAssignmentAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "Week 3 Homework", description: "Generated body text." }),
      10,
      undefined,
      expect.objectContaining({ position: 1, indent: 0 })
    );
  });

  it("generateCarryModulePatternBody's result never carries a title field", async () => {
    vi.mocked(callLlm).mockResolvedValue({ ok: true, text: "some generated prose" } as never);
    const ctx: CarryModulePatternBodyContext = {
      courseName: "C",
      courseCode: null,
      institution: null,
      courseDescription: null,
      topicOutline: null,
      targetModuleName: "Module 3",
      itemType: "Page",
      resolvedTitle: "Week 3 Reading",
      sourceTitle: "Week 1 Reading",
      sourceDescription: null,
    };
    const result = await generateCarryModulePatternBody(ctx);
    expect(result).toEqual({ body: "some generated prose" });
    expect(result).not.toHaveProperty("title");
  });
});

describe("applyModulePatternCarryAction - D7: the write path differs by kind", () => {
  it("uses createCourseAssignmentAction (not addContentToModuleDetailed) for an Assignment", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Assignment", pointsPossible: 25, submissionTypes: ["online_upload"] })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Assignment" })])]);

    await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);

    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(1);
    expect(createCourseAssignmentAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ pointsPossible: 25, submissionType: "online_upload" }),
      10,
      undefined,
      expect.objectContaining({ position: 1, indent: 0 })
    );
    expect(addContentToModuleDetailed).not.toHaveBeenCalled();
  });

  it("uses addContentToModuleDetailed (not createCourseAssignmentAction) for a Quiz", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Quiz", checkpointsUnknown: false })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Quiz" })])]);

    await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);

    expect(addContentToModuleDetailed).toHaveBeenCalledTimes(1);
    expect(addContentToModuleDetailed).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      "Quiz",
      10,
      expect.any(String),
      expect.objectContaining({ description: "Generated body text." })
    );
    expect(createCourseAssignmentAction).not.toHaveBeenCalled();
  });

  it("uses addContentToModuleDetailed for a Page, with position and indent threaded through (D10)", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Page", position: 4, indent: 2, pointsPossible: null, submissionTypes: [] })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Page" })])]);

    await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);

    expect(addContentToModuleDetailed).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      "Page",
      10,
      expect.any(String),
      expect.objectContaining({ position: 4, indent: 2 })
    );
  });
});

describe("applyModulePatternCarryAction - C3: Assignment position/indent are threaded (step-10 fixer round)", () => {
  // Sabotage-checkable: drop the 5th `moduleItemPlacement` argument from
  // applyAssignment's createCourseAssignmentAction call and this goes red -
  // the mock would still be called, but without the position/indent object,
  // so toHaveBeenCalledWith's exact-args check fails.
  it("threads a non-default position/indent from the source item into createCourseAssignmentAction's placement argument", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Assignment", position: 7, indent: 3 })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Assignment" })])]);

    await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);

    expect(createCourseAssignmentAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      10,
      undefined,
      { position: 7, indent: 3 }
    );
  });
});

describe("applyModulePatternCarryAction - C5: an orphaned Assignment (created, link failed) is reported honestly", () => {
  // Sabotage-checkable: remove the `created.linkError !== undefined` branch
  // from applyAssignment and this goes red - the outcome falls through to
  // plain "success" instead (the mocked `created` has no `error` key), even
  // though the module link never actually happened.
  it("reports 'orphaned' with the real Canvas id, never 'write-failed' or 'success', when the module link fails after a successful create", async () => {
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 777,
      name: "Week 3 Homework",
      htmlUrl: "https://canvas.example.com/courses/1/assignments/777",
      addedToModule: false,
      linkError: "Module link rejected.",
    } as never);
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Assignment" })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Assignment", resolvedTitle: "Week 3 Homework" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0]).toMatchObject({
      status: "orphaned",
      kind: "Assignment",
      title: "Week 3 Homework",
      contentId: 777,
    });
    // A link failure is not grounds to also attempt a rubric association -
    // no further Canvas writes are piled on top of the partial failure.
    expect(bulkAssociateRubricAction).not.toHaveBeenCalled();
  });

  it("a successful link (no linkError field at all) still reports plain success, not orphaned", async () => {
    vi.mocked(createCourseAssignmentAction).mockResolvedValue({
      id: 888,
      name: "Week 3 Homework",
      htmlUrl: "",
      addedToModule: true,
    } as never);
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Assignment" })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Assignment" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("success");
  });
});

describe("applyModulePatternCarryAction - S1: an external_tool submission type is refused, not mis-sent", () => {
  // Sabotage-checkable: remove the refused-external-tool pre-check and this
  // goes red - the row would instead reach applyAssignment, which would call
  // the (mocked) createCourseAssignmentAction and report "success", plus an
  // unwanted LLM call for a row that should never spend one.
  it("refuses an Assignment whose first submission type is external_tool, before any LLM call or Canvas write", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Assignment", submissionTypes: ["external_tool"] })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Assignment" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("refused-external-tool");
    expect(callLlm).not.toHaveBeenCalled();
    expect(createCourseAssignmentAction).not.toHaveBeenCalled();
  });

  // Sabotage-checkable inverse: a refusal keyed on "external_tool appears
  // ANYWHERE in submissionTypes" rather than "is the first (sent) type"
  // would wrongly refuse this row too.
  it("still carries an Assignment where external_tool is only a SECONDARY submission type (only the first is ever sent)", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Assignment", submissionTypes: ["online_text_entry", "external_tool"] })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Assignment" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("success");
    expect(createCourseAssignmentAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ submissionType: "online_text_entry" }),
      10,
      undefined,
      expect.anything()
    );
  });
});

describe("applyModulePatternCarryAction - unsupported-kind set matches module-pattern-plan.ts's isCarryWriteSupportedKind", () => {
  // carry-module-pattern.ts imports `isCarryWriteSupportedKind` from
  // module-pattern-plan.ts (a sibling fixer's export, landed during this
  // same round) rather than re-spelling the unsupported set, so the plan's
  // own review and this apply step cannot silently disagree about which
  // kinds can be written. These tests exercise the real imported predicate
  // through the actual code path (not a re-stated constant), pinning
  // ExternalUrl / ExternalTool / File-with-no-contentId as unsupported and
  // every other known kind as supported.
  it.each(["ExternalUrl", "ExternalTool"])(
    "%s is unsupported, with no LLM call",
    async (kind) => {
      const source = makeTemplate([makeTemplateItem({ id: 1, type: kind })]);
      const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: kind })])]);

      const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
      if (!("outcomes" in result)) throw new Error("expected outcomes");

      expect(result.outcomes[0].status).toBe("unsupported-kind");
      expect(callLlm).not.toHaveBeenCalled();
    }
  );

  it("File with no contentId is unsupported (the third member of the set)", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "File", contentId: null })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "File" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("unsupported-kind");
  });

  const otherKinds: Array<[string, Partial<TemplateItem>]> = [
    ["Page", {}],
    ["Assignment", {}],
    ["Quiz", {}],
    ["Discussion", { checkpointsUnknown: false }],
    ["SubHeader", {}],
    ["File", { contentId: 999 }],
  ];
  it.each(otherKinds)("%s is NOT in the unsupported set", async (type, overrides) => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type, ...overrides })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: type })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).not.toBe("unsupported-kind");
  });
});

describe("applyModulePatternCarryAction - D9: a checkpointed discussion is refused, not silently carried", () => {
  it("refuses a Discussion whose checkpoint status is unknown, with no LLM call and no write", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Discussion", checkpointsUnknown: true })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Discussion" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("refused-checkpoint-unknown");
    expect(callLlm).not.toHaveBeenCalled();
    expect(addContentToModuleDetailed).not.toHaveBeenCalled();
  });

  // Sabotage-checkable inverse: a Discussion the reader COULD rule out
  // (checkpointsUnknown: false) must carry normally. If the refusal check
  // were sloppily keyed on `type === "Discussion"` alone, this would fail.
  it("carries a Discussion normally when checkpointsUnknown is false", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Discussion", checkpointsUnknown: false })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Discussion" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("success");
    expect(addContentToModuleDetailed).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      "Discussion",
      10,
      expect.any(String),
      expect.anything()
    );
  });
});

describe("applyModulePatternCarryAction - AC6: per-object failure is per-object", () => {
  it("reports skip/blocked/overwrite/create outcomes distinctly in one plan, none silently dropped", async () => {
    const source = makeTemplate([
      makeTemplateItem({ id: 1, type: "Assignment" }),
      makeTemplateItem({ id: 2, type: "Assignment" }),
      makeTemplateItem({ id: 3, type: "Assignment" }),
      makeTemplateItem({ id: 4, type: "Assignment" }),
    ]);
    const items = [
      makePlanItem({ itemId: 1, decision: "skip" }),
      makePlanItem({ itemId: 2, decision: "blocked-unnumbered", resolvedTitle: null, blockedMessage: "no number found" }),
      makePlanItem({ itemId: 3, decision: "overwrite", matchedExistingId: 555 }),
      makePlanItem({ itemId: 4, decision: "create" }),
    ];
    const plan = makePlan(source, [makeTarget(10, items)]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes).toHaveLength(4);
    expect(result.outcomes[0]).toEqual({ targetModuleId: 10, targetModuleName: "Module 10", itemId: 1, itemType: "Assignment", status: "skipped" });
    expect(result.outcomes[1]).toMatchObject({ itemId: 2, status: "blocked", reason: "no number found" });
    expect(result.outcomes[2]).toMatchObject({ itemId: 3, status: "overwrite-not-implemented" });
    expect(result.outcomes[3]).toMatchObject({ itemId: 4, status: "success" });
    // Only the one "create" row should have generated or written anything.
    expect(callLlm).toHaveBeenCalledTimes(1);
    expect(createCourseAssignmentAction).toHaveBeenCalledTimes(1);
  });

  it("maps an orphaned write to a distinct 'orphaned' outcome, distinguishable from write-failed", async () => {
    vi.mocked(addContentToModuleDetailed).mockResolvedValue({ status: "orphaned", kind: "Quiz", title: "Week 3 Quiz", contentId: 42 } as never);
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Quiz" })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Quiz", resolvedTitle: "Week 3 Quiz" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0]).toMatchObject({ status: "orphaned", kind: "Quiz", title: "Week 3 Quiz", contentId: 42 });
  });

  it("maps a plain Canvas rejection to 'write-failed', distinguishable from 'generation-failed'", async () => {
    vi.mocked(addContentToModuleDetailed).mockResolvedValue({ status: "failed" } as never);
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Page" })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Page" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("write-failed");
  });

  it("refuses an item kind with no wired write path (e.g. ExternalUrl) without calling the LLM or Canvas", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "ExternalUrl", description: null })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "ExternalUrl" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("unsupported-kind");
    expect(callLlm).not.toHaveBeenCalled();
    expect(addContentToModuleDetailed).not.toHaveBeenCalled();
  });

  it("carries a SubHeader with no LLM call (it has no body) and a File by linking the same contentId", async () => {
    const source = makeTemplate([
      makeTemplateItem({ id: 1, type: "SubHeader", description: null }),
      makeTemplateItem({ id: 2, type: "File", contentId: 777, description: null }),
    ]);
    const plan = makePlan(source, [
      makeTarget(10, [makePlanItem({ itemId: 1, itemType: "SubHeader" }), makePlanItem({ itemId: 2, itemType: "File" })]),
    ]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(callLlm).not.toHaveBeenCalled();
    expect(result.outcomes[0].status).toBe("success");
    expect(result.outcomes[1].status).toBe("success");
    expect(addContentToModuleDetailed).toHaveBeenCalledWith(expect.anything(), undefined, "File", 10, expect.any(String), expect.objectContaining({ fileId: 777 }));
  });

  it("refuses a File with no known source contentId rather than guessing", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "File", contentId: null, description: null })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "File" })])]);

    const result = await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);
    if (!("outcomes" in result)) throw new Error("expected outcomes");

    expect(result.outcomes[0].status).toBe("unsupported-kind");
    expect(addContentToModuleDetailed).not.toHaveBeenCalled();
  });
});

describe("applyModulePatternCarryAction - rubric association (AC3, via D7's richer path)", () => {
  it("associates a carried rubric after a successful Assignment create", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Assignment", rubricId: 88 })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Assignment" })])]);

    vi.mocked(createCourseAssignmentAction).mockResolvedValue({ id: 555, name: "x", htmlUrl: "", addedToModule: true } as never);

    await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);

    expect(bulkAssociateRubricAction).toHaveBeenCalledWith(expect.anything(), 88, ["555"], undefined);
  });

  it("does not associate a rubric when the source item had none", async () => {
    const source = makeTemplate([makeTemplateItem({ id: 1, type: "Assignment", rubricId: undefined })]);
    const plan = makePlan(source, [makeTarget(10, [makePlanItem({ itemId: 1, itemType: "Assignment" })])]);

    await applyModulePatternCarryAction("https://canvas.example.com/courses/1", source, plan);

    expect(bulkAssociateRubricAction).not.toHaveBeenCalled();
  });
});

// D5's structural guard, sabotage-checkable independent of any mock: this
// file must be STRUCTURALLY INCAPABLE of computing a deadline. Mirrors
// current-events-assignments.test.ts's own D4 guard, byte-for-byte in
// technique - see that file's comment for the full rationale.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("D5 structural guard: this file cannot compute a deadline", () => {
  const rawSourceText = fs.readFileSync(path.resolve(__dirname, "carry-module-pattern.ts"), "utf-8");
  const codeOnly = stripComments(rawSourceText);

  it("contains no .toISOString( call in code", () => {
    expect(codeOnly).not.toMatch(/\.toISOString\(/);
  });

  it("does not import the assignment-due-rule module in code", () => {
    expect(codeOnly).not.toMatch(/from\s+["'][^"']*assignment-due-rule["']/);
  });

  it("does not import the module-pattern-transpose module in code", () => {
    expect(codeOnly).not.toMatch(/from\s+["'][^"']*module-pattern-transpose["']/);
  });

  // Canary in the OTHER direction: the guard's own rationale comments DO
  // mention all three forbidden strings in prose - if this ever fails,
  // either the comments were removed (fine) or stripComments stopped
  // stripping comments (a real regression in the guard itself, which would
  // let a genuine violation slip through unnoticed).
  it("canary: the raw (unstripped) source does mention the forbidden strings in its own comments", () => {
    expect(rawSourceText).toMatch(/\.toISOString\(/);
    expect(rawSourceText).toMatch(/assignment-due-rule/);
    expect(rawSourceText).toMatch(/module-pattern-transpose/);
  });

  // Canary: proves the scan above is reading real, substantial source text,
  // not silently matching an empty or truncated string.
  it("read more than 500 characters of real source", () => {
    expect(rawSourceText.length).toBeGreaterThan(500);
  });
});
