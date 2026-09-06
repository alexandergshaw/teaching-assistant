// The owner's account-management screen (docs/account-people-copy.md,
// docs/multi-user-login-acceptance-criteria.md C1/C2/C7/GC2/GC5/GC7/GC8/GC10).
// A SERVER component, deliberately: the guard below is the real access
// control (TopBar.tsx's nav entry only decides whether the link is drawn, not
// whether this page may be opened), and every judgement about a row - the
// allowlist override, the ownership badge, the clamped display name, the
// attribution actor, and a verdict for each of the five actions - lives in
// src/lib/account-people-view.ts, not here. This file's job is layout and
// copy only: it fetches, maps the fetched shape onto that module's input
// type, and hands the result to AccountPeopleList (the client component that
// owns confirmation dialogs, busy state and per-row feedback).
import Link from "next/link";
import { requireAppOwner, OWNER_ONLY_MESSAGE } from "@/lib/supabase/auth";
import { listAccountPeople } from "@/lib/supabase/app-users-directory";
import { countEffectiveOwners } from "@/lib/supabase/app-users";
import { isOwnerEmail } from "@/lib/owner";
import {
  buildAccountRows,
  type AccountPersonInput,
  type AccountPeopleViewContext,
  type AccountRow,
} from "@/lib/account-people-view";
import TopBar from "../../components/TopBar";
import AccountPeopleList from "./AccountPeopleList";
import styles from "../security/security.module.css";

/**
 * What a signed-in member sees if they reach this URL without being the
 * owner. Not an error page: nothing has gone wrong, and the copy says so
 * plainly rather than implying a fault or inviting a retry. It offers the one
 * next step that actually works for them - the account areas that ARE theirs.
 *
 * It deliberately does not name who the owner is, or say how many owners
 * exist. That is information about other people's roles, and a member who
 * cannot open this page has no need of it.
 */
function AccountPeopleDenied() {
  return (
    <>
      <TopBar />
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Accounts</h1>
          <p className={styles.subtitle}>
            Managing accounts is limited to the workspace owner, so this page is not available to
            you. Nothing is wrong with your account.
          </p>
          <p className={styles.help}>
            <Link href="/account">Back to your account settings</Link>
          </p>
        </section>
      </main>
    </>
  );
}

export default async function AccountPeoplePage() {
  // requireAppOwner(), NOT the deprecated requireOwner() alias (which
  // delegates to requireUser() - "any active account"). Hiding the nav entry
  // in TopBar.tsx is discoverability, not access control; this call is the
  // actual boundary that keeps a merely-active, non-owner account out.
  //
  // WHY THE DENIAL IS CAUGHT RATHER THAN LEFT TO THROW. The request gate
  // (src/proxy.ts) admits any ACTIVE account, so an ordinary member who
  // follows a shared link or types this URL reaches this component and is
  // refused here - correctly. But there is no error boundary anywhere under
  // src/app (no error.tsx, no global-error.tsx), so an uncaught throw renders
  // the framework's generic server-exception screen. Denying access is right;
  // presenting it as a crash is not, and it reads to the member as a broken
  // app rather than a page that was never theirs.
  //
  // ONLY the owner-only refusal is caught. It is recognised by comparing
  // against auth.ts's own exported constant - never a copy of its text - so
  // the two cannot drift apart. Everything else (a service outage, an auth
  // transport failure, a bug) is RETHROWN deliberately: turning a real fault
  // into "you are not the owner" would tell the actual owner they had lost
  // their own access, and would hide the outage that caused it.
  let owner;
  try {
    owner = await requireAppOwner();
  } catch (error) {
    if (error instanceof Error && error.message === OWNER_ONLY_MESSAGE) {
      return <AccountPeopleDenied />;
    }
    throw error;
  }

  let rows: AccountRow[] | null = null;

  try {
    // Issued CONCURRENTLY via Promise.all, never one after another - GC10
    // (docs/multi-user-login-acceptance-criteria.md). A timed-out PostgREST
    // or auth-admin read (both of these calls make one) does not match
    // postgrest-js's own AbortError check, so it is silently retried up to 3
    // more times with fresh timeouts and backoff - roughly 39 seconds worst
    // case for ONE such read alone, against this app's 60-second platform
    // cap (Vercel Hobby). Awaiting listAccountPeople() and THEN
    // countEffectiveOwners() would sum their worst cases instead of
    // overlapping them - two reads that individually fit inside the cap,
    // composed sequentially into one that does not - and the request would
    // die with no page at all, rather than a merely slow one.
    const [people, effectiveOwnerCount] = await Promise.all([
      listAccountPeople(),
      countEffectiveOwners(),
    ]);

    // Every other account this list could ever attribute a status change to
    // (describeStatusActor, ./account-people-view.ts) is already present in
    // `people` - no second query is needed to resolve an actor's email.
    const actorEmailById: Record<string, string> = {};
    for (const person of people) {
      if (person.email) {
        actorEmailById[person.id] = person.email;
      }
    }

    const inputs: AccountPersonInput[] = people.map((person) => ({
      id: person.id,
      email: person.email,
      displayName: person.displayName,
      role: person.role,
      status: person.status,
      createdAt: person.createdAt,
      statusChangedAt: person.statusChangedAt,
      statusChangedBy: person.statusChangedBy,
      // Resolved here, server-side, exactly once - never inside
      // account-people-view.ts (that module reads no environment on
      // purpose; see its own module doc comment). `emailVerified` comes
      // from the directory rows themselves (app-users-directory.ts already
      // joined it in from the auth provider).
      isAllowlisted: isOwnerEmail(person.email),
      emailVerified: person.emailVerified,
    }));

    const context: AccountPeopleViewContext = {
      actorId: owner.id,
      actorRole: owner.role ?? "owner",
      effectiveOwnerCount,
      actorEmailById,
    };

    rows = buildAccountRows(inputs, context);
  } catch {
    // rows stays null - rendered below as the documented failure state.
    // Deliberately swallowed rather than rethrown: an admin screen failing
    // to load is not an outage for anyone else, and the copy below says so.
  }

  return (
    <>
      <TopBar />
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Accounts</h1>
          <p className={styles.subtitle}>
            Everyone who has signed in to this workspace. Approving an account gives it the same
            access to connected services that you have.
          </p>
          {/* The C1b limitation note - a persistent, low-emphasis note, not a
              dismissible banner: the case it describes (two email addresses
              differing only in case) is permanent until the underlying
              uniqueness constraint changes, so hiding it once would hide it
              from the one person who can act on it. */}
          <p className={styles.tip}>
            This list is built from account records, and a missing one now usually fixes itself
            the next time that person uses the app again. The one case that does not fix itself is
            two people whose email addresses differ only in upper or lower case - the second one to
            sign up can never get a record here, and looking them up in your authentication
            provider will not help, because their account genuinely exists there. If someone says
            they signed up, has tried again, and still is not on this list, search your database
            logs for a warning starting &quot;handle_new_auth_user: could not create app_users
            row&quot; - it names the exact account id and the database error.
          </p>
          {rows === null ? (
            <p role="alert" className={styles.error}>
              The account list could not be loaded. This does not affect anyone&apos;s existing
              access.
            </p>
          ) : (
            <AccountPeopleList rows={rows} />
          )}
        </section>
      </main>
    </>
  );
}
