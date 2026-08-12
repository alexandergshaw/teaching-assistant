import { describe, expect, it } from "vitest";
import type { CartridgeModule } from "@/lib/cartridge-import-shared";
import { exportAssignmentOptions, findExportAssignment } from "./export-assignments";

describe("exportAssignmentOptions", () => {
  it("groups by module, preserving module order and item order within a module", () => {
    const modules: CartridgeModule[] = [
      {
        name: "Module 02",
        position: 2,
        items: [
          { title: "Second module, first item", type: "Assignment", body: "b1" },
          { title: "Second module, second item", type: "Assignment", body: "b2" },
        ],
      },
      {
        name: "Module 01",
        position: 1,
        items: [{ title: "First module, only item", type: "Assignment", body: "b3" }],
      },
    ];
    const result = exportAssignmentOptions(modules);
    // exportAssignmentOptions walks `modules` in the order given - it does
    // not re-sort by `position` (that is parseModuleMetaWithRefs's job,
    // already done before this function ever sees the array) - so this
    // proves array order, and item order within a module, is preserved
    // exactly as passed in.
    expect(result.map((o) => [o.moduleTitle, o.itemTitle])).toEqual([
      ["Module 02", "Second module, first item"],
      ["Module 02", "Second module, second item"],
      ["Module 01", "First module, only item"],
    ]);
  });

  it("excludes non-assignment items", () => {
    const modules: CartridgeModule[] = [
      {
        name: "Module 01",
        position: 1,
        items: [
          { title: "A page", type: "WikiPage" },
          { title: "An attachment", type: "Attachment" },
          { title: "An untyped generic-cartridge item", type: "" },
          { title: "A real assignment", type: "Assignment", body: "Do the thing." },
        ],
      },
    ];
    const result = exportAssignmentOptions(modules);
    expect(result).toHaveLength(1);
    expect(result[0].itemTitle).toBe("A real assignment");
  });

  it("assigns unique keys across modules with identically-titled items", () => {
    const modules: CartridgeModule[] = [
      { name: "Module A", position: 1, items: [{ title: "Assignment 1", type: "Assignment" }] },
      { name: "Module B", position: 2, items: [{ title: "Assignment 1", type: "Assignment" }] },
    ];
    const result = exportAssignmentOptions(modules);
    expect(result).toHaveLength(2);
    expect(result[0].key).not.toBe(result[1].key);
    expect(new Set(result.map((o) => o.key)).size).toBe(2);
  });

  it("hasBody is false and body is null when body is missing entirely", () => {
    const modules: CartridgeModule[] = [
      { name: "Module 01", position: 1, items: [{ title: "No body", type: "Assignment" }] },
    ];
    const result = exportAssignmentOptions(modules);
    expect(result[0].hasBody).toBe(false);
    expect(result[0].body).toBeNull();
  });

  it("hasBody is false and body is null when body is whitespace only", () => {
    const modules: CartridgeModule[] = [
      { name: "Module 01", position: 1, items: [{ title: "Blank body", type: "Assignment", body: "   \n\t  " }] },
    ];
    const result = exportAssignmentOptions(modules);
    expect(result[0].hasBody).toBe(false);
    expect(result[0].body).toBeNull();
  });

  it("hasBody is true and body is populated for a real, non-blank body", () => {
    const modules: CartridgeModule[] = [
      {
        name: "Module 01",
        position: 1,
        items: [{ title: "Real body", type: "Assignment", body: "Submit a link to your repo." }],
      },
    ];
    const result = exportAssignmentOptions(modules);
    expect(result[0].hasBody).toBe(true);
    expect(result[0].body).toBe("Submit a link to your repo.");
  });

  it("never falls back body to the item title", () => {
    const modules: CartridgeModule[] = [
      { name: "Module 01", position: 1, items: [{ title: "Week 8 Assignment", type: "Assignment" }] },
    ];
    const result = exportAssignmentOptions(modules);
    expect(result[0].body).not.toBe("Week 8 Assignment");
    expect(result[0].body).toBeNull();
  });

  it("returns an empty array for modules with no assignment items at all", () => {
    const modules: CartridgeModule[] = [
      { name: "Module 01", position: 1, items: [{ title: "A page", type: "WikiPage" }] },
    ];
    expect(exportAssignmentOptions(modules)).toEqual([]);
  });
});

describe("findExportAssignment", () => {
  const modules: CartridgeModule[] = [
    { name: "Module 01", position: 1, items: [{ title: "Assignment 1", type: "Assignment", body: "Body 1" }] },
  ];

  it("finds the option matching the given key", () => {
    const options = exportAssignmentOptions(modules);
    const found = findExportAssignment(options, options[0].key);
    expect(found).toBe(options[0]);
  });

  it("returns null for a key that matches nothing", () => {
    const options = exportAssignmentOptions(modules);
    expect(findExportAssignment(options, "not-a-real-key")).toBeNull();
  });
});
