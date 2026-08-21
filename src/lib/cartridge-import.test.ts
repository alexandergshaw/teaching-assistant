import { describe, it, expect } from "vitest";
import {
  parseCourseSettings,
  parseModuleMeta,
  parseRubrics,
  parseCartridgeBlob,
  detectCartridgeFormat,
  MAX_CARTRIDGE_ITEM_BODY_CHARS,
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
      { title: "Slides - Lecture 1.pptx", type: "Attachment", identifier: "i2" },
      { title: "Module 01 Assignment", type: "Assignment", identifier: "i2b" },
    ]);
  });

  it("does not confuse item titles with module titles", () => {
    const modules = parseModuleMeta(MODULE_META_XML);
    expect(modules[0].name).toBe("Instructor Resources");
    expect(modules[0].items).toEqual([
      { title: "Instructor Notebook - Read Me!", type: "WikiPage", identifier: "i1" },
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
    expect(modules[0].identifier).toBe("gm1");
    expect(modules[0].items).toEqual([
      { title: "Week 1 Assignment", type: "Assignment", identifier: "gi1" },
    ]);
  });
});

// The survey behind this change found that CartridgeModuleItem carried no
// stable identity - selection keys for an export-sourced item were forced to
// be POSITIONAL (moduleIndex:itemIndex), stable only within one parse of one
// unchanged zip. But the Canvas cartridge XML always carries a per-item
// `identifier` attribute (module_meta.xml's own `<item identifier="...">`,
// verified above via MODULE_META_XML) - it was being read into the DOM match
// and then thrown away. This section covers that attribute surviving
// parsing, an item that genuinely lacks one still parsing without throwing,
// and the case a positional key cannot handle at all: two items in the same
// module sharing a title.
describe("parseModuleMeta - item identifier", () => {
  it("carries a Canvas cartridge item's own identifier attribute through parsing, alongside the module's", () => {
    const modules = parseModuleMeta(MODULE_META_XML);
    const mod2 = modules.find((m) => m.name.startsWith("Module 02"))!;
    expect(mod2.identifier).toBe("m2");
    expect(mod2.items[0]).toEqual({
      title: "Module 02 Assignment",
      type: "Assignment",
      identifier: "i3",
    });
  });

  it("parses an item with no identifier attribute without throwing, leaving the field unset", () => {
    const xmlNoIdentifier = `<?xml version="1.0" encoding="UTF-8"?>
<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <module>
    <title>No Identifiers Module</title>
    <position>1</position>
    <items>
      <item>
        <content_type>Assignment</content_type>
        <title>Untagged Item</title>
        <position>1</position>
      </item>
    </items>
  </module>
</modules>`;
    const modules = parseModuleMeta(xmlNoIdentifier);
    expect(modules).toHaveLength(1);
    expect(modules[0].identifier).toBeUndefined();
    expect(modules[0].items).toEqual([{ title: "Untagged Item", type: "Assignment" }]);
    expect(modules[0].items[0].identifier).toBeUndefined();
  });

  it("distinguishes two items with the identical title by identifier - what a title-based key could not do", () => {
    const xmlDuplicateTitles = `<?xml version="1.0" encoding="UTF-8"?>
<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <module identifier="mdup">
    <title>Duplicate Titles Module</title>
    <position>1</position>
    <items>
      <item identifier="dup-a">
        <content_type>Assignment</content_type>
        <title>Weekly Reflection</title>
        <position>1</position>
      </item>
      <item identifier="dup-b">
        <content_type>Assignment</content_type>
        <title>Weekly Reflection</title>
        <position>2</position>
      </item>
    </items>
  </module>
</modules>`;
    const modules = parseModuleMeta(xmlDuplicateTitles);
    const items = modules[0].items;
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe(items[1].title);
    expect(items[0].identifier).toBe("dup-a");
    expect(items[1].identifier).toBe("dup-b");
    expect(items[0].identifier).not.toBe(items[1].identifier);
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

  // The generic (non-Canvas) Common Cartridge path was the material open
  // question here: does it have item identifiers available at all? It does -
  // a generic manifest's organizations <item> elements carry the same
  // `identifier` attribute Canvas's module_meta.xml carries (required by the
  // IMS CP schema on every organizations item, module and leaf item alike),
  // and this app's own generator already emits one on every item it writes
  // (buildCommonCartridge in workflows/common-cartridge.ts). This reuses the
  // exact fixture from the "parses generic IMSCC manifest" test above.
  it("carries item and module identifiers through the generic Common Cartridge path too", async () => {
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
    </organization>
  </organizations>
</manifest>`;

    const zip = new JSZip();
    zip.file("imsmanifest.xml", imsccManifest);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.modules[0].identifier).toBe("mod1");
    expect(data.modules[0].items[0].identifier).toBe("item1");
    expect(data.modules[0].items[1].identifier).toBe("item2");
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

// Part 1 of the INFO 1020 Week 8 fix: an item's identifierref resolves,
// through imsmanifest.xml's <resources> block, to the zip path of the HTML
// file backing its body - mirroring the real INFO 1020 export's own shape
// (module-08-assignment.html sitting inside a hashed resource folder,
// referenced exactly this way).
describe("parseCartridgeBlob - item body resolution", () => {
  const MODULE_META_WITH_REF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<modules xmlns="http://canvas.instructure.com/xsd/cccv1p0">
  <module identifier="m1">
    <title>Module 08</title>
    <workflow_state>active</workflow_state>
    <position>1</position>
    <items>
      <item identifier="i1">
        <content_type>Assignment</content_type>
        <title>Module 08 Assignment</title>
        <identifierref>ares1</identifierref>
        <position>1</position>
      </item>
      <item identifier="i2">
        <content_type>WikiPage</content_type>
        <title>Module 08 Learning</title>
        <identifierref>pres1</identifierref>
        <position>2</position>
      </item>
      <item identifier="i3">
        <content_type>Attachment</content_type>
        <title>No Resource Match</title>
        <identifierref>missing-res</identifierref>
        <position>3</position>
      </item>
      <item identifier="i4">
        <content_type>Attachment</content_type>
        <title>No Identifierref At All</title>
        <position>4</position>
      </item>
    </items>
  </module>
</modules>`;

  const manifestWithResources = (resourcesXml: string) => `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="man1" xmlns="http://www.imsglobal.org/xsd/imscc/imscp_v1p1">
  <organizations></organizations>
  <resources>
    ${resourcesXml}
  </resources>
</manifest>`;

  it("resolves an item's body from its linked HTML resource, tag-stripped and whitespace-collapsed", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file(
      "imsmanifest.xml",
      manifestWithResources(
        `<resource identifier="ares1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="g7db8/assignment.html"><file href="g7db8/assignment.html"/><file href="g7db8/assignment_settings.xml"/></resource>`
      )
    );
    zip.file("course_settings/module_meta.xml", MODULE_META_WITH_REF_XML);
    zip.file(
      "g7db8/assignment.html",
      "<html><body><p>Start with mod10.zip.</p><p>Submit to GitHub.</p></body></html>"
    );
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    const assignment = data.modules[0].items.find((i) => i.title === "Module 08 Assignment");
    expect(assignment?.body).toBe("Start with mod10.zip. Submit to GitHub.");
    // Title/type extraction (the part this fix must not touch) still reads
    // exactly as before.
    expect(assignment?.type).toBe("Assignment");
  });

  it("caps an oversized body at MAX_CARTRIDGE_ITEM_BODY_CHARS with a truncation marker", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", manifestWithResources(`<resource identifier="ares1" type="webcontent" href="a.html"/>`));
    zip.file("course_settings/module_meta.xml", MODULE_META_WITH_REF_XML);
    const longText = "x".repeat(MAX_CARTRIDGE_ITEM_BODY_CHARS + 500);
    zip.file("a.html", `<html><body>${longText}</body></html>`);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    const assignment = data.modules[0].items.find((i) => i.title === "Module 08 Assignment");
    expect(assignment?.body?.length).toBe(MAX_CARTRIDGE_ITEM_BODY_CHARS + 3);
    expect(assignment?.body?.endsWith("...")).toBe(true);
    expect(assignment?.body?.startsWith("x".repeat(50))).toBe(true);
  });

  it("keeps body unset (not null) for an item with no identifierref at all", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", manifestWithResources(`<resource identifier="ares1" type="webcontent" href="a.html"/>`));
    zip.file("course_settings/module_meta.xml", MODULE_META_WITH_REF_XML);
    zip.file("a.html", "<html><body>Body text</body></html>");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    const item = data.modules[0].items.find((i) => i.title === "No Identifierref At All");
    expect(item?.body).toBeUndefined();
  });

  it("keeps body unset when the identifierref has no matching manifest resource", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", manifestWithResources(`<resource identifier="ares1" type="webcontent" href="a.html"/>`));
    zip.file("course_settings/module_meta.xml", MODULE_META_WITH_REF_XML);
    zip.file("a.html", "<html><body>Body text</body></html>");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    const item = data.modules[0].items.find((i) => i.title === "No Resource Match");
    expect(item?.body).toBeUndefined();
  });

  it("does not throw and keeps body unset when the resolved HTML file is missing from the zip", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file(
      "imsmanifest.xml",
      manifestWithResources(`<resource identifier="ares1" type="webcontent" href="does-not-exist.html"/>`)
    );
    zip.file("course_settings/module_meta.xml", MODULE_META_WITH_REF_XML);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    const assignment = data.modules[0].items.find((i) => i.title === "Module 08 Assignment");
    expect(assignment?.body).toBeUndefined();
  });

  it("prefers a <file> child's HTML href when the resource's own href is not HTML", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file(
      "imsmanifest.xml",
      manifestWithResources(
        `<resource identifier="ares1" type="webcontent" href="a.html"/>` +
          `<resource identifier="pres1" type="webcontent" href="settings.xml"><file href="settings.xml"/><file href="page.html"/></resource>`
      )
    );
    zip.file("course_settings/module_meta.xml", MODULE_META_WITH_REF_XML);
    zip.file("a.html", "<html><body>Assignment body</body></html>");
    zip.file("settings.xml", "<settings><foo>not html</foo></settings>");
    zip.file("page.html", "<html><body>Real learning page text</body></html>");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    const learning = data.modules[0].items.find((i) => i.title === "Module 08 Learning");
    expect(learning?.body).toBe("Real learning page text");
  });

  it("leaves body unset when a resource's only href is non-HTML (no HTML sibling anywhere)", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file(
      "imsmanifest.xml",
      manifestWithResources(`<resource identifier="ares1" type="webcontent" href="assignment_settings.xml"/>`)
    );
    zip.file("course_settings/module_meta.xml", MODULE_META_WITH_REF_XML);
    zip.file("assignment_settings.xml", "<settings><points>10</points></settings>");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    const assignment = data.modules[0].items.find((i) => i.title === "Module 08 Assignment");
    expect(assignment?.body).toBeUndefined();
  });

  it("resolves bodies for the generic Common Cartridge path too (no Canvas course_settings)", async () => {
    const { default: JSZip } = await import("jszip");
    const imsccManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest xmlns="http://www.imsglobal.org/xsd/imscc/imscp_v1p1"
  xmlns:lomimscc="http://www.imsglobal.org/xsd/imscc/imsccv1p1">
  <metadata>
    <lomimscc:lomimscc>
      <lomimscc:string>Generic Course</lomimscc:string>
    </lomimscc:lomimscc>
  </metadata>
  <organizations default="default-org">
    <organization identifier="default-org">
      <item identifier="mod1">
        <title>Module 1</title>
        <item identifier="item1" identifierref="ares1">
          <title>Assignment 1</title>
        </item>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="ares1" type="webcontent" href="assignment.html"/>
  </resources>
</manifest>`;

    const zip = new JSZip();
    zip.file("imsmanifest.xml", imsccManifest);
    zip.file("assignment.html", "<html><body>Generic cartridge assignment body</body></html>");
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.hasCourseSettings).toBe(false);
    const item = data.modules[0].items.find((i) => i.title === "Assignment 1");
    expect(item?.body).toBe("Generic cartridge assignment body");
  });
});

// AC A4 (docs/import-course-export-to-intro-video-acceptance-criteria.md):
// parseCartridgeBlob additively reads course_settings/context.xml and
// attaches its parsed Canvas identity to the result. The parsing itself is
// covered in depth by cartridge-canvas-identity.test.ts against the real
// fixture; these tests cover only the wiring - that parseCartridgeBlob
// reads the right zip path, attaches the field under the right key, and
// leaves it undefined (not a null-filled object) when the entry is absent.
describe("parseCartridgeBlob - canvasIdentity", () => {
  const REAL_CONTEXT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<context_info xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd">
  <course_id>10287</course_id>
  <course_name>Introduction to Cybersecurity</course_name>
  <root_account_id>10000000000001</root_account_id>
  <root_account_name>Rize Education</root_account_name>
  <root_account_uuid>4sJRMgKXc4cUAUxny30BvkTMCVf34mPH5L4rmAM9</root_account_uuid>
  <canvas_domain>canvas.rize.education</canvas_domain>
</context_info>`;

  it("attaches canvasIdentity parsed from course_settings/context.xml when present", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", "<manifest></manifest>");
    zip.file("course_settings/course_settings.xml", COURSE_SETTINGS_XML);
    zip.file("course_settings/context.xml", REAL_CONTEXT_XML);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.canvasIdentity).toEqual({
      courseId: "10287",
      courseName: "Introduction to Cybersecurity",
      canvasDomain: "canvas.rize.education",
    });
  });

  it("leaves canvasIdentity undefined when context.xml is absent from the archive", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", "<manifest></manifest>");
    zip.file("course_settings/course_settings.xml", COURSE_SETTINGS_XML);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.canvasIdentity).toBeUndefined();
  });

  it("does not disturb any existing field when context.xml is present (purely additive)", async () => {
    const { default: JSZip } = await import("jszip");
    const zip = new JSZip();
    zip.file("imsmanifest.xml", "<manifest></manifest>");
    zip.file("course_settings/course_settings.xml", COURSE_SETTINGS_XML);
    zip.file("course_settings/module_meta.xml", MODULE_META_XML);
    zip.file("course_settings/rubrics.xml", RUBRICS_XML);
    zip.file("course_settings/syllabus.html", "<p>CLASS SYLLABUS</p>");
    zip.file("course_settings/context.xml", REAL_CONTEXT_XML);
    const bytes = await zip.generateAsync({ type: "arraybuffer" });
    const blob = new Blob([bytes], { type: "application/zip" });

    const data = await parseCartridgeBlob(blob);
    expect(data.hasCourseSettings).toBe(true);
    expect(data.title).toBe("26SS_INFO_1020_2A - Computer Science & Principles");
    expect(data.modules).toHaveLength(3);
    expect(data.rubrics).toHaveLength(2);
    expect(data.canvasIdentity?.courseId).toBe("10287");
  });
});

// detectCartridgeFormat stays exercised here (the function itself lives in
// cartridge-import.ts, not the Blackboard-only module) with minimal inline
// fixtures rather than the full Blackboard archive shape - the Blackboard
// parsing tests themselves (parseBlackboardManifest, "parseCartridgeBlob -
// Blackboard archive") moved to cartridge-import-blackboard.test.ts
// alongside cartridge-import-blackboard.ts, which is where that shape is
// actually exercised in depth.
describe("detectCartridgeFormat", () => {
  it("detects Blackboard from the bb: content-packaging namespace in imsmanifest.xml", () => {
    const manifestWithNamespace = `<manifest xmlns:bb="http://www.blackboard.com/content-packaging/"><organizations></organizations></manifest>`;
    expect(detectCartridgeFormat(manifestWithNamespace)).toBe("blackboard");
  });

  it("detects Blackboard from the .bb-* marker files even without the namespace", () => {
    const manifestWithoutNamespace = `<manifest identifier="man00001"><organizations></organizations></manifest>`;
    expect(detectCartridgeFormat(manifestWithoutNamespace, true)).toBe("blackboard");
  });

  it("detects a Common Cartridge manifest as common-cartridge", () => {
    const commonCartridgeManifest = `<manifest xmlns="http://www.imsglobal.org/xsd/imscc/imscp_v1p1"><organizations><organization
  identifier="o1"><item identifier="i1"><title>Week 1</title></item></organization></organizations></manifest>`;
    expect(detectCartridgeFormat(commonCartridgeManifest)).toBe("common-cartridge");
  });

  it("reports unknown for a manifest with neither signal, and for no manifest at all", () => {
    expect(detectCartridgeFormat("<manifest></manifest>")).toBe("common-cartridge");
    expect(detectCartridgeFormat(null)).toBe("unknown");
    expect(detectCartridgeFormat("not xml at all")).toBe("unknown");
  });
});
