// Pure matching rule for "which saved course row does this Canvas URL belong
// to" - AC S1 in docs/lms-tab-syllabus-buttons-acceptance-criteria.md. Matches
// on parseCanvasCourseId(url) AND host, never raw string equality, so a
// trailing slash, a query string, or an http/https mismatch on either side
// does not defeat the match. The local course row stays authoritative (AC
// decision 2) - this only decides WHICH row to use, never invents one. Pure -
// no I/O, so it is unit-testable without a Supabase or Canvas fixture.
import { parseCanvasCourseId } from "./canvas-url";

/**
 * Lowercased host of a Canvas URL. Tolerant of a schemeless input (retried
 * with "https://" prepended, since `new URL` throws without a scheme) so a
 * course row saved before validation existed still matches; null when
 * neither parse succeeds.
 */
function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    try {
      return new URL(`https://${url}`).host.toLowerCase();
    } catch {
      return null;
    }
  }
}

/**
 * True when `courseCanvasUrl` (a saved course row's canvasUrl) and
 * `tabCanvasUrl` (the LMS tab's currently loaded course) name the SAME Canvas
 * course: the same numeric course id AND the same host. Either URL missing,
 * unparseable, or pointing at a different id/host is false - never a
 * fallback guess.
 */
export function canvasUrlMatchesCourse(
  courseCanvasUrl: string | null | undefined,
  tabCanvasUrl: string
): boolean {
  const stored = (courseCanvasUrl ?? "").trim();
  if (!stored) return false;

  const storedId = parseCanvasCourseId(stored);
  const tabId = parseCanvasCourseId(tabCanvasUrl);
  if (!storedId || !tabId || storedId !== tabId) return false;

  const storedHost = hostOf(stored);
  const tabHost = hostOf(tabCanvasUrl);
  return !!storedHost && !!tabHost && storedHost === tabHost;
}

/**
 * Find the saved course row whose canvasUrl matches the LMS tab's current
 * course (AC S1). Returns null when no row matches - the caller reports this
 * as a specific, actionable "course not linked" message naming the URL (AC
 * S2), never a generic failure or a silent no-op.
 */
export function findCourseForCanvasUrl<T extends { canvasUrl: string | null }>(
  courses: T[],
  tabCanvasUrl: string
): T | null {
  return courses.find((c) => canvasUrlMatchesCourse(c.canvasUrl, tabCanvasUrl)) ?? null;
}
