// Tests for command-apply-outcome.ts
// (docs/llm-command-interface-acceptance-criteria.md - section 10 is the
// FINAL CONTRACT; this file's brief is G1, G4, G5, G9, G10, G11, G12, and the
// verification-pass DEFECTs 1/5/6/7/9).
//
// Only the pure module is testable here (section 7: vitest is node-env and
// renders no component) - the outcome constructors, the G10 re-check
// (`reauthorizeCommandProposalRow`), the live item-kind router, the
// page-body HTML helper, and (new, DEFECT 5 / DEFECT 9) the idempotency
// comparison and the cross-file parity check. Every actual Canvas call lives
// in command-interface.ts's "use server" action and cannot be exercised by
// this suite.
//
// Sabotage check #1, performed by hand against the real source file (not
// committed as broken code - restored, and the restore proven with a diff
// against a byte-for-byte backup taken BEFORE the sabotage edit; see this
// file's final report for the exact commands and their output):
//   Temporarily changed `reauthorizeCommandProposalRow`'s decision guard from
//   `row.decision !== "modify" && row.decision !== "create"` to
//   `row.decision !== "modify"` (dropping "create" from the allowed set).
//   This reddened "accepts a well-formed create-module row" (which expects
//   `ok: true`) - the other tests in this file stayed green. Restored from
//   the backup, diffed clean, suite green again.
//
// Sabotage check #2 (DEFECT 9's parity fix), performed the same way: swapped
// the escape order in gradables.ts's `descriptionToHtml` (escaping `<` before
// `&`, so a literal `<` in the input produced double-escaped output). This
// reddened the "actual cross-file parity" `it.each` cases in this file (the
// HTML-escapable-characters and mixed-newlines cases) AND
// gradables.test.ts's own new direct assertions on `descriptionToHtml` -
// proving the parity test actually depends on gradables.ts's real
// implementation rather than only re-testing command-apply-outcome.ts's own
// copy (there is no longer a second copy to independently break). Restored
// from a byte-for-byte backup taken before the edit, diffed clean, both
// suites green again. See this file's final report for the exact commands.
//
// Assertions are on STATUS / DECISION / FIELD VALUES, never on the exact
// wording of a `reason` string, per this project's standing rule against
// source-text tests that pin prose.

import { describe, it, expect } from "vitest";
import {
  reauthorizeCommandProposalRow,
  routeItemKind,
  plainTextToPageHtml,
  normalizeWrittenTextForComparison,
  refusedOutcome,
  notFoundOutcome,
  writeFailedOutcome,
  moduleUpdatedOutcome,
  moduleCreatedOutcome,
  itemUpdatedOutcome,
  alreadyMatchesOutcome,
} from "./command-apply-outcome";
import { descriptionToHtml } from "./canvas-modules/gradables";
import type { CommandProposalRow } from "./command-proposal";

const itemTarget = { kind: "item" as const, id: 101, displayName: "Week 1 Homework", selectionKey: "live:item:101" };
const moduleTarget = { kind: "module" as const, id: 201, displayName: "Module 01", selectionKey: "live:module:201" };

function modifyItemRow(field: string, overrides: Partial<CommandProposalRow> = {}): CommandProposalRow {
  return {
    target: itemTarget,
    field,
    currentValue: "Original description.",
    proposedValue: "New description.",
    decision: "modify",
    reason: null,
    ...overrides,
  };
}

function modifyModuleRow(overrides: Partial<CommandProposalRow> = {}): CommandProposalRow {
  return {
    target: moduleTarget,
    field: "moduleName",
    currentValue: "Module 01",
    proposedValue: "Module One",
    decision: "modify",
    reason: null,
    ...overrides,
  };
}

function createModuleRow(overrides: Partial<CommandProposalRow> = {}): CommandProposalRow {
  return {
    target: null,
    field: "moduleName",
    currentValue: null,
    proposedValue: "Final Project Workshop",
    decision: "create",
    reason: null,
    ...overrides,
  };
}

describe("reauthorizeCommandProposalRow - G10's allowlist re-checked, not re-spelled", () => {
  it("accepts a well-formed modify row on an item's title", () => {
    const result = reauthorizeCommandProposalRow(modifyItemRow("title"));
    expect(result).toEqual({ ok: true, field: "title" });
  });

  it("accepts a well-formed modify row on an item's description", () => {
    const result = reauthorizeCommandProposalRow(modifyItemRow("description"));
    expect(result).toEqual({ ok: true, field: "description" });
  });

  it("accepts a well-formed modify row on a module's moduleName", () => {
    const result = reauthorizeCommandProposalRow(modifyModuleRow());
    expect(result).toEqual({ ok: true, field: "moduleName" });
  });

  it("accepts a well-formed create-module row", () => {
    const result = reauthorizeCommandProposalRow(createModuleRow());
    expect(result).toEqual({ ok: true, field: "moduleName" });
  });

  it("refuses a row whose decision is \"unsupported\"", () => {
    const row = modifyItemRow("points", { decision: "unsupported", target: null, currentValue: null, proposedValue: null, reason: "not allowed" });
    const result = reauthorizeCommandProposalRow(row);
    expect(result.ok).toBe(false);
  });

  it("refuses a row whose decision is \"already-present\"", () => {
    const row = createModuleRow({ decision: "already-present", target: moduleTarget, reason: "already exists" });
    const result = reauthorizeCommandProposalRow(row);
    expect(result.ok).toBe(false);
  });

  it("refuses a modify row with a null target", () => {
    const row = modifyItemRow("title", { target: null });
    const result = reauthorizeCommandProposalRow(row);
    expect(result.ok).toBe(false);
  });

  it("refuses a modify row with a null field", () => {
    const row = modifyItemRow("title", { field: null });
    const result = reauthorizeCommandProposalRow(row);
    expect(result.ok).toBe(false);
  });

  it("refuses a create row that carries an existing target (malformed)", () => {
    const row = createModuleRow({ target: moduleTarget });
    const result = reauthorizeCommandProposalRow(row);
    expect(result.ok).toBe(false);
  });

  it("refuses moduleName tampered onto an item target - field/target-kind mismatch, never trusted from the row alone", () => {
    const row = modifyItemRow("moduleName");
    const result = reauthorizeCommandProposalRow(row);
    expect(result.ok).toBe(false);
  });

  it("refuses title tampered onto a module target - field/target-kind mismatch, never trusted from the row alone", () => {
    const row = modifyModuleRow({ field: "title" });
    const result = reauthorizeCommandProposalRow(row);
    expect(result.ok).toBe(false);
  });

  it("refuses a field outside the allowlist even if the row's own decision claims modify", () => {
    const row = modifyItemRow("dueDate");
    const result = reauthorizeCommandProposalRow(row);
    expect(result.ok).toBe(false);
  });

  it("treats the 'body' alias as the canonical 'description' field, matching command-proposal.ts", () => {
    const result = reauthorizeCommandProposalRow(modifyItemRow("body"));
    expect(result).toEqual({ ok: true, field: "description" });
  });
});

describe("routeItemKind - the two write paths AC3's four kinds split into", () => {
  it("routes Assignment, Quiz, and Discussion to the gradable path", () => {
    expect(routeItemKind("Assignment")).toBe("gradable");
    expect(routeItemKind("Quiz")).toBe("gradable");
    expect(routeItemKind("Discussion")).toBe("gradable");
  });

  it("routes Page to the page path", () => {
    expect(routeItemKind("Page")).toBe("page");
  });

  it("routes every other kind to unsupported", () => {
    expect(routeItemKind("File")).toBe("unsupported");
    expect(routeItemKind("SubHeader")).toBe("unsupported");
    expect(routeItemKind("ExternalUrl")).toBe("unsupported");
    expect(routeItemKind("ExternalTool")).toBe("unsupported");
  });
});

describe("plainTextToPageHtml - G5's plain-text-to-HTML parity with gradables.ts's own conversion", () => {
  it("escapes HTML-special characters", () => {
    expect(plainTextToPageHtml("A < B & C > D")).toBe("A &lt; B &amp; C &gt; D");
  });

  it("converts newlines to <br> tags", () => {
    expect(plainTextToPageHtml("Line one\nLine two")).toBe("Line one<br>\nLine two");
  });

  it("passes text that already looks like HTML through unchanged", () => {
    const html = "<p>Already HTML</p>";
    expect(plainTextToPageHtml(html)).toBe(html);
  });

  it("returns whitespace-only text unchanged", () => {
    expect(plainTextToPageHtml("   ")).toBe("   ");
  });

  // DEFECT 9 FIX: plainTextToPageHtml now DELEGATES to gradables.ts's own
  // exported descriptionToHtml (see gradables.ts's own header) rather than
  // restating a second, independently-maintained copy - before this fix the
  // two were byte-identical but nothing enforced that staying true, and G13
  // requires the proposal preview to show the exact bytes that will be sent.
  // These cases import BOTH functions and assert they produce IDENTICAL
  // output, so a future edit to one copy without the other would redden this
  // suite immediately - not merely re-test whichever copy happened to change.
  describe("actual cross-file parity with gradables.ts's descriptionToHtml (not just a re-test of the local copy)", () => {
    const cases: Array<[string, string]> = [
      ["plain text with no special characters", "Read chapter 3 before class."],
      ["HTML-escapable characters", "Grades: A < B & C > D, \"quoted\" and 'apostrophe'"],
      ["a single LF newline", "Line one\nLine two\nLine three"],
      ["a CRLF newline", "Line one\r\nLine two\r\nLine three"],
      ["a bare CR newline", "Line one\rLine two"],
      ["text that already contains a tag", "<p>Already HTML</p>"],
      ["text that contains a tag mid-string", "Some plain text <b>then bold</b> then plain again"],
      ["whitespace-only text", "   "],
      ["empty text", ""],
      ["mixed newlines and escapable characters", "A & B\r\nC < D\nE > F"],
    ];

    it.each(cases)("matches for: %s", (_label, input) => {
      expect(plainTextToPageHtml(input)).toBe(descriptionToHtml(input));
    });
  });
});

describe("normalizeWrittenTextForComparison - DEFECT 5 / G4's idempotency comparison", () => {
  it("converts <br> tags to newlines rather than dropping the line break", () => {
    expect(normalizeWrittenTextForComparison("Line one<br>\nLine two")).toBe("Line one\nLine two");
    expect(normalizeWrittenTextForComparison("Line one<br/>Line two")).toBe("Line one\nLine two");
  });

  it("strips remaining HTML tags", () => {
    expect(normalizeWrittenTextForComparison("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("decodes the entities this app's own escaping and Canvas's re-serialization introduce", () => {
    expect(normalizeWrittenTextForComparison("A &lt; B &amp; C &gt; D")).toBe("A < B & C > D");
    expect(normalizeWrittenTextForComparison("&quot;quoted&quot; &amp; &#39;apostrophe&#39;")).toBe("\"quoted\" & 'apostrophe'");
    expect(normalizeWrittenTextForComparison("A&nbsp;B")).toBe("A B");
  });

  it("collapses runs of horizontal whitespace and trims each line and the whole string", () => {
    expect(normalizeWrittenTextForComparison("  Hello   world  \n  Second   line  ")).toBe("Hello world\nSecond line");
  });

  it("normalizes CRLF to LF", () => {
    expect(normalizeWrittenTextForComparison("Line one\r\nLine two")).toBe("Line one\nLine two");
  });

  it("treats a plain-text value and its own descriptionToHtml conversion as equivalent (the write-vs-read-back case G4 exists for)", () => {
    const plain = "Read chapter 3 before class.\nBring your laptop.";
    expect(normalizeWrittenTextForComparison(plainTextToPageHtml(plain))).toBe(normalizeWrittenTextForComparison(plain));
  });

  it("still reports a genuine content change as different", () => {
    expect(normalizeWrittenTextForComparison("Read chapter 3.")).not.toBe(normalizeWrittenTextForComparison("Read chapter 4."));
  });
});

describe("outcome constructors", () => {
  it("refusedOutcome carries the row's target/field and a null target for a create row", () => {
    const outcome = refusedOutcome(createModuleRow(), "no good");
    expect(outcome).toEqual({ targetKind: null, targetId: null, field: "moduleName", status: "refused", reason: "no good" });
  });

  it("notFoundOutcome carries the row's item target", () => {
    const outcome = notFoundOutcome(modifyItemRow("title"), "gone");
    expect(outcome).toEqual({ targetKind: "item", targetId: 101, field: "title", status: "not-found", reason: "gone" });
  });

  it("writeFailedOutcome carries the row's module target", () => {
    const outcome = writeFailedOutcome(modifyModuleRow(), "canvas rejected it");
    expect(outcome).toEqual({ targetKind: "module", targetId: 201, field: "moduleName", status: "write-failed", reason: "canvas rejected it" });
  });

  it("moduleUpdatedOutcome carries no extra fields beyond the base", () => {
    const outcome = moduleUpdatedOutcome(modifyModuleRow());
    expect(outcome).toEqual({ targetKind: "module", targetId: 201, field: "moduleName", status: "module-updated" });
  });

  it("moduleCreatedOutcome carries the newly created module's id and name", () => {
    const outcome = moduleCreatedOutcome(createModuleRow(), 999, "Final Project Workshop");
    expect(outcome).toEqual({
      targetKind: null,
      targetId: null,
      field: "moduleName",
      status: "module-created",
      newModuleId: 999,
      newModuleName: "Final Project Workshop",
    });
  });

  it("itemUpdatedOutcome carries the live item type and a non-null pre-image for a gradable kind (G1)", () => {
    const outcome = itemUpdatedOutcome(modifyItemRow("description"), "Assignment", "Original description.");
    expect(outcome).toEqual({
      targetKind: "item",
      targetId: 101,
      field: "description",
      status: "item-updated",
      itemType: "Assignment",
      preImage: "Original description.",
    });
  });

  it("itemUpdatedOutcome carries a null pre-image for a Page (Canvas's own revision history is the undo path)", () => {
    const outcome = itemUpdatedOutcome(modifyItemRow("title"), "Page", null);
    expect(outcome.status).toBe("item-updated");
    expect((outcome as { preImage: string | null }).preImage).toBeNull();
  });

  // DEFECT 5 / G4: the distinct "already matches, nothing written" outcome -
  // must never be confused with "item-updated"/"module-updated" (which imply
  // a write happened) or "write-failed" (which implies Canvas rejected
  // something).
  it("alreadyMatchesOutcome carries the row's target/field, the given itemType, and status \"already-matches\"", () => {
    const outcome = alreadyMatchesOutcome(modifyItemRow("description"), "Assignment");
    expect(outcome.status).toBe("already-matches");
    expect(outcome).toMatchObject({ targetKind: "item", targetId: 101, field: "description", status: "already-matches", itemType: "Assignment" });
    expect((outcome as { reason: string }).reason.length).toBeGreaterThan(0);
  });

  it("alreadyMatchesOutcome for a module row uses \"Module\" as itemType and carries the module target", () => {
    const outcome = alreadyMatchesOutcome(modifyModuleRow(), "Module");
    expect(outcome).toMatchObject({ targetKind: "module", targetId: 201, field: "moduleName", status: "already-matches", itemType: "Module" });
  });

  it("alreadyMatchesOutcome accepts a caller-supplied reason instead of the default", () => {
    const outcome = alreadyMatchesOutcome(modifyItemRow("title"), "Page", "custom reason");
    expect((outcome as { reason: string }).reason).toBe("custom reason");
  });
});
