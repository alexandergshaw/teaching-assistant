// AC1: the Course Schedule .docx bypasses the typography normalization every
// other generated document already gets.
//
// buildDocxFromPlainText (src/lib/docx.ts) runs its whole payload through
// normalizeTypography (src/lib/text-normalize.ts) before rendering, so every
// generator that flows through it ships plain ASCII. buildCourseScheduleDocx
// (./steps.course-guides.ts) builds its document DIRECTLY against the `docx`
// library instead, so nothing normalizes the row text it is handed - a real
// generated course was measured shipping 470 em/en dashes and 58 curly
// quotes.
//
// These tests unpack the REAL .docx and assert on word/document.xml, the same
// approach docx.test.ts and pptx.typography.test.ts already take. That
// matters here: a test that mocked the `docx` library would stay green while
// the shipped file still carried the character.
//
// Fixture characters are built from their numeric code point rather than
// typed as literals, matching normalizeTypography's own house-rule note (only
// ASCII hyphens belong in this codebase).

import { describe, it, expect, vi } from "vitest";
import JSZip from "jszip";

// steps.course-guides.ts imports the server-action barrel at module load;
// mocked exactly as steps.course-guides.test.ts already does so this file can
// import the pure builder without booting the app.
vi.mock("@/app/actions", () => ({
  listCourseHubAction: vi.fn(),
  listCourseContentAction: vi.fn(),
  createModuleAction: vi.fn(),
  createPageAction: vi.fn(),
  updatePageAction: vi.fn(),
  createModuleItemAction: vi.fn(),
  generateCourseFaqAction: vi.fn(),
}));

import { buildCourseScheduleDocx, type ScheduleRow } from "./steps.course-guides";

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);
const LEFT_SINGLE_QUOTE = String.fromCharCode(0x2018);
const RIGHT_SINGLE_QUOTE = String.fromCharCode(0x2019);
const LEFT_DOUBLE_QUOTE = String.fromCharCode(0x201c);
const RIGHT_DOUBLE_QUOTE = String.fromCharCode(0x201d);

const SMART_TYPOGRAPHY: Array<[string, string]> = [
  ["em dash", EM_DASH],
  ["en dash", EN_DASH],
  ["left single quote", LEFT_SINGLE_QUOTE],
  ["right single quote", RIGHT_SINGLE_QUOTE],
  ["left double quote", LEFT_DOUBLE_QUOTE],
  ["right double quote", RIGHT_DOUBLE_QUOTE],
];

async function documentXml(buffer: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file("word/document.xml")!.async("string");
}

// Every visible string in the document is a <w:t> run, so joining them is the
// document's rendered text - taken from the REAL word/document.xml, just
// without the namespace/style markup that would otherwise bury an assertion
// failure in a 4KB blob.
function documentText(xml: string): string {
  // The tag boundary matters: "<w:t[^>]*>" would also match "<w:tblPr>".
  return (xml.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g) ?? [])
    .map((run) => run.replace(/^<w:t(?:\s[^>]*)?>/, "").replace(/<\/w:t>$/, ""))
    .join("\n")
    // The docx library XML-escapes straight quotes and apostrophes on the way
    // into a w:t node - docx.test.ts pins that behavior directly, asserting
    // the escaped form. Word renders them as ordinary characters, so they are
    // correct output, not a normalization failure. Decode them here so an
    // assertion about what the READER sees is not defeated by how the XML
    // spells it. Without this, a curly-quote assertion can never pass no
    // matter what normalizeTypography does, because the straight quote it
    // produces arrives as an entity.
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function scheduleText(
  courseLabel: string,
  rows: ScheduleRow[]
): Promise<string> {
  return documentText(await documentXml(await buildCourseScheduleDocx(courseLabel, rows, "Test Author")));
}

function row(overrides: Partial<ScheduleRow> = {}): ScheduleRow {
  return { week: 1, topic: "Topic", summary: "", assignment: "", ...overrides };
}

describe("buildCourseScheduleDocx typography normalization (AC1)", () => {
  it("normalizes an em dash in a week's topic to a spaced ASCII hyphen", async () => {
    const text = await scheduleText("CS 101", [row({ topic: `Risk Registers${EM_DASH}Building One` })]);

    expect(text).not.toContain(EM_DASH);
    expect(text).toContain("Risk Registers - Building One");
  });

  it("normalizes an en dash numeric range in a week's summary to a plain hyphen", async () => {
    const text = await scheduleText("CS 101", [
      row({ summary: `Covers the 2013${EN_DASH}2016 breach wave.` }),
    ]);

    expect(text).not.toContain(EN_DASH);
    expect(text).toContain("2013-2016");
  });

  it("normalizes curly quotes in a week's assignment cell to straight ASCII quotes", async () => {
    const text = await scheduleText("CS 101", [
      row({
        assignment: `Draft the ${LEFT_DOUBLE_QUOTE}charter${RIGHT_DOUBLE_QUOTE} for Tesla${RIGHT_SINGLE_QUOTE}s program`,
      }),
    ]);

    expect(text).not.toContain(LEFT_DOUBLE_QUOTE);
    expect(text).not.toContain(RIGHT_DOUBLE_QUOTE);
    expect(text).not.toContain(RIGHT_SINGLE_QUOTE);
    expect(text).toContain(`Draft the "charter" for Tesla's program`);
  });

  it("normalizes the course label written into the document title", async () => {
    const text = await scheduleText(`MGT 422${EM_DASH}Project Management`, [row()]);

    expect(text).not.toContain(EM_DASH);
    expect(text).toContain("MGT 422 - Project Management");
  });

  // The whole-document sweep: every smart-typography character this app
  // normalizes elsewhere, checked across every cell of a realistic multi-week
  // schedule at once. This is the assertion that matches the measured defect
  // (470 dashes / 58 curly quotes in one shipped course).
  it("carries none of the smart-typography characters anywhere in the document", async () => {
    const rows: ScheduleRow[] = [
      row({
        week: 1,
        topic: `Course Intro${EM_DASH}What Project Management Is`,
        summary: `A survey of the 1950${EN_DASH}1960 origins of the discipline.`,
        assignment: `Read the ${LEFT_DOUBLE_QUOTE}Getting Started${RIGHT_DOUBLE_QUOTE} brief`,
      }),
      row({
        week: 2,
        topic: `Stakeholders${EN_DASH}Mapping and Analysis`,
        summary: `Identify each stakeholder${RIGHT_SINGLE_QUOTE}s interest and influence.`,
        assignment: `Submit the ${LEFT_SINGLE_QUOTE}register${RIGHT_SINGLE_QUOTE} worksheet`,
      }),
    ];
    const text = await scheduleText("MGT 422", rows);

    for (const [name, char] of SMART_TYPOGRAPHY) {
      expect(text, `the document still carries the ${name}`).not.toContain(char);
    }
  });
});
