import { describe, expect, it } from "vitest";

import {
  OVERSIZED_SKIP_REASON,
  buildIngestLines,
  encodeIngestLine,
  ingestStoragedZip,
  type IngestFetch,
  type IngestLine,
} from "./ndjson-ingest-parser";
import type { StudentSubmissionEntry } from "./types";

function entryOf(student: string, contentLength = 10): StudentSubmissionEntry {
  return { student, content: "x".repeat(contentLength), mergedFileCount: 1, submittedFiles: [] };
}

function streamOf(text: string, chunk = 17): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let at = 0; at < bytes.length; at += chunk) controller.enqueue(bytes.slice(at, at + chunk));
      controller.close();
    },
  });
}

function okFetch(lines: readonly IngestLine[]): IngestFetch {
  return async () => ({
    ok: true,
    status: 200,
    body: streamOf(lines.map(encodeIngestLine).join("")),
    text: async () => "",
  });
}

describe("buildIngestLines (the partition)", () => {
  it("emits one entry line per in-budget student and a sentinel with the counts", () => {
    const lines = buildIngestLines([entryOf("A"), entryOf("B")], ["bad.pdf"], 100);
    expect(lines.map((l) => l.type)).toEqual(["entry", "entry", "done"]);
    expect(lines[2]).toEqual({
      type: "done",
      studentsFound: 2,
      studentsEmitted: 2,
      skipped: [],
      failedSupportedFiles: ["bad.pdf"],
    });
  });

  it("turns ONE oversized student into ONE skip line, keeps the rest, and lists it in the sentinel", () => {
    const lines = buildIngestLines([entryOf("A"), entryOf("Big", 500), entryOf("C")], [], 100);
    expect(lines.map((l) => l.type)).toEqual(["entry", "skip", "entry", "done"]);
    expect(lines[1]).toEqual({ type: "skip", student: "Big", reason: OVERSIZED_SKIP_REASON });
    expect(lines[3]).toMatchObject({
      type: "done",
      studentsFound: 3,
      studentsEmitted: 2,
      skipped: [{ student: "Big", reason: OVERSIZED_SKIP_REASON }],
    });
  });
});

describe("ingestStoragedZip (never throws)", () => {
  it("delivers every entry and resolves the ledger when the sentinel arrives (chunked reads)", async () => {
    const seen: string[] = [];
    const outcome = await ingestStoragedZip(
      "u/grading-uploads/a.zip",
      "gemini",
      (e) => seen.push(e.student),
      okFetch(buildIngestLines([entryOf("A"), entryOf("Big", 500), entryOf("C")], ["f.docx"], 100))
    );
    expect(seen).toEqual(["A", "C"]);
    expect(outcome).toEqual({
      kind: "complete",
      entryCount: 2,
      ledger: {
        studentsFound: 3,
        studentsEmitted: 2,
        skipped: [{ student: "Big", reason: OVERSIZED_SKIP_REASON }],
        failedSupportedFiles: ["f.docx"],
      },
    });
  });

  it("a stream with entries but NO sentinel is refused as interrupted after K", async () => {
    const lines = buildIngestLines([entryOf("A"), entryOf("B")], [], 100).slice(0, 2);
    const outcome = await ingestStoragedZip("p", "gemini", () => {}, okFetch(lines));
    expect(outcome.kind).toBe("refused");
    if (outcome.kind === "refused") expect(outcome.reason).toContain("interrupted after 2 students");
  });

  it("an empty stream is refused, not completed", async () => {
    const outcome = await ingestStoragedZip("p", "gemini", () => {}, okFetch([]));
    expect(outcome.kind).toBe("refused");
  });

  it("a done line carrying an error is refused with that wording", async () => {
    const outcome = await ingestStoragedZip(
      "p",
      "gemini",
      () => {},
      okFetch([{ type: "done", error: "this zip was too large" }])
    );
    expect(outcome).toEqual({ kind: "refused", reason: "this zip was too large" });
  });

  it("a non-OK response is refused using the JSON error text", async () => {
    const outcome = await ingestStoragedZip("p", "gemini", () => {}, async () => ({
      ok: false,
      status: 401,
      body: null,
      text: async () => JSON.stringify({ error: "Sign in" }),
    }));
    expect(outcome).toEqual({ kind: "refused", reason: "Sign in" });
  });

  it("a non-JSON non-OK body is refused with a generic HTTP message", async () => {
    const outcome = await ingestStoragedZip("p", "gemini", () => {}, async () => ({
      ok: false,
      status: 502,
      body: null,
      text: async () => "<html>bad gateway</html>",
    }));
    expect(outcome.kind).toBe("refused");
    if (outcome.kind === "refused") expect(outcome.reason).toContain("502");
  });

  it("a non-NDJSON 200 body is refused", async () => {
    const outcome = await ingestStoragedZip("p", "gemini", () => {}, async () => ({
      ok: true,
      status: 200,
      body: streamOf("<html>not ndjson</html>\n"),
      text: async () => "",
    }));
    expect(outcome.kind).toBe("refused");
  });

  it("a thrown fetch is refused, never thrown", async () => {
    const outcome = await ingestStoragedZip("p", "gemini", () => {}, async () => {
      throw new Error("network down");
    });
    expect(outcome.kind).toBe("refused");
  });

  it("a stream that errors mid-read is refused, never thrown", async () => {
    const outcome = await ingestStoragedZip("p", "gemini", () => {}, async () => ({
      ok: true,
      status: 200,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("connection reset"));
        },
      }),
      text: async () => "",
    }));
    expect(outcome.kind).toBe("refused");
  });

  it("an entry line with a malformed entry is refused", async () => {
    const outcome = await ingestStoragedZip("p", "gemini", () => {}, async () => ({
      ok: true,
      status: 200,
      body: streamOf('{"type":"entry","entry":{"nope":1}}\n'),
      text: async () => "",
    }));
    expect(outcome.kind).toBe("refused");
  });
});

describe("buildIngestLines (W2: budget counts only bytes the grader reads)", () => {
  const withFile = (mimeType: string, size: number): StudentSubmissionEntry => ({
    student: "S",
    content: "x",
    mergedFileCount: 1,
    submittedFiles: [
      { name: "f", extension: "f", previewContent: "", previewTruncated: false, mimeType, rawBase64: "z".repeat(size) },
    ],
  });
  it("emits a student over budget ONLY from non-visual base64", () => {
    const lines = buildIngestLines([withFile("application/zip", 500)], [], 100);
    expect(lines[0].type).toBe("entry");
  });
  it("still skips a student whose VISUAL base64 alone is over budget (RES-VIS-1)", () => {
    const lines = buildIngestLines([withFile("application/pdf", 500)], [], 100);
    expect(lines[0].type).toBe("skip");
  });
});
