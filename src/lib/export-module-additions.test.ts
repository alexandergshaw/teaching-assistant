// Tests for the pure coercer, activation rule, edit helpers, and the
// unavailable-reason string (docs/export-module-additions-acceptance-
// criteria.md). Mirrors repo-module-pairing.test.ts's own coverage shape -
// see that file (and this feature's own src file header) for the design
// this pins.
import { describe, it, expect } from "vitest";
import {
  activateExportModuleAdditions,
  appendExportModuleAddition,
  coerceExportModuleAdditions,
  emptyExportModuleAdditions,
  exportEditUnavailableReason,
  removeExportModuleAddition,
  type ExportModuleAddition,
} from "./export-module-additions";
import { MAX_CARTRIDGE_ITEM_BODY_CHARS } from "@/lib/cartridge-import";

function addition(overrides: Partial<ExportModuleAddition> = {}): ExportModuleAddition {
  return {
    id: "a1",
    moduleRef: "mod-1",
    title: "My added item",
    type: "Page",
    addedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("emptyExportModuleAdditions", () => {
  it("returns v:1 and an empty additions array", () => {
    expect(emptyExportModuleAdditions()).toEqual({ v: 1, additions: [] });
  });
});

describe("coerceExportModuleAdditions - absent/malformed column (AC1)", () => {
  it("reads an absent column (undefined) as empty - the migration-not-yet-applied case", () => {
    expect(coerceExportModuleAdditions(undefined)).toEqual({ v: 1, additions: [] });
  });

  it("reads null as empty", () => {
    expect(coerceExportModuleAdditions(null)).toEqual({ v: 1, additions: [] });
  });

  it("reads a non-object (string) as empty rather than throwing", () => {
    expect(coerceExportModuleAdditions("not an object")).toEqual({ v: 1, additions: [] });
  });

  it("reads a bare array as empty (not v:1-tagged)", () => {
    expect(coerceExportModuleAdditions([addition()])).toEqual({ v: 1, additions: [] });
  });

  it("degrades an unknown format version to empty rather than guessing how to read it", () => {
    expect(coerceExportModuleAdditions({ v: 2, additions: [addition()] })).toEqual({ v: 1, additions: [] });
    expect(coerceExportModuleAdditions({ additions: [addition()] })).toEqual({ v: 1, additions: [] });
  });

  it("drops a malformed entry (missing id, moduleRef, or title) rather than defaulting it", () => {
    const result = coerceExportModuleAdditions({
      v: 1,
      additions: [
        { moduleRef: "mod-1", title: "No id" },
        { id: "a2", title: "No moduleRef" },
        { id: "a3", moduleRef: "mod-1", title: "" },
        addition({ id: "a4" }),
      ],
    });
    expect(result.additions).toEqual([addition({ id: "a4" })]);
  });

  it("keeps every genuinely valid entry, including an optional body", () => {
    const result = coerceExportModuleAdditions({
      v: 1,
      additions: [addition({ id: "a1" }), addition({ id: "a2", body: "Some prose." })],
    });
    expect(result.additions).toHaveLength(2);
    expect(result.additions[1].body).toBe("Some prose.");
  });

  it("leaves body absent (not undefined-valued) when the stored entry never had one", () => {
    const result = coerceExportModuleAdditions({ v: 1, additions: [addition()] });
    expect(Object.prototype.hasOwnProperty.call(result.additions[0], "body")).toBe(false);
  });

  it("collapses a duplicate id to its LAST occurrence, matching coerceRepoModulePairing's own rule", () => {
    const result = coerceExportModuleAdditions({
      v: 1,
      additions: [addition({ id: "dup", title: "First" }), addition({ id: "dup", title: "Second" })],
    });
    expect(result.additions).toHaveLength(1);
    expect(result.additions[0].title).toBe("Second");
  });

  it("caps an oversized body at MAX_CARTRIDGE_ITEM_BODY_CHARS", () => {
    const longBody = "x".repeat(MAX_CARTRIDGE_ITEM_BODY_CHARS + 500);
    const result = coerceExportModuleAdditions({ v: 1, additions: [addition({ body: longBody })] });
    expect(result.additions[0].body).toHaveLength(MAX_CARTRIDGE_ITEM_BODY_CHARS);
  });

  it("caps the addition count (AC2 - the whole column is read on every course list)", () => {
    const many = Array.from({ length: 305 }, (_, i) => addition({ id: `a${i}`, title: `Item ${i}` }));
    const result = coerceExportModuleAdditions({ v: 1, additions: many });
    expect(result.additions).toHaveLength(300);
  });
});

describe("activateExportModuleAdditions (AC4 - the most important rule)", () => {
  it("classifies each addition into active or inactive, never dropping any", () => {
    const additions = [
      addition({ id: "a1", moduleRef: "present-1" }),
      addition({ id: "a2", moduleRef: "gone" }),
      addition({ id: "a3", moduleRef: "present-2" }),
    ];
    const result = activateExportModuleAdditions(additions, ["present-1", "present-2"]);
    expect(result.active.map((a) => a.id)).toEqual(["a1", "a3"]);
    expect(result.inactive.map((a) => a.id)).toEqual(["a2"]);
  });

  it("a moduleRef that vanishes from the export stays and is marked inactive, never deleted", () => {
    const additions = [addition({ id: "a1", moduleRef: "removed-module" })];
    const result = activateExportModuleAdditions(additions, []);
    expect(result.active).toEqual([]);
    expect(result.inactive).toEqual(additions);
    // Same object references, not copies - a VIEW only.
    expect(result.inactive[0]).toBe(additions[0]);
  });

  it("every addition is active when every moduleRef is present", () => {
    const additions = [addition({ id: "a1", moduleRef: "m1" }), addition({ id: "a2", moduleRef: "m2" })];
    const result = activateExportModuleAdditions(additions, ["m1", "m2"]);
    expect(result.active).toHaveLength(2);
    expect(result.inactive).toHaveLength(0);
  });

  it("an empty presentModuleRefs list marks everything inactive (the caller's job to gate this on a loaded tree)", () => {
    const additions = [addition()];
    const result = activateExportModuleAdditions(additions, []);
    expect(result.inactive).toEqual(additions);
  });
});

describe("appendExportModuleAddition / removeExportModuleAddition", () => {
  it("append is pure and returns a new array", () => {
    const original: ExportModuleAddition[] = [];
    const next = appendExportModuleAddition(original, addition());
    expect(original).toEqual([]);
    expect(next).toEqual([addition()]);
  });

  it("remove drops exactly the addition with the matching id", () => {
    const additions = [addition({ id: "keep" }), addition({ id: "drop" })];
    const next = removeExportModuleAddition(additions, "drop");
    expect(next.map((a) => a.id)).toEqual(["keep"]);
  });

  it("removing an id that is not present is a no-op, not an error", () => {
    const additions = [addition({ id: "keep" })];
    const next = removeExportModuleAddition(additions, "does-not-exist");
    expect(next).toEqual(additions);
  });
});

describe("exportEditUnavailableReason (AC7)", () => {
  it("refuses a live Canvas source", () => {
    expect(exportEditUnavailableReason("canvas", "course-1")).not.toBeNull();
  });

  it("refuses an export with no course row id to write against", () => {
    expect(exportEditUnavailableReason("export", null)).not.toBeNull();
    expect(exportEditUnavailableReason("export", undefined)).not.toBeNull();
  });

  it("allows an export with a resolved course row id", () => {
    expect(exportEditUnavailableReason("export", "course-1")).toBeNull();
  });
});
