// The post-target picker's pure helpers, extracted from useLmsGeneration.ts
// to keep that file under this repo's 1000-line ceiling - a STRUCTURAL split
// only, no behaviour change. Re-exported from useLmsGeneration.ts so every
// existing import of that file (GeneratedPreviewModal.tsx,
// useLmsGeneration.test.ts) keeps compiling unchanged. Executable coverage
// lives in useLmsGeneration.test.ts for the exports that predate this file's
// split, and in the sibling lmsGenerationModuleTarget.postSeed.test.ts for
// defaultPostModuleChoiceFrom - the two together, not either alone.

import type { CanvasModule } from "@/lib/canvas-modules";
import type { ModuleTarget } from "@/lib/lms-generation/commit-plan";
// NEW_MODULE_TARGET_VALUE's one owner is src/lib/syllabus-ack-quiz-target.ts
// (see useLmsGeneration.ts's own re-export comment for the full rationale);
// imported directly here rather than from useLmsGeneration.ts itself to
// avoid a circular import (useLmsGeneration.ts imports
// resolvePostModuleTarget from this file).
import { NEW_MODULE_TARGET_VALUE } from "@/lib/syllabus-ack-quiz-target";
// The ONE parser for a discriminated module key, shared with
// liveModuleIdsFromKeys (utils.ts) rather than hand-rolled a third time - see
// defaultPostModuleChoiceFrom below for the divergence a hand-roll caused.
// No import cycle: utils.ts imports only React types, ../../actions,
// ./constants and ./types - nothing under modules/.
import { parseModuleKey } from "../utils";
import type { LiveSelectedItem, ExportSelectedItem, RepoSelectedItem } from "@/lib/lms-generation/materials";

/**
 * Turn the post-target picker's own UI state - a single select where one
 * option means "create a new module by name" (P5), plus that name's own text
 * field, shown only when the sentinel is picked - into the `ModuleTarget`
 * commit-plan.ts's `planModuleTarget` expects. Blank/no selection and a
 * blank new-module name are both refused here, with the same wording
 * `planModuleTarget` itself would use for the latter - surfaced before the
 * post call is ever made rather than only after a round trip.
 */
export function resolvePostModuleTarget(
  choice: string,
  newModuleName: string
): { ok: true; target: ModuleTarget } | { ok: false; reason: string } {
  if (choice === NEW_MODULE_TARGET_VALUE) {
    const name = newModuleName.trim();
    if (!name) return { ok: false, reason: "Enter a name for the new module." };
    return { ok: true, target: { kind: "new", name } };
  }
  const moduleId = Number(choice);
  if (!choice || !Number.isFinite(moduleId)) {
    return { ok: false, reason: "Choose where to post this - an existing module, or a new one." };
  }
  return { ok: true, target: { kind: "existing", moduleId } };
}

/** id/name pairs for the post-target module select - the tab's already-
 * loaded live module tree, narrowed the same way deckTemplateOptionsFrom
 * narrows DeckTemplate for its own picker. */
export interface PostModuleOption {
  id: number;
  name: string;
}

export function postModuleOptionsFrom(modules: CanvasModule[]): PostModuleOption[] {
  return modules.map((m) => ({ id: m.id, name: m.name }));
}

/**
 * The post-target select's default value, decided from the bulk selection
 * the generation was run against - so an instructor who picked "Week 5" and
 * pressed "Module objectives" is not then asked to re-find "Week 5" in a
 * dropdown listing every module in the course
 * (docs/objectives-post-target-from-selection-acceptance-criteria.md, AC1-3).
 *
 * `moduleKeys` is the RAW discriminated module-selection key array -
 * useModuleSelection's own `selectedModules`, Array.from'd - and deliberately
 * NOT `liveModuleIdsFromKeys`' numeric projection (utils.ts:198-208). That
 * projection silently drops every `export:`/`repo:` key on the way to a
 * `Set<number>`, which would make an export/repo module selection
 * indistinguishable from no selection at all - undetectable, so AC2's clause
 * 3 (any export/repo involvement refuses the default) could never actually
 * fire. Taking the raw keys costs nothing: the key format already IS the tag
 * format below, so no translation is needed.
 *
 * DELIBERATELY DUPLICATED, NOT SHARED (X4): the location-tagging expression
 * just below is near-identical to buildModuleLabel's own
 * (lmsGenerationSelection.ts:82-86), which carries its own load-bearing
 * comment explaining the same collision rule. Extracting a shared
 * `selectionLocationTags(items, moduleKeys)` helper would mean editing
 * lmsGenerationSelection.ts, which is out of this file's scope for this
 * change. Two functions, one documented rule, on purpose - a step-10 reviewer
 * should read this as intentional, not as an unconsolidated duplicate, and a
 * fixer should not merge it across files. Revisit only if a fourth source arm
 * lands and both call sites need to grow together.
 */
export function defaultPostModuleChoiceFrom(
  items: ReadonlyArray<
    | Pick<LiveSelectedItem, "source" | "moduleId">
    | Pick<ExportSelectedItem, "source" | "moduleRef">
    | Pick<RepoSelectedItem, "source" | "moduleRef">
  >,
  /** The RAW discriminated module-selection keys - useModuleSelection's own
   * `selectedModules`, Array.from'd (the `moduleKeys` local already computed
   * at useLmsGeneration.ts:508). NOT liveModuleIdsFromKeys' numeric
   * projection: that one silently drops every `export:`/`repo:` key
   * (utils.ts:198-208), which would make clause 3 of AC2 undetectable. */
  moduleKeys: readonly string[]
): string {
  // Tagged per source, exactly like buildModuleLabel's own `locations` Set -
  // so a live module `1` and an export module `"1"` can never collide. The
  // tags below are byte-identical to what liveModuleKey/exportModuleKey/
  // repoModuleKey (utils.ts:142,151,166) already produce, which is why
  // `moduleKeys`' raw entries can be unioned straight in with no parsing at
  // all: the key format IS the tag format. (Reading a single key back OUT
  // into a module id is a different job and does not get hand-rolled - see
  // parseModuleKey below.)
  const locations = new Set<string>(
    items.map((it) =>
      it.source === "live" ? `live:${it.moduleId}` : it.source === "export" ? `export:${it.moduleRef}` : `repo:${it.moduleRef}`
    )
  );
  for (const key of moduleKeys) locations.add(key);

  if (locations.size !== 1) return "";
  const [only] = locations;
  // Parsed by liveModuleIdsFromKeys' OWN parser (parseModuleKey, utils.ts),
  // never by a third hand-rolled `startsWith("live:")` + `slice(5)`. A
  // hand-roll DIVERGES on the empty ref: parseModuleKey rejects `"live:"`
  // (`if (!ref) return null`), so liveModuleIdsFromKeys(["live:"]) is the
  // empty set, while `Number("")` is `0` and `Number.isFinite(0)` is true -
  // a hand-rolled parse would hand back `"0"`, a real Canvas-module-shaped
  // id nobody selected. AC2 clause 2 requires the ref be NUMERIC, and an
  // empty ref is not a number. X4 licenses the duplicated tag-BUILDING
  // expression just above; it does not license a duplicated tag-PARSE, which
  // is precisely where the two can drift apart.
  const parsed = parseModuleKey(only);
  if (parsed?.source !== "live") return "";
  const id = Number(parsed.ref);
  // resolvePostModuleTarget does a bare Number(choice), so a non-numeric ref
  // must not be handed back as a default either.
  return Number.isFinite(id) ? String(id) : "";
}

// MATERIALITEMS VS EXPANDEDFORLABEL (AC4's amendment - hoisted here from
// useLmsGeneration.ts, which sits close to this repo's 1000-line ceiling,
// and which argues about THIS function's behaviour rather than its own).
//
// `generate()` seeds the default from `materialItems`, not from
// `expandedForLabel` (the AC as first written named the latter). The two are
// provably interchangeable at that call site, and only there, because
// defaultPostModuleChoiceFrom unions `moduleKeys` into its own location set:
// expandModuleSelection returns `[...items]` plus items it manufactures ONLY
// for modules whose key is in that same `moduleKeys` - every one of its three
// loops is gated on `keySet.has(...)` (src/lib/lms-generation/materials.ts,
// where a comment names this function as the consumer that depends on that
// gating) - so the expansion can contribute no LOCATION the raw keys do not
// already carry. That is:
//
//   locations(materialItems) union moduleKeys
//     === locations(expandedForLabel) union moduleKeys, exactly.
//
// `materialItems` is preferred because it does not depend on the client
// `modules` tree at all, which generate()'s own comment already documents as
// possibly stale and therefore display-only. A target id must never be
// decided by a tree that may be stale, and AC3 (an unexpanded or empty module
// still seeds) is served by the raw keys regardless.

// NO NEW `ta-` LOCALSTORAGE KEY FOR THE POST TARGET (AC10). The repo rule
// that every new textbox/select/checkbox persists across reloads exists so a
// control's state survives navigating away and back; this control's only
// correct value is a function of the CURRENT selection
// (defaultPostModuleChoiceFrom, above). A persisted value from a previous
// session is exactly the stale-but-answered-looking select AC6 exists to
// reject - it would look like a real default while naming a module from a
// selection that no longer exists. The select itself is also not new (it
// already exists via postModuleOptionsFrom, above); only its default seeding
// is. See useLmsGeneration.ts for the two-line pointer back to this comment.
