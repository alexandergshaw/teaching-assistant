// Pure-logic contract for artifact-download.ts - see that file's own header
// comment for the split between the pure format/filename/mime logic covered
// here and the impure blob builder. No vi.mock needed: every pure export is
// a plain function over in-memory fixtures (mirrors deck.test.ts /
// kinds.test.ts's own precedent for this directory). buildArtifactDownloadBlob
// (the impure half) is exercised for its branch selection using the SAME
// real buildDocxFromPlainText/buildSlidesPptx other suites already call
// directly under vitest's node environment (see e.g. pptx-graphics-audit.test.ts,
// pptx.typography.test.ts) - this chunk does not re-verify their output
// bytes (see artifact-download's AC "Limits" section).
import { describe, it, expect } from "vitest";
import {
  artifactDownloadFormats,
  artifactDownloadFilename,
  artifactDownloadFormatLabel,
  buildArtifactDownloadBlob,
  ARTIFACT_DOWNLOAD_MIME,
  type ArtifactDownloadFormat,
} from "./artifact-download";

// ── artifactDownloadFormats ─────────────────────────────────────────────────

describe("artifactDownloadFormats", () => {
  it("always includes md and docx when structured is null (a non-deck kind)", () => {
    const formats = artifactDownloadFormats({ structured: null });
    expect(formats).toContain("md");
    expect(formats).toContain("docx");
  });

  it("includes pptx for a valid deck structured array", () => {
    const formats = artifactDownloadFormats({
      structured: [{ title: "Slide 1", bullets: ["a", "b"] }],
    });
    expect(formats).toEqual(["md", "docx", "pptx"]);
  });

  it("excludes pptx when structured is null", () => {
    const formats = artifactDownloadFormats({ structured: null });
    expect(formats).not.toContain("pptx");
  });

  it("excludes pptx when structured is an empty array", () => {
    const formats = artifactDownloadFormats({ structured: [] });
    expect(formats).not.toContain("pptx");
  });

  it("excludes pptx when structured is not an array at all", () => {
    expect(artifactDownloadFormats({ structured: { not: "an array" } })).not.toContain("pptx");
    expect(artifactDownloadFormats({ structured: "a string" })).not.toContain("pptx");
    expect(artifactDownloadFormats({ structured: 42 })).not.toContain("pptx");
  });

  it("excludes pptx when every entry lacks title/bullets", () => {
    expect(artifactDownloadFormats({ structured: [{ foo: 1 }] })).not.toContain("pptx");
    expect(artifactDownloadFormats({ structured: [{ title: "only a title" }] })).not.toContain("pptx");
    expect(artifactDownloadFormats({ structured: [{ bullets: ["only bullets"] }] })).not.toContain("pptx");
  });

  it("gates on the parsed result, not on any kind id - a plain slide-shaped array is enough", () => {
    // artifactDownloadFormats takes no kind/kindId argument at all - this is
    // the executable proof that the gate is structural (AC 3).
    const formats = artifactDownloadFormats({ structured: [{ title: "T", bullets: [] }] });
    expect(formats).toContain("pptx");
  });
});

// ── artifactDownloadFilename ────────────────────────────────────────────────

describe("artifactDownloadFilename", () => {
  it("every illegal Windows filename character is replaced, never left in the output", () => {
    const artifact = { title: 'A\\B/C:D*E?F"G<H>I|J', version: 1 };
    const filename = artifactDownloadFilename(artifact, "Kind Label", "md");
    for (const char of ["\\", "/", ":", "*", "?", '"', "<", ">", "|"]) {
      expect(filename.includes(char)).toBe(false);
    }
    // The segments survive as distinct words, joined by "-" rather than fused.
    expect(filename).toBe("A-B-C-D-E-F-G-H-I-J v1.md");
  });

  it("control characters are stripped (folded into surrounding whitespace, not left in the output)", () => {
    const withControls = `A${String.fromCharCode(1)}B${String.fromCharCode(31)}C`;
    const filename = artifactDownloadFilename({ title: withControls, version: 1 }, "Kind Label", "md");
    for (let code = 0; code <= 0x1f; code++) {
      expect(filename.includes(String.fromCharCode(code))).toBe(false);
    }
    expect(filename).toBe("A B C v1.md");
  });

  it("collapses runs of whitespace into a single space", () => {
    const filename = artifactDownloadFilename({ title: "My     Deck   Title", version: 1 }, "Kind Label", "md");
    expect(filename).toBe("My Deck Title v1.md");
  });

  it("falls back to a constant name when the title is empty after sanitizing", () => {
    const filename = artifactDownloadFilename({ title: "....", version: 1 }, "Kind Label", "md");
    expect(filename).toBe("generated v1.md");
  });

  it("falls back to a constant name when the title is only dots and spaces", () => {
    const filename = artifactDownloadFilename({ title: ". . .", version: 1 }, "Kind Label", "md");
    expect(filename).toBe("generated v1.md");
  });

  it("never produces an empty basename", () => {
    const filename = artifactDownloadFilename({ title: "", version: 1 }, "", "md");
    expect(filename).not.toBe(" v1.md");
    expect(filename.replace(/^\s+/, "").length).toBeGreaterThan(" v1.md".length - " v1.md".trim().length);
    // The name portion (before " v1.md") is never blank.
    expect(filename).toMatch(/^\S.* v1\.md$/);
  });

  it("v2 and v3 of the same kind produce two distinct filenames", () => {
    const artifact = { title: "Week 4 Notes", version: 2 };
    const v2 = artifactDownloadFilename(artifact, "Kind Label", "md");
    const v3 = artifactDownloadFilename({ ...artifact, version: 3 }, "Kind Label", "md");
    expect(v2).not.toBe(v3);
    expect(v2).toBe("Week 4 Notes v2.md");
    expect(v3).toBe("Week 4 Notes v3.md");
  });

  it("title wins over kindLabel when title is set", () => {
    const filename = artifactDownloadFilename({ title: "My Custom Title", version: 1 }, "Fallback Kind Label", "docx");
    expect(filename).toBe("My Custom Title v1.docx");
  });

  it("a blank title falls back to kindLabel", () => {
    const filename = artifactDownloadFilename({ title: "", version: 1 }, "Anticipated lecture Q&A", "docx");
    expect(filename).toBe("Anticipated lecture Q&A v1.docx");
  });

  it("a whitespace-only title falls back to kindLabel", () => {
    const filename = artifactDownloadFilename({ title: "   ", version: 1 }, "Anticipated lecture Q&A", "docx");
    expect(filename).toBe("Anticipated lecture Q&A v1.docx");
  });

  it("a null title falls back to kindLabel", () => {
    const filename = artifactDownloadFilename({ title: null, version: 1 }, "Current events", "pptx");
    expect(filename).toBe("Current events v1.pptx");
  });

  it("uses the correct extension per format", () => {
    const artifact = { title: "Deck", version: 5 };
    expect(artifactDownloadFilename(artifact, "Lecture deck", "md")).toBe("Deck v5.md");
    expect(artifactDownloadFilename(artifact, "Lecture deck", "docx")).toBe("Deck v5.docx");
    expect(artifactDownloadFilename(artifact, "Lecture deck", "pptx")).toBe("Deck v5.pptx");
  });
});

// ── ARTIFACT_DOWNLOAD_MIME ──────────────────────────────────────────────────

describe("ARTIFACT_DOWNLOAD_MIME", () => {
  it("has an entry for every ArtifactDownloadFormat, and only those", () => {
    const expectedFormats: ArtifactDownloadFormat[] = ["md", "docx", "pptx"];
    expect(Object.keys(ARTIFACT_DOWNLOAD_MIME).sort()).toEqual([...expectedFormats].sort());
  });

  it("maps each format to its correct MIME type", () => {
    expect(ARTIFACT_DOWNLOAD_MIME.md).toBe("text/markdown;charset=utf-8");
    expect(ARTIFACT_DOWNLOAD_MIME.docx).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(ARTIFACT_DOWNLOAD_MIME.pptx).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
  });
});

// ── artifactDownloadFormatLabel ─────────────────────────────────────────────

describe("artifactDownloadFormatLabel", () => {
  it("returns a distinct, human-readable label per format", () => {
    expect(artifactDownloadFormatLabel("md")).toBe("Markdown (.md)");
    expect(artifactDownloadFormatLabel("docx")).toBe("Word (.docx)");
    expect(artifactDownloadFormatLabel("pptx")).toBe("PowerPoint (.pptx)");
  });
});

// ── buildArtifactDownloadBlob (impure - branch selection only) ─────────────

describe("buildArtifactDownloadBlob", () => {
  it("md: returns artifact.text verbatim as a markdown blob", async () => {
    const blob = await buildArtifactDownloadBlob(
      { title: "T", text: "# Hello\n\nWorld", structured: null, version: 1 },
      "Kind Label",
      "md"
    );
    expect(blob.type).toBe("text/markdown;charset=utf-8");
    const text = await blob.text();
    expect(text).toBe("# Hello\n\nWorld");
  });

  it("docx: builds a real .docx blob with the correct mime type", async () => {
    const blob = await buildArtifactDownloadBlob(
      { title: "T", text: "# Hello", structured: null, version: 1 },
      "Kind Label",
      "docx"
    );
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("pptx: parses structured slides and builds a real .pptx blob with the correct mime type", async () => {
    const blob = await buildArtifactDownloadBlob(
      {
        title: "My Deck",
        text: "# My Deck\n\n## Slide 1\n- a",
        structured: [{ title: "Slide 1", bullets: ["a"] }],
        version: 1,
      },
      "Lecture deck",
      "pptx"
    );
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.presentationml.presentation");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("pptx: throws a clear error when zero slides parse from structured (guard, AC 3/4)", async () => {
    await expect(
      buildArtifactDownloadBlob(
        { title: "T", text: "no slides here", structured: null, version: 3 },
        "Lecture deck",
        "pptx"
      )
    ).rejects.toThrow(/no usable slide data/);
  });
});
