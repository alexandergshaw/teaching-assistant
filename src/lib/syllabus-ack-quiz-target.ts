// Pure module-target logic for the syllabus acknowledgement quiz
// (docs/syllabus-ack-quiz-module-target-acceptance-criteria.md). Dependency-
// free: no React, no MUI, no server imports - a lib must not reach into a
// client hook. NEW_MODULE_TARGET_VALUE therefore moves HERE from
// useLmsGeneration.ts (a "use client" hook), which now re-exports it for its
// existing consumers instead of declaring it - one owner.
//
// The two decisions this file answers with no I/O at all (AC2/AC3, AC5):
//   - initialModuleChoice: what the "Into module" select should show on
//     mount - a restored choice that still resolves against THIS course's
//     modules, else "Start Here" when the course has one, else nothing
//     (never the first module - this button has deliberately never had that
//     fallback, unlike its sibling "Generate syllabus").
//   - syllabusQuizLinkDecision: given whether the quiz already exists (and
//     where), and what the instructor chose, what should happen to it - link,
//     create-then-link, report where it already lives, or do nothing.
import { findStartHereModule } from "./lms-start-here-module";

/** P5's sentinel for "create a new module by name", moved here from
 * useLmsGeneration.ts (AC4) so a dependency-free lib owns it - re-exported
 * from that hook for its existing consumers (GeneratedPreviewModal.tsx,
 * useLmsGeneration.test.ts). Value is unchanged, so every already-persisted
 * string stays valid. Distinct from every real Canvas module id (always a
 * positive number), so a non-numeric sentinel can never collide. */
export const NEW_MODULE_TARGET_VALUE = "__new-module__";

/** Minimal shape the picker needs from a Canvas module. */
export interface ModuleOption {
  id: number;
  name: string;
}

/**
 * The "Into module" select's initial value (AC2/AC3): a stored choice that
 * still resolves against THIS course's modules wins; failing that, the
 * course's "Start Here" module - matched the same case/whitespace-
 * insensitive way findStartHereModule already does for the sibling button,
 * reused directly here rather than re-implemented; failing that, "" -
 * deliberately never the first module, unlike
 * resolveModuleForSyllabusPlacement's fallback for "Generate syllabus".
 *
 * `stored` is untrusted (a localStorage read, possibly stale, hand-edited,
 * or from before this course's modules changed): a numeric id that no
 * longer names a module in `modules` is discarded, never resurrected. The
 * sentinel names no id at all, so it is always accepted as-is.
 */
export function initialModuleChoice(modules: ModuleOption[], stored: string | null): string {
  if (stored === NEW_MODULE_TARGET_VALUE) return NEW_MODULE_TARGET_VALUE;
  if (stored) {
    const id = Number(stored);
    if (Number.isFinite(id) && modules.some((m) => m.id === id)) {
      return stored;
    }
  }
  const startHere = findStartHereModule(modules);
  return startHere ? String(startHere.id) : "";
}

/** Where the instructor's chosen target should send the quiz - structurally
 * the same shape commit-plan.ts's `ModuleTarget` uses (AC4: the server
 * action reuses that type verbatim when it actually resolves/creates a
 * module). Declared again here, rather than imported, so this pure module
 * has no dependency at all on the posting-content feature; the two are kept
 * assignable to each other by construction, not by a shared import. */
export type SyllabusQuizTarget = { kind: "existing"; moduleId: number } | { kind: "new"; name: string };

/** Where an already-existing acknowledgement quiz currently lives. */
export interface ExistingAckQuizModule {
  id: number;
  name: string;
}

export interface SyllabusQuizLinkInput {
  /** null when this is a freshly created quiz - there is nothing to report
   * or re-home yet. Otherwise, where (if anywhere) it currently lives. */
  existing: { inModule: ExistingAckQuizModule | null } | null;
  /** null when the instructor made no selection (AC2's default-nothing
   * floor). */
  target: SyllabusQuizTarget | null;
}

export type SyllabusQuizLinkDecision =
  | { action: "link"; moduleId: number }
  | { action: "create-module-then-link"; name: string }
  | { action: "report-existing"; moduleName: string }
  | { action: "none"; reason: string };

/**
 * AC5: decide what a press of the button should do to the quiz's module
 * placement.
 *
 * Order matters: an already-placed quiz is reported, never re-homed, no
 * matter what target is chosen this time - "moving it is a bigger action
 * than was asked for" (AC5). Only once that is ruled out does the chosen
 * target matter: no target leaves it exactly as it is; an existing-module
 * target links directly; a new-module target creates first. This function
 * only decides THAT a module should be created for a "new" target - never
 * whether one already matches by name; that reuse-or-create resolution is
 * planModuleTarget's job (AC4), run by the caller against the real module
 * list before any Canvas write happens.
 */
export function syllabusQuizLinkDecision(input: SyllabusQuizLinkInput): SyllabusQuizLinkDecision {
  const { existing, target } = input;

  if (existing?.inModule) {
    return { action: "report-existing", moduleName: existing.inModule.name };
  }

  if (!target) {
    return { action: "none", reason: "no target was chosen" };
  }

  return target.kind === "existing"
    ? { action: "link", moduleId: target.moduleId }
    : { action: "create-module-then-link", name: target.name };
}
