// Frozen-literal tests for bulk-module-plan.ts. Every expected value below is
// hand-written against the spec in that file's own comments (the padding
// rule, the idempotency match rule, the validation messages) - never derived
// by calling the function under test and asserting on its own output, which
// would let a bug in the implementation silently become "the spec".
import { describe, it, expect } from "vitest";
import {
  BULK_MODULE_TOKEN,
  MAX_BULK_MODULE_COUNT,
  expandModuleNameTemplate,
  planBulkModuleCreation,
} from "./bulk-module-plan";

describe("BULK_MODULE_TOKEN", () => {
  it("is the literal {x} token, distinct from the existing {n} token used elsewhere in the Modules view", () => {
    expect(BULK_MODULE_TOKEN).toBe("{x}");
  });
});

describe("expandModuleNameTemplate", () => {
  it("pads a single-digit n to two digits", () => {
    expect(expandModuleNameTemplate("Module {x}", 1)).toBe("Module 01");
  });

  it("pads 9 to two digits (still single digit, still padded)", () => {
    expect(expandModuleNameTemplate("Module {x}", 9)).toBe("Module 09");
  });

  it("leaves a two-digit n unpadded further", () => {
    expect(expandModuleNameTemplate("Module {x}", 10)).toBe("Module 10");
  });

  it("does not truncate a three-digit n - padStart only ever adds digits, never removes them", () => {
    expect(expandModuleNameTemplate("Module {x}", 100)).toBe("Module 100");
  });

  it("expands every occurrence of {x} in a template that uses it more than once", () => {
    expect(expandModuleNameTemplate("{x}-{x}", 3)).toBe("03-03");
  });

  it("matches the token case-insensitively", () => {
    expect(expandModuleNameTemplate("Module {X}", 5)).toBe("Module 05");
  });

  it("appends the padded number when the template has no token at all, rather than repeating the bare template N times", () => {
    expect(expandModuleNameTemplate("Module", 5)).toBe("Module 05");
  });

  it("appends to a multi-word token-less template too", () => {
    expect(expandModuleNameTemplate("Course Unit", 7)).toBe("Course Unit 07");
  });

  it("a template that is only the token expands to just the padded number", () => {
    expect(expandModuleNameTemplate("{x}", 7)).toBe("07");
  });

  it("trims surrounding whitespace on a token-less template before appending, so no doubled space appears", () => {
    expect(expandModuleNameTemplate("Module  ", 3)).toBe("Module 03");
  });
});

describe("planBulkModuleCreation", () => {
  it("all-new: every entry is marked create when none of the names exist yet", () => {
    const plan = planBulkModuleCreation([], 3, "Module {x}", 1);
    expect(plan.error).toBeNull();
    expect(plan.entries).toEqual([
      { n: 1, name: "Module 01", action: "create" },
      { n: 2, name: "Module 02", action: "create" },
      { n: 3, name: "Module 03", action: "create" },
    ]);
    expect(plan.createCount).toBe(3);
    expect(plan.skipCount).toBe(0);
  });

  it("all-already-present: a re-run against a fully-created batch creates nothing (the headline idempotency case)", () => {
    const existing = [
      { id: 101, name: "Module 01" },
      { id: 102, name: "Module 02" },
      { id: 103, name: "Module 03" },
    ];
    const plan = planBulkModuleCreation(existing, 3, "Module {x}", 1);
    expect(plan.error).toBeNull();
    expect(plan.entries).toEqual([
      { n: 1, name: "Module 01", action: "already-present", existingId: 101 },
      { n: 2, name: "Module 02", action: "already-present", existingId: 102 },
      { n: 3, name: "Module 03", action: "already-present", existingId: 103 },
    ]);
    expect(plan.createCount).toBe(0);
    expect(plan.skipCount).toBe(3);
  });

  it("a mix: some names already exist, some do not", () => {
    const existing = [
      { id: 201, name: "Module 01" },
      { id: 203, name: "Module 03" },
    ];
    const plan = planBulkModuleCreation(existing, 4, "Module {x}", 1);
    expect(plan.entries).toEqual([
      { n: 1, name: "Module 01", action: "already-present", existingId: 201 },
      { n: 2, name: "Module 02", action: "create" },
      { n: 3, name: "Module 03", action: "already-present", existingId: 203 },
      { n: 4, name: "Module 04", action: "create" },
    ]);
    expect(plan.createCount).toBe(2);
    expect(plan.skipCount).toBe(2);
  });

  it("matches existing names case-insensitively", () => {
    const existing = [{ id: 301, name: "MODULE 01" }];
    const plan = planBulkModuleCreation(existing, 1, "Module {x}", 1);
    expect(plan.entries).toEqual([
      { n: 1, name: "Module 01", action: "already-present", existingId: 301 },
    ]);
  });

  it("matches existing names whitespace-insensitively (leading/trailing whitespace ignored)", () => {
    const existing = [{ id: 302, name: "  Module 01  " }];
    const plan = planBulkModuleCreation(existing, 1, "Module {x}", 1);
    expect(plan.entries).toEqual([
      { n: 1, name: "Module 01", action: "already-present", existingId: 302 },
    ]);
  });

  it("offsets numbering by startAt: the first created entry is numbered startAt, not 1", () => {
    const plan = planBulkModuleCreation([], 3, "Module {x}", 5);
    expect(plan.entries).toEqual([
      { n: 5, name: "Module 05", action: "create" },
      { n: 6, name: "Module 06", action: "create" },
      { n: 7, name: "Module 07", action: "create" },
    ]);
  });

  it("startAt can push numbering past two digits, exercising the same no-truncation padding rule", () => {
    const plan = planBulkModuleCreation([], 2, "Module {x}", 99);
    expect(plan.entries).toEqual([
      { n: 99, name: "Module 99", action: "create" },
      { n: 100, name: "Module 100", action: "create" },
    ]);
  });

  it("rejects a blank template", () => {
    const plan = planBulkModuleCreation([], 3, "   ", 1);
    expect(plan.error).toBe("Enter a name template.");
    expect(plan.entries).toEqual([]);
    expect(plan.createCount).toBe(0);
    expect(plan.skipCount).toBe(0);
  });

  it("rejects a zero count", () => {
    const plan = planBulkModuleCreation([], 0, "Module {x}", 1);
    expect(plan.error).toBe("Enter a positive whole number of modules to create.");
  });

  it("rejects a negative count", () => {
    const plan = planBulkModuleCreation([], -2, "Module {x}", 1);
    expect(plan.error).toBe("Enter a positive whole number of modules to create.");
  });

  it("rejects a non-integer count", () => {
    const plan = planBulkModuleCreation([], 2.5, "Module {x}", 1);
    expect(plan.error).toBe("Enter a positive whole number of modules to create.");
  });

  it("rejects a count over the cap", () => {
    const plan = planBulkModuleCreation([], MAX_BULK_MODULE_COUNT + 1, "Module {x}", 1);
    expect(plan.error).toBe(`Cannot create more than ${MAX_BULK_MODULE_COUNT} modules at once.`);
  });

  it("accepts a count exactly at the cap", () => {
    const plan = planBulkModuleCreation([], MAX_BULK_MODULE_COUNT, "Module {x}", 1);
    expect(plan.error).toBeNull();
    expect(plan.createCount).toBe(MAX_BULK_MODULE_COUNT);
  });

  it("rejects a zero startAt", () => {
    const plan = planBulkModuleCreation([], 2, "Module {x}", 0);
    expect(plan.error).toBe("Enter a positive whole starting number.");
  });

  it("rejects a negative startAt", () => {
    const plan = planBulkModuleCreation([], 2, "Module {x}", -1);
    expect(plan.error).toBe("Enter a positive whole starting number.");
  });

  it("rejects a non-integer startAt", () => {
    const plan = planBulkModuleCreation([], 2, "Module {x}", 1.5);
    expect(plan.error).toBe("Enter a positive whole starting number.");
  });

  it("a token-less template still produces distinct, non-colliding names per entry", () => {
    const plan = planBulkModuleCreation([], 3, "Unit", 1);
    expect(plan.entries).toEqual([
      { n: 1, name: "Unit 01", action: "create" },
      { n: 2, name: "Unit 02", action: "create" },
      { n: 3, name: "Unit 03", action: "create" },
    ]);
    expect(plan.createCount).toBe(3);
  });

  it("an unrelated existing module (no matching name) never counts as already-present", () => {
    const existing = [{ id: 401, name: "Start Here" }];
    const plan = planBulkModuleCreation(existing, 1, "Module {x}", 1);
    expect(plan.entries).toEqual([{ n: 1, name: "Module 01", action: "create" }]);
    expect(plan.createCount).toBe(1);
    expect(plan.skipCount).toBe(0);
  });
});
