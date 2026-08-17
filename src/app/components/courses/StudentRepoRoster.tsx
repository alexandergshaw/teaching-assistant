"use client";

// F1/F2/F3: the per-student table that replaces RosterCell's old raw-line
// .rosterPreview when a roster with entries is expanded, plus the small
// settings strip its provisioning inputs come from. See
// docs/org-student-repo-provisioning-acceptance-criteria.md for the full
// acceptance criteria this file implements (F1-F3, AC5.1 accessibility).
//
// Wave A (src/lib/student-repo-names.ts, src/lib/github.invitations.ts) and
// Wave B (src/lib/student-repo-status.ts, src/app/actions/github-student-repos.ts)
// were written concurrently with this file, against the acceptance
// criteria's "Frozen signatures" block. Nothing here reimplements them.
import { useEffect, useMemo, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import type { Course } from "@/lib/supabase/courses";
import { rosterToRows } from "@/lib/courses-tab-helpers";
import { repoSlug, studentRepoName } from "@/lib/student-repo-names";
import {
  STATUS_LABELS,
  INVITATION_EXPIRY_DAYS,
  summarizeInvitationRows,
  type StudentRepoInvitationRow,
  type StudentRepoInvitationState,
} from "@/lib/student-repo-status";
import type { RepoPermission } from "@/lib/github";
import { useStudentRepoInvitations, rowKey } from "./useStudentRepoInvitations";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

export interface StudentRepoRosterProps {
  course: Course;
  ownedRepos: string[] | null;
}

type RowState = StudentRepoInvitationState | "unresolved";

const ACCESS_OPTIONS: Array<{ value: RepoPermission; label: string }> = [
  { value: "push", label: "Push (default)" },
  { value: "pull", label: "Pull (read-only)" },
  { value: "maintain", label: "Maintain" },
];

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private (default)" },
  { value: "public", label: "Public" },
];

function normalizeHandle(u: string): string {
  return u.trim().replace(/^@/, "");
}

function fieldStorageKey(field: string, courseId: string): string {
  return `ta-roster-provision-${field}-${courseId}`;
}

/** Seeds from and writes back to a `ta-roster-provision-<field>-<courseId>`
 * key (AC2.3). `??` (not `||`) so a value the user deliberately cleared to
 * "" stays cleared across reloads instead of reverting to the default. */
function usePersistedString(key: string, fallback: string) {
  const [value, setValue] = useState(() => (typeof window === "undefined" ? fallback : localStorage.getItem(key) ?? fallback));
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(key, value);
  }, [key, value]);
  return [value, setValue] as const;
}

function badgeClassFor(state: StudentRepoInvitationState): string {
  switch (state) {
    case "accepted":
      return styles.ghBadgeSuccess;
    case "pending":
      return styles.ghBadgeWarning;
    case "expired":
    case "error":
      return styles.ghBadgeDanger;
    default:
      return styles.ghBadgeNeutral;
  }
}

function formatCheckedAt(checkedAt: number | null, now: number): string {
  if (!checkedAt) return "Not checked yet";
  const minutes = Math.round((now - checkedAt) / 60000);
  if (minutes < 1) return "Checked just now";
  if (minutes === 1) return "Checked 1 minute ago";
  if (minutes < 60) return `Checked ${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return "Checked 1 hour ago";
  return `Checked ${hours} hours ago`;
}

function formatExpiresIn(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now;
  if (Number.isNaN(ms)) return "";
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days <= 0) return "expires today";
  if (days === 1) return "expires in 1 day";
  return `expires in ${days} days`;
}

interface ActionCellProps {
  studentLabel: string;
  state: RowState;
  resolved: StudentRepoInvitationRow | null;
  orgMissing: boolean;
  templateMissing: boolean;
  busy: boolean;
  outcome?: string;
  onProvision: () => void;
  onInviteOrResend: () => void;
  onRevoke: (invitationId: number) => void;
}

function ActionCell({
  studentLabel,
  state,
  resolved,
  orgMissing,
  templateMissing,
  busy,
  outcome,
  onProvision,
  onInviteOrResend,
  onRevoke,
}: ActionCellProps) {
  if (state === "accepted") {
    return outcome ? <p className={tableStyles.rosterOutcome}>{outcome}</p> : null;
  }

  if (state === "pending" || state === "expired") {
    const invitationId = resolved?.invitationId ?? null;
    return (
      <div className={tableStyles.rosterActionCell}>
        <div className={tableStyles.rosterActionButtons}>
          <button
            type="button"
            className={styles.linkButton}
            aria-label={`Resend invitation for ${studentLabel}`}
            aria-disabled={orgMissing || undefined}
            disabled={busy}
            onClick={() => {
              if (orgMissing || busy) return;
              onInviteOrResend();
            }}
          >
            {busy ? "Working..." : "Resend"}
          </button>
          <button
            type="button"
            className={styles.linkButton}
            style={{ color: "var(--danger)" }}
            aria-label={`Cancel invitation for ${studentLabel}`}
            aria-disabled={orgMissing || undefined}
            disabled={busy}
            onClick={() => {
              if (orgMissing || busy || invitationId === null) return;
              if (
                window.confirm(
                  `Cancel the invitation for "${studentLabel}"? A new invitation would be needed afterward to give them access.`
                )
              ) {
                onRevoke(invitationId);
              }
            }}
          >
            {busy ? "Working..." : "Cancel invitation"}
          </button>
        </div>
        {orgMissing && <p className={tableStyles.rosterActionReason}>Set the course&apos;s Organization first.</p>}
        {outcome && <p className={tableStyles.rosterOutcome}>{outcome}</p>}
      </div>
    );
  }

  if (state === "not-invited") {
    return (
      <div className={tableStyles.rosterActionCell}>
        <button
          type="button"
          className={styles.linkButton}
          aria-label={`Invite ${studentLabel}`}
          aria-disabled={orgMissing || undefined}
          disabled={busy}
          onClick={() => {
            if (orgMissing || busy) return;
            onInviteOrResend();
          }}
        >
          {busy ? "Working..." : "Invite"}
        </button>
        {orgMissing && <p className={tableStyles.rosterActionReason}>Set the course&apos;s Organization first.</p>}
        {outcome && <p className={tableStyles.rosterOutcome}>{outcome}</p>}
      </div>
    );
  }

  // "unresolved" (AC2.1b) | "missing" | "error" | "no-username": the safe
  // re-runnable create path. Only its label changes for no-username
  // (AC2.1a) - the repo is still created, the invite half is just skipped.
  const label = state === "no-username" ? "Create repo" : "Create repo and invite";
  const configReason = orgMissing
    ? "Set the course's Organization first."
    : templateMissing
      ? "Choose a template repository first."
      : null;
  return (
    <div className={tableStyles.rosterActionCell}>
      <button
        type="button"
        className={styles.linkButton}
        aria-label={`${label} for ${studentLabel}`}
        aria-disabled={Boolean(configReason) || undefined}
        disabled={busy}
        onClick={() => {
          if (configReason || busy) return;
          onProvision();
        }}
      >
        {busy ? "Working..." : label}
      </button>
      {configReason && <p className={tableStyles.rosterActionReason}>{configReason}</p>}
      {outcome && <p className={tableStyles.rosterOutcome}>{outcome}</p>}
    </div>
  );
}

export function StudentRepoRoster({ course, ownedRepos }: StudentRepoRosterProps) {
  const [templateRepo, setTemplateRepo] = usePersistedString(fieldStorageKey("template", course.id), "");
  const [prefix, setPrefix] = usePersistedString(
    fieldStorageKey("prefix", course.id),
    repoSlug(course.courseCode || course.name)
  );
  const [accessRaw, setAccessRaw] = usePersistedString(fieldStorageKey("access", course.id), "push");
  const [visibility, setVisibility] = usePersistedString(fieldStorageKey("visibility", course.id), "private");
  const permission: RepoPermission = accessRaw === "pull" || accessRaw === "maintain" ? accessRaw : "push";

  const org = (course.githubOrg ?? "").trim();
  const rosterRows = useMemo(() => rosterToRows(course.roster ?? ""), [course.roster]);

  const {
    rows,
    checkedAt,
    checking,
    notChecked,
    refreshError,
    autoRefresh,
    setAutoRefresh,
    busyRowKey,
    outcomes,
    refresh,
    provisionRow,
    inviteOrResendRow,
    revokeRow,
  } = useStudentRepoInvitations({ active: true, courseId: course.id, org, prefix, rosterText: course.roster ?? "" });

  const resolvedByKey = useMemo(() => {
    const map = new Map<string, StudentRepoInvitationRow>();
    // `rows` is a same-order prefix of the roster (capped at
    // MAX_ROSTER_ROWS) ONLY when it just came back from a server refresh.
    // Rows seeded from localStorage are NOT: parseStoredStatusRows filters
    // them (dropping students no longer on the roster, and dropping every
    // handle-less row outright, since its key set is built with
    // `.filter(Boolean)`), so position `i` here can land anywhere relative
    // to `rosterRows`. That is safe only because every row able to survive
    // that filter has a username, and rowKey's handle branch (`u:${handle}`)
    // ignores `i` entirely - it is only the handle-less branch
    // (`s:${student}:${index}`) that depends on the index lining up, and it
    // never appears in a localStorage-seeded list. If that filter is ever
    // changed to admit handle-less rows, this mapping would start keying
    // busy/outcome state onto the wrong student.
    rows.forEach((r, i) => map.set(rowKey(r.student, r.username, i), r));
    return map;
  }, [rows]);

  const summary = useMemo(() => summarizeInvitationRows(rows), [rows]);

  // A visually hidden role="status" region, present and EMPTY in the
  // initial markup (AC5.1) - injecting it together with its content tends
  // never to announce at all. It receives ONLY the one-line summary, only
  // when the summary text actually changes, and is cleared shortly after
  // each write so an identical next message still announces. Never moves
  // focus.
  const liveRegionRef = useRef<HTMLDivElement>(null);
  const announcedRef = useRef("");
  useEffect(() => {
    if (summary.text === announcedRef.current) return;
    const text = summary.text;
    const writeTimer = setTimeout(() => {
      announcedRef.current = text;
      const el = liveRegionRef.current;
      if (!el) return;
      el.textContent = text;
      setTimeout(() => {
        if (liveRegionRef.current === el) el.textContent = "";
      }, 4000);
    }, 250);
    return () => clearTimeout(writeTimer);
  }, [summary.text]);

  // Keeps "Checked <time>" ageing honestly even while paused and nothing
  // else is re-rendering the panel (AC3.6b).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  if (rosterRows.length === 0) {
    return <span className={styles.courseResourceEmpty}>Not set</span>;
  }

  return (
    <div className={tableStyles.rosterProvisionPanel}>
      <div className={tableStyles.rosterSettingsStrip}>
        <Autocomplete
          freeSolo
          options={ownedRepos ?? []}
          value={templateRepo}
          onInputChange={(_, v) => setTemplateRepo(v)}
          sx={{ minWidth: 200, flex: 1 }}
          renderInput={(params) => (
            <TextField {...params} size="small" label="Template repository" placeholder="owner/name" />
          )}
        />
        <TextField
          size="small"
          label="Repo name prefix"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          sx={{ width: 160 }}
          className={tableStyles.rosterSettingsField}
        />
        <TextField
          size="small"
          select
          label="Student access"
          value={permission}
          onChange={(e) => setAccessRaw(e.target.value)}
          sx={{ width: 160 }}
          className={tableStyles.rosterSettingsField}
        >
          {ACCESS_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          select
          label="Visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
          sx={{ width: 140 }}
          className={tableStyles.rosterSettingsField}
        >
          {VISIBILITY_OPTIONS.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      </div>
      <p className={styles.fieldHint} style={{ margin: 0 }}>
        Invitations expire after {INVITATION_EXPIRY_DAYS} days.
      </p>

      <div className={tableStyles.rosterSummaryRow}>
        <span>{summary.text}</span>
        <span>{formatCheckedAt(checkedAt, now)}</span>
        {notChecked > 0 && <span>{notChecked} more student{notChecked === 1 ? "" : "s"} not checked this refresh.</span>}
        {refreshError && <span style={{ color: "var(--danger)" }}>{refreshError}</span>}
        <button type="button" className={styles.linkButton} disabled={checking} onClick={() => refresh()}>
          {checking ? "Refreshing..." : "Refresh"}
        </button>
        <button type="button" className={styles.linkButton} onClick={() => setAutoRefresh((v) => !v)}>
          {autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
        </button>
      </div>

      <div ref={liveRegionRef} role="status" aria-live="polite" className={tableStyles.focusAnnouncement} />

      <div className={tableStyles.rosterTableWrap}>
        <table className={tableStyles.rosterTable} aria-busy={checking}>
          <caption className={tableStyles.focusAnnouncement}>
            Student repository and invitation status for {course.name}
          </caption>
          <thead>
            <tr>
              <th scope="col">Student</th>
              <th scope="col">GitHub username</th>
              <th scope="col">Repository</th>
              <th scope="col">Status</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {rosterRows.map((r, i) => {
              const key = rowKey(r.student, r.username, i);
              const handle = normalizeHandle(r.username);
              const resolved = resolvedByKey.get(key) ?? null;
              const state: RowState = resolved?.state ?? "unresolved";
              const repoName = studentRepoName(prefix, r.student, r.username);
              const linkable =
                resolved !== null &&
                (state === "pending" || state === "expired" || state === "accepted" || state === "not-invited");
              const busy = busyRowKey === key;
              const outcome = outcomes[key];
              const studentLabel = r.student.trim() || handle || "this student";

              return (
                <tr key={`${key}-${i}`}>
                  <th scope="row">{r.student}</th>
                  <td>
                    {handle ? (
                      <span className={styles.ghMetaMono}>{handle}</span>
                    ) : (
                      <span className={styles.courseResourceEmpty}>Not set</span>
                    )}
                  </td>
                  <td>
                    {linkable ? (
                      <a
                        className={styles.ghMetaMono}
                        href={resolved!.repoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {repoName}
                      </a>
                    ) : (
                      <span className={styles.ghMetaMono}>{repoName}</span>
                    )}
                  </td>
                  <td>
                    {state === "unresolved" ? (
                      <span className={styles.courseResourceEmpty}>Checking...</span>
                    ) : (
                      <span className={`${styles.ghBadge} ${badgeClassFor(state)}`}>{STATUS_LABELS[state]}</span>
                    )}
                    {resolved?.state === "pending" && resolved.expiresAt && (
                      <p className={tableStyles.rosterActionReason}>{formatExpiresIn(resolved.expiresAt, now)}</p>
                    )}
                    {resolved?.detail && <p className={tableStyles.rosterActionReason}>{resolved.detail}</p>}
                  </td>
                  <td>
                    <ActionCell
                      studentLabel={studentLabel}
                      state={state}
                      resolved={resolved}
                      orgMissing={!org}
                      templateMissing={!templateRepo.trim()}
                      busy={busy}
                      outcome={outcome}
                      onProvision={() =>
                        void provisionRow(r.student, r.username, i, {
                          templateRepo: templateRepo.trim(),
                          isPrivate: visibility === "private",
                          permission,
                        })
                      }
                      onInviteOrResend={() => void inviteOrResendRow(r.student, r.username, i, repoName, permission)}
                      onRevoke={(invitationId) => void revokeRow(r.student, r.username, i, repoName, invitationId)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
