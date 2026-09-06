"use client";

// The interactive half of the owner's account list (docs/account-people-copy.md).
// Receives already-judged rows as props - every rule (the allowlist override,
// the ownership badge, the clamped display name, the attribution actor, and a
// verdict for each of the five actions) was already decided by
// buildAccountRows (src/lib/account-people-view.ts), server-side, in
// page.tsx. This file's only job is layout, copy, and the interaction loop
// around the five server actions: confirmation dialogs, busy state, and
// per-row feedback. It recomputes none of the rules it renders.
import {
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import type { AccountRow } from "@/lib/account-people-view";
import type { AccountAction } from "@/lib/account-admin-rules";
import {
  approveAccountAction,
  suspendAccountAction,
  restoreAccountAction,
  promoteAccountAction,
  demoteAccountAction,
  type AccountActionResult,
} from "./actions";
import { ModalShell } from "../../components/ui/ModalShell";
import securityStyles from "../security/security.module.css";
import styles from "./people.module.css";

// Rendered left-to-right in this order on every row - matches
// docs/account-people-copy.md's own "Action buttons" table order, not
// ACCOUNT_ACTIONS's declaration order (approve, demote, promote, restore,
// suspend), which is alphabetised for a different purpose in that module.
const ACTION_ORDER: readonly AccountAction[] = ["approve", "suspend", "restore", "promote", "demote"];

const ACTION_LABELS: Record<AccountAction, string> = {
  approve: "Approve",
  suspend: "Suspend",
  restore: "Restore",
  promote: "Make owner",
  demote: "Remove owner",
};

const ACTION_BUSY_LABELS: Record<AccountAction, string> = {
  approve: "Approving...",
  suspend: "Suspending...",
  restore: "Restoring...",
  promote: "Making owner...",
  demote: "Removing owner...",
};

// Restore needs no confirmation (docs/account-people-copy.md's "Action
// buttons" table) - it only ever moves a row TOWARDS access.
const ACTIONS_REQUIRING_CONFIRMATION = new Set<AccountAction>(["approve", "suspend", "promote", "demote"]);

const ACTION_FUNCTIONS: Record<AccountAction, (accountId: string) => Promise<AccountActionResult>> = {
  approve: approveAccountAction,
  suspend: suspendAccountAction,
  restore: restoreAccountAction,
  promote: promoteAccountAction,
  demote: demoteAccountAction,
};

// Reuses the settings-area button vocabulary (security.module.css) rather
// than inventing a new one: approve/promote read as the "primary" affordance,
// restore as neutral, suspend/demote as the "remove" (danger) treatment
// already used for irreversible-feeling actions elsewhere in this app area.
const ACTION_BUTTON_CLASS: Record<AccountAction, string> = {
  approve: securityStyles.primary,
  suspend: securityStyles.remove,
  restore: securityStyles.secondary,
  promote: securityStyles.secondary,
  demote: securityStyles.remove,
};

/**
 * The actions that open a confirmation dialog. NOT every AccountAction:
 * `restore` is deliberately immediate, because it only moves a row toward
 * access and there is nothing to warn about.
 *
 * This is a named type rather than an inline union so that the three maps
 * below and ConfirmDialog's own prop all key on the SAME thing. Adding a
 * sixth confirming action then fails to compile in every one of those places
 * at once, which is the point - an earlier version cast `pendingAction` to
 * the inline union at the call site, and a cast would have let a new action
 * through to render a dialog with an undefined title and no body.
 */
type ConfirmingAction = "approve" | "suspend" | "promote" | "demote";

function isConfirmingAction(action: AccountAction): action is ConfirmingAction {
  return action === "approve" || action === "suspend" || action === "promote" || action === "demote";
}

const DIALOG_TITLES: Record<ConfirmingAction, string> = {
  approve: "Approve this account?",
  suspend: "Suspend this account?",
  promote: "Make this account an owner?",
  demote: "Remove owner access?",
};

// docs/account-people-copy.md gives an explicit "Buttons: Cancel / Approve
// account" and "Cancel / Suspend account" for C0/C6, but the promote/demote
// section never states its dialog's own button labels the same way - see
// this component's final report note. Reusing the action-button labels
// already specified in the copy sheet's own "Action buttons" table ("Make
// owner" / "Remove owner") is the smallest, most consistent choice available
// rather than inventing new wording.
const DIALOG_CONFIRM_LABELS: Record<ConfirmingAction, string> = {
  approve: "Approve account",
  suspend: "Suspend account",
  promote: "Make owner",
  demote: "Remove owner",
};

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Formats an ISO timestamp deterministically, independent of the server's or
 * the viewer's own local time zone (fixed at "UTC"). This is a client
 * component rendered as part of a server-rendered tree: a format that reads
 * the runtime's local zone would make the server's HTML and the browser's
 * hydration pass disagree the moment either machine's zone differs from the
 * other, which for a Vercel deployment is the common case, not an edge one.
 */
function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return `${TIMESTAMP_FORMATTER.format(parsed)} UTC`;
}

function roleLabel(role: AccountRow["effectiveRole"]): string {
  return role === "owner" ? "Owner" : "Instructor";
}

function statusLabel(status: AccountRow["effectiveStatus"]): string {
  if (status === "pending") return "Pending";
  if (status === "suspended") return "Suspended";
  return "Active";
}

interface OwnershipBadge {
  text: string;
  /** "success" for the confirmed allowlist owner, "warning" for the
   * unverified claim - drives which existing pill treatment
   * (security.module.css's .pill vs .pillPending) is reused. */
  tone: "success" | "warning";
  /** The full tooltip/warning text, rendered as a VISIBLE secondary line
   * (never a hover-only title attribute) - docs/account-people-copy.md's
   * "The allowlist badge (GC2)" section. */
  detail: string;
}

/**
 * The GC2 ownership badge, exactly as docs/account-people-copy.md's "The
 * allowlist badge" section specifies it - three cases, never recomputed here
 * beyond picking which fixed strings to show for the case buildAccountRows
 * already decided (row.ownership). Case C ("not allowlisted at all") and the
 * plain "stored" case both render no badge at all, per that section.
 */
function ownershipBadge(row: AccountRow): OwnershipBadge | null {
  if (row.ownership === "allowlist") {
    const detail = row.storedDiffersFromEffective
      ? "This address is an owner because it is in the OWNER_EMAILS environment variable and " +
        "has confirmed it can receive mail. That is decided before the database is read, so it " +
        "does not depend on the stored role and status shown in the muted line below. Stored " +
        `record still says ${row.storedRole} / ${row.storedStatus}. This corrects itself ` +
        "automatically the next time this account is used elsewhere in the app."
      : "This address is an owner because it is in the OWNER_EMAILS environment variable and " +
        "has confirmed it can receive mail. That is decided before the database is read, so it " +
        "does not depend on the stored role and status shown in the muted line below.";
    return { text: "Owner via OWNER_EMAILS", tone: "success", detail };
  }
  if (row.ownership === "allowlistUnverified") {
    return {
      text: "Owner allowlist - not confirmed",
      tone: "warning",
      detail:
        "This address is listed in OWNER_EMAILS, but nobody has confirmed they can receive mail " +
        "at it. Until that happens, this account is NOT an owner - the role and status shown are " +
        "its real, current values, and this app cannot promote it early. If this is not the " +
        "address's real owner, they will continue to hold this account until the real owner " +
        "confirms the address themselves or you remove it from OWNER_EMAILS.",
    };
  }
  return null;
}

/**
 * The "Last status change" cell (docs/account-people-copy.md's "Attribution
 * (C7)" table). buildAccountRows already resolved `statusChangedByActor` -
 * including substituting the "never" case for a row nothing has ever
 * happened to - so this function only maps that finished judgement to text,
 * never re-derives it from the two raw fields itself.
 */
function statusChangeText(row: AccountRow): string {
  const actor = row.statusChangedByActor;
  if (actor.kind === "never" || row.statusChangedAt === null) {
    return "Never changed";
  }
  const when = formatTimestamp(row.statusChangedAt);
  const who =
    actor.kind === "system" ? "Automatically" : actor.kind === "person" ? actor.email : "An administrator";
  return `${when} - ${who}`;
}

/**
 * The four confirmation dialogs' body paragraphs, verbatim from
 * docs/account-people-copy.md, branching only on whether the row has an
 * email (every dialog there gives both an email-present and a no-email
 * body). The GC6 "this address has not been confirmed" paragraph is
 * deliberately never added here - see that section's own note: it can only
 * be shown when the page can tell whether the auth email is confirmed, and
 * AccountRow (the one shape this component reads) carries no such field, so
 * per that note's own instruction the first paragraph stands alone rather
 * than being softened to compensate.
 */
function dialogBodyParagraphs(action: ConfirmingAction, email: string | null): string[] {
  const who = email;
  switch (action) {
    case "approve":
      return [
        who
          ? `${who} will get the same access to connected services that you have. That includes ` +
            "your Canvas token, your GitHub token with read and write access to private " +
            "repositories, your cloned voice, and your avatar likeness."
          : "This account will get the same access to connected services that you have. That " +
            "includes your Canvas token, your GitHub token with read and write access to private " +
            "repositories, your cloned voice, and your avatar likeness.",
        "Per-account credentials do not exist yet, so this access cannot currently be narrowed. " +
          "Approve only someone you would give those credentials to directly.",
        "Approving sends no email or notification of any kind. If this person is expecting to " +
          "hear back from you, you need to tell them yourself.",
      ];
    case "suspend":
      return [
        who
          ? `${who} will not be able to sign in again once this completes. If they are already ` +
            "signed in somewhere, that session is not forced out - it keeps working until it " +
            "naturally expires, which is a setting on your Supabase project, not something this " +
            "app controls or can shorten from here."
          : "This account will not be able to sign in again once this completes. If it is already " +
            "signed in somewhere, that session is not forced out - it keeps working until it " +
            "naturally expires, which is a setting on your Supabase project, not something this " +
            "app controls or can shorten from here.",
        "You can restore the account afterwards.",
      ];
    case "promote":
      return [
        who
          ? `${who} will be able to approve, suspend and remove other accounts, including yours.`
          : "This account will be able to approve, suspend and remove other accounts, including yours.",
      ];
    case "demote":
      return [
        who
          ? `${who} keeps their access to the workspace - only the ability to manage other ` +
            "accounts is removed."
          : "This account keeps its access to the workspace - only the ability to manage other " +
            "accounts is removed.",
      ];
  }
}

function successText(action: AccountAction, email: string | null): string {
  switch (action) {
    case "approve":
      return email ? `${email} approved.` : "Account approved.";
    case "suspend":
      return email ? `${email} suspended.` : "Account suspended.";
    case "restore":
      return email ? `${email} restored.` : "Account restored.";
    case "promote":
      return email ? `${email} is now an owner.` : "Account is now an owner.";
    case "demote":
      return email ? `Owner access removed from ${email}.` : "Owner access removed.";
  }
}

// The one fixed message for a post-click refusal (docs/account-people-copy.md,
// "Refused because the account changed after the page loaded"). A button is
// only ever clickable when the render-time verdict said allowed, so the ONLY
// way this outcome is reached at all is exactly this race - the raw rule
// string the server re-checked against (AccountActionResult's "refused"
// case) is deliberately not surfaced here, matching the copy sheet, which
// gives this single fixed explanation rather than the underlying reason.
const STALE_REFUSAL_TEXT =
  "This could not be completed. The account, or the number of active owners, changed after " +
  "this list loaded - for example, someone else acted first, or this was the last active owner " +
  "by the time the change reached the server. Reload the list to see the current state, then " +
  "try again if it still applies.";

function genericFailureText(action: AccountAction, email: string | null): string {
  switch (action) {
    case "approve":
      return email
        ? `Could not approve ${email}. Nothing was changed. Try again, or reload the list if the problem continues.`
        : "Could not approve this account. Nothing was changed. Try again, or reload the list if the problem continues.";
    case "restore":
      return email
        ? `Could not restore ${email}. Nothing was changed. Try again, or reload the list if the problem continues.`
        : "Could not restore this account. Nothing was changed. Try again, or reload the list if the problem continues.";
    case "promote":
      return email
        ? `Could not make ${email} an owner. Nothing was changed. Try again, or reload the list if the problem continues.`
        : "Could not make this account an owner. Nothing was changed. Try again, or reload the list if the problem continues.";
    case "demote":
      return email
        ? `Could not remove owner access from ${email}. Nothing was changed. Try again, or reload the list if the problem continues.`
        : "Could not remove owner access from this account. Nothing was changed. Try again, or reload the list if the problem continues.";
    case "suspend":
      // Not given verbatim anywhere in docs/account-people-copy.md: the copy
      // sheet specifies three DISTINGUISHABLE suspend failures (below) but
      // never a fourth, generic one, even though actions.ts's own
      // classifySuspendFailure has a catch-all "failed" branch for a thrown
      // error matching none of the three markers. Mirrors the other four
      // actions' own generic-failure phrasing with "suspend" substituted -
      // see this component's final report for this gap being flagged rather
      // than silently invented.
      return email
        ? `Could not suspend ${email}. Nothing was changed. Try again, or reload the list if the problem continues.`
        : "Could not suspend this account. Nothing was changed. Try again, or reload the list if the problem continues.";
  }
}

function suspendProviderFailedText(email: string | null): string {
  return email
    ? `Could not suspend ${email}. The account could not be blocked at the sign-in provider, and nothing here was changed. Try again, or reload the list if the problem continues.`
    : "Could not suspend this account. The account could not be blocked at the sign-in provider, and nothing here was changed. Try again, or reload the list if the problem continues.";
}

function suspendReversedText(email: string | null): string {
  return email
    ? `Could not finish suspending ${email}. The block has already been undone, so the account can still sign in as before. Try again, or reload the list if the problem continues.`
    : "Could not finish suspending this account. The block has already been undone, so the account can still sign in as before. Try again, or reload the list if the problem continues.";
}

function suspendLockedOutText(email: string | null): string {
  return email
    ? `${email} could not be suspended here, and this app could not undo the block it had already put in place at the sign-in provider. The account may be locked out with nobody able to fix it from this list. Go to your Supabase project's dashboard (Authentication, then Users), find this account, and remove the ban directly. Retrying from here will not help until that is done.`
    : "This account could not be suspended here, and this app could not undo the block it had already put in place at the sign-in provider. The account may be locked out with nobody able to fix it from this list. Go to your Supabase project's dashboard (Authentication, then Users), find this account, and remove the ban directly. Retrying from here will not help until that is done.";
}

interface FeedbackState {
  kind: "success" | "error";
  text: string;
}

/**
 * Maps one AccountActionResult (src/app/account/people/actions.ts) to the
 * fixed copy docs/account-people-copy.md specifies for it. `not_found`,
 * `not_authorized` and `invalid_id` have no dedicated copy in that document
 * - none is reachable through this page's own UI in the ordinary case (the
 * page is owner-gated, and every id it sends came from a row it just
 * rendered), so this is a defensive mapping, not a documented one:
 * `not_found` reads as the same "the account changed after this list
 * loaded" race the copy sheet already describes for `refused` (a deleted
 * account is exactly that), and `not_authorized`/`invalid_id` fall back to
 * the ordinary generic-failure text for the action, since both mean "nothing
 * happened, try again" just as plainly as the documented `failed` case does.
 */
function feedbackFor(action: AccountAction, email: string | null, result: AccountActionResult): FeedbackState {
  switch (result.kind) {
    case "ok":
      return { kind: "success", text: successText(action, email) };
    case "refused":
    case "not_found":
      return { kind: "error", text: STALE_REFUSAL_TEXT };
    case "suspend_provider_failed":
      return { kind: "error", text: suspendProviderFailedText(email) };
    case "suspend_reversed":
      return { kind: "error", text: suspendReversedText(email) };
    case "suspend_locked_out":
      return { kind: "error", text: suspendLockedOutText(email) };
    case "not_authorized":
    case "invalid_id":
    case "failed":
    default:
      return { kind: "error", text: genericFailureText(action, email) };
  }
}

interface ConfirmDialogProps {
  action: ConfirmingAction;
  email: string | null;
  restoreFocusRef: RefObject<HTMLElement | null>;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * The shared confirmation dialog for approve/suspend/promote/demote (restore
 * needs none - docs/account-people-copy.md's "Action buttons" table). Built
 * on ModalShell (src/app/components/ui/ModalShell.tsx), the mechanism every
 * other overlay dialog in this app already adopts: role="dialog",
 * aria-modal, Escape-to-close, a hand-rolled focus trap, and focus
 * restoration to the control that opened it are all provided by that shell
 * and its useModalDismiss hook, not reimplemented here.
 */
function ConfirmDialog({ action, email, restoreFocusRef, onCancel, onConfirm }: ConfirmDialogProps) {
  const title = DIALOG_TITLES[action];
  const paragraphs = dialogBodyParagraphs(action, email);
  const confirmLabel = DIALOG_CONFIRM_LABELS[action];

  return (
    <ModalShell
      label={title}
      onDismiss={onCancel}
      restoreFocusRef={restoreFocusRef}
      contentStyle={{ width: "min(100%, 480px)", height: "auto" }}
    >
      <h2 className={styles.dialogTitle}>{title}</h2>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={styles.dialogBody}>
          {paragraph}
        </p>
      ))}
      <div className={securityStyles.row}>
        <button type="button" className={securityStyles.secondary} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={ACTION_BUTTON_CLASS[action]} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </ModalShell>
  );
}

interface AccountRowItemProps {
  row: AccountRow;
  onMutated: () => void;
}

/** One row of the table, including its own action buttons, confirmation
 * dialog (mounted only while pending), busy state and transient feedback. */
function AccountRowItem({ row, onMutated }: AccountRowItemProps) {
  const [busyAction, setBusyAction] = useState<AccountAction | null>(null);
  const [pendingAction, setPendingAction] = useState<AccountAction | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  // Captured at the moment a confirmation-needing button is clicked
  // (event.currentTarget), never read from document.activeElement - the same
  // capture-at-open discipline every ModalShell caller in this app follows
  // (see that component's own doc comment).
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // A brief, transient confirmation/failure message - auto-dismissed rather
  // than requiring the operator to close it themselves (docs/account-people-
  // copy.md: "not a modal, nothing that needs dismissing").
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 8000);
    return () => clearTimeout(timer);
  }, [feedback]);

  const runAction = async (action: AccountAction) => {
    setPendingAction(null);
    setFeedback(null);
    setBusyAction(action);
    const result = await ACTION_FUNCTIONS[action](row.id);
    setBusyAction(null);
    setFeedback(feedbackFor(action, row.email, result));
    if (result.kind === "ok") {
      onMutated();
    }
  };

  const handleActionClick = (action: AccountAction, event: MouseEvent<HTMLButtonElement>) => {
    if (ACTIONS_REQUIRING_CONFIRMATION.has(action)) {
      triggerRef.current = event.currentTarget;
      setPendingAction(action);
      return;
    }
    void runAction(action);
  };

  const badge = ownershipBadge(row);
  const displayName = row.displayName === "" ? "(no name)" : row.displayName;

  return (
    <tr>
      <td>
        <bdi>{displayName}</bdi>
      </td>
      <td>{row.email ?? "(no email on file)"}</td>
      <td className={styles.stackCell}>
        {roleLabel(row.effectiveRole)}
        {badge && (
          <span className={badge.tone === "success" ? securityStyles.pill : securityStyles.pillPending}>
            {badge.text}
          </span>
        )}
        {badge && <span className={securityStyles.help}>{badge.detail}</span>}
      </td>
      <td className={styles.stackCell}>{statusLabel(row.effectiveStatus)}</td>
      <td>{formatTimestamp(row.accountRecordCreatedAt)}</td>
      <td>{statusChangeText(row)}</td>
      <td className={styles.actionsCell}>
        <div className={styles.actionButtons}>
          {ACTION_ORDER.map((action) => {
            const verdict = row.actions[action];
            const disabled = busyAction !== null || !verdict.allowed;
            const reasonId = `${row.id}-${action}-reason`;
            return (
              <div key={action} className={styles.actionSlot}>
                <button
                  type="button"
                  className={ACTION_BUTTON_CLASS[action]}
                  disabled={disabled}
                  aria-describedby={!verdict.allowed ? reasonId : undefined}
                  onClick={(event) => handleActionClick(action, event)}
                >
                  {busyAction === action ? ACTION_BUSY_LABELS[action] : ACTION_LABELS[action]}
                </button>
                {!verdict.allowed && (
                  <p id={reasonId} className={styles.actionReason}>
                    {verdict.reason}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {feedback && (
          <p
            role={feedback.kind === "error" ? "alert" : "status"}
            className={feedback.kind === "error" ? securityStyles.error : securityStyles.notice}
          >
            {feedback.text}
          </p>
        )}
        {pendingAction && isConfirmingAction(pendingAction) && (
          <ConfirmDialog
            action={pendingAction}
            email={row.email}
            restoreFocusRef={triggerRef}
            onCancel={() => setPendingAction(null)}
            onConfirm={() => void runAction(pendingAction)}
          />
        )}
      </td>
    </tr>
  );
}

interface AccountTableProps {
  rows: AccountRow[];
  onMutated: () => void;
}

// No <caption> element: the <h2> immediately preceding each call site
// already names what the table holds ("Waiting for approval" / "All
// accounts"), so a caption would restate it.
//
// CORRECTION (2026-09-06): an earlier version of this comment justified the
// omission by claiming this app has no visually-hidden utility. It does -
// `visuallyHidden` in ../../components/ui/visuallyHidden.ts, a CSSProperties
// object used by seventeen files. The omission is still right, but for the
// reason above and not for a missing tool, and the difference matters: a
// reader who believed the original would hand-roll an off-screen span, or
// drop an accessible name entirely, rather than importing the one that
// already exists.
function AccountTable({ rows, onMutated }: AccountTableProps) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email address</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
            <th scope="col">Account record created</th>
            <th scope="col">Last status change</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <AccountRowItem key={row.id} row={row} onMutated={onMutated} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface AccountPeopleListProps {
  rows: AccountRow[];
}

/**
 * The owner's account list, split into two real tables (docs/account-people-
 * copy.md's two distinct empty states - "No accounts are waiting for
 * approval." only makes sense as a distinct string if there is a distinct
 * region for it to describe): accounts waiting for approval, then everyone
 * else. Both are the SAME already-sorted `rows` from buildAccountRows,
 * partitioned on `effectiveStatus` (the allowlist-aware value, not the raw
 * stored one - a verified allowlisted owner never belongs in an approval
 * queue, whatever its stored row still says).
 */
export default function AccountPeopleList({ rows }: AccountPeopleListProps) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const loadingId = useId();

  const reload = () => startRefresh(() => router.refresh());

  if (rows.length === 0) {
    return <p className={securityStyles.emptyState}>No account records exist yet.</p>;
  }

  const pendingRows = rows.filter((row) => row.effectiveStatus === "pending");
  const otherRows = rows.filter((row) => row.effectiveStatus !== "pending");

  return (
    <div>
      <div className={styles.reloadBar}>
        <button
          type="button"
          className={securityStyles.secondary}
          onClick={reload}
          disabled={isRefreshing}
          aria-describedby={isRefreshing ? loadingId : undefined}
        >
          Reload list
        </button>
        {isRefreshing && (
          <span id={loadingId} role="status" aria-live="polite" className={securityStyles.loadingRow}>
            <span className={securityStyles.spinner} aria-hidden="true" />
            Loading accounts...
          </span>
        )}
      </div>

      <h2 className={securityStyles.sectionTitle}>Waiting for approval</h2>
      {pendingRows.length === 0 ? (
        <p className={securityStyles.emptyState}>No accounts are waiting for approval.</p>
      ) : (
        <AccountTable rows={pendingRows} onMutated={reload} />
      )}

      <h2 className={securityStyles.sectionTitle} style={{ marginTop: "var(--space-8)" }}>
        All accounts
      </h2>
      <AccountTable rows={otherRows} onMutated={reload} />
    </div>
  );
}
