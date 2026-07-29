import { describe, it, expect } from "vitest";
import {
  resolveWorkflowPanelDisclosures,
  describeAutomationSummary,
} from "./workflow-panel-migration";

describe("resolveWorkflowPanelDisclosures", () => {
  it("opens Steps only for a legacy build panel", () => {
    expect(resolveWorkflowPanelDisclosures("build")).toEqual({
      stepsOpen: true,
      automationOpen: false,
    });
  });

  it("opens Schedule & trigger only for a legacy automate panel", () => {
    expect(resolveWorkflowPanelDisclosures("automate")).toEqual({
      stepsOpen: false,
      automationOpen: true,
    });
  });

  it("opens neither disclosure for a legacy run panel", () => {
    expect(resolveWorkflowPanelDisclosures("run")).toEqual({
      stepsOpen: false,
      automationOpen: false,
    });
  });

  it("opens neither disclosure when nothing was ever persisted", () => {
    expect(resolveWorkflowPanelDisclosures(null)).toEqual({
      stepsOpen: false,
      automationOpen: false,
    });
  });

  it("opens neither disclosure for an unrecognized stored value", () => {
    expect(resolveWorkflowPanelDisclosures("garbage")).toEqual({
      stepsOpen: false,
      automationOpen: false,
    });
    expect(resolveWorkflowPanelDisclosures("")).toEqual({
      stepsOpen: false,
      automationOpen: false,
    });
  });
});

describe("describeAutomationSummary", () => {
  it("reports nothing configured", () => {
    expect(describeAutomationSummary(0, 0)).toBe("Not scheduled");
  });

  it("singularizes a single schedule", () => {
    expect(describeAutomationSummary(1, 0)).toBe("1 schedule");
  });

  it("pluralizes multiple schedules", () => {
    expect(describeAutomationSummary(2, 0)).toBe("2 schedules");
  });

  it("singularizes a single trigger", () => {
    expect(describeAutomationSummary(0, 1)).toBe("1 trigger");
  });

  it("pluralizes multiple triggers", () => {
    expect(describeAutomationSummary(0, 3)).toBe("3 triggers");
  });

  it("combines schedules and triggers", () => {
    expect(describeAutomationSummary(2, 1)).toBe("2 schedules, 1 trigger");
  });
});
