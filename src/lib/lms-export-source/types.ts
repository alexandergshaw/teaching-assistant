// Types for the second Course Content SOURCE: a stored LMS export (cartridge
// zip), read instead of the live Canvas API. See this package's index.ts
// header comment for the fidelity gap between the two sources - this file
// only names the shapes, it does not paper over that gap.

import type { CartridgeModule } from "@/lib/cartridge-import";
import type { CartridgeRubric } from "@/lib/cartridge-import-shared";
import type { CanvasPageSummary } from "@/lib/canvas-modules";

/**
 * Which Course Content source is active. Mirrors the "live"/"export"
 * vocabulary `ItemSource` already uses for selection keys
 * (src/app/components/content-tab/utils.ts) so a future picker/gating layer
 * shares one vocabulary instead of inventing a second.
 */
export type ContentSource = "canvas" | "export";

/**
 * The same top-level shape `listCourseContentAction` returns
 * (`{courseName, modules, pages}`), sourced from a stored export instead of
 * the live Canvas API.
 *
 * `modules` is `CartridgeModule[]`, deliberately NOT `CanvasModule[]`: a
 * `CanvasModuleItem` carries thirteen fields (id, moduleId, title, type,
 * position, indent, published, pageUrl, contentId, dueAt, pointsPossible,
 * htmlUrl, externalUrl) and a `CartridgeModuleItem` carries at most four
 * (title, type, identifier?, body?). Coercing the latter into the former's
 * type would require fabricating id/contentId/pageUrl/htmlUrl (Canvas
 * identity an export never carries) and published/indent/dueAt/pointsPossible
 * (Canvas-only state) - exactly the fabrication a consumer gating a control
 * on "is this field present and real" must never be handed. Reusing
 * `CartridgeModule`/`CartridgeModuleItem` as-is keeps every absence a real
 * TypeScript absence (the property is simply not there) instead of a
 * fabricated zero/false/null that reads as "present".
 *
 * `pages` is always empty. A cartridge's module_meta.xml (or a generic
 * manifest's organizations tree) enumerates items INSIDE modules; it is not
 * the standalone Canvas wiki-page list `listPages` reads from the live API
 * (every page in the course, including ones in no module, with publish/
 * front-page state). There is no cartridge-native source for that list, so
 * reporting zero here is an honest "this source cannot tell you", not a
 * fabricated one. Typed as `CanvasPageSummary[]` (not a new empty-only type)
 * so a consumer that only ever reads `.length` or iterates `pages` needs no
 * source-specific branch for this one field.
 */
export interface ExportCourseContent {
  courseName: string;
  modules: CartridgeModule[];
  pages: CanvasPageSummary[];
  /**
   * The cartridge's own `course_settings/rubrics.xml`, parsed by
   * `parseRubrics` (`src/lib/cartridge-import.ts:169`) and carried on the
   * parsed cartridge (`CartridgeCourseData.rubrics`,
   * `src/lib/cartridge-import-shared.ts:111`). Imported from
   * cartridge-import-shared.ts rather than cartridge-import.ts so this type
   * declaration does not name the parser module.
   *
   * IMPORTANT: a cartridge carries NO rubric-to-assignment association at
   * all - `CartridgeRubric` is just `{title, criteria}`, with nothing
   * linking a rubric to the module item(s) it might grade. This is
   * therefore a COURSE-LEVEL list only, not "this assignment's rubric": a
   * consumer must never present one of these as paired with a specific
   * export assignment. The only existing consumer today,
   * `useCourseImportActions.ts:214`, already treats it this way - it just
   * takes `rubrics[0]` (the first rubric in the export, unconditionally, for
   * a course-wide "import a rubric" action that has no assignment context
   * either).
   *
   * Always an array, never `undefined`, even when the cartridge had no
   * `rubrics.xml` at all (or an unparsed generic export) - so every consumer
   * can call `.length` with no guard, matching `pages` above.
   */
  rubrics: CartridgeRubric[];
}
