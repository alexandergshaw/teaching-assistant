// BULK-ZIP BW2 (docs/bulk-zip-grading-scope.md section 3): the wire protocol of
// POST /api/grade-submission-zip, plus the two pure halves of it - the
// server-side PARTITION (which extracted entries become "entry" lines, which
// become "skip" lines) and the NEVER-THROW client parser. Kept as a plain .ts
// leaf with no React, no server-only import and no global fetch dependency so
// both the Route Handler and the client driver import it and vitest can
// exercise every decision (no component is rendered there).

import { ITEM_REQUEST_BYTE_BUDGET, estimateEntryWireBytes } from "@/app/components/grading/incrementalRunPlan";
import type { StudentSubmissionEntry } from "@/lib/grade/types";

export interface IngestSkip {
  readonly student: string;
  readonly reason: string;
}

export interface IngestLedger {
  readonly studentsFound: number;
  readonly studentsEmitted: number;
  readonly skipped: readonly IngestSkip[];
  readonly failedSupportedFiles: readonly string[];
}

export type IngestLine =
  | { readonly type: "entry"; readonly entry: StudentSubmissionEntry; readonly pointsPossible: null }
  | { readonly type: "skip"; readonly student: string; readonly reason: string }
  | ({ readonly type: "done" } & IngestLedger)
  | { readonly type: "done"; readonly error: string };

export const OVERSIZED_SKIP_REASON = "too large to grade on this surface";

/**
 * The partition. One oversized student is ONE skip line - never a whole-call
 * refusal and never a silent drop - and the terminal sentinel lists it, so the
 * client can tell "found 26, emitted 25, skipped 1" from "stream cut off".
 * `budget` is injectable for tests; production passes the default.
 */
export function buildIngestLines(
  entries: readonly StudentSubmissionEntry[],
  failedSupportedFiles: readonly string[],
  budget: number = ITEM_REQUEST_BYTE_BUDGET
): IngestLine[] {
  const lines: IngestLine[] = [];
  const skipped: IngestSkip[] = [];
  let emitted = 0;
  for (const entry of entries) {
    if (estimateEntryWireBytes(entry) > budget) {
      const skip: IngestSkip = { student: entry.student, reason: OVERSIZED_SKIP_REASON };
      skipped.push(skip);
      lines.push({ type: "skip", ...skip });
    } else {
      emitted += 1;
      lines.push({ type: "entry", entry, pointsPossible: null });
    }
  }
  lines.push({
    type: "done",
    studentsFound: entries.length,
    studentsEmitted: emitted,
    skipped,
    failedSupportedFiles: [...failedSupportedFiles],
  });
  return lines;
}

export function encodeIngestLine(line: IngestLine): string {
  return JSON.stringify(line) + "\n";
}

export type IngestOutcome =
  | { readonly kind: "complete"; readonly ledger: IngestLedger; readonly entryCount: number }
  | { readonly kind: "refused"; readonly reason: string };

/** The narrow fetch slice the parser needs, injectable so tests never touch the network. */
export type IngestFetch = (
  url: string,
  init: { method: "POST"; headers: Record<string, string>; body: string }
) => Promise<{
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}>;

export const INGEST_ROUTE = "/api/grade-submission-zip";

const UNREADABLE = "The zip could not be prepared (unreadable response).";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEntry(value: unknown): value is StudentSubmissionEntry {
  return (
    isRecord(value) &&
    typeof value.student === "string" &&
    typeof value.content === "string" &&
    Array.isArray(value.submittedFiles)
  );
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function skipList(value: unknown): IngestSkip[] {
  if (!Array.isArray(value)) return [];
  const out: IngestSkip[] = [];
  for (const item of value) {
    if (isRecord(item) && typeof item.student === "string" && typeof item.reason === "string") {
      out.push({ student: item.student, reason: item.reason });
    }
  }
  return out;
}

async function* readLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    let at = pending.indexOf("\n");
    while (at >= 0) {
      const line = pending.slice(0, at).trim();
      pending = pending.slice(at + 1);
      if (line.length > 0) yield line;
      at = pending.indexOf("\n");
    }
  }
  pending += decoder.decode();
  const tail = pending.trim();
  if (tail.length > 0) yield tail;
}

async function refusalFromResponse(response: { status: number; text(): Promise<string> }): Promise<string> {
  try {
    const parsed: unknown = JSON.parse(await response.text());
    if (isRecord(parsed) && typeof parsed.error === "string" && parsed.error.trim().length > 0) {
      return parsed.error;
    }
  } catch {
    // fall through to the generic wording
  }
  return `The zip could not be prepared (HTTP ${response.status}).`;
}

/**
 * Calls the ingest route and reads its NDJSON stream. NEVER THROWS: a non-OK
 * status, a body that is not NDJSON, a thrown fetch/read, a worded
 * `done`-with-error, and a stream that ends with NO sentinel all resolve as
 * `{ kind: "refused", reason }`. A missing sentinel is the load-bearing case:
 * the connection can die mid-stream with every line received so far looking
 * valid, and only the sentinel proves the zip was fully enumerated.
 */
export async function ingestStoragedZip(
  storagePath: string,
  provider: string,
  onEntry: (entry: StudentSubmissionEntry) => void,
  fetchImpl: IngestFetch = (url, init) => fetch(url, init)
): Promise<IngestOutcome> {
  let entryCount = 0;
  try {
    const response = await fetchImpl(INGEST_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ storagePath, provider }),
    });
    if (!response.ok) return { kind: "refused", reason: await refusalFromResponse(response) };
    if (!response.body) return { kind: "refused", reason: "The zip could not be prepared (empty response)." };

    for await (const raw of readLines(response.body)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return { kind: "refused", reason: UNREADABLE };
      }
      if (!isRecord(parsed)) return { kind: "refused", reason: UNREADABLE };
      if (parsed.type === "entry") {
        if (!isEntry(parsed.entry)) return { kind: "refused", reason: UNREADABLE };
        entryCount += 1;
        onEntry(parsed.entry);
      } else if (parsed.type === "done") {
        if (typeof parsed.error === "string") return { kind: "refused", reason: parsed.error };
        const studentsFound = typeof parsed.studentsFound === "number" ? parsed.studentsFound : entryCount;
        const studentsEmitted = typeof parsed.studentsEmitted === "number" ? parsed.studentsEmitted : entryCount;
        return {
          kind: "complete",
          entryCount,
          ledger: {
            studentsFound,
            studentsEmitted,
            skipped: skipList(parsed.skipped),
            failedSupportedFiles: stringList(parsed.failedSupportedFiles),
          },
        };
      }
      // "skip" lines are re-listed in the sentinel; nothing to do per line.
    }
    return {
      kind: "refused",
      reason: `Preparation was interrupted after ${entryCount} ${entryCount === 1 ? "student" : "students"}; nothing was graded. Try the zip again.`,
    };
  } catch (err) {
    const detail = err instanceof Error && err.message.trim().length > 0 ? ` (${err.message})` : "";
    return { kind: "refused", reason: `The zip could not be prepared${detail}.` };
  }
}
