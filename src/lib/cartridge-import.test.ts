import { describe, it, expect } from "vitest";
import {
  parseCourseSettings,
  parseModuleMeta,
  parseRubrics,
  parseCartridgeBlob,
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
});
