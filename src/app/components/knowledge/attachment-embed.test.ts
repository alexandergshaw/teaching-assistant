import { describe, it, expect } from "vitest";
import {
  sanitizeEmbedLabel,
  buildAttachmentEmbedReference,
  splitBodyIntoSegments,
  insertEmbedReferenceIntoBody,
} from "./attachment-embed";

describe("sanitizeEmbedLabel", () => {
  it("passes a clean label through unchanged", () => {
    expect(sanitizeEmbedLabel("Syllabus.pdf")).toBe("Syllabus.pdf");
  });

  it("strips [ and ] so the reference syntax cannot be corrupted", () => {
    expect(sanitizeEmbedLabel("[Draft] Notes]")).toBe("Draft Notes");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeEmbedLabel("  Handout.docx  ")).toBe("Handout.docx");
  });

  it("falls back to Attachment when the label is empty after cleaning", () => {
    expect(sanitizeEmbedLabel("")).toBe("Attachment");
    expect(sanitizeEmbedLabel("   ")).toBe("Attachment");
    expect(sanitizeEmbedLabel("[]")).toBe("Attachment");
  });
});

describe("buildAttachmentEmbedReference", () => {
  it("builds the exact [label](attachment://id) syntax", () => {
    expect(buildAttachmentEmbedReference("Syllabus.pdf", "abc-123")).toBe(
      "[Syllabus.pdf](attachment://abc-123)"
    );
  });

  it("sanitizes the file name used as the label", () => {
    expect(buildAttachmentEmbedReference("[Old] Rubric.docx", "id-1")).toBe(
      "[Old Rubric.docx](attachment://id-1)"
    );
  });

  it("round-trips through splitBodyIntoSegments as a single embed segment", () => {
    const ref = buildAttachmentEmbedReference("Notes.png", "id-42");
    const segments = splitBodyIntoSegments(ref);
    expect(segments).toEqual([{ type: "embed", label: "Notes.png", attachmentId: "id-42" }]);
  });
});

describe("splitBodyIntoSegments", () => {
  it("returns [] for an empty body", () => {
    expect(splitBodyIntoSegments("")).toEqual([]);
  });

  it("returns [] for a whitespace-only body", () => {
    expect(splitBodyIntoSegments("   \n\n   ")).toEqual([]);
  });

  it("keeps a plain-markdown-only body as one markdown segment", () => {
    const body = "Intro line\n\nSecond paragraph.";
    expect(splitBodyIntoSegments(body)).toEqual([{ type: "markdown", text: body }]);
  });

  it("recognizes a body that is only an embed reference", () => {
    expect(splitBodyIntoSegments("[Handout](attachment://id-1)")).toEqual([
      { type: "embed", label: "Handout", attachmentId: "id-1" },
    ]);
  });

  it("splits markdown / embed / markdown into three ordered segments, each with its own exact text (no carryover between flushes)", () => {
    const body = "Intro text\n\n[File](attachment://abc)\n\nMore text";
    const segments = splitBodyIntoSegments(body);
    expect(segments).toEqual([
      { type: "markdown", text: "Intro text\n" },
      { type: "embed", label: "File", attachmentId: "abc" },
      { type: "markdown", text: "\nMore text" },
    ]);
  });

  it("recognizes an embed line padded with surrounding spaces/tabs", () => {
    expect(splitBodyIntoSegments("  [Handout](attachment://id-1)  ")).toEqual([
      { type: "embed", label: "Handout", attachmentId: "id-1" },
    ]);
  });

  it("does NOT treat an inline reference (extra text on the same line) as an embed", () => {
    const body = "[File](attachment://abc) see attached";
    const segments = splitBodyIntoSegments(body);
    expect(segments).toEqual([{ type: "markdown", text: body }]);
  });

  it("splits two back-to-back embed lines (no blank line between) into two embed segments", () => {
    const body = "[A](attachment://1)\n[B](attachment://2)";
    const segments = splitBodyIntoSegments(body);
    expect(segments).toEqual([
      { type: "embed", label: "A", attachmentId: "1" },
      { type: "embed", label: "B", attachmentId: "2" },
    ]);
  });

  it("ignores a normal markdown link that is not the attachment:// scheme", () => {
    const body = "[Course site](https://example.edu)";
    expect(splitBodyIntoSegments(body)).toEqual([{ type: "markdown", text: body }]);
  });
});

describe("insertEmbedReferenceIntoBody", () => {
  const ref = "[File](attachment://id-1)";

  it("inserts into an empty body with no padding", () => {
    const result = insertEmbedReferenceIntoBody("", 0, 0, ref);
    expect(result).toEqual({ text: ref, cursor: ref.length });
  });

  it("pads with a blank line before content that has none (appending at the end)", () => {
    const body = "Hello";
    const result = insertEmbedReferenceIntoBody(body, body.length, body.length, ref);
    expect(result.text).toBe(`Hello\n\n${ref}`);
    expect(result.cursor).toBe(result.text.length);
  });

  it("pads with a blank line after content that has none (inserting at the start)", () => {
    const result = insertEmbedReferenceIntoBody("World", 0, 0, ref);
    expect(result.text).toBe(`${ref}\n\nWorld`);
    expect(result.cursor).toBe(`${ref}\n\n`.length);
  });

  it("does not add redundant blank lines when already properly separated", () => {
    const body = "Intro\n\n";
    const result = insertEmbedReferenceIntoBody(body, body.length, body.length, ref);
    expect(result.text).toBe(`Intro\n\n${ref}`);
  });

  it("splits a mid-line insertion onto its own blank-line-separated block", () => {
    const body = "HelloWorld";
    const result = insertEmbedReferenceIntoBody(body, 5, 5, ref);
    expect(result.text).toBe(`Hello\n\n${ref}\n\nWorld`);
    const resegmented = splitBodyIntoSegments(result.text);
    expect(resegmented.map((s) => s.type)).toEqual(["markdown", "embed", "markdown"]);
  });

  it("replaces a non-empty selection rather than just inserting at its start", () => {
    const body = "Keep [DROP ME] keep";
    const start = body.indexOf("[DROP ME]");
    const end = start + "[DROP ME]".length;
    const result = insertEmbedReferenceIntoBody(body, start, end, ref);
    expect(result.text).not.toContain("DROP ME");
    expect(result.text).toBe(`Keep \n\n${ref}\n\n keep`);
  });

  it("clamps an out-of-range selection instead of throwing", () => {
    const result = insertEmbedReferenceIntoBody("abc", -5, 999, ref);
    expect(result.text).toBe(ref);
    expect(result.cursor).toBe(ref.length);
  });

  it("clamps a reversed selection (end before start) to a zero-length replacement rather than duplicating text", () => {
    // selectionEnd (2) < selectionStart (10) on a 20-char body: without
    // clamping `end` up to `start`, body.slice(0, 10) and body.slice(2)
    // would overlap, duplicating characters 2-9 into both `before` and
    // `after` ("...23456789" would appear twice).
    const body = "0123456789ABCDEFGHIJ";
    const result = insertEmbedReferenceIntoBody(body, 10, 2, ref);
    expect(result.text).toBe(`0123456789\n\n${ref}\n\nABCDEFGHIJ`);
  });

  it("produces two cleanly separated embed segments across two consecutive end-of-body inserts", () => {
    const refA = "[A](attachment://1)";
    const refB = "[B](attachment://2)";
    const first = insertEmbedReferenceIntoBody("", 0, 0, refA);
    const second = insertEmbedReferenceIntoBody(first.text, first.cursor, first.cursor, refB);
    expect(second.text).toBe(`${refA}\n\n${refB}`);
    const segments = splitBodyIntoSegments(second.text);
    expect(segments).toEqual([
      { type: "embed", label: "A", attachmentId: "1" },
      { type: "embed", label: "B", attachmentId: "2" },
    ]);
  });
});
