// Pure state machine for the per-student repo invitation status panel. No I/O
// and no imports from action files: the server action
// (src/app/actions/github-student-repos.ts) fetches the facts - does the
// repo exist, what invitations does it carry, who are its direct
// collaborators - and this module turns them into a row. The split is what
// makes the state machine testable at all, since the vitest suite is
// node-env and never renders a component.
//
// `ClassroomRowResult` is imported as a TYPE ONLY from the plain (non "use
// server") actions-types module, so this stays a pure module with nothing to
// erase-and-break: it is used only to type `formatProvisionOutcome`'s input.

import type { ClassroomRowResult } from "@/app/actions-types";
import type { RepoInvitation } from "./github.invitations";

export type StudentRepoInvitationState =
  | "error"
  | "no-username"
  | "missing"
  | "expired"
  | "pending"
  | "accepted"
  | "not-invited";

export const STATUS_LABELS: Record<StudentRepoInvitationState, string> = {
  error: "Unknown",
  "no-username": "No username",
  missing: "No repo yet",
  expired: "Expired",
  pending: "Pending",
  accepted: "Accepted",
  "not-invited": "Not invited",
};

/** GitHub repository invitations expire after this many days (product docs;
 * the REST reference itself does not state it). GitHub's own UI has a
 * long-standing defect where an expired invitation still renders as pending,
 * so the resolver below computes expiry from this constant rather than
 * trusting the API's `expired` flag alone. */
export const INVITATION_EXPIRY_DAYS = 7;

const EXPIRY_MS = INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

export interface StudentRepoStatusInput {
  student: string;
  username: string; // raw roster value; may carry a leading "@"; may be ""
  org: string;
  repo: string; // bare repo NAME, no owner
  repoExists: boolean;
  invitations: RepoInvitation[];
  collaborators: string[]; // LOGINS only - the action flattens listRepoCollaborators
  error?: string | null;
  now: number; // epoch ms; the resolver never reads the clock itself
}

export interface StudentRepoInvitationRow {
  student: string;
  username: string; // normalized: "@" stripped, "" when absent
  repo: string; // "org/name"
  repoUrl: string; // https://github.com/org/name
  state: StudentRepoInvitationState;
  label: string; // === STATUS_LABELS[state]
  invitationId: number | null;
  invitedAt: string | null; // the invitation's createdAt, verbatim
  expiresAt: string | null; // ISO, createdAt + 7 days; null if none/unparseable
  detail: string | null; // the error message, else null
}

/** Strips a leading "@" and surrounding whitespace. Used on both the roster
 * handle and, separately (lowercased), the invitee/collaborator logins so the
 * two sides can be compared identically. */
function normalizeHandle(raw: string): string {
  return (raw ?? "").trim().replace(/^@/, "");
}

/** Lowercased comparison key for a handle already run through normalizeHandle
 * (or any raw login) - GitHub logins never carry a leading "@" and matching
 * must be case-insensitive on both sides. */
function handleKey(raw: string): string {
  return normalizeHandle(raw).toLowerCase();
}

/** epoch ms for a createdAt string, or null when it cannot be parsed. */
function parseCreatedAt(createdAt: string): number | null {
  if (!createdAt) return null;
  const ms = Date.parse(createdAt);
  return Number.isNaN(ms) ? null : ms;
}

/** An invitation is expired when the API says so OR it is old enough by the
 * fixed clock `now` - never Date.now(), so this whole module stays pure. An
 * unparseable createdAt cannot prove age-based expiry, so it falls back to
 * trusting the (here false) `expired` flag rather than claiming expiry. */
function isInvitationExpired(invitation: RepoInvitation, now: number): boolean {
  if (invitation.expired) return true;
  const created = parseCreatedAt(invitation.createdAt);
  if (created === null) return false;
  return now - created >= EXPIRY_MS;
}

/** createdAt + INVITATION_EXPIRY_DAYS, as ISO - or null when createdAt is
 * absent or unparseable. */
function computeExpiresAt(createdAt: string): string | null {
  const created = parseCreatedAt(createdAt);
  if (created === null) return null;
  return new Date(created + EXPIRY_MS).toISOString();
}

/**
 * Derives one student's invitation-status row from already-fetched facts.
 * States are checked in strict precedence order - the first matching state
 * wins - and every invitation/collaborator lookup below is scoped to THIS
 * student's normalized handle, never "does this repo have any expired/
 * pending invitation at all": a repo can carry another student's stale
 * invite, and that must never leak into this row.
 */
export function resolveInvitationRow(input: StudentRepoStatusInput): StudentRepoInvitationRow {
  const username = normalizeHandle(input.username);
  const usernameKey = username.toLowerCase();
  const repo = `${input.org}/${input.repo}`;
  const repoUrl = `https://github.com/${input.org}/${input.repo}`;

  const row = (
    partial: Pick<StudentRepoInvitationRow, "state" | "label"> &
      Partial<Pick<StudentRepoInvitationRow, "invitationId" | "invitedAt" | "expiresAt" | "detail">>
  ): StudentRepoInvitationRow => ({
    student: input.student,
    username,
    repo,
    repoUrl,
    invitationId: partial.invitationId ?? null,
    invitedAt: partial.invitedAt ?? null,
    expiresAt: partial.expiresAt ?? null,
    detail: partial.detail ?? null,
    state: partial.state,
    label: partial.label,
  });

  // 1. error - a failed lookup must never be reported as a confident state.
  if (input.error) {
    return row({ state: "error", label: STATUS_LABELS.error, detail: input.error });
  }

  // 2. no-username - outranks "missing" because this row is about an
  // invitation, and a handle-less student cannot be invited regardless of
  // what happened to their repo.
  if (!usernameKey) {
    return row({ state: "no-username", label: STATUS_LABELS["no-username"] });
  }

  // 3. missing - the expected repo is not present in the org.
  if (!input.repoExists) {
    return row({ state: "missing", label: STATUS_LABELS.missing });
  }

  // Invitations addressed to THIS student only - a blank invitee login
  // (invitee: null in the API) can never be attributed to anyone.
  const myInvitations = input.invitations.filter((inv) => {
    const inviteeKey = handleKey(inv.inviteeLogin);
    return inviteeKey !== "" && inviteeKey === usernameKey;
  });

  if (myInvitations.length > 0) {
    const expired = myInvitations.find((inv) => isInvitationExpired(inv, input.now));
    const chosen = expired ?? myInvitations[0];
    const state: StudentRepoInvitationState = expired ? "expired" : "pending";
    return row({
      state,
      label: STATUS_LABELS[state],
      invitationId: chosen.id,
      invitedAt: chosen.createdAt || null,
      expiresAt: computeExpiresAt(chosen.createdAt),
    });
  }

  // 6. accepted - no invitation, but a direct collaborator with this handle.
  const isCollaborator = input.collaborators.some((login) => handleKey(login) === usernameKey);
  if (isCollaborator) {
    return row({ state: "accepted", label: STATUS_LABELS.accepted });
  }

  // 7. not-invited - repo exists, no invitation, not a collaborator. Also
  // where an expired invitation that GitHub silently dropped from the list
  // lands - "Invite" is still the right next step.
  return row({ state: "not-invited", label: STATUS_LABELS["not-invited"] });
}

const SUMMARY_ORDER: Array<[StudentRepoInvitationState, string]> = [
  ["accepted", "accepted"],
  ["pending", "pending"],
  ["expired", "expired"],
  ["not-invited", "not invited"],
  ["missing", "no repo"],
  ["no-username", "no username"],
  ["error", "unknown"],
];

/** One-line summary for the panel: "<n> student[s] - " followed by the
 * non-zero counts in a fixed order (accepted, pending, expired, not invited,
 * no repo, no username, unknown), joined by ", ". */
export function summarizeInvitationRows(rows: StudentRepoInvitationRow[]): {
  total: number;
  counts: Record<StudentRepoInvitationState, number>;
  text: string;
} {
  const counts: Record<StudentRepoInvitationState, number> = {
    error: 0,
    "no-username": 0,
    missing: 0,
    expired: 0,
    pending: 0,
    accepted: 0,
    "not-invited": 0,
  };
  for (const r of rows) counts[r.state] += 1;
  const total = rows.length;
  if (total === 0) return { total, counts, text: "No students" };
  const segments = SUMMARY_ORDER.filter(([state]) => counts[state] > 0).map(
    ([state, label]) => `${counts[state]} ${label}`
  );
  const text = `${total} ${total === 1 ? "student" : "students"} - ${segments.join(", ")}`;
  return { total, counts, text };
}

/**
 * Renders a completed `setupStudentRepoAction` call into the one line shown
 * on that student's row. Error text from the action is surfaced verbatim -
 * never replaced with a generic message, since GitHub's own wording (e.g.
 * the 50-invitations-per-repo-per-24-hours 422) is the only useful
 * diagnosis.
 */
export function formatProvisionOutcome(result: ClassroomRowResult, hasUsername: boolean): string {
  if (result.created === "failed") {
    return `Failed: ${result.createError ?? "The repository could not be created."}`;
  }
  const createdText = result.created === "existed" ? "Already existed." : "Created.";
  if (result.invited) {
    return `${createdText} Invited.`;
  }
  if (result.inviteError) {
    return `${createdText} Invitation failed: ${result.inviteError}`;
  }
  if (!hasUsername) {
    return `${createdText} No username, so no invitation was sent.`;
  }
  return createdText;
}

const VALID_STATES = new Set<StudentRepoInvitationState>([
  "error",
  "no-username",
  "missing",
  "expired",
  "pending",
  "accepted",
  "not-invited",
]);

function isWellFormedStoredRow(value: unknown): value is StudentRepoInvitationRow {
  if (!value || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  if (typeof r.student !== "string") return false;
  if (typeof r.username !== "string") return false;
  if (typeof r.repo !== "string") return false;
  if (typeof r.repoUrl !== "string") return false;
  if (typeof r.state !== "string" || !VALID_STATES.has(r.state as StudentRepoInvitationState)) return false;
  if (typeof r.label !== "string") return false;
  if (r.invitationId !== null && typeof r.invitationId !== "number") return false;
  if (r.invitedAt !== null && typeof r.invitedAt !== "string") return false;
  if (r.expiresAt !== null && typeof r.expiresAt !== "string") return false;
  if (r.detail !== null && typeof r.detail !== "string") return false;
  return true;
}

/**
 * Parses the `ta-roster-provision-status-<courseId>` localStorage payload
 * and reconciles it against the CURRENT roster and prefix, defensively (a
 * malformed or unrecognised payload yields an empty list, never a crash).
 * Three ways a stored row can go stale, all handled here:
 * - a student removed from the roster (dropped: no username match);
 * - a student whose handle was edited (same rule: the old key no longer
 *   matches, so the row is dropped and that student starts unresolved);
 * - the repo-name prefix changed, which changes every computed repo name at
 *   once - a prefix mismatch discards the WHOLE stored list.
 */
export function parseStoredStatusRows(
  raw: string | null,
  currentUsernames: string[],
  currentPrefix: string
): { rows: StudentRepoInvitationRow[]; checkedAt: number } {
  const empty = { rows: [] as StudentRepoInvitationRow[], checkedAt: 0 };
  if (!raw) return empty;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.rows)) return empty;
  if (typeof obj.prefix !== "string" || obj.prefix !== currentPrefix) return empty;

  const currentKeys = new Set(currentUsernames.map(handleKey).filter(Boolean));
  const rows = obj.rows
    .filter(isWellFormedStoredRow)
    .filter((r) => currentKeys.has(handleKey(r.username)));

  const checkedAt = typeof obj.checkedAt === "number" && Number.isFinite(obj.checkedAt) ? obj.checkedAt : 0;

  return { rows, checkedAt };
}
