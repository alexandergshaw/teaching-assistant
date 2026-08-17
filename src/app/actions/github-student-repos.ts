"use server";

// Server actions for the per-student repo invitation status panel (the
// roster-row provisioning feature). A "use server" module may export nothing
// but async functions (see src/lib/use-server-exports.test.ts), so every
// shared type and every pure helper - the state machine, the summary line,
// the outcome formatter, the storage reconciler - lives in
// src/lib/student-repo-status.ts instead. This file is orchestration only:
// it fetches the facts from GitHub and hands them to that pure module.

import { requireOwner } from "@/lib/supabase/auth";
import { rosterToRows } from "@/lib/courses-tab-helpers";
import { studentRepoName } from "@/lib/student-repo-names";
import {
  listOrgRepos,
  listRepoCollaborators,
  setRepoCollaborator,
  listRepoInvitations,
  deleteRepoInvitation,
  type RepoPermission,
  type RepoInvitation,
} from "@/lib/github";
import { resolveInvitationRow, type StudentRepoInvitationRow } from "@/lib/student-repo-status";
import { asGithubHttpError } from "@/lib/github-http-error";
import { findExistingRepoNames } from "@/lib/student-repo-prefix";

// AC3.5: a refresh processes at most this many roster rows; the rest are
// reported (never silently dropped) as `notChecked`.
const MAX_ROSTER_ROWS = 80;

// AC3.5a: reads (invitations, collaborators) run at this concurrency - far
// below GitHub's documented 100-concurrent cap, but enough to bring a
// 30-student refresh under ~3s instead of the 6-12s a strictly serial loop
// would take inside one server action.
const READ_CONCURRENCY = 4;

function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

/** Case-insensitive match between a GitHub login (invitee or collaborator)
 * and a roster handle, both normalized by stripping a leading "@". A blank
 * on either side never matches. */
function matchesStudent(login: string, username: string): boolean {
  const a = normalizeHandle(login).toLowerCase();
  const b = normalizeHandle(username).toLowerCase();
  return a !== "" && a === b;
}

/** Runs `worker` over `items` with at most `limit` in flight at once,
 * preserving result order. GitHub's "avoid concurrent requests" guidance is
 * about secondary limits on WRITES; these are reads, so a small worker pool
 * (rather than strictly serial) keeps a full-roster refresh well under the
 * page's request budget without taking 6-12 seconds for 30 students. */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function runner(): Promise<void> {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  const poolSize = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: poolSize }, () => runner()));
  return results;
}

interface RowFacts {
  invitations: RepoInvitation[];
  collaborators: string[];
  error?: string;
}

/** Fetches the facts needed to resolve one row: the repo's open invitations,
 * and - only when none of them is addressed to this student - the repo's
 * direct collaborators. This is the call-budget optimization AC3.5 counts
 * on: at most one invitations call plus at most one collaborators call per
 * row whose repo exists, never both unconditionally. */
async function fetchRowFacts(org: string, repo: string, username: string): Promise<RowFacts> {
  try {
    const invitations = await listRepoInvitations(org, repo);
    if (invitations.some((inv) => matchesStudent(inv.inviteeLogin, username))) {
      return { invitations, collaborators: [] };
    }
    const collaborators = await listRepoCollaborators(org, repo);
    return { invitations, collaborators: collaborators.map((c) => c.login) };
  } catch (err) {
    // A per-row failure sets this row's error and must not fail the whole
    // refresh - the other 79 rows still resolve normally.
    return {
      invitations: [],
      collaborators: [],
      error: err instanceof Error ? err.message : "Could not check this repository's invitation status.",
    };
  }
}

/**
 * Refreshes invitation status for every row on `rosterText`, for a course
 * whose repos live under `org` and are named with `prefix`. Reads run at
 * bounded concurrency (AC3.5a); a per-row failure never fails the whole
 * refresh (its row reports `error` instead); rows beyond the 80-row cap are
 * counted in `notChecked` rather than dropped without a trace.
 */
export async function studentRepoInvitationStatusAction(
  org: string,
  prefix: string,
  rosterText: string
): Promise<{ rows: StudentRepoInvitationRow[]; checkedAt: number; notChecked: number } | { error: string }> {
  try {
    await requireOwner();
    const trimmedOrg = org.trim();
    if (!trimmedOrg) return { error: "Choose an organization." };

    const allRosterRows = rosterToRows(rosterText);
    const capped = allRosterRows.slice(0, MAX_ROSTER_ROWS);
    const notChecked = Math.max(0, allRosterRows.length - MAX_ROSTER_ROWS);

    // One shared, UNFILTERED listing establishes which of the computed repo
    // names exist. Do not pass `prefix` to listOrgRepos: studentRepoName()
    // slugs the prefix (spaces, punctuation, etc. collapse to hyphens)
    // before building a repo name, but listOrgRepos's own prefix filter
    // matches the raw, unslugged prefix against repo names client-side
    // (github.repos.ts:146). For a prefix like "CS 101" that filter's
    // needle ("cs 101") never matches real repo names ("cs-101-..."), so
    // every repo would be filtered out and every row would falsely report
    // as missing. The filter also saves zero requests - it runs client-side
    // after every page is already fetched - so there is no cost to dropping
    // it and matching computed names against the full listing instead.
    let orgRepoNames: string[];
    try {
      const repos = await listOrgRepos(trimmedOrg);
      orgRepoNames = repos.map((r) => r.name);
    } catch (err) {
      return {
        error: err instanceof Error ? err.message : "Could not list the organization's repositories.",
      };
    }

    const now = Date.now();

    const computedRepos = capped.map((r) => studentRepoName(prefix, r.student, r.username));
    const existingRepoNames = findExistingRepoNames(computedRepos, orgRepoNames);

    const entries = capped.map((r, i) => {
      const repo = computedRepos[i];
      return {
        student: r.student,
        username: r.username,
        repo,
        repoExists: existingRepoNames.has(repo.toLowerCase()),
      };
    });

    const facts = await runWithConcurrency(entries, READ_CONCURRENCY, async (entry) => {
      const username = normalizeHandle(entry.username);
      if (!username || !entry.repoExists) {
        return { invitations: [] as RepoInvitation[], collaborators: [] as string[] };
      }
      return fetchRowFacts(trimmedOrg, entry.repo, username);
    });

    const rows = entries.map((entry, i) =>
      resolveInvitationRow({
        student: entry.student,
        username: entry.username,
        org: trimmedOrg,
        repo: entry.repo,
        repoExists: entry.repoExists,
        invitations: facts[i].invitations,
        collaborators: facts[i].collaborators,
        error: facts[i].error ?? null,
        now,
      })
    );

    return { rows, checkedAt: now, notChecked };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not check invitation status." };
  }
}

/**
 * "Resend" a student's invitation. GitHub has no resend endpoint (AC3.7a),
 * so this deletes the student's existing invitation on `repo` (if any) and
 * then issues a fresh one. If the delete 404s - GitHub already dropped the
 * invitation, e.g. a race with the poll or a double click - that is a
 * reachable state (AC3.1b), so the flow continues to the PUT rather than
 * failing.
 */
export async function resendStudentRepoInviteAction(
  org: string,
  repo: string,
  username: string,
  permission: RepoPermission
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const trimmedOrg = org.trim();
    const trimmedRepo = repo.trim();
    const user = normalizeHandle(username);
    if (!trimmedOrg) return { error: "Choose an organization." };
    if (!trimmedRepo) return { error: "Choose a repository." };
    if (!user) return { error: "Enter a GitHub username first." };

    const invitations = await listRepoInvitations(trimmedOrg, trimmedRepo);
    const existing = invitations.find((inv) => matchesStudent(inv.inviteeLogin, user));
    if (existing) {
      try {
        await deleteRepoInvitation(trimmedOrg, trimmedRepo, existing.id);
      } catch (err) {
        const httpErr = asGithubHttpError(err);
        if (!httpErr || httpErr.status !== 404) throw err;
      }
    }

    await setRepoCollaborator(trimmedOrg, trimmedRepo, user, permission);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not resend the invitation." };
  }
}

/** Cancels a student's pending or expired invitation outright (no fresh
 * invite follows - that is what distinguishes Revoke from Resend). */
export async function revokeStudentRepoInviteAction(
  org: string,
  repo: string,
  invitationId: number
): Promise<{ ok: true } | { error: string }> {
  try {
    await requireOwner();
    const trimmedOrg = org.trim();
    const trimmedRepo = repo.trim();
    if (!trimmedOrg) return { error: "Choose an organization." };
    if (!trimmedRepo) return { error: "Choose a repository." };
    if (!Number.isFinite(invitationId)) return { error: "Choose an invitation to revoke." };

    await deleteRepoInvitation(trimmedOrg, trimmedRepo, invitationId);
    return { ok: true };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not revoke the invitation." };
  }
}
