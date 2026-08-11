// Second Course Content SOURCE for the LMS tab: a stored export (cartridge
// zip), read and adapted into the same `{courseName, modules, pages}` shape
// `listCourseContentAction` returns, so a consumer can eventually fetch from
// either source through one call shape. See docs/REGRESSION.md entries
// 260-262 for the selection-layer and generation baseline this sits
// alongside, and entry 261 specifically for why export items now carry a
// real, spec-guaranteed `identifier`.
//
// THE FIDELITY GAP IS REAL AND NOT PAPERED OVER HERE. A `CanvasModuleItem`
// carries thirteen fields (id, moduleId, title, type, position, indent,
// published, pageUrl, contentId, dueAt, pointsPossible, htmlUrl,
// externalUrl); a `CartridgeModuleItem` carries at most four (title, type,
// identifier?, body?). This package never fabricates the difference - a
// missing Canvas identity field or piece of Canvas-only state is simply
// absent from the type a consumer sees (see types.ts), never defaulted to an
// id, a `false`, or a zero. `type` on a cartridge item is frequently blank
// ("") on non-Canvas exports (docs/REGRESSION.md entry 261's generic-
// cartridge caveat) - any code keying off item type, including future
// consumers of this package's output, must tolerate that.
//
// This package deliberately does NOT choose which source is active or render
// anything - that is ContentTab's (and, next, a source picker's) job.

export { adaptCartridgeToCourseContent } from "./adapter";
export { KeyedPromiseCache } from "./cache";
export { readExportCourseContent } from "./read-export-course-content";
export type { ContentSource, ExportCourseContent } from "./types";
