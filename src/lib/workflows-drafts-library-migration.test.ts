import { describe, expect, it } from "vitest";
import { isLegacyWorkflowsDrafts } from "./workflows-drafts-library-migration";

describe("isLegacyWorkflowsDrafts (WORKFLOWS-COLLAPSE W1)", () => {
  it("names the retired Tools > Workflows > Drafts home", () => {
    expect(isLegacyWorkflowsDrafts("workflows", "drafts", null)).toBe(true);
    expect(isLegacyWorkflowsDrafts("workflows", "drafts", "messages")).toBe(true);
  });

  it("refuses the Drafts > Grades pointer - the grades pointer owns it (AC-W1-6)", () => {
    expect(isLegacyWorkflowsDrafts("workflows", "drafts", "grades")).toBe(false);
  });

  it("does not fire for any other section or Workflows view", () => {
    expect(isLegacyWorkflowsDrafts("manual", "drafts", null)).toBe(false);
    expect(isLegacyWorkflowsDrafts("workflows", "automations", null)).toBe(false);
    expect(isLegacyWorkflowsDrafts("workflows", null, null)).toBe(false);
    expect(isLegacyWorkflowsDrafts(null, "drafts", null)).toBe(false);
  });
});
