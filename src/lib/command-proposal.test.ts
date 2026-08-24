// Tests for command-proposal.ts
// (docs/llm-command-interface-acceptance-criteria.md - section 10 is the
// FINAL CONTRACT; this file's brief is G8, G9, G10, G11, G14).
//
// Sabotage checks performed by hand against the real source file (not
// committed as broken code - restored, and the restore proven with a diff
// against a byte-for-byte backup taken BEFORE the sabotage edit; see the
// final report for the exact commands and their output):
//   1. G10 allowlist: temporarily changed `canonicalizeField` to also accept
//      "points" (mapped it onto the "title" canonical value) - reddened TWO
//      tests: 'rejects a row asking to change "points", naming the field'
//      (the row was classified "modify" with `field: "title"` instead of
//      "unsupported" with `field: "points"`) and "is case- and
//      whitespace-insensitive on the field name without widening the allowed
//      set" (its "POINTS" row also came back "modify"). The other tests in
//      this file stayed green. Restored from the backup, diffed clean, suite
//      green again.
//   2. DEFECT 2 fix (command-write-support.ts's commandCanWriteItemKind):
//      temporarily reverted the import and the guard in classifyModifyRow
//      back to the old `isCarryWriteSupportedKind` (module-pattern-plan.ts) -
//      reddened the two DEFECT 2 tests below ('refuses a SubHeader item ...'
//      and 'refuses a File item WITH linked content ...'), both of which now
//      classified "modify" instead of "unsupported" because that predicate
//      answers "can carry-forward CREATE this kind", not "can the command
//      interface write this kind". Every other test in this file, including
//      the paired positive ("accepts an Assignment"), stayed green - proving
//      the guard change is what those two tests catch, not a broader
//      classification bug. Restored from the backup, diffed clean, suite
//      green again. See the final report for the exact commands and output.
//
// Every assertion below is on DECISION, FIELD NAME, and ROW MEMBERSHIP -
// never on the exact wording of a `reason` string, per this project's
// standing rule against source-text tests that pin prose.

import { describe, it, expect } from "vitest";
import {
  classifyCommandProposalRows,
  buildCommandProposal,
  reconcileCommandProposalWithSelection,
  type CommandProposalContext,
  type RawCommandProposalRow,
} from "./command-proposal";

function emptyContext(): CommandProposalContext {
  return { modules: [], items: [] };
}

const assignmentItem = {
  id: 101,
  itemType: "Assignment",
  contentId: 501,
  isNewQuiz: null,
  title: "Week 1 Homework",
  description: "Original description.",
  selectionKey: "live:item:101",
};

const externalUrlItem = {
  id: 102,
  itemType: "ExternalUrl",
  contentId: null,
  isNewQuiz: null,
  title: "Course Syllabus Link",
  description: null,
  selectionKey: "live:item:102",
};

const fileItemNoContent = {
  id: 103,
  itemType: "File",
  contentId: null,
  isNewQuiz: null,
  title: "Handout",
  description: null,
  selectionKey: "live:item:103",
};

// DEFECT 2 fixtures: both of these were misclassified "modify" by the old
// `isCarryWriteSupportedKind` guard, because that predicate answers "can
// carry-forward CREATE this kind", not "can the command interface WRITE this
// kind" - see command-write-support.ts's header for the incident.
const subHeaderItem = {
  id: 104,
  itemType: "SubHeader",
  contentId: null,
  isNewQuiz: null,
  title: "Week 1",
  description: null,
  selectionKey: "live:item:104",
};

const fileItemWithContent = {
  id: 105,
  itemType: "File",
  contentId: 601,
  isNewQuiz: null,
  title: "Syllabus.pdf",
  description: null,
  selectionKey: "live:item:105",
};

const moduleOne = { id: 201, name: "Module 01", selectionKey: "live:module:201" };

describe("classifyCommandProposalRows - G10 allowlist over the model's structured output", () => {
  const forbiddenFields = ["points", "dueDate", "submissionType", "rubric", "published"];

  for (const forbidden of forbiddenFields) {
    it(`rejects a row asking to change "${forbidden}", naming the field`, () => {
      const rawRows: RawCommandProposalRow[] = [
        { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: forbidden, proposedValue: "anything" },
      ];
      const context: CommandProposalContext = { modules: [], items: [assignmentItem] };
      const rows = classifyCommandProposalRows(rawRows, context);

      expect(rows).toHaveLength(1);
      expect(rows[0].decision).toBe("unsupported");
      expect(rows[0].field).toBe(forbidden);
      expect(rows[0].reason).not.toBeNull();
      expect(rows[0].reason as string).toContain(forbidden);
    });
  }

  // DEFECT 3: a field-rejected row used to null out the target even when
  // `context` could resolve it (`unsupportedRow(null, ...)` at the old
  // call site), so AC3b's own example - "make Week 1 Homework worth 20
  // points" - rendered a row headed "(new module)" instead of naming the
  // assignment it actually targeted. The row must carry the resolved target
  // AND keep the raw field name verbatim.
  it("DEFECT 3: a field-rejected row carries the RESOLVED target through, and still names the raw field verbatim", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "points", proposedValue: "20" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [assignmentItem] });

    expect(rows[0].decision).toBe("unsupported");
    expect(rows[0].field).toBe("points");
    expect(rows[0].target).not.toBeNull();
    expect(rows[0].target?.id).toBe(assignmentItem.id);
    expect(rows[0].target?.kind).toBe("item");
  });

  it("accepts the three allowed fields (title, description, moduleName) as modify rows", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "title", proposedValue: "New Title" },
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "description", proposedValue: "New body" },
      { kind: "modify", targetKind: "module", targetId: moduleOne.id, field: "moduleName", proposedValue: "Module One" },
    ];
    const context: CommandProposalContext = { modules: [moduleOne], items: [assignmentItem] };
    const rows = classifyCommandProposalRows(rawRows, context);

    expect(rows.map((r) => r.decision)).toEqual(["modify", "modify", "modify"]);
    expect(rows.map((r) => r.field)).toEqual(["title", "description", "moduleName"]);
  });

  it("treats the 'body' alias as the canonical 'description' field", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "body", proposedValue: "New body" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [assignmentItem] });
    expect(rows[0].decision).toBe("modify");
    expect(rows[0].field).toBe("description");
  });

  it("is case- and whitespace-insensitive on the field name without widening the allowed set", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "  Title  ", proposedValue: "x" },
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "POINTS", proposedValue: "x" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [assignmentItem] });
    expect(rows[0].decision).toBe("modify");
    expect(rows[1].decision).toBe("unsupported");
  });

  it("rejects a field that is only valid for the OTHER target kind (moduleName on an item, title on a module)", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "moduleName", proposedValue: "x" },
      { kind: "modify", targetKind: "module", targetId: moduleOne.id, field: "title", proposedValue: "x" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [moduleOne], items: [assignmentItem] });
    expect(rows[0].decision).toBe("unsupported");
    expect(rows[1].decision).toBe("unsupported");
  });
});

describe("classifyCommandProposalRows - G11 item-kind guard", () => {
  it("refuses a kind this app cannot write (ExternalUrl), naming the reason via command-write-support.ts", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: externalUrlItem.id, field: "title", proposedValue: "New" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [externalUrlItem] });
    expect(rows[0].decision).toBe("unsupported");
    expect(rows[0].reason).not.toBeNull();
    expect(rows[0].reason as string).toContain("external link");
  });

  it("refuses a File item with no linked content (contentId null)", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: fileItemNoContent.id, field: "title", proposedValue: "New" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [fileItemNoContent] });
    expect(rows[0].decision).toBe("unsupported");
  });

  it("accepts an Assignment (a supported kind)", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "title", proposedValue: "New" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [assignmentItem] });
    expect(rows[0].decision).toBe("modify");
  });

  // DEFECT 2: the classifier used to guard item kinds with
  // `isCarryWriteSupportedKind`, which answers "can carry-forward CREATE this
  // kind" rather than "can the command interface WRITE this kind" - so a
  // SubHeader and a File with a contentId both classified "modify" and were
  // only refused at write time. These two are paired against the Assignment
  // positive above so the fix cannot pass by rejecting everything.

  it("DEFECT 2: refuses a SubHeader item (has no title/description this app can write), naming a reason", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: subHeaderItem.id, field: "title", proposedValue: "New" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [subHeaderItem] });
    expect(rows[0].decision).toBe("unsupported");
    expect(rows[0].reason).not.toBeNull();
    expect(rows[0].reason as string).toContain("text header");
  });

  it("DEFECT 2: refuses a File item WITH linked content (contentId non-null), naming a reason", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: fileItemWithContent.id, field: "description", proposedValue: "New" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [fileItemWithContent] });
    expect(rows[0].decision).toBe("unsupported");
    expect(rows[0].reason).not.toBeNull();
    expect(rows[0].reason as string).toContain("file's contents");
  });
});

describe("classifyCommandProposalRows - G8 module-creation dedupe", () => {
  it("marks a create-module row 'create' when no existing module matches", () => {
    const rawRows: RawCommandProposalRow[] = [{ kind: "create-module", moduleName: "Ethics in AI" }];
    const rows = classifyCommandProposalRows(rawRows, { modules: [moduleOne], items: [] });
    expect(rows[0].decision).toBe("create");
    expect(rows[0].target).toBeNull();
    expect(rows[0].proposedValue).toBe("Ethics in AI");
  });

  it("marks a create-module row 'already-present' on an exact-case match", () => {
    const rawRows: RawCommandProposalRow[] = [{ kind: "create-module", moduleName: "Module 01" }];
    const rows = classifyCommandProposalRows(rawRows, { modules: [moduleOne], items: [] });
    expect(rows[0].decision).toBe("already-present");
    expect(rows[0].target?.id).toBe(moduleOne.id);
  });

  it("matches case- and trim-insensitively, exactly like steps.lms-modules.ts / bulk-module-plan.ts", () => {
    const rawRows: RawCommandProposalRow[] = [{ kind: "create-module", moduleName: "  module 01  " }];
    const rows = classifyCommandProposalRows(rawRows, { modules: [moduleOne], items: [] });
    expect(rows[0].decision).toBe("already-present");
  });

  it("rejects a create-module row with an empty/whitespace-only name", () => {
    const rawRows: RawCommandProposalRow[] = [{ kind: "create-module", moduleName: "   " }];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [] });
    expect(rows[0].decision).toBe("unsupported");
  });

  it("does not treat two different new module names as colliding with each other", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "create-module", moduleName: "Ethics in AI" },
      { kind: "create-module", moduleName: "Final Project Workshop" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [] });
    expect(rows.map((r) => r.decision)).toEqual(["create", "create"]);
  });

  // DEFECT 4a: `byNormalizedName` used to be built from `context.modules`
  // ONLY and never gained entries for names created earlier in the same
  // classification pass, so a model emitting "Ethics in AI" twice in one
  // batch produced two "create" rows - and, on apply, two real Canvas
  // modules. Exactly one row may end up "create"; the duplicate must be
  // classified as something that cannot itself create a module.
  it("DEFECT 4a: two identical create-module names in ONE batch produce exactly one creating row", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "create-module", moduleName: "Ethics in AI" },
      { kind: "create-module", moduleName: "Ethics in AI" },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [] });

    const creating = rows.filter((r) => r.decision === "create");
    expect(creating).toHaveLength(1);
    expect(rows[0].decision).toBe("create");
    expect(rows[1].decision).not.toBe("create");
  });

  it("DEFECT 4a: the duplicate-in-batch name is caught even with different casing/whitespace", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "create-module", moduleName: "Ethics in AI" },
      { kind: "create-module", moduleName: "  ethics IN ai  " },
    ];
    const rows = classifyCommandProposalRows(rawRows, { modules: [], items: [] });

    expect(rows.filter((r) => r.decision === "create")).toHaveLength(1);
  });
});

describe("classifyCommandProposalRows - unresolvable targets", () => {
  it("marks a row unsupported when the targeted item id is not in the selection context", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: 9999, field: "title", proposedValue: "x" },
    ];
    const rows = classifyCommandProposalRows(rawRows, emptyContext());
    expect(rows[0].decision).toBe("unsupported");
    expect(rows[0].target).toBeNull();
  });

  it("marks a row unsupported when the targeted module id is not in the selection context", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "module", targetId: 9999, field: "moduleName", proposedValue: "x" },
    ];
    const rows = classifyCommandProposalRows(rawRows, emptyContext());
    expect(rows[0].decision).toBe("unsupported");
  });
});

describe("buildCommandProposal / reconcileCommandProposalWithSelection - G14 stale selection", () => {
  it("pins the proposal to the selection signature it was generated against", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "title", proposedValue: "New" },
    ];
    const proposal = buildCommandProposal(rawRows, { modules: [], items: [assignmentItem] }, [assignmentItem.selectionKey]);
    expect(proposal.selectionSignature).toBe(assignmentItem.selectionKey);
  });

  it("keeps every row applicable when the current selection's signature is unchanged", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "title", proposedValue: "New" },
    ];
    const proposal = buildCommandProposal(rawRows, { modules: [], items: [assignmentItem] }, [assignmentItem.selectionKey]);
    const result = reconcileCommandProposalWithSelection(proposal, [assignmentItem.selectionKey]);
    expect(result.selectionChanged).toBe(false);
    expect(result.applicableRows).toHaveLength(1);
    expect(result.droppedRows).toHaveLength(0);
  });

  it("drops a row whose target left the selection, and keeps rows whose target is still present", () => {
    const secondItem = { ...assignmentItem, id: 999, selectionKey: "live:item:999", title: "Week 2 Homework" };
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "title", proposedValue: "A" },
      { kind: "modify", targetKind: "item", targetId: secondItem.id, field: "title", proposedValue: "B" },
    ];
    const context: CommandProposalContext = { modules: [], items: [assignmentItem, secondItem] };
    const proposal = buildCommandProposal(rawRows, context, [assignmentItem.selectionKey, secondItem.selectionKey]);

    // The instructor deselected the second item before applying.
    const result = reconcileCommandProposalWithSelection(proposal, [assignmentItem.selectionKey]);

    expect(result.selectionChanged).toBe(true);
    expect(result.applicableRows).toHaveLength(1);
    expect(result.applicableRows[0].target?.id).toBe(assignmentItem.id);
    expect(result.droppedRows).toHaveLength(1);
    expect(result.droppedRows[0].target?.id).toBe(secondItem.id);
  });

  it("never drops a create-module row on selection drift - it references nothing in the selection", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "title", proposedValue: "A" },
      { kind: "create-module", moduleName: "Ethics in AI" },
    ];
    const context: CommandProposalContext = { modules: [], items: [assignmentItem] };
    const proposal = buildCommandProposal(rawRows, context, [assignmentItem.selectionKey]);

    // Selection now empty - the item row should drop, the create-module row
    // should not.
    const result = reconcileCommandProposalWithSelection(proposal, []);

    expect(result.selectionChanged).toBe(true);
    expect(result.droppedRows).toHaveLength(1);
    expect(result.droppedRows[0].target?.id).toBe(assignmentItem.id);
    expect(result.applicableRows).toHaveLength(1);
    expect(result.applicableRows[0].decision).toBe("create");
  });

  it("is order-independent, matching confirmArming.ts's selectionSignature contract", () => {
    const rawRows: RawCommandProposalRow[] = [
      { kind: "modify", targetKind: "item", targetId: assignmentItem.id, field: "title", proposedValue: "A" },
    ];
    const secondKey = "live:module:201";
    const proposal = buildCommandProposal(rawRows, { modules: [], items: [assignmentItem] }, [assignmentItem.selectionKey, secondKey]);
    const result = reconcileCommandProposalWithSelection(proposal, [secondKey, assignmentItem.selectionKey]);
    expect(result.selectionChanged).toBe(false);
  });
});
