import { describe, it, expect } from "vitest";
import {
  groupWorkflows,
  groupWorkflowsWithFolders,
  parseFolderState,
  serializeFolderState,
  emptyFolderState,
  assignFolder,
  moveFolder,
  renameFolder,
  removeFolder,
  folderNames,
} from "./workflow-grouping";
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

describe("workflow folders (Group E)", () => {
  const wfs = [
    { id: "a", name: "Alpha", preset: true, category: "grading" },
    { id: "b", name: "Beta", preset: true, category: "grading" },
    { id: "c", name: "Gamma", preset: false },
  ] as unknown as Parameters<typeof groupWorkflowsWithFolders>[0];

  describe("parseFolderState", () => {
    it("falls back to empty on missing or malformed input", () => {
      for (const raw of [null, "", "not json", JSON.stringify([1, 2]), JSON.stringify("x")]) {
        expect(parseFolderState(raw)).toEqual(emptyFolderState());
      }
    });

    it("drops non-string and blank folder names", () => {
      const state = parseFolderState(
        JSON.stringify({ assignments: { a: "Term 1", b: "  ", c: 42 }, order: ["Term 1", "", 7] })
      );
      expect(state.assignments).toEqual({ a: "Term 1" });
      expect(state.order).toEqual(["Term 1"]);
    });

    it("round-trips through serializeFolderState", () => {
      const state = { assignments: { a: "X" }, order: ["X"] };
      expect(parseFolderState(serializeFolderState(state))).toEqual(state);
    });
  });

  describe("assignFolder", () => {
    it("files and unfiles a workflow", () => {
      const filed = assignFolder(emptyFolderState(), "a", "Term 1");
      expect(filed.assignments).toEqual({ a: "Term 1" });
      // A blank name means "unfile", not a folder with an empty name.
      expect(assignFolder(filed, "a", "   ").assignments).toEqual({});
    });

    it("never mutates the state it was given", () => {
      const base = emptyFolderState();
      assignFolder(base, "a", "X");
      expect(base.assignments).toEqual({});
    });
  });

  describe("folderNames", () => {
    it("lists ordered folders first, then unordered ones alphabetically", () => {
      const state = { assignments: { a: "Zed", b: "Alpha", c: "Mid" }, order: ["Mid"] };
      expect(folderNames(state)).toEqual(["Mid", "Alpha", "Zed"]);
    });

    it("drops folders that no longer have any workflow in them", () => {
      const state = { assignments: { a: "Kept" }, order: ["Gone", "Kept"] };
      expect(folderNames(state)).toEqual(["Kept"]);
    });
  });

  describe("moveFolder", () => {
    const state = { assignments: { a: "One", b: "Two", c: "Three" }, order: ["One", "Two", "Three"] };

    it("moves a folder up and down", () => {
      expect(folderNames(moveFolder(state, "Two", "up"))).toEqual(["Two", "One", "Three"]);
      expect(folderNames(moveFolder(state, "Two", "down"))).toEqual(["One", "Three", "Two"]);
    });

    it("is a no-op at either edge and for an unknown folder", () => {
      expect(folderNames(moveFolder(state, "One", "up"))).toEqual(["One", "Two", "Three"]);
      expect(folderNames(moveFolder(state, "Three", "down"))).toEqual(["One", "Two", "Three"]);
      expect(moveFolder(state, "Nope", "up")).toBe(state);
    });
  });

  describe("groupWorkflowsWithFolders", () => {
    it("puts folders first, in the user's order", () => {
      const state = { assignments: { a: "Second", c: "First" }, order: ["First", "Second"] };
      const groups = groupWorkflowsWithFolders(wfs, [], "", state);
      expect(groups[0].title).toBe("First");
      expect(groups[1].title).toBe("Second");
    });

    // A workflow listed both in its folder and in its category would look like
    // two different workflows with the same name.
    it("shows a filed workflow in its folder ONLY", () => {
      const state = { assignments: { a: "Mine" }, order: [] };
      const groups = groupWorkflowsWithFolders(wfs, [], "", state);
      const appearances = groups.flatMap((g) => g.workflows).filter((w) => w.id === "a");
      expect(appearances).toHaveLength(1);
      expect(groups.find((g) => g.workflows.some((w) => w.id === "a"))!.title).toBe("Mine");
    });

    it("leaves unfiled workflows in their built-in groups", () => {
      const groups = groupWorkflowsWithFolders(wfs, [], "", emptyFolderState());
      expect(groups.map((g) => g.title)).toEqual(["Custom", "Grading"]);
    });

    it("search still flattens, ignoring folders", () => {
      const state = { assignments: { a: "Mine" }, order: [] };
      const groups = groupWorkflowsWithFolders(wfs, [], "alpha", state);
      expect(groups).toHaveLength(1);
      expect(groups[0].title).toBe("");
      expect(groups[0].workflows.map((w) => w.id)).toEqual(["a"]);
    });
  });
});

describe("folder rename and delete", () => {
  const state = { assignments: { a: "One", b: "One", c: "Two" }, order: ["One", "Two"] };

  describe("renameFolder", () => {
    it("moves every workflow filed under the old name", () => {
      const next = renameFolder(state, "One", "Renamed");
      expect(next.assignments).toEqual({ a: "Renamed", b: "Renamed", c: "Two" });
    });

    it("preserves the folder's position in the order", () => {
      expect(folderNames(renameFolder(state, "One", "Renamed"))).toEqual(["Renamed", "Two"]);
    });

    // Renaming onto an existing folder is a merge, not an error - and the
    // order must not end up listing the surviving folder twice.
    it("merges when renamed onto an existing folder", () => {
      const next = renameFolder(state, "One", "Two");
      expect(next.assignments).toEqual({ a: "Two", b: "Two", c: "Two" });
      expect(next.order).toEqual(["Two"]);
      expect(folderNames(next)).toEqual(["Two"]);
    });

    it("is a no-op for a blank or unchanged name", () => {
      expect(renameFolder(state, "One", "   ")).toBe(state);
      expect(renameFolder(state, "One", "One")).toBe(state);
    });

    it("never mutates the state it was given", () => {
      renameFolder(state, "One", "Renamed");
      expect(state.assignments.a).toBe("One");
    });
  });

  describe("removeFolder", () => {
    // A folder is only an organizing layer, so deleting one must never take
    // the workflows inside it with it.
    it("unfiles its workflows rather than deleting them", () => {
      const next = removeFolder(state, "One");
      expect(next.assignments).toEqual({ c: "Two" });
      expect(folderNames(next)).toEqual(["Two"]);
    });

    it("returns those workflows to their built-in groups", () => {
      const wfs = [
        { id: "a", name: "Alpha", preset: true, category: "grading" },
        { id: "c", name: "Gamma", preset: false },
      ] as unknown as Parameters<typeof groupWorkflowsWithFolders>[0];
      const filed = { assignments: { a: "One" }, order: ["One"] };
      const after = removeFolder(filed, "One");
      const groups = groupWorkflowsWithFolders(wfs, [], "", after);
      expect(groups.map((g) => g.title)).toEqual(["Custom", "Grading"]);
      expect(groups.flatMap((g) => g.workflows).map((w) => w.id).sort()).toEqual(["a", "c"]);
    });

    it("is harmless for a folder that does not exist", () => {
      expect(removeFolder(state, "Nope").assignments).toEqual(state.assignments);
    });

    it("never mutates the state it was given", () => {
      removeFolder(state, "One");
      expect(state.assignments.a).toBe("One");
    });
  });
});
