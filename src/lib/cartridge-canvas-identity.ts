// The Canvas identity a course export carries about ITSELF - read from
// course_settings/context.xml, a file distinct from course_settings.xml
// (parseCourseSettings in cartridge-import.ts) and not previously read
// anywhere in this app. A real Canvas export's context.xml holds the exact
// course id/name/domain of the live Canvas course the export was taken from,
// which is precisely the information docs/import-course-export-to-intro-
// video-acceptance-criteria.md's Part A exists to recover: an imported
// export and its live Canvas course are, today, invisible to each other -
// this module is the pure identity-extraction half of closing that gap
// (Part C's chooseImportDestination and Part B's upload flow are the callers
// that act on it; this module itself never touches a zip, the network, or
// Supabase).
//
// This module deliberately refuses to do three things:
//   - No zip handling. The caller (parseCartridgeBlob in cartridge-import.ts)
//     already owns the open zip/JSZip instance; this module takes a raw XML
//     string so it stays unit-testable with a plain fixture, the same
//     posture every other parse* function in this app's cartridge family
//     takes (parseCourseSettings, parseModuleMeta, parseRubrics).
//   - No I/O of any kind - no fetch, no filesystem, no Supabase import. A
//     future caller (e.g. a server action) can import this file without
//     bundling anything server-only or network-shaped into the browser.
//   - No throwing. A non-Canvas Common Cartridge, a Blackboard archive, or a
//     hand-edited/malformed export simply has no context.xml (or one missing
//     some tags) - that must degrade to null fields, not to a parse failure
//     that would take the whole cartridge import down with it.
//
// XML is matched with the same regex-based tagText helper every other parser
// in this file family uses (see cartridge-import-shared.ts's own header
// comment for why: both Canvas and Blackboard emit these files in a fixed
// machine-generated shape, so a full XML parser buys nothing here).
import { tagText } from "./cartridge-import-shared";

/** The Canvas identity a course export's own context.xml reports about
 * itself - the live Canvas course this export was taken from, if any. */
export interface CartridgeCanvasIdentity {
  courseId: string | null;
  courseName: string | null;
  canvasDomain: string | null;
}

/**
 * Parse course_settings/context.xml into the Canvas identity it reports.
 * Real Canvas exports carry a namespaced `<context_info>` root (xmlns
 * `http://canvas.instructure.com/xsd/cccv1p0`) with un-namespaced child tags
 * `<course_id>`, `<course_name>`, and `<canvas_domain>` - see this repo's
 * ground-truth fixture in cartridge-canvas-identity.test.ts, taken verbatim
 * from a real attached export. A sibling tag, `<root_account_id>`, is also
 * present and also numeric - tagText's regex anchors on `<course_id` (or
 * `<course_id\s`) directly after a `<`, so it can never match the longer
 * `<root_account_id` tag name; no special-casing is needed to keep the two
 * apart.
 *
 * Never throws: absent, empty, or tagless XML (a non-Canvas Common Cartridge
 * has no context.xml at all, and its caller passes an empty string in that
 * case - see parseCartridgeBlob) yields every field null rather than an
 * error, matching every other parse* function in this file family.
 */
export function parseCartridgeContextXml(xml: string): CartridgeCanvasIdentity {
  const text = typeof xml === "string" ? xml : "";
  return {
    courseId: tagText(text, "course_id"),
    courseName: tagText(text, "course_name"),
    canvasDomain: tagText(text, "canvas_domain"),
  };
}

// A bare "all digits" course id - anything else (empty, whitespace, letters,
// a stray XML fragment a hand-edited context.xml might leave behind) is
// refused. This is not defensive-programming caution: canvas-url.ts's
// parseCanvasCourseId, the downstream reader of any URL this function
// builds, matches courses via the regex /\/courses\/(\d+)/ - a non-digit id
// would produce a URL that function itself could never parse back out, which
// is worse than producing no URL at all (see cartridge-canvas-identity.test.ts
// for the round-trip proof).
const ALL_DIGITS = /^\d+$/;

/**
 * Build the Canvas course URL this identity describes, in the same shape
 * canvas-url.ts's parseCanvasCourseId can parse back out (its regex requires
 * a literal `/courses/<digits>` segment - see the ALL_DIGITS comment above).
 * Both `canvasDomain` and a numeric `courseId` present -> the full
 * `https://<domain>/courses/<id>`. Only a numeric `courseId` -> the
 * host-less `/courses/<id>` (the same shape CoursePicker.tsx/LmsCell.tsx
 * already emit for a live selection with no discoverable host - see
 * course-canvas-url-match.ts's own header comment). No usable `courseId` at
 * all -> null; there is nothing worth storing.
 */
export function cartridgeCanvasUrl(identity: CartridgeCanvasIdentity): string | null {
  const courseId = identity.courseId;
  if (!courseId || !ALL_DIGITS.test(courseId)) return null;
  if (identity.canvasDomain) return `https://${identity.canvasDomain}/courses/${courseId}`;
  return `/courses/${courseId}`;
}
