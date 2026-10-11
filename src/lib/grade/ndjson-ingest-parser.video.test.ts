// VIDEO-GRADING W2 (ops section 9.2): the ingest wire gains OPTIONAL typed video
// fields. Additive: a sentinel without them parses exactly as before, and a
// ledger with no video activity serialises byte-identically to before.
import { describe, it, expect } from "vitest";
import { buildIngestLines, encodeIngestLine, ingestStoragedZip, type IngestFetch } from "./ndjson-ingest-parser";

function streamOf(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
}

function fetchOf(lines: string[]): IngestFetch {
  return async () => ({ ok: true, status: 200, body: streamOf(lines), text: async () => "" });
}

describe("buildIngestLines: videoOutcomes", () => {
  it("is omitted when there was no video activity (flag-off wire is byte-identical)", () => {
    const without = buildIngestLines([], []).map(encodeIngestLine).join("");
    const withEmpty = buildIngestLines([], [], undefined, undefined, { accepted: 0, failed: {} }).map(encodeIngestLine).join("");
    expect(withEmpty).toBe(without);
    expect(without).not.toContain("videoOutcomes");
  });

  it("is carried on the sentinel when videos were seen", () => {
    const lines = buildIngestLines([], [], undefined, undefined, { accepted: 2, failed: { "unsupported format": 1 } });
    expect(lines[lines.length - 1]).toMatchObject({ type: "done", videoOutcomes: { accepted: 2, failed: { "unsupported format": 1 } } });
  });
});

describe("ingestStoragedZip: typed video fields", () => {
  it("parses videoOutcomes onto the ledger", async () => {
    const done = encodeIngestLine({
      type: "done",
      studentsFound: 0,
      studentsEmitted: 0,
      skipped: [],
      failedSupportedFiles: [],
      videoOutcomes: { accepted: 3, failed: { "upload failed": 1 } },
    });
    const outcome = await ingestStoragedZip("u/grading-uploads/x.zip", "gemini", () => undefined, fetchOf([done]));
    expect(outcome.kind).toBe("complete");
    if (outcome.kind === "complete") expect(outcome.ledger.videoOutcomes).toEqual({ accepted: 3, failed: { "upload failed": 1 } });
  });

  it("an old sentinel (no videoOutcomes) leaves the field absent", async () => {
    const done = encodeIngestLine({ type: "done", studentsFound: 0, studentsEmitted: 0, skipped: [], failedSupportedFiles: [] });
    const outcome = await ingestStoragedZip("u/grading-uploads/x.zip", "gemini", () => undefined, fetchOf([done]));
    expect(outcome.kind === "complete" && "videoOutcomes" in outcome.ledger).toBe(false);
  });

  it("a refusal carries the TYPED class when it is a real class, and drops anything else", async () => {
    const typed = JSON.stringify({ type: "done", error: "Refused: x", videoFailure: "too many videos" }) + "\n";
    const r1 = await ingestStoragedZip("p", "gemini", () => undefined, fetchOf([typed]));
    expect(r1).toEqual({ kind: "refused", reason: "Refused: x", videoFailure: "too many videos" });

    const forged = JSON.stringify({ type: "done", error: "Refused: x", videoFailure: "Jordan Lee.mp4" }) + "\n";
    const r2 = await ingestStoragedZip("p", "gemini", () => undefined, fetchOf([forged]));
    expect(r2).toEqual({ kind: "refused", reason: "Refused: x" });
  });
});
