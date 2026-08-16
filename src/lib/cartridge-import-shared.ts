// Shared shape and low-level XML parsing primitives used by BOTH cartridge
// source families this app reads: the Canvas / generic IMS Common Cartridge
// path (cartridge-import.ts) and the Blackboard course-archive path
// (cartridge-import-blackboard.ts). Split out specifically so those two
// files can each depend on this one without depending on EACH OTHER -
// cartridge-import.ts calls into cartridge-import-blackboard.ts (to dispatch
// a Blackboard-flagged archive), so a reverse edge back into
// cartridge-import.ts would be a real import cycle, not just an
// organizational nicety. Everything here is intentionally free of any
// Canvas-only or Blackboard-only format knowledge - see each of those two
// files' own header comments for the format-specific parsing.
//
// XML is matched with regexes rather than a parser, mirroring the cartridge
// title sniffing in src/lib/workflows/registry.ts - both Canvas and
// Blackboard emit these files in a fixed machine-generated shape.

/** A module item as the tile handlers consume it (mirrors the live LMS shape). */
export interface CartridgeModuleItem {
  title: string;
  type: string;
  /**
   * The item's own identifier from the export XML - Canvas module_meta.xml's
   * `<item identifier="...">` attribute, or a generic IMS Common Cartridge
   * manifest's organizations `<item identifier="...">` attribute (see
   * parseModuleMetaWithRefs and parseGenericCartridge in cartridge-import.ts
   * for where each is read). This is a DIFFERENT value from identifierref
   * (which points at a <resource> for body resolution, see
   * resolveCartridgeItemBodies below) - this is the item's own stable
   * identity, the thing a title-based or positional (`moduleIndex:itemIndex`)
   * selection key cannot provide: two items in the same module can share a
   * title, and a positional key silently mis-targets across re-parses of a
   * changed zip (the module-level version of this bug is exactly what
   * findModuleByNumber/extractModuleNumber in course-item-classifier.ts exist
   * to prevent one level up). Optional because not every cartridge flavour
   * supplies one - a hand-edited or malformed manifest (Canvas, generic
   * Common Cartridge, or Blackboard alike) could omit the attribute on a
   * given `<item>` node. The Blackboard path (cartridge-import-blackboard.ts)
   * DOES populate this field, from the same kind of node-own `identifier`
   * attribute Canvas/generic Common Cartridge items carry (see
   * resolveBlackboardItemTypes there) - not from `identifierref`, which is a
   * different value entirely (see immediately below). A missing identifier
   * must not break parsing; it simply leaves this field unset, exactly like
   * `body` below.
   */
  identifier?: string;
  /**
   * Tag-stripped body text resolved from the item's linked content (Canvas/
   * generic Common Cartridge: the HTML resource an identifierref points at,
   * via resolveCartridgeItemBodies below; Blackboard: the item's own
   * resNNNNN.dat resource file, via the same resolveCartridgeItemBodies pass
   * - see cartridge-import-blackboard.ts's own comment on where that
   * resource's inline text actually lives), capped at
   * MAX_CARTRIDGE_ITEM_BODY_CHARS. This is what lets a course-export source
   * carry an assignment's actual instructions instead of just its title -
   * the INFO 1020 Week 8 bug this field fixes: a Course Build run had
   * nothing but "Assignment: Module 08 Assignment" to work with, so the
   * generated deck never mentioned mod10.zip, Page 330, or the GitHub
   * submission steps the assignment body actually specifies.
   *
   * Optional/undefined (never null) for an item whose body was never
   * resolved - no identifierref, no matching resource, no content at that
   * path in the zip, or a resource with nothing tag-strippable to extract.
   * This is deliberate, not an oversight: Vitest's toEqual treats an absent
   * key and a present-but-undefined key as equivalent, which is what keeps
   * every pre-existing `toEqual({ title, type })` assertion in
   * cartridge-import.test.ts and cartridge-import-blackboard.test.ts passing
   * unchanged - a literal `body: null` would fail those same assertions
   * (toEqual does NOT treat null as equivalent to absent).
   */
  body?: string;
}

/** A course module from course_settings/module_meta.xml. */
export interface CartridgeModule {
  name: string;
  position: number;
  items: CartridgeModuleItem[];
  /**
   * The module's own identifier from the export XML - Canvas module_meta.xml's
   * `<module identifier="...">` attribute, or a generic IMS Common Cartridge
   * manifest's top-level organizations `<item identifier="...">` attribute
   * (a module IS an `<item>` at that level - see parseGenericCartridge in
   * cartridge-import.ts). Same optionality rationale as
   * CartridgeModuleItem.identifier above: not every cartridge flavour or
   * manifest supplies one, and its absence must not break parsing.
   */
  identifier?: string;
}

/** A rubric rating/criterion pair (mirrors the live LMS rubric shape). */
export interface CartridgeRubricRating {
  description: string;
  points: number;
}

export interface CartridgeRubricCriterion {
  description: string;
  points: number;
  longDescription: string | null;
  ratings: CartridgeRubricRating[];
}

export interface CartridgeRubric {
  title: string;
  criteria: CartridgeRubricCriterion[];
}

/** Everything tile population can draw from an uploaded LMS export. */
export interface CartridgeCourseData {
  title: string | null;
  courseCode: string | null;
  startAt: string | null;
  syllabusHtml: string | null;
  modules: CartridgeModule[];
  rubrics: CartridgeRubric[];
  /** True when the archive carried a Canvas course_settings folder at all. */
  hasCourseSettings: boolean;
  /**
   * True when the archive itself carries this app's internal "built by
   * Course Build" stamp (cartridge-import-stamp.ts's CARTRIDGE_STAMP_PATH),
   * as opposed to the EXTERNAL `generated` flag courses-table-helpers.ts
   * tracks on the export_files DB row. This field is what survives a
   * download-then-re-upload round trip, since the DB flag does not travel
   * with the file. False/absent for every cartridge built before the stamp
   * existed and for every genuine instructor export - see
   * detectAppGeneratedCartridge in cartridge-import.ts, which this field is
   * populated from. Optional rather than a required boolean for the same
   * reason `description` below is optional: every pre-existing
   * CartridgeCourseData fixture across the codebase that never asked for
   * this field stays valid rather than needing an `appGenerated: false`
   * added everywhere; an absent value reads as "not app-generated", the same
   * safe default an explicit `false` would give.
   */
  appGenerated?: boolean;
  /**
   * The course-level description recovered from a Blackboard archive's
   * course record (res00001.dat's <DESCRIPTION> - see
   * cartridge-import-blackboard.ts's parseBlackboardArchive). Optional
   * rather than string|null: no other source populates it today (Canvas's
   * course_settings.xml has no equivalent field this app already reads), so
   * every existing caller that never asked for it stays unchanged rather
   * than needing a `?? null` everywhere.
   */
  description?: string | null;
}

// Single-pass entity decode so produced characters are never re-decoded
// ("&#38;lt;" is the literal string "&lt;", not "<"). Out-of-range numeric
// references are left as-is instead of throwing.
export function decodeXml(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-fA-F]+|lt|gt|quot|apos|amp);/g, (match, body: string) => {
    if (body === "lt") return "<";
    if (body === "gt") return ">";
    if (body === "quot") return '"';
    if (body === "apos") return "'";
    if (body === "amp") return "&";
    const code = body.startsWith("#x") ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    const valid = Number.isFinite(code) && code >= 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff);
    return valid ? String.fromCodePoint(code) : match;
  });
}

// First <tag>...</tag> text content within a block (attributes on the opening
// tag tolerated), entity-decoded.
export function tagText(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1].trim()) : null;
}

// Attribute-value lookup scoped to an already-isolated opening-tag attribute
// string (e.g. the captured group of a `<resource ...>` or `<item ...>`
// match). The `(?:^|\s)` guard stops "type" from matching inside an
// unrelated attribute name that merely ends in "type".
export function attrValue(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
}

/** Find direct child <item> blocks at current depth, handling nested <item> elements. */
export function findDirectChildItemBlocks(content: string): string[] {
  const blocks: string[] = [];
  const itemRegex = /<item(?:\s[^>]*)?>|<\/item>/g;
  let match;
  let depth = 0;
  let blockStart = -1;

  while ((match = itemRegex.exec(content)) !== null) {
    if (match[0].startsWith("</")) {
      depth--;
      if (depth === 0 && blockStart !== -1) {
        blocks.push(content.substring(blockStart, match.index + match[0].length));
        blockStart = -1;
      }
    } else {
      if (depth === 0) {
        blockStart = match.index;
      }
      depth++;
    }
  }

  return blocks;
}

/** Extract the inner content of an <item> block, excluding the opening and closing tags. */
export function getItemInnerContent(itemBlock: string): string {
  const openEnd = itemBlock.indexOf(">");
  if (openEnd === -1) return "";

  const closeStart = itemBlock.lastIndexOf("</item>");
  if (closeStart === -1) return "";

  return itemBlock.substring(openEnd + 1, closeStart);
}

// ---------------------------------------------------------------------------
// Item body resolution - shared by both the Canvas / generic Common
// Cartridge path (cartridge-import.ts) and the Blackboard path
// (cartridge-import-blackboard.ts).
//
// Per-item cap: a "Learning Materials" page can legitimately run to
// syllabus length, and a single oversized page must not crowd out every
// other item's body once registry-helpers.sources.ts concatenates a
// module's items back together for the generator prompt. There is
// deliberately no TOTAL cap at this layer (across every item in the whole
// archive) - parseCartridgeBlob is a general-purpose reader used by tile
// population and multiple workflow sources, not just deck generation, so
// bounding the aggregate prompt budget is left to the specific consumer
// that knows its own budget (registry-helpers.sources.ts's MATERIALS_CAP
// and its assignment-body budget - see formatExportModuleMaterials there).
export const MAX_CARTRIDGE_ITEM_BODY_CHARS = 3000;

/**
 * Resolve each item's body text in place (mutates the item objects already
 * sitting inside `modules` - safe because each caller owns these item
 * objects exclusively at the point it calls this). `itemRefs` is an
 * identifierref side table keyed by item identity - produced alongside
 * `modules` by parseModuleMetaWithRefs or parseGenericCartridge on the
 * Canvas/generic path, or by resolveBlackboardItemTypes on the Blackboard
 * path (see each one's own doc comment for why identifierref travels as a
 * Map rather than a field on the item itself: this app's own cartridge
 * export always populates one, so a merely-optional field on
 * CartridgeModuleItem would not stay invisible to existing exact-equality
 * `toEqual({ title, type })` test fixtures the way an absent Map entry
 * does). `htmlHrefs` maps that same identifierref to the zip path this
 * function should read as the item's body source - on the Canvas/generic
 * path that is a separate HTML file the manifest's <resources> block points
 * at (parseManifestResourceHtmlHrefs); on the Blackboard path it is the
 * item's own resNNNNN.dat resource file, whose inline text this function's
 * blanket tag-strip below extracts on its own (see
 * cartridge-import-blackboard.ts's buildBlackboardBodyPaths for why no
 * Blackboard-specific extraction logic is needed here at all). Fail-forward
 * per item, matching every other field in this module family: an item with
 * no entry in `itemRefs`, an identifierref with no resolving path, or a
 * path the zip does not actually contain, simply keeps `body` unset rather
 * than the whole import failing over one bad reference.
 */
export async function resolveCartridgeItemBodies(
  modules: CartridgeModule[],
  itemRefs: Map<CartridgeModuleItem, string>,
  htmlHrefs: Map<string, string>,
  readEntry: (path: string) => Promise<string | null>
): Promise<void> {
  for (const courseModule of modules) {
    for (const item of courseModule.items) {
      const identifierref = itemRefs.get(item);
      if (!identifierref) continue;
      const href = htmlHrefs.get(identifierref);
      if (!href) continue;
      const html = await readEntry(href);
      if (!html) continue;
      const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!text) continue;
      item.body =
        text.length > MAX_CARTRIDGE_ITEM_BODY_CHARS ? `${text.slice(0, MAX_CARTRIDGE_ITEM_BODY_CHARS)}...` : text;
    }
  }
}
