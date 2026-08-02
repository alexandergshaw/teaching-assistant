import { describe, it, expect } from "vitest";
import {
  parseCourseSettings,
  parseModuleMeta,
  parseRubrics,
  parseCartridgeBlob,
  detectCartridgeFormat,
  parseBlackboardManifest,
} from "./cartridge-import";
import { buildModuleMetaXml } from "./workflows/common-cartridge";

// Fixtures mirror the machine-generated shape of a real Canvas course export
// (namespaced course_settings/ files with per-element attributes).

const COURSE_SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<course identifier="gcbb0144d766ba946ecda672ec94eb7ee" xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <title>26SS_INFO_1020_2A - Computer Science &amp; Principles</title>
  <course_code>26SS_INFO_1020_2A</course_code>
  <start_at>2026-06-15T05:00:00</start_at>
  <conclude_at>2026-08-18T05:00:00</conclude_at>
  <is_public>false</is_public>
</course>`;

const MODULE_META_XML = `<?xml version="1.0" encoding="UTF-8"?>
<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <module identifier="m2">
    <title>Module 02: Data &amp; Representation</title>
    <workflow_state>active</workflow_state>
    <position>3</position>
    <items>
      <item identifier="i3">
        <content_type>Assignment</content_type>
        <title>Module 02 Assignment</title>
        <position>1</position>
      </item>
    </items>
  </module>
  <module identifier="m0">
    <title>Instructor Resources</title>
    <workflow_state>unpublished</workflow_state>
    <position>1</position>
    <items>
      <item identifier="i1">
        <content_type>WikiPage</content_type>
        <title>Instructor Notebook - Read Me!</title>
        <position>1</position>
      </item>
    </items>
  </module>
  <module identifier="m1">
    <title>Module 01: Introduction</title>
    <workflow_state>active</workflow_state>
    <position>2</position>
    <items>
      <item identifier="i2">
        <content_type>Attachment</content_type>
        <title>Slides - Lecture 1.pptx</title>
        <position>1</position>
      </item>
      <item identifier="i2b">
        <content_type>Assignment</content_type>
        <title>Module 01 Assignment</title>
        <position>2</position>
      </item>
    </items>
  </module>
</modules>`;

const RUBRICS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rubrics xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <rubric identifier="r1">
    <read_only>false</read_only>
    <title>Discussion Rubric</title>
    <points_possible>10.0</points_possible>
    <criteria>
      <criterion>
        <criterion_id>_4008</criterion_id>
        <points>6.0</points>
        <description>Paragraph(s) about the topic</description>
        <long_description>Well thought out paragraph(s).</long_description>
        <ratings>
          <rating>
            <description>Full Marks</description>
            <points>6.0</points>
            <criterion_id>_4008</criterion_id>
          </rating>
          <rating>
            <description>No Marks</description>
            <points>0.0</points>
            <criterion_id>_4008</criterion_id>
          </rating>
        </ratings>
      </criterion>
      <criterion>
        <criterion_id>_4009</criterion_id>
        <points>4.0</points>
        <description>Replies to peers</description>
        <ratings>
          <rating>
            <description>Full Marks</description>
            <points>4.0</points>
            <criterion_id>_4009</criterion_id>
          </rating>
        </ratings>
      </criterion>
    </criteria>
  </rubric>
  <rubric identifier="r2">
    <title>Assignment Rubric</title>
    <points_possible>20.0</points_possible>
    <criteria>
      <criterion>
        <criterion_id>_1</criterion_id>
        <points>20.0</points>
        <description>Completeness</description>
        <ratings>
        </ratings>
      </criterion>
    </criteria>
  </rubric>
</rubrics>`;

describe("parseCourseSettings", () => {
  it("extracts title, course code, and start date with entities decoded", () => {
    const settings = parseCourseSettings(COURSE_SETTINGS_XML);
    expect(settings.title).toBe("26SS_INFO_1020_2A - Computer Science & Principles");
    expect(settings.courseCode).toBe("26SS_INFO_1020_2A");
    expect(settings.startAt).toBe("2026-06-15T05:00:00");
  });

  it("returns nulls when elements are absent", () => {
    const settings = parseCourseSettings("<course></course>");
    expect(settings.title).toBeNull();
    expect(settings.courseCode).toBeNull();
    expect(settings.startAt).toBeNull();
  });

  it("tolerates attributes on elements", () => {
    const settings = parseCourseSettings('<course><title lang="en">Intro</title></course>');
    expect(settings.title).toBe("Intro");
  });

  it("decodes entities in a single pass without double-decoding", () => {
    expect(parseCourseSettings("<course><title>&#38;lt;kept&#38;gt;</title></course>").title).toBe(
      "&lt;kept&gt;"
    );
    expect(parseCourseSettings("<course><title>&amp;amp;</title></course>").title).toBe("&amp;");
    expect(parseCourseSettings("<course><title>A &#x26; B</title></course>").title).toBe("A & B");
  });

  it("leaves out-of-range numeric entities intact instead of throwing", () => {
    expect(parseCourseSettings("<course><title>&#99999999999;</title></course>").title).toBe(
      "&#99999999999;"
    );
  });

  it("leaves surrogate-range numeric entities intact", () => {
    expect(parseCourseSettings("<course><title>&#55296;</title></course>").title).toBe("&#55296;");
    expect(parseCourseSettings("<course><title>&#xD800;</title></course>").title).toBe("&#xD800;");
  });
});

describe("parseModuleMeta", () => {
  it("extracts modules ordered by position with their items", () => {
    const modules = parseModuleMeta(MODULE_META_XML);
    expect(modules.map((m) => m.name)).toEqual([
      "Instructor Resources",
      "Module 01: Introduction",
      "Module 02: Data & Representation",
    ]);
    expect(modules[1].items).toEqual([
      { title: "Slides - Lecture 1.pptx", type: "Attachment" },
      { title: "Module 01 Assignment", type: "Assignment" },
    ]);
  });

  it("does not confuse item titles with module titles", () => {
    const modules = parseModuleMeta(MODULE_META_XML);
    expect(modules[0].name).toBe("Instructor Resources");
    expect(modules[0].items).toEqual([
      { title: "Instructor Notebook - Read Me!", type: "WikiPage" },
    ]);
  });

  it("supports Module NN week counting and topic split as the tiles do", () => {
    const modules = parseModuleMeta(MODULE_META_XML);
    const weeks = new Set<number>();
    for (const m of modules) {
      const match = m.name.match(/module\s*0*(\d+)/i);
      if (match) weeks.add(parseInt(match[1], 10));
    }
    expect(weeks.size).toBe(2);
    const mod2 = modules.find((m) => m.name.startsWith("Module 02"))!;
    expect(mod2.name.split(":").slice(1).join(":").trim()).toBe("Data & Representation");
    expect(mod2.items.find((i) => i.type.toLowerCase() === "assignment")?.title).toBe(
      "Module 02 Assignment"
    );
  });

  it("parses the module XML this app itself exports", () => {
    const xml = buildModuleMetaXml([
      {
        identifier: "gm1",
        title: "Module 01: Loops",
        position: 1,
        items: [
          { identifier: "gi1", title: "Week 1 Assignment", contentType: "Assignment", identifierref: "ga1", position: 1 },
        ],
      },
    ]);
    const modules = parseModuleMeta(xml);
    expect(modules).toHaveLength(1);
    expect(modules[0].name).toBe("Module 01: Loops");
    expect(modules[0].items).toEqual([{ title: "Week 1 Assignment", type: "Assignment" }]);
  });
});

describe("parseRubrics", () => {
  it("extracts rubric titles, criteria, and ratings", () => {
    const rubrics = parseRubrics(RUBRICS_XML);
    expect(rubrics).toHaveLength(2);
    expect(rubrics[0].title).toBe("Discussion Rubric");
    expect(rubrics[0].criteria).toHaveLength(2);
    expect(rubrics[0].criteria[0]).toMatchObject({
      description: "Paragraph(s) about the topic",
      points: 6,
      longDescription: "Well thought out paragraph(s).",
    });
    expect(rubrics[0].criteria[0].ratings).toEqual([
      { description: "Full Marks", points: 6 },
      { description: "No Marks", points: 0 },
    ]);
  });

  it("keeps criterion description separate from rating descriptions", () => {
    const rubrics = parseRubrics(RUBRICS_XML);
    expect(rubrics[0].criteria[1].description).toBe("Replies to peers");
    expect(rubrics[0].criteria[1].longDescription).toBeNull();
    expect(rubrics[1].criteria[0].ratings).toEqual([]);
  });
});

describe("parseCartridgeBlob", () => {
  it("reads a Canvas-style archive end to end", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", "<manifest></manifest>");
    zip.file("course_settings/course_settings.xml", COURSE_SETTINGS_XML);
    zip.file("course_settings/module_meta.xml", MODULE_META_XML);
    zip.file("course_settings/rubrics.xml", RUBRICS_XML);
    zip.file("course_settings/syllabus.html", "<p>CLASS SYLLABUS</p>");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.hasCourseSettings).toBe(true);
    expect(data.title).toBe("26SS_INFO_1020_2A - Computer Science & Principles");
    expect(data.startAt).toBe("2026-06-15T05:00:00");
    expect(data.syllabusHtml).toBe("<p>CLASS SYLLABUS</p>");
    expect(data.modules).toHaveLength(3);
    expect(data.rubrics).toHaveLength(2);
  });

  it("reports archives without Canvas course settings", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", "<manifest></manifest>");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.hasCourseSettings).toBe(false);
    expect(data.startAt).toBeNull();
    expect(data.syllabusHtml).toBeNull();
    expect(data.modules).toEqual([]);
    expect(data.rubrics).toEqual([]);
  });

  it("parses generic IMSCC manifest with title and nested modules", async () => {
    const { default: JSZip } = await import("jszip");
    const imsccManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscc/imscp_v1p1"
  xmlns:lomimscc="http://www.imsglobal.org/xsd/imscc/imsccv1p1">
  <metadata>
    <lomimscc:lomimscc>
      <lomimscc:string>Introduction to Computer Science</lomimscc:string>
    </lomimscc:lomimscc>
  </metadata>
  <organizations default="default-org">
    <organization identifier="default-org">
      <item identifier="mod1">
        <title>Module 1: Basics</title>
        <item identifier="item1">
          <title>Lecture 1 Slides</title>
        </item>
        <item identifier="item2">
          <title>Assignment 1</title>
        </item>
      </item>
      <item identifier="mod2">
        <title>Module 2: Advanced Topics</title>
        <item identifier="item3">
          <title>Lecture 2 Slides</title>
        </item>
      </item>
    </organization>
  </organizations>
</manifest>`;

    const zip = new JSZip();
    zip.file("imsmanifest.xml", imsccManifest);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.hasCourseSettings).toBe(false);
    expect(data.title).toBe("Introduction to Computer Science");
    expect(data.modules).toHaveLength(2);
    expect(data.modules[0].name).toBe("Module 1: Basics");
    expect(data.modules[0].items).toHaveLength(2);
    expect(data.modules[0].items[0].title).toBe("Lecture 1 Slides");
    expect(data.modules[0].items[1].title).toBe("Assignment 1");
    expect(data.modules[1].name).toBe("Module 2: Advanced Topics");
    expect(data.modules[1].items).toHaveLength(1);
    expect(data.modules[1].items[0].title).toBe("Lecture 2 Slides");
  });

  it("falls back to IMSCC title when Canvas title is missing", async () => {
    const { default: JSZip } = await import("jszip");
    const minimalCourseSettings = `<?xml version="1.0" encoding="UTF-8"?>
<course identifier="test" xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <course_code>TEST101</course_code>
</course>`;

    const imsccManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscc/imscp_v1p1"
  xmlns:lomimscc="http://www.imsglobal.org/xsd/imscc/imsccv1p1">
  <metadata>
    <lomimscc:lomimscc>
      <lomimscc:string>IMSCC Course Title</lomimscc:string>
    </lomimscc:lomimscc>
  </metadata>
  <organizations default="default-org">
    <organization identifier="default-org"></organization>
  </organizations>
</manifest>`;

    const zip = new JSZip();
    zip.file("imsmanifest.xml", imsccManifest);
    zip.file("course_settings/course_settings.xml", minimalCourseSettings);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.hasCourseSettings).toBe(true);
    expect(data.title).toBeNull();
    expect(data.courseCode).toBe("TEST101");
  });

  it("falls back to IMSCC modules when Canvas modules are missing", async () => {
    const { default: JSZip } = await import("jszip");
    const imsccManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscc/imscp_v1p1">
  <organizations default="default-org">
    <organization identifier="default-org">
      <item identifier="mod1">
        <title>Week 1</title>
      </item>
    </organization>
  </organizations>
</manifest>`;

    const zip = new JSZip();
    zip.file("imsmanifest.xml", imsccManifest);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.hasCourseSettings).toBe(false);
    expect(data.modules).toHaveLength(1);
    expect(data.modules[0].name).toBe("Week 1");
  });

  it("handles IMSCC manifest without organizations gracefully", async () => {
    const { default: JSZip } = await import("jszip");
    const imsccManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscc/imscp_v1p1"
  xmlns:lomimscc="http://www.imsglobal.org/xsd/imscc/imsccv1p1">
  <metadata>
    <lomimscc:lomimscc>
      <lomimscc:string>Orphan Course</lomimscc:string>
    </lomimscc:lomimscc>
  </metadata>
</manifest>`;

    const zip = new JSZip();
    zip.file("imsmanifest.xml", imsccManifest);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.title).toBe("Orphan Course");
    expect(data.modules).toEqual([]);
  });

  it("rejects Moodle backup archives", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", "<manifest></manifest>");
    zip.file("moodle_backup.xml", "<backup></backup>");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    await expect(parseCartridgeBlob(blob)).rejects.toThrow(
      "Moodle .mbz backups are not supported - export the course as an IMS Common Cartridge instead."
    );
  });

  it("rejects gzip-compressed files that fail to unzip", async () => {
    const gzipMagic = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00]);
    const blob = new Blob([gzipMagic], { type: "application/gzip" });

    await expect(parseCartridgeBlob(blob)).rejects.toThrow(
      "Moodle .mbz backups are not supported - export the course as an IMS Common Cartridge instead."
    );
  });

  it("tolerates missing manifest when falling back to IMSCC", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.hasCourseSettings).toBe(false);
    expect(data.title).toBeNull();
    expect(data.modules).toEqual([]);
  });

  it("handles IMSCC items without titles gracefully", async () => {
    const { default: JSZip } = await import("jszip");
    const imsccManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscc/imscp_v1p1">
  <organizations default="default-org">
    <organization identifier="default-org">
      <item identifier="mod1">
        <title>Module with items</title>
        <item identifier="item1">
          <content>Missing title</content>
        </item>
        <item identifier="item2">
          <title>Item with title</title>
        </item>
      </item>
    </organization>
  </organizations>
</manifest>`;

    const zip = new JSZip();
    zip.file("imsmanifest.xml", imsccManifest);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.modules).toHaveLength(1);
    expect(data.modules[0].items).toHaveLength(1);
    expect(data.modules[0].items[0].title).toBe("Item with title");
  });

  it("handles IMSCC modules without titles gracefully", async () => {
    const { default: JSZip } = await import("jszip");
    const imsccManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscc/imscp_v1p1">
  <organizations default="default-org">
    <organization identifier="default-org">
      <item identifier="mod1">
        <content>Module without title</content>
      </item>
      <item identifier="mod2">
        <title>Valid Module</title>
      </item>
    </organization>
  </organizations>
</manifest>`;

    const zip = new JSZip();
    zip.file("imsmanifest.xml", imsccManifest);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.modules).toHaveLength(1);
    expect(data.modules[0].name).toBe("Valid Module");
  });
});

// Fixtures below mirror the real structure of a Blackboard course archive
// export (verified against a real sample during development, not committed
// here - see cartridge-import.ts's own header/section comments for the
// full shape): a nested <item> tree under <organizations>, a <resources>
// block resolving identifierref to a bb:file/bb:title/type, a course record
// resNNNNN.dat, and Blackboard's reserved scaffolding labels ("ROOT",
// "--TOP--", "INTERACTIVE", "INDIRECT").

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

const IMSCC_NAMESPACE_MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscc/imscp_v1p1"><organizations><organization
  identifier="o1"><item identifier="i1"><title>Week 1</title></item></organization></organizations></manifest>`;

describe("detectCartridgeFormat", () => {
  it("detects Blackboard from the bb: content-packaging namespace in imsmanifest.xml", () => {
    expect(detectCartridgeFormat(BLACKBOARD_NESTED_MANIFEST_XML)).toBe("blackboard");
  });

  it("detects Blackboard from the .bb-* marker files even without the namespace", () => {
    const manifestWithoutNamespace = `<manifest identifier="man00001"><organizations></organizations></manifest>`;
    expect(detectCartridgeFormat(manifestWithoutNamespace, true)).toBe("blackboard");
  });

  it("detects a Common Cartridge manifest as common-cartridge", () => {
    expect(detectCartridgeFormat(IMSCC_NAMESPACE_MANIFEST_XML)).toBe("common-cartridge");
  });

  it("reports unknown for a manifest with neither signal, and for no manifest at all", () => {
    expect(detectCartridgeFormat("<manifest></manifest>")).toBe("common-cartridge");
    expect(detectCartridgeFormat(null)).toBe("unknown");
    expect(detectCartridgeFormat("not xml at all")).toBe("unknown");
  });
});

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
