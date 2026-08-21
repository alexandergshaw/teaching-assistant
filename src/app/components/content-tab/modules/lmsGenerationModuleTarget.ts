// The post-target picker's pure helpers, extracted from useLmsGeneration.ts
// to keep that file under this repo's 1000-line ceiling - a STRUCTURAL split
// only, no behaviour change. Re-exported from useLmsGeneration.ts so every
// existing import of that file (GeneratedPreviewModal.tsx,
// useLmsGeneration.test.ts) keeps compiling unchanged. See
// useLmsGeneration.test.ts for the executable coverage of every export here.

import type { CanvasModule } from "@/lib/canvas-modules";
import type { ModuleTarget } from "@/lib/lms-generation/commit-plan";
// NEW_MODULE_TARGET_VALUE's one owner is src/lib/syllabus-ack-quiz-target.ts
// (see useLmsGeneration.ts's own re-export comment for the full rationale);
// imported directly here rather than from useLmsGeneration.ts itself to
// avoid a circular import (useLmsGeneration.ts imports
// resolvePostModuleTarget from this file).
import { NEW_MODULE_TARGET_VALUE } from "@/lib/syllabus-ack-quiz-target";

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
