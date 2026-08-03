import { describe, it, expect } from "vitest";
import { parseBlackboardManifest } from "./cartridge-import-blackboard";
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
<COURSE id="_1_1"><COURSEID value="12345"/><TITLE value="Test Course"/><DESCRIPTION>A test description</DESCRIPTION></COURSE>`;

const BLACKBOARD_SYLLABUS_CONTENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_2_1"><TITLE value="Syllabus.docx"/><CONTENTHANDLER value="resource/x-bb-file"/></CONTENT>`;

const BLACKBOARD_LEARN_IT_CONTENT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<CONTENT id="_3_1"><TITLE value="Learn It"/><CONTENTHANDLER value="resource/x-bb-blti-link"/></CONTENT>`;

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
    expect(data.modules[0].items).toEqual([{ title: "Syllabus.docx", type: "resource/x-bb-file" }]);
    expect(data.modules[1].items).toEqual([{ title: "Learn It", type: "resource/x-bb-blti-link" }]);
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
<CONTENT id="_3_1"><TITLE value="Learn It"/><BODY><TEXT>Start with mod10.zip. Submit to GitHub.</TEXT></BODY><CONTENTHANDLER value="resource/x-bb-document"/></CONTENT>`
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
      `<?xml version="1.0" encoding="UTF-8"?><CONTENT id="_3_1"><TITLE value="Learn It"/><BODY><TEXT>${longText}</TEXT></BODY><CONTENTHANDLER value="resource/x-bb-document"/></CONTENT>`
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
    expect(data.modules[0].items).toEqual([{ title: "No Ref Item", type: "" }]);
  });
});
