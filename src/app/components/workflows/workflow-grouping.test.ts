import { describe, it, expect } from "vitest";
import { groupWorkflows } from "./workflow-grouping";
import type { WorkflowDef } from "@/lib/workflows/types";

const mockWorkflows: WorkflowDef[] = [
  {
    id: "w1",
    preset: true,
    category: "grading",
    name: "Grade Submissions",
    description: "Grade student work",
    steps: [],
  },
  {
    id: "w2",
    preset: true,
    category: "course-setup",
    name: "Course Kickoff",
    description: "Set up a course",
    steps: [],
  },
  {
    id: "w3",
    preset: true,
    category: "content",
    name: "Prepare Lecture",
    description: "Create lecture materials",
    steps: [],
  },
  {
    id: "w4",
    preset: true,
    category: "communication",
    name: "Draft Announcement",
    description: "Send announcements",
    steps: [],
  },
  {
    id: "w5",
    preset: false,
    name: "My Custom Workflow",
    description: "Custom workflow",
    steps: [],
  },
  {
    id: "w6",
    preset: false,
    name: "Another Custom",
    description: "Another custom",
    steps: [],
  },
  {
    id: "w7",
    preset: true,
    category: "grading",
    name: "Review Grades",
    description: "Review graded work",
    steps: [],
  },
];

describe("groupWorkflows", () => {
  it("groups presets by category and custom workflows", () => {
    const result = groupWorkflows(mockWorkflows, [], "");
    expect(result).toHaveLength(5); // Custom + 4 categories
    expect(result[0].title).toBe("Custom");
    expect(result[0].workflows).toHaveLength(2);
    expect(result[1].title).toBe("Grading");
    expect(result[1].workflows).toHaveLength(2);
    expect(result[2].title).toBe("Course setup");
    expect(result[2].workflows).toHaveLength(1);
    expect(result[3].title).toBe("Content & lectures");
    expect(result[3].workflows).toHaveLength(1);
    expect(result[4].title).toBe("Communication & briefings");
    expect(result[4].workflows).toHaveLength(1);
  });

  it("includes Recent group when recentIds provided", () => {
    const result = groupWorkflows(mockWorkflows, ["w1", "w3"], "");
    expect(result[0].title).toBe("Recent");
    expect(result[0].workflows).toHaveLength(2);
    expect(result[0].workflows.map((w) => w.id)).toEqual(["w1", "w3"]);
  });

  it("deduplicates recent workflows", () => {
    const result = groupWorkflows(mockWorkflows, ["w1", "w1", "w3"], "");
    expect(result[0].title).toBe("Recent");
    expect(result[0].workflows).toHaveLength(2);
  });

  it("skips unresolvable recent ids", () => {
    const result = groupWorkflows(mockWorkflows, ["w1", "nonexistent", "w3"], "");
    expect(result[0].title).toBe("Recent");
    expect(result[0].workflows).toHaveLength(2);
    expect(result[0].workflows.map((w) => w.id)).toEqual(["w1", "w3"]);
  });

  it("caps recent workflows at 5", () => {
    const result = groupWorkflows(
      mockWorkflows,
      ["w1", "w2", "w3", "w4", "w5", "w6", "w7"],
      ""
    );
    expect(result[0].title).toBe("Recent");
    expect(result[0].workflows).toHaveLength(5);
  });

  it("omits Recent group when no recent ids", () => {
    const result = groupWorkflows(mockWorkflows, [], "");
    expect(result[0].title).toBe("Custom");
  });

  it("omits Custom group when no custom workflows", () => {
    const presetsOnly = mockWorkflows.filter((w) => w.preset);
    const result = groupWorkflows(presetsOnly, [], "");
    expect(result.every((g) => g.title !== "Custom")).toBe(true);
  });

  it("omits category group when no workflows in category", () => {
    const noContent = mockWorkflows.filter((w) => w.category !== "content");
    const result = groupWorkflows(noContent, [], "");
    expect(result.every((g) => g.title !== "Content & lectures")).toBe(true);
  });

  it("returns flat filtered list on search", () => {
    const result = groupWorkflows(mockWorkflows, [], "grade");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("");
    expect(result[0].workflows).toHaveLength(2);
    expect(result[0].workflows.map((w) => w.id)).toEqual(["w1", "w7"]);
  });

  it("search filters by name", () => {
    const result = groupWorkflows(mockWorkflows, [], "lecture");
    expect(result[0].workflows).toHaveLength(1);
    expect(result[0].workflows[0].id).toBe("w3");
  });

  it("search filters by description", () => {
    const result = groupWorkflows(mockWorkflows, [], "announcements");
    expect(result[0].workflows).toHaveLength(1);
    expect(result[0].workflows[0].id).toBe("w4");
  });

  it("search is case-insensitive", () => {
    const result = groupWorkflows(mockWorkflows, [], "CUSTOM");
    expect(result[0].workflows.map((w) => w.id)).toEqual(["w5", "w6"]);
  });

  it("returns empty array when search has no matches", () => {
    const result = groupWorkflows(mockWorkflows, [], "nonexistent");
    expect(result).toHaveLength(0);
  });

  it("ignores whitespace-only search", () => {
    const result = groupWorkflows(mockWorkflows, ["w1"], "   ");
    expect(result[0].title).toBe("Recent");
  });
});
