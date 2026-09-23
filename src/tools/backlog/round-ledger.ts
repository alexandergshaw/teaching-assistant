// The round cap ledger: enforces AGENTS.md's "Two rounds, then ask" rule and
// docs/loop/iteration-caps.md cap 2 (per-artifact: two rounds, then the
// question goes to the owner - there is no round three).
//
// WHY THIS EXISTS. The rule already existed in prose and was violated anyway:
// three artifacts reached revision 3 on 2026-09-23 with the cap sitting in a
// card nobody executed. dispatch-guard.ts/dispatch-markers.ts is the
// precedent for what "enforced" means here - a pure decision function with no
// file I/O or clock reads, fed by a thin reader that turns a real file into
// one of a small set of states, never throwing.
//
// PERSISTENCE. Round counts are kept in `.git/BACKLOG_ROUND_LEDGER.json`,
// the same directory dispatch-markers.ts uses for its own state, for the same
// three reasons: it is VCS metadata that is never committed, it is outside
// every structure test's traversal root (source-bytes.structure.test.ts and
// file-size-ceiling.structure.test.ts both hard-code ".git" out of scope), and
// it keeps this tool's state where this tool already keeps its other state
// rather than inventing a second location.
//
// ABSENT VS UNREADABLE, again. A missing ledger file and an unparseable one
// are different facts and must not collapse into one value - that exact
// collapse made the dispatch guard's first build inert (see dispatch-guard.ts
// header). Here: an ABSENT ledger means "no round has ever been recorded for
// any artifact" - round 0 for everything, no warning, because there is
// nothing wrong, just nothing written yet. An UNREADABLE ledger means a real
// read or parse failure occurred - the true round count for the artifact in
// question cannot be trusted, so this fails OPEN (treats it as round 0,
// same as absent) but attaches a warning that must reach the operator, because
// silently discarding round history is not the same as never having any.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const LEDGER_FILE_NAME = "BACKLOG_ROUND_LEDGER.json";

/** Cap 2: at most two rounds per artifact before the question goes to the owner. */
export const MAX_ROUNDS = 2;

export interface RoundLedgerEntry {
  round: number;
  lastIncrementIso: string;
}

export type RoundLedgerData = Record<string, RoundLedgerEntry>;

/** The three facts a ledger read can produce - see this file's header for why "absent" and "unreadable" must never collapse into one. */
export type LedgerState =
  | { kind: "present"; data: RoundLedgerData }
  | { kind: "absent" }
  | { kind: "unreadable" };

export type RoundBumpDecision =
  | { decision: "allow"; newRound: number; data: RoundLedgerData; warning: string | null }
  | { decision: "block"; reason: string; warning: string | null };

export interface RoundStatusEntry {
  artifactId: string;
  round: number;
  lastIncrementIso: string | null;
}

export interface RoundStatusResult {
  entries: RoundStatusEntry[];
  warning: string | null;
}

function ledgerWarning(state: LedgerState): string | null {
  return state.kind === "unreadable"
    ? "the round ledger could not be read (a real I/O or parse error) - treating every artifact as round 0 rather than guessing; round history for this repo may be lost"
    : null;
}

/** Absent and unreadable both start a bump/status computation from "nothing recorded" - the difference is only the warning. */
function currentData(state: LedgerState): RoundLedgerData {
  return state.kind === "present" ? state.data : {};
}

function blockReason(artifactId: string, roundsAlready: number): string {
  return (
    `Artifact "${artifactId}" has already had ${String(roundsAlready)} round(s) - the cap (docs/loop/iteration-caps.md, ` +
    `cap 2) is ${String(MAX_ROUNDS)}. AGENTS.md's "Two rounds, then ask" rule means there is no round three: do not ` +
    `dispatch another revision of this artifact. Stop the rounds and put the open question to the owner now, in the ` +
    "owner's terms, alongside whatever other work is running - asking is not stopping."
  );
}

/**
 * Pure. Never touches a filesystem or a clock - readRoundLedgerState/
 * writeRoundLedgerState below are the only functions in this file that do,
 * and they hand this function (or its caller) plain values so the decision
 * itself stays testable with fixture values, exactly like decideDispatchGuard.
 */
export function decideRoundBump(state: LedgerState, artifactId: string, nowIso: string): RoundBumpDecision {
  const warning = ledgerWarning(state);
  const data = currentData(state);
  const roundsAlready = data[artifactId]?.round ?? 0;
  const newRound = roundsAlready + 1;

  if (newRound > MAX_ROUNDS) {
    return { decision: "block", reason: blockReason(artifactId, roundsAlready), warning };
  }

  return {
    decision: "allow",
    newRound,
    data: { ...data, [artifactId]: { round: newRound, lastIncrementIso: nowIso } },
    warning,
  };
}

/** Pure and read-only by construction: it never returns anything a caller could mistake for a value to write back. */
export function decideRoundStatus(state: LedgerState, artifactId?: string): RoundStatusResult {
  const warning = ledgerWarning(state);
  const data = currentData(state);

  if (artifactId !== undefined) {
    const entry = data[artifactId];
    return {
      entries: [{ artifactId, round: entry?.round ?? 0, lastIncrementIso: entry?.lastIncrementIso ?? null }],
      warning,
    };
  }

  const entries = Object.keys(data)
    .sort()
    .map((id) => ({ artifactId: id, round: data[id].round, lastIncrementIso: data[id].lastIncrementIso }));
  return { entries, warning };
}

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === "ENOENT";
}

function ledgerPath(cwd: string): string {
  return resolve(cwd, ".git", LEDGER_FILE_NAME);
}

/**
 * Exported so a fault can be injected directly (an unparseable file, or a
 * path Node's fs refuses to touch) without needing OS-specific permission
 * tricks - see round-ledger.test.ts.
 *
 * Deliberately reads with `readFileSync` inside its own try/catch rather than
 * pre-checking with `existsSync` (which swallows every error - missing,
 * permission-denied, invalid path - into a single `false`), the same
 * reasoning dispatch-markers.ts documents for its own reader: only ENOENT is
 * "absent", every other thrown error or malformed content is "unreadable".
 */
export function readRoundLedgerState(cwd: string = process.cwd()): LedgerState {
  const path = ledgerPath(cwd);
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    return isEnoent(err) ? { kind: "absent" } : { kind: "unreadable" };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { kind: "unreadable" };
    }
    const data: RoundLedgerData = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        typeof value !== "object" ||
        value === null ||
        typeof (value as { round?: unknown }).round !== "number" ||
        typeof (value as { lastIncrementIso?: unknown }).lastIncrementIso !== "string"
      ) {
        return { kind: "unreadable" };
      }
      data[id] = {
        round: (value as { round: number }).round,
        lastIncrementIso: (value as { lastIncrementIso: string }).lastIncrementIso,
      };
    }
    return { kind: "present", data };
  } catch {
    return { kind: "unreadable" };
  }
}

/** Best-effort, matching dispatch-markers.ts's touchMarker: a failed write never throws, it just leaves the ledger as it was. */
export function writeRoundLedgerState(data: RoundLedgerData, cwd: string = process.cwd()): void {
  const path = ledgerPath(cwd);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  } catch {
    // Best-effort by design - see this file's header and touchMarker's own comment.
  }
}
