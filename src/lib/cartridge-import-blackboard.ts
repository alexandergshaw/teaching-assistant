// Blackboard course archive parsing - split out of cartridge-import.ts
// (which still owns the Canvas / generic IMS Common Cartridge path and the
// top-level parseCartridgeBlob dispatcher) once the B1 body-resolution fix
// pushed that file over its 1000-line cap. See cartridge-import-shared.ts for
// the low-level XML helpers this file reuses (decodeXml, tagText, attrValue,
// findDirectChildItemBlocks, getItemInnerContent - NOT
// resolveCartridgeItemBodies, which stays Canvas/generic-only, see
// cartridge-import-blackboard-body.ts's header comment for why), and its own
// header comment for why the dependency runs this direction only (this file
// depends on the shared module; the shared module and cartridge-import.ts
// never depend back on this one, other than cartridge-import.ts's
// parseCartridgeBlob calling this file's own parseBlackboardArchive to
// dispatch a Blackboard-flagged archive). This file also depends on
// cartridge-import-blackboard-body.ts (item body extraction, split out for
// the same 1000-line-cap reason) and cartridge-import-blackboard-rubrics.ts
// (rubric extraction, split out for the same reason) - never the reverse,
// see each of those files' own header comments.
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
// resolveBlackboardItemTypes below), and - since the B1 fix - an item's own
// resolved body text (resolveBlackboardItemBodies in
// cartridge-import-blackboard-body.ts).
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
  findDirectChildItemBlocks,
  getItemInnerContent,
  tagText,
} from "./cartridge-import-shared";
import {
  type BlackboardResourceEntry,
  resolveBlackboardItemBodies,
  selfClosingAttrValue,
} from "./cartridge-import-blackboard-body";
import { resolveBlackboardRubrics } from "./cartridge-import-blackboard-rubrics";

const BLACKBOARD_SCAFFOLD_TITLES = new Set(["ROOT", "--TOP--", "INTERACTIVE", "INDIRECT"]);
const BLACKBOARD_COURSETOC_RESOURCE_TYPE = "course/x-bb-coursetoc";
const BLACKBOARD_COURSESETTING_RESOURCE_TYPE = "course/x-bb-coursesetting";

/** One <item> node from a Blackboard manifest's <organizations> tree, before
 * scaffold filtering / flattening. `identifier` is the node's OWN identity
 * attribute (e.g. "itm00001") - a different value from `identifierref`,
 * which points at a <resource> entry instead (see the CartridgeModuleItem/
 * CartridgeModule `identifier` doc comments in cartridge-import-shared.ts for
 * why the node's own attribute, not identifierref, is what a selection key
 * needs: a resource could in principle be referenced by more than one item,
 * but a node's own `identifier` is unique per tree position - confirmed
 * 133/133 distinct on both attributes in the real sample archive that
 * motivated this field). */
interface BlackboardItemNode {
  title: string | null;
  identifier: string | null;
  identifierref: string | null;
  children: BlackboardItemNode[];
}

/** A surviving (non-scaffold) leaf-or-branch node under a module, reduced to
 * what an item needs: its title, its own identifier (for CartridgeModuleItem.
 * identifier - see BlackboardItemNode's comment above), and its
 * identifierref for the later async content-type resolution pass. */
export interface BlackboardItemDraft {
  title: string;
  identifier: string | null;
  identifierref: string | null;
}

/** A surviving (non-scaffold) top-level node: a module, with every
 * non-scaffold descendant (at any depth) flattened into `items`. `identifier`
 * is the module node's own identity attribute, same rationale as
 * BlackboardItemDraft.identifier above. */
export interface BlackboardModuleDraft {
  title: string;
  identifier: string | null;
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
      identifier: attrValue(attrs, "identifier"),
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
    if (title) out.push({ title, identifier: child.identifier, identifierref: child.identifierref });
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
      modules.push({ title, identifier: node.identifier, items });
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
// can feed it straight into resolveBlackboardItemBodies
// (cartridge-import-blackboard-body.ts) without a second lookup structure.
// Built here, in the one place that already has both the fresh item object
// and its identifierref in hand at the same time, rather than reconstructed
// afterward from the drafts.
//
// Also copies each draft's own node `identifier` onto the returned
// CartridgeModule/CartridgeModuleItem (entry 261 check 7's "only the
// Blackboard path lacks one" was wrong in practice: the manifest's <item>
// nodes carry their own `identifier` attribute the same way Canvas/generic
// Common Cartridge items do - see BlackboardItemNode's doc comment above).
// This is what makes an export-sourced Blackboard module/item selectable at
// all: ModuleCard/ModuleItemRow build their checkbox's selection key from
// `m.identifier`/`it.identifier` and disable the checkbox when either is
// missing.
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
      // AC1/AC2: the item's own manifest-node `identifier` attribute, NOT
      // identifierref - matching the semantics parseModuleMetaWithRefs/
      // parseGenericCartridge already give CartridgeModuleItem.identifier on
      // the Canvas/generic path (cartridge-import.ts) rather than inventing a
      // different meaning for the same field here. `if (draftItem.identifier)`
      // - not `!== null` - mirrors that same code's own truthy check, so a
      // manifest with a present-but-empty `identifier=""` attribute (never
      // observed, but tolerated the same way) leaves the field unset rather
      // than fabricating an empty string (AC4).
      if (draftItem.identifier) item.identifier = draftItem.identifier;
      if (draftItem.identifierref) itemRefs.set(item, draftItem.identifierref);
      items.push(item);
    }
    const courseModule: CartridgeModule = { name: draft.title, position: i + 1, items };
    if (draft.identifier) courseModule.identifier = draft.identifier;
    modules.push(courseModule);
  }
  return { modules, itemRefs };
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

  // Blackboard rubrics (the LearnRubrics resource, root <LEARNRUBRICS> -
  // see cartridge-import-blackboard-rubrics.ts's header comment for the full
  // shape and docs/REGRESSION.md entry 301's closing note for where this was
  // first confirmed real). A separate pass from resolveBlackboardItemTypes
  // above: a rubric resource is never referenced by any <organizations>
  // item's identifierref (the same way the QTI assessment resources
  // resolveBlackboardItemBodies reaches are not - see that function's own
  // four-hop comment), so it has to be found by scanning `resources` for a
  // matching type instead of falling out of the item tree walk.
  const rubrics = await resolveBlackboardRubrics(parsed.resources, readEntry);

  // B1 fix (entry 198 AC1) originally wired Blackboard items into the
  // generic resolveCartridgeItemBodies pass shared with the Canvas/generic
  // Common Cartridge path. That pass's blanket "strip every tag in the whole
  // file" step is correct for Canvas (the resolved file really is an HTML
  // page) but wrong for Blackboard, whose resNNNNN.dat is an XML document
  // with the actual payload singly-XML-escaped inside one specific element's
  // text content - the blanket strip mixed in every other tag's text too
  // (EXTENDEDDATA/ENTRY, FILES/FILE/NAME, QTI metadata), leaving 96 of 229
  // .dat resources in the real archive empty and most of the rest noise
  // ("true", a raw xid, an LTI query string) - see docs/REGRESSION.md entries
  // 296/297. Fixed by resolveBlackboardItemBodies
  // (cartridge-import-blackboard-body.ts), a Blackboard-specific parallel
  // extraction: it isolates CONTENT/BODY/TEXT (or, for an assessment stub
  // resolved through the resource/x-bb-link four-hop chain, the QTI
  // rubric/presentation_material/question text) before tag-stripping, rather
  // than stripping the whole file. Guarded on itemRefs actually having
  // entries so an archive with no identifierref anywhere skips straight past
  // this with zero extra zip reads, mirroring the identical guard on the
  // Canvas/generic path.
  if (itemRefs.size > 0) {
    await resolveBlackboardItemBodies(modules, itemRefs, parsed.resources, readEntry);
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
    // module family already parses - but a different shape is not an
    // incompatible one: cartridge-import-blackboard-rubrics.ts converts it
    // into the exact same CartridgeRubric[] contract parseRubrics produces
    // (cartridge-import.ts), so both existing consumers
    // (useCourseImportActions.ts's handleImportRubric and
    // useLmsAssignmentPull.ts's cartridgeRubricToText) render a Blackboard
    // rubric exactly as they already render a Canvas one, with no changes to
    // either. `rubrics` computed above, before this return.
    rubrics,
    hasCourseSettings: true,
    // This app never WRITES the Blackboard archive format (only .imscc, via
    // common-cartridge.ts) - a Blackboard-shaped archive is by construction
    // always an instructor export, so this is unconditionally false rather
    // than a stamp-file lookup that could never find anything.
    appGenerated: false,
    description,
  };
}
