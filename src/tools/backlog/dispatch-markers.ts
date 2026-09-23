// The only place in src/tools/backlog/ that touches the two marker files the
// dispatch guard (dispatch-guard.ts) reasons over. Kept separate from that
// pure decision module for the same reason git-commits.ts is kept separate
// from shipped-uncited.ts: the decision logic's own tests never need a real
// filesystem or a real clock, and this module's job is entirely "turn a
// filesystem into a MarkerState, and never throw doing it."
//
// WHY .git/. Never committed (it is the VCS metadata directory itself) and
// never walked by this repo's structure tests - both source-bytes.structure
// .test.ts and file-size-ceiling.structure.test.ts hard-code ".git" into
// their SKIP_DIRS/traversal roots, so a marker file placed there cannot trip
// the emoji scan, the line-ceiling gate, or the byte-safety scan, and it
// cannot end up in a commit by accident the way a repo-root scratch file
// could.
//
// ABSENT VS UNREADABLE. `readMarkerState` returns one of three states
// (dispatch-guard.ts's MarkerState) rather than collapsing "the file does
// not exist" and "the file could not be read" into a single `null`, the way
// an earlier version of this file did. That collapse was a live bug: a
// session that never calls touch-dispatch has a permanently ABSENT dispatch
// marker, and decideDispatchGuard's old first-run allow branch treated every
// one of that session's stops as "nothing to compare" - the guard never
// fired for exactly the session it exists to catch (reproduced against the
// real hook: two stops in a row with no dispatch in between both allowed).
// Fail-open still applies, but only to "unreadable" - a genuine read error -
// never to plain absence.
import { existsSync, statSync, closeSync, openSync, utimesSync } from "node:fs";
import { resolve } from "node:path";
import type { MarkerState } from "./dispatch-guard";

const DISPATCH_MARKER_NAME = "BACKLOG_LAST_DISPATCH";
const STOP_MARKER_NAME = "BACKLOG_LAST_STOP";

export interface DispatchMarkerState {
  dispatch: MarkerState;
  lastStop: MarkerState;
  /** Non-null means the whole read was skipped (e.g. no .git at all) - never thrown. */
  warning: string | null;
}

function isEnoent(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as NodeJS.ErrnoException).code === "ENOENT";
}

/**
 * Exported so a fault can be injected directly (a path Node's fs refuses to
 * touch, such as one containing a NUL byte) without needing OS-specific
 * permission tricks to provoke a real I/O error - see dispatch-markers.test.ts.
 *
 * Deliberately does NOT pre-check with `existsSync`: that function swallows
 * every error (a missing path, a permission error, an invalid path - ANY of
 * them - all come back simply `false`), which would make "absent" and
 * "unreadable" indistinguishable again, exactly the collapse this file's
 * header describes as the bug. `statSync` is called directly instead, and
 * only ENOENT (nothing is there) is treated as "absent"; every other thrown
 * error, and a stat'd mtime that is not a finite number, is "unreadable".
 */
export function readMarkerState(path: string): MarkerState {
  let stat;
  try {
    stat = statSync(path);
  } catch (err) {
    return isEnoent(err) ? { kind: "absent" } : { kind: "unreadable" };
  }
  return Number.isFinite(stat.mtimeMs) ? { kind: "present", mtimeMs: stat.mtimeMs } : { kind: "unreadable" };
}

/** Best-effort create-or-touch. Never throws - a failed touch just leaves the marker as it was. */
function touchMarker(path: string): void {
  try {
    if (!existsSync(path)) closeSync(openSync(path, "a"));
    const now = new Date();
    utimesSync(path, now, now);
  } catch {
    // Best-effort by design - see this file's header.
  }
}

export function readDispatchMarkerState(cwd: string = process.cwd()): DispatchMarkerState {
  try {
    const gitDir = resolve(cwd, ".git");
    if (!existsSync(gitDir)) {
      // No repo at all is a different fact from "no stop has happened yet
      // in a real repo" - there is nothing to build a marker history on, so
      // this fails open exactly like readRecentWorkCommits does for the
      // same condition (git-commits.ts). Reporting both markers "absent"
      // here is still correct: with no .git, lastStop is genuinely absent
      // (this repo has recorded nothing), so decideDispatchGuard's ordinary
      // first-run branch fires - no special-casing needed downstream.
      return {
        dispatch: { kind: "absent" },
        lastStop: { kind: "absent" },
        warning: "dispatch guard skipped: no .git directory found",
      };
    }
    return {
      dispatch: readMarkerState(resolve(gitDir, DISPATCH_MARKER_NAME)),
      lastStop: readMarkerState(resolve(gitDir, STOP_MARKER_NAME)),
      warning: null,
    };
  } catch (err) {
    // Belt-and-braces: resolve()/existsSync() are not expected to throw, but
    // this check must never be the thing that crashes a Stop hook. This is a
    // genuine error path, so both markers report "unreadable" (fail-open),
    // never "absent".
    return {
      dispatch: { kind: "unreadable" },
      lastStop: { kind: "unreadable" },
      warning: `dispatch guard skipped: marker read failed (${err instanceof Error ? err.message : String(err)})`,
    };
  }
}

/** Touched by this check every time it runs (the dispatch guard's own header explains why). */
export function touchStopMarker(cwd: string = process.cwd()): void {
  const gitDir = resolve(cwd, ".git");
  if (!existsSync(gitDir)) return;
  touchMarker(resolve(gitDir, STOP_MARKER_NAME));
}

/** Touched by the main session when it dispatches a subagent - see the exact `npm run` command in dispatch-guard.ts's block reason. */
export function touchDispatchMarker(cwd: string = process.cwd()): void {
  const gitDir = resolve(cwd, ".git");
  if (!existsSync(gitDir)) return;
  touchMarker(resolve(gitDir, DISPATCH_MARKER_NAME));
}
