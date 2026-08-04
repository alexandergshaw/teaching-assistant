// P3-AC4: proves auditPptxGraphics sees a REAL table graphic in a REAL
// generated .pptx - the exact case a naive <p:sp>-only shape count missed
// (see registry.graphics-gap-reporting.test.ts's background comment and
// this module's own header comment for the full root-cause writeup).
//
// buildSlidesPptx is the real function (not mocked) - this suite unzips an
// actual generated deck's XML, the same way a human auditing a real course
// export would.

import { describe, it, expect } from "vitest";
import { buildSlidesPptx } from "./pptx";
import { auditPptxGraphics, pptxSlidesMissingRequiredGraphic } from "./pptx-graphics-audit";

function testDeck() {
  return buildSlidesPptx({
    presentationTitle: "Audit Test Deck",
    slides: [
      // No graphic required, none present.
      { title: "Principle: plain content", bullets: ["a plain bullet"] },
      // One of each closed graphic kind, each on a required-prefix slide.
      {
        title: "Artifact: a stakeholder matrix",
        bullets: ["b1"],
        graphic: {
          kind: "matrix2x2",
          xAxisLabel: "Interest",
          yAxisLabel: "Power",
          quadrants: {
            topLeft: { label: "Keep Satisfied", items: ["Finance"] },
            topRight: { label: "Manage Closely", items: ["Sponsor"] },
            bottomLeft: { label: "Monitor", items: [] },
            bottomRight: { label: "Keep Informed", items: ["End Users"] },
          },
        },
      },
      {
        title: "Artifact: an approval process",
        bullets: ["b1"],
        graphic: {
          kind: "process",
          steps: [{ label: "Draft" }, { label: "Review" }, { label: "Approve" }],
        },
      },
      {
        title: "Artifact: a project charter",
        bullets: ["b1"],
        graphic: {
          kind: "table",
          headers: ["Field", "Why it exists"],
          rows: [["Scope", "Bounds the work"]],
        },
      },
      // A required-prefix slide with NO graphic - the genuine gap
      // pptxSlidesMissingRequiredGraphic below must still catch.
      { title: "Judgment Call: cost vs schedule", bullets: ["b1"] },
    ],
  });
}

describe("auditPptxGraphics", () => {
  it("reports one entry per content slide, excluding the title slide", async () => {
    const buf = await testDeck();
    const audits = await auditPptxGraphics(buf, "applied");
    expect(audits).toHaveLength(5);
    expect(audits.map((a) => a.title)).toEqual([
      "Principle: plain content",
      "Artifact: a stakeholder matrix",
      "Artifact: an approval process",
      "Artifact: a project charter",
      "Judgment Call: cost vs schedule",
    ]);
  });

  it("a plain slide with no required prefix and no graphic reads as such", async () => {
    const buf = await testDeck();
    const [plain] = await auditPptxGraphics(buf, "applied");
    expect(plain.requiresGraphic).toBe(false);
    expect(plain.hasGraphic).toBe(false);
    expect(plain.tableCount).toBe(0);
  });

  it("a matrix2x2 graphic is detected via its text shapes, not a table", async () => {
    const buf = await testDeck();
    const audits = await auditPptxGraphics(buf, "applied");
    const matrix = audits.find((a) => a.title === "Artifact: a stakeholder matrix")!;
    expect(matrix.requiresGraphic).toBe(true);
    expect(matrix.hasGraphic).toBe(true);
    expect(matrix.tableCount).toBe(0);
    expect(matrix.textShapeCount).toBeGreaterThan(2);
  });

  it("a process graphic is detected via its text shapes, not a table", async () => {
    const buf = await testDeck();
    const audits = await auditPptxGraphics(buf, "applied");
    const process = audits.find((a) => a.title === "Artifact: an approval process")!;
    expect(process.requiresGraphic).toBe(true);
    expect(process.hasGraphic).toBe(true);
    expect(process.tableCount).toBe(0);
    expect(process.textShapeCount).toBeGreaterThan(2);
  });

  // The core AC4 assertion: a table graphic renders as <p:graphicFrame>/
  // <a:tbl>, contributing ZERO extra <p:txBody> beyond the slide's own
  // title+bullets - this is EXACTLY the blind spot a <p:sp>-only shape count
  // missed in the original measurement. This test proves auditPptxGraphics
  // sees it anyway, specifically via the table count, not the shape count.
  it("a table graphic is detected via <a:tbl>, even though it adds no extra text shapes beyond title+bullets", async () => {
    const buf = await testDeck();
    const audits = await auditPptxGraphics(buf, "applied");
    const table = audits.find((a) => a.title === "Artifact: a project charter")!;
    expect(table.requiresGraphic).toBe(true);
    expect(table.tableCount).toBe(1);
    // Title + one bullet = 2 text shapes - the SAME count a plain, graphic-
    // less slide with one bullet would have. Shape counting ALONE cannot
    // tell this slide apart from an empty one; only the table count can.
    expect(table.textShapeCount).toBe(2);
    expect(table.hasGraphic).toBe(true);
  });

  it("a required-prefix slide with no graphic at all is flagged as missing one", async () => {
    const buf = await testDeck();
    const audits = await auditPptxGraphics(buf, "applied");
    const judgmentCall = audits.find((a) => a.title === "Judgment Call: cost vs schedule")!;
    expect(judgmentCall.requiresGraphic).toBe(true);
    expect(judgmentCall.hasGraphic).toBe(false);
    expect(judgmentCall.tableCount).toBe(0);
  });

  // Entry 203 AC10 residual: the coding contract requires a graphic on
  // "Agenda:" and "Terminology:" slides (CODING_GRAPHIC_REQUIRED_PREFIXES,
  // src/lib/slide-graphics.ts) - a DIFFERENT vocabulary than applied's
  // Artifact:/Judgment Call:/Agenda:. Reusing an applied-shaped fixture here
  // deliberately, to prove `kind` actually SWITCHES the vocabulary rather
  // than only ever reading the applied one: this same title set was already
  // proven applied-required above (Judgment Call:), so if `kind: "coding"`
  // did nothing, a coding read of this deck would (wrongly) still flag
  // "Judgment Call: cost vs schedule" as requiresGraphic.
  it("reads the CODING prefix vocabulary, not applied's, when kind is coding", async () => {
    const buf = await testDeck();
    const audits = await auditPptxGraphics(buf, "coding");
    const judgmentCall = audits.find((a) => a.title === "Judgment Call: cost vs schedule")!;
    // Not a coding-required prefix at all - coding never requires a graphic
    // on a "Judgment Call:" slide.
    expect(judgmentCall.requiresGraphic).toBe(false);
    const artifactSlide = audits.find((a) => a.title === "Artifact: a stakeholder matrix");
    expect(artifactSlide).toBeDefined();
    // "Artifact:" is not in CODING_GRAPHIC_REQUIRED_PREFIXES either.
    expect(artifactSlide!.requiresGraphic).toBe(false);
  });

  // The core AC10 fix: a finished CODING deck missing its required Agenda or
  // Terminology graphic used to pass this audit silently, because
  // auditPptxGraphics only ever read GRAPHIC_REQUIRED_PREFIXES (applied's
  // array) - "Agenda:"/"Terminology:" titles never matched the applied-only
  // check for what they actually are, so requiresGraphic was always false
  // for a coding deck and nothing was ever flagged missing.
  it("flags a coding deck's Agenda/Terminology slides as missing a graphic - previously invisible to this audit", async () => {
    const buf = await buildSlidesPptx({
      presentationTitle: "Coding Deck",
      slides: [
        // Required for coding, no graphic - this is the defect.
        { title: "Agenda: today's plan", bullets: ["b1"] },
        // Required for coding, no graphic - this is the defect.
        { title: "Terminology: key terms", bullets: ["b1"] },
        // Not required for coding at all (applied-only prefix).
        { title: "Artifact: not a coding requirement", bullets: ["b1"] },
      ],
    });

    const codingAudits = await auditPptxGraphics(buf, "coding");
    const codingMissing = pptxSlidesMissingRequiredGraphic(codingAudits);
    expect(codingMissing.map((a) => a.title)).toEqual(["Agenda: today's plan", "Terminology: key terms"]);

    // Same finished bytes, read as "applied": neither Agenda: nor
    // Terminology: is in the applied vocabulary as a bare match here
    // (Agenda: IS shared - applied also requires it - but Terminology: is
    // NOT), so the applied read must miss the Terminology gap entirely.
    const appliedAudits = await auditPptxGraphics(buf, "applied");
    const appliedMissing = pptxSlidesMissingRequiredGraphic(appliedAudits);
    expect(appliedMissing.map((a) => a.title)).toContain("Agenda: today's plan");
    expect(appliedMissing.map((a) => a.title)).not.toContain("Terminology: key terms");
  });
});

describe("pptxSlidesMissingRequiredGraphic", () => {
  it("names exactly the required-prefix slide with no graphic, and none of the slides that carry one", async () => {
    const buf = await testDeck();
    const audits = await auditPptxGraphics(buf, "applied");
    const missing = pptxSlidesMissingRequiredGraphic(audits);
    expect(missing.map((a) => a.title)).toEqual(["Judgment Call: cost vs schedule"]);
  });

  it("returns [] when every required-prefix slide carries a graphic", async () => {
    const buf = await buildSlidesPptx({
      presentationTitle: "Clean Deck",
      slides: [
        {
          title: "Artifact: a register",
          bullets: ["b1"],
          graphic: {
            kind: "table",
            headers: ["A", "B"],
            rows: [["1", "2"]],
          },
        },
      ],
    });
    const audits = await auditPptxGraphics(buf, "applied");
    expect(pptxSlidesMissingRequiredGraphic(audits)).toEqual([]);
  });

  // The applied-vs-coding parity check for pptxSlidesMissingRequiredGraphic
  // itself (auditPptxGraphics above covers the raw requiresGraphic flag):
  // a coding deck's Terminology slide, carrying a real table graphic, must
  // read as satisfied under "coding" - proving the fix does not just ADD
  // false positives, it also resolves correctly for a deck that already did
  // the right thing.
  it("a coding deck's Terminology slide with a real table graphic is NOT flagged", async () => {
    const buf = await buildSlidesPptx({
      presentationTitle: "Coding Deck, Done Right",
      slides: [
        {
          title: "Agenda: today's plan",
          bullets: ["b1"],
          graphic: {
            kind: "process",
            steps: [{ label: "Intro" }, { label: "Practice" }, { label: "Wrap-up" }],
          },
        },
        {
          title: "Terminology: key terms",
          bullets: ["b1"],
          graphic: {
            kind: "table",
            headers: ["Term", "Definition"],
            rows: [["Inheritance", "A child class reuses a parent's behavior"]],
          },
        },
      ],
    });
    const audits = await auditPptxGraphics(buf, "coding");
    expect(pptxSlidesMissingRequiredGraphic(audits)).toEqual([]);
  });
});
