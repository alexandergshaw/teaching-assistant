// Blackboard announcement parsing - split out for the same reason
// cartridge-import-blackboard-rubrics.ts was: a distinct concern from
// manifest/tree parsing and item body resolution, kept under the repo's
// 1000-line cap. Recovers the 16 weekly announcements a real Blackboard
// archive carries (docs/blackboard-announcements-acceptance-criteria.md).
//
// THE SHAPE (verified against the instructor's real archive). Sixteen
// resources, res00031.dat..res00046.dat, `type="resource/x-bb-announcement"`,
// NONE referenced from <organizations> - exactly like the rubric resource
// (docs/REGRESSION.md entry 302), so these are found by scanning the
// manifest's resource TYPES, never by walking the item tree. Each .dat's
// root is a single <ANNOUNCEMENT> element:
//   ANNOUNCEMENT/TITLE/@value                 - "Week 1 - Course Setup..."
//   ANNOUNCEMENT/DESCRIPTION/TEXT              - element text, singly
//                                                XML-escaped HTML
//   ANNOUNCEMENT/DATES/RESTRICTSTART/@value    - "2026-08-17 04:30:00 MDT"
//   ANNOUNCEMENT/ORDERNUM/@value                - "1".."16"
//   ANNOUNCEMENT/ISDRAFT/@value                 - "true" on all 16
//
// ANNOUNCEMENT/DATES/CREATED/@value is real but deliberately never read:
// CartridgeAnnouncement carries only RESTRICTSTART (as `releaseDate`) -
// nothing consumes CREATED, and this module family's standing rule (entry
// 302's `maxValue` rejection) is that a field gets added when a consumer
// needs it, not "for later".
//
// Element names are written here in the UPPERCASE convention the source
// shape comment above and docs/blackboard-announcements-acceptance-
// criteria.md both give for this specific resource - but per entry 302
// (a same-family parser that matched uppercase-only, passed all 29 of its
// synthetic tests, and returned ZERO rubrics from the real archive because
// Blackboard MIXES casing within one document), every match in this file is
// CASE-INSENSITIVE regardless, and this module's own fixtures include a
// mixed-casing document to prove that rather than assume it.
//
// Dependency direction: this file depends only on cartridge-import-shared.ts
// (for the CartridgeAnnouncement shape) and cartridge-import-blackboard-
// body.ts (for selfClosingAttrValue, decodeBlackboardHtmlPayload and
// BlackboardResourceEntry, exactly like cartridge-import-blackboard-
// rubrics.ts does) - never the reverse, avoiding an import cycle the same
// way those two files already do.
import { type CartridgeAnnouncement } from "./cartridge-import-shared";
import {
  type BlackboardResourceEntry,
  decodeBlackboardHtmlPayload,
  selfClosingAttrValue,
} from "./cartridge-import-blackboard-body";

// Degrade-safe substring match, same posture as
// BLACKBOARD_RUBRIC_TYPE_PATTERN in cartridge-import-blackboard-rubrics.ts:
// even though `resource/x-bb-announcement` IS independently verified against
// the real archive (unlike the rubric type when that pattern was written),
// matching on the stable "announcement" substring rather than the exact
// string means a manifest whose type carries an unnoticed variant (a
// different Blackboard version, a namespaced prefix) still yields its
// announcements instead of silently yielding none. A manifest with no
// matching resource simply yields no announcements, exactly the status quo
// before this module existed, rather than throwing.
const BLACKBOARD_ANNOUNCEMENT_TYPE_PATTERN = /announcement/i;

// Generic <TAG ...>...</TAG> block finder, CASE-INSENSITIVE - mirrors
// blackboardTagBlocks in cartridge-import-blackboard-rubrics.ts exactly
// (see that file's own comment for why: entry 302's near miss). Not shared
// between the two files - each Blackboard-family parser module owns its own
// copy, matching the existing split (rubrics does not import this from
// anywhere else either). The `\b` after the tag name stops `<ANNOUNCEMENT`
// from swallowing some future `<ANNOUNCEMENTX`-shaped tag, the same
// collision guard the rubric version documents for `<Rubric`/`<RubricRows`.
function blackboardBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) blocks.push(m[1]);
  return blocks;
}

// Parses ORDERNUM's raw string into a number - `null` for anything missing
// or non-finite, never a fabricated 0 (a 0 would sort BEFORE every real
// ordinal 1..16, exactly backwards from AC3's "sorts last" requirement).
function parseAnnouncementOrder(value: string | null): number | null {
  if (value === null) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

// AC2: ISDRAFT/@value === "true", case-insensitive (mirrors this module's
// own case-insensitivity posture throughout) - anything else (including
// absent) is treated as not-draft rather than guessed.
function parseAnnouncementIsDraft(value: string | null): boolean {
  return (value ?? "").toLowerCase() === "true";
}

// ANNOUNCEMENT/DESCRIPTION/TEXT, decoded through the exact same pipeline
// entry 301 built for item bodies - see decodeBlackboardHtmlPayload's own
// doc comment (cartridge-import-blackboard-body.ts) for the (b)-(f) steps.
// Returns "" (never null/undefined) when DESCRIPTION or TEXT is missing or
// empty, so `body` on CartridgeAnnouncement is always a real string - the
// "missing title or empty body handled honestly" case this module's own
// test suite covers.
function extractAnnouncementBody(announcementBlock: string): string {
  const descriptionBlock = blackboardBlocks(announcementBlock, "DESCRIPTION")[0];
  if (!descriptionBlock) return "";
  const textBlock = blackboardBlocks(descriptionBlock, "TEXT")[0];
  if (!textBlock) return "";
  return decodeBlackboardHtmlPayload(textBlock);
}

// One <ANNOUNCEMENT>...</ANNOUNCEMENT> block into a CartridgeAnnouncement.
// Unlike parseBlackboardRubric/parseBlackboardCriterion (which SKIP a
// title-less rubric/criterion entirely, mirroring parseRubrics), an
// announcement is never dropped for a missing title or empty body: this is
// the actual course content the instructor is trying to recover, not
// scaffolding metadata, so a blank field is surfaced honestly (`title: ""`,
// `body: ""`) rather than silently discarding the whole announcement -
// see this module's own test suite for the fixture pinning this.
function parseBlackboardAnnouncement(announcementBlock: string): CartridgeAnnouncement {
  // No head/tail scoping needed here (unlike parseBlackboardCriterion's
  // HEADER/RUBRICCOLUMNS split in cartridge-import-blackboard-rubrics.ts):
  // TITLE/ORDERNUM/ISDRAFT/RESTRICTSTART are each a UNIQUE element name
  // within one ANNOUNCEMENT block (no nested element reuses one of these
  // names the way ROW and COLUMN both have their own HEADER), and
  // DESCRIPTION/TEXT's own payload is singly-XML-escaped HTML - its raw
  // bytes contain no literal "<" at all (only "&lt;"), so it cannot contain
  // anything selfClosingAttrValue's regex could match regardless of where
  // in the block it is searched. ORDERNUM/ISDRAFT/DATES also sit AFTER
  // DESCRIPTION in the real archive's own element order (TITLE,
  // DESCRIPTION, DATES, ORDERNUM, ISDRAFT) - scoping to "before DESCRIPTION"
  // would silently lose all three, which is exactly the bug this comment
  // replaces (caught by this file's own test suite, not by tsc/eslint).
  const title = selfClosingAttrValue(announcementBlock, "TITLE") ?? "";
  const order = parseAnnouncementOrder(selfClosingAttrValue(announcementBlock, "ORDERNUM"));
  const isDraft = parseAnnouncementIsDraft(selfClosingAttrValue(announcementBlock, "ISDRAFT"));
  // AC-"the date is not ISO": read verbatim, never touched again - see
  // CartridgeAnnouncement.releaseDate's own doc comment for why no Date
  // conversion happens anywhere in this file.
  const releaseDate = selfClosingAttrValue(announcementBlock, "RESTRICTSTART");
  const body = extractAnnouncementBody(announcementBlock);

  return { title, body, releaseDate, order, isDraft };
}

/**
 * Parse a single Blackboard announcement resource's raw .dat XML (root
 * <ANNOUNCEMENT>, though this tolerates more than one per document the same
 * way parseBlackboardRubrics tolerates multiple <RUBRIC> blocks) into
 * CartridgeAnnouncement[]. Not sorted here - see resolveBlackboardAnnouncements,
 * which sorts once across every resource's announcements combined, not per
 * file.
 */
export function parseBlackboardAnnouncements(xml: string): CartridgeAnnouncement[] {
  return blackboardBlocks(xml, "ANNOUNCEMENT").map(parseBlackboardAnnouncement);
}

/**
 * Find and parse every announcement resource in a Blackboard manifest's
 * resources map (see BLACKBOARD_ANNOUNCEMENT_TYPE_PATTERN above), reading
 * only the candidate file(s) - never every resource in the archive.
 * Fail-forward, matching every other field in this module family: a
 * manifest with no matching resource, or a matching resource whose .dat
 * cannot be read, simply yields no announcements rather than failing the
 * whole import.
 *
 * AC3: the combined result is sorted by `order` ASCENDING, numerically -
 * never by resource filename and never by `resources` Map iteration order
 * (which follows manifest declaration order, not necessarily ORDERNUM order
 * - see this module's own test suite for a fixture where the two disagree).
 * An announcement with a `null` order (missing/non-numeric ORDERNUM) sorts
 * LAST rather than being dropped - `Array.prototype.sort` in this engine is
 * stable, so two `null`-order announcements keep their relative resource
 * order rather than being reshuffled.
 */
export async function resolveBlackboardAnnouncements(
  resources: Map<string, BlackboardResourceEntry>,
  readEntry: (path: string) => Promise<string | null>
): Promise<CartridgeAnnouncement[]> {
  const announcements: CartridgeAnnouncement[] = [];
  for (const entry of resources.values()) {
    if (!entry.type || !entry.bbFile || !BLACKBOARD_ANNOUNCEMENT_TYPE_PATTERN.test(entry.type)) continue;
    const dat = await readEntry(entry.bbFile);
    if (!dat) continue;
    announcements.push(...parseBlackboardAnnouncements(dat));
  }
  announcements.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  return announcements;
}
