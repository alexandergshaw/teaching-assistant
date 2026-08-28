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
    generatePostReachable: false,
    generateSubjectEditable: false,
    generateSaveEditReachable: false,
    commandProposalOpen: false,
    releaseReviewOpen: false,
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

  // NOTE (2026-08-24): still true, and still the right assertion, but no
  // longer the whole story - `generatePostReachable` defaults to false in
  // baseFacts, so this pins Generate's tier while the modal-hosted "Post to
  // Canvas" write is UNREACHABLE. Once it is reachable the group correctly
  // derives fan-out-write; see the "generate group" describe at the bottom of
  // this file for that half. Deliberately left scoped rather than widened:
  // the resting tier is a fact worth pinning on its own.
  it("groupTier for Generate is reversible-write once kinds are offered, while no post is reachable", () => {
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
    // Without this entry the sweep never observes `generate`'s TRUE reachable
    // tier - every other entry leaves `generatePostReachable` false, so
    // `generatePostToCanvas` is invisible, `observedMaxTier` reports
    // reversible-write, and this test would then DEMAND a null consequenceTag
    // on a group whose flow ends in a Canvas write. That is the same
    // correction the carryReviewOpen entry above had to make, and it is the
    // precise shape of the defect being fixed: a sweep that cannot see a
    // modal-hosted control asserts the group is safe, in green.
    baseFacts({ itemCount: 1, generationKindsCount: 10, generatePostReachable: true }),
    // Same correction again, for commandInterface's own modal-hosted write:
    // without this entry the sweep never observes commandApplyButton (every
    // other entry leaves commandProposalOpen false), observedMaxTier reports
    // reversible-write from commandReview alone, and this test would demand a
    // null consequenceTag on the group G7 exists specifically to keep tagged.
    baseFacts({ itemCount: 1, commandProposalOpen: true }),
    // Same correction a third time, for scheduledRelease's own modal-hosted
    // write: without this entry the sweep never observes releaseCommit
    // (every other entry leaves releaseReviewOpen false), observedMaxTier
    // reports read-only from releaseDate/releaseReview alone, and this test
    // would demand a null consequenceTag on the group F6 exists specifically
    // to keep tagged.
    baseFacts({ itemCount: 1, releaseReviewOpen: true }),
    // Fourth such correction, for generateGroup's own Subject field
    // (docs/announcement-preview-edit-before-post-acceptance-criteria.md, AC
    // 15/24): without this entry the sweep never observes
    // generateSubjectField (every other entry leaves generateSubjectEditable
    // false), so observedMaxTier could never be raised BY this control - it
    // is declared read-only, so it never lifts a group already reaching
    // fan-out-write via generatePostToCanvas/generatePostConfirm above, but a
    // future edit that mis-declared its tier would go unseen by this sweep
    // without this entry.
    baseFacts({ itemCount: 1, generationKindsCount: 10, generateSubjectEditable: true }),
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
  it("declares exactly the seventeen groups - the original D0 thirteen plus currentEvents (docs/current-events-assignment-from-modules-acceptance-criteria.md section 3b/D5) plus carryPattern (docs/carry-module-pattern-forward-acceptance-criteria.md, chunk D) plus commandInterface (docs/llm-command-interface-acceptance-criteria.md section 10, chunk G) plus scheduledRelease (docs/scheduled-publishing-from-modules-acceptance-criteria.md, F6/F7/F10)", () => {
    const ids = BULK_BAR_GROUPS.map((g) => g.id).sort();
    expect(ids).toEqual(
      [
        "addToEach",
        "askAi",
        "carryPattern",
        "commandInterface",
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
        "scheduledRelease",
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

// The same hole carryPatternGroup's own header recorded as SHIPPED in the
// Generate group and deliberately left standing. Closed 2026-08-24 by
// declaring generatePostToCanvas, which lives in GeneratedPreviewModal.tsx
// and was invisible to groupTier's reduction until then - so this group's
// derived tier topped out at reversible-write from the ten kind buttons
// while its flow ends in a real Canvas write, and the audit asserted, in
// green, that the group was safer than it is.
describe("generate group: the modal-hosted Post to Canvas write (D17's shape, applied to the instance it recorded)", () => {
  it("declares generatePostToCanvas at fan-out-write, gated on reachability rather than on the group being visible", () => {
    const control = findControl("generatePostToCanvas");
    // fan-out-write by elimination against this file's own tier definitions:
    // reversible-write PROMISES reversibility and a Canvas post is not
    // reversible from this app; destructive is reserved for the four writes
    // carrying a two-click confirm-arm, and this control - even now that it
    // is itself two-click, per docs/announcement-preview-edit-before-post-
    // acceptance-criteria.md - is a CREATE, not one of the four DELETEs that
    // tier is reserved for.
    expect(control.tier).toBe("fan-out-write");
    expect(control.persistKey).toBeNull();
    expect(control.unpersistedReason ?? "").not.toBe("");
  });

  // Mirrors the declaration test immediately above, for the confirm step's
  // OWN commit control (docs/announcement-preview-edit-before-post-
  // acceptance-criteria.md, AC 9/24). Not redundant with the test above: a
  // second fan-out-write control gated on the same fact
  // (generatePostReachable) is precisely the shape that could go
  // undeclared exactly as generatePostToCanvas itself once did, and only a
  // per-control assertion - not the group-level THEOREM below, which cannot
  // tell two fan-out-write controls apart - catches that.
  it("declares generatePostConfirm at fan-out-write, gated on the same reachability fact as generatePostToCanvas", () => {
    const control = findControl("generatePostConfirm");
    expect(control.tier).toBe("fan-out-write");
    expect(control.persistKey).toBeNull();
    expect(control.unpersistedReason ?? "").not.toBe("");
  });

  // Its Cancel sibling and the Subject field stay read-only - neither is a
  // Canvas write, so neither should be able to lift this group's derived
  // tier on its own (proven by the THEOREM below, not merely declared here).
  it("declares generatePostCancel and generateSubjectField at read-only", () => {
    expect(findControl("generatePostCancel").tier).toBe("read-only");
    expect(findControl("generateSubjectField").tier).toBe("read-only");
  });

  // docs/announcement-preview-edit-before-post-acceptance-criteria.md,
  // "Adjacent defects" section: `generateSaveEdit` closes the same shape of
  // gap `generatePostToCanvas` itself closed above - a real write, reachable
  // only from inside GeneratedPreviewModal.tsx, declared nowhere until now.
  // Also this section's own sabotage check: deleting the control from the
  // catalog makes `findControl` throw ("no control with id"), which fails
  // this test - the fact of the control's existence is what is pinned here,
  // not merely a property of it once found.
  it("declares generateSaveEdit at reversible-write, gated on its own reachability fact rather than on the group being visible", () => {
    const control = findControl("generateSaveEdit");
    // reversible-write, not read-only (it is a real write - a new
    // generated_artifacts version) and not fan-out-write (unlike a Canvas
    // post it is SCOPED to one artifact and REVERSIBLE - a new version,
    // never an overwrite of anything already posted).
    expect(control.tier).toBe("reversible-write");
    expect(control.persistKey).toBeNull();
    expect(control.unpersistedReason ?? "").not.toBe("");
  });

  it("THEOREM: groupTier is reversible-write while the post is unreachable, and fan-out-write once it is reachable", () => {
    const group = findGroup("generate");
    const visible = { itemCount: 1, generationKindsCount: 10 };
    expect(groupTier(group, baseFacts({ ...visible, generatePostReachable: false }))).toBe("reversible-write");
    expect(groupTier(group, baseFacts({ ...visible, generatePostReachable: true }))).toBe("fan-out-write");
  });

  // THEOREM, generateSubjectField's own: a read-only control becoming
  // visible must never lift the group above whatever generatePostReachable
  // alone would produce - proves generateSubjectEditable is not silently
  // wired to a higher tier than declared.
  it("THEOREM: generateSubjectEditable alone (post unreachable) keeps groupTier at reversible-write, never fan-out-write", () => {
    const group = findGroup("generate");
    const visible = { itemCount: 1, generationKindsCount: 10 };
    expect(groupTier(group, baseFacts({ ...visible, generatePostReachable: false, generateSubjectEditable: true }))).toBe("reversible-write");
  });

  // THEOREM, generateSaveEdit's own: it is declared reversible-write, the
  // SAME tier the ten kind buttons already put this group at whenever it is
  // visible at all (generationKindsCount: 10 above), so becoming reachable
  // must never lift the group's derived tier past reversible-write on its
  // own - and, symmetrically, must never DROP it below fan-out-write once
  // the post is also reachable (`groupTier` is a max-over-visible-controls
  // reduction, so a lower-tier control gaining visibility cannot lower it).
  it("THEOREM: generateSaveEditReachable alone (post unreachable) keeps groupTier at reversible-write, never fan-out-write, and never below it once the post also becomes reachable", () => {
    const group = findGroup("generate");
    const visible = { itemCount: 1, generationKindsCount: 10 };
    expect(groupTier(group, baseFacts({ ...visible, generatePostReachable: false, generateSaveEditReachable: true }))).toBe("reversible-write");
    expect(groupTier(group, baseFacts({ ...visible, generatePostReachable: true, generateSaveEditReachable: true }))).toBe("fan-out-write");
  });

  it("THEOREM: mayCollapse is true while the post is unreachable and false once it is reachable", () => {
    const group = findGroup("generate");
    const visible = { itemCount: 1, generationKindsCount: 10 };
    expect(mayCollapse(group, baseFacts({ ...visible, generatePostReachable: false }))).toBe(true);
    expect(mayCollapse(group, baseFacts({ ...visible, generatePostReachable: false, hasDiagLog: true }))).toBe(true);
    expect(mayCollapse(group, baseFacts({ ...visible, generatePostReachable: true }))).toBe(false);
  });

  it("I5 now requires a consequenceTag on this group, and it names the Canvas write rather than the generation", () => {
    const group = findGroup("generate");
    expect(group.consequenceTag).not.toBeNull();
    expect((group.consequenceTag ?? "").trim()).not.toBe("");
    // Pin the FACT, not the sentence: the tag must describe the write that
    // is actually reachable from here. Generating a draft costs a model call
    // and touches nothing, so a tag claiming the GENERATION writes to Canvas
    // would overstate the common case (C11's lesson, one group over).
    expect(group.consequenceTag ?? "").toMatch(/canvas/i);
  });

  // SABOTAGE, entry 330 check 5's shape. Reproduces the pre-fix state in
  // place - BOTH fan-out-write controls this group's post flow now declares
  // (generatePostToCanvas and, since docs/announcement-preview-edit-before-
  // post-acceptance-criteria.md AC 24, generatePostConfirm) invisible to the
  // derivation, exactly as if neither had ever been declared - and confirms
  // the group then lies about its own safety WHILE the write is genuinely
  // reachable on screen.
  //
  // EXTENDED for AC 24: blinding generatePostToCanvas ALONE no longer
  // reproduces the defect, because generatePostConfirm - gated on the exact
  // same `generatePostReachable` fact - is still visible to the reduction
  // and the group correctly stays fan-out-write. That is not a bug in this
  // test; it is the model working (a second, correctly-declared control
  // covers for the first one going dark). The sabotage has to blind BOTH to
  // reproduce "the group claims to be safer than it is", the same way the
  // scheduledRelease/commandInterface blocks above blind their own group's
  // one write control - this group now has two, so both must go dark
  // together. try/finally (nested, so a mid-test throw after the first
  // control is blinded still restores it) because findGroup/findControl hand
  // back references into ONE shared module-level array, and a mid-test throw
  // would corrupt the catalog for every later test in this run.
  it("SABOTAGE: with BOTH post-flow controls invisible to the derivation the group claims to be safe while the write is on screen, and the real declaration does not", () => {
    const postControl = findControl("generatePostToCanvas");
    const confirmControl = findControl("generatePostConfirm");
    const originalPostVisible = postControl.visible;
    const originalConfirmVisible = confirmControl.visible;
    const reachable = baseFacts({ itemCount: 1, generationKindsCount: 10, generatePostReachable: true });
    try {
      postControl.visible = () => false;
      try {
        confirmControl.visible = () => false;
        const group = findGroup("generate");
        // The shipped defect, reproduced: a real Canvas write is one click
        // away and the group still derives reversible-write and stays
        // collapsible.
        expect(groupTier(group, reachable)).toBe("reversible-write");
        expect(mayCollapse(group, reachable)).toBe(true);
      } finally {
        confirmControl.visible = originalConfirmVisible;
      }
    } finally {
      postControl.visible = originalPostVisible;
    }
    const group = findGroup("generate");
    expect(groupTier(group, reachable)).toBe("fan-out-write");
    expect(mayCollapse(group, reachable)).toBe(false);
  });

  // Companion to the above, proving the EXTENSION itself is load-bearing:
  // blinding generatePostConfirm ALONE (leaving generatePostToCanvas
  // visible) must NOT reproduce the defect, since the group still has a
  // visible fan-out-write member. If this ever went red, the two-control
  // sabotage above would be vacuously passing for the wrong reason.
  it("blinding generatePostConfirm alone leaves the group correctly fan-out-write, because generatePostToCanvas is still visible", () => {
    const control = findControl("generatePostConfirm");
    const original = control.visible;
    const reachable = baseFacts({ itemCount: 1, generationKindsCount: 10, generatePostReachable: true });
    try {
      control.visible = () => false;
      const group = findGroup("generate");
      expect(groupTier(group, reachable)).toBe("fan-out-write");
      expect(mayCollapse(group, reachable)).toBe(false);
    } finally {
      control.visible = original;
    }
  });

  // I5's maxPossibleTier ignores visibility and reads DECLARED tiers, so the
  // tag requirement must hold whether or not the modal happens to be open
  // when the audit runs - which is what makes it a real invariant rather
  // than a property of the facts a test chose.
  it("sabotage: emptying this group's consequenceTag trips I5, and restoring it clears the violation", () => {
    const group = findGroup("generate");
    const original = group.consequenceTag;
    try {
      group.consequenceTag = "";
      const violations = auditGroupModel();
      expect(violations.some((v) => v.startsWith("I5:") && v.includes("generate"))).toBe(true);
    } finally {
      group.consequenceTag = original;
    }
    expect(auditGroupModel()).toEqual([]);
  });
});

// docs/llm-command-interface-acceptance-criteria.md section 10 (THE FINAL
// CONTRACT), G7 - THE SAME D17 SHAPE AGAIN, applied to the highest-
// consequence control this bar has ever declared. commandApplyButton lives
// inside the proposal review modal, not the bar, and is visible only while
// facts.commandProposalOpen is true - the exact reason to distrust "the
// tier follows automatically from declaring fan-out-write" (REGRESSION
// entry 331 point 5's defect) is proven here as a theorem over the real
// catalog, not asserted as a declaration: the group's derived tier must
// RISE to fan-out-write when the review is open and sit at read-only (or, as
// here, reversible-write from commandReview's own model call) when it is
// not.
describe("commandInterface group (docs/llm-command-interface-acceptance-criteria.md section 10, G7/G15)", () => {
  it("has exactly the three contracted controls with their contracted tiers", () => {
    const group = findGroup("commandInterface");
    expect(group.controls.map((c) => c.id)).toEqual(["commandBox", "commandReview", "commandApply"]);
    expect(findControl("commandBox").tier).toBe("read-only");
    expect(findControl("commandReview").tier).toBe("reversible-write");
    expect(findControl("commandApply").tier).toBe("fan-out-write");
  });

  it("is visible whenever anything is selected - a module alone, an item alone, or any mix (G15: established precedent, not a new asymmetry)", () => {
    const group = findGroup("commandInterface");
    expect(group.visible(baseFacts({ moduleCount: 1, itemCount: 0 }))).toBe(true);
    expect(group.visible(baseFacts({ moduleCount: 0, itemCount: 1 }))).toBe(true);
    expect(group.visible(baseFacts({ moduleCount: 1, itemCount: 3 }))).toBe(true);
    expect(group.visible(baseFacts({ moduleCount: 0, itemCount: 0 }))).toBe(false);
  });

  it("every control declares persistKey: null with a non-empty unpersistedReason (I6)", () => {
    const group = findGroup("commandInterface");
    for (const control of group.controls) {
      expect(control.persistKey).toBeNull();
      expect(control.unpersistedReason ?? "").not.toBe("");
    }
  });

  // G15: AC8 (section 8) asked for a persisted key on this box; section 10
  // overrides it. Pin that the override is actually recorded, not merely
  // that the field happens to be null today.
  it("commandBox's unpersistedReason states this is stronger than its compose-field neighbours because the reapplied text reaches Canvas", () => {
    const reason = findControl("commandBox").unpersistedReason ?? "";
    expect(reason).toMatch(/canvas/i);
    expect(reason).toMatch(/stronger/i);
  });

  it("THEOREM: groupTier is reversible-write while commandProposalOpen is false, and fan-out-write once it is true, at any selection", () => {
    const group = findGroup("commandInterface");
    expect(groupTier(group, baseFacts({ itemCount: 1, commandProposalOpen: false }))).toBe("reversible-write");
    expect(groupTier(group, baseFacts({ moduleCount: 5, commandProposalOpen: false }))).toBe("reversible-write");
    expect(groupTier(group, baseFacts({ itemCount: 1, commandProposalOpen: true }))).toBe("fan-out-write");
    expect(groupTier(group, baseFacts({ moduleCount: 5, commandProposalOpen: true }))).toBe("fan-out-write");
  });

  it("THEOREM: mayCollapse is true while the proposal review is closed and false once it is open", () => {
    const group = findGroup("commandInterface");
    expect(mayCollapse(group, baseFacts({ itemCount: 1, commandProposalOpen: false }))).toBe(true);
    expect(mayCollapse(group, baseFacts({ itemCount: 1, commandProposalOpen: true }))).toBe(false);
  });

  it("has a non-null, non-empty consequenceTag naming the fan-out write and, per G1, which object types Canvas can and cannot revert", () => {
    const group = findGroup("commandInterface");
    expect(group.consequenceTag).not.toBeNull();
    expect((group.consequenceTag ?? "").trim()).not.toBe("");
    expect(group.consequenceTag ?? "").toMatch(/page/i);
  });

  // G7's own tier correction: destructive is reserved for the four writes
  // that already carry a two-click confirm-arm (confirmArming.ts); this
  // control carries no confirm-arm of its own, so it must not be declared at
  // that tier no matter how consequential its write is.
  it("G7: commandApply is fan-out-write, not destructive - it carries no confirm-arm of its own", () => {
    expect(findControl("commandApply").tier).toBe("fan-out-write");
    expect(findControl("commandApply").tier).not.toBe("destructive");
  });

  // SABOTAGE, entry 331 point 5's exact shape, reproduced against this
  // group. try/finally because findGroup/findControl hand back references
  // into ONE shared module-level array (BULK_BAR_GROUPS) and a mid-test
  // throw would corrupt the catalog for every later test in this run.
  it("SABOTAGE: an apply control invisible to the derivation makes the group lie about safety while the proposal review is open, and the real declaration does not", () => {
    const control = findControl("commandApply");
    const original = control.visible;
    const openFacts = baseFacts({ itemCount: 1, commandProposalOpen: true });
    try {
      control.visible = () => false;
      const group = findGroup("commandInterface");
      // The bug G7 warns about: even with the review genuinely open, the
      // group derives no higher than reversible-write and stays collapsible,
      // because its one fan-out-write control is (falsely) never a visible
      // member.
      expect(groupTier(group, openFacts)).toBe("reversible-write");
      expect(mayCollapse(group, openFacts)).toBe(true);
    } finally {
      control.visible = original;
    }
    const group = findGroup("commandInterface");
    expect(groupTier(group, openFacts)).toBe("fan-out-write");
    expect(mayCollapse(group, openFacts)).toBe(false);
  });

  // Second sabotage, the same shape applied to I5: emptying the
  // consequenceTag must trip the audit regardless of commandProposalOpen,
  // since I5's own maxPossibleTier ignores visibility entirely and looks at
  // every control's DECLARED tier.
  it("sabotage: emptying the group's consequenceTag trips auditGroupModel's I5, and restoring it clears the violation", () => {
    const group = findGroup("commandInterface");
    const original = group.consequenceTag;
    try {
      group.consequenceTag = "";
      const violations = auditGroupModel();
      expect(violations.some((v) => v.startsWith("I5:") && v.includes("commandInterface"))).toBe(true);
    } finally {
      group.consequenceTag = original;
    }
    expect(auditGroupModel()).toEqual([]);
  });
});

// docs/scheduled-publishing-from-modules-acceptance-criteria.md, F6/F7/F10
// (the "Post-design corrections" section is THE FINAL CONTRACT). Mirrors the
// commandInterface describe block immediately above, control for control:
// this group is the same D17/G7 shape (a fan-out write reachable only from
// inside a review modal), so "the group's tier follows automatically from
// declaring fan-out-write" (REGRESSION entry 331 point 5's defect, paid for
// once already at entry 337) is proven here as a theorem over the real
// catalog too, not asserted as a declaration.
describe("scheduledRelease group (docs/scheduled-publishing-from-modules-acceptance-criteria.md, F6/F7/F10)", () => {
  it("has exactly the three contracted controls with their contracted tiers", () => {
    const group = findGroup("scheduledRelease");
    expect(group.controls.map((c) => c.id)).toEqual(["releaseDate", "releaseReview", "releaseCommit"]);
    expect(findControl("releaseDate").tier).toBe("read-only");
    expect(findControl("releaseReview").tier).toBe("read-only");
    expect(findControl("releaseCommit").tier).toBe("fan-out-write");
  });

  it("is visible whenever anything is selected - a module alone, an item alone, or any mix (matches download/askAi/visualizerCoverage/commandInterface)", () => {
    const group = findGroup("scheduledRelease");
    expect(group.visible(baseFacts({ moduleCount: 1, itemCount: 0 }))).toBe(true);
    expect(group.visible(baseFacts({ moduleCount: 0, itemCount: 1 }))).toBe(true);
    expect(group.visible(baseFacts({ moduleCount: 1, itemCount: 3 }))).toBe(true);
    expect(group.visible(baseFacts({ moduleCount: 0, itemCount: 0 }))).toBe(false);
  });

  it("every control declares persistKey: null with a non-empty unpersistedReason (I6)", () => {
    const group = findGroup("scheduledRelease");
    for (const control of group.controls) {
      expect(control.persistKey).toBeNull();
      expect(control.unpersistedReason ?? "").not.toBe("");
    }
  });

  // F7: the earlier, more general AC9 in the same document asked every new
  // textbox/select to persist. F7 explicitly overrides that by citing the
  // neighbour, itemsDueDate - an IDENTICAL datetime-local control already in
  // this bar, also persistKey: null. Pin that releaseDate's own reason
  // actually names that neighbour and the overriding section, not merely
  // that the field happens to be null today.
  it("releaseDate's unpersistedReason cites itemsDueDate as precedent and F7 as the override of this document's own AC9", () => {
    const reason = findControl("releaseDate").unpersistedReason ?? "";
    expect(reason).toMatch(/itemsDueDate/);
    expect(reason).toMatch(/F7/);
  });

  it("THEOREM: groupTier is read-only while releaseReviewOpen is false, and fan-out-write once it is true, at any selection", () => {
    const group = findGroup("scheduledRelease");
    expect(groupTier(group, baseFacts({ itemCount: 1, releaseReviewOpen: false }))).toBe("read-only");
    expect(groupTier(group, baseFacts({ moduleCount: 5, releaseReviewOpen: false }))).toBe("read-only");
    expect(groupTier(group, baseFacts({ itemCount: 1, releaseReviewOpen: true }))).toBe("fan-out-write");
    expect(groupTier(group, baseFacts({ moduleCount: 5, releaseReviewOpen: true }))).toBe("fan-out-write");
  });

  it("THEOREM: mayCollapse is true while the release review is closed and false once it is open", () => {
    const group = findGroup("scheduledRelease");
    expect(mayCollapse(group, baseFacts({ itemCount: 1, releaseReviewOpen: false }))).toBe(true);
    expect(mayCollapse(group, baseFacts({ itemCount: 1, releaseReviewOpen: true }))).toBe(false);
  });

  it("has a non-null, non-empty consequenceTag naming the immediate unpublish (F4/F10) - the most surprising behaviour in the feature", () => {
    const group = findGroup("scheduledRelease");
    expect(group.consequenceTag).not.toBeNull();
    expect((group.consequenceTag ?? "").trim()).not.toBe("");
    expect(group.consequenceTag ?? "").toMatch(/unpublish/i);
    expect(group.consequenceTag ?? "").toMatch(/immediately/i);
  });

  // F6's own tier correction: destructive is reserved for the four writes
  // that already carry a two-click confirm-arm (confirmArming.ts); F6 says
  // to arm this control anyway, but arming and tier are independent
  // decisions, so it must not be declared destructive merely because it is
  // (or should be) armed.
  it("F6: releaseCommit is fan-out-write, not destructive - arming it is a decision independent of its tier", () => {
    expect(findControl("releaseCommit").tier).toBe("fan-out-write");
    expect(findControl("releaseCommit").tier).not.toBe("destructive");
  });

  // SABOTAGE, entry 331 point 5's exact shape, reproduced against this group
  // for the third time (commandInterface's own block above reproduced it for
  // the second). try/finally because findGroup/findControl hand back
  // references into ONE shared module-level array (BULK_BAR_GROUPS) and a
  // mid-test throw would corrupt the catalog for every later test in this
  // run.
  it("SABOTAGE: a commit control invisible to the derivation makes the group lie about safety while the release review is open, and the real declaration does not", () => {
    const control = findControl("releaseCommit");
    const original = control.visible;
    const openFacts = baseFacts({ itemCount: 1, releaseReviewOpen: true });
    try {
      control.visible = () => false;
      const group = findGroup("scheduledRelease");
      // The bug F6 warns about: even with the review genuinely open, the
      // group derives no higher than read-only and stays collapsible,
      // because its one fan-out-write control is (falsely) never a visible
      // member.
      expect(groupTier(group, openFacts)).toBe("read-only");
      expect(mayCollapse(group, openFacts)).toBe(true);
    } finally {
      control.visible = original;
    }
    const group = findGroup("scheduledRelease");
    expect(groupTier(group, openFacts)).toBe("fan-out-write");
    expect(mayCollapse(group, openFacts)).toBe(false);
  });

  // Second sabotage, the same shape applied to I5: emptying the
  // consequenceTag must trip the audit regardless of releaseReviewOpen,
  // since I5's own maxPossibleTier ignores visibility entirely and looks at
  // every control's DECLARED tier.
  it("sabotage: emptying the group's consequenceTag trips auditGroupModel's I5, and restoring it clears the violation", () => {
    const group = findGroup("scheduledRelease");
    const original = group.consequenceTag;
    try {
      group.consequenceTag = "";
      const violations = auditGroupModel();
      expect(violations.some((v) => v.startsWith("I5:") && v.includes("scheduledRelease"))).toBe(true);
    } finally {
      group.consequenceTag = original;
    }
    expect(auditGroupModel()).toEqual([]);
  });
});
