// Read course data back out of an LMS export package (.imscc). Canvas exports
// carry a course_settings/ folder with the course metadata, module structure,
// rubrics, and syllabus HTML; this module extracts the pieces the course card
// tiles can be populated from when there is no live LMS connection.
//
// XML is matched with regexes rather than a parser, mirroring the cartridge
// title sniffing in src/lib/workflows/registry.ts - Canvas emits these files
// in a fixed machine-generated shape.

/** A module item as the tile handlers consume it (mirrors the live LMS shape). */
export interface CartridgeModuleItem {
  title: string;
  type: string;
}

/** A course module from course_settings/module_meta.xml. */
export interface CartridgeModule {
  name: string;
  position: number;
  items: CartridgeModuleItem[];
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
}

// Single-pass entity decode so produced characters are never re-decoded
// ("&#38;lt;" is the literal string "&lt;", not "<"). Out-of-range numeric
// references are left as-is instead of throwing.
function decodeXml(value: string): string {
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
function tagText(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1].trim()) : null;
}

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

/** Parse course_settings/module_meta.xml into ordered modules with items. */
export function parseModuleMeta(xml: string): CartridgeModule[] {
  const modules: CartridgeModule[] = [];
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
      items.push({ title: title ?? "", type: type ?? "" });
    }
    modules.push({ name, position, items });
  }
  modules.sort((a, b) => a.position - b.position);
  return modules;
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

/**
 * Open an LMS export package and pull out the course data the tiles use.
 * Missing files simply leave their fields null/empty - generic Common
 * Cartridge packages without Canvas course_settings still yield modules
 * when module_meta.xml exists.
 */
export async function parseCartridgeBlob(blob: Blob): Promise<CartridgeCourseData> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());

  const readEntry = async (path: string): Promise<string | null> => {
    const entry = zip.file(path);
    return entry ? await entry.async("string") : null;
  };

  const settingsXml = await readEntry("course_settings/course_settings.xml");
  const moduleXml = await readEntry("course_settings/module_meta.xml");
  const rubricsXml = await readEntry("course_settings/rubrics.xml");
  const syllabusHtml = await readEntry("course_settings/syllabus.html");

  const settings = settingsXml
    ? parseCourseSettings(settingsXml)
    : { title: null, courseCode: null, startAt: null };

  return {
    ...settings,
    syllabusHtml: syllabusHtml && syllabusHtml.trim() ? syllabusHtml : null,
    modules: moduleXml ? parseModuleMeta(moduleXml) : [],
    rubrics: rubricsXml ? parseRubrics(rubricsXml) : [],
    hasCourseSettings: Boolean(settingsXml || moduleXml || rubricsXml || syllabusHtml),
  };
}
