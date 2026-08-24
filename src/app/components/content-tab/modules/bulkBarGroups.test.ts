// Tests for bulkBarGroups.ts's data catalog and its four pure functions.
// Node-env, no component ever rendered (vitest.config.ts:13-14) - every
// assertion here is about the DATA MODEL and the pure reduction functions
// over it, never about markup, collapse animation, or keyboard behaviour.
// See docs/bulk-bar-reorganization-acceptance-criteria.md section 3b/D1 for
// the contract this file pins, and docs/DEV_LOOP.md section 9 for why every
// test below is written to be able to fail, not just to currently pass.

import { describe, expect, it } from "vitest";
import {
  auditGroupModel,
  BULK_BAR_GROUPS,
  groupById,
  groupOpen,
  groupTier,
  mayCollapse,
  TIER_RANK,
  type BulkBarControlDef,
  type BulkBarFacts,
  type BulkBarGroupDef,
  type BulkBarGroupRuntime,
  type ConsequenceTier,
} from "./bulkBarGroups";

function findGroup(id: string): BulkBarGroupDef {
  const group = BULK_BAR_GROUPS.find((g) => g.id === id);
  if (!group) throw new Error(`test setup: no group with id "${id}"`);
  return group;
}

function findControl(id: string): BulkBarControlDef {
  for (const group of BULK_BAR_GROUPS) {
    const control = group.controls.find((c) => c.id === id);
    if (control) return control;
  }
  throw new Error(`test setup: no control with id "${id}"`);
}

/** A fully-populated, "nothing selected, nothing scanned" facts object -
 * every test below overrides only the fields its scenario actually cares
 * about, so a future field addition to BulkBarFacts fails every call site
 * that forgot it (TypeScript's excess/missing property checking) rather
 * than silently defaulting somewhere a test never notices. */
function baseFacts(overrides: Partial<BulkBarFacts> = {}): BulkBarFacts {
  return {
    moduleCount: 0,
    itemCount: 0,
    selectedAssignmentCount: 0,
    singleItemEditKind: "none",
    bulkAddType: "Assignment",
    bulkAddFileContentPresent: false,
    bulkAddQuestionsCount: 0,
    bulkItemsQuestionsCount: 0,
    rubricsCount: 1,
    offersDeck: false,
    offersScript: false,
    offersIntroDiscussion: false,
    generationKindsCount: 0,
    hasDiagLog: false,
    coverageScanned: false,
    coveredCount: 0,
    creatableGapsCount: 0,
    carryReviewOpen: false,
    ...overrides,
  };
}

const idleRuntime: BulkBarGroupRuntime = { busy: false, armed: false, hasUnavailableReason: false };

describe("auditGroupModel", () => {
  it("returns [] for the shipped model", () => {
    expect(auditGroupModel()).toEqual([]);
  });

  // Sabotage-checked in-line, per docs/DEV_LOOP.md section 9: the audit
  // function must actually be ABLE to fail, not merely happen to pass on
  // today's data. Violates I6 (persistKey: null requires a non-empty
  // unpersistedReason) on a real control, confirms the audit reports it by
  // id, then restores the original value and confirms the audit is clean
  // again - proving both directions, not just the sabotage.
  // PLAUSIBLE FINDING (step-10 review), fixed: these three sabotage tests
  // mutate fields on the SHARED BULK_BAR_GROUPS singleton and restore them by
  // hand at the end of the test body. A mid-test throw (the sabotage
  // assertion itself failing, for instance) would skip the restore line and
  // leave the singleton corrupted for every test that runs after it in this
  // process - vitest does not reset module state between tests in the same
  // file. try/finally guarantees the restore runs even when an assertion
  // above it throws.
  it("reports an I6 violation when a persistKey:null control's unpersistedReason is emptied, and clears once restored", () => {
    const control = findControl("itemsPublish");
    expect(control.persistKey).toBeNull();
    const original = control.unpersistedReason;
    expect(original).toBeTruthy();

    try {
      control.unpersistedReason = "";
      const violations = auditGroupModel();
      expect(violations.some((v) => v.startsWith("I6:") && v.includes("itemsPublish"))).toBe(true);
    } finally {
      control.unpersistedReason = original;
    }
    expect(auditGroupModel()).toEqual([]);
  });

  // Same technique, a second invariant: I8's "ta-" prefix requirement.
  it("reports an I8 violation when a persistKey is given a non-ta- prefix, and clears once restored", () => {
    const control = findControl("generateDeckTemplateSelect");
    const original = control.persistKey;
    expect(original).toBe("ta-lms-deck-template");

    try {
      control.persistKey = "lms-deck-template";
      const violations = auditGroupModel();
      expect(violations.some((v) => v.startsWith("I8:") && v.includes("generateDeckTemplateSelect"))).toBe(true);
    } finally {
      control.persistKey = original;
    }
    expect(auditGroupModel()).toEqual([]);
  });

  // The exact hazard a step-10 review caught in this file's own first draft:
  // the ten Generate kind buttons were classified "read-only" and the
  // Generate group's `defaultOpen: true` was set by hand with nothing
  // policing it - I3 at the time only fired at fan-out-write/destructive, so
  // flipping Generate's `defaultOpen` to `false` produced ZERO violations
  // even though Generate is a real (reversible) write. Proves the fix: I3
  // now fires the moment a "reversible-write" group declares
  // `defaultOpen: false`, not only at fan-out-write/destructive.
  it("reports an I3 violation if the Generate group's defaultOpen is set to false, and clears once restored", () => {
    const group = findGroup("generate");
    expect(group.defaultOpen).toBe(true);

    try {
      group.defaultOpen = false;
      const violations = auditGroupModel();
      expect(violations.some((v) => v.startsWith("I3:") && v.includes("generate"))).toBe(true);
    } finally {
      group.defaultOpen = true;
    }
    expect(auditGroupModel()).toEqual([]);
  });
});

describe("ConsequenceTier has four members, per section 3b/D1", () => {
  it("TIER_RANK declares exactly read-only < reversible-write < fan-out-write < destructive", () => {
    expect(TIER_RANK).toEqual({
      "read-only": 0,
      "reversible-write": 1,
      "fan-out-write": 2,
      destructive: 3,
    });
  });

  it("the ten Generate kind buttons and the AI-drafting control are reversible-write, not read-only", () => {
    const generateKindIds = [
      "generateKind_qa",
      "generateKind_currentEvents",
      "generateKind_decks",
      "generateKind_objectives",
      "generateKind_assignments",
      "generateKind_knowledgeChecks",
      "generateKind_announcements",
      "generateKind_scripts",
      "generateKind_resources",
      "generateKind_introDiscussion",
    ];
    for (const id of generateKindIds) {
      expect(findControl(id).tier).toBe("reversible-write");
    }
    expect(findControl("moduleAddAiGenerate").tier).toBe("reversible-write");
  });

  it("Download/Ask AI/the visualizer scan button stay read-only - they touch nothing beyond this device", () => {
    expect(findControl("downloadImscc").tier).toBe("read-only");
    expect(findControl("downloadZip").tier).toBe("read-only");
    expect(findControl("askAiButton").tier).toBe("read-only");
    expect(findControl("visualizerScan").tier).toBe("read-only");
  });

  it("groupTier for Generate is reversible-write once kinds are offered - neither read-only nor fan-out-write", () => {
    const group = findGroup("generate");
    const tier = groupTier(group, baseFacts({ itemCount: 1, generationKindsCount: 10 }));
    expect(tier).toBe("reversible-write");
  });

  it("mayCollapse is still true for Generate - reversible-write collapses on the same footing as read-only", () => {
    const group = findGroup("generate");
    const facts = baseFacts({ itemCount: 1, generationKindsCount: 10 });
    expect(mayCollapse(group, facts)).toBe(true);
  });
});

describe("groupTier", () => {
  it("is read-only for a group with nothing visible", () => {
    const group = findGroup("items");
    expect(groupTier(group, baseFacts())).toBe("read-only");
  });

  it("is fan-out-write for the items group once items are selected (Publish/Unpublish, per D2)", () => {
    const group = findGroup("items");
    expect(groupTier(group, baseFacts({ itemCount: 2 }))).toBe("fan-out-write");
  });

  it("is destructive for the move group once items are selected (Delete from Canvas is a visible member)", () => {
    const group = findGroup("move");
    expect(groupTier(group, baseFacts({ itemCount: 1 }))).toBe("destructive");
  });

  it("never exceeds read-only for the Download group, which has no write control at all", () => {
    const group = findGroup("download");
    expect(groupTier(group, baseFacts({ moduleCount: 1, itemCount: 3 }))).toBe("read-only");
  });
});

describe("mayCollapse", () => {
  it("is false for the head group regardless of tier (disclosure: false)", () => {
    const group = findGroup("head");
    expect(mayCollapse(group, baseFacts({ itemCount: 1 }))).toBe(false);
  });

  it("is false for a group whose visible members reach fan-out-write (items, once selected)", () => {
    const group = findGroup("items");
    expect(mayCollapse(group, baseFacts({ itemCount: 1 }))).toBe(false);
  });

  it("is true for a pure read-only group (Download) at any selection", () => {
    const group = findGroup("download");
    expect(mayCollapse(group, baseFacts({ moduleCount: 1 }))).toBe(true);
  });

  // The load-bearing case D1 names explicitly: tier must be a function of
  // facts, and this is the one group whose tier genuinely changes at
  // runtime. TRUE before a scan has produced anything to act on, FALSE once
  // it has - proving mayCollapse cannot be a static per-group constant.
  it("is TRUE for visualizerCoverage before a scan, and FALSE once the scan has produced covered concepts", () => {
    const group = findGroup("visualizerCoverage");
    const before = baseFacts({ itemCount: 1, coverageScanned: false, coveredCount: 0, creatableGapsCount: 0 });
    const after = baseFacts({ itemCount: 1, coverageScanned: true, coveredCount: 3, creatableGapsCount: 0 });
    expect(mayCollapse(group, before)).toBe(true);
    expect(mayCollapse(group, after)).toBe(false);
  });

  it("is also FALSE for visualizerCoverage once the scan has produced creatable gaps (Create, not just Link)", () => {
    const group = findGroup("visualizerCoverage");
    const after = baseFacts({ itemCount: 1, coverageScanned: true, coveredCount: 0, creatableGapsCount: 2 });
    expect(mayCollapse(group, after)).toBe(false);
  });
});

describe("groupOpen", () => {
  const downloadGroup = findGroup("download");

  it("returns the group's own default when nothing forces it and nothing is persisted", () => {
    const facts = baseFacts({ moduleCount: 1 });
    expect(downloadGroup.defaultOpen).toBe(false);
    expect(groupOpen(downloadGroup, facts, idleRuntime, undefined)).toBe(false);
  });

  it("returns true for a default-closed read-only group when runtime.busy is true", () => {
    const facts = baseFacts({ moduleCount: 1 });
    const busyRuntime: BulkBarGroupRuntime = { busy: true, armed: false, hasUnavailableReason: false };
    expect(groupOpen(downloadGroup, facts, busyRuntime, undefined)).toBe(true);
  });

  it("returns true when armed, even with persisted:false", () => {
    const facts = baseFacts({ moduleCount: 1 });
    const armedRuntime: BulkBarGroupRuntime = { busy: false, armed: true, hasUnavailableReason: false };
    expect(groupOpen(downloadGroup, facts, armedRuntime, false)).toBe(true);
  });

  it("returns true when an unavailable reason is live, even with persisted:false", () => {
    const facts = baseFacts({ moduleCount: 1 });
    const reasonRuntime: BulkBarGroupRuntime = { busy: false, armed: false, hasUnavailableReason: true };
    expect(groupOpen(downloadGroup, facts, reasonRuntime, false)).toBe(true);
  });

  it("persistence wins over the default when nothing forces the group open", () => {
    const facts = baseFacts({ moduleCount: 1 });
    expect(groupOpen(downloadGroup, facts, idleRuntime, true)).toBe(true);
    expect(groupOpen(downloadGroup, facts, idleRuntime, false)).toBe(false);
  });

  it("is always open for a group that cannot collapse, regardless of runtime/persistence", () => {
    const itemsGroup = findGroup("items");
    const facts = baseFacts({ itemCount: 1 });
    expect(groupOpen(itemsGroup, facts, idleRuntime, false)).toBe(true);
  });
});

// RENAMED (Finding 6, step-10 review). This block used to be named "D6
// reachability: the four ungated sections stay visible for a module-only
// selection", which reads as a guarantee that a module-only selection
// actually reaches those four sections on screen. It is not one:
// `BulkBarGroupDef.visible` is never called in production - the only
// production `.visible(` call outside this file's own reduction is
// `control.visible`, one level down, inside `groupTier`. Real gating for
// these four sections today is hand-written where F1 owns the files
// (ModulesView.tsx wraps the entire bulk bar, all four sections included, in
// `selection.selected.size > 0 || selection.selectedModules.size > 0`, and
// GenerateFromSelectionSection additionally self-gates on `kinds.length`) -
// this file has no visibility into whether THOSE conditions agree with the
// data model below, and a rendered test that could prove reachability is not
// possible under this suite's node environment (see the AC doc's own
// "Testing reality" section). What this test CAN honestly claim, and now
// says so in its own name: the DATA MODEL's own `visible` predicate for each
// of these four groups - unused today, but exactly the kind of thing a
// future consumer might start reading - agrees with D6's module-only
// scenario. Kept as a spec/regression guard on the data, not repointed at
// ModulesView.tsx/GenerateFromSelectionSection.tsx's own source text, since
// those files are owned and concurrently edited by a sibling wave and a
// source-text coupling to them here would be fragile independent of this
// finding.
describe("group.visible: the DATA MODEL's own predicate for the four sections with no production caller (NOT a reachability guarantee)", () => {
  // The regrouping risk D6 names directly: a naive `visible: (f) =>
  // f.itemCount > 0` would silently kill Generate/Download/Ask AI/Coverage
  // for a module-only selection, which all four support today
  // (GenerateFromSelectionSection.tsx's own header: "a module-only selection
  // DOES offer every kind"). moduleCount is 1, itemCount is 0.
  const moduleOnlyFacts = baseFacts({ moduleCount: 1, itemCount: 0, generationKindsCount: 10 });

  it.each(["generate", "download", "askAi", "visualizerCoverage"])(
    "group %s's own (currently unused-in-production) visible predicate says true for a module-only selection",
    (id) => {
      const group = findGroup(id);
      expect(group.visible(moduleOnlyFacts)).toBe(true);
    }
  );
});

// Finding 8 (step-10 review): COMPOSE_FIELD_UNPERSISTED's "free-text scratch
// content" reason was wrongly applied to eight controls that are not free
// text - six non-text "Add to each" compose inputs (a select, a datetime, or
// a number) and two selects that name an entry in a list that can shrink
// between sessions, which already had a real, correct reason recorded in
// useBulkModuleActions.ts. bulkBarGroupCatalog.ts now gives each family its
// own accurate constant (COMPOSE_VALUE_UNPERSISTED / FOREIGN_KEY_UNPERSISTED)
// instead of reusing the free-text one - this pins that the wrong wording
// does not silently return.
describe("Finding 8: unpersistedReason accuracy for non-free-text 'Add to each' compose inputs", () => {
  const nonTextComposeIds = [
    "moduleAddTypeSelect",
    "moduleAddFileFormatSelect",
    "moduleAddDue",
    "moduleAddStaggerOffset",
    "moduleAddStaggerUnit",
    "moduleAddPoints",
  ];

  it.each(nonTextComposeIds)("%s's unpersistedReason does not claim to be free-text scratch content", (id) => {
    const control = findControl(id);
    expect(control.unpersistedReason ?? "").not.toMatch(/free-text/i);
  });

  it.each(["moduleAddFileExistingSelect", "moduleAddRubricSelect"])(
    "%s's unpersistedReason states the real foreign-key staleness risk, not the free-text rationale",
    (id) => {
      const control = findControl(id);
      expect(control.unpersistedReason ?? "").not.toMatch(/free-text/i);
      expect(control.unpersistedReason ?? "").toMatch(/shrink|deleted|no longer exists|since/i);
    }
  );

  it("the genuinely free-text 'Add to each' fields keep the free-text rationale", () => {
    for (const id of ["moduleAddPattern", "moduleAddBody", "moduleAddAiPrompt"]) {
      expect(findControl(id).unpersistedReason ?? "").toMatch(/free-text/i);
    }
  });
});

describe("groupById", () => {
  it("returns the group with the matching id", () => {
    expect(groupById("download").id).toBe("download");
    expect(groupById("visualizerCoverage").id).toBe("visualizerCoverage");
  });

  it("throws (does not return null/undefined) for an id the catalog does not have", () => {
    // TypeScript's BulkBarGroupId union would normally block this at compile
    // time; cast through unknown the same way a stale/typo'd literal from a
    // future edit could still slip past a wider string type at a call site.
    expect(() => groupById("not-a-real-group" as unknown as BulkBarGroupDef["id"])).toThrow(/not-a-real-group/);
  });

  it("returns the exact same object reference BULK_BAR_GROUPS holds, not a copy", () => {
    const fromArray = BULK_BAR_GROUPS.find((g) => g.id === "askAi");
    expect(groupById("askAi")).toBe(fromArray);
  });
});

describe("consequenceTag (I5): present whenever a group can reach fan-out-write or destructive", () => {
  // A sweep of fact combinations wide enough to touch every control's own
  // `visible` branch at least once (every bulkAddType value, both sides of
  // the visualizer scan, both single-item edit kinds, generation offered),
  // so "the observed max tier across this sweep" stands in for "the tier
  // this group could ever reach" without this test needing access to the
  // model's own private maxPossibleTier helper.
  const sweep: BulkBarFacts[] = [
    baseFacts({ itemCount: 2, moduleCount: 0 }),
    baseFacts({ itemCount: 1, singleItemEditKind: "gradable" }),
    baseFacts({ itemCount: 1, singleItemEditKind: "page" }),
    baseFacts({ moduleCount: 2, bulkAddType: "Assignment" }),
    baseFacts({ moduleCount: 2, bulkAddType: "Quiz", bulkAddQuestionsCount: 2 }),
    baseFacts({ moduleCount: 2, bulkAddType: "File", bulkAddFileContentPresent: true }),
    baseFacts({ moduleCount: 1, bulkAddType: "Page" }),
    baseFacts({ moduleCount: 1, bulkAddType: "Discussion" }),
    baseFacts({ moduleCount: 1, bulkAddType: "SubHeader" }),
    baseFacts({ itemCount: 1, generationKindsCount: 10, offersDeck: true, offersScript: true, offersIntroDiscussion: true, hasDiagLog: true }),
    baseFacts({ itemCount: 1, coverageScanned: false }),
    baseFacts({ itemCount: 1, coverageScanned: true, coveredCount: 3 }),
    baseFacts({ itemCount: 1, coverageScanned: true, creatableGapsCount: 2 }),
    baseFacts({ moduleCount: 1, carryReviewOpen: true }),
  ];

  function observedMaxTier(group: BulkBarGroupDef): ConsequenceTier {
    let best: ConsequenceTier = "read-only";
    for (const facts of sweep) {
      const tier = groupTier(group, facts);
      if (TIER_RANK[tier] > TIER_RANK[best]) best = tier;
    }
    return best;
  }

  it.each(BULK_BAR_GROUPS.map((g) => g.id))("group %s: consequenceTag is non-null iff its reachable tier is fan-out-write or destructive", (id) => {
    const group = findGroup(id);
    const reachesHighTier = TIER_RANK[observedMaxTier(group)] >= TIER_RANK["fan-out-write"];
    if (reachesHighTier) {
      expect(group.consequenceTag).not.toBeNull();
      expect((group.consequenceTag ?? "").trim()).not.toBe("");
    } else {
      expect(group.consequenceTag).toBeNull();
    }
  });
});

describe("BULK_BAR_GROUPS shape", () => {
  it("declares exactly the fifteen groups - the original D0 thirteen plus currentEvents (docs/current-events-assignment-from-modules-acceptance-criteria.md section 3b/D5) plus carryPattern (docs/carry-module-pattern-forward-acceptance-criteria.md, chunk D)", () => {
    const ids = BULK_BAR_GROUPS.map((g) => g.id).sort();
    expect(ids).toEqual(
      [
        "addToEach",
        "askAi",
        "carryPattern",
        "content",
        "currentEvents",
        "download",
        "dueDates",
        "grading",
        "generate",
        "head",
        "items",
        "modules",
        "move",
        "submissionType",
        "visualizerCoverage",
      ].sort(),
    );
  });

  it("counts 30 controls for BulkItemsSection's own groups (items/content/dueDates/grading/submissionType/move) - was 29 before docs/rubric-bulk-action-acceptance-criteria.md AC5 added itemsGenerateAssociateRubric to the existing grading group (not a sixteenth group, per that control's own comment in bulkBarGroupCatalog.ts)", () => {
    const sectionGroupIds = ["items", "content", "dueDates", "grading", "submissionType", "move"];
    const total = sectionGroupIds.reduce((sum, id) => sum + findGroup(id).controls.length, 0);
    expect(total).toBe(30);
  });

  it("counts 15 visible controls for BulkModulesSection's groups on the Assignment path, matching section 0's own tally", () => {
    const facts = baseFacts({ moduleCount: 1, bulkAddType: "Assignment" });
    const modulesVisible = findGroup("modules").controls.filter((c) => c.visible(facts)).length;
    const addToEachVisible = findGroup("addToEach").controls.filter((c) => c.visible(facts)).length;
    expect(modulesVisible + addToEachVisible).toBe(15);
  });

  it("every group with disclosure:false is never collapsible, by construction", () => {
    for (const group of BULK_BAR_GROUPS) {
      if (!group.disclosure) {
        expect(mayCollapse(group, baseFacts({ moduleCount: 1, itemCount: 1 }))).toBe(false);
      }
    }
  });
});

// AC11 says "report, do not silently delete" near-dead controls, and that
// each removal is a recorded decision. `auditGroupModel`'s I7 only checks
// the SHAPE of a `nearDead` entry that is already present (non-empty `why`/
// `recommendation`) - nothing anywhere pinned WHICH control ids carry one,
// so silently deleting a `nearDead` entry (or the control it is attached to)
// passed every other gate in this file. This block is that missing pin: the
// exact reported set, named by id, so removing one without updating this
// test is the recorded decision AC11 asks for, not a silent regression.
describe("AC11 (near-dead controls): the reported set is pinned by control id", () => {
  // The four AC11 candidates named in docs/bulk-bar-reorganization-
  // acceptance-criteria.md: "Edit in detail / Edit page", "Add to selected
  // quizzes", and the two rubric selects (items' own and Add-to-each's).
  // The fourth candidate the AC names - the `gateOperation` refusal branch
  // both bulk sections carry - is SECTION-level (it stands in for the whole
  // section, built by hand, never a `BulkBarControlDef`), not a control, so
  // it is not and cannot be represented here; it stays reported in prose
  // only (this file's own header, and the AC document).
  const EXPECTED_NEAR_DEAD_CONTROL_IDS = [
    "itemsEditInDetailOrPage",
    "itemsAddToSelectedQuizzes",
    "itemsRubricSelect",
    "moduleAddRubricSelect",
  ] as const;

  function allControls(): BulkBarControlDef[] {
    return BULK_BAR_GROUPS.flatMap((g) => g.controls);
  }

  it("SABOTAGE TARGET: exactly these control ids carry a nearDead entry - no more, no fewer", () => {
    const actual = allControls()
      .filter((c) => c.nearDead !== undefined)
      .map((c) => c.id)
      .sort();
    expect(actual).toEqual([...EXPECTED_NEAR_DEAD_CONTROL_IDS].sort());
  });

  it("every id in the pinned set is a real control that actually exists in the model", () => {
    const knownControlIds = new Set(allControls().map((c) => c.id));
    for (const id of EXPECTED_NEAR_DEAD_CONTROL_IDS) {
      expect(knownControlIds.has(id), `"${id}" is not a real control id in BULK_BAR_GROUPS`).toBe(true);
    }
  });
});

// docs/current-events-assignment-from-modules-acceptance-criteria.md section
// 3b/D5: a NEW group, sibling of "addToEach", not folded into it. Its one
// control's `visible` is identical to the group's own `visible`, which makes
// non-collapsibility a THEOREM of groupTier/mayCollapse rather than a fact
// declared by hand - these tests pin that derivation, not just today's
// output.
describe("currentEvents group (docs/current-events-assignment-from-modules-acceptance-criteria.md section 3b/D5)", () => {
  it("has exactly one control, moduleCurrentEventsButton, declared fan-out-write, persistKey null with a non-empty unpersistedReason", () => {
    const group = findGroup("currentEvents");
    expect(group.controls.map((c) => c.id)).toEqual(["moduleCurrentEventsButton"]);
    const control = group.controls[0];
    expect(control.tier).toBe("fan-out-write");
    expect(control.persistKey).toBeNull();
    expect(control.unpersistedReason ?? "").not.toBe("");
  });

  it("groupTier is fan-out-write whenever the group is visible, at any module count", () => {
    const group = findGroup("currentEvents");
    expect(groupTier(group, baseFacts({ moduleCount: 1 }))).toBe("fan-out-write");
    expect(groupTier(group, baseFacts({ moduleCount: 5 }))).toBe("fan-out-write");
  });

  it("has a non-null, non-empty consequenceTag stating plainly what one click does (I5)", () => {
    const group = findGroup("currentEvents");
    expect(group.consequenceTag).not.toBeNull();
    expect((group.consequenceTag ?? "").trim()).not.toBe("");
  });

  it("THEOREM, not a declaration: mayCollapse is false under every fact combination that renders the group, because its one control is visible whenever the group is", () => {
    const group = findGroup("currentEvents");
    const sweep: BulkBarFacts[] = [
      baseFacts({ moduleCount: 1 }),
      baseFacts({ moduleCount: 2, itemCount: 5 }),
      baseFacts({ moduleCount: 10, bulkAddType: "Quiz" }),
      baseFacts({ moduleCount: 1, coverageScanned: true, coveredCount: 3, creatableGapsCount: 2 }),
      baseFacts({ moduleCount: 1, generationKindsCount: 10, offersDeck: true, offersScript: true, offersIntroDiscussion: true }),
    ];
    for (const facts of sweep) {
      expect(mayCollapse(group, facts)).toBe(false);
    }
  });

  it("disclosure:true but defaultOpen is moot - groupOpen returns true regardless of persistence, since mayCollapse never lets the persisted/default branches run", () => {
    const group = findGroup("currentEvents");
    const facts = baseFacts({ moduleCount: 1 });
    expect(groupOpen(group, facts, idleRuntime, false)).toBe(true);
    expect(groupOpen(group, facts, idleRuntime, undefined)).toBe(true);
  });

  // Sabotage: temporarily downgrade the control's own declared tier and
  // confirm the group's derived tier AND mayCollapse both flip - proving the
  // "THEOREM" test above is actually exercising groupTier/mayCollapse's
  // reduction, not a hardcoded false this suite would never notice going
  // stale. try/finally guards the shared BULK_BAR_GROUPS singleton per this
  // file's own established technique (docs/REGRESSION.md entry 329's lesson:
  // groupById/findControl hand back references into ONE shared module-level
  // array, so a mid-test throw here would corrupt the catalog for every
  // later test in this run).
  it("sabotage: downgrading the control's tier to read-only makes the group collapsible, and restoring it makes it uncollapsible again", () => {
    const control = findControl("moduleCurrentEventsButton");
    const original = control.tier;
    expect(original).toBe("fan-out-write");
    try {
      control.tier = "read-only";
      const group = findGroup("currentEvents");
      expect(groupTier(group, baseFacts({ moduleCount: 1 }))).toBe("read-only");
      expect(mayCollapse(group, baseFacts({ moduleCount: 1 }))).toBe(true);
    } finally {
      control.tier = original;
    }
    const group = findGroup("currentEvents");
    expect(groupTier(group, baseFacts({ moduleCount: 1 }))).toBe("fan-out-write");
    expect(mayCollapse(group, baseFacts({ moduleCount: 1 }))).toBe(false);
  });

  // Sabotage: emptying the group's consequenceTag must trip I5 in
  // auditGroupModel - proving the presence test above is pinned to a real
  // invariant, not merely today's string.
  it("sabotage: emptying the group's consequenceTag trips auditGroupModel's I5, and restoring it clears the violation", () => {
    const group = findGroup("currentEvents");
    const original = group.consequenceTag;
    try {
      group.consequenceTag = "";
      const violations = auditGroupModel();
      expect(violations.some((v) => v.startsWith("I5:") && v.includes("currentEvents"))).toBe(true);
    } finally {
      group.consequenceTag = original;
    }
    expect(auditGroupModel()).toEqual([]);
  });
});

// docs/carry-module-pattern-forward-acceptance-criteria.md, chunk D, D17 -
// THE POINT OF THIS GROUP. Unlike currentEvents (whose one control is
// visible whenever the group is, so groupTier is unconditionally
// fan-out-write), carryApplyButton lives inside a review modal and is
// visible ONLY while that modal is open (facts.carryReviewOpen). So the
// group's derived tier is a genuine function of a fact that toggles at
// runtime, the same shape visualizerCoverage's own tests already pin for a
// scan - proven here as a THEOREM over the real catalog, not asserted as a
// declaration, with an in-place sabotage that reproduces D17's exact hazard
// (declaring the apply control invisible to the derivation) and confirms the
// real declaration is what prevents it.
describe("carryPattern group (docs/carry-module-pattern-forward-acceptance-criteria.md, chunk D, D14/D17/D19)", () => {
  it("has exactly the three contracted controls with their contracted tiers", () => {
    const group = findGroup("carryPattern");
    expect(group.controls.map((c) => c.id)).toEqual([
      "carryTemplateSelect",
      "carryReviewButton",
      "carryApplyButton",
    ]);
    expect(findControl("carryTemplateSelect").tier).toBe("read-only");
    expect(findControl("carryReviewButton").tier).toBe("read-only");
    expect(findControl("carryApplyButton").tier).toBe("fan-out-write");
  });

  it("every control declares persistKey: null with a non-empty unpersistedReason (I6)", () => {
    const group = findGroup("carryPattern");
    for (const control of group.controls) {
      expect(control.persistKey).toBeNull();
      expect(control.unpersistedReason ?? "").not.toBe("");
    }
  });

  it("carryTemplateSelect's unpersistedReason cites the postModuleChoice/AC10 precedent by name, not a reinvented rationale", () => {
    const reason = findControl("carryTemplateSelect").unpersistedReason ?? "";
    expect(reason).toMatch(/postModuleChoice/);
    expect(reason).toMatch(/AC10/);
    expect(reason).toMatch(/current/i);
    expect(reason).toMatch(/selection/i);
  });

  it("THEOREM: groupTier is read-only while carryReviewOpen is false, and fan-out-write once it is true, at any module count", () => {
    const group = findGroup("carryPattern");
    expect(groupTier(group, baseFacts({ moduleCount: 1, carryReviewOpen: false }))).toBe("read-only");
    expect(groupTier(group, baseFacts({ moduleCount: 5, carryReviewOpen: false }))).toBe("read-only");
    expect(groupTier(group, baseFacts({ moduleCount: 1, carryReviewOpen: true }))).toBe("fan-out-write");
    expect(groupTier(group, baseFacts({ moduleCount: 5, carryReviewOpen: true }))).toBe("fan-out-write");
  });

  it("THEOREM: mayCollapse is true while the review is closed and false once it is open", () => {
    const group = findGroup("carryPattern");
    expect(mayCollapse(group, baseFacts({ moduleCount: 1, carryReviewOpen: false }))).toBe(true);
    expect(mayCollapse(group, baseFacts({ moduleCount: 1, carryReviewOpen: true }))).toBe(false);
  });

  it("has a non-null, non-empty consequenceTag naming the fan-out write (I5)", () => {
    const group = findGroup("carryPattern");
    expect(group.consequenceTag).not.toBeNull();
    expect((group.consequenceTag ?? "").trim()).not.toBe("");
  });

  // Step-10 review, C11: the tag used to claim Apply performs "creating and,
  // where offered, overwriting items" - no path offers an overwrite.
  // carry-module-pattern.ts's apply action returns "overwrite-not-
  // implemented" for an "overwrite" decision, and useCarryModulePattern.ts
  // hardcodes onExisting: "skip", so nothing ever reaches an overwrite.
  // Pin the FACT (no overwrite claim), never the exact sentence.
  it("C11: the consequenceTag does not claim an overwrite capability that no path offers", () => {
    const group = findGroup("carryPattern");
    expect(group.consequenceTag ?? "").not.toMatch(/overwrit/i);
  });

  // SABOTAGE, in the shape docs/REGRESSION.md entry 330 check 5 describes:
  // reproduce D17's exact hazard in place (declare the apply control
  // invisible to the derivation, as if `visible: () => false` had shipped),
  // confirm the group would then lie about its own safety (stays read-only
  // and collapsible EVEN WHILE the review modal is genuinely open), then
  // restore and confirm the real declaration does not have that hole.
  // try/finally because groupById/findControl hand back references into ONE
  // shared module-level array (BULK_BAR_GROUPS) and a mid-test throw would
  // corrupt the catalog for every later test in this run.
  it("SABOTAGE: an apply control invisible to the derivation makes the group lie about safety while the review is open, and the real declaration does not", () => {
    const control = findControl("carryApplyButton");
    const original = control.visible;
    const openFacts = baseFacts({ moduleCount: 1, carryReviewOpen: true });
    try {
      control.visible = () => false;
      const group = findGroup("carryPattern");
      // The bug D17 warns about: even with the review genuinely open, the
      // group derives read-only and stays collapsible, because its one
      // fan-out-write control is (falsely) never a visible member.
      expect(groupTier(group, openFacts)).toBe("read-only");
      expect(mayCollapse(group, openFacts)).toBe(true);
    } finally {
      control.visible = original;
    }
    const group = findGroup("carryPattern");
    expect(groupTier(group, openFacts)).toBe("fan-out-write");
    expect(mayCollapse(group, openFacts)).toBe(false);
  });

  // Second sabotage, entry 330 check 5's other half: emptying the
  // consequenceTag must trip I5 regardless of carryReviewOpen, since I5's
  // own maxPossibleTier ignores visibility entirely and looks at every
  // control's DECLARED tier - proving the tag requirement does not depend on
  // the review modal happening to be open when the audit runs.
  it("sabotage: emptying the group's consequenceTag trips auditGroupModel's I5, and restoring it clears the violation", () => {
    const group = findGroup("carryPattern");
    const original = group.consequenceTag;
    try {
      group.consequenceTag = "";
      const violations = auditGroupModel();
      expect(violations.some((v) => v.startsWith("I5:") && v.includes("carryPattern"))).toBe(true);
    } finally {
      group.consequenceTag = original;
    }
    expect(auditGroupModel()).toEqual([]);
  });
});
