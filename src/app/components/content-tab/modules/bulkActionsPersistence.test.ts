// AC9 persistence tests for useBulkItemActions.ts / useBulkModuleActions.ts
// (docs/bulk-bar-reorganization-acceptance-criteria.md section 3b, D3 and
// D2's AC9 row). Node-env, no DOM (vitest.config.ts: environment: "node"),
// so `window` is undefined and neither hook's own read-on-init/write-on-
// change effect is exercisable end to end here - the same limit
// scriptMinutesKey's own doc comment (lmsGenerationKindHelpers.ts) records
// for its sibling. What IS reachable, and what this file therefore tests:
// the pure key function, the pure tolerant resolver, source-text proof that
// the hook's `useState`/`useEffect` actually compose the two, and a canary
// over bulkBarGroupCatalog.ts's declared `persistKey`s so the catalog (the
// AC9 specification, per this wave's own brief) and this hook's real
// persistence cannot silently drift apart.
//
// RESOLVED FINDING: this file's first draft reported (but could not fix,
// owning only the two hooks, not the catalog) that `bulkBarGroupCatalog.ts`'s
// `moduleAddSubTypeSelect` entry declared `persistKey: null` with the shared
// `COMPOSE_FIELD_UNPERSISTED` reason, even though `bulkAddSubType`
// (useBulkModuleActions.ts) already persisted, unchanged, under
// "ta-modules-bulkadd-stype" - one of AC9's own three named "already
// working" controls. The catalog's owner has since corrected that entry to
// `persistKey: "ta-modules-bulkadd-stype"` with no `unpersistedReason` (it no
// longer needs one - I6 only applies when `persistKey` is null). The
// describe block below is kept in place, re-pointed at the now-agreeing
// fact, rather than deleted - the same "kept so the trail from gap-found to
// gap-closed survives" treatment `useLmsGeneration.test.ts`'s own
// `templateId` block got for an identical AC9 gap. What it pins now is
// stronger than before: a direct equality between the catalog's declared key
// and the key the hook actually uses, which fires if EITHER side drifts from
// the other, not just if the hook stops persisting.

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { BULK_BAR_GROUPS, type BulkBarControlDef } from "./bulkBarGroups";
import { bulkAddSubTypeStorageKey, resolveBulkAddSubType } from "./useBulkModuleActions";

// ---------------------------------------------------------------------------
// The eight group ids these two hooks own, per bulkBarGroupCatalog.ts's own
// group-to-file mapping (see its header, and D5's wave split naming
// useBulkItemActions.ts / useBulkModuleActions.ts as 2F's two files):
// useBulkItemActions.ts backs BulkItemsSection's five groups plus "move";
// useBulkModuleActions.ts backs BulkModulesSection's two.
const OWNED_GROUP_IDS = new Set([
  "items",
  "content",
  "dueDates",
  "grading",
  "submissionType",
  "move",
  "modules",
  "addToEach",
]);

function ownedControls(): BulkBarControlDef[] {
  return BULK_BAR_GROUPS.filter((g) => OWNED_GROUP_IDS.has(g.id)).flatMap((g) => g.controls);
}

function findOwnedControl(id: string): BulkBarControlDef {
  const control = ownedControls().find((c) => c.id === id);
  if (!control) throw new Error(`test setup: no control with id "${id}" in a group these hooks own`);
  return control;
}

// ---------------------------------------------------------------------------
// The canary: every catalog persistKey declared on a control belonging to
// one of these two hooks must have a matching key function registered here.
// Today that registry has exactly one entry (bulkAddSubTypeStorageKey), and
// the catalog now declares exactly ONE persistKey among these eight groups
// (moduleAddSubTypeSelect, since the correction described above) - the
// count below is itself the pinned fact. If a future wave gives another of
// these controls a real persistKey without a matching implementation (or
// vice versa - a hook starts persisting something the catalog does not know
// about), this is the test that catches the drift, per this chunk's own
// brief: "worth more than any individual resolver test."
const PERSIST_KEY_FUNCTIONS: Record<string, () => string> = {
  [bulkAddSubTypeStorageKey()]: bulkAddSubTypeStorageKey,
};

describe("catalog <-> implementation persistence canary (AC9)", () => {
  it("every persistKey the catalog declares for a control in these two hooks' groups has a matching key function registered above", () => {
    const declared = ownedControls().filter((c) => c.persistKey !== null);
    for (const control of declared) {
      const key = control.persistKey as string;
      expect(
        Object.prototype.hasOwnProperty.call(PERSIST_KEY_FUNCTIONS, key),
        `control "${control.id}" declares persistKey "${key}" in bulkBarGroupCatalog.ts, but no matching key function is registered in PERSIST_KEY_FUNCTIONS (bulkActionsPersistence.test.ts) - either the hook is missing the persistence, or this test's registry is stale.`
      ).toBe(true);
    }
    // Pinned count, not just "the loop ran": exactly one control among these
    // eight groups genuinely persists today. If a future wave adds or
    // removes a declaration, this assertion forces this test file to be
    // updated in the same change rather than the loop above silently
    // iterating over a different-sized set forever.
    expect(declared.length).toBe(1);
  });

  it("moduleAddSubTypeSelect's catalog persistKey matches the key bulkAddSubType actually persists under (two-directional drift canary)", () => {
    const control = findOwnedControl("moduleAddSubTypeSelect");
    // Direct equality, not two separate truthy checks: this fails if EITHER
    // side changes without the other - the catalog's declared key drifting
    // from what the hook implements, or the hook's key changing without the
    // catalog being updated to match. That is a strictly stronger canary
    // than pinning either side in isolation, and it is the reason this
    // block survived the catalog's correction rather than being deleted.
    expect(control.persistKey).toBe(bulkAddSubTypeStorageKey());
    // I6 (bulkBarGroups.ts's own audit invariant) only requires
    // unpersistedReason when persistKey is null - now that this control has
    // a real key, it correctly carries none.
    expect(control.unpersistedReason).toBeUndefined();
  });

  it("every other owned control still declared unpersisted still carries a non-empty unpersistedReason (I6, scoped to these two hooks)", () => {
    // Defense in depth alongside bulkBarGroups.test.ts's own global
    // auditGroupModel() check: proves the catalog's correction to
    // moduleAddSubTypeSelect was NOT accompanied by a blanket loosening of
    // I6 for every other still-unpersisted control in these eight groups.
    const stillUnpersisted = ownedControls().filter((c) => c.id !== "moduleAddSubTypeSelect" && c.persistKey === null);
    expect(stillUnpersisted.length).toBeGreaterThan(0); // sanity: this set is not vacuous
    for (const control of stillUnpersisted) {
      expect(control.unpersistedReason, `control "${control.id}" has persistKey: null but no unpersistedReason`).toBeTruthy();
    }
  });
});

// ---------------------------------------------------------------------------
// bulkAddSubTypeStorageKey

describe("bulkAddSubTypeStorageKey", () => {
  it("returns the exact literal key the shipped control has always used", () => {
    expect(bulkAddSubTypeStorageKey()).toBe("ta-modules-bulkadd-stype");
  });
});

// ---------------------------------------------------------------------------
// resolveBulkAddSubType - the tolerant resolver, tested against: a valid
// stored value, a stale one naming a submission type no longer offered, a
// malformed one, an empty string, and null.

describe("resolveBulkAddSubType", () => {
  it("passes through a valid, currently-offered submission type unchanged", () => {
    expect(resolveBulkAddSubType("online_upload")).toBe("online_upload");
    expect(resolveBulkAddSubType("online_url")).toBe("online_url");
    expect(resolveBulkAddSubType("on_paper")).toBe("on_paper");
    expect(resolveBulkAddSubType("none")).toBe("none");
  });

  it("falls back to the default for a stale value naming a submission type no longer offered", () => {
    // "peer_review" and "external_tool" are real Canvas submission types this
    // control has never offered as an option - the same "membership, not
    // shape" hazard resolveScriptMinutes's own header comment describes for
    // a merely-plausible-looking stored value.
    expect(resolveBulkAddSubType("peer_review")).toBe("online_text_entry");
    expect(resolveBulkAddSubType("external_tool")).toBe("online_text_entry");
  });

  it("falls back to the default for a malformed value", () => {
    expect(resolveBulkAddSubType("not-a-real-type")).toBe("online_text_entry");
    expect(resolveBulkAddSubType("123")).toBe("online_text_entry");
    expect(resolveBulkAddSubType({})).toBe("online_text_entry");
    expect(resolveBulkAddSubType(42)).toBe("online_text_entry");
  });

  it("falls back to the default for an empty string", () => {
    expect(resolveBulkAddSubType("")).toBe("online_text_entry");
    expect(resolveBulkAddSubType("   ")).toBe("online_text_entry");
  });

  it("falls back to the default for null and undefined", () => {
    expect(resolveBulkAddSubType(null)).toBe("online_text_entry");
    expect(resolveBulkAddSubType(undefined)).toBe("online_text_entry");
  });
});

// ---------------------------------------------------------------------------
// Source-text proof that the hook's useState initializer and useEffect
// actually compose bulkAddSubTypeStorageKey()/resolveBulkAddSubType() -
// the same technique useLmsGeneration.test.ts's "templateId (deck template
// picker) persistence" describe block uses for its own read/write pair,
// needed because the effect itself cannot run under vitest's node
// environment. Pins the FACT that both halves are present, not the exact
// spelling of the surrounding line.

describe("useBulkModuleActions source wiring (read-on-init / write-on-change)", () => {
  const HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useBulkModuleActions.ts");
  const hookSource = readFileSync(HOOK_PATH, "utf8");

  it("reads through resolveBulkAddSubType and bulkAddSubTypeStorageKey on init, and writes through bulkAddSubTypeStorageKey on change", () => {
    const declStart = hookSource.indexOf("const [bulkAddSubType, setBulkAddSubType] = useState");
    expect(declStart, "bulkAddSubType's useState declaration moved or was renamed").toBeGreaterThan(-1);

    const nextDeclStart = hookSource.indexOf("const [bulkAiPrompt, setBulkAiPrompt] = useState", declStart);
    expect(nextDeclStart, "bulkAiPrompt's declaration moved - update this test's anchor").toBeGreaterThan(declStart);

    const block = hookSource.slice(declStart, nextDeclStart);
    expect(block).toMatch(/resolveBulkAddSubType\(/);
    expect(block).toMatch(/bulkAddSubTypeStorageKey\(\)/);
    expect(block).toMatch(/localStorage\.setItem\(\s*bulkAddSubTypeStorageKey\(\)/);
  });
});

// ---------------------------------------------------------------------------
// Controls this chunk judged CANNOT go stale, and therefore need no tolerant
// resolver - a free-text field or a plain number has no external referent
// (no module, rubric, file or submission type it could name after that
// referent is deleted or renamed), unlike bulkAddSubType, bulkTargetModule,
// bulkRubricId, bulkAddRubricId or bulkAddFileId above. See this file's
// header and useBulkItemActions.ts / useBulkModuleActions.ts's own comments
// for the controls that DO carry a staleness risk and were deliberately left
// unpersisted instead.
//
// FIXED (Finding 11, step-10 review): this used to be a documentation test in
// name only - a hardcoded array asserted against its own `.length`, reading
// no source and touching no production symbol, so it could not fail for any
// code change (renaming or deleting one of these fields would leave the
// count and the loop untouched). It now reads both owning hooks' source text
// and asserts each name really is a `useState`-backed field there, which
// fails if a name is renamed, removed, or was never real to begin with.
describe("controls judged unable to go stale (no resolver needed)", () => {
  const ITEMS_HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useBulkItemActions.ts");
  const MODULE_HOOK_PATH = join(process.cwd(), "src/app/components/content-tab/modules/useBulkModuleActions.ts");
  const itemsHookSource = readFileSync(ITEMS_HOOK_PATH, "utf8");
  const moduleHookSource = readFileSync(MODULE_HOOK_PATH, "utf8");

  // bulkShift/bulkStaggerOffset/bulkModuleShift/bulkAddStaggerOffset: a
  // shift-by-N-days/modules or a stagger interval is just an integer: it
  // is not a foreign key into a live list, so there is no "the thing it
  // named is now gone" failure mode a resolver would guard against.
  // bulkStaggerUnit/bulkAddStaggerUnit: a fixed two-value enum
  // ("weeks" | "days") that can never gain or lose an option.
  // bulkItemsDescription/bulkAddDescription/bulkAddPattern/bulkAiPrompt/
  // bulkAddDue/bulkAddPoints/bulkPoints/bulkDue: free text or a plain
  // number/date typed fresh for the very next click - never a reference
  // to another Canvas object.
  const noResolverNeeded = [
    "bulkShift",
    "bulkStaggerOffset",
    "bulkStaggerUnit",
    "bulkModuleShift",
    "bulkAddStaggerOffset",
    "bulkAddStaggerUnit",
    "bulkItemsDescription",
    "bulkAddDescription",
    "bulkAddPattern",
    "bulkAiPrompt",
    "bulkAddDue",
    "bulkAddPoints",
    "bulkPoints",
    "bulkDue",
  ];

  it("every listed name is a real useState-backed field in useBulkItemActions.ts or useBulkModuleActions.ts", () => {
    for (const name of noResolverNeeded) {
      const declPattern = new RegExp(`const \\[${name},\\s*set${name[0].toUpperCase()}${name.slice(1)}\\]\\s*=\\s*useState`);
      const inItems = declPattern.test(itemsHookSource);
      const inModules = declPattern.test(moduleHookSource);
      expect(
        inItems || inModules,
        `"${name}" is not a useState-backed field in useBulkItemActions.ts or useBulkModuleActions.ts - it may have been renamed or removed without this list being updated`
      ).toBe(true);
    }
  });

  it("keeps the pinned count in sync with the list above", () => {
    // A length check alongside the real check above: if a name is added or
    // removed from the array without updating this count, this fails too.
    expect(noResolverNeeded.length).toBe(14);
  });
});
