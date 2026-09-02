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
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import type { Course } from "@/lib/supabase/courses";
import { rosterToRows, rowsToRoster } from "@/lib/courses-tab-helpers";
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
import { overlayRosterUsernames, canonicalNameKey } from "@/app/components/repo-grades/rosterUsernameOverlay";
import {
  filterRosterProvisionRows,
  sortRosterProvisionRows,
  rosterProvisionFilterIsActive,
  ariaSortForField,
  toggleRosterProvisionSort,
  DEFAULT_ROSTER_PROVISION_SORT,
  type RosterProvisionRow,
  type RosterProvisionFilter,
  type RosterProvisionSortState,
} from "@/lib/roster-provision-table";
import styles from "../../page.module.css";
import tableStyles from "./CoursesTable.module.css";

export interface StudentRepoRosterProps {
  course: Course;
  ownedRepos: string[] | null;
  /** Bumped by RosterCell's complement badge (R5 - "N with no GitHub
   * username" as a one-click filter). Any change (including the value
   * already being positive on first mount, e.g. the badge triggered this
   * panel's very first expand) arms the "Needs a GitHub username" filter
   * and clears the others, so the badge's promise ("expands the panel
   * already filtered to the un-handled students") holds whether this panel
   * is mounting fresh or was already open. */
  focusUnhandledSignal?: number;
}

type RowState = StudentRepoInvitationState | "unresolved";

function rosterFilterStorageKey(field: string, courseId: string): string {
  return `ta-roster-provision-filter-${field}-${courseId}`;
}

function usePersistedBoolean(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => {
    if (typeof window === "undefined") return fallback;
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : stored === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(key, value ? "1" : "0");
  }, [key, value]);
  return [value, setValue] as const;
}

function sortStorageKey(courseId: string): string {
  return `ta-roster-provision-sort-${courseId}`;
}

function parseStoredSort(raw: string | null): RosterProvisionSortState {
  if (!raw) return DEFAULT_ROSTER_PROVISION_SORT;
  try {
    const parsed = JSON.parse(raw) as Partial<RosterProvisionSortState>;
    if (
      (parsed.field === "student" || parsed.field === "username" || parsed.field === "status") &&
      (parsed.direction === "asc" || parsed.direction === "desc")
    ) {
      return { field: parsed.field, direction: parsed.direction };
    }
  } catch {
    // Malformed/foreign value - fall back rather than throw.
  }
  return DEFAULT_ROSTER_PROVISION_SORT;
}

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
    // R11: "no-username" and "not-invited" used to share ghBadgeNeutral -
    // one appearance for two states that mean opposite things (ours vs
    // GitHub's). "missing" ("No repo yet") stays neutral alongside
    // "not-invited" below; only the roster's own gap gets the warning
    // treatment.
    case "no-username":
      return styles.ghBadgeWarning;
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
            {busy ? "Working…" : "Resend"}
          </button>
          <button
            type="button"
            className={`${styles.linkButton} ${tableStyles.dangerLink}`}
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
            {busy ? "Working…" : "Cancel invitation"}
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
          {busy ? "Working…" : "Invite"}
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
        {busy ? "Working…" : label}
      </button>
      {configReason && <p className={tableStyles.rosterActionReason}>{configReason}</p>}
      {outcome && <p className={tableStyles.rosterOutcome}>{outcome}</p>}
    </div>
  );
}

export function StudentRepoRoster({ course, ownedRepos, focusUnhandledSignal }: StudentRepoRosterProps) {
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

  // R7: the roster's OWN text is not the only place a username lives - a
  // student's Canvas submission may already have written one onto
  // course.studentRepos (buildRosterUpdate, roster-merge.ts) without the
  // instructor ever typing it into this tile. overlayRosterUsernames folds
  // roster -> studentRepos; used here in reverse (read direction) via
  // canonicalNameKey, so a roster row with a blank username can borrow one
  // that studentRepos already has for the same student, marked `fromCanvas`
  // for display. rosterRows itself (order/index) is NEVER reordered by
  // this - only the username shown/used for a row that had none.
  const overlay = useMemo(
    () => overlayRosterUsernames(course.studentRepos ?? [], course.roster ?? null),
    [course.studentRepos, course.roster]
  );
  const usernameByCanonicalName = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of overlay.rows) {
      const key = canonicalNameKey(row.student);
      const username = (row.username ?? "").trim();
      if (key && username && !map.has(key)) map.set(key, username);
    }
    return map;
  }, [overlay]);
  const effectiveRosterRows = useMemo(
    () =>
      rosterRows.map((r) => {
        if (r.username.trim()) return { student: r.student, username: r.username, fromCanvas: false };
        const found = usernameByCanonicalName.get(canonicalNameKey(r.student));
        return found ? { student: r.student, username: found, fromCanvas: true } : { student: r.student, username: r.username, fromCanvas: false };
      }),
    [rosterRows, usernameByCanonicalName]
  );
  // Fed to the poll hook so status resolution/repo naming see the SAME
  // effective username the table displays - otherwise a row shown with a
  // "(from Canvas)" handle would still report "No username" underneath it.
  // rowsToRoster can drop a row only when BOTH fields are blank, which
  // effectiveRosterRows never introduces (it only ever fills a blank
  // username, never touches student) - the one pre-existing edge case (a
  // roster line with neither field, e.g. a bare "|") is inherited from
  // rosterToRows itself, not introduced here.
  const effectiveRosterText = useMemo(
    () => rowsToRoster(effectiveRosterRows.map(({ student, username }) => ({ student, username }))),
    [effectiveRosterRows]
  );

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
  } = useStudentRepoInvitations({ active: true, courseId: course.id, org, prefix, rosterText: effectiveRosterText });

  // R12: search text and the two state checkboxes persist per course
  // (every new textbox/select/checkbox does); sort persists too, matching
  // WeeklyChecklistOverviewModal's own precedent for a sortable table.
  const [search, setSearch] = usePersistedString(rosterFilterStorageKey("search", course.id), "");
  const [needsUsername, setNeedsUsername] = usePersistedBoolean(rosterFilterStorageKey("needs-username", course.id), false);
  const [needsRepo, setNeedsRepo] = usePersistedBoolean(rosterFilterStorageKey("needs-repo", course.id), false);
  const [sort, setSort] = useState<RosterProvisionSortState>(() =>
    typeof window === "undefined" ? DEFAULT_ROSTER_PROVISION_SORT : parseStoredSort(localStorage.getItem(sortStorageKey(course.id)))
  );
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem(sortStorageKey(course.id), JSON.stringify(sort));
  }, [course.id, sort]);

  // R5: the Roster cell's complement badge ("N with no GitHub username")
  // bumps this on every click - including the very first, whether this
  // panel is mounting fresh (the badge itself just triggered View) or was
  // already open. Effects run on mount too, so a positive value already
  // present at mount arms the filter exactly the same way a later change
  // does.
  useEffect(() => {
    if (!focusUnhandledSignal) return;
    setNeedsUsername(true);
    setNeedsRepo(false);
    setSearch("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusUnhandledSignal]);

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

  // R12: filtering/sorting is PRESENTATION ONLY. `i` is tagged onto every
  // row HERE, from `effectiveRosterRows` (the true, unfiltered roster
  // order) - filterRosterProvisionRows/sortRosterProvisionRows below only
  // ever reorder/drop entries of THIS array, so `i` always stays the row's
  // real position no matter how the display is filtered or sorted. Nothing
  // downstream (rowKey, provisionRow/inviteOrResendRow/revokeRow, the
  // AC3.5a 80-row budget) ever sees a recomputed index - useStudentRepoInvitations
  // itself is never told about the filter/sort at all (rosterText above is
  // always the full, unfiltered effective roster).
  const indexedRows: RosterProvisionRow[] = useMemo(
    () =>
      effectiveRosterRows.map((r, i) => {
        const key = rowKey(r.student, r.username, i);
        const resolved = resolvedByKey.get(key) ?? null;
        const state: RowState = resolved?.state ?? "unresolved";
        return { i, student: r.student, username: normalizeHandle(r.username), state };
      }),
    [effectiveRosterRows, resolvedByKey]
  );
  const activeFilter: RosterProvisionFilter = useMemo(
    () => ({ search, needsUsername, needsRepo }),
    [search, needsUsername, needsRepo]
  );
  const filterActive = rosterProvisionFilterIsActive(activeFilter);
  const displayedRows = useMemo(
    () => sortRosterProvisionRows(filterRosterProvisionRows(indexedRows, activeFilter), sort),
    [indexedRows, activeFilter, sort]
  );

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
      <p className={styles.fieldHint}>
        Invitations expire after {INVITATION_EXPIRY_DAYS} days.
      </p>

      <div className={tableStyles.rosterSummaryRow}>
        <span>{summary.text}</span>
        <span>{formatCheckedAt(checkedAt, now)}</span>
        {notChecked > 0 && <span>{notChecked} more student{notChecked === 1 ? "" : "s"} not checked this refresh.</span>}
        {refreshError && <span className={tableStyles.dangerLink}>{refreshError}</span>}
        <button type="button" className={styles.linkButton} disabled={checking} onClick={() => refresh()}>
          {checking ? "Refreshing…" : "Refresh"}
        </button>
        <button type="button" className={styles.linkButton} onClick={() => setAutoRefresh((v) => !v)}>
          {autoRefresh ? "Pause auto-refresh" : "Resume auto-refresh"}
        </button>
      </div>

      {/* R12: presentation-only filtering, modelled on
          WeeklyChecklistOverviewModal.tsx's own search + checkbox toolbar
          (TasksToolbar.tsx's FormControlLabel+Checkbox idiom, not chips).
          summary.text above is a frozen contract and is NEVER touched by
          this - the "Showing N of M" line below is additive, shown only
          while a filter is active. */}
      <div className={tableStyles.rowSm}>
        <TextField
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search students…"
          sx={{ minWidth: 160, flex: "1 1 160px" }}
          slotProps={{ htmlInput: { "aria-label": "Search the provisioning table" } }}
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={needsUsername} onChange={(e) => setNeedsUsername(e.target.checked)} />}
          label="Needs a GitHub username"
        />
        <FormControlLabel
          control={<Checkbox size="small" checked={needsRepo} onChange={(e) => setNeedsRepo(e.target.checked)} />}
          label="No repo yet"
        />
      </div>
      {filterActive && (
        <p className={styles.fieldHint}>
          Showing {displayedRows.length} of {effectiveRosterRows.length} student{effectiveRosterRows.length === 1 ? "" : "s"}.
        </p>
      )}

      <div ref={liveRegionRef} role="status" aria-live="polite" className={tableStyles.focusAnnouncement} />

      <div className={tableStyles.rosterTableWrap}>
        <table className={tableStyles.rosterTable} aria-busy={checking}>
          <caption className={tableStyles.focusAnnouncement}>
            Student repository and invitation status for {course.name}
          </caption>
          <thead>
            <tr>
              {/* R12: aria-sort on Student/GitHub username/Status, copying
                  WeeklyChecklistOverviewModal.tsx's sortable-header idiom.
                  Repository/Action stay plain headers - there is no
                  meaningful sort on a computed repo name or an action
                  button. */}
              <th
                scope="col"
                aria-sort={ariaSortForField(sort, "student")}
                className={tableStyles.sortableHeader}
                onClick={() => setSort((s) => toggleRosterProvisionSort(s, "student"))}
              >
                Student
              </th>
              <th
                scope="col"
                aria-sort={ariaSortForField(sort, "username")}
                className={tableStyles.sortableHeader}
                onClick={() => setSort((s) => toggleRosterProvisionSort(s, "username"))}
              >
                GitHub username
              </th>
              <th scope="col">Repository</th>
              <th
                scope="col"
                aria-sort={ariaSortForField(sort, "status")}
                className={tableStyles.sortableHeader}
                onClick={() => setSort((s) => toggleRosterProvisionSort(s, "status"))}
              >
                Status
              </th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map(({ i }) => {
              const r = effectiveRosterRows[i];
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
                      <>
                        <span className={styles.ghMetaMono}>{handle}</span>
                        {r.fromCanvas && <span className={styles.ghMeta}> (from Canvas)</span>}
                      </>
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
                      <span className={styles.courseResourceEmpty}>Checking…</span>
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
