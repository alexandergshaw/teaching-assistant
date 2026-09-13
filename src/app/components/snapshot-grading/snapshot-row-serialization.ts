// Snapshot grading, F1 (A4d: completed assessments accumulate in a list that
// survives a reload). Mirrors grading-row-serialization.ts's own structure
// and division of labour: this file defines ONLY the SnapshotAssessmentRow
// codec, on top of the existing generic envelope in assessment-row-store.ts.
// Pure, DOM-free - no React, no `window`. The panel that calls it
// (SnapshotGradingPanel.tsx, via useAssessmentRowStore) is the only caller
// that touches window.localStorage.
//
// Wire format is authored and owned by docs/loop's F1 data/storage brief
// (f1-data.md section 4) - every field, default, and failure direction below
// is that document's, not invented here.

import type { NoPostableIdentity } from "../assessment-shared/assessment-row";
import type { AssessmentRowCodec } from "../assessment-shared/assessment-row-store";
import type {
  SnapshotAssessmentRow,
  SnapshotShotReadReport,
  SnapshotShotReadStatus,
  SnapshotRubricAreaEvidence,
} from "./snapshot-row";
import type { SnapshotRole } from "./snapshot-shot";
import { SNAPSHOT_ROLES } from "./snapshot-shot";

export const SNAPSHOT_TABLE_VERSION = 1;

const VALID_STATES = new Set<string>(["pending", "grading", "ready", "failed"]);
const VALID_READ_STATUSES = new Set<string>(["read", "partly-read", "not-read"]);

function isSnapshotRole(v: unknown): v is SnapshotRole {
  return typeof v === "string" && (SNAPSHOT_ROLES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// toWire: enumerates every field explicitly - the nine AssessmentRowCore/
// feedback fields (id, studentName, state, error, userEdited, totalScore,
// strengths, improvements, overallComment) plus seven snapshot-specific
// fields (shotReports, rubricAreas, missingRoles, instructionLikeContent,
// instructionLikeContentQuote, imageFallbackNote, evidenceDropped). NEVER
// spreads `...row` - a spread is exactly the gap that would let a future
// field (an identity field, most plausibly) leak into storage silently.
// This is the same discipline grading-row-serialization.ts's toWire runs,
// applied to a smaller row.
//
// THE LIVE RISK THIS DOES NOT COVER: `row as unknown as SnapshotAssessmentRow`
// below (and the symmetrical cast at the end of fromWire) means tsc will NOT
// flag a missing field if SnapshotAssessmentRow gains a new one later - an
// `as unknown as` cast is an escape hatch from structural checking, not a
// proof of shape. The no-spread rule above is a WRITE-side guard only: it
// stops an untyped extra property from leaking OUT, but nothing here would
// catch a NEW, legitimate field being added to the type and silently never
// written or read by this codec. This mirrors GradingRow's own precedent,
// which carries the identical risk with the identical cast.
// ---------------------------------------------------------------------------
function toWire(
  row: NoPostableIdentity<SnapshotAssessmentRow>,
  opts: { dropBulk: boolean }
): Record<string, unknown> {
  const r = row as unknown as SnapshotAssessmentRow;
  // Mirrors GradingRow's own write-side normalization: nothing is ever
  // "in flight" immediately after a reload.
  const state = r.state === "grading" ? "pending" : r.state;
  return {
    id: r.id,
    studentName: r.studentName,
    state,
    // Mirrors GradingRow's own rule: a stale error must not resurrect a
    // row that is not currently failed.
    error: state === "failed" ? r.error : "",
    userEdited: r.userEdited,
    totalScore: r.totalScore,
    strengths: r.strengths,
    improvements: r.improvements,
    overallComment: r.overallComment,
    // `rubricAreas` is the field `dropBulk` drops - the largest field this
    // row carries (multiple verbatim quotes), and, unlike GradingRow's
    // submissionText, it is recoverable the same way submissionText is: by
    // re-grading, since the transcript that produced it lives only in
    // memory anyway (never persisted, U10). Every scored field above
    // (totalScore/strengths/improvements/overallComment) plus userEdited is
    // kept - the instructor's own graded judgment, exactly GradingRow's own
    // rule, never the other way around.
    shotReports: r.shotReports,
    rubricAreas: opts.dropBulk ? [] : r.rubricAreas,
    missingRoles: r.missingRoles,
    instructionLikeContent: r.instructionLikeContent,
    instructionLikeContentQuote: r.instructionLikeContentQuote,
    imageFallbackNote: r.imageFallbackNote,
    // Without this, a reload after a reduced write shows a score with an
    // EMPTY rubricAreas array and nothing on screen says why - `persistError`
    // (useAssessmentRowStore.ts) is a `useState`, not persisted, so the
    // one-time "some evidence was dropped" signal is itself lost on the very
    // reload the drop existed to survive.
    //
    // PRESERVED, NEVER RESET on a full write - NOT `opts.dropBulk` alone. A
    // plain `opts.dropBulk` resets a previously-true flag to `false` the
    // next time ANY full write succeeds - including a full write triggered
    // by editing a DIFFERENT row in the same table (`commitRows` persists
    // the WHOLE array every time, not just the row that changed). That
    // would silently clear the notice on a row whose `rubricAreas` is STILL
    // empty, leaving a score with no citations and no explanation - exactly
    // the failure this field exists to prevent, reintroduced by the field's
    // own reset logic. Once true, stays true until a genuine re-grade of
    // THAT row supplies fresh rubricAreas (which flows through
    // `applyAssessmentResult`/`upsertSnapshotRow`, not through this codec at
    // all - toWire only ever sees the row it is given, never clears this bit
    // itself outside of a dropBulk write).
    evidenceDropped: opts.dropBulk ? true : r.evidenceDropped,
  };
}

// ---------------------------------------------------------------------------
// fromWire: NEVER throws. A defensive typeof/Array.isArray/Set.has guard on
// every field before trusting it, mirroring grading-row-serialization.ts's
// fromWire exactly. Returns null (row dropped individually by the generic
// envelope) only when there is no usable id - every other field degrades to
// a safe default rather than failing the row.
// ---------------------------------------------------------------------------
function fromWire(raw: Record<string, unknown>): NoPostableIdentity<SnapshotAssessmentRow> | null {
  const r = raw;
  const id = typeof r.id === "string" ? r.id.trim() : "";
  if (!id) return null;

  const studentName = typeof r.studentName === "string" ? r.studentName : "";

  const stateRaw = typeof r.state === "string" ? r.state : "";
  let state = VALID_STATES.has(stateRaw) ? (stateRaw as SnapshotAssessmentRow["state"]) : "pending";
  if (state === "grading") state = "pending";

  const error = state === "failed" && typeof r.error === "string" ? r.error : "";
  // Defaults to TRUE on a missing/non-boolean value, the one deliberate
  // exception to this file's otherwise-uniform "a corrupt field degrades to
  // the safe, under-claiming default" rule. Every other default in this
  // codec WITHHOLDS something (an unverified quote, an unproven "read"
  // status, an unearned role) - but `userEdited` is not a privilege to
  // withhold, it is the WRITE-PROTECT BIT that stops `applyAssessmentResult`
  // from overwriting hand-typed feedback on the next Grade press. Defaulting
  // a corrupt/missing value to `false` would mean a truncated or hand-edited
  // localStorage blob silently strips that protection, and the very next
  // re-grade destroys words the instructor already typed. Defaulting to
  // `true` over-claims the flag in the rare case it was legitimately false
  // and got corrupted in transit - a false "this row is protected" - which
  // is the strictly safer failure direction.
  const userEdited = typeof r.userEdited === "boolean" ? r.userEdited : true;
  const totalScore = typeof r.totalScore === "string" ? r.totalScore : "";
  const strengths = typeof r.strengths === "string" ? r.strengths : "";
  const improvements = typeof r.improvements === "string" ? r.improvements : "";
  const overallComment = typeof r.overallComment === "string" ? r.overallComment : "";

  // `Number.isFinite`, not `typeof x === "number"`, gates BOTH shotIndex
  // checks below - `typeof NaN === "number"` is true, so the typeof form
  // alone lets a corrupt `NaN` pass through.
  //
  // A non-finite shotIndex DROPS THE ENTRY - it is filtered out of the array
  // entirely - rather than coercing to `0`: `0` is not a real shot position
  // (shots are 1-based throughout this feature), so a coerced `0` would
  // render as a citation to "Shot 0" - a shot that cannot exist and that the
  // instructor cannot check against the tray. A fabricated shot index is
  // worse than a missing report: the former looks like real, checkable
  // evidence and is not; the latter is honestly absent.
  const shotReports: SnapshotShotReadReport[] = Array.isArray(r.shotReports)
    ? r.shotReports
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .filter((e) => typeof e.shotIndex === "number" && Number.isFinite(e.shotIndex))
        .map((e) => ({
          shotIndex: e.shotIndex as number,
          role: isSnapshotRole(e.role) ? e.role : "other",
          status: (typeof e.status === "string" && VALID_READ_STATUSES.has(e.status)
            ? e.status
            : "not-read") as SnapshotShotReadStatus,
          reason: typeof e.reason === "string" ? e.reason : undefined,
        }))
    : [];

  const rubricAreas: SnapshotRubricAreaEvidence[] = Array.isArray(r.rubricAreas)
    ? r.rubricAreas
        .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
        .filter((e) => typeof e.shotIndex === "number" && Number.isFinite(e.shotIndex))
        .map((e) => ({
          area: typeof e.area === "string" ? e.area : "",
          score: typeof e.score === "string" ? e.score : "",
          quote: typeof e.quote === "string" ? e.quote : "",
          shotIndex: e.shotIndex as number,
          verified: typeof e.verified === "boolean" ? e.verified : false,
        }))
    : [];

  const missingRoles: SnapshotRole[] = Array.isArray(r.missingRoles)
    ? r.missingRoles.filter(isSnapshotRole)
    : [];

  const instructionLikeContent = typeof r.instructionLikeContent === "boolean" ? r.instructionLikeContent : false;
  const instructionLikeContentQuote =
    typeof r.instructionLikeContentQuote === "string" ? r.instructionLikeContentQuote : undefined;
  const imageFallbackNote = typeof r.imageFallbackNote === "string" ? r.imageFallbackNote : undefined;
  // Defaults to false on a missing/non-boolean value (absent means "an old
  // row from before this field existed, or a full write that had nothing to
  // drop" - both cases where nothing was in fact dropped, so
  // under-claiming here is correct, unlike userEdited above).
  const evidenceDropped = typeof r.evidenceDropped === "boolean" ? r.evidenceDropped : false;

  return {
    id,
    studentName,
    state,
    error,
    userEdited,
    totalScore,
    strengths,
    improvements,
    overallComment,
    shotReports,
    rubricAreas,
    missingRoles,
    instructionLikeContent,
    instructionLikeContentQuote,
    imageFallbackNote,
    evidenceDropped,
  } as unknown as NoPostableIdentity<SnapshotAssessmentRow>;
}

export const snapshotRowCodec: AssessmentRowCodec<SnapshotAssessmentRow> = {
  version: SNAPSHOT_TABLE_VERSION,
  toWire,
  fromWire,
};
