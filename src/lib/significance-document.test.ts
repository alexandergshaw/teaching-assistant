import { describe, expect, it } from "vitest";
import {
  SIGNIFICANCE_BULLET_COUNT,
  parseSignificanceDocument,
  significanceShapeIssues,
  buildEmbeddedSignificanceDocument,
} from "./significance-document";

// ---------------------------------------------------------------------------
// The "Significance of the Material" document's required shape, set by the
// instructor: a SHORT OPENING PARAGRAPH, then exactly THREE BULLETS, then a
// SHORT CLOSING PARAGRAPH. Nothing else.
//
// These live in a plain module rather than in weekly-significance.ts because
// that file carries "use server" and may therefore export only async
// functions - a sync export there compiles and passes vitest, and only
// `next build` catches it (see use-server-exports.test.ts).
//
// The shape is asserted here rather than trusted to the prompt because a
// prompt cannot guarantee anything. The one branch that CAN be guaranteed is
// the embedded deterministic provider, which builds its text in code with no
// model call - so the last test below ties that branch to this same contract.
// ---------------------------------------------------------------------------

const GOOD = `# Why This Week's Material Matters

Access control decides who can reach what, and it is the control most often
got wrong in practice.

- Broken access control was the most common serious flaw found in audited web systems.
- A single missing server-side check undid an entire login system at Acme Corp.
- Fixing it after release cost far more than designing it correctly would have.

You will meet this same decision in your own work, usually under deadline.`;

describe("parseSignificanceDocument", () => {
  it("splits a well-formed document into title, opening, bullets and closing", () => {
    const doc = parseSignificanceDocument(GOOD);
    expect(doc.title).toBe("Why This Week's Material Matters");
    expect(doc.opening).toContain("Access control decides");
    expect(doc.bullets).toHaveLength(3);
    expect(doc.bullets[0]).toBe(
      "Broken access control was the most common serious flaw found in audited web systems."
    );
    expect(doc.closing).toContain("your own work");
  });

  it("strips the bullet marker rather than keeping it in the text", () => {
    const doc = parseSignificanceDocument(GOOD);
    for (const bullet of doc.bullets) {
      expect(bullet.startsWith("-")).toBe(false);
      expect(bullet.startsWith("*")).toBe(false);
    }
  });

  it("accepts asterisk bullets as well as hyphen bullets", () => {
    const doc = parseSignificanceDocument(GOOD.replace(/^- /gm, "* "));
    expect(doc.bullets).toHaveLength(3);
  });

  it("does not mistake a sentence containing a dash for a bullet", () => {
    // A paragraph wrapping onto a line that happens to begin mid-sentence
    // must not be read as a list item.
    const doc = parseSignificanceDocument(
      `# T\n\nAccess control - the rule about who reaches what - matters.\n\n- one\n- two\n- three\n\nClosing line.`
    );
    expect(doc.bullets).toEqual(["one", "two", "three"]);
    expect(doc.opening).toContain("the rule about who reaches what");
  });

  it("treats a document with no title line as having none, without throwing", () => {
    const doc = parseSignificanceDocument(`Opening.\n\n- a\n- b\n- c\n\nClosing.`);
    expect(doc.title).toBeNull();
    expect(doc.bullets).toHaveLength(3);
    expect(doc.closing).toBe("Closing.");
  });

  it("tolerates extra blank lines and trailing whitespace", () => {
    const doc = parseSignificanceDocument(`# T\n\n\n\nOpening.\n\n\n- a\n- b\n- c\n\n\nClosing.   \n\n`);
    expect(doc.bullets).toHaveLength(3);
    expect(doc.closing).toBe("Closing.");
  });
});

describe("significanceShapeIssues", () => {
  it("reports no issues for a well-formed document", () => {
    expect(significanceShapeIssues(GOOD)).toEqual([]);
  });

  it("pins the required bullet count at three", () => {
    expect(SIGNIFICANCE_BULLET_COUNT).toBe(3);
  });

  it("reports the wrong number of bullets", () => {
    const twoBullets = GOOD.replace(
      "- Fixing it after release cost far more than designing it correctly would have.\n",
      ""
    );
    expect(significanceShapeIssues(twoBullets).join(" ")).toMatch(/bullet/i);

    const fourBullets = GOOD.replace(
      "- Fixing it after release",
      "- An extra point that should not be here.\n- Fixing it after release"
    );
    expect(significanceShapeIssues(fourBullets).join(" ")).toMatch(/bullet/i);
  });

  it("reports a missing opening paragraph", () => {
    const noOpening = `# T\n\n- a\n- b\n- c\n\nClosing.`;
    expect(significanceShapeIssues(noOpening).join(" ")).toMatch(/opening/i);
  });

  it("reports a missing closing paragraph", () => {
    const noClosing = `# T\n\nOpening.\n\n- a\n- b\n- c`;
    expect(significanceShapeIssues(noClosing).join(" ")).toMatch(/closing/i);
  });

  it("reports a document with no bullets at all", () => {
    const prose = `# T\n\nOne paragraph.\n\nAnother paragraph.\n\nA third paragraph.`;
    expect(significanceShapeIssues(prose).length).toBeGreaterThan(0);
  });

  it("reports extra prose between the bullets and the closing paragraph", () => {
    // Two paragraphs after the list means the shape is no longer
    // "paragraph, bullets, paragraph".
    const extra = `# T\n\nOpening.\n\n- a\n- b\n- c\n\nClosing one.\n\nClosing two.`;
    expect(significanceShapeIssues(extra).length).toBeGreaterThan(0);
  });

  it("reports an empty document rather than returning no issues", () => {
    expect(significanceShapeIssues("").length).toBeGreaterThan(0);
    expect(significanceShapeIssues("   \n\n ").length).toBeGreaterThan(0);
  });
});

describe("buildEmbeddedSignificanceDocument", () => {
  const caseStudy = {
    organization: "Acme Corp",
    period: "2019",
    hook: "A missing server-side check exposed every customer record for six weeks.",
  };

  it("produces a document that satisfies the shape contract", () => {
    // The embedded provider makes no model call, so unlike the LLM branch its
    // output IS guaranteed - and must therefore actually be guaranteed.
    const text = buildEmbeddedSignificanceDocument("Access Control", caseStudy);
    expect(significanceShapeIssues(text)).toEqual([]);
  });

  it("names the topic and the case study organization", () => {
    const text = buildEmbeddedSignificanceDocument("Access Control", caseStudy);
    expect(text).toContain("Access Control");
    expect(text).toContain("Acme Corp");
  });

  it("omits the period entirely when it is not established", () => {
    // Stating a year that was never established is the exact fabrication the
    // surrounding generators are built to avoid.
    const text = buildEmbeddedSignificanceDocument("Access Control", {
      ...caseStudy,
      period: null,
    });
    expect(significanceShapeIssues(text)).toEqual([]);
    expect(text).not.toMatch(/\(\s*\)/);
    expect(text).not.toMatch(/\bnull\b/);
  });

  it("still produces exactly three bullets", () => {
    const doc = parseSignificanceDocument(buildEmbeddedSignificanceDocument("Topic", caseStudy));
    expect(doc.bullets).toHaveLength(SIGNIFICANCE_BULLET_COUNT);
  });

  it("writes no URL", () => {
    const text = buildEmbeddedSignificanceDocument("Access Control", caseStudy);
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(/www\./);
  });
});
