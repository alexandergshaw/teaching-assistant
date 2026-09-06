"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/context/SupabaseProvider";
import { safeNextPath } from "@/lib/access";
import { mapSignInFailure, noticeFromStateParam, type AuthNotice, type SignInFailureNotice } from "@/lib/auth-screen-state";
import AuthCard, { AuthAlert, nextLinkSuffix } from "./AuthCard";
import styles from "./login.module.css";

type Step = "password" | "mfa";

/**
 * B5b: every provider sign-in failure - wrong password, unconfirmed email,
 * a suspended (banned) account - collapses to this single message.
 * `mapSignInFailure` is what enforces the collapse; this table exists only
 * so a future second value in `SignInFailureNotice` cannot be forgotten
 * here, the same "exhaustive record over a closed union" idiom this
 * codebase already uses.
 */
const SIGN_IN_FAILURE_COPY: Record<SignInFailureNotice, string> = {
  generic: "That email and password combination did not work.",
};

/** Notice copy for the three states `noticeFromStateParam` can ever produce
 * (plus "unavailable", which this page also reaches on its own when the
 * client-side AAL check fails - see RB7 in the acceptance criteria). Kept
 * as a function of the signed-in user rather than a static table because
 * "pending" and "suspended" both need to show the actual signed-in address
 * (DB7: the address is the one thing a pending person can hand an owner to
 * act on), not a placeholder. */
function noticeCopy(notice: AuthNotice, email: string | null, createdAt: string | null) {
  if (notice === "pending") {
    const created = createdAt
      ? new Date(createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : null;
    return {
      heading: "Waiting for approval",
      body: email
        ? `Signed in as ${email}.${created ? ` Your account was created on ${created} and` : " Your account"} is waiting for an administrator.`
        : "Your account is waiting for an administrator.",
    };
  }
  if (notice === "suspended") {
    return {
      heading: "Access paused",
      body: `Access for ${email ?? "this account"} has been paused. Contact the administrator of this workspace.`,
    };
  }
  return {
    heading: "We could not check your access",
    body: "Something went wrong reaching the account service. This is not a problem with your account.",
  };
}

export default function LoginPage() {
  const { supabase, user, loading } = useSupabase();
  const router = useRouter();

  const [step, setStep] = useState<Step>("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // B5: `state` is attacker-authored (anyone can send `/login?state=suspended`
  // to a colleague), so it is read only through `noticeFromStateParam`'s
  // closed switch, never interpolated. `next` round-trips through the
  // address bar the same way, so it is re-validated here too (R2/B6b) rather
  // than trusted because the gate itself once wrote it. Parsed in a mount
  // effect rather than a useState lazy initializer so the server-rendered
  // (window-less) shell and the client's first render match - an initializer
  // that branched on `window` here would hydrate straight into whichever
  // notice/next the real URL carries, mismatching the static shell.
  const [notice, setNotice] = useState<AuthNotice | null>(null);
  const [nextPath, setNextPath] = useState("/");
  useEffect(() => {
    // setState-in-effect idiom (async IIFE + cancelled flag, setState only
    // after an await) - see the matching comment on the sibling screens.
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const params = new URLSearchParams(window.location.search);
      setNotice(noticeFromStateParam(params.get("state")));
      setNextPath(safeNextPath(params.get("next")));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // A bookmark or a stale tab landing on /login with an already-active
  // session (and no gate-supplied reason to be here) must not show a dead
  // sign-in card - it sends the person back into the app instead. A session
  // that DOES carry a notice (pending/suspended/unavailable) was put here by
  // the gate on purpose and must not be redirected away from.
  useEffect(() => {
    if (!loading && user && notice === null) {
      router.replace(nextPath);
    }
  }, [loading, user, notice, nextPath, router]);

  const finish = () => {
    router.refresh();
    router.push(nextPath);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // Full document load, not a client navigation: the module registry
    // (course-list cache, active-institution selection, the backup
    // directory handle) survives a client-side route change, so this
    // matches the app chrome's own sign-out convention rather than
    // reintroducing that leak on this one screen.
    window.location.assign("/login");
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setSubmitting(false);
      setError(SIGN_IN_FAILURE_COPY[mapSignInFailure(signInError.code)]);
      return;
    }

    // RB7: the gate now fails CLOSED when this exact call errors, bouncing
    // the user straight back with state=unavailable. This client must agree
    // rather than discarding the error and pushing into the app anyway.
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) {
      setSubmitting(false);
      setNotice("unavailable");
      return;
    }
    if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      setSubmitting(false);
      if (!totp) {
        setError(
          "Two-factor authentication is required but no authenticator was found. Contact your workspace administrator."
        );
        return;
      }
      setFactorId(totp.id);
      setStep("mfa");
      return;
    }

    setSubmitting(false);
    finish();
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: mfaCode.trim(),
    });
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    finish();
  };

  if (notice) {
    const copy = noticeCopy(notice, user?.email ?? null, user?.created_at ?? null);
    return (
      <AuthCard
        title={copy.heading}
        subtitle={copy.body}
        footnote={
          <button type="button" className={styles.linkButton} onClick={handleSignOut}>
            Sign out
          </button>
        }
      >
        {notice === "pending" && (
          <button type="button" className={styles.button} onClick={() => window.location.assign(nextPath)}>
            Check again
          </button>
        )}
        {notice === "unavailable" && (
          <button type="button" className={styles.button} onClick={() => window.location.reload()}>
            Try again
          </button>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={step === "password" ? "Welcome back" : "Two-factor authentication"}
      subtitle={
        step === "password"
          ? "Sign in to access your grading workspace."
          : "Enter the 6-digit code from your authenticator app."
      }
      footnote={
        step === "password" ? (
          <>
            Need an account?{" "}
            <Link href={`/login/signup${nextLinkSuffix(nextPath)}`} className={styles.linkButton}>
              Create one
            </Link>
            {" · "}
            <Link href={`/login/forgot${nextLinkSuffix(nextPath)}`} className={styles.linkButton}>
              Forgot password
            </Link>
          </>
        ) : (
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setStep("password");
              setMfaCode("");
              setError(null);
            }}
          >
            Back to sign in
          </button>
        )
      }
    >
      {step === "password" ? (
        <form className={styles.form} onSubmit={handlePassword}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-email">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              className={styles.input}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              className={styles.input}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <AuthAlert message={error} />

          <button className={styles.button} type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form className={styles.form} onSubmit={handleMfa}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="mfa-code">
              Authentication code
            </label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              className={styles.input}
              placeholder="123456"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
            />
          </div>

          <AuthAlert message={error} />

          <button className={styles.button} type="submit" disabled={submitting}>
            {submitting ? "Verifying…" : "Verify"}
          </button>
        </form>
      )}
    </AuthCard>
  );
}
