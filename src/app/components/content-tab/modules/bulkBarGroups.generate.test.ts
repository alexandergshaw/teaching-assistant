// The "generate group" describe block - extracted from ./bulkBarGroups.test.ts
// to keep that file under this repo's 1000-line ceiling, the test-file
// mirror of bulkBarGroupCatalog.ts's own split into
// bulkBarGroupCatalog.generate.ts. Node-env, no component ever rendered
// (vitest.config.ts:13-14), same as every other test file in this pair - see
// ./bulkBarGroups.test.ts's own header for the full contract this suite pins.
//
// findGroup/findControl/baseFacts are DUPLICATED below rather than imported
// from ./bulkBarGroups.test.ts, which already declares them - the opposite of
// the first instinct, and deliberate, not an oversight. vitest.config.ts:13
// matches every "*.test.ts" file as its own spec entry, and this suite's
// default isolation gives EACH matched spec file a fresh module registry;
// importing one spec file's module from another does not share that
// registry's already-executed describe() calls, it RE-EXECUTES the imported
// file's entire top-level body - describe() calls included - inside the
// importing file's own run. Proved in place before this fix: importing these
// three from ./bulkBarGroups.test.ts doubled every test that file declares
// (111 tests in that file alone became 210 across the pair, not the correct
// 111), because that file's own ~99 describe blocks registered twice - once
// under its own run, once again as a side effect of this file importing it.
// That is a duplicated TEST SUITE, not a duplicated fixture, and strictly
// worse than the drift risk a copied baseFacts carries.
//
// The copied baseFacts is guarded the same way the original is: its return
// type is the real BulkBarFacts, so TypeScript's excess/missing property
// checking (the original's own comment) fails this file's own build the
// moment BulkBarFacts gains or loses a field here without the same edit
// landing in ./bulkBarGroups.test.ts's copy - not perfect protection against
// two copies disagreeing on a DEFAULT value, but a real compile-time forcing
// function against the shape drifting silently. findGroup/findControl are
// three-line lookups with no state and no defaults to drift; the real
// duplication risk this repo has already paid for once (a fixture using
// `kind` where the code reads `kindId`) lives in baseFacts's field values,
// not in these two functions.

import { describe, expect, it } from "vitest";
import { auditGroupModel, BULK_BAR_GROUPS, groupTier, mayCollapse, type BulkBarControlDef, type BulkBarFacts, type BulkBarGroupDef } from "./bulkBarGroups";

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
 * than silently defaulting somewhere a test never notices. Kept identical to
 * ./bulkBarGroups.test.ts's own copy - see this file's header for why it is
 * a copy rather than an import. */
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
