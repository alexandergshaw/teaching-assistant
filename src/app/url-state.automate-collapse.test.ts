// WORKFLOWS-COLLAPSE (docs/workflows-collapse-ia-scope.md). url-state.test.ts
// sits at the 1000-line ceiling, so every collapse migration assertion lives
// in this sibling. W1: Drafts moved from Tools > Workflows to Library > Drafts.
import { describe, expect, it } from "vitest";
import {
  buildUrlSearch,
  normalizeActiveTab,
  normalizeWorkflowsView,
  parseUrlState,
  resolveDraftsLibraryPointer,
  resolveGradingPointer,
  resolveTabDestination,
} from "./url-state";

describe("W1: a legacy Drafts location lands on Library > Drafts (AC-W1-5)", () => {
  it("M-D4: the retired grade-drafts / drafts tab values resolve to Library, Drafts section", () => {
    for (const legacy of ["grade-drafts", "drafts"]) {
      const dest = resolveTabDestination(legacy);
      expect(dest.tab).toBe("files");
      expect(dest.librarySection).toBe("drafts");
      expect(normalizeActiveTab(legacy)).toBe("files");
    }
  });

  it("M-D1: ?tab=manual&toolsSection=workflows&workflowsView=drafts", () => {
    const parsed = parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=drafts");
    expect(parsed.tab).toBe("files");
    expect(parsed.librarySection).toBe("drafts");
  });

  it("M-D3: ?tab=workflows&workflowsView=drafts (overrides the bare ?tab=workflows default)", () => {
    const parsed = parseUrlState("?tab=workflows&workflowsView=drafts");
    expect(parsed.tab).toBe("files");
    expect(parsed.librarySection).toBe("drafts");
  });

  it("writes the canonical Library Drafts URL back (an alias is a redirect)", () => {
    expect(buildUrlSearch(parseUrlState("?tab=workflows&workflowsView=drafts"))).toBe(
      "?tab=files&librarySection=drafts"
    );
    expect(buildUrlSearch(parseUrlState("?tab=files&librarySection=drafts"))).toBe("?tab=files&librarySection=drafts");
  });

  it("a stray workflowsView=drafts on a Courses/Library/Manual-section URL is not a Drafts link", () => {
    expect(parseUrlState("?tab=courses&workflowsView=drafts").tab).toBe("courses");
    expect(parseUrlState("?tab=manual&workflowsView=drafts").tab).toBe("manual");
    expect(parseUrlState("?tab=files&workflowsView=drafts").librarySection).toBe("files");
  });

  it("the other Workflows views stay on the Tools tab", () => {
    const parsed = parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=automations");
    expect(parsed.tab).toBe("manual");
    expect(parsed.workflowsView).toBe("automations");
  });

  it("workflowsView=drafts is no longer a live Workflows view", () => {
    expect(normalizeWorkflowsView("drafts")).toBe("workflows");
  });
});

describe("W1: the Drafts > Grades pointer is matched FIRST (AC-W1-6, M-D5)", () => {
  const GRADES = "?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=grades";

  it("a grades-draft URL resolves to Tools > Grading > Drafted Grades, NOT Library", () => {
    const parsed = parseUrlState(GRADES);
    expect(parsed.tab).toBe("manual");
    expect(parsed.toolsSection).toBe("manual");
    expect(parsed.manualView).toBe("grading");
    expect(parsed.gradingView).toBe("drafts");
    expect(parsed.librarySection).toBe("files");
  });

  it("the bare-tab grades shape also stays on Tools", () => {
    const parsed = parseUrlState("?tab=workflows&workflowsView=drafts&draftsView=grades");
    expect(parsed.tab).toBe("manual");
    expect(parsed.manualView).toBe("grading");
  });

  it("the pointer resolver refuses what the grading pointer claims", () => {
    expect(resolveGradingPointer(null, null, "drafts", "grades")).toBeDefined();
    expect(resolveDraftsLibraryPointer(null, null, "workflows", "manual", "drafts", "grades")).toBe(false);
    // A manualView-keyed grading pointer wins too.
    expect(resolveDraftsLibraryPointer("repo-grades", null, "workflows", "manual", "drafts", null)).toBe(false);
  });

  it("the pointer resolver claims drafts-only, with the section explicit or implied", () => {
    expect(resolveDraftsLibraryPointer(null, null, "workflows", "manual", "drafts", null)).toBe(true);
    expect(resolveDraftsLibraryPointer(null, null, null, "workflows", "drafts", "messages")).toBe(true);
    expect(resolveDraftsLibraryPointer(null, null, "manual", "workflows", "drafts", null)).toBe(false);
  });
});
