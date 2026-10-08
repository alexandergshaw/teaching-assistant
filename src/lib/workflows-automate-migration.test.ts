import { describe, expect, it } from "vitest";
import { isLegacyWorkflowsSection, legacyAutomateView } from "./workflows-automate-migration";

describe("isLegacyWorkflowsSection (WORKFLOWS-COLLAPSE W2)", () => {
  it("names the retired Workflows section by an explicit section or the retired tab value", () => {
    expect(isLegacyWorkflowsSection("manual", "workflows")).toBe(true);
    expect(isLegacyWorkflowsSection(null, "workflows")).toBe(true);
    expect(isLegacyWorkflowsSection("workflows", null)).toBe(true);
    expect(isLegacyWorkflowsSection("workflows", "garbage")).toBe(true);
  });

  it("an explicit manual section overrides the retired tab value", () => {
    expect(isLegacyWorkflowsSection("workflows", "manual")).toBe(false);
  });

  it("does not fire for any other location", () => {
    expect(isLegacyWorkflowsSection("manual", null)).toBe(false);
    expect(isLegacyWorkflowsSection("courses", "manual")).toBe(false);
    expect(isLegacyWorkflowsSection(null, null)).toBe(false);
  });
});

describe("legacyAutomateView (WORKFLOWS-COLLAPSE W2)", () => {
  it("maps the old Workflows views to their Automate sub-views", () => {
    expect(legacyAutomateView(true, "workflows", null)).toBe("workflows");
    expect(legacyAutomateView(true, "automations", null)).toBe("automations");
  });

  it("a missing or unrecognised view means the section's old default (workflows)", () => {
    expect(legacyAutomateView(true, null, null)).toBe("workflows");
    expect(legacyAutomateView(true, "garbage", null)).toBe("workflows");
  });

  it("refuses the Drafts locations - the Library / grades pointers own them", () => {
    expect(legacyAutomateView(true, "drafts", null)).toBeNull();
    expect(legacyAutomateView(true, "drafts", "messages")).toBeNull();
    expect(legacyAutomateView(true, "drafts", "grades")).toBeNull();
  });

  it("a stale draftsView of grades beside a Workflows view still migrates (only workflowsView=drafts is refused)", () => {
    expect(legacyAutomateView(true, "workflows", "grades")).toBe("workflows");
    expect(legacyAutomateView(true, "automations", "grades")).toBe("automations");
    expect(legacyAutomateView(true, "drafts", "grades")).toBeNull();
    expect(legacyAutomateView(true, "drafts", "messages")).toBeNull();
  });

  it("is null outside the retired section", () => {
    expect(legacyAutomateView(false, "automations", null)).toBeNull();
  });
});
