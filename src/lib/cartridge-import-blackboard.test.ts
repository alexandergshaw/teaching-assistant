import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseBlackboardManifest } from "./cartridge-import-blackboard";
import { parseBlackboardRubrics } from "./cartridge-import-blackboard-rubrics";
import { parseCartridgeBlob } from "./cartridge-import";

// Fixtures below mirror the real structure of a Blackboard course archive
// export (verified against a real sample during development, not committed
// here - see cartridge-import-blackboard.ts's own header/section comments
// for the full shape): a nested <item> tree under <organizations>, a
// <resources> block resolving identifierref to a bb:file/bb:title/type, a
// course record resNNNNN.dat, and Blackboard's reserved scaffolding labels
// ("ROOT", "--TOP--", "INTERACTIVE", "INDIRECT").

const BLACKBOARD_NESTED_MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="man00001" xmlns:bb="http://www.blackboard.com/content-packaging/"><organizations
   default="toc00001"><organization identifier="toc00001"><item identifier="itm00001"
     identifierref="res00006"><title>ROOT</title><item identifier="itm00004"
      identifierref="res00015"><title>--TOP--</title><item identifier="itm00005"
       identifierref="res00016"><title>Start Here</title><item identifier="itm00027"
       identifierref="res00038"><title>Syllabus.docx</title></item></item><item identifier="itm00006"
       identifierref="res00017"><title>Module 1</title><item identifier="itm00026"
       identifierref="res00037"><title>Learn It</title></item></item></item></item><item
      identifier="itm00002" identifierref="res00007"><title>INTERACTIVE</title><item identifier="itm00146"
      identifierref="res00157"><title>--TOP--</title></item></item><item identifier="itm00003"
     identifierref="res00008"><title>INDIRECT</title><item identifier="itm00147"
     identifierref="res00158"><title>--TOP--</title></item></item></organization></organizations><resources><resource
   bb:file="res00001.dat" bb:title="Test Course" identifier="res00001" type="course/x-bb-coursesetting"
   xml:base="res00001"/><resource bb:file="res00006.dat" bb:title="ROOT" identifier="res00006"
   type="course/x-bb-coursetoc" xml:base="res00006"/><resource bb:file="res00007.dat" bb:title="INTERACTIVE"
   identifier="res00007" type="course/x-bb-coursetoc" xml:base="res00007"/><resource bb:file="res00008.dat"
   bb:title="INDIRECT" identifier="res00008" type="course/x-bb-coursetoc" xml:base="res00008"/><resource
   bb:file="res00015.dat" bb:title="--TOP--" identifier="res00015" type="resource/x-bb-document"
   xml:base="res00015"/><resource bb:file="res00016.dat" bb:title="Start Here" identifier="res00016"
   type="resource/x-bb-document" xml:base="res00016"/><resource bb:file="res00017.dat" bb:title="Module 1"
   identifier="res00017" type="resource/x-bb-document" xml:base="res00017"/><resource bb:file="res00038.dat"
   bb:title="Syllabus.docx" identifier="res00038" type="resource/x-bb-document" xml:base="res00038"/><resource
   bb:file="res00037.dat" bb:title="Learn It" identifier="res00037" type="resource/x-bb-document"
   xml:base="res00037"/><resource bb:file="res00157.dat" bb:title="--TOP--" identifier="res00157"
   type="resource/x-bb-document" xml:base="res00157"/><resource bb:file="res00158.dat" bb:title="--TOP--"
   identifier="res00158" type="resource/x-bb-document" xml:base="res00158"/></resources></manifest>`;

const BLACKBOARD_COURSE_RECORD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<COURSE id="_1_1"><COURSEID value="12345"/><Title value="Test Course"/><DESCRIPTION>A test description</DESCRIPTION></COURSE>`;

const BLACKBOARD_SYLLABUS_CONTENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_2_1"><Title value="Syllabus.docx"/><CONTENTHANDLER value="resource/x-bb-file"/></CONTENT>`;

const BLACKBOARD_LEARN_IT_CONTENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_3_1"><Title value="Learn It"/><CONTENTHANDLER value="resource/x-bb-blti-link"/></CONTENT>`;

describe("parseBlackboardManifest", () => {
  it("filters ROOT/--TOP--/INTERACTIVE/INDIRECT scaffolding, keeping only real modules (AC4)", () => {
    const result = parseBlackboardManifest(BLACKBOARD_NESTED_MANIFEST_XML);
    expect(result.hasOrganizations).toBe(true);
    expect(result.modules.map((m) => m.title)).toEqual(["Start Here", "Module 1"]);
    // The reserved labels must never survive into the module list - this is
    // the specific failure AC4 calls out as "worse than failing".
    for (const reserved of ["ROOT", "--TOP--", "INTERACTIVE", "INDIRECT"]) {
      expect(result.modules.map((m) => m.title)).not.toContain(reserved);
    }
  });

  it("recovers the course title from the course/x-bb-coursesetting resource's bb:title", () => {
    const result = parseBlackboardManifest(BLACKBOARD_NESTED_MANIFEST_XML);
    expect(result.courseTitle).toBe("Test Course");
    expect(result.courseResourceFile).toBe("res00001.dat");
  });

  it("flattens a nested item tree correctly - every non-scaffold descendant, at any depth, becomes one flat item list", () => {
    const nestedManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns:bb="http://www.blackboard.com/content-packaging/"><organizations><organization identifier="o1">
<item identifier="i1" identifierref="rMod"><title>Week 1</title>
  <item identifier="i2" identifierref="rSub"><title>Overview</title>
    <item identifier="i3" identifierref="rLeafA"><title>Reading</title></item>
    <item identifier="i4" identifierref="rLeafB"><title>Quiz</title></item>
  </item>
</item>
</organization></organizations><resources></resources></manifest>`;

    const result = parseBlackboardManifest(nestedManifest);
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].title).toBe("Week 1");
    // Overview (the intermediate node) AND its two children all land in the
    // SAME flat item list, in document order - nothing past the first level
    // is silently dropped, and nothing is nested (CartridgeModuleItem has no
    // nested shape).
    expect(result.modules[0].items.map((i) => i.title)).toEqual(["Overview", "Reading", "Quiz"]);
  });

  it("reports hasOrganizations: false when the manifest has no <organizations> section", () => {
    const result = parseBlackboardManifest(
      `<manifest xmlns:bb="http://www.blackboard.com/content-packaging/"><resources></resources></manifest>`
    );
    expect(result.hasOrganizations).toBe(false);
    expect(result.modules).toEqual([]);
  });
});

// -----------------------------------------------------------------------
// Identifier recovery (AC1-AC4 of the checkbox-selection fix): a Blackboard
// manifest's <item> node carries its OWN `identifier` attribute (e.g.
// "itm00001") in addition to `identifierref` (a pointer into <resources>) -
// a different value entirely, confirmed 133/133 distinct on both attributes
// against a real instructor archive. Before this fix, the parser read
// `identifierref` but silently discarded `identifier`, which is what left
// every Blackboard-sourced module/item checkbox permanently disabled
// (ModuleCard.tsx/ModuleItemRow.tsx require a non-null identifier on both
// the module and the item to build a selection key).
const BLACKBOARD_IDENTIFIER_TEST_MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns:bb="http://www.blackboard.com/content-packaging/"><organizations><organization identifier="o1">
<item identifier="modA" identifierref="resModA"><title>Module A</title>
  <item identifier="itemA1" identifierref="resA1"><title>Item A1</title></item>
  <item identifier="itemA2" identifierref="resA2"><title>Item A2</title></item>
  <item identifierref="resA3"><title>Item A3 No Identifier</title></item>
</item>
</organization></organizations><resources></resources></manifest>`;

describe("Blackboard item/module identifier recovery (AC1-AC4)", () => {
  it("populates identifier on both the module and its items from each manifest node's own identifier attribute (AC1)", () => {
    const result = parseBlackboardManifest(BLACKBOARD_IDENTIFIER_TEST_MANIFEST_XML);
    expect(result.modules).toHaveLength(1);
    expect(result.modules[0].identifier).toBe("modA");
    expect(result.modules[0].items.map((i) => ({ title: i.title, identifier: i.identifier }))).toEqual([
      { title: "Item A1", identifier: "itemA1" },
      { title: "Item A2", identifier: "itemA2" },
      { title: "Item A3 No Identifier", identifier: null },
    ]);
  });

  it("gives distinct sibling items distinct identifiers, sourced from identifier rather than identifierref", () => {
    const result = parseBlackboardManifest(BLACKBOARD_IDENTIFIER_TEST_MANIFEST_XML);
    const ids = result.modules[0].items.map((i) => i.identifier).filter((id): id is string => id !== null);
    expect(ids).toEqual(["itemA1", "itemA2"]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is stable across two independent parses of the same manifest (AC3) - never derived from array position or a counter", () => {
    const first = parseBlackboardManifest(BLACKBOARD_IDENTIFIER_TEST_MANIFEST_XML);
    const second = parseBlackboardManifest(BLACKBOARD_IDENTIFIER_TEST_MANIFEST_XML);
    expect(second.modules[0].identifier).toBe(first.modules[0].identifier);
    expect(second.modules[0].items.map((i) => i.identifier)).toEqual(
      first.modules[0].items.map((i) => i.identifier)
    );
  });

  it("leaves identifier undefined - never fabricated as '' - on a CartridgeModule/CartridgeModuleItem whose node has no identifier attribute (AC4)", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", BLACKBOARD_IDENTIFIER_TEST_MANIFEST_XML);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.modules[0].identifier).toBe("modA");

    const withId = data.modules[0].items.find((i) => i.title === "Item A1");
    expect(withId?.identifier).toBe("itemA1");

    const withoutId = data.modules[0].items.find((i) => i.title === "Item A3 No Identifier");
    expect(withoutId).toBeDefined();
    expect(withoutId?.identifier).toBeUndefined();
    // hasOwnProperty, not just toBeUndefined - the earlier assertion also
    // passes for a fabricated `identifier: undefined` key, which is exactly
    // the fabrication AC4 forbids (mirrors entry 263 check 2's own
    // hasOwnProperty-based pin elsewhere in this module family).
    expect(Object.prototype.hasOwnProperty.call(withoutId, "identifier")).toBe(false);
  });
});

describe("parseCartridgeBlob - Blackboard archive", () => {
  it("parses a Blackboard archive end to end: title, description, filtered modules, and per-item content type", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", BLACKBOARD_NESTED_MANIFEST_XML);
    zip.file("res00001.dat", BLACKBOARD_COURSE_RECORD_XML);
    zip.file("res00038.dat", BLACKBOARD_SYLLABUS_CONTENT_XML);
    zip.file("res00037.dat", BLACKBOARD_LEARN_IT_CONTENT_XML);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.title).toBe("Test Course");
    expect(data.description).toBe("A test description");
    expect(data.hasCourseSettings).toBe(true);
    expect(data.modules.map((m) => m.name)).toEqual(["Start Here", "Module 1"]);
    // Neither Syllabus.docx nor Learn It's res*.dat carries any inline
    // <BODY> text (both are attribute-only TITLE/CONTENTHANDLER tags - see
    // the fixtures above), so both keep `body` unset - toEqual treats an
    // absent key and a present-but-undefined key as equivalent (see
    // CartridgeModuleItem's own doc comment in cartridge-import-shared.ts),
    // which is what lets these assertions stay unchanged by the B1 fix
    // below even though every item here now actually PASSES through
    // resolveCartridgeItemBodies.
    // Both items' manifest nodes carry their own `identifier` attribute
    // ("itm00027"/"itm00026" - see BLACKBOARD_NESTED_MANIFEST_XML above), so
    // this is a real behaviour change from the identifier-recovery fix, not a
    // test being loosened: the parser now surfaces that attribute onto
    // CartridgeModuleItem the same way it always did for Canvas/generic
    // Common Cartridge items.
    expect(data.modules[0].items).toEqual([
      { title: "Syllabus.docx", type: "resource/x-bb-file", identifier: "itm00027" },
    ]);
    expect(data.modules[1].items).toEqual([
      { title: "Learn It", type: "resource/x-bb-blti-link", identifier: "itm00026" },
    ]);
  });

  it("detects Blackboard via the .bb-* marker files alone (no imsmanifest.xml bb: namespace needed)", async () => {
    const { default: JSZip } = await import("jszip");
    const manifestWithoutNamespace = BLACKBOARD_NESTED_MANIFEST_XML.replace(
      ' xmlns:bb="http://www.blackboard.com/content-packaging/"',
      ""
    );
    const zip = new JSZip();
    zip.file(".bb-package-info", "#Bb PackageInfo Property File");
    zip.file("imsmanifest.xml", manifestWithoutNamespace);
    zip.file("res00001.dat", BLACKBOARD_COURSE_RECORD_XML);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.title).toBe("Test Course");
    expect(data.modules.map((m) => m.name)).toEqual(["Start Here", "Module 1"]);
  });

  it("rejects a Blackboard-flagged archive with no <organizations> section, with a clear message (AC6)", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file(
      "imsmanifest.xml",
      `<manifest xmlns:bb="http://www.blackboard.com/content-packaging/"><resources></resources></manifest>`
    );
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    await expect(parseCartridgeBlob(blob)).rejects.toThrow(
      "This looks like a Blackboard course archive"
    );
  });

  it("rejects a Blackboard-flagged archive with no imsmanifest.xml at all, with a clear message (AC6)", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file(".bb-package-info", "#Bb PackageInfo Property File");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    await expect(parseCartridgeBlob(blob)).rejects.toThrow(
      "This looks like a Blackboard course archive"
    );
  });
});

// B1: parseCartridgeBlob returned from parseBlackboardArchive BEFORE the
// generic resolveCartridgeItemBodies pass ever ran, so every Blackboard item
// had `body === undefined` unconditionally - the entire body-extraction
// feature (REGRESSION.md entry 198 AC1) did not apply to Blackboard sources,
// and hasSubstantialBody in course-item-classifier.ts was universally false
// for them (see REGRESSION.md entry 201's "UNRECORDED BEHAVIOUR 3"). Fixed
// by reusing resolveCartridgeItemBodies - see
// cartridge-import-blackboard.ts's buildBlackboardBodyPaths for why a
// Blackboard item's body source is its own resNNNNN.dat path rather than a
// separate HTML file the way Canvas/generic Common Cartridge items are.
describe("parseCartridgeBlob - Blackboard archive - B1 item body resolution", () => {
  it("resolves a Blackboard item's body from its own resNNNNN.dat inline text, tag-stripped and whitespace-collapsed", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", BLACKBOARD_NESTED_MANIFEST_XML);
    zip.file("res00001.dat", BLACKBOARD_COURSE_RECORD_XML);
    zip.file("res00038.dat", BLACKBOARD_SYLLABUS_CONTENT_XML);
    // "Learn It"'s resource carries a real <BODY><TEXT> the same way a real
    // Blackboard content item does - the fixture in the describe block above
    // deliberately has none, to prove the "no body" path is unaffected; this
    // one proves the "has body" path actually resolves.
    zip.file(
      "res00037.dat",
      `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_3_1"><Title value="Learn It"/><BODY><TEXT>Start with mod10.zip. Submit to GitHub.</TEXT></BODY><CONTENTHANDLER value="resource/x-bb-document"/></CONTENT>`
    );
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    const learnIt = data.modules[1].items.find((i) => i.title === "Learn It");
    expect(learnIt?.body).toBe("Start with mod10.zip. Submit to GitHub.");
    // Type extraction (untouched by this fix) still reads exactly as before.
    expect(learnIt?.type).toBe("resource/x-bb-document");

    // Syllabus.docx's resource carries no <BODY> at all (a real file
    // attachment, not inline text) - it strips down to nothing but
    // whitespace and keeps body unset, exactly like a Canvas item with no
    // matching HTML resource does.
    const syllabus = data.modules[0].items.find((i) => i.title === "Syllabus.docx");
    expect(syllabus?.body).toBeUndefined();
  });

  it("caps an oversized Blackboard item body at MAX_CARTRIDGE_ITEM_BODY_CHARS with a truncation marker, same as the Canvas path", async () => {
    const { default: JSZip } = await import("jszip");
    const { MAX_CARTRIDGE_ITEM_BODY_CHARS } = await import("./cartridge-import-shared");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", BLACKBOARD_NESTED_MANIFEST_XML);
    zip.file("res00001.dat", BLACKBOARD_COURSE_RECORD_XML);
    zip.file("res00038.dat", BLACKBOARD_SYLLABUS_CONTENT_XML);
    const longText = "x".repeat(MAX_CARTRIDGE_ITEM_BODY_CHARS + 500);
    zip.file(
      "res00037.dat",
      `<?xml version="1.0" encoding="UTF-8"?><CONTENT id="_3_1"><Title value="Learn It"/><BODY><TEXT>${longText}</TEXT></BODY><CONTENTHANDLER value="resource/x-bb-document"/></CONTENT>`
    );
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    const learnIt = data.modules[1].items.find((i) => i.title === "Learn It");
    expect(learnIt?.body?.length).toBe(MAX_CARTRIDGE_ITEM_BODY_CHARS + 3);
    expect(learnIt?.body?.endsWith("...")).toBe(true);
  });

  it("keeps body unset for a Blackboard item with no identifierref at all, without throwing", async () => {
    const noRefManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns:bb="http://www.blackboard.com/content-packaging/"><organizations><organization identifier="o1">
<item identifier="i1"><title>Week 1</title>
  <item identifier="i2"><title>No Ref Item</title></item>
</item>
</organization></organizations><resources></resources></manifest>`;
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", noRefManifest);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    // "No Ref Item"'s node carries no identifierref (that's this test's own
    // point) but DOES carry its own identifier="i2" attribute - a different
    // field entirely - so it is a real behaviour change, not a loosened test,
    // for that identifier to now surface here.
    expect(data.modules[0].items).toEqual([{ title: "No Ref Item", type: "", identifier: "i2" }]);
  });
});

// -----------------------------------------------------------------------
// B2: item BODY extraction for real Blackboard content, replacing the
// blanket-strip that fed a whole resNNNNN.dat through resolveCartridgeItem-
// Bodies (see cartridge-import-blackboard-body.ts's header comment and
// docs/REGRESSION.md entries 296/297 for the measured failure this fixes -
// 96 of 229 .dat resources in the real archive stripped to nothing, most of
// the rest to noise). Every fixture below is SYNTHETIC - a fictional
// "Astrobiology" course invented for this suite, not the instructor's real
// content - reproducing the structural features the byte-level survey of
// the real archive found: attribute-carried metadata siblings a blanket
// strip would have leaked, singly-XML-escaped HTML in element text, a
// mid-tag attribute line wrap, an empty <TEXT/>, the full four-hop
// assessment link chain, a SELF-CLOSING empty mat_formattedtext followed by
// sectionmetadata and a real question (the regex trap), an ampersand in
// visible prose that requires the second decode pass to resolve, and an
// HTML comment.
//
// One module ("Content Module", nested under the same ROOT/--TOP-- scaffold
// entry 296/297 already exercises) carries nine items, one per case below.
const BLACKBOARD_BODY_TEST_MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="man00002" xmlns:bb="http://www.blackboard.com/content-packaging/"><organizations
   default="toc00002"><organization identifier="toc00002"><item identifier="itm00001"
     identifierref="res00090"><title>ROOT</title><item identifier="itm00002"
      identifierref="res00091"><title>--TOP--</title><item identifier="itm00003"
       identifierref="res00092"><title>Content Module</title><item identifier="itm00010"
       identifierref="res00100"><title>Lecture Notes</title></item><item identifier="itm00011"
       identifierref="res00101"><title>Orientation Quiz</title></item><item identifier="itm00012"
       identifierref="res00102"><title>Syllabus Acknowledgement</title></item><item identifier="itm00013"
       identifierref="res00103"><title>Week 1 Overview</title></item><item identifier="itm00014"
       identifierref="res00104"><title>Course Discussion Board</title></item><item identifier="itm00015"
       identifierref="res00105"><title>Grading Rubric.pdf</title></item><item identifier="itm00016"
       identifierref="res00106"><title>Reading Response</title></item><item identifier="itm00017"
       identifierref="res00107"><title>Notes.docx</title></item><item identifier="itm00018"
       identifierref="res00108"><title>External Tool Link</title></item></item></item></item></organization></organizations><resources><resource
   bb:file="res00001.dat" bb:title="Astrobiology 101" identifier="res00001" type="course/x-bb-coursesetting"
   xml:base="res00001"/><resource bb:file="res00100.dat" bb:title="Lecture Notes" identifier="res00100"
   type="resource/x-bb-document" xml:base="res00100"/><resource bb:file="res00101.dat" bb:title="Orientation Quiz"
   identifier="res00101" type="resource/x-bb-document" xml:base="res00101"/><resource bb:file="res00102.dat"
   bb:title="Syllabus Acknowledgement" identifier="res00102" type="resource/x-bb-document"
   xml:base="res00102"/><resource bb:file="res00103.dat" bb:title="Week 1 Overview" identifier="res00103"
   type="resource/x-bb-document" xml:base="res00103"/><resource bb:file="res00104.dat" bb:title="Course Discussion Board"
   identifier="res00104" type="resource/x-bb-document" xml:base="res00104"/><resource bb:file="res00105.dat"
   bb:title="Grading Rubric.pdf" identifier="res00105" type="resource/x-bb-document" xml:base="res00105"/><resource
   bb:file="res00106.dat" bb:title="Reading Response" identifier="res00106" type="resource/x-bb-document"
   xml:base="res00106"/><resource bb:file="res00107.dat" bb:title="Notes.docx" identifier="res00107"
   type="resource/x-bb-document" xml:base="res00107"/><resource bb:file="res00108.dat" bb:title="External Tool Link"
   identifier="res00108" type="resource/x-bb-document" xml:base="res00108"/><resource bb:file="res00150.dat"
   identifier="res00150" type="resource/x-bb-link" xml:base="res00150"/><resource bb:file="res00160.dat"
   identifier="res00160" type="course/x-bb-courseassessment" xml:base="res00160"/><resource bb:file="res00170.dat"
   identifier="res00170" type="assessment/x-bb-qti-test" xml:base="res00170"/><resource bb:file="res00151.dat"
   identifier="res00151" type="resource/x-bb-link" xml:base="res00151"/><resource bb:file="res00161.dat"
   identifier="res00161" type="course/x-bb-courseassessment" xml:base="res00161"/><resource bb:file="res00171.dat"
   identifier="res00171" type="assessment/x-bb-qti-test" xml:base="res00171"/></resources></manifest>`;

const BLACKBOARD_BODY_TEST_COURSE_RECORD_XML = `<?xml version="1.0" encoding="UTF-8"?>
<COURSE id="_1_1"><COURSEID value="99999"/><Title value="Astrobiology 101"/><DESCRIPTION>Synthetic archive for body-resolution tests</DESCRIPTION></COURSE>`;

// The decode-pipeline case: an HTML comment, real tag noise, an attribute
// carrying JSON (data-bbfile - the ONE place the archive genuinely
// double-escapes, since the quotes inside that JSON are themselves HTML-
// entity-escaped before the whole fragment is XML-escaped once more), and an
// ampersand in visible prose written as a standard HTML "&amp;" entity in
// the original HTML source - which, being XML-escaped once along with
// everything else, becomes the raw "&amp;amp;" this fixture pins the SECOND
// decodeXml call on. Sibling attribute-only/metadata tags a blanket
// tag-strip would have leaked (EXTENDEDDATA/ENTRY "bbMLEditorVersion", a
// FILES/FILE/NAME "xid-...", and an LTI launch URL with a "%24" in its query
// string) sit OUTSIDE the isolated <BODY><TEXT> element, pinning that the
// resolver only ever reads that one element, never the whole document.
const BLACKBOARD_LECTURE_NOTES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_9_1"><Title value="Lecture Notes"/><BODY><TEXT>&lt;!-- internal note: remove before publishing --&gt;&lt;p&gt;Welcome to Astrobiology &amp;amp; Beyond. See &lt;a href="#" data-bbfile="{&amp;quot;fileName&amp;quot;:&amp;quot;notes.pdf&amp;quot;}"&gt;notes.pdf&lt;/a&gt; for details.&lt;/p&gt;</TEXT></BODY><CONTENTHANDLER value="resource/x-bb-document"/><EXTENDEDDATA><ENTRY key="bbMLEditorVersion">3.0</ENTRY></EXTENDEDDATA><FILES><FILE><NAME>xid-19021764_1</NAME></FILE></FILES><PARAMS><PARAM name="launch_url" value="https://lti.example.edu/launch?a=1%24b"/></PARAMS></CONTENT>`;

// The hop case: an x-bb-asmt-test-link stub whose OWN .dat carries an empty
// <BODY><TEXT/></BODY> (plus a boolean sibling tag - "true" - a blanket
// strip would have surfaced) - its real body only exists via the four-hop
// resource/x-bb-link chain to a QTI resource's rubric text.
const BLACKBOARD_ORIENTATION_QUIZ_STUB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_11_1"><Title value="Orientation Quiz"/><BODY><TEXT/></BODY><CONTENTHANDLER value="resource/x-bb-asmt-test-link"/><ISAVAILABLE>true</ISAVAILABLE></CONTENT>`;

// LINK.REFERRER's id is mid-tag line-wrapped (the hazard selfClosingAttrValue
// already tolerates via `[^>]` matching newlines) - REFERRER carries the
// stub's own identifierref, REFERREDTO carries the COURSEASSESSMENT
// resource's identifier.
const BLACKBOARD_ORIENTATION_LINK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<LINK id="lnk001"><REFERRER id="res00101"
    type="CONTENT"/><REFERREDTO id="res00160" type="COURSE_ASSESSMENT"/></LINK>`;

const BLACKBOARD_ORIENTATION_COURSEASSESSMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<COURSEASSESSMENT id="ca001"><ASMTID value="res00170"/></COURSEASSESSMENT>`;

const BLACKBOARD_ORIENTATION_QTI_XML = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop>
  <assessment ident="asmt001" title="Orientation Quiz">
    <rubric view="administrator">
      <flow_mat>
        <material>
          <mat_extension>
            <mat_formattedtext type="HTML">&lt;p&gt;Complete this quiz before the midterm. Review chapters 1 and 2.&lt;/p&gt;</mat_formattedtext>
          </mat_extension>
        </material>
      </flow_mat>
    </rubric>
  </assessment>
</questestinterop>`;

// The regex-trap case: a second asmt-test-link stub whose QTI's rubric holds
// only a SELF-CLOSING empty mat_formattedtext, immediately followed by a
// <sectionmetadata> block and a real question. A rubric-unscoped ("lazy from
// <rubric> to the first mat_formattedtext close") extraction would skip the
// self-closing one and capture everything up to the QUESTION's own closing
// tag, dragging every sectionmetadata token along with it - this is the
// reproduction from the survey.
const BLACKBOARD_SYLLABUS_ACK_STUB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_12_1"><Title value="Syllabus Acknowledgement"/><BODY><TEXT/></BODY><CONTENTHANDLER value="resource/x-bb-asmt-test-link"/></CONTENT>`;

const BLACKBOARD_SYLLABUS_ACK_LINK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<LINK id="lnk002"><REFERRER id="res00102" type="CONTENT"/><REFERREDTO id="res00161" type="COURSE_ASSESSMENT"/></LINK>`;

const BLACKBOARD_SYLLABUS_ACK_COURSEASSESSMENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<COURSEASSESSMENT id="ca002"><ASMTID value="res00171"/></COURSEASSESSMENT>`;

const BLACKBOARD_SYLLABUS_ACK_TRAP_QTI_XML = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop>
  <assessment ident="asmt002" title="Syllabus Acknowledgement">
    <rubric view="administrator">
      <flow_mat>
        <material>
          <mat_extension>
            <mat_formattedtext type="HTML"/>
          </mat_extension>
        </material>
      </flow_mat>
    </rubric>
    <section ident="sec001">
      <sectionmetadata>
        <bbmd_asi_object_id>xid-10304381_1</bbmd_asi_object_id>
        <bbmd_asitype>Item</bbmd_asitype>
        <bbmd_sectiontype>Subsection</bbmd_sectiontype>
        <qmd_questiontype>Multiple Choice</qmd_questiontype>
        <qmd_absolute_scoring_bool>false</qmd_absolute_scoring_bool>
        <qmd_negative_bool>false</qmd_negative_bool>
      </sectionmetadata>
      <item ident="itm001" title="Question 1">
        <presentation>
          <material>
            <mat_formattedtext type="HTML">&lt;p&gt;I have read and understood the syllabus.&lt;/p&gt;</mat_formattedtext>
          </material>
        </presentation>
      </item>
    </section>
  </assessment>
</questestinterop>`;

// Genuinely-empty-body cases: a folder, a lesson, a file attachment (this
// time with an EXPLICIT empty <TEXT/> rather than no <BODY> at all, unlike
// the Syllabus.docx fixture earlier in this file), an asmt-test-link stub
// with NO matching resource/x-bb-link resource anywhere (the hop misses, so
// this falls back to its own - also empty - file), and an LTI tool link.
const BLACKBOARD_WEEK1_FOLDER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_13_1"><Title value="Week 1 Overview"/><BODY><TEXT/></BODY><CONTENTHANDLER value="resource/x-bb-folder"/></CONTENT>`;

const BLACKBOARD_DISCUSSION_LESSON_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_14_1"><Title value="Course Discussion Board"/><BODY><TEXT/></BODY><CONTENTHANDLER value="resource/x-bb-lesson"/></CONTENT>`;

const BLACKBOARD_GRADING_RUBRIC_FILE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_15_1"><Title value="Grading Rubric.pdf"/><BODY><TEXT/></BODY><CONTENTHANDLER value="resource/x-bb-file"/></CONTENT>`;

const BLACKBOARD_READING_RESPONSE_STUB_NO_HOP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_16_1"><Title value="Reading Response"/><BODY><TEXT/></BODY><CONTENTHANDLER value="resource/x-bb-asmt-test-link"/></CONTENT>`;

const BLACKBOARD_EXTERNAL_TOOL_LINK_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_18_1"><Title value="External Tool Link"/><BODY><TEXT/></BODY><CONTENTHANDLER value="resource/x-bb-blti-link"/></CONTENT>`;

// Title-echo case: the body decodes to exactly the item's own title, up to
// case and surrounding whitespace - must be suppressed to unset rather than
// duplicated (fact observed on all 32 real x-bb-document bodies).
const BLACKBOARD_NOTES_TITLE_ECHO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_17_1"><Title value="Notes.docx"/><BODY><TEXT>  NOTES.DOCX  </TEXT></BODY><CONTENTHANDLER value="resource/x-bb-document"/></CONTENT>`;

async function buildBlackboardBodyTestArchiveBlob(): Promise<Blob> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("imsmanifest.xml", BLACKBOARD_BODY_TEST_MANIFEST_XML);
  zip.file("res00001.dat", BLACKBOARD_BODY_TEST_COURSE_RECORD_XML);
  zip.file("res00100.dat", BLACKBOARD_LECTURE_NOTES_XML);
  zip.file("res00101.dat", BLACKBOARD_ORIENTATION_QUIZ_STUB_XML);
  zip.file("res00150.dat", BLACKBOARD_ORIENTATION_LINK_XML);
  zip.file("res00160.dat", BLACKBOARD_ORIENTATION_COURSEASSESSMENT_XML);
  zip.file("res00170.dat", BLACKBOARD_ORIENTATION_QTI_XML);
  zip.file("res00102.dat", BLACKBOARD_SYLLABUS_ACK_STUB_XML);
  zip.file("res00151.dat", BLACKBOARD_SYLLABUS_ACK_LINK_XML);
  zip.file("res00161.dat", BLACKBOARD_SYLLABUS_ACK_COURSEASSESSMENT_XML);
  zip.file("res00171.dat", BLACKBOARD_SYLLABUS_ACK_TRAP_QTI_XML);
  zip.file("res00103.dat", BLACKBOARD_WEEK1_FOLDER_XML);
  zip.file("res00104.dat", BLACKBOARD_DISCUSSION_LESSON_XML);
  zip.file("res00105.dat", BLACKBOARD_GRADING_RUBRIC_FILE_XML);
  zip.file("res00106.dat", BLACKBOARD_READING_RESPONSE_STUB_NO_HOP_XML);
  zip.file("res00107.dat", BLACKBOARD_NOTES_TITLE_ECHO_XML);
  zip.file("res00108.dat", BLACKBOARD_EXTERNAL_TOOL_LINK_XML);
  const bytes = await zip.generateAsync({ type: "arraybuffer" });
  return new Blob([bytes], { type: "application/zip" });
}

describe("parseCartridgeBlob - Blackboard archive - B2 real body extraction", () => {
  it("decodes the document case end to end: comment gone, tag noise gone, data-bbfile JSON gone, ampersand resolved", async () => {
    const blob = await buildBlackboardBodyTestArchiveBlob();
    const data = await parseCartridgeBlob(blob);
    const items = data.modules[0].items;
    const lectureNotes = items.find((i) => i.title === "Lecture Notes");
    expect(lectureNotes?.body).toBe("Welcome to Astrobiology & Beyond. See notes.pdf for details.");
  });

  it("resolves an asmt-test-link stub's body through the four-hop resource/x-bb-link chain to the QTI rubric text", async () => {
    const blob = await buildBlackboardBodyTestArchiveBlob();
    const data = await parseCartridgeBlob(blob);
    const items = data.modules[0].items;
    const quiz = items.find((i) => i.title === "Orientation Quiz");
    expect(quiz?.type).toBe("resource/x-bb-asmt-test-link");
    expect(quiz?.body).toBe("Complete this quiz before the midterm. Review chapters 1 and 2.");
  });

  it("THE REGEX TRAP: a rubric-scoped extraction never leaks sectionmetadata or question tokens into the QTI body", async () => {
    const blob = await buildBlackboardBodyTestArchiveBlob();
    const data = await parseCartridgeBlob(blob);
    const items = data.modules[0].items;
    const ack = items.find((i) => i.title === "Syllabus Acknowledgement");
    expect(ack?.body).toBe("I have read and understood the syllabus.");
    expect(ack?.body).not.toContain("xid-10304381_1");
    expect(ack?.body).not.toContain("Multiple Choice");
    expect(ack?.body).not.toContain("Subsection");
    expect(ack?.body).not.toContain("false");
  });

  it("keeps every genuinely-empty body unset: folder, lesson, file, blti, and an asmt-test-link stub with no hop", async () => {
    const blob = await buildBlackboardBodyTestArchiveBlob();
    const data = await parseCartridgeBlob(blob);
    const items = data.modules[0].items;
    expect(items.find((i) => i.title === "Week 1 Overview")?.body).toBeUndefined();
    expect(items.find((i) => i.title === "Course Discussion Board")?.body).toBeUndefined();
    expect(items.find((i) => i.title === "Grading Rubric.pdf")?.body).toBeUndefined();
    expect(items.find((i) => i.title === "External Tool Link")?.body).toBeUndefined();
    const readingResponse = items.find((i) => i.title === "Reading Response");
    expect(readingResponse?.type).toBe("resource/x-bb-asmt-test-link");
    expect(readingResponse?.body).toBeUndefined();
  });

  it("suppresses a body that echoes its own item's title (case/whitespace-normalised) back to unset", async () => {
    const blob = await buildBlackboardBodyTestArchiveBlob();
    const data = await parseCartridgeBlob(blob);
    const items = data.modules[0].items;
    const notes = items.find((i) => i.title === "Notes.docx");
    expect(notes?.body).toBeUndefined();
  });

  it("never lets XML/metadata noise reach a resolved body across every item in the fixture", async () => {
    const blob = await buildBlackboardBodyTestArchiveBlob();
    const data = await parseCartridgeBlob(blob);
    const bodies = data.modules[0].items.map((i) => i.body).filter((b): b is string => b !== undefined);
    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).not.toContain("&lt;");
      expect(body).not.toContain("bbMLEditorVersion");
      expect(body).not.toContain("xid-");
      expect(body).not.toContain("%24");
      expect(body).not.toBe("true");
    }
  });
});

// -----------------------------------------------------------------------
// Rubric parsing (cartridge-import-blackboard-rubrics.ts). Every fixture
// below is SYNTHETIC - see docs/REGRESSION.md entry 301's closing note for
// the real archive's rubric resource this is standing in for (res00181,
// root <LEARNRUBRICS>, one "Coding Assignment" rubric of 3 criteria x 4
// ratings - not committed here, see cartridge-import-blackboard-rubrics.ts's
// header comment). One LEARNRUBRICS document below deliberately holds FOUR
// <Rubric> blocks to exercise every AC1/AC2 case in one pass:
//   1. "Coding Assignment" - PERCENTAGE, 2 criteria x 2 ratings, weights
//      (33.33% / 66.67% of a MaxValue of 12) chosen specifically because they
//      expose IEEE754 rounding error (AC3) - also carries a mid-tag
//      attribute line wrap on TITLE, ROW, and CELLDESCRIPTION, reproducing
//      the hazard documented at cartridge-import-blackboard.ts:135.
//   2. "Written Report" - Type POINTS: same field names as #1, but the
//      values are already absolute points, not percentages (AC2).
//   3. An untitled rubric (no <Title> at all) - must be skipped entirely
//      (AC1).
//   4. "Feedback Rubric" - PERCENTAGE, one row with a description-less Cell
//      (that ONE rating skipped) and a second row with no HEADER at all
//      (that ENTIRE criterion skipped) - AC1's other two skip cases.
const BLACKBOARD_LEARNRUBRICS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<LEARNRUBRICS>
<Rubric>
  <Title
       value="Coding Assignment"/>
  <Type value="PERCENTAGE"/>
  <MaxValue value="12.00000"/>
  <RubricRows>
    <Row id="row1"
         extra="wrapped">
      <Header value="Adherence to Instructions"/>
      <Percentage value="33.330000000000000"/>
      <RubricColumns>
        <Column>
          <Header value="Exemplary Performance"/>
          <Cell>
            <CellDescription
                 value="Follows all instructions precisely, no deviations"/>
            <Percentage value="83.330000000000000"/>
          </Cell>
        </Column>
        <Column>
          <Header value="Needs Improvement"/>
          <Cell>
            <CellDescription value="Misses some instructions"/>
            <Percentage value="50.000000000000000"/>
          </Cell>
        </Column>
      </RubricColumns>
    </Row>
    <Row>
      <Header value="Code Quality"/>
      <Percentage value="66.670000000000000"/>
      <RubricColumns>
        <Column>
          <Header value="Excellent"/>
          <Cell>
            <CellDescription value="Clean, well organized code"/>
            <Percentage value="100.000000000000000"/>
          </Cell>
        </Column>
        <Column>
          <Header value="Poor"/>
          <Cell>
            <CellDescription value="Disorganized code with bugs"/>
            <Percentage value="25.000000000000000"/>
          </Cell>
        </Column>
      </RubricColumns>
    </Row>
  </RubricRows>
</Rubric>
<Rubric>
  <Title value="Written Report"/>
  <Type value="POINTS"/>
  <MaxValue value="10.00000"/>
  <RubricRows>
    <Row>
      <Header value="Structure"/>
      <Percentage value="5.000000000000000"/>
      <RubricColumns>
        <Column>
          <Header value="Complete"/>
          <Cell>
            <CellDescription value="All sections present"/>
            <Percentage value="5.000000000000000"/>
          </Cell>
        </Column>
        <Column>
          <Header value="Partial"/>
          <Cell>
            <CellDescription value="Missing a section"/>
            <Percentage value="2.500000000000000"/>
          </Cell>
        </Column>
      </RubricColumns>
    </Row>
  </RubricRows>
</Rubric>
<Rubric>
  <Type value="PERCENTAGE"/>
  <MaxValue value="10.00000"/>
  <RubricRows>
    <Row>
      <Header value="Orphan Row"/>
      <Percentage value="50.000000000000000"/>
      <RubricColumns>
        <Column>
          <Header value="Level"/>
          <Cell>
            <CellDescription value="Some text"/>
            <Percentage value="100.000000000000000"/>
          </Cell>
        </Column>
      </RubricColumns>
    </Row>
  </RubricRows>
</Rubric>
<Rubric>
  <Title value="Feedback Rubric"/>
  <Type value="PERCENTAGE"/>
  <MaxValue value="20.00000"/>
  <RubricRows>
    <Row>
      <Header value="Grammar"/>
      <Percentage value="50.000000000000000"/>
      <RubricColumns>
        <Column>
          <Header value="Good"/>
          <Cell>
            <CellDescription value="No errors"/>
            <Percentage value="100.000000000000000"/>
          </Cell>
        </Column>
        <Column>
          <Header value="Bad"/>
          <Cell>
            <Percentage value="0.000000000000000"/>
          </Cell>
        </Column>
      </RubricColumns>
    </Row>
    <Row>
      <Percentage value="50.000000000000000"/>
      <RubricColumns>
        <Column>
          <Header value="X"/>
          <Cell>
            <CellDescription value="Y"/>
            <Percentage value="10.000000000000000"/>
          </Cell>
        </Column>
      </RubricColumns>
    </Row>
  </RubricRows>
</Rubric>
</LEARNRUBRICS>`;

describe("parseBlackboardRubrics", () => {
  it("skips the untitled rubric entirely, keeping only the three titled ones, in document order", () => {
    const rubrics = parseBlackboardRubrics(BLACKBOARD_LEARNRUBRICS_XML);
    expect(rubrics.map((r) => r.title)).toEqual(["Coding Assignment", "Written Report", "Feedback Rubric"]);
  });

  it("AC2/AC3: converts a PERCENTAGE rubric's weights against MaxValue, rounded to 2 decimal places", () => {
    const rubrics = parseBlackboardRubrics(BLACKBOARD_LEARNRUBRICS_XML);
    const coding = rubrics[0];
    expect(coding.criteria).toHaveLength(2);

    // 12 * 33.33 / 100 is 3.9995999999999996 in IEEE754 - this pins that the
    // rounded 4 is what actually ships, not the raw tail.
    expect(coding.criteria[0]).toMatchObject({
      description: "Adherence to Instructions",
      points: 4,
      longDescription: null,
    });
    // Ratings stay in document order (AC1) and read their prose from the
    // Cell's CELLDESCRIPTION, not the Column's own HEADER (level name).
    expect(coding.criteria[0].ratings).toEqual([
      { description: "Follows all instructions precisely, no deviations", points: 3.33 },
      { description: "Misses some instructions", points: 2 },
    ]);

    expect(coding.criteria[1]).toMatchObject({ description: "Code Quality", points: 8 });
    expect(coding.criteria[1].ratings).toEqual([
      { description: "Clean, well organized code", points: 8 },
      { description: "Disorganized code with bugs", points: 2 },
    ]);
  });

  it("AC2: a POINTS-type rubric takes its values as already-absolute, never converting against MaxValue", () => {
    const rubrics = parseBlackboardRubrics(BLACKBOARD_LEARNRUBRICS_XML);
    const written = rubrics[1];
    expect(written.title).toBe("Written Report");
    // If the PERCENTAGE conversion were wrongly applied here, 5 * 10 (this
    // rubric's MaxValue) / 100 would be 0.5, not 5 - this pins the branch.
    expect(written.criteria[0]).toMatchObject({ description: "Structure", points: 5 });
    expect(written.criteria[0].ratings).toEqual([
      { description: "All sections present", points: 5 },
      { description: "Missing a section", points: 2.5 },
    ]);
  });

  it("AC1: skips a criterion with no HEADER, and a rating whose Cell has no CELLDESCRIPTION", () => {
    const rubrics = parseBlackboardRubrics(BLACKBOARD_LEARNRUBRICS_XML);
    const feedback = rubrics[2];
    expect(feedback.title).toBe("Feedback Rubric");
    // The second <Row> (no HEADER) never surfaces as a criterion at all.
    expect(feedback.criteria).toHaveLength(1);
    expect(feedback.criteria[0].description).toBe("Grammar");
    // Its "Bad" column's Cell has PERCENTAGE but no CELLDESCRIPTION - skipped,
    // leaving only "No errors".
    expect(feedback.criteria[0].ratings).toEqual([{ description: "No errors", points: 10 }]);
  });

  it("tolerates a mid-tag attribute line wrap on TITLE, ROW, and CELLDESCRIPTION (the hazard at cartridge-import-blackboard.ts:135)", () => {
    // The fixture above already wraps TITLE/ROW/CELLDESCRIPTION for
    // "Coding Assignment" - if \s+ tolerance regressed to a literal space,
    // every assertion in the AC2/AC3 test above would already fail (title,
    // criterion count, and the wrapped rating's own description). This test
    // names the hazard explicitly so a future reader does not have to
    // reverse-engineer why the fixture is formatted the way it is.
    const rubrics = parseBlackboardRubrics(BLACKBOARD_LEARNRUBRICS_XML);
    expect(rubrics[0].title).toBe("Coding Assignment");
    expect(rubrics[0].criteria[0].ratings[0].description).toBe(
      "Follows all instructions precisely, no deviations"
    );
  });

  it("AC2: an ABSENT Type takes values as already-absolute, same as an explicit POINTS type", () => {
    const noTypeXml = `<LEARNRUBRICS><Rubric>
      <Title value="No Type Rubric"/>
      <MaxValue value="9.00000"/>
      <RubricRows><Row>
        <Header value="Effort"/>
        <Percentage value="6.000000000000000"/>
        <RubricColumns><Column><Header value="Full"/><Cell>
          <CellDescription value="All done"/>
          <Percentage value="6.000000000000000"/>
        </Cell></Column></RubricColumns>
      </Row></RubricRows>
    </Rubric></LEARNRUBRICS>`;
    const rubrics = parseBlackboardRubrics(noTypeXml);
    // If PERCENTAGE conversion were wrongly applied by default, this would
    // be 6 * 9 / 100 = 0.54, not the absolute 6.
    expect(rubrics[0].criteria[0].points).toBe(6);
    expect(rubrics[0].criteria[0].ratings[0].points).toBe(6);
  });

  it("AC2: an UNRECOGNISED Type string takes values as already-absolute rather than silently zeroing the rubric", () => {
    const unknownTypeXml = `<LEARNRUBRICS><Rubric>
      <Title value="Future Type Rubric"/>
      <Type value="WEIGHTED_SCALE"/>
      <MaxValue value="9.00000"/>
      <RubricRows><Row>
        <Header value="Effort"/>
        <Percentage value="6.000000000000000"/>
        <RubricColumns><Column><Header value="Full"/><Cell>
          <CellDescription value="All done"/>
          <Percentage value="6.000000000000000"/>
        </Cell></Column></RubricColumns>
      </Row></RubricRows>
    </Rubric></LEARNRUBRICS>`;
    const rubrics = parseBlackboardRubrics(unknownTypeXml);
    expect(rubrics[0].criteria[0].points).toBe(6);
  });
});

// End-to-end: the rubric resource is found by TYPE (containing "rubric",
// case-insensitively - see cartridge-import-blackboard-rubrics.ts's
// BLACKBOARD_RUBRIC_TYPE_PATTERN comment for why an exact literal was not
// trusted) among the manifest's <resources>, not by any identifierref in
// <organizations> - a rubric resource is never referenced from the item tree
// the way a course content item is.
const BLACKBOARD_RUBRIC_RESOURCE_MANIFEST_XML = BLACKBOARD_NESTED_MANIFEST_XML.replace(
  "</resources>",
  `<resource bb:file="res00181.dat" identifier="res00181" type="course/x-bb-courserubric" xml:base="res00181"/></resources>`
);

describe("parseCartridgeBlob - Blackboard archive - rubric resolution", () => {
  it("resolves the rubric resource by type and converts it into the CartridgeRubric contract", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", BLACKBOARD_RUBRIC_RESOURCE_MANIFEST_XML);
    zip.file("res00001.dat", BLACKBOARD_COURSE_RECORD_XML);
    zip.file("res00181.dat", BLACKBOARD_LEARNRUBRICS_XML);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.rubrics.map((r) => r.title)).toEqual(["Coding Assignment", "Written Report", "Feedback Rubric"]);
    expect(data.rubrics[0].criteria[0].points).toBe(4);
  });

  it("yields an empty rubrics array (not a throw) when no resource type mentions rubric", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", BLACKBOARD_NESTED_MANIFEST_XML);
    zip.file("res00001.dat", BLACKBOARD_COURSE_RECORD_XML);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.rubrics).toEqual([]);
  });
});

// AC6: a rubric parsed off a Blackboard archive must never become reachable
// as a Canvas WRITE. Pinned as a source-structure assertion (readFileSync,
// mirroring no-emojis.test.ts's own file-scan approach) rather than a
// behavioural test, because the thing being guarded against is an IMPORT
// EDGE that does not exist yet - there is no runtime call to assert against.
// If either of these files ever starts importing CartridgeRubric (or
// anything from the cartridge-import* module family), this test fails and
// names exactly which file crossed the line.
describe("AC6: CartridgeRubric never reaches a Canvas write path", () => {
  const CARTRIDGE_IMPORT_SOURCE = /from ["']@?\.?\.?\/?(?:.*\/)?cartridge-import[\w-]*["']/;

  it("src/lib/canvas-modules/rubrics.ts (createRubric/updateRubric) does not import from the cartridge-import module family", () => {
    const filePath = path.resolve(process.cwd(), "src/lib/canvas-modules/rubrics.ts");
    const source = fs.readFileSync(filePath, "utf-8");
    expect(source).not.toContain("CartridgeRubric");
    expect(CARTRIDGE_IMPORT_SOURCE.test(source)).toBe(false);
  });

  it("src/app/components/content-tab/RubricBuilderModal.tsx does not import from the cartridge-import module family", () => {
    const filePath = path.resolve(process.cwd(), "src/app/components/content-tab/RubricBuilderModal.tsx");
    const source = fs.readFileSync(filePath, "utf-8");
    expect(source).not.toContain("CartridgeRubric");
    expect(CARTRIDGE_IMPORT_SOURCE.test(source)).toBe(false);
  });

  it("canary: the guard regex actually matches a real cartridge-import source specifier", () => {
    // Proves CARTRIDGE_IMPORT_SOURCE is not silently inert (the same
    // canary-before-real-scan discipline no-emojis.test.ts uses) - exercised
    // against this file's own real import statements.
    expect(CARTRIDGE_IMPORT_SOURCE.test('import { type CartridgeRubric } from "./cartridge-import-shared";')).toBe(
      true
    );
    expect(CARTRIDGE_IMPORT_SOURCE.test('import { parseBlackboardRubrics } from "@/lib/cartridge-import-blackboard-rubrics";')).toBe(
      true
    );
    expect(CARTRIDGE_IMPORT_SOURCE.test('import { listRubrics } from "../canvas-throttle";')).toBe(false);
  });
});
