import { describe, it, expect } from "vitest";
import {
  parseOverviewOpen,
  serializeOverviewOpen,
  parseOverviewHistoryOpen,
  serializeOverviewHistoryOpen,
  parseOverviewQuestion,
  serializeOverviewQuestion,
  renderOverviewMarkdown,
  citationPageExists,
  describeOmittedPages,
  describeBudgetOmittedPages,
  describeHardCappedPages,
  describeSkippedAttachments,
  describeStaleness,
} from "./knowledge-overview-storage";

// vitest here runs environment "node" (vitest.config.ts) - no DOM, so
// `window`/`localStorage` do not exist in the test process. Every function
// below that would touch them (readOverviewOpen/writeOverviewOpen etc.) is
// therefore untestable glue, exactly like knowledge-helpers.ts's own
// readSelectedPageId/writeExpandedIds pair - this file tests only the pure
// parse/serialize half, passing the raw localStorage string as a plain
// argument, the same split knowledge-helpers.test.ts uses for
// parseSelectedPageId/parseExpandedIds.

describe("knowledge-overview-storage: persisted UI state (AC8) - pure parse/serialize", () => {
  it("parseOverviewOpen defaults to true for an unseen scope, missing key, or corrupt JSON", () => {
    expect(parseOverviewOpen(null, "__root__")).toBe(true);
    expect(parseOverviewOpen("{not json", "__root__")).toBe(true);
    expect(parseOverviewOpen("[]", "__root__")).toBe(true); // valid JSON, wrong shape (array not object)
    expect(parseOverviewOpen(JSON.stringify({ "other-scope": false }), "__root__")).toBe(true);
  });

  it("parseOverviewHistoryOpen defaults to false for an unseen scope", () => {
    expect(parseOverviewHistoryOpen(null, "__root__")).toBe(false);
    expect(parseOverviewHistoryOpen("{not json", "__root__")).toBe(false);
  });

  it("parseOverviewQuestion defaults to empty string for an unseen scope", () => {
    expect(parseOverviewQuestion(null, "__root__")).toBe("");
    expect(parseOverviewQuestion("{not json", "__root__")).toBe("");
  });

  it("serializeOverviewOpen round-trips through parseOverviewOpen for the written scope only", () => {
    const raw = serializeOverviewOpen(null, "__root__", false);
    expect(parseOverviewOpen(raw, "__root__")).toBe(false);
    // A different, never-written scope still reads the plain default - the
    // write above must not flip the default for every scope.
    expect(parseOverviewOpen(raw, "page-1")).toBe(true);
  });

  it("serializeOverviewOpen preserves an unrelated scope already stored in raw", () => {
    const first = serializeOverviewOpen(null, "page-1", true);
    const second = serializeOverviewOpen(first, "page-2", false);
    expect(parseOverviewOpen(second, "page-1")).toBe(true);
    expect(parseOverviewOpen(second, "page-2")).toBe(false);
  });

  it("serializeOverviewHistoryOpen round-trips independently of the open key's own storage shape", () => {
    const raw = serializeOverviewHistoryOpen(null, "page-1", true);
    expect(parseOverviewHistoryOpen(raw, "page-1")).toBe(true);
    expect(parseOverviewHistoryOpen(raw, "page-2")).toBe(false);
  });

  it("serializeOverviewQuestion round-trips a draft for one scope", () => {
    const raw = serializeOverviewQuestion(null, "page-1", "How much PTO do I get?");
    expect(parseOverviewQuestion(raw, "page-1")).toBe("How much PTO do I get?");
    expect(parseOverviewQuestion(raw, "page-2")).toBe("");
  });

  it("serializeOverviewQuestion clears the stored entry for an empty question rather than storing one", () => {
    const withDraft = serializeOverviewQuestion(null, "page-1", "draft");
    expect(parseOverviewQuestion(withDraft, "page-1")).toBe("draft");
    const cleared = serializeOverviewQuestion(withDraft, "page-1", "");
    expect(parseOverviewQuestion(cleared, "page-1")).toBe("");
    // The cleared write must not have wiped a SIBLING scope's own draft.
    const withTwoDrafts = serializeOverviewQuestion(withDraft, "page-2", "second draft");
    const clearedFirstOnly = serializeOverviewQuestion(withTwoDrafts, "page-1", "");
    expect(parseOverviewQuestion(clearedFirstOnly, "page-2")).toBe("second draft");
  });
});

describe("knowledge-overview-storage: renderOverviewMarkdown (X1)", () => {
  // The two attack strings CORRECTIONS.md's X1 names verbatim, verified by
  // execution against markdown.ts before it was hardened (commit 094ef65).
  // This module calls markdownToHtml directly with no intermediate step, so
  // pinning these two cases here pins the exact path
  // KnowledgeOverviewPanel/KnowledgeOverviewHistory use for the summary, the
  // current answer, and every history entry's answer.

  it("never turns a javascript: link target into a clickable href", () => {
    const html = renderOverviewMarkdown("[click](javascript:alert%281%29)");
    expect(html.toLowerCase()).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    // Content is preserved as plain text, never silently dropped.
    expect(html).toContain("click");
  });

  it("never lets a quote in a link target break out of the href attribute", () => {
    const html = renderOverviewMarkdown('[click](" autofocus onfocus="alert(1)  x)');
    expect(html).not.toContain("onfocus=");
    expect(html).not.toContain("autofocus");
    expect(html).not.toContain("<a ");
  });

  it("still renders an allowlisted link, bold, and an ordered list (the markdown-lite regression X1 exists to avoid)", () => {
    const html = renderOverviewMarkdown(
      "**Attendance**\n\n1. Sign in by 9am\n2. Notify the office if late\n\n[the handbook](https://example.edu/handbook)"
    );
    expect(html).toContain("<strong>Attendance</strong>");
    expect(html).toContain("<ol>");
    expect(html).toContain('<a href="https://example.edu/handbook">');
  });
});

describe("knowledge-overview-storage: citationPageExists", () => {
  it("resolves against the full page list, not a narrower scope list", () => {
    const allPages = [{ id: "a" }, { id: "b" }];
    expect(citationPageExists("a", allPages)).toBe(true);
    expect(citationPageExists("missing", allPages)).toBe(false);
  });
});

describe("knowledge-overview-storage: describeOmittedPages (the live, mechanism-neutral notice)", () => {
  it("is null when nothing was omitted", () => {
    expect(describeOmittedPages([])).toBeNull();
  });

  it("names the omitted pages without asserting why, and pluralizes correctly", () => {
    expect(describeOmittedPages(["Late policy"])).toBe("1 page in this scope was not part of this: Late policy.");
    expect(describeOmittedPages(["Late policy", "PTO"])).toBe(
      "2 pages in this scope were not part of this: Late policy, PTO."
    );
  });
});

describe("knowledge-overview-storage: omission copy (AC9, X8, X14) - not currently wired to a live call site, see the module comment", () => {
  it("describeBudgetOmittedPages is null when nothing was omitted", () => {
    expect(describeBudgetOmittedPages([])).toBeNull();
  });

  it("describeBudgetOmittedPages names the omitted pages and pluralizes correctly", () => {
    expect(describeBudgetOmittedPages(["Late policy"])).toBe(
      "1 page left out to stay within the context budget: Late policy."
    );
    expect(describeBudgetOmittedPages(["Late policy", "PTO"])).toBe(
      "2 pages left out to stay within the context budget: Late policy, PTO."
    );
  });

  it("describeHardCappedPages uses distinct wording from describeBudgetOmittedPages (X8)", () => {
    const hardCapped = describeHardCappedPages(["Extra policy"]);
    const budgetOmitted = describeBudgetOmittedPages(["Extra policy"]);
    expect(hardCapped).not.toBe(budgetOmitted);
    expect(hardCapped).toBe(
      "1 page in this scope was not looked at at all - this scope has more pages than a single request can check: Extra policy."
    );
  });

  it("describeSkippedAttachments states attachments are dropped first on overflow (X14)", () => {
    expect(describeSkippedAttachments(0)).toBeNull();
    expect(describeSkippedAttachments(1)).toBe(
      "1 attachment left out to stay within the context budget - page text is always sent first, so an attachment is the first thing dropped on overflow."
    );
    expect(describeSkippedAttachments(3)).toContain("3 attachments");
  });
});

describe("knowledge-overview-storage: describeStaleness (AC3/X4)", () => {
  it("is null when not stale", () => {
    expect(describeStaleness({ stale: false, changedTitles: [], addedTitles: [], removedTitles: [] })).toBeNull();
  });

  it("names an edited page", () => {
    expect(
      describeStaleness({ stale: true, changedTitles: ["Attendance"], addedTitles: [], removedTitles: [] })
    ).toBe("Out of date since generation - edited: Attendance.");
  });

  it("catches a delete-only staleness case (the case a reviewer assumes is covered and is not - C2)", () => {
    const note = describeStaleness({ stale: true, changedTitles: [], addedTitles: [], removedTitles: ["Old policy"] });
    expect(note).toBe("Out of date since generation - removed: Old policy.");
  });

  it("combines multiple reasons in one sentence", () => {
    const note = describeStaleness({
      stale: true,
      changedTitles: ["Attendance"],
      addedTitles: ["New rule"],
      removedTitles: ["Old policy"],
    });
    expect(note).toBe("Out of date since generation - edited: Attendance; added: New rule; removed: Old policy.");
  });
});
