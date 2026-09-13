// Shared persistence layer for the assessment-grading surfaces
// (grading-recording today; a second capture-based grading surface is a
// later wave). WAVE 2 of the assessment-grading extraction, following
// WAVE 1's assessment-row.ts (the shared row core and identity guard).
//
// This is a MOVE of grading-row-serialization.ts's serialize/deserialize
// shape, generalised over the row type via a per-surface AssessmentRowCodec.
// The BEHAVIOUR is lifted verbatim - a behaviour change here is a silent
// regression across a shipped feature that no component-rendering test
// could ever catch (this repo's vitest is node-env; see
// grading-row-serialization.ts's own header for the full discipline this
// file inherits: a version constant, deserialize NEVER throws, and a
// two-tier quota fallback that drops the largest field first while always
// keeping the instructor's own graded judgment).
//
// Pure, DOM-free, React-free - no `window`, no hooks. useAssessmentRowStore.ts
// is the only caller that touches `window.localStorage`.
//
// THE NO-SPREAD RULE (grading-row-serialization.ts's own header): a codec's
// `toWire` must enumerate fields explicitly, never spread `...row`, so a
// runtime value that somehow carries an extra property cannot leak it into
// storage through this file. That discipline lives in each PER-SURFACE
// codec (e.g. grading-row-serialization.ts's GradingRow codec) - this file
// only wraps whatever the codec produces in the `{ v, rows }` envelope and
// never touches a row's fields itself.

import type { AssessmentRowCore, NoPostableIdentity } from "./assessment-row";

/**
 * A per-surface codec: how one row type is written to and read back from
 * the wire (JSON) format. `version` is that surface's own version constant
 * (grading-row-serialization.ts's GRADING_TABLE_VERSION is the precedent) -
 * a version mismatch degrades to an empty table rather than guessing at a
 * shape it was never told about, mirroring deserializeGradingRows's own
 * `obj.v !== GRADING_TABLE_VERSION` check.
 */
export interface AssessmentRowCodec<R extends AssessmentRowCore> {
  version: number;
  /** Builds the exact plain object that gets JSON.stringify'd for one row.
   *  `opts.dropBulk` is the quota-fallback lever (grading-row-serialization.ts's
   *  own `dropSubmissionText` parameter, generalised): when true, the
   *  codec's own largest/most-recoverable field is dropped first, and every
   *  field that carries the instructor's own graded judgment is always
   *  kept - never the other way around. MUST enumerate fields explicitly,
   *  never spread `...row` - see this file's header. */
  toWire(row: NoPostableIdentity<R>, opts: { dropBulk: boolean }): Record<string, unknown>;
  /** Parses one row out of the wire format. NEVER throws - an unrecoverable
   *  row (no usable primary key, or malformed beyond repair) returns null
   *  and is skipped by the caller, mirroring deserializeGradingRows's own
   *  per-row `if (!id) return;` discipline. */
  fromWire(raw: Record<string, unknown>): NoPostableIdentity<R> | null;
}

/**
 * The normal write path - every field the codec knows about, including
 * whatever field `dropBulk` would otherwise drop. Lifted verbatim from
 * grading-row-serialization.ts's own `serialize`/`serializeGradingRows`.
 */
export function serializeAssessmentRows<R extends AssessmentRowCore>(
  rows: ReadonlyArray<R>,
  codec: AssessmentRowCodec<R>,
  dropBulk: boolean
): string {
  const wireRows = rows.map((r) => codec.toWire(r as unknown as NoPostableIdentity<R>, { dropBulk }));
  return JSON.stringify({ v: codec.version, rows: wireRows });
}

/**
 * The read side. NEVER throws - mirrors deserializeGradingRows's discipline
 * exactly: a top-level try/catch, defensive typeof/Array.isArray guards
 * before touching anything, and a row that cannot be recovered is dropped
 * individually (via the codec's own `fromWire` returning null) rather than
 * failing the whole load.
 */
export function deserializeAssessmentRows<R extends AssessmentRowCore>(
  raw: string | null,
  codec: AssessmentRowCodec<R>
): R[] {
  try {
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return [];
    const obj = parsed as Record<string, unknown>;
    // A version mismatch (including a hypothetical FUTURE or OLDER version
    // this code does not know how to read) degrades to an empty table
    // rather than guessing at a shape it was never told about.
    if (obj.v !== codec.version) return [];
    if (!Array.isArray(obj.rows)) return [];

    const rows: R[] = [];
    obj.rows.forEach((rawRow: unknown) => {
      if (!rawRow || typeof rawRow !== "object") return;
      const parsedRow = codec.fromWire(rawRow as Record<string, unknown>);
      if (parsedRow === null) return; // unrecoverable - dropped individually
      rows.push(parsedRow as unknown as R);
    });

    return rows;
  } catch {
    return [];
  }
}
