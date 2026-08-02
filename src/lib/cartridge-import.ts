// Read course data back out of an LMS export package (.imscc or a Blackboard
// course archive). Canvas exports carry a course_settings/ folder with the
// course metadata, module structure, rubrics, and syllabus HTML; this module
// extracts the pieces the course card tiles can be populated from when there
// is no live LMS connection.
//
// A Blackboard course archive is a DIFFERENT export format that also happens
// to be a zip with an imsmanifest.xml at its root - so the extension/presence
// of imsmanifest.xml alone cannot tell the two apart (see
// detectCartridgeFormat below, and the "Blackboard archive parsing" section
// further down for the format itself: a flat resNNNNN.dat resource per
// content item, referenced from a nested <item> tree via identifierref).
//
// XML is matched with regexes rather than a parser, mirroring the cartridge
// title sniffing in src/lib/workflows/registry.ts - both Canvas and
// Blackboard emit these files in a fixed machine-generated shape.

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
  /**
   * The course-level description recovered from a Blackboard archive's
   * course record (res00001.dat's <DESCRIPTION> - see parseBlackboardArchive
   * below). Optional rather than string|null: no other source populates it
   * today (Canvas's course_settings.xml has no equivalent field this app
   * already reads), so every existing caller that never asked for it stays
   * unchanged rather than needing a `?? null` everywhere.
   */
  description?: string | null;
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

/** Find direct child <item> blocks at current depth, handling nested <item> elements. */
function findDirectChildItemBlocks(content: string): string[] {
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
function getItemInnerContent(itemBlock: string): string {
  const openEnd = itemBlock.indexOf(">");
  if (openEnd === -1) return "";

  const closeStart = itemBlock.lastIndexOf("</item>");
  if (closeStart === -1) return "";

  return itemBlock.substring(openEnd + 1, closeStart);
}

/** Parse generic IMS Common Cartridge manifest for title and modules. */
function parseGenericCartridge(manifestXml: string): {
  title: string | null;
  modules: CartridgeModule[];
} {
  const title = tagText(manifestXml, "lomimscc:string");

  const modules: CartridgeModule[] = [];

  // Find <organizations> element first
  const orgMatch = manifestXml.match(/<organizations[^>]*>([\s\S]*?)<\/organizations>/);
  if (!orgMatch) {
    return { title, modules };
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
      items.push({ title: itemTitle, type: "" });
    }

    modules.push({ name, position: position + 1, items });
  }

  return { title, modules };
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

// ---------------------------------------------------------------------------
// Blackboard archive parsing
//
// A Blackboard course archive's imsmanifest.xml <organizations> holds a
// SINGLE deeply nested <item> tree (unlike Common Cartridge's shallow
// module -> item two-level shape): every folder, lesson, and content item in
// the course - including Blackboard's own internal scaffolding - is an
// <item identifierref="resNNNNN"><title>...</title>...</item>, nested
// arbitrarily. Real sample shape: ROOT -> --TOP-- -> ["Start Here",
// "Module 1" .. "Module 16"] -> [leaf content items], with two sibling
// branches off ROOT's parent ("INTERACTIVE" and "INDIRECT") that unwrap to
// nothing.
//
// identifierref points at a <resource bb:file="resNNNNN.dat" bb:title="..."
// type="..." .../> entry in the manifest's own <resources> block - so a
// node's title and its course-level identity (course record vs. plain
// content vs. Blackboard's internal course-TOC nodes) resolve WITHOUT
// opening any .dat file. Opening the referenced resNNNNN.dat is only needed
// for information the manifest itself does not carry: the course record's
// DESCRIPTION (parseBlackboardArchive below), and a real per-item content
// type - every content item's manifest-level resource `type` attribute is
// uniformly "resource/x-bb-document" regardless of whether it is a file, a
// lesson folder, a link, or a quiz, so distinguishing them requires reading
// that item's own resNNNNN.dat CONTENTHANDLER value (resolveBlackboardItemTypes
// below).
//
// Module/item/scaffolding rule (AC4): Blackboard reserves the exact, literal,
// non-user-editable labels "ROOT", "--TOP--", "INTERACTIVE", and "INDIRECT"
// for its own internal course-TOC and content-area root nodes - confirmed
// against the sample by resolving them: ROOT/INTERACTIVE/INDIRECT each
// resolve to a <COURSETOC> resource record (manifest resource type
// "course/x-bb-coursetoc", used below as a corroborating check alongside the
// title match), and --TOP-- resolves to a plain folder <CONTENT> record
// (CONTENTHANDLER "resource/x-bb-folder", distinct from a real module's
// "resource/x-bb-lesson"). A node matching one of these reserved labels is
// SCAFFOLDING: it contributes no module or item of its own, but its children
// are promoted to its own level (transparent unwrap) so real content nested
// underneath (e.g. everything under ROOT -> --TOP--) still surfaces - this is
// what keeps a produced schedule's first weeks from ever being literally
// "ROOT" and "--TOP--". Every other non-scaffold node found once scaffolding
// has been unwrapped becomes a MODULE; every non-scaffold descendant of a
// module, at any depth, is flattened into that module's flat item list
// (CartridgeModuleItem has no nested shape, matching every other cartridge
// source this file already reads) - this is what correctly handles a
// deeper-than-observed nested tree instead of silently dropping content
// past the first level. A node with no title (after trimming) is skipped
// without being explored further, mirroring parseGenericCartridge's own
// `if (!name) continue` precedent elsewhere in this file - not observed in
// the real sample (every node there has a title), but kept for symmetry.
const BLACKBOARD_SCAFFOLD_TITLES = new Set(["ROOT", "--TOP--", "INTERACTIVE", "INDIRECT"]);
const BLACKBOARD_COURSETOC_RESOURCE_TYPE = "course/x-bb-coursetoc";
const BLACKBOARD_COURSESETTING_RESOURCE_TYPE = "course/x-bb-coursesetting";

interface BlackboardResourceEntry {
  type: string | null;
  bbFile: string | null;
  bbTitle: string | null;
}

/** One <item> node from a Blackboard manifest's <organizations> tree, before
 * scaffold filtering / flattening. */
interface BlackboardItemNode {
  title: string | null;
  identifierref: string | null;
  children: BlackboardItemNode[];
}

/** A surviving (non-scaffold) leaf-or-branch node under a module, reduced to
 * what an item needs: its title, and its identifierref for the later async
 * content-type resolution pass. */
export interface BlackboardItemDraft {
  title: string;
  identifierref: string | null;
}

/** A surviving (non-scaffold) top-level node: a module, with every
 * non-scaffold descendant (at any depth) flattened into `items`. */
export interface BlackboardModuleDraft {
  title: string;
  items: BlackboardItemDraft[];
}

export interface BlackboardManifestResult {
  courseTitle: string | null;
  /** The zip path (e.g. "res00001.dat") of the course record resource
   * (manifest resource type "course/x-bb-coursesetting"), found by TYPE
   * rather than assumed to always be literally "res00001.dat" - null when
   * the manifest carries no such resource. The caller opens this file to
   * recover the course DESCRIPTION, which has no manifest-level equivalent. */
  courseResourceFile: string | null;
  /** False when the manifest has no <organizations> element at all - the
   * caller (parseBlackboardArchive) uses this to distinguish "a genuinely
   * empty but well-formed course" (fine - modules stays []) from "this does
   * not even have the shape of a Blackboard course archive" (AC6: throw with
   * a clear message instead of a silent empty schedule). */
  hasOrganizations: boolean;
  modules: BlackboardModuleDraft[];
  resources: Map<string, BlackboardResourceEntry>;
}

// Attribute-value lookup scoped to an already-isolated opening-tag attribute
// string (e.g. the captured group of a `<resource ...>` or `<item ...>`
// match) - distinct from tagText's element-text lookup above, since
// Blackboard's XML dialect stores most values as attributes
// (`<TITLE value="..."/>`) rather than element text. The `(?:^|\s)` guard
// stops "type" from matching inside an unrelated attribute name that merely
// ends in "type" (none observed in this dialect, but cheap to guard).
function attrValue(attrs: string, name: string): string | null {
  const m = attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
}

// Same lookup, but scoped to a whole resNNNNN.dat document instead of a
// single tag's attributes - used to pull a self-closing element's own value
// attribute (e.g. <CONTENTHANDLER value="resource/x-bb-file"/>) out of a
// full XML document. `[^>]` matches newlines (it is a negated character
// class, not `.`), so this tolerates the real files' line-wrapped attributes.
function selfClosingAttrValue(xml: string, tag: string, attr = "value"): string | null {
  const m = xml.match(new RegExp(`<${tag}\\s+[^>]*\\b${attr}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
}

/** Parse a Blackboard manifest's <resources> block into identifier ->
 * {type, bbFile, bbTitle}. Every resource referenced from the <organizations>
 * item tree via identifierref has an entry here - this is what lets titles
 * and course-record/scaffolding identification resolve without opening any
 * resNNNNN.dat. */
function parseBlackboardResources(manifestXml: string): Map<string, BlackboardResourceEntry> {
  const map = new Map<string, BlackboardResourceEntry>();
  const resourcesMatch = manifestXml.match(/<resources\b[^>]*>([\s\S]*?)<\/resources>/);
  if (!resourcesMatch) return map;
  const re = /<resource\b([^>]*)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(resourcesMatch[1])) !== null) {
    const attrs = m[1];
    const identifier = attrValue(attrs, "identifier");
    if (!identifier) continue;
    map.set(identifier, {
      type: attrValue(attrs, "type"),
      bbFile: attrValue(attrs, "bb:file"),
      bbTitle: attrValue(attrs, "bb:title"),
    });
  }
  return map;
}

/** Parse the direct-child <item> nodes of `content` into a tree, reusing the
 * same depth-counted block finder findDirectChildItemBlocks/getItemInnerContent
 * already use for Common Cartridge's shallower shape - Blackboard's tree
 * just nests it recursively instead of stopping at two levels. */
function parseBlackboardItemTree(content: string): BlackboardItemNode[] {
  return findDirectChildItemBlocks(content).map((block) => {
    const openTagMatch = block.match(/^<item\b([^>]*)>/);
    const attrs = openTagMatch ? openTagMatch[1] : "";
    const inner = getItemInnerContent(block);
    // Scope the title search to before this node's own first nested <item>,
    // same reasoning as parseModuleMeta's itemsStart split above - a nested
    // item's own <title> must never be read as ITS PARENT's title.
    const firstChildIdx = inner.search(/<item\b/);
    const head = firstChildIdx === -1 ? inner : inner.slice(0, firstChildIdx);
    return {
      title: tagText(head, "title"),
      identifierref: attrValue(attrs, "identifierref"),
      children: parseBlackboardItemTree(inner),
    };
  });
}

// AC4's scaffolding test: title match against Blackboard's reserved labels
// (primary signal - see the module-vs-item-vs-scaffolding comment above),
// corroborated by the resolved resource's manifest type for the
// course-TOC-backed labels (ROOT/INTERACTIVE/INDIRECT).
function isBlackboardScaffoldNode(
  node: BlackboardItemNode,
  resources: Map<string, BlackboardResourceEntry>
): boolean {
  const title = (node.title ?? "").trim();
  if (BLACKBOARD_SCAFFOLD_TITLES.has(title)) return true;
  const resourceType = node.identifierref ? resources.get(node.identifierref)?.type ?? null : null;
  return resourceType === BLACKBOARD_COURSETOC_RESOURCE_TYPE;
}

// Flattens every non-scaffold descendant of `children` (at any depth) into
// `out`, unwrapping any scaffold node found along the way instead of
// dropping its subtree.
function collectBlackboardItems(
  children: BlackboardItemNode[],
  resources: Map<string, BlackboardResourceEntry>,
  out: BlackboardItemDraft[]
): void {
  for (const child of children) {
    if (isBlackboardScaffoldNode(child, resources)) {
      collectBlackboardItems(child.children, resources, out);
      continue;
    }
    const title = (child.title ?? "").trim();
    if (title) out.push({ title, identifierref: child.identifierref });
    collectBlackboardItems(child.children, resources, out);
  }
}

/** Walk the top-level <organizations> item tree, unwrap scaffold nodes
 * (AC4), and turn every surviving top-level node into a module whose items
 * are every surviving descendant at any depth, flattened. */
function collectBlackboardModules(
  nodes: BlackboardItemNode[],
  resources: Map<string, BlackboardResourceEntry>
): BlackboardModuleDraft[] {
  const modules: BlackboardModuleDraft[] = [];
  const visit = (list: BlackboardItemNode[]) => {
    for (const node of list) {
      if (isBlackboardScaffoldNode(node, resources)) {
        visit(node.children);
        continue;
      }
      const title = (node.title ?? "").trim();
      if (!title) continue;
      const items: BlackboardItemDraft[] = [];
      collectBlackboardItems(node.children, resources, items);
      modules.push({ title, items });
    }
  };
  visit(nodes);
  return modules;
}

/** Pure top-level Blackboard manifest parse: resources, course record
 * identity, and the module/item structure (AC3, AC4). No I/O - every field
 * that would require opening a resNNNNN.dat (the course DESCRIPTION, and
 * per-item content types) is left to the caller, which is why this returns
 * `resources` too - so the async caller can resolve those without
 * re-parsing the manifest. */
export function parseBlackboardManifest(manifestXml: string): BlackboardManifestResult {
  const resources = parseBlackboardResources(manifestXml);

  let courseTitle: string | null = null;
  let courseResourceFile: string | null = null;
  for (const entry of resources.values()) {
    if (entry.type === BLACKBOARD_COURSESETTING_RESOURCE_TYPE) {
      courseTitle = entry.bbTitle;
      courseResourceFile = entry.bbFile;
      break;
    }
  }

  const orgMatch = manifestXml.match(/<organizations\b[^>]*>([\s\S]*?)<\/organizations>/);
  if (!orgMatch) {
    return { courseTitle, courseResourceFile, hasOrganizations: false, modules: [], resources };
  }

  const topNodes = parseBlackboardItemTree(orgMatch[1]);
  const modules = collectBlackboardModules(topNodes, resources);
  return { courseTitle, courseResourceFile, hasOrganizations: true, modules, resources };
}

// Resolves each item's real content type from its own resNNNNN.dat
// CONTENTHANDLER value (AC3) - the only place that information lives (the
// manifest's own resource `type` attribute is uniformly "resource/x-bb-
// document" for every content item, so it cannot distinguish a file from a
// lesson from a link). Falls back to that generic manifest type, then to ""
// (matching parseGenericCartridge's own `type: ""` precedent for items it
// cannot classify) - never throws, since a single unreadable resource file
// should not fail the whole import. Cached per identifierref since several
// items across different modules can reference the same resource.
async function resolveBlackboardItemTypes(
  drafts: BlackboardModuleDraft[],
  resources: Map<string, BlackboardResourceEntry>,
  readEntry: (path: string) => Promise<string | null>
): Promise<CartridgeModule[]> {
  const typeCache = new Map<string, string>();
  const resolveType = async (identifierref: string | null): Promise<string> => {
    if (!identifierref) return "";
    const cached = typeCache.get(identifierref);
    if (cached !== undefined) return cached;
    const entry = resources.get(identifierref);
    let type = entry?.type ?? "";
    if (entry?.bbFile) {
      const dat = await readEntry(entry.bbFile);
      const handler = dat ? selfClosingAttrValue(dat, "CONTENTHANDLER") : null;
      if (handler) type = handler;
    }
    typeCache.set(identifierref, type);
    return type;
  };

  const modules: CartridgeModule[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    const items: CartridgeModuleItem[] = [];
    for (const item of draft.items) {
      items.push({ title: item.title, type: await resolveType(item.identifierref) });
    }
    modules.push({ name: draft.title, position: i + 1, items });
  }
  return modules;
}

// AC6: a file flagged as a Blackboard archive (by detectCartridgeFormat)
// whose imsmanifest.xml is missing or has no <organizations> section does
// not even have the shape of a Blackboard course archive - failing loudly
// here (rather than falling through to the generic Common Cartridge path,
// which would misread Blackboard's <item> tree shape and could surface
// literal scaffolding titles like "ROOT"/"--TOP--" as if they were real
// modules) is what AC4's "worse than failing" warning is about.
async function parseBlackboardArchive(
  manifestXml: string | null,
  readEntry: (path: string) => Promise<string | null>
): Promise<CartridgeCourseData> {
  if (!manifestXml || !/<organizations\b/i.test(manifestXml)) {
    throw new Error(
      "This looks like a Blackboard course archive (found the Blackboard content-packaging markers) but its imsmanifest.xml is missing or has no <organizations> section to read the course structure from - expected a Blackboard course archive export or an IMS Common Cartridge (.imscc) file."
    );
  }

  const parsed = parseBlackboardManifest(manifestXml);

  // AC3: the course DESCRIPTION has no manifest-level equivalent (unlike the
  // title, which comes from the course resource's bb:title attribute above)
  // - it only exists as element text inside the course record's own
  // resNNNNN.dat, so recovering it requires opening that one file.
  let description: string | null = null;
  if (parsed.courseResourceFile) {
    const courseXml = await readEntry(parsed.courseResourceFile);
    if (courseXml) description = tagText(courseXml, "DESCRIPTION");
  }

  const modules = await resolveBlackboardItemTypes(parsed.modules, parsed.resources, readEntry);

  return {
    title: parsed.courseTitle,
    // Blackboard's COURSEID ("80651" in the sample) is an internal numeric
    // archive id, not a human course code the way Canvas's course_code is
    // ("26SS_INFO_1020_2A") - there is nothing in the course record that
    // plays that role, so this is left null rather than guessing by, say,
    // extracting a parenthesized fragment out of the title string.
    courseCode: null,
    // COURSESTART is present in the course record but observed blank
    // (value="") on the real sample - Blackboard's archive export does not
    // carry a populated course start date the way Canvas's course_settings.xml
    // does, so this stays null (no signal) rather than an empty string.
    startAt: null,
    // Blackboard ships a syllabus as a linked/attached file within the
    // module tree (see the "Syllabus.docx" / "Syllabus Acknowledgement"
    // items in the real sample), never as inline HTML the way Canvas's
    // course_settings/syllabus.html does - there is nothing to recover here.
    syllabusHtml: null,
    modules,
    // Blackboard rubrics (the LearnRubrics resource) use a completely
    // different XML shape than Canvas's course_settings/rubrics.xml this
    // file already parses - out of scope for this format (AC1-AC5 only ask
    // for schedule-shaped module/item recovery).
    rubrics: [],
    hasCourseSettings: true,
    description,
  };
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

  let modules: CartridgeModule[] = moduleXml ? parseModuleMeta(moduleXml) : [];

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
      }
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
