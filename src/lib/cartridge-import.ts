// Read course data back out of an LMS export package (.imscc or a Blackboard
// course archive). Canvas exports carry a course_settings/ folder with the
// course metadata, module structure, rubrics, and syllabus HTML; this module
// extracts the pieces the course card tiles can be populated from when there
// is no live LMS connection.
//
// This file owns the Canvas / generic IMS Common Cartridge parsing path and
// the top-level parseCartridgeBlob dispatcher. Two companion modules split
// out of it along real seams:
//   - cartridge-import-shared.ts - low-level XML helpers and the
//     CartridgeModuleItem/CartridgeModule/CartridgeCourseData shapes, used by
//     both this file and the Blackboard path below.
//   - cartridge-import-blackboard.ts - Blackboard course-archive parsing
//     (a DIFFERENT export format that also happens to be a zip with an
//     imsmanifest.xml at its root - see detectCartridgeFormat below, and
//     that file's own header comment for the format itself).
// Both re-export their public pieces through this file so every existing
// `from "@/lib/cartridge-import"` import keeps working unchanged.
//
// XML is matched with regexes rather than a parser, mirroring the cartridge
// title sniffing in src/lib/workflows/registry.ts - both Canvas and
// Blackboard emit these files in a fixed machine-generated shape.

import {
  type CartridgeCourseData,
  type CartridgeModule,
  type CartridgeModuleItem,
  type CartridgeRubric,
  type CartridgeRubricCriterion,
  type CartridgeRubricRating,
  attrValue,
  decodeXml,
  findDirectChildItemBlocks,
  getItemInnerContent,
  resolveCartridgeItemBodies,
  tagText,
} from "./cartridge-import-shared";
import { parseBlackboardArchive } from "./cartridge-import-blackboard";

// Re-exported so every existing `from "@/lib/cartridge-import"` import keeps
// working unchanged now that these live in the two companion modules above -
// see this file's header comment.
export type {
  CartridgeCourseData,
  CartridgeModule,
  CartridgeModuleItem,
  CartridgeRubric,
  CartridgeRubricCriterion,
  CartridgeRubricRating,
} from "./cartridge-import-shared";
export { MAX_CARTRIDGE_ITEM_BODY_CHARS } from "./cartridge-import-shared";
export { parseBlackboardManifest } from "./cartridge-import-blackboard";
export type {
  BlackboardManifestResult,
  BlackboardItemDraft,
  BlackboardModuleDraft,
} from "./cartridge-import-blackboard";

// First <tag>...</tag> text content's NUMERIC value within a block.
function tagNumber(block: string, tag: string): number | null {
  const text = tagText(block, tag);
  if (text === null) return null;
  const n = parseFloat(text);
  return Number.isFinite(n) ? n : null;
}

// All <tag ...>...</tag> inner blocks (used for module/item/rubric lists).
function tagBlocks(xml: string, tag: string): string[] {
  const blocks: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    blocks.push(m[1]);
  }
  return blocks;
}

/**
 * Parse course_settings/module_meta.xml into ordered modules with items, plus
 * a side table of each item's <identifierref> - its pointer into
 * imsmanifest.xml's <resources> block, needed by parseCartridgeBlob's async
 * body-resolution pass (see resolveCartridgeItemBodies in
 * cartridge-import-shared.ts) to find the HTML file backing an item's body.
 *
 * identifierref is returned via an item-identity-keyed Map rather than as a
 * field on CartridgeModuleItem itself - a real Canvas export (and this app's
 * own buildModuleMetaXml, which cartridge-import.test.ts's "parses the
 * module XML this app itself exports" fixture uses verbatim) always
 * populates <identifierref>, so it is never null/absent the way a merely
 * optional field would need to be to stay invisible to that test's
 * `toEqual({ title, type })` assertions. A Map keeps CartridgeModuleItem's
 * public shape - and every existing exact-equality test built on it - byte
 * for byte unchanged, while still letting parseCartridgeBlob look the value
 * back up by the exact item object it already has in hand.
 */
function parseModuleMetaWithRefs(xml: string): {
  modules: CartridgeModule[];
  refs: Map<CartridgeModuleItem, string>;
} {
  const modules: CartridgeModule[] = [];
  const refs = new Map<CartridgeModuleItem, string>();
  for (const block of tagBlocks(xml, "module")) {
    // Module-level fields sit before <items>; item blocks carry their own
    // <title>, so scope the module title to the head of the block.
    const itemsStart = block.indexOf("<items>");
    const head = itemsStart === -1 ? block : block.slice(0, itemsStart);
    const name = tagText(head, "title");
    if (!name) continue;
    const position = tagNumber(head, "position") ?? modules.length + 1;
    const items: CartridgeModuleItem[] = [];
    const itemsBlock = itemsStart === -1 ? "" : block.slice(itemsStart);
    for (const itemBlock of tagBlocks(itemsBlock, "item")) {
      const title = tagText(itemBlock, "title");
      const type = tagText(itemBlock, "content_type");
      if (title === null && type === null) continue;
      const item: CartridgeModuleItem = { title: title ?? "", type: type ?? "" };
      const identifierref = tagText(itemBlock, "identifierref");
      if (identifierref) refs.set(item, identifierref);
      items.push(item);
    }
    modules.push({ name, position, items });
  }
  modules.sort((a, b) => a.position - b.position);
  return { modules, refs };
}

/** Parse course_settings/module_meta.xml into ordered modules with items.
 * Title/type extraction is unchanged from before body resolution existed -
 * this is a thin wrapper over parseModuleMetaWithRefs that drops the
 * identifierref side table, which is scaffolding for parseCartridgeBlob's
 * own use (see that function's doc comment) and not part of this function's
 * public contract. */
export function parseModuleMeta(xml: string): CartridgeModule[] {
  return parseModuleMetaWithRefs(xml).modules;
}

/** Parse course_settings/rubrics.xml into the live-LMS rubric shape. */
export function parseRubrics(xml: string): CartridgeRubric[] {
  const rubrics: CartridgeRubric[] = [];
  for (const block of tagBlocks(xml, "rubric")) {
    const criteriaStart = block.indexOf("<criteria>");
    const head = criteriaStart === -1 ? block : block.slice(0, criteriaStart);
    const title = tagText(head, "title");
    if (!title) continue;
    const criteria: CartridgeRubricCriterion[] = [];
    const criteriaBlock = criteriaStart === -1 ? "" : block.slice(criteriaStart);
    for (const critBlock of tagBlocks(criteriaBlock, "criterion")) {
      // The criterion's own description/points come before its <ratings>.
      const ratingsStart = critBlock.indexOf("<ratings>");
      const critHead = ratingsStart === -1 ? critBlock : critBlock.slice(0, ratingsStart);
      const description = tagText(critHead, "description");
      if (description === null) continue;
      const ratings: CartridgeRubricRating[] = [];
      const ratingsBlock = ratingsStart === -1 ? "" : critBlock.slice(ratingsStart);
      for (const ratingBlock of tagBlocks(ratingsBlock, "rating")) {
        const ratingDescription = tagText(ratingBlock, "description");
        if (ratingDescription === null) continue;
        ratings.push({
          description: ratingDescription,
          points: tagNumber(ratingBlock, "points") ?? 0,
        });
      }
      criteria.push({
        description,
        points: tagNumber(critHead, "points") ?? 0,
        longDescription: tagText(critHead, "long_description"),
        ratings,
      });
    }
    rubrics.push({ title, criteria });
  }
  return rubrics;
}

/** Parse course_settings/course_settings.xml for identity and term dates. */
export function parseCourseSettings(xml: string): {
  title: string | null;
  courseCode: string | null;
  startAt: string | null;
} {
  return {
    title: tagText(xml, "title"),
    courseCode: tagText(xml, "course_code"),
    startAt: tagText(xml, "start_at"),
  };
}

/** Parse generic IMS Common Cartridge manifest for title and modules, plus a
 * side table of each item's identifierref - same Map-based shape as
 * parseModuleMetaWithRefs above and for the identical reason: keeps
 * CartridgeModuleItem's public {title, type, body?} shape untouched by a
 * value (identifierref) that is scaffolding for parseCartridgeBlob's own
 * body-resolution pass, not part of any item's public contract. This
 * function is not exported (only parseCartridgeBlob calls it), so unlike
 * parseModuleMeta it never needed a separate public-facing wrapper - the Map
 * return value has been its only shape. */
function parseGenericCartridge(manifestXml: string): {
  title: string | null;
  modules: CartridgeModule[];
  refs: Map<CartridgeModuleItem, string>;
} {
  const title = tagText(manifestXml, "lomimscc:string");

  const modules: CartridgeModule[] = [];
  const refs = new Map<CartridgeModuleItem, string>();

  // Find <organizations> element first
  const orgMatch = manifestXml.match(/<organizations[^>]*>([\s\S]*?)<\/organizations>/);
  if (!orgMatch) {
    return { title, modules, refs };
  }

  const organizationsContent = orgMatch[1];

  // Find top-level <item> elements within organizations (modules)
  const topLevelItems = findDirectChildItemBlocks(organizationsContent);

  for (let position = 0; position < topLevelItems.length; position++) {
    const itemBlock = topLevelItems[position];
    const name = tagText(itemBlock, "title");
    if (!name) continue;

    const items: CartridgeModuleItem[] = [];

    // Extract inner content of the module item and find nested items within it
    const innerContent = getItemInnerContent(itemBlock);
    const nestedItems = findDirectChildItemBlocks(innerContent);
    for (const nestedItem of nestedItems) {
      const itemTitle = tagText(nestedItem, "title");
      if (!itemTitle) continue;
      const item: CartridgeModuleItem = { title: itemTitle, type: "" };
      // A generic Common Cartridge <item> carries its resource pointer as
      // the identifierref ATTRIBUTE on its own opening tag (per the IMS CC
      // spec - unlike Canvas's module_meta.xml above, which carries it as a
      // child element), so this reads the opening tag's attributes rather
      // than reusing tagText.
      const openTagMatch = nestedItem.match(/^<item\b([^>]*)>/);
      const identifierref = openTagMatch ? attrValue(openTagMatch[1], "identifierref") : null;
      if (identifierref) refs.set(item, identifierref);
      items.push(item);
    }

    modules.push({ name, position: position + 1, items });
  }

  return { title, modules, refs };
}

/**
 * Parse imsmanifest.xml's <resources> block into resource identifier -> the
 * zip path of that resource's HTML body, when it has one. A resource can
 * declare its content two ways - directly via its own href attribute
 * (`<resource ... href="path.html">`), or via one or more <file href="...">
 * children (this app's own assignment resources list both the HTML page and
 * a sibling assignment_settings.xml as <file> children) - every candidate
 * href is collected and the first one that looks like an HTML file wins, so
 * a resource whose own href points at a non-HTML settings/manifest file but
 * whose <file> children include the actual page still resolves. A resource
 * with no HTML-looking href anywhere (an attachment, an image, a QTI
 * assessment XML) is left out of the map entirely - there is nothing
 * tag-strippable to extract, and attempting it would inject XML/binary noise
 * into a lecture prompt instead of text. Canvas/generic Common Cartridge
 * only - the Blackboard path builds its own equivalent map from bb:file
 * paths instead (buildBlackboardBodyPaths in cartridge-import-blackboard.ts),
 * since Blackboard resources have no href/<file href> convention at all.
 *
 * <resource> elements may be self-closing (no <file> children) or have a
 * body - both forms are handled by checking whether the captured attribute
 * string ends in "/" rather than assuming a closing tag always follows
 * (mirrors the self-closing tolerance Blackboard resource parsing needs for
 * the same reason).
 */
function parseManifestResourceHtmlHrefs(manifestXml: string): Map<string, string> {
  const hrefs = new Map<string, string>();
  const resourcesMatch = manifestXml.match(/<resources\b[^>]*>([\s\S]*?)<\/resources>/);
  if (!resourcesMatch) return hrefs;
  const block = resourcesMatch[1];

  const tagRe = /<resource\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(block)) !== null) {
    let attrs = m[1];
    let inner = "";
    if (attrs.endsWith("/")) {
      attrs = attrs.slice(0, -1);
    } else {
      const closeIdx = block.indexOf("</resource>", tagRe.lastIndex);
      if (closeIdx !== -1) inner = block.slice(tagRe.lastIndex, closeIdx);
    }

    const identifier = attrValue(attrs, "identifier");
    if (!identifier) continue;

    const candidates: string[] = [];
    const selfHref = attrValue(attrs, "href");
    if (selfHref) candidates.push(selfHref);
    const fileRe = /<file\b[^>]*\bhref="([^"]*)"/g;
    let fm: RegExpExecArray | null;
    while ((fm = fileRe.exec(inner)) !== null) candidates.push(decodeXml(fm[1]));

    const htmlHref = candidates.find((href) => /\.html?(?:[?#]|$)/i.test(href));
    if (htmlHref) hrefs.set(identifier, htmlHref);
  }
  return hrefs;
}

// ---------------------------------------------------------------------------
// Format detection
//
// Both an IMS Common Cartridge (.imscc) and a Blackboard course archive are
// zip files with an imsmanifest.xml at the root, so the file extension (and
// even the mere presence of imsmanifest.xml) cannot tell them apart - the
// content has to be inspected. Verified against a real Blackboard archive
// export (a "System Administration" course, ~170 resNNNNN.dat resources):
//
//  - the manifest's root <manifest> element declares
//    xmlns:bb="http://www.blackboard.com/content-packaging/", which a Common
//    Cartridge manifest never does (it declares an IMS imscp/imscc
//    namespace instead). This is the PRIMARY signal: it lives inside the one
//    file both formats already require this module to open, so it survives
//    any zip repackaging (e.g. a user dragging files into a fresh archive)
//    that might drop loose marker files sitting elsewhere in the zip.
//  - the archive root also carries Blackboard-specific marker files
//    (.bb-package-info, .bb-log-info, .bb-package-sig) with no Common
//    Cartridge equivalent. Used here as a SECONDARY/corroborating signal
//    (checked first, since it is cheap - a plain zip.file() lookup - and
//    catches the hypothetical case of a hand-edited manifest that dropped
//    the bb: namespace declaration but the zip still carries Blackboard's
//    own generated marker files).
//
// Both signals were present and agreed on the real sample.
export type CartridgeFormat = "blackboard" | "common-cartridge" | "unknown";

const BLACKBOARD_NAMESPACE_MARKER = "http://www.blackboard.com/content-packaging/";

export function detectCartridgeFormat(
  manifestXml: string | null,
  hasBlackboardMarkerFiles = false
): CartridgeFormat {
  if (hasBlackboardMarkerFiles) return "blackboard";
  if (manifestXml && manifestXml.includes(BLACKBOARD_NAMESPACE_MARKER)) return "blackboard";
  if (manifestXml && /<manifest\b/i.test(manifestXml)) return "common-cartridge";
  return "unknown";
}

/**
 * Open an LMS export package and pull out the course data the tiles use.
 * Missing files simply leave their fields null/empty - generic Common
 * Cartridge packages without Canvas course_settings still yield modules
 * when module_meta.xml exists. When neither Canvas course_settings nor
 * module_meta exist, falls back to parsing generic IMSCC manifest.
 *
 * Throws if the archive contains moodle_backup.xml or if it fails to unzip
 * and starts with gzip magic bytes.
 */
export async function parseCartridgeBlob(blob: Blob): Promise<CartridgeCourseData> {
  const { default: JSZip } = await import("jszip");

  // Check for Moodle backup before attempting to unzip
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Check for gzip magic bytes (0x1f 0x8b) at the start
  const hasGzipMagic = bytes[0] === 0x1f && bytes[1] === 0x8b;

  let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
  try {
    zip = await JSZip.loadAsync(arrayBuffer);
  } catch (err) {
    if (hasGzipMagic) {
      throw new Error(
        "Moodle .mbz backups are not supported - export the course as an IMS Common Cartridge instead."
      );
    }
    throw err;
  }

  // Check if this is a Moodle backup by looking for moodle_backup.xml
  const moodleBackup = zip.file("moodle_backup.xml");
  if (moodleBackup) {
    throw new Error(
      "Moodle .mbz backups are not supported - export the course as an IMS Common Cartridge instead."
    );
  }

  const readEntry = async (path: string): Promise<string | null> => {
    const entry = zip.file(path);
    return entry ? await entry.async("string") : null;
  };

  // AC1: decide the format from content, not the upload's file extension -
  // both an .imscc and a Blackboard course archive are zips with an
  // imsmanifest.xml, so this manifest read (and the format branch below) has
  // to happen before anything assumes the Canvas/generic Common Cartridge
  // shape. See detectCartridgeFormat's own comment for the two signals used
  // and why.
  const manifestXml = await readEntry("imsmanifest.xml");
  const hasBlackboardMarkerFiles = Boolean(
    zip.file(".bb-package-info") || zip.file(".bb-log-info") || zip.file(".bb-package-sig")
  );
  if (detectCartridgeFormat(manifestXml, hasBlackboardMarkerFiles) === "blackboard") {
    return parseBlackboardArchive(manifestXml, readEntry);
  }

  const settingsXml = await readEntry("course_settings/course_settings.xml");
  const moduleXml = await readEntry("course_settings/module_meta.xml");
  const rubricsXml = await readEntry("course_settings/rubrics.xml");
  const syllabusHtml = await readEntry("course_settings/syllabus.html");

  const hasCourseSettings = Boolean(settingsXml || moduleXml || rubricsXml || syllabusHtml);

  const settings = settingsXml
    ? parseCourseSettings(settingsXml)
    : { title: null, courseCode: null, startAt: null };

  // itemRefs travels alongside `modules` from whichever parse produced it
  // (Canvas module_meta.xml, or the generic IMSCC fallback below) - see
  // parseModuleMetaWithRefs's doc comment for why this is a side Map instead
  // of a field on CartridgeModuleItem.
  const canvasParsed = moduleXml ? parseModuleMetaWithRefs(moduleXml) : null;
  let modules: CartridgeModule[] = canvasParsed?.modules ?? [];
  let itemRefs: Map<CartridgeModuleItem, string> = canvasParsed?.refs ?? new Map();

  // Fallback to generic IMSCC parsing when no Canvas course_settings exist.
  // Reuses the manifestXml already read above for format detection - not a
  // second readEntry("imsmanifest.xml") call.
  if (!hasCourseSettings) {
    if (manifestXml) {
      const genericData = parseGenericCartridge(manifestXml);
      // Use IMSCC title only if Canvas title wasn't found
      if (!settings.title) {
        settings.title = genericData.title;
      }
      // Use IMSCC modules only if Canvas modules weren't found
      if (modules.length === 0) {
        modules = genericData.modules;
        itemRefs = genericData.refs;
      }
    }
  }

  // Part 1 of the INFO 1020 Week 8 fix: attach each item's resolved body
  // text (if any) before returning, so every caller of parseCartridgeBlob -
  // not just registry-helpers.sources.ts - gets items that can carry content,
  // not just a title. Guarded on the manifest actually having a <resources>
  // block worth reading (parseManifestResourceHtmlHrefs returns an empty map
  // otherwise) and on itemRefs actually having entries, so an archive with no
  // imsmanifest.xml, an empty <resources> block, or modules whose items carry
  // no identifierref at all skips straight past this with zero extra zip
  // reads.
  if (manifestXml && itemRefs.size > 0) {
    const htmlHrefs = parseManifestResourceHtmlHrefs(manifestXml);
    if (htmlHrefs.size > 0) {
      await resolveCartridgeItemBodies(modules, itemRefs, htmlHrefs, readEntry);
    }
  }

  return {
    ...settings,
    syllabusHtml: syllabusHtml && syllabusHtml.trim() ? syllabusHtml : null,
    modules,
    rubrics: rubricsXml ? parseRubrics(rubricsXml) : [],
    hasCourseSettings,
  };
}
