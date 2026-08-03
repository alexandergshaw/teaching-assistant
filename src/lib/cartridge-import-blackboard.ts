// Blackboard course archive parsing - split out of cartridge-import.ts
// (which still owns the Canvas / generic IMS Common Cartridge path and the
// top-level parseCartridgeBlob dispatcher) once the B1 body-resolution fix
// below pushed that file over its 1000-line cap. See cartridge-import-shared.ts
// for the low-level XML helpers and the resolveCartridgeItemBodies pass this
// file reuses, and its own header comment for why the dependency runs this
// direction only (this file depends on the shared module; the shared module
// and cartridge-import.ts never depend back on this one, other than
// cartridge-import.ts's parseCartridgeBlob calling this file's own
// parseBlackboardArchive to dispatch a Blackboard-flagged archive).
//
// A Blackboard course archive is a DIFFERENT export format that also happens
// to be a zip with an imsmanifest.xml at its root - so the extension/presence
// of imsmanifest.xml alone cannot tell it apart from an IMS Common Cartridge
// (see detectCartridgeFormat in cartridge-import.ts).
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
// DESCRIPTION (parseBlackboardArchive below), a real per-item content type
// (every content item's manifest-level resource `type` attribute is
// uniformly "resource/x-bb-document" regardless of whether it is a file, a
// lesson folder, a link, or a quiz, so distinguishing them requires reading
// that item's own resNNNNN.dat CONTENTHANDLER value -
// resolveBlackboardItemTypes below), and - since the B1 fix below - an
// item's own resolved body text (buildBlackboardBodyPaths below).
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
// source this module family reads) - this is what correctly handles a
// deeper-than-observed nested tree instead of silently dropping content
// past the first level. A node with no title (after trimming) is skipped
// without being explored further, mirroring parseGenericCartridge's own
// `if (!name) continue` precedent in cartridge-import.ts - not observed in
// the real sample (every node there has a title), but kept for symmetry.
import {
  type CartridgeCourseData,
  type CartridgeModule,
  type CartridgeModuleItem,
  attrValue,
  decodeXml,
  findDirectChildItemBlocks,
  getItemInnerContent,
  resolveCartridgeItemBodies,
  tagText,
} from "./cartridge-import-shared";

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

// Same lookup as attrValue, but scoped to a whole resNNNNN.dat document
// instead of a single tag's attributes - used to pull a self-closing
// element's own value attribute (e.g. <CONTENTHANDLER value="resource/x-bb-
// file"/>) out of a full XML document. `[^>]` matches newlines (it is a
// negated character class, not `.`), so this tolerates the real files'
// line-wrapped attributes. Blackboard-only (the Canvas/generic path has no
// self-closing-element-value convention to read), so this stays local to
// this file rather than moving to the shared module.
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
    // same reasoning as parseModuleMeta's itemsStart split in
    // cartridge-import.ts - a nested item's own <title> must never be read
    // as ITS PARENT's title.
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
// (primary signal - see this file's header comment), corroborated by the
// resolved resource's manifest type for the course-TOC-backed labels
// (ROOT/INTERACTIVE/INDIRECT).
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
// (matching parseGenericCartridge's own `type: ""` precedent in
// cartridge-import.ts for items it cannot classify) - never throws, since a
// single unreadable resource file should not fail the whole import. Cached
// per identifierref since several items across different modules can
// reference the same resource.
//
// B1 fix: also builds the SAME identifierref side table
// (Map<CartridgeModuleItem, string>) parseModuleMetaWithRefs/
// parseGenericCartridge build on the Canvas/generic path, keyed by the exact
// CartridgeModuleItem object this function creates - so parseBlackboardArchive
// can feed it straight into the shared resolveCartridgeItemBodies pass
// without a second lookup structure. Built here, in the one place that
// already has both the fresh item object and its identifierref in hand at
// the same time, rather than reconstructed afterward from the drafts.
async function resolveBlackboardItemTypes(
  drafts: BlackboardModuleDraft[],
  resources: Map<string, BlackboardResourceEntry>,
  readEntry: (path: string) => Promise<string | null>
): Promise<{ modules: CartridgeModule[]; itemRefs: Map<CartridgeModuleItem, string> }> {
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
  const itemRefs = new Map<CartridgeModuleItem, string>();
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i];
    const items: CartridgeModuleItem[] = [];
    for (const draftItem of draft.items) {
      const item: CartridgeModuleItem = { title: draftItem.title, type: await resolveType(draftItem.identifierref) };
      if (draftItem.identifierref) itemRefs.set(item, draftItem.identifierref);
      items.push(item);
    }
    modules.push({ name: draft.title, position: i + 1, items });
  }
  return { modules, itemRefs };
}

/**
 * B1 fix: build the identifier -> zip-path map resolveCartridgeItemBodies
 * expects, Blackboard-shaped. Unlike the Canvas/generic Common Cartridge
 * path - where a resource's HTML content lives in a SEPARATE file the
 * manifest points at via href/<file href> (parseManifestResourceHtmlHrefs in
 * cartridge-import.ts) - a Blackboard resource's actual body text lives
 * INLINE inside its own resNNNNN.dat XML document, typically a
 * <BODY><TEXT>...</TEXT></BODY> element alongside attribute-only tags like
 * <TITLE value="..."/> and <CONTENTHANDLER value="..."/>. So the "href"
 * resolveCartridgeItemBodies needs is simply that same resNNNNN.dat path -
 * already available as each resource's own bbFile, resolved once here for
 * every resource that has one rather than re-derived per item.
 *
 * No Blackboard-specific text extraction is written for this: passing the
 * whole resNNNNN.dat path through resolveCartridgeItemBodies's existing
 * blanket "strip every tag, collapse whitespace" step discards the
 * attribute-only TITLE/CONTENTHANDLER tags along with the surrounding XML
 * structure and leaves exactly the inline text content, if any - the same
 * mechanism that already turns a Canvas HTML page into a body, applied to a
 * different XML dialect. An item whose resource carries no <BODY> (a real
 * file attachment, an LTI link) naturally strips down to nothing but
 * whitespace and keeps body unset, exactly like resolveCartridgeItemBodies
 * already does for a Canvas item with no matching HTML resource - no
 * separate "does this resource type carry a body" check is needed.
 */
function buildBlackboardBodyPaths(resources: Map<string, BlackboardResourceEntry>): Map<string, string> {
  const paths = new Map<string, string>();
  for (const [identifier, entry] of resources) {
    if (entry.bbFile) paths.set(identifier, entry.bbFile);
  }
  return paths;
}

// AC6: a file flagged as a Blackboard archive (by detectCartridgeFormat in
// cartridge-import.ts) whose imsmanifest.xml is missing or has no
// <organizations> section does not even have the shape of a Blackboard
// course archive - failing loudly here (rather than falling through to the
// generic Common Cartridge path, which would misread Blackboard's <item>
// tree shape and could surface literal scaffolding titles like
// "ROOT"/"--TOP--" as if they were real modules) is what AC4's "worse than
// failing" warning is about.
export async function parseBlackboardArchive(
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

  const { modules, itemRefs } = await resolveBlackboardItemTypes(parsed.modules, parsed.resources, readEntry);

  // B1 fix: run the SAME generic body-resolution pass the Canvas/generic
  // Common Cartridge path uses (resolveCartridgeItemBodies), rather than
  // writing a second extraction - see buildBlackboardBodyPaths's own comment
  // for why a Blackboard "href" is the resource's own resNNNNN.dat path
  // rather than a separate HTML file. Before this fix, parseCartridgeBlob
  // returned straight out of this function without ever reaching body
  // resolution, so every Blackboard item had `body === undefined`
  // unconditionally - the entire body-extraction feature (entry 198 AC1)
  // did not apply to Blackboard sources, and hasSubstantialBody in
  // course-item-classifier.ts was universally false for them, demoting
  // graded work by the leading-imperative rule regardless of actual content.
  // Guarded on itemRefs actually having entries so an archive with no
  // identifierref anywhere skips straight past this with zero extra zip
  // reads, mirroring the identical guard on the Canvas/generic path.
  if (itemRefs.size > 0) {
    const bodyPaths = buildBlackboardBodyPaths(parsed.resources);
    if (bodyPaths.size > 0) {
      await resolveCartridgeItemBodies(modules, itemRefs, bodyPaths, readEntry);
    }
  }

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
    // module family already parses - out of scope for this format (AC1-AC5
    // only ask for schedule-shaped module/item recovery).
    rubrics: [],
    hasCourseSettings: true,
    description,
  };
}
