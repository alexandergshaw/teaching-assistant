import { describe, it, expect } from "vitest";
import { buildAssignmentSettingsXml, buildModuleMetaXml, buildQtiAssessmentXml } from "./common-cartridge";

describe("buildAssignmentSettingsXml", () => {
  it("includes due_at when provided", () => {
    // dueAt is a UTC ISO-8601 timestamp without suffix; Canvas parses
    // zoneless due_at values as UTC.
    const xml = buildAssignmentSettingsXml({
      identifier: "a001",
      title: "Week 1 Assignment",
      points: 100,
      dueAt: "2026-08-24T04:59:00",
    });

    expect(xml).toContain("<due_at>2026-08-24T04:59:00</due_at>");
    expect(xml).toContain("<title>Week 1 Assignment</title>");
    expect(xml).toContain("<points_possible>100</points_possible>");
  });

  it("omits due_at element when not provided", () => {
    const xml = buildAssignmentSettingsXml({
      identifier: "a002",
      title: "No Due Date",
      points: 50,
    });

    expect(xml).not.toContain("<due_at>");
    expect(xml).toContain("<title>No Due Date</title>");
  });

  it("escapes HTML entities in title", () => {
    const xml = buildAssignmentSettingsXml({
      identifier: "a003",
      title: 'Assignment & Rubric <Details>',
      points: 100,
    });

    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;Details&gt;");
  });

  it("includes required Canvas attributes and workflow state", () => {
    const xml = buildAssignmentSettingsXml({
      identifier: "a004",
      title: "Test",
      points: 25,
    });

    expect(xml).toContain("xmlns=");
    expect(xml).toContain("<submission_types>online_text_entry</submission_types>");
    expect(xml).toContain("<grading_type>points</grading_type>");
    expect(xml).toContain("<workflow_state>published</workflow_state>");
  });

  it("includes XML declaration", () => {
    const xml = buildAssignmentSettingsXml({
      identifier: "a005",
      title: "Test",
      points: 1,
    });

    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  });
});

describe("buildModuleMetaXml", () => {
  it("renders modules in order with positions", () => {
    const xml = buildModuleMetaXml([
      {
        identifier: "m1",
        title: "Week 1",
        position: 1,
        items: [],
      },
      {
        identifier: "m2",
        title: "Week 2",
        position: 2,
        items: [],
      },
    ]);

    expect(xml).toContain("<module");
    expect(xml).toMatch(/<position>1<\/position>/);
    expect(xml).toMatch(/<position>2<\/position>/);
    expect(xml).toContain("<title>Week 1</title>");
    expect(xml).toContain("<title>Week 2</title>");
  });

  it("includes items with content types", () => {
    const xml = buildModuleMetaXml([
      {
        identifier: "m1",
        title: "Week 1",
        position: 1,
        items: [
          {
            identifier: "i1",
            title: "Assignment 1",
            contentType: "Assignment",
            identifierref: "r001",
            position: 1,
          },
          {
            identifier: "i2",
            title: "Slides.pptx",
            contentType: "Attachment",
            identifierref: "r002",
            position: 2,
          },
        ],
      },
    ]);

    expect(xml).toContain("<content_type>Assignment</content_type>");
    expect(xml).toContain("<content_type>Attachment</content_type>");
    expect(xml).toContain("<identifierref>r001</identifierref>");
  });

  it("escapes titles containing HTML entities", () => {
    const xml = buildModuleMetaXml([
      {
        identifier: "m1",
        title: "Module & Resources <New>",
        position: 1,
        items: [
          {
            identifier: "i1",
            title: "Task: Read & Review",
            contentType: "Attachment",
            identifierref: "r001",
            position: 1,
          },
        ],
      },
    ]);

    expect(xml).toContain("Module &amp; Resources");
    expect(xml).toContain("Task: Read &amp; Review");
    expect(xml).toContain("&lt;New&gt;");
  });

  it("includes workflow_state active on all items", () => {
    const xml = buildModuleMetaXml([
      {
        identifier: "m1",
        title: "Test",
        position: 1,
        items: [
          {
            identifier: "i1",
            title: "Item",
            contentType: "Assignment",
            identifierref: "r001",
            position: 1,
          },
        ],
      },
    ]);

    // Should have workflow_state at module level and item level
    const matches = xml.match(/<workflow_state>active<\/workflow_state>/g);
    expect(matches).toBeTruthy();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it("includes XML declaration and namespace", () => {
    const xml = buildModuleMetaXml([]);

    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('xmlns="http://canvas.instructure.com/xsd/cccv1p0"');
  });
});

describe("buildQtiAssessmentXml", () => {
  it("includes cc_profile fields for exam and essay", () => {
    const xml = buildQtiAssessmentXml({
      identifier: "qti001",
      title: "Week 1 Assessment",
      html: "<p>Instructions</p>",
    });

    expect(xml).toContain("<fieldentry>cc.exam.v0p1</fieldentry>");
    expect(xml).toContain("<fieldentry>cc.essay.v0p1</fieldentry>");
  });

  it("includes response_str for essay response", () => {
    const xml = buildQtiAssessmentXml({
      identifier: "qti001",
      title: "Assessment",
      html: "<p>Write an essay</p>",
    });

    expect(xml).toContain("<response_str ident=\"response1\" rcardinality=\"Single\">");
    expect(xml).toContain("<render_fib>");
    expect(xml).toContain("<response_label ident=\"answer1\" rshuffle=\"No\"/>");
  });

  it("escapes title containing & and <", () => {
    const xml = buildQtiAssessmentXml({
      identifier: "qti002",
      title: "Final & Midterm <Exam>",
      html: "<p>Test</p>",
    });

    expect(xml).toContain("Final &amp; Midterm &lt;Exam&gt;");
  });

  it("escapes html in mattext", () => {
    const xml = buildQtiAssessmentXml({
      identifier: "qti003",
      title: "Task",
      html: "<p>Read the docs & submit</p>",
    });

    expect(xml).toContain("&lt;p&gt;Read the docs &amp; submit&lt;/p&gt;");
  });

  it("includes identifier in assessment and item ident attributes", () => {
    const xml = buildQtiAssessmentXml({
      identifier: "qti_special",
      title: "Test Assessment",
      html: "<p>Instructions</p>",
    });

    expect(xml).toContain('ident="qti_special"');
    expect(xml).toContain('ident="qti_special_i1"');
  });

  it("includes XML declaration and QTI namespace", () => {
    const xml = buildQtiAssessmentXml({
      identifier: "qti001",
      title: "Test",
      html: "<p>Test</p>",
    });

    expect(xml).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"');
    expect(xml).toContain("xsi:schemaLocation");
  });

  it("includes scoring metadata fields", () => {
    const xml = buildQtiAssessmentXml({
      identifier: "qti001",
      title: "Graded Task",
      html: "<p>Submit your work</p>",
    });

    expect(xml).toContain("<fieldentry>Percentage</fieldentry>");
    expect(xml).toContain("<fieldentry>Yes</fieldentry>");
    expect(xml).toContain("<fieldentry>No</fieldentry>");
  });
});
