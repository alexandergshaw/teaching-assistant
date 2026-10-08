// WORKFLOWS-COLLAPSE (docs/workflows-collapse-ia-scope.md). url-state.test.ts
// sits at the 1000-line ceiling, so every collapse migration assertion lives
// in this sibling. W1: Drafts moved from Tools > Workflows to Library > Drafts.
// W2: Workflows and Automations moved into the Automate container
// (manualView="artifact-design", inner nav automateView); workflowsView retired
// by ALIAS - the raw param is still read, never written.
import { describe, expect, it } from "vitest";
import {
  buildUrlSearch,
  normalizeActiveTab,
  normalizeAutomateView,
  parseUrlState,
  resolveAutomatePointer,
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

  it("the other Workflows views stay on the Tools tab (now inside Automate)", () => {
    const parsed = parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=automations");
    expect(parsed.tab).toBe("manual");
    expect(parsed.manualView).toBe("artifact-design");
    expect(parsed.automateView).toBe("automations");
  });

  it("workflowsView=drafts is not an Automate link (the Library pointer owns it)", () => {
    expect(resolveAutomatePointer(null, null, "workflows", "manual", "drafts", null)).toBeUndefined();
  });

  it("a stale draftsView=grades beside workflowsView=workflows still migrates to Automate, not grading", () => {
    const parsed = parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=workflows&draftsView=grades");
    expect(parsed.manualView).toBe("artifact-design");
    expect(parsed.automateView).toBe("workflows");
    expect(resolveGradingPointer(null, null, "workflows", "grades")).toBeUndefined();
    expect(resolveAutomatePointer(null, null, "workflows", "manual", "automations", "grades")).toBe("automations");
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

// WORKFLOWS-COLLAPSE W2. Each case names the raw value a returning user can
// carry and the home it must land on (the migration register, scope section 6).
describe("W2: the Automate container (AC-W2-3, AC-W2-4, AC-W2-6)", () => {
  it("M-A1: a bare ?manualView=artifact-design lands on Automate > Templates (behaviour-preserving default)", () => {
    const parsed = parseUrlState("?tab=manual&manualView=artifact-design");
    expect(parsed.manualView).toBe("artifact-design");
    expect(parsed.automateView).toBe("templates");
    expect(buildUrlSearch(parsed)).toBe("?tab=manual&manualView=artifact-design");
  });

  it("an explicit automateView param is honoured and round-trips", () => {
    for (const view of ["workflows", "automations"] as const) {
      const url = `?tab=manual&manualView=artifact-design&automateView=${view}`;
      const parsed = parseUrlState(url);
      expect(parsed.automateView).toBe(view);
      expect(buildUrlSearch(parsed)).toBe(url);
    }
  });

  it("M-W1: ?toolsSection=workflows&workflowsView=workflows -> Automate > Workflows, toolsSection forced manual", () => {
    const parsed = parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=workflows");
    expect(parsed.toolsSection).toBe("manual");
    expect(parsed.manualView).toBe("artifact-design");
    expect(parsed.automateView).toBe("workflows");
  });

  it("M-W2: ?toolsSection=workflows&workflowsView=automations -> Automate > Automations", () => {
    const parsed = parseUrlState("?tab=manual&toolsSection=workflows&workflowsView=automations");
    expect(parsed.toolsSection).toBe("manual");
    expect(parsed.manualView).toBe("artifact-design");
    expect(parsed.automateView).toBe("automations");
  });

  it("an explicit toolsSection=workflows with no workflowsView means the section's old default (Workflows)", () => {
    const parsed = parseUrlState("?tab=manual&toolsSection=workflows");
    expect(parsed.manualView).toBe("artifact-design");
    expect(parsed.automateView).toBe("workflows");
  });

  it("M-T1: the bare retired ?tab=workflows -> Automate > Workflows; with workflowsView=automations -> Automations", () => {
    const bare = parseUrlState("?tab=workflows");
    expect(bare.tab).toBe("manual");
    expect(bare.manualView).toBe("artifact-design");
    expect(bare.automateView).toBe("workflows");
    expect(parseUrlState("?tab=workflows&workflowsView=automations").automateView).toBe("automations");
  });

  it("an explicit toolsSection=manual overrides the retired ?tab=workflows (the param the user wrote wins)", () => {
    const parsed = parseUrlState("?tab=workflows&toolsSection=manual");
    expect(parsed.manualView).toBe("course-planning");
    expect(parsed.automateView).toBe("templates");
  });

  it("writes the canonical Automate URL back (an alias is a redirect) and never emits workflowsView or toolsSection", () => {
    for (const legacy of [
      "?tab=workflows",
      "?tab=workflows&workflowsView=automations",
      "?tab=manual&toolsSection=workflows&workflowsView=automations",
    ]) {
      const canonical = buildUrlSearch(parseUrlState(legacy));
      expect(canonical).toMatch(/^\?tab=manual&manualView=artifact-design(&automateView=\w+)?$/);
      expect(canonical).not.toContain("workflowsView");
      expect(canonical).not.toContain("toolsSection");
      expect(buildUrlSearch(parseUrlState(canonical))).toBe(canonical);
    }
  });

  it("a stray workflowsView outside the retired Workflows section is not an Automate link", () => {
    expect(parseUrlState("?tab=manual&workflowsView=automations").manualView).toBe("course-planning");
    expect(parseUrlState("?tab=courses&toolsSection=workflows&workflowsView=automations").tab).toBe("courses");
    expect(parseUrlState("?tab=files&toolsSection=workflows&workflowsView=automations").manualView).toBe(
      "course-planning"
    );
  });

  it("toolsSection is never emitted and normalizeAutomateView falls back to Templates", () => {
    expect(buildUrlSearch(parseUrlState("?tab=manual&toolsSection=workflows"))).not.toContain("toolsSection");
    expect(normalizeAutomateView("drafts")).toBe("templates");
    expect(normalizeAutomateView(null)).toBe("templates");
    expect(normalizeAutomateView("automations")).toBe("automations");
  });
});

describe("W2: the grades and Library pointers still win over the Automate pointer (AC-W1-6 survives)", () => {
  it("a Drafts > Grades URL still resolves to Grading > Drafted Grades, not Automate", () => {
    for (const url of [
      "?tab=manual&toolsSection=workflows&workflowsView=drafts&draftsView=grades",
      "?tab=workflows&workflowsView=drafts&draftsView=grades",
    ]) {
      const parsed = parseUrlState(url);
      expect(parsed.tab).toBe("manual");
      expect(parsed.manualView).toBe("grading");
      expect(parsed.gradingView).toBe("drafts");
      expect(parsed.automateView).toBe("templates");
    }
  });

  it("a Drafts URL still resolves to Library > Drafts, not Automate", () => {
    const parsed = parseUrlState("?tab=workflows&workflowsView=drafts");
    expect(parsed.tab).toBe("files");
    expect(parsed.librarySection).toBe("drafts");
    expect(parsed.manualView).toBe("course-planning");
  });

  it("resolveAutomatePointer refuses what the grading pointer claims, including a manualView-keyed one", () => {
    expect(resolveGradingPointer(null, null, "drafts", "grades")).toBeDefined();
    expect(resolveAutomatePointer(null, null, "workflows", "manual", "drafts", "grades")).toBeUndefined();
    expect(resolveAutomatePointer("repo-grades", null, "workflows", "manual", "automations", null)).toBeUndefined();
  });

  it("resolveAutomatePointer claims the Workflows / Automations locations, section explicit or implied", () => {
    expect(resolveAutomatePointer(null, null, "workflows", "manual", "automations", null)).toBe("automations");
    expect(resolveAutomatePointer(null, null, null, "workflows", null, null)).toBe("workflows");
    expect(resolveAutomatePointer(null, null, "manual", "workflows", "automations", null)).toBeUndefined();
    expect(resolveAutomatePointer(null, null, null, "manual", "automations", null)).toBeUndefined();
  });
});
