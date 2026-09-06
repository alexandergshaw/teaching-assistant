"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/context/SupabaseProvider";
// Hard constraint: this MUST be the server action, never
// `supabase.auth.signUp` from the browser. Calling the browser client here
// would silently stop enforcing SIGNUP_MODE, the domain allowlist, the
// password rules and the name clamp - all four live in
// src/lib/signup-rules.ts, which carries `import "server-only"` specifically
// so that mistake fails the build instead of shipping quietly.
import { signUpAction } from "@/app/actions/auth-signup";
import { noticeFromConfirmError } from "@/lib/auth-screen-state";
import { safeNextPath } from "@/lib/access";
import AuthCard, { AuthAlert, nextLinkSuffix } from "../AuthCard";
import styles from "../login.module.css";

const GENERIC_SIGNUP_ERROR = "Something went wrong creating your account. Try again.";
const GENERIC_CODE_ERROR = "Something went wrong. Try again.";

type Phase = "form" | "check-email";

export default function SignUpPage() {
  const { supabase } = useSupabase();
  const router = useRouter();

  // Parsed in a mount effect, not a lazy useState initializer, so the
  // window-less server render and the client's first render match (see the
  // matching comment in ../page.tsx).
  const [nextPath, setNextPath] = useState("/");
  useEffect(() => {
    // setState-in-effect idiom (async IIFE + cancelled flag, setState only
    // after an await) - required by this repo's eslint rule even for a
    // purely synchronous read.
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      const params = new URLSearchParams(window.location.search);
      setNextPath(safeNextPath(params.get("next")));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signupsClosed, setSignupsClosed] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resent, setResent] = useState(false);

  const finish = () => {
    router.refresh();
    router.push(nextPath);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await signUpAction({ fullName, email, password });
      switch (result.outcome) {
        case "invalid":
          setError(result.message);
          break;
        case "signup_disabled":
          // B0/RB3: a property of the DEPLOYMENT (the Supabase dashboard's
          // sign-up toggle is off), not of this submission - it gets its
          // own screen rather than the generic error below.
          setSignupsClosed(true);
          break;
        case "error":
          setError(GENERIC_SIGNUP_ERROR);
          break;
        case "check_email":
          setPhase("check-email");
          break;
        case "signed_in":
          finish();
          break;
      }
    } catch {
      setError(GENERIC_SIGNUP_ERROR);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setCodeError(null);
    setVerifying(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "signup",
    });
    setVerifying(false);
    if (verifyError) {
      // otp_expired covers both an expired code and an already-used one -
      // GoTrue returns the same code for both, so this screen cannot (and
      // does not try to) tell them apart.
      const mapped = noticeFromConfirmError(verifyError.code);
      setCodeError(
        mapped === "link-invalid" ? "That code is no longer valid. Request a new one below." : GENERIC_CODE_ERROR
      );
      return;
    }
    if (data.session) {
      finish();
    }
  };

  const handleResend = async () => {
    setCodeError(null);
    setResent(false);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email });
    if (resendError) {
      setCodeError("Could not send a new code. Try again in a moment.");
      return;
    }
    setResent(true);
  };

  if (signupsClosed) {
    return (
      <AuthCard
        title="Sign-ups are closed"
        subtitle="This workspace is not accepting new accounts right now. Contact the administrator if you believe this is a mistake."
        footnote={
          <Link href={`/login${nextLinkSuffix(nextPath)}`} className={styles.linkButton}>
            Back to sign in
          </Link>
        }
      />
    );
  }

  if (phase === "check-email") {
    return (
      <AuthCard
        title="Check your email"
        subtitle={`We sent a code to ${email}. Enter it below to finish setting up your account.`}
        footnote={
          <Link href={`/login${nextLinkSuffix(nextPath)}`} className={styles.linkButton}>
            Back to sign in
          </Link>
        }
      >
        <form className={styles.form} onSubmit={handleVerify}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="signup-code">
              Confirmation code
            </label>
            <input
              id="signup-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              required
              autoFocus
              className={styles.input}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>

          <AuthAlert message={codeError} />
          {resent && !codeError ? <p className={styles.hint}>A new code is on its way.</p> : null}

          <button className={styles.button} type="submit" disabled={verifying}>
            {verifying ? "Verifying…" : "Verify code"}
          </button>

          <button type="button" className={styles.linkButton} onClick={handleResend}>
            Resend code
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Create an account"
      subtitle="Set up access to your teaching workspace."
      footnote={
        <>
          Already have an account?{" "}
          <Link href={`/login${nextLinkSuffix(nextPath)}`} className={styles.linkButton}>
            Sign in
          </Link>
        </>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="signup-name">
            Full name
          </label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            required
            className={styles.input}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="signup-email">
            Email
          </label>
          <input
            id="signup-email"
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
          <label className={styles.label} htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            className={styles.input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className={styles.hint}>At least 12 characters. Not your name or email address.</p>
        </div>

        <AuthAlert message={error} />

        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Creating account…" : "Create account"}
        </button>
      </form>
    </AuthCard>
  );
}
