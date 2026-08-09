// Builds the "plain zip of the announcement documents" OUT format for the
// packaged weekly-announcement feature
// (docs/weekly-announcement-package-io-acceptance-criteria.md, AC3 item 21).
// This is the sibling of the .imscc builder (src/lib/workflows/common-
// cartridge.ts) for instructors who just want the drafted text as files
// rather than an importable course package.
//
// Split into a pure/sync half and a thin async wrapper, mirroring
// buildCommonCartridge's own JSZip idiom (common-cartridge.ts:379) and the
// "pure core, JSZip shell" shape cartridge-import-stamp.ts documents for the
// same reason: buildAnnouncementZipEntries is the ENTIRE testable surface.
// It touches no Date, no fetch, no JSZip, so every rule about file names,
// front-matter shape, sort order, and the two throw cases can be pinned with
// frozen-literal string assertions that never touch a zip archive.
// buildAnnouncementZip is a two-line wrapper that feeds those entries to
// JSZip via the codebase's established dynamic-import idiom
// (`const { default: JSZip } = await import("jszip")`, also used by
// src/lib/cartridge-import.ts), which keeps this module importable from a
// client bundle without pulling jszip into every caller that only wants the
// entries.

/** One week's already-drafted announcement, ready to render into a file. */
export interface PackagedAnnouncement {
  week: number;
  title: string;
  message: string; // plain text / markdown-lite, as drafted
  postAtIso: string; // the week's resolved slot, ISO-8601
}

/** Course- and run-level facts every rendered file/README line needs. */
export interface AnnouncementZipOptions {
  courseName: string;
  weekdayLabel: string; // e.g. "Monday"
  postTimeLabel: string; // e.g. "09:30" or "08:00"
  // The resolved CHOICE from resolveAnnouncementEmailCopy's `value`
  // (src/lib/announcement-schedule.ts) - machine-readable, written into
  // every week's front matter as a bare true/false/null scalar (AC4 item
  // 27). This is what a downstream tool parses; it is NOT prose. Required
  // alongside emailCopyNote (below) so a caller cannot supply the human
  // note and silently drop the machine-readable choice.
  emailCopy: boolean | null;
  // The human-readable `note` from the same resolver; rendered verbatim,
  // README only.
  emailCopyNote: string;
}

// Zero-pad the week number to AT LEAST this many digits - never truncate, so
// week 100 renders as "100", not "00" (AC3 item 21's file-per-week rule,
// this module's own zero-padding requirement).
const MIN_WEEK_DIGITS = 2;

function weekFileName(week: number): string {
  const padded = String(week).padStart(MIN_WEEK_DIGITS, "0");
  return `week-${padded}-announcement.md`;
}

// Collapses a title to a single line so it can never be mistaken for a
// front-matter delimiter or split the YAML-ish block across lines - e.g. a
// drafted title that came back with an embedded newline or tab. Any run of
// whitespace (space, tab, newline) becomes one space, then the result is
// trimmed.
function normalizeTitleLine(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

// Every scalar written into the front-matter block goes through this SAME
// function - uniformly, not case by case - so no field can ever be the one
// that was forgotten. JSON.stringify does exactly what a YAML-ish
// front-matter scalar needs, for every type this block carries:
//   - a string (postAtIso) comes out properly quoted AND escaped, so an
//     embedded quote, backslash, or - critically - a newline followed by a
//     line that looks like `---` (or another `key: value` pair) can never
//     prematurely close the block or inject a field. It is folded onto the
//     ONE line the front matter already gives it.
//   - a boolean or null (emailCopy) comes out as its own bare, unquoted
//     JSON literal - `true` / `false` / `null` - which is exactly the
//     machine-readable scalar AC4 item 27 requires, never a quoted string.
//   - a number (week) comes out bare too, with no behavior change from
//     before.
// Hardening every field this way (rather than only the one field a past
// defect happened to touch) is the point: the escaping discipline does not
// depend on which field is a string today.
function frontMatterScalar(value: string | number | boolean | null): string {
  return JSON.stringify(value);
}

// The front-matter block is exactly two `---` delimiter lines with three
// fields between them - see frontMatterScalar above for how each field is
// hardened against breaking that block open.
function buildFrontMatter(item: PackagedAnnouncement, options: AnnouncementZipOptions): string {
  return [
    "---",
    `week: ${frontMatterScalar(item.week)}`,
    `postAt: ${frontMatterScalar(item.postAtIso)}`,
    `emailCopy: ${frontMatterScalar(options.emailCopy)}`,
    "---",
  ].join("\n");
}

// A message that itself begins with a `---` line cannot corrupt the front
// matter above: the block already closes with its own second `---` line
// BEFORE the blank line + "# <title>" heading + blank line that always
// separate it from the body, so a front-matter reader that stops at the
// first closing delimiter (the standard behavior, e.g. gray-matter) never
// sees anything from the body. The title is normalized to one line (above)
// for the same reason on the other side of the block.
function buildWeekFileContent(item: PackagedAnnouncement, options: AnnouncementZipOptions): string {
  const title = normalizeTitleLine(item.title);
  const frontMatter = buildFrontMatter(item, options);
  return `${frontMatter}\n\n# ${title}\n\n${item.message}\n`;
}

function buildReadmeContent(sortedItems: PackagedAnnouncement[], options: AnnouncementZipOptions): string {
  const lines = [
    `# ${options.courseName} - Weekly Announcements`,
    "",
    `Weekday: ${options.weekdayLabel}`,
    `Post time: ${options.postTimeLabel}`,
    `Email copy: ${options.emailCopyNote}`,
    "",
    "## Weeks",
    "",
  ];

  for (const item of sortedItems) {
    lines.push(`- Week ${item.week}: ${item.postAtIso} - ${normalizeTitleLine(item.title)}`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Pure, synchronous entry builder - the whole testable surface for this
 * module (see this file's header comment). Items are sorted by `week`
 * ascending before anything is rendered, regardless of input order, so both
 * the per-week entry order and the README's week list are always ascending.
 *
 * Throws (never returns a partial/empty result):
 *   - "There are no announcements to package." for an empty `items` array -
 *     a packaged run must never silently produce an empty zip.
 *   - "Two announcements were built for week N." when the same week number
 *     appears twice - that is an upstream planning bug, not a case this
 *     builder can resolve by picking one.
 */
export function buildAnnouncementZipEntries(
  items: PackagedAnnouncement[],
  options: AnnouncementZipOptions
): Array<{ path: string; content: string }> {
  if (items.length === 0) {
    throw new Error("There are no announcements to package.");
  }

  const seenWeeks = new Set<number>();
  for (const item of items) {
    if (seenWeeks.has(item.week)) {
      throw new Error(`Two announcements were built for week ${item.week}.`);
    }
    seenWeeks.add(item.week);
  }

  const sorted = [...items].sort((a, b) => a.week - b.week);

  const entries = sorted.map((item) => ({
    path: weekFileName(item.week),
    content: buildWeekFileContent(item, options),
  }));

  // README last: AC3 item 21 describes the zip as "per in-session week, one
  // week-NN-announcement.md file ... plus one README.md" - the README
  // summarizes what came before it, not the other way around.
  entries.push({ path: "README.md", content: buildReadmeContent(sorted, options) });

  return entries;
}

/**
 * Thin async wrapper: feeds buildAnnouncementZipEntries's output into a real
 * JSZip archive. Isomorphic - runs under both the browser (where the
 * attended runner flushes the resulting Blob as a download,
 * DOWNLOADABLE_OUTPUT_KEY, run-logging.ts) and Node (Blob is global on
 * Node 18+, which is what makes this safe to unit test under vitest's node
 * environment without a DOM).
 */
export async function buildAnnouncementZip(
  items: PackagedAnnouncement[],
  options: AnnouncementZipOptions
): Promise<Blob> {
  const entries = buildAnnouncementZipEntries(items, options);

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const entry of entries) {
    zip.file(entry.path, entry.content);
  }

  return await zip.generateAsync({ type: "blob" });
}
