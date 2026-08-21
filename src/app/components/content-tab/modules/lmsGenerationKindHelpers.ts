// Pure kind/busy-state helpers extracted from useLmsGeneration.ts to keep
// that file under this repo's 1000-line ceiling - a STRUCTURAL split only,
// no behaviour change. Bundles exactly the cluster useLmsGeneration.ts's own
// header comment already called out as one seam: kind labels/offerability,
// the shared busy-state transition, and the per-course script-length
// persistence key - all pure, DI-free leaves re-exported from
// useLmsGeneration.ts so every existing import of that file keeps compiling
// unchanged. See useLmsGeneration.test.ts for the executable coverage of
// every export here.

import type { ContentSourceContext } from "../contentSourceGating";
import { gateOperation } from "../contentSourceGating";
import { GENERATION_KIND_CONFIGS, GENERATION_KIND_IDS, type GenerationKindId } from "@/lib/lms-generation/kinds";

export interface GenerationKindDef {
  id: GenerationKindId;
  label: string;
}

// Derived from GENERATION_KIND_CONFIGS rather than hand-rolled, so this
// hook's id/label pairs can never drift from the registry the actual
// generators are keyed on.
export const GENERATION_KINDS: readonly GenerationKindDef[] = GENERATION_KIND_IDS.map((id) => ({
  id,
  label: GENERATION_KIND_CONFIGS[id].label,
}));

export function kindLabelFor(kindId: GenerationKindId): string {
  return GENERATION_KIND_CONFIGS[kindId].label;
}

/**
 * Whether `kindId` is one of chunk 3b's "save-and-post" kinds - i.e. whether
 * the preview modal should offer "Post to Canvas" for it at all (P1: shown
 * ONLY for a posting kind) and whether the success-note copy for it needs to
 * talk about posting (P6). A thin wrapper over the registry's own
 * `commitMode` rather than a hand-maintained kind list, so this can never
 * drift from kinds.ts as new kinds are added.
 */
export function kindOffersPost(kindId: GenerationKindId): boolean {
  return GENERATION_KIND_CONFIGS[kindId].commitMode === "save-and-post";
}

/**
 * Whether posting `kindId` needs a module target at all - true for a
 * "module-item" placement (objectives/assignments/knowledgeChecks: linked
 * into a module the instructor picks or names, P5), false for a
 * "course-level" one (announcements: a Canvas announcement is a course-level
 * discussion topic, never a module item - kinds.ts's own
 * GenerationCommitMeta doc comment). Drives whether the modal's module-target
 * picker even renders, and whether `post` resolves/sends a `target` at all -
 * postGeneratedArtifactAction's own `target` field is optional precisely for
 * this reason (src/app/actions/lms-generation.ts).
 */
export function kindNeedsModuleTarget(kindId: GenerationKindId): boolean {
  return GENERATION_KIND_CONFIGS[kindId].commitMeta?.placement === "module-item";
}

/**
 * AC3 (defect fix, docs/REGRESSION.md - the live "generate from an export
 * selection" defect): whether posting `kindId` to Canvas is unavailable
 * right now, and why - null when it can be posted. Generation itself has no
 * Canvas dependency (this whole fix is what makes it work from a stored
 * export), but POSTING is a real Canvas write, and an export selection has
 * no live Canvas connection to write to at all
 * (contentSourceGating.ts: `hasLiveCourse` is hardcoded false whenever the
 * active selection is export-sourced). Reuses gateOperation's own
 * "courseWrite" wording VERBATIM rather than inventing a generation-specific
 * reason - posting a generated artifact IS a courseWrite in exactly
 * gateOperation's sense (it creates new content in the live course with no
 * dependency on any item/module identity already on screen), the same class
 * of write ModulesView.tsx's own NewAssignmentPanel gate already refuses for
 * an export selection. `kindOffersPost`/`kindNeedsModuleTarget` above are
 * UNTOUCHED by this - they stay pure functions of the kind id alone; this is
 * a separate, additional check layered on top; a kind that never offered
 * posting in the first place (qa/currentEvents/decks) has nothing to explain
 * being unavailable, so this returns null for those regardless of `ctx`.
 */
export function postUnavailableReasonFor(kindId: GenerationKindId, ctx: ContentSourceContext): string | null {
  if (!kindOffersPost(kindId)) return null;
  const gate = gateOperation(ctx, "courseWrite");
  return gate.allowed ? null : (gate.reason ?? null);
}

/**
 * Which generation kinds to offer for a given selection: individually-
 * selected ITEMS, or whole selected MODULES. generateFromSelectionAction
 * accepts both (moduleIds are expanded to their items server-side - see
 * materials.ts's expandModuleSelection and lms-generation.ts's own header
 * comment), so a module-only selection - the natural way to say "generate
 * from this week" - offers the same kinds an item selection does. Offers
 * nothing only when BOTH counts are zero. `moduleCount` defaults to 0 so
 * every existing call site that only ever checked items keeps compiling and
 * behaving identically. Kept as its own function (rather than an inline
 * check at the render site) because it is a clean, pure, sabotage-checkable
 * unit.
 */
export function offerableGenerationKinds(itemCount: number, moduleCount = 0): readonly GenerationKindDef[] {
  return itemCount > 0 || moduleCount > 0 ? GENERATION_KINDS : [];
}

export type GenerationBusy = "" | GenerationKindId;

export type GenerationBusyEvent = { type: "start"; kind: GenerationKindId } | { type: "finish" };

/**
 * The busy-state transition shared by the two generate buttons AND the
 * preview modal's refine button - mirrors useLmsSyllabusButtons' own single
 * `busy: "" | "quiz" | "syllabus"` string, so a generate for one kind, a
 * refine of that same kind, and the OTHER kind's generate button can never
 * run concurrently. "start" while something is already running is a
 * NO-OP - it returns the CURRENT (already-running) kind unchanged, not the
 * newly-requested one, so a caller that skips the `canStartGeneration` guard
 * before dispatching still cannot start a second concurrent write.
 */
export function nextGenerationBusy(current: GenerationBusy, event: GenerationBusyEvent): GenerationBusy {
  if (event.type === "finish") return "";
  if (current !== "") return current;
  return event.kind;
}

export function canStartGeneration(busy: GenerationBusy): boolean {
  return busy === "";
}

/** S13: PER COURSE, following useLmsSyllabusButtons.ts's own read-on-init /
 * write-on-change `ta-` idiom (moduleChoiceKey/readStored, that file's
 * :45-54) - `courseUrl` is what uniquely identifies a course here, same as
 * every other `ta-` key in this tab.
 *
 * Exported (unlike moduleChoiceKey's own, deliberately private, precedent)
 * because it is the one piece of this control's persistence that a
 * node-environment test can actually reach: vitest here has no DOM
 * (vitest.config.ts: environment: "node"), so `window` is undefined and the
 * read-on-init/write-on-change effect itself is unexercisable end to end in
 * this test file - the same limit this file's own header comment already
 * states for every other piece of this hook's React wiring. See
 * useLmsGeneration.test.ts's own "script length persistence" describe block. */
export function scriptMinutesKey(courseUrl: string): string {
  return `ta-lms-script-minutes-${courseUrl}`;
}
export function readStored(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}
