import { describe, it, expect } from "vitest";
import {
  buildKnowledgeContextBlock,
  DEFAULT_KNOWLEDGE_CONTEXT_MAX_CHARS,
  type KnowledgeContextPage,
  type KnowledgeContextAttachment,
} from "./knowledge-context";

function page(title: string, body: string): KnowledgeContextPage {
  return { title, body };
}

function attachment(pageTitle: string, fileName: string, text: string): KnowledgeContextAttachment {
  return { pageTitle, fileName, text };
}

describe("buildKnowledgeContextBlock - empty input", () => {
  it("returns a sensible empty result for no pages and no attachments", () => {
    expect(buildKnowledgeContextBlock({ pages: [], attachments: [] })).toEqual({
      text: "",
      includedPages: 0,
      omittedPages: 0,
      includedAttachments: 0,
      omittedAttachments: 0,
    });
  });
});

describe("buildKnowledgeContextBlock - everything fits", () => {
  const pages = [
    page("Late Work Policy", "Late work loses ten percent per day."),
    page("Office Hours", "Two hours per week are required."),
  ];
  const attachments = [attachment("Late Work Policy", "syllabus.pdf", "Full syllabus text goes here.")];

  it("includes every page's title and body when under budget", () => {
    const result = buildKnowledgeContextBlock({ pages, attachments: [] });
    expect(result.includedPages).toBe(2);
    expect(result.omittedPages).toBe(0);
    expect(result.text).toContain("Late Work Policy");
    expect(result.text).toContain("Late work loses ten percent per day.");
    expect(result.text).toContain("Office Hours");
    expect(result.text).toContain("Two hours per week are required.");
  });

  it("includes every attachment's text when under budget", () => {
    const result = buildKnowledgeContextBlock({ pages, attachments });
    expect(result.includedAttachments).toBe(1);
    expect(result.omittedAttachments).toBe(0);
    expect(result.text).toContain("syllabus.pdf");
    expect(result.text).toContain("Full syllabus text goes here.");
  });

  it("does not claim anything was omitted when everything fit", () => {
    const result = buildKnowledgeContextBlock({ pages, attachments, maxChars: 100_000 });
    expect(result.text.toLowerCase()).not.toContain("omitted");
  });

  it("frames the block as reference material, not instructions (anti prompt-injection)", () => {
    // Page bodies and attachment text are free text the instructor authored
    // or uploaded - without an explicit framing sentence, a body that reads
    // like a command becomes a prompt injection the moment it is spliced
    // into the model's input.
    const result = buildKnowledgeContextBlock({ pages, attachments });
    expect(result.text.toLowerCase()).toMatch(/reference|context|record/);
    expect(result.text.toLowerCase()).toMatch(/never.*instructions|not.*instructions/);
  });

  it("is deterministic for the same input", () => {
    const args = { pages, attachments };
    expect(buildKnowledgeContextBlock(args)).toEqual(buildKnowledgeContextBlock(args));
  });

  it("falls back to a placeholder title for an untitled page", () => {
    const result = buildKnowledgeContextBlock({ pages: [page("   ", "Body text.")], attachments: [] });
    expect(result.text).toContain("Untitled page");
    expect(result.text).toContain("Body text.");
  });
});

describe("buildKnowledgeContextBlock - attachments carry filename and owning page", () => {
  it("names both the file and its owning page even when the page itself is not separately selected", () => {
    // No `pages` entry for "GCU Policy Page" at all - the ONLY way its
    // title can appear in the rendered text is via the attachment chunk
    // carrying it, which is exactly the fact this test is pinning (not the
    // exact wording used to join the two).
    const result = buildKnowledgeContextBlock({
      pages: [],
      attachments: [attachment("GCU Policy Page", "handbook.docx", "Handbook contents.")],
    });
    expect(result.text).toContain("handbook.docx");
    expect(result.text).toContain("GCU Policy Page");
    expect(result.text).toContain("Handbook contents.");
    expect(result.includedAttachments).toBe(1);
  });

  it("distinguishes two attachments from two different owning pages", () => {
    const result = buildKnowledgeContextBlock({
      pages: [],
      attachments: [
        attachment("Page One", "a.txt", "Content A."),
        attachment("Page Two", "b.txt", "Content B."),
      ],
    });
    expect(result.text).toContain("Page One");
    expect(result.text).toContain("Page Two");
    expect(result.text).toContain("a.txt");
    expect(result.text).toContain("b.txt");
  });
});

describe("buildKnowledgeContextBlock - truncation boundaries", () => {
  // Each page/attachment body ends with a unique marker, so a chunk that
  // was cut mid-sentence (rather than dropped whole) would leave the
  // marker present without the rest of the body, or vice versa - the tests
  // below check the two always travel together.
  function bigPages(count: number): KnowledgeContextPage[] {
    return Array.from({ length: count }, (_, i) =>
      page(`Page ${i}`, `${"filler text ".repeat(15)}END_OF_PAGE_${i}`)
    );
  }

  function bigAttachments(count: number): KnowledgeContextAttachment[] {
    return Array.from({ length: count }, (_, i) =>
      attachment(`Owner ${i}`, `file-${i}.txt`, `${"filler text ".repeat(15)}END_OF_ATTACHMENT_${i}`)
    );
  }

  it("never exceeds maxChars, across a range of budgets including pathologically small ones", () => {
    const pages = bigPages(8);
    const attachments = bigAttachments(8);
    for (const maxChars of [0, 1, 10, 50, 200, 500, 2000, 5000, 50_000]) {
      const result = buildKnowledgeContextBlock({ pages, attachments, maxChars });
      expect(result.text.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it("includes a chunk whole or not at all - never a partial page", () => {
    const pages = bigPages(6);
    const result = buildKnowledgeContextBlock({ pages, attachments: [], maxChars: 900 });
    expect(result.omittedPages).toBeGreaterThan(0); // budget is small enough to force a drop
    for (const p of pages) {
      const hasBody = result.text.includes(p.body);
      const hasTitle = result.text.includes(`Page ${pages.indexOf(p)}`);
      expect(hasBody).toBe(hasTitle);
    }
  });

  it("includes a chunk whole or not at all - never a partial attachment", () => {
    const attachments = bigAttachments(6);
    const result = buildKnowledgeContextBlock({ pages: [], attachments, maxChars: 900 });
    expect(result.omittedAttachments).toBeGreaterThan(0);
    for (const a of attachments) {
      const hasText = result.text.includes(a.text);
      const hasFileName = result.text.includes(a.fileName);
      expect(hasText).toBe(hasFileName);
    }
  });

  it("reports included/omitted page counts that match what is actually present in the text", () => {
    const pages = bigPages(10);
    const result = buildKnowledgeContextBlock({ pages, attachments: [], maxChars: 1500 });
    const actuallyIncluded = pages.filter((p) => result.text.includes(p.body)).length;
    expect(result.includedPages).toBe(actuallyIncluded);
    expect(result.omittedPages).toBe(pages.length - actuallyIncluded);
    expect(actuallyIncluded).toBeGreaterThan(0);
    expect(actuallyIncluded).toBeLessThan(pages.length);
  });

  it("keeps trying later, smaller chunks after an earlier one did not fit", () => {
    // A single huge page first, then a small one - the small one should
    // still be included even though the huge one that preceded it was not,
    // matching buildGroundingBlock's own "keep trying" behaviour rather
    // than renderInstitutionPolicyText's "stop at the first miss".
    const hugePage = page("Huge", "x".repeat(20_000));
    const smallPage = page("Small", "tiny body");
    const result = buildKnowledgeContextBlock({
      pages: [hugePage, smallPage],
      attachments: [],
      maxChars: 500,
    });
    expect(result.text).toContain("tiny body");
    expect(result.text).not.toContain("x".repeat(20_000));
  });

  it("states what was omitted, naming only the kinds that were actually dropped", () => {
    const pages = bigPages(5);
    const result = buildKnowledgeContextBlock({ pages, attachments: [], maxChars: 900 });
    expect(result.omittedPages).toBeGreaterThan(0);
    expect(result.text.toLowerCase()).toContain("omitted to stay within the context budget");
    expect(result.text.toLowerCase()).toContain("page");
    expect(result.text.toLowerCase()).not.toContain("attachment");
  });

  it("names attachments in the omission note when only attachments were dropped", () => {
    const attachments = bigAttachments(5);
    const result = buildKnowledgeContextBlock({ pages: [], attachments, maxChars: 900 });
    expect(result.omittedAttachments).toBeGreaterThan(0);
    expect(result.text.toLowerCase()).toContain("omitted to stay within the context budget");
    expect(result.text.toLowerCase()).toContain("attachment");
  });

  it("names both kinds when both pages and attachments were dropped", () => {
    const pages = bigPages(5);
    const attachments = bigAttachments(5);
    const result = buildKnowledgeContextBlock({ pages, attachments, maxChars: 900 });
    expect(result.omittedPages).toBeGreaterThan(0);
    expect(result.omittedAttachments).toBeGreaterThan(0);
    const noteMatch = result.text.match(/\[[^\]]*omitted to stay within the context budget\]/i);
    expect(noteMatch).not.toBeNull();
    expect(noteMatch![0].toLowerCase()).toContain("page");
    expect(noteMatch![0].toLowerCase()).toContain("attachment");
  });

  it("the omission note itself never pushes the result past maxChars, even at the exact boundary", () => {
    // Find, by binary search, a maxChars value right at the edge where the
    // rendered block transitions from "everything fits, no note" to "some
    // chunk had to go, note appended" - the note's own length is most
    // likely to blow the budget exactly at this boundary, since that is
    // where the reserved space is tightest.
    const pages = bigPages(4);
    const fullLength = buildKnowledgeContextBlock({ pages, attachments: [], maxChars: 1_000_000 }).text.length;

    for (let maxChars = fullLength - 30; maxChars <= fullLength + 5; maxChars++) {
      const result = buildKnowledgeContextBlock({ pages, attachments: [], maxChars });
      expect(result.text.length).toBeLessThanOrEqual(maxChars);
    }
  });

  it("keeps the omission note fully intact - not chopped by the final defensive clamp - whenever the budget has reasonable headroom above the header", () => {
    // A "never exceeds maxChars" check alone can be satisfied by a
    // defensive clamp that blindly slices the final string, which would
    // hide a broken up-front reservation by silently truncating the NOTE
    // itself instead of a chunk. This test instead checks the note survives
    // WHOLE (ends in the closing bracket) whenever there is enough headroom
    // that only a correct reservation - not the emergency clamp - should be
    // doing the work.
    const pages = bigPages(10);
    const result = buildKnowledgeContextBlock({ pages, attachments: [], maxChars: 1200 });
    expect(result.omittedPages).toBeGreaterThan(0);
    expect(result.text.trimEnd().endsWith("]")).toBe(true);
    expect(result.text).toMatch(/\[\d+ selected pages? omitted to stay within the context budget\]$/);
  });

  it("uses the default budget when maxChars is omitted", () => {
    const pages = bigPages(20);
    const result = buildKnowledgeContextBlock({ pages, attachments: [] });
    expect(result.text.length).toBeLessThanOrEqual(DEFAULT_KNOWLEDGE_CONTEXT_MAX_CHARS);
  });
});
