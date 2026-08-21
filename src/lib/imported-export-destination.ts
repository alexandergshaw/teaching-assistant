// Which saved course_hub row an imported export file should land on - Part C
// of docs/import-course-export-to-intro-video-acceptance-criteria.md, widened
// by the chunk-3h defect fix below. Pure - no I/O, no Supabase, no mutation
// (C5 still holds for this wider rule) - so Part B's control (
// src/app/components/content-tab/ImportCourseExportControl.tsx) is the only
// thing that ever acts on this file's verdict; this file only decides, and
// now also tells the caller WHETHER a mutation (stamping canvasUrl onto an
// already-existing row) is warranted, via `stampCanvasUrl` on the "existing"
// branch of ImportDestination.
//
// THE DEFECT THIS WIDENING FIXES: the original C2 rule (kept below as match
// order (a)) only ever attached to a row whose canvasUrl already parsed to
// the cartridge's numeric course id. An instructor who reported the original
// "no saved course is linked" bug has, by construction, NO such row - that
// is precisely why the live-selection path failed for them. Before this fix,
// re-importing their export therefore always fell to "create", producing a
// SECOND, empty row that then received the stamped canvasUrl (C3/C4) and
// silently became the row live-selection resolves to - orphaning whatever
// real data (materials, roster, notes, ...) lived on the instructor's actual
// course row. Match order (b) below closes that gap conservatively: it only
// ever attaches to a row that is ALREADY, unambiguously, the same course by
// name, and that has no canvasUrl of its own yet to contradict the cartridge.
//
// MATCH ORDER, evaluated in this priority (first hit wins; ambiguity at
// either (a) or (b) falls through to (c) - never a guess):
//
//   (a) EXISTING BY CANVAS URL (the original C2 rule, unchanged): the
//       cartridge carries a numeric course id AND exactly ONE saved row's
//       canvasUrl parses (via parseCanvasCourseId, canvas-url.ts) to that
//       same id. `stampCanvasUrl` is always null here - the row's canvasUrl
//       already matches, so there is nothing to write.
//
//   (b) EXISTING BY NAME (new): the cartridge reports a courseName AND
//       exactly ONE saved row's name matches it (trimmed, case-folded) AND
//       that row's canvasUrl is blank/null/whitespace. Requiring a blank
//       canvasUrl is deliberate, not incidental: a row that already carries
//       a DIFFERENT Canvas URL is positive evidence it is a different
//       course (the same "a stored value is evidence, not a coincidence"
//       reasoning course-canvas-url-match.ts's own header comment gives for
//       why a registered, differing institution acronym is a decisive
//       rejection there) - so a name coincidence must never override it, and
//       such a row is simply never a candidate for (b) at all. On a match,
//       `stampCanvasUrl` is `cartridgeCanvasUrl(identity)` - non-null only
//       when the cartridge's own identity actually composes to a URL (i.e.
//       it carries a numeric courseId; see cartridge-canvas-identity.ts).
//
//   (c) Otherwise -> create, exactly as before this fix.
//
// Two or more matches at (a) OR at (b) each independently fall through to
// (c): this is the SAME refusal course-canvas-url-match.ts's
// findCourseForCanvasUrl takes in its own branch (b) - two candidates that
// cannot be told apart are exactly as unresolvable as zero, and picking one
// is a promise this module cannot honestly make. As with the original C2
// rule, this file never falls back to an `institution`/`acronym` signal to
// break either tie - chooseImportDestination has no such input, and Part B's
// control runs with zero institution context by design (B5) - so an
// ambiguous cartridge always creates a fresh row rather than risk attaching
// an instructor's fresh upload to a stranger's course.
import { parseCanvasCourseId } from "./canvas-url";
import { cartridgeCanvasUrl, type CartridgeCanvasIdentity } from "./cartridge-canvas-identity";

// A bare "all digits" course id, mirroring cartridge-canvas-identity.ts's own
// ALL_DIGITS guard (not exported there, so restated here rather than reached
// into). A non-numeric `identity.courseId` (absent, blank, or a stray XML
// fragment a hand-edited context.xml might leave behind) can never be the
// same value parseCanvasCourseId would extract from a stored row's URL - so
// it is never treated as a candidate id, and this module falls straight to
// "create" without scanning `courses` at all.
const ALL_DIGITS = /^\d+$/;

/**
 * The name to give a freshly created row, resolved from the cartridge's own
 * course_settings.xml title (`CartridgeCourseData.title`, see
 * cartridge-import.ts's parseCourseSettings) with a fallback to the
 * uploaded file's own name when that title is blank, missing, or
 * whitespace-only - a non-Canvas Common Cartridge, or a hand-edited archive,
 * may carry no title at all. `fileName` is expected to be a plain file name
 * (a browser File's `.name`, which never carries a directory component) but
 * a defensive basename split is applied anyway so a path-shaped input still
 * degrades sensibly rather than producing a name with slashes in it. Only
 * the LAST extension is stripped ("export.imscc" -> "export",
 * "backup.tar.gz" -> "backup.tar") - matching how every other single-
 * extension file this app accepts (.zip, .imscc) actually names itself.
 */
export function resolveImportFallbackName(title: string | null | undefined, fileName: string): string {
  const trimmedTitle = (title ?? "").trim();
  if (trimmedTitle) return trimmedTitle;
  const base = fileName.split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export type ImportDestination =
  | {
      kind: "existing";
      courseId: string;
      /**
       * Non-null ONLY when this row was matched by name (match order (b))
       * AND the cartridge's own identity composes to a real URL - see this
       * file's header comment. Match order (a) always yields null here: the
       * row's canvasUrl already parses to the cartridge's id, so there is
       * nothing to write. The caller (ImportCourseExportControl.tsx) is the
       * only thing that acts on a non-null value - this file never mutates
       * (C5).
       */
      stampCanvasUrl: string | null;
    }
  | { kind: "create"; name: string; canvasUrl: string | null };

/**
 * Decide where a newly parsed export should land: an existing saved row, or
 * a brand-new one. See this file's header comment for the full match order
 * ((a) canvas-url, (b) name, (c) create) and why ambiguity at (a) or (b)
 * resolves to "create" rather than a guess.
 *
 * `fallbackName` is the name to use IF a new row is created - callers pass
 * `resolveImportFallbackName(parsedCartridge.title, file.name)` above, so
 * the title-vs-basename decision is made once, in one testable place, and
 * this function only ever consumes the result. `courses` need not be
 * pre-filtered - every row is considered, including ones with a null
 * `canvasUrl` (they simply never match rule (a), since
 * parseCanvasCourseId(null-ish) is never attempted - a blank/absent
 * canvasUrl is skipped outright there) and ones with no name overlap at all
 * (they simply never match rule (b)).
 */
export function chooseImportDestination(
  courses: { id: string; name: string; canvasUrl: string | null }[],
  identity: CartridgeCanvasIdentity | undefined,
  fallbackName: string
): ImportDestination {
  // (a) EXISTING BY CANVAS URL - unchanged from the original C2 rule.
  const candidateId = identity?.courseId;
  if (candidateId && ALL_DIGITS.test(candidateId)) {
    const idMatches = courses.filter((c) => {
      const stored = (c.canvasUrl ?? "").trim();
      return !!stored && parseCanvasCourseId(stored) === candidateId;
    });
    if (idMatches.length === 1) {
      return { kind: "existing", courseId: idMatches[0].id, stampCanvasUrl: null };
    }
  }

  // (b) EXISTING BY NAME - new. Both the name-equality and the blank-
  // canvasUrl condition are part of ONE predicate: a row that matches the
  // name but already carries a different canvasUrl is not a candidate at
  // all (see header comment), so it can never contribute to this branch's
  // own ambiguity count either - only rows satisfying BOTH conditions are
  // counted, and two or more of THOSE is what falls through to (c).
  const candidateName = (identity?.courseName ?? "").trim().toLowerCase();
  if (candidateName) {
    const nameMatches = courses.filter((c) => {
      const sameName = c.name.trim().toLowerCase() === candidateName;
      const blankCanvasUrl = !(c.canvasUrl ?? "").trim();
      return sameName && blankCanvasUrl;
    });
    if (nameMatches.length === 1) {
      return {
        kind: "existing",
        courseId: nameMatches[0].id,
        stampCanvasUrl: identity ? cartridgeCanvasUrl(identity) : null,
      };
    }
  }

  // (c) create - the fallback for zero matches, ambiguity at (a) or (b), a
  // non-numeric/blank course id, and no usable course name at all.
  return {
    kind: "create",
    name: fallbackName,
    canvasUrl: identity ? cartridgeCanvasUrl(identity) : null,
  };
}
