import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  containerItemKeys,
  eligibleItemRefs,
  moduleCheckboxVisualState,
  moduleSelectionState,
  selectItemsButtonLabel,
  selectItemsButtonTooltip,
  toggleContainerItems,
} from "./moduleItemSelection";

// The OTHER side of the frozen-literal oracle below: materials.ts's own
// hand-written key templates, read as source text so a change to EITHER side
// (this function's own templates, or materials.ts's independent copies) can
// be caught. Path: src/app/components/content-tab/modules -> src/lib/lms-generation.
const MATERIALS_PATH = join(process.cwd(), "src/lib/lms-generation/materials.ts");
const materialsSource = readFileSync(MATERIALS_PATH, "utf8");

// -- JOB 1 / AC6 - the consolidated selector, one function per source -------

describe("containerItemKeys", () => {
  it("builds live keys from a numeric module ref and numeric item refs", () => {
    expect(containerItemKeys({ source: "live", moduleRef: "5", itemRefs: ["10", "11"] })).toEqual([
      "live:5:10",
      "live:5:11",
    ]);
  });

  it("builds export keys from string refs", () => {
    expect(containerItemKeys({ source: "export", moduleRef: "m1", itemRefs: ["a", "b"] })).toEqual([
      "export:m1:a",
      "export:m1:b",
    ]);
  });

  it("builds repo keys from tree paths", () => {
    expect(
      containerItemKeys({
        source: "repo",
        moduleRef: "assignments/module_01",
        itemRefs: ["assignments/module_01/README.md"],
      })
    ).toEqual(["repo:assignments/module_01:assignments/module_01/README.md"]);
  });

  it("returns an empty array for an empty container, for every source", () => {
    expect(containerItemKeys({ source: "live", moduleRef: "5", itemRefs: [] })).toEqual([]);
    expect(containerItemKeys({ source: "export", moduleRef: "m1", itemRefs: [] })).toEqual([]);
    expect(containerItemKeys({ source: "repo", moduleRef: "r", itemRefs: [] })).toEqual([]);
  });
});

// This is the FROZEN LITERAL oracle AC6 calls for: `expandModuleSelection`
// (src/lib/lms-generation/materials.ts:499,510,520) hand-writes
// `live:${mod.id}:${item.id}`, `export:${mod.identifier}:${item.identifier}`
// and `repo:${mod.ref}:${itemRef}` as string literals rather than importing
// containerItemKeys (deliberately - that file keeps zero client imports).
//
// FIXED (step-10 review): this describe block used to pin ONLY
// containerItemKeys's own output against a hand-copied literal, never
// reading materials.ts at all - so it could not have failed for a drift on
// the materials.ts side, despite claiming to be an oracle for the
// AGREEMENT between the two. It now reads materials.ts's source text and
// asserts the three literal template expressions are still there verbatim,
// which fails if THAT side drifts; the shape-check below (kept, not
// duplicated three-over three with the plain containerItemKeys tests above -
// those use different literal inputs and exist to pin containerItemKeys in
// isolation) still fails if THIS side drifts. Per this repo's rule that
// consolidating two implementations disarms a test that used to compare them
// directly, the two sides are pinned independently rather than compared to
// each other at runtime - materials.ts is never imported or executed here.
describe("containerItemKeys agrees with expandModuleSelection's hand-written templates (frozen literal oracle)", () => {
  it("materials.ts still hand-writes the exact three key templates this file mirrors", () => {
    expect(materialsSource, "the live key template moved or was reworded").toContain(
      "`live:${mod.id}:${item.id}`"
    );
    expect(materialsSource, "the export key template moved or was reworded").toContain(
      "`export:${mod.identifier}:${item.identifier}`"
    );
    expect(materialsSource, "the repo key template moved or was reworded").toContain(
      "`repo:${mod.ref}:${itemRef}`"
    );
  });

  it("containerItemKeys produces the same live/export/repo shape the templates above describe", () => {
    expect(containerItemKeys({ source: "live", moduleRef: "5", itemRefs: ["10"] })).toEqual(["live:5:10"]);
    expect(containerItemKeys({ source: "export", moduleRef: "m1", itemRefs: ["it1"] })).toEqual(["export:m1:it1"]);
    expect(
      containerItemKeys({ source: "repo", moduleRef: "assignments/module_01", itemRefs: ["assignments/module_01/x.md"] })
    ).toEqual(["repo:assignments/module_01:assignments/module_01/x.md"]);
  });
});

describe("eligibleItemRefs", () => {
  it("keeps only items refOf resolves a non-empty ref for", () => {
    const items = [{ identifier: "a" }, { identifier: undefined }, { identifier: "" }, { identifier: "b" }];
    expect(eligibleItemRefs(items, (it) => it.identifier)).toEqual(["a", "b"]);
  });

  it("this is the export-item exclusion rule (AC6/AC9): an instructor-added item with no identifier never becomes a ref", () => {
    // display-module-tree.ts's `added: true` items carry no `identifier` at
    // all - mirrored here as `identifier: undefined` since this function
    // only ever consults the resolved ref, never an `added` flag.
    const items = [
      { identifier: "keep-1" },
      { identifier: undefined }, // the excluded, instructor-added item
      { identifier: "keep-2" },
    ];
    expect(eligibleItemRefs(items, (it) => it.identifier)).toEqual(["keep-1", "keep-2"]);
  });

  it("passes every item through when refOf never omits a ref (the live/repo case)", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(eligibleItemRefs(items, (it) => String(it.id))).toEqual(["1", "2", "3"]);
  });

  it("returns an empty array for an empty list", () => {
    expect(eligibleItemRefs([], () => "x")).toEqual([]);
  });
});

describe("toggleContainerItems", () => {
  it("selects every key when none are selected", () => {
    const selected = new Set<string>();
    const next = toggleContainerItems(selected, ["live:1:10", "live:1:11"]);
    expect(next).toEqual(new Set(["live:1:10", "live:1:11"]));
  });

  it("selects every key when only some are selected", () => {
    const selected = new Set(["live:1:10"]);
    const next = toggleContainerItems(selected, ["live:1:10", "live:1:11"]);
    expect(next).toEqual(new Set(["live:1:10", "live:1:11"]));
  });

  it("deselects every key when all are already selected", () => {
    const selected = new Set(["live:1:10", "live:1:11", "live:2:20"]);
    const next = toggleContainerItems(selected, ["live:1:10", "live:1:11"]);
    expect(next).toEqual(new Set(["live:2:20"]));
  });

  it("returns the same Set reference (no-op) for an empty key list", () => {
    const selected = new Set(["live:1:10"]);
    const next = toggleContainerItems(selected, []);
    expect(next).toBe(selected);
  });

  it("leaves keys from OTHER containers untouched while toggling this one's", () => {
    // "some" of this container's keys are selected ("live:1:10" but not
    // "live:1:11"), so the toggle turns the whole container ON - both of its
    // keys end up selected, and the unrelated "live:2:20" key is untouched.
    const selected = new Set(["live:1:10", "live:2:20"]);
    const next = toggleContainerItems(selected, ["live:1:10", "live:1:11"]);
    expect(next).toEqual(new Set(["live:1:10", "live:1:11", "live:2:20"]));
  });
});

// -- JOB 2 / AC2 + AC5 - the three-state predicate ---------------------------

describe("moduleSelectionState", () => {
  it("is 'none' for an empty container (never vacuously 'all')", () => {
    expect(moduleSelectionState(new Set(), [])).toBe("none");
    expect(moduleSelectionState(new Set(["live:1:10"]), [])).toBe("none");
  });

  it("is 'none' when zero of the container's items are selected", () => {
    expect(moduleSelectionState(new Set(["live:9:99"]), ["live:1:10", "live:1:11"])).toBe("none");
  });

  it("is 'some' when a proper subset is selected", () => {
    expect(moduleSelectionState(new Set(["live:1:10"]), ["live:1:10", "live:1:11", "live:1:12"])).toBe("some");
  });

  it("is 'some' even when only ONE item short of all - an off-by-one guard", () => {
    expect(moduleSelectionState(new Set(["live:1:10", "live:1:11"]), ["live:1:10", "live:1:11", "live:1:12"])).toBe(
      "some"
    );
  });

  it("is 'all' when every one of the container's items is selected", () => {
    expect(moduleSelectionState(new Set(["live:1:10", "live:1:11"]), ["live:1:10", "live:1:11"])).toBe("all");
  });

  it("is 'all' when every item is selected even alongside unrelated selected keys", () => {
    expect(moduleSelectionState(new Set(["live:1:10", "live:1:11", "live:2:20"]), ["live:1:10", "live:1:11"])).toBe(
      "all"
    );
  });
});

describe("moduleCheckboxVisualState", () => {
  it("is unchecked, not indeterminate, for 'none'", () => {
    expect(moduleCheckboxVisualState("none")).toEqual({ checked: false, indeterminate: false });
  });

  it("is indeterminate, not checked, for 'some'", () => {
    expect(moduleCheckboxVisualState("some")).toEqual({ checked: false, indeterminate: true });
  });

  it("is checked, not indeterminate, for 'all'", () => {
    expect(moduleCheckboxVisualState("all")).toEqual({ checked: true, indeterminate: false });
  });
});

describe("selectItemsButtonLabel", () => {
  it("reads 'Select items' for 'none' (default noun)", () => {
    expect(selectItemsButtonLabel("none")).toBe("Select items");
  });

  it("reads a distinct partial-state label for 'some' - not the same string as 'none'", () => {
    const noneLabel = selectItemsButtonLabel("none");
    const someLabel = selectItemsButtonLabel("some");
    const allLabel = selectItemsButtonLabel("all");
    expect(someLabel).not.toBe(noneLabel);
    expect(someLabel).not.toBe(allLabel);
  });

  it("reads 'Deselect items' for 'all' (default noun)", () => {
    expect(selectItemsButtonLabel("all")).toBe("Deselect items");
  });

  it("substitutes a custom item noun everywhere (the repo-folder 'files' case)", () => {
    expect(selectItemsButtonLabel("none", "files")).toBe("Select files");
    expect(selectItemsButtonLabel("all", "files")).toBe("Deselect files");
  });
});

// -- JOB 4 / AC7 - the search-scope decision, stated in the tooltip ---------

describe("selectItemsButtonTooltip", () => {
  it("discloses the search-scope note when the container has a search filter that can hide items", () => {
    const tooltip = selectItemsButtonTooltip("none", "module", "item", true);
    expect(tooltip).toMatch(/hidden by the search/i);
  });

  it("omits the search-scope note when the container has no search concept at all (repo folders)", () => {
    const tooltip = selectItemsButtonTooltip("none", "folder", "file", false);
    expect(tooltip).not.toMatch(/search/i);
  });

  it("uses a deselect verb once every item is selected, a select verb otherwise", () => {
    expect(selectItemsButtonTooltip("all", "module", "item", true)).toMatch(/^Deselect/);
    expect(selectItemsButtonTooltip("none", "module", "item", true)).toMatch(/^Select/);
    expect(selectItemsButtonTooltip("some", "module", "item", true)).toMatch(/^Select/);
  });

  it("names the container and item nouns given, so a folder/file tooltip never says 'module'/'item'", () => {
    const tooltip = selectItemsButtonTooltip("none", "folder", "file", false);
    expect(tooltip).toContain("folder");
    expect(tooltip).toContain("file");
    expect(tooltip).not.toContain("module");
  });
});
