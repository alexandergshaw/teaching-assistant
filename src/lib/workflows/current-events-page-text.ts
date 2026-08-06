// Extracted out of current-events-report.ts so a CLIENT-REACHABLE workflow
// step can import it. This function is pure string reshaping with NO
// imports at all (not even a type-only one) - deliberately, so it can never
// pick up a server-only dependency by accident, no matter what
// current-events-report.ts itself imports.
//
// current-events-report.ts's own jsonObjectSlice import has SINCE been
// re-pointed from the "@/app/actions/shared" barrel (which re-exports
// writing-style-block -> @/lib/supabase/server -> next/headers) to the
// dependency-free "@/lib/json-slice" module directly (see that file's own
// header comment), so current-events-report.ts no longer drags that server
// chain into a client bundle either. This module stays extracted anyway:
// steps.course-build-current-events.ts, which imports it, runs IN THE
// BROWSER (attended workflow steps run client-side), and keeping this reflow
// helper in its own zero-import file means that guarantee can never silently
// break again if current-events-report.ts picks up a new server-only import
// later - exactly the failure mode that motivated this extraction in the
// first place (tsc, eslint, and vitest all stayed green when it broke;
// only `next build` caught it).
//
// Same extract-and-re-export shape course-schedule-docx.ts uses for exactly
// the same reason. current-events-report.ts re-exports this name, so its own
// tests and any other importer are unchanged.

/**
 * Reflow buildCurrentEventsDocMarkdown's own output - a level-0 headline
 * bullet ("- headline - date (angle)") with indented level-1 "Why it
 * matters"/"Source" sub-bullets, see that function's own doc comment - into
 * flat, single-level bullets for markdownLiteToHtml (../markdown-lite.ts),
 * which understands only ONE list level: every line has its leading
 * whitespace trimmed away before it is checked for a "- " prefix, so an
 * indented sub-bullet would otherwise render as its own SIBLING <li>,
 * indistinguishable from the headline bullet it actually belongs under -
 * exactly the LMS-page confusion this function exists to avoid. Each indented
 * sub-bullet line is folded into the immediately preceding top-level bullet's
 * own line (joined with " - "), so a reader still sees "Why it matters" and
 * "Source" attached to the item they describe, just on one combined line
 * instead of a nested list. A bullet with no leading whitespace (an item with
 * no sub-bullets, a Sources-section "- [title](url)" link, a theme/prompt/
 * note bullet) and every non-bullet line (headings, plain body text, blank
 * lines) pass through completely unchanged.
 *
 * This is what gives this step's `pageText` output (steps.course-build-
 * current-events.ts) - stored on the generated file and, when postToLms is
 * on, fed through markdownLiteToHtml into the LMS page body - real heading
 * structure and clickable citation links (via markdown-lite's own bare-URL/
 * `[text](url)` support, see markdown-lite.ts) instead of the flat, ALL-CAPS,
 * "1. Title: url" plain text `buildCurrentEventsReport` produces.
 *
 * Pure and read-only with respect to `docMarkdown` - this never mutates or
 * regenerates the .docx path (buildCurrentEventsDocMarkdown itself, and the
 * document built from its output via buildDocxFromPlainText, are both left
 * completely untouched); it only reshapes a COPY of that already-built
 * markdown string for the separate LMS/pageText path.
 */
export function buildCurrentEventsPageText(docMarkdown: string): string {
  const lines = docMarkdown.split("\n");
  const out: string[] = [];

  for (const rawLine of lines) {
    const subBulletMatch = rawLine.match(/^\s+[-*]\s+(.*)$/);
    if (subBulletMatch && out.length > 0 && /^[-*]\s+/.test(out[out.length - 1])) {
      out[out.length - 1] = `${out[out.length - 1]} - ${subBulletMatch[1]}`;
      continue;
    }
    out.push(rawLine);
  }

  return out.join("\n");
}
