// Coverage for the rate-limit fix on the per-student invitation status panel
// (useStudentRepoInvitations.ts): after a provision/invite/resend/revoke,
// the hook used to run a FULL roster refresh (listOrgRepos + one
// invitations call + one collaborators call PER ROSTER ROW) just to update
// one row. For a 30-student roster in a 300-repo org that is ~63 requests
// per click (docs/org-student-repo-provisioning-acceptance-criteria.md
// AC3.5), serialized behind the enqueue chain, on the one night the feature
// exists for: provisioning a class before term.
//
// Two things are covered here:
// 1. `mergeSingleRowResult` - the pure merge that replaces exactly one row
//    by its `rowKey`, never by array position, so the fix cannot key a
//    result onto the wrong student (see the long comment above
//    `resolvedByKey` in StudentRepoRoster.tsx for why position alignment is
//    NOT guaranteed once a refresh stops always being whole-table).
// 2. A wiring check (vitest here is node-env and collects only
//    src/**/*.test.ts - nothing renders, per this suite's own established
//    idiom, e.g. syllabusTemplateUpload.wiring.test.ts) that:
//    - the three mutations call the new single-row refresh, not the old
//      per-click full refresh;
//    - the manual Refresh button and the automatic poll are UNCHANGED -
//      they still run the full refresh;
//    - every mutation is still wrapped in `await enqueue(...)` - the
//      load-bearing serialization guarantee (REGRESSION 309/16) that a
//      user-initiated click is never silently dropped.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { mergeSingleRowResult, rowKey } from "./useStudentRepoInvitations";
import type { StudentRepoInvitationRow } from "@/lib/student-repo-status";

function makeRow(overrides: Partial<StudentRepoInvitationRow> & { student: string; username: string }): StudentRepoInvitationRow {
  return {
    repo: "org/repo",
    repoUrl: "https://github.com/org/repo",
    state: "not-invited",
    label: "Not invited",
    invitationId: null,
    invitedAt: null,
    expiresAt: null,
    detail: null,
    ...overrides,
  };
}

describe("mergeSingleRowResult", () => {
  it("replaces the row whose key matches, leaving every other row untouched", () => {
    const alice = makeRow({ student: "Alice", username: "alice-gh", state: "not-invited" });
    const bob = makeRow({ student: "Bob", username: "bob-gh", state: "pending" });
    const carol = makeRow({ student: "Carol", username: "carol-gh", state: "accepted" });
    const rows = [alice, bob, carol];

    const bobKey = rowKey("Bob", "bob-gh", 1);
    const updatedBob = makeRow({ student: "Bob", username: "bob-gh", state: "accepted" });

    const result = mergeSingleRowResult(rows, bobKey, updatedBob);

    expect(result).not.toBeNull();
    expect(result).toEqual([alice, updatedBob, carol]);
    // Other rows are the SAME objects, not just equal - proof nothing else
    // was touched or recreated.
    expect(result![0]).toBe(alice);
    expect(result![2]).toBe(carol);
  });

  it("returns null when no row's key matches - the fallback-to-full-refresh signal", () => {
    const rows = [makeRow({ student: "Alice", username: "alice-gh" })];
    const missingKey = rowKey("Dave", "dave-gh", 5);
    const newRow = makeRow({ student: "Dave", username: "dave-gh" });

    expect(mergeSingleRowResult(rows, missingKey, newRow)).toBeNull();
  });

  it("disambiguates two handle-less rows by POSITION, never by name alone", () => {
    // AC2.1a: a student with no GitHub username still gets a row. Two such
    // students can share the same trimmed/lowercased name - rowKey's
    // handle-less branch (`s:${student}:${index}`) is what keeps them
    // distinct, and this must key on the row's actual position in `rows`,
    // not on some other row that merely has the same name.
    const first = makeRow({ student: "Jordan Lee", username: "", state: "no-username" });
    const second = makeRow({ student: "Jordan Lee", username: "", state: "no-username" });
    const rows = [first, second];

    const keyForIndex1 = rowKey("Jordan Lee", "", 1);
    const updated = makeRow({ student: "Jordan Lee", username: "", state: "no-username", detail: "refreshed" });

    const result = mergeSingleRowResult(rows, keyForIndex1, updated);

    expect(result).not.toBeNull();
    // Only the row AT INDEX 1 changed; the row at index 0 - same name, same
    // state, different position - is untouched.
    expect(result![0]).toBe(first);
    expect(result![1]).toBe(updated);
  });

  it("does not mutate the input array", () => {
    const rows = [makeRow({ student: "Alice", username: "alice-gh" })];
    const snapshot = [...rows];
    const key = rowKey("Alice", "alice-gh", 0);
    mergeSingleRowResult(rows, key, makeRow({ student: "Alice", username: "alice-gh", state: "accepted" }));
    expect(rows).toEqual(snapshot);
  });
});

const HOOK_PATH = join(process.cwd(), "src/app/components/courses/useStudentRepoInvitations.ts");
const hookSource = readFileSync(HOOK_PATH, "utf8");

/** Source with comments stripped, so prose describing a call is never
 * mistaken for the call itself - same idiom as
 * syllabusTemplateUpload.wiring.test.ts. */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const code = stripComments(hookSource);

function sliceBetween(startMarker: string, endMarker: string): string {
  const start = code.indexOf(startMarker);
  expect(start, `expected to find "${startMarker}"`).toBeGreaterThanOrEqual(0);
  const end = code.indexOf(endMarker, start + startMarker.length);
  expect(end, `expected to find "${endMarker}" after "${startMarker}"`).toBeGreaterThanOrEqual(0);
  return code.slice(start, end);
}

describe("useStudentRepoInvitations.ts wiring (source-level, nothing renders under vitest)", () => {
  it("defines runSingleRowRefreshCore, scoped to a single-row roster line", () => {
    const body = sliceBetween(
      "const runSingleRowRefreshCore = useCallback(",
      "const runRefresh = useCallback("
    );
    expect(body).toContain("studentRepoInvitationStatusAction(");
    expect(body).toContain("rowsToRoster([{ student, username }])");
    // Must merge in place via the tested pure helper, never assign the
    // action's own `.rows` directly (that would be a full-table overwrite).
    expect(body).toContain("mergeSingleRowResult(prev, key, newRow)");
    expect(body).not.toContain("setRows(result.rows)");
    // checkedAt/notChecked describe the last WHOLE-TABLE check; a single-row
    // refresh must never bump them, or "Checked N minutes ago" starts
    // claiming every row was just re-checked when only one was.
    expect(body).not.toContain("setCheckedAt(");
    expect(body).not.toContain("setNotChecked(");
  });

  it("provisionRow, inviteOrResendRow and revokeRow call the single-row refresh, not a full one, after success", () => {
    const provisionBody = sliceBetween("const provisionRow = useCallback(", "const inviteOrResendRow = useCallback(");
    const inviteBody = sliceBetween("const inviteOrResendRow = useCallback(", "const revokeRow = useCallback(");
    const revokeBody = sliceBetween("const revokeRow = useCallback(", "return {");

    for (const [name, body] of [
      ["provisionRow", provisionBody],
      ["inviteOrResendRow", inviteBody],
      ["revokeRow", revokeBody],
    ] as const) {
      expect(body, `${name} should call runSingleRowRefreshCore`).toContain("runSingleRowRefreshCore(key, student, username)");
      expect(body, `${name} should not run the whole-table refresh`).not.toContain("runRefreshCore(true)");
    }
  });

  it("keeps the manual Refresh button and the automatic poll on the full refresh - unchanged", () => {
    const refreshBody = sliceBetween("const runRefresh = useCallback(", "const orgWasBlankRef = useRef(");
    expect(refreshBody).toContain("enqueue(() => runRefreshCore(true))");
    expect(refreshBody).toContain("enqueue(() => runRefreshCore(false))");
  });

  it("still serializes every mutation through enqueue - no click is ever silently dropped (REGRESSION 309/16)", () => {
    const provisionBody = sliceBetween("const provisionRow = useCallback(", "const inviteOrResendRow = useCallback(");
    const inviteBody = sliceBetween("const inviteOrResendRow = useCallback(", "const revokeRow = useCallback(");
    const revokeBody = sliceBetween("const revokeRow = useCallback(", "return {");

    for (const [name, body] of [
      ["provisionRow", provisionBody],
      ["inviteOrResendRow", inviteBody],
      ["revokeRow", revokeBody],
    ] as const) {
      expect(body, `${name} must enqueue its GitHub-bound work`).toContain("await enqueue(async () => {");
      // The old, forbidden shape: a boolean bail-if-busy guard that drops
      // the click instead of queuing it.
      expect(body, `${name} must not reintroduce a bail-if-busy guard`).not.toMatch(/if\s*\(\s*inFlightRef\.current\s*\)\s*return;/);
    }
  });
});
