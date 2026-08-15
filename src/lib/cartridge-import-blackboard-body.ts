// Blackboard item BODY extraction - split out of cartridge-import-blackboard.ts
// to keep that file under this repo's 1000-line cap, and because this is a
// distinct concern from manifest/tree parsing: recovering an item's actual
// instructional text from its resNNNNN.dat resource file(s).
//
// THE DEFECT THIS REPLACES: the shared resolveCartridgeItemBodies
// (cartridge-import-shared.ts) does a blanket `html.replace(/<[^>]+>/g," ")`
// on whatever file an item's identifierref resolves to. That is CORRECT for
// the Canvas/generic Common Cartridge path (cartridge-import.ts), where the
// resolved file really is an HTML page - so that function is left untouched
// and still runs, unmodified, at cartridge-import.ts:507. It is WRONG for
// Blackboard: a resNNNNN.dat is an XML document whose actual payload is HTML
// text sitting, singly-XML-escaped, inside one specific XML element's text
// content (e.g. <BODY><TEXT>&lt;p&gt;...&lt;/p&gt;</TEXT></BODY>).
// Blanket-stripping every tag in the WHOLE .dat file - not just the payload
// element - mixes in every other tag's text too: EXTENDEDDATA/ENTRY values,
// FILES/FILE/NAME, QTI scoring metadata - producing noise like "true", a raw
// xid, an LTI query string, or nothing at all. See docs/REGRESSION.md entries
// 296/297 for the measured failure against a real archive (96 of 229 .dat
// files stripped to nothing; most of the rest were noise).
//
// This module is a Blackboard-specific PARALLEL to resolveCartridgeItemBodies,
// not a call into it and not a modification of it.
//
// Dependency direction: this file depends only on cartridge-import-shared.ts.
// cartridge-import-blackboard.ts depends on THIS file (for
// resolveBlackboardItemBodies, BlackboardResourceEntry and
// selfClosingAttrValue) - never the other way around, to avoid an import
// cycle between the two Blackboard-only files.
import {
  type CartridgeModule,
  type CartridgeModuleItem,
  MAX_CARTRIDGE_ITEM_BODY_CHARS,
  decodeXml,
} from "./cartridge-import-shared";

/** One <resource> entry from a Blackboard manifest's <resources> block. Lives
 * here rather than in cartridge-import-blackboard.ts (which owns manifest/
 * tree parsing) because the assessment-hop chain below also needs to read
 * arbitrary resource entries by identifier - cartridge-import-blackboard.ts
 * imports this type back rather than this file depending on that one. */
export interface BlackboardResourceEntry {
  type: string | null;
  bbFile: string | null;
  bbTitle: string | null;
}

const BLACKBOARD_LINK_RESOURCE_TYPE = "resource/x-bb-link";

// Lookup shared by cartridge-import-blackboard.ts's resolveBlackboardItemTypes
// (CONTENTHANDLER) and this file's own assessment-hop chain (REFERRER/
// REFERREDTO/ASMTID) - a self-closing element's own value attribute (e.g.
// <CONTENTHANDLER value="resource/x-bb-file"/>, <REFERRER id="res00101"/>)
// pulled out of a full XML document. `[^>]` matches newlines (it is a negated
// character class, not `.`), so this tolerates Blackboard's real files
// hard-wrapping an attribute list mid-tag, e.g. `<REFERRER id="res00101"\n
// type="CONTENT"/>` - the `\s+` between the tag name and its attributes is
// required for the same reason (a literal space would not match the newline
// in a wrapped tag).
export function selfClosingAttrValue(xml: string, tag: string, attr = "value"): string | null {
  const m = xml.match(new RegExp(`<${tag}\\s+[^>]*\\b${attr}="([^"]*)"`));
  return m ? decodeXml(m[1]) : null;
}

// ---------------------------------------------------------------------------
// The decode pipeline, applied to the RAW inner text of an already-isolated
// payload element - never to a whole .dat file:
//   (a) isolate the payload element by name (done by each caller below)
//   (b) decodeXml(rawInnerText) -> an HTML fragment
//   (c) strip HTML comments
//   (d) strip HTML tags -> " "
//   (e) decodeXml AGAIN
//   (f) collapse whitespace, trim (truncation is a separate step - see
//       truncateBlackboardBody - so it can be skipped for the title-echo
//       comparison in finalizeBlackboardBody)
function decodeBlackboardHtmlPayload(rawInnerText: string): string {
  const htmlFragment = decodeXml(rawInnerText); // (b)
  const withoutComments = htmlFragment.replace(/<!--[\s\S]*?-->/g, " "); // (c)
  const withoutTags = withoutComments.replace(/<[^>]+>/g, " "); // (d)
  // (e) - resolves an ampersand that survives into visible prose: the
  // archive's one XML-escaping pass runs over HTML source that can itself
  // already contain an "&amp;" HTML entity (standard, valid HTML authoring
  // for a literal ampersand) - escaping that entity's own "&" character too
  // yields "&amp;amp;" in the raw bytes for exactly this one case.
  // decodeXml is intentionally single-pass (see its own doc comment in
  // cartridge-import-shared.ts: "produced characters are never re-decoded"),
  // so a second explicit call is required here rather than a loop. Safe to
  // call unconditionally: no OTHER double-escaped sequence exists in visible
  // text (verified against the real archive) - the one double-escape case
  // that does exist (&amp;quot; inside a data-bbfile attribute's JSON) lives
  // inside an HTML tag's attributes, already discarded by step (d) above, so
  // this second decode never has real double-escaped text to corrupt.
  const decodedAgain = decodeXml(withoutTags); // (e)
  return decodedAgain.replace(/\s+/g, " ").trim(); // (f)
}

function truncateBlackboardBody(text: string): string {
  return text.length > MAX_CARTRIDGE_ITEM_BODY_CHARS
    ? `${text.slice(0, MAX_CARTRIDGE_ITEM_BODY_CHARS)}...`
    : text;
}

function normalizeForTitleCompare(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

// All 32 x-bb-document bodies observed in the real archive decoded to
// exactly their own item's title (the attachment filename) - pure noise that
// would fool hasSubstantialBody (course-item-classifier.ts) into treating a
// title-only item as carrying real content. A body equal to its item's
// title, case/whitespace-normalised, is suppressed back to unset rather than
// duplicated.
function finalizeBlackboardBody(text: string, itemTitle: string): string | undefined {
  if (!text) return undefined;
  if (normalizeForTitleCompare(text) === normalizeForTitleCompare(itemTitle)) return undefined;
  return truncateBlackboardBody(text);
}

// ---------------------------------------------------------------------------
// resource/x-bb-document body: CONTENT/BODY/TEXT element text. Genuinely
// empty for resource/x-bb-lesson, x-bb-folder, x-bb-file, x-bb-blti-link and
// x-bb-asmt-test-link (a bare <BODY><TEXT/></BODY>) - those simply produce ""
// here and stay unset, with no per-CONTENTHANDLER branching needed. No gate
// on BODY/TYPE/@value: the pipeline below runs unconditionally and degrades
// to identity for plain text with no HTML markup at all.
function extractDocumentBodyText(dat: string): string {
  const bodyMatch = dat.match(/<BODY\b[^>]*>([\s\S]*?)<\/BODY>/);
  if (!bodyMatch) return "";
  const textMatch = bodyMatch[1].match(/<TEXT\b[^>]*>([\s\S]*?)<\/TEXT>/);
  if (!textMatch) return "";
  return decodeBlackboardHtmlPayload(textMatch[1]);
}

// ---------------------------------------------------------------------------
// QTI assessment body: questestinterop/assessment/rubric/flow_mat/material/
// mat_extension/mat_formattedtext holds the instructions, falling back to
// presentation_material, then to the section/item question texts joined by
// " ". Only a mat_formattedtext with an actual closing tag can hold text - a
// SELF-CLOSING one (<mat_formattedtext type="HTML"/>) is genuinely empty and
// must fall through to the next source exactly like a missing one.
function extractMatFormattedText(scope: string): string {
  const m = scope.match(/<mat_formattedtext\b[^>]*>([\s\S]*?)<\/mat_formattedtext>/);
  if (!m) return "";
  return decodeBlackboardHtmlPayload(m[1]);
}

function extractQtiQuestionTexts(qtiXml: string): string {
  const texts: string[] = [];
  const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(qtiXml)) !== null) {
    const formatted = extractMatFormattedText(m[1]);
    if (formatted) texts.push(formatted);
  }
  return texts.join(" ").replace(/\s+/g, " ").trim();
}

function extractQtiBodyText(qtiXml: string): string {
  // CRITICAL: isolate the <rubric>...</rubric> block FIRST, and only search
  // for mat_formattedtext INSIDE that already-isolated block. A regex that
  // searches from <rubric> straight through to the first mat_formattedtext
  // CLOSE TAG, without first anchoring on </rubric>, skips a self-closing
  // empty mat_formattedtext (it has no closing tag of its own to match
  // against) and instead captures everything up to the NEXT real
  // mat_formattedtext close tag - which can belong to a QUESTION, dragging
  // every intervening <sectionmetadata> element's text along with it. This
  // was reproduced during the survey against the real archive; see this
  // file's test suite's regex-trap fixture for the reproduction and the
  // negative assertion that guards against it.
  const rubricMatch = qtiXml.match(/<rubric\b[^>]*>([\s\S]*?)<\/rubric>/);
  if (rubricMatch) {
    const fromRubric = extractMatFormattedText(rubricMatch[1]);
    if (fromRubric) return fromRubric;
  }
  const presentationMatch = qtiXml.match(/<presentation_material\b[^>]*>([\s\S]*?)<\/presentation_material>/);
  if (presentationMatch) {
    const fromPresentation = extractMatFormattedText(presentationMatch[1]);
    if (fromPresentation) return fromPresentation;
  }
  return extractQtiQuestionTexts(qtiXml);
}

// ---------------------------------------------------------------------------
// The four-hop assessment map: stub identifierref -> the QTI resource's own
// bbFile path. Built ONCE from the manifest's resource/x-bb-link resources
// (18 of them in the real archive), never by scanning every .dat file, and
// never by arithmetic on the resNNNNN numbering (observed non-monotone in the
// real archive: res00107 -> res00185 - resolved through the resources map at
// every hop instead).
//
//   stub identifierref == LINK.REFERRER
//     -> LINK.REFERREDTO (a resource identifier for the COURSEASSESSMENT
//        resource)
//     -> that resource's own .dat holds ASMTID (a manifest identifier
//        pointing at the QTI resource)
//     -> resources.get(ASMTID).bbFile is the QTI .dat path.
async function buildBlackboardAssessmentBodyPaths(
  resources: Map<string, BlackboardResourceEntry>,
  readEntry: (path: string) => Promise<string | null>
): Promise<Map<string, string>> {
  const paths = new Map<string, string>();
  for (const entry of resources.values()) {
    if (entry.type !== BLACKBOARD_LINK_RESOURCE_TYPE || !entry.bbFile) continue;
    const linkXml = await readEntry(entry.bbFile);
    if (!linkXml) continue;

    const referrerId = selfClosingAttrValue(linkXml, "REFERRER", "id");
    const referredToId = selfClosingAttrValue(linkXml, "REFERREDTO", "id");
    if (!referrerId || !referredToId) continue;

    const courseAssessmentEntry = resources.get(referredToId);
    if (!courseAssessmentEntry?.bbFile) continue;
    const courseAssessmentXml = await readEntry(courseAssessmentEntry.bbFile);
    if (!courseAssessmentXml) continue;
    const asmtId = selfClosingAttrValue(courseAssessmentXml, "ASMTID", "value");
    if (!asmtId) continue;

    const qtiEntry = resources.get(asmtId);
    if (!qtiEntry?.bbFile) continue;
    paths.set(referrerId, qtiEntry.bbFile);
  }
  return paths;
}

// ---------------------------------------------------------------------------
async function resolveOneBlackboardItemBody(
  identifierref: string,
  itemTitle: string,
  resources: Map<string, BlackboardResourceEntry>,
  assessmentBodyPaths: Map<string, string>,
  readEntry: (path: string) => Promise<string | null>
): Promise<string | undefined> {
  const qtiPath = assessmentBodyPaths.get(identifierref);
  if (qtiPath) {
    const qtiXml = await readEntry(qtiPath);
    if (!qtiXml) return undefined;
    return finalizeBlackboardBody(extractQtiBodyText(qtiXml), itemTitle);
  }

  const entry = resources.get(identifierref);
  if (!entry?.bbFile) return undefined;
  const dat = await readEntry(entry.bbFile);
  if (!dat) return undefined;
  return finalizeBlackboardBody(extractDocumentBodyText(dat), itemTitle);
}

/**
 * Resolve every Blackboard item's body in place - a Blackboard-specific
 * parallel to resolveCartridgeItemBodies (cartridge-import-shared.ts), not a
 * call into it - see this file's header comment for why. `itemRefs` is the
 * same identifierref side table resolveBlackboardItemTypes builds in
 * cartridge-import-blackboard.ts; `resources` is the manifest resource map
 * parseBlackboardManifest already produced. Fail-forward per item, matching
 * every other field in this module family: any missing link, unreachable
 * hop, or unreadable .dat simply leaves that item's body unset rather than
 * failing the whole import.
 */
export async function resolveBlackboardItemBodies(
  modules: CartridgeModule[],
  itemRefs: Map<CartridgeModuleItem, string>,
  resources: Map<string, BlackboardResourceEntry>,
  readEntry: (path: string) => Promise<string | null>
): Promise<void> {
  const assessmentBodyPaths = await buildBlackboardAssessmentBodyPaths(resources, readEntry);
  // Memoised per identifierref, mirroring resolveBlackboardItemTypes's own
  // typeCache - several items across different modules can share an
  // identifierref.
  const bodyCache = new Map<string, string | undefined>();

  for (const courseModule of modules) {
    for (const item of courseModule.items) {
      const identifierref = itemRefs.get(item);
      if (!identifierref) continue;
      let body: string | undefined;
      if (bodyCache.has(identifierref)) {
        body = bodyCache.get(identifierref);
      } else {
        body = await resolveOneBlackboardItemBody(
          identifierref,
          item.title,
          resources,
          assessmentBodyPaths,
          readEntry
        );
        bodyCache.set(identifierref, body);
      }
      if (body !== undefined) item.body = body;
    }
  }
}
