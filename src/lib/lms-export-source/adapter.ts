// Pure adapter: parsed cartridge data -> the shape Course Content renders.
// See types.ts for why `modules`/`pages` are typed the way they are.

import type { CartridgeCourseData } from "@/lib/cartridge-import";
import type { ExportCourseContent } from "./types";

/**
 * Adapt a parsed cartridge into the `{courseName, modules, pages}` shape.
 *
 * `modules` passes `data.modules` through UNCHANGED - no per-item remapping,
 * so there is no step here that could accidentally drop an optional field
 * (`identifier`, `body`) or fabricate a missing one. This is deliberate: the
 * fidelity gap between a live Canvas module/item and a cartridge one is real
 * (see types.ts), and the correct adapter behaviour is to preserve exactly
 * what the parser produced, not to normalize it toward the live shape.
 *
 * `courseName` falls back to `fallbackCourseName` (the course's own saved
 * name - instructor-provided, not Canvas-derived) when the cartridge itself
 * has no title (`data.title` is null - a generic/malformed export, or one
 * with no course_settings folder at all). This is a real, already-known
 * value, not a fabricated one.
 *
 * `pages` is always `[]` - see types.ts's `ExportCourseContent.pages` doc
 * comment for why a cartridge cannot supply this list at all.
 */
export function adaptCartridgeToCourseContent(
  data: CartridgeCourseData,
  fallbackCourseName: string
): ExportCourseContent {
  return {
    courseName: data.title ?? fallbackCourseName,
    modules: data.modules,
    pages: [],
  };
}
