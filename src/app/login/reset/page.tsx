"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/context/SupabaseProvider";
import { noticeFromConfirmError } from "@/lib/auth-screen-state";
import { safeNextPath } from "@/lib/access";
import AuthCard, { AuthAlert, nextLinkSuffix } from "../AuthCard";
import styles from "../login.module.css";

type Step = "verify" | "mfa" | "password";

const GENERIC_ERROR = "Something went wrong. Try again.";
const UNAVAILABLE_ERROR = "We could not check your account. Try again in a moment.";

export default function ResetPasswordPage() {
  const { supabase } = useSupabase();
  const router = useRouter();

  // Parsed in a mount effect, not a lazy useState initializer, so the
  // window-less server render and the client's first render match (see the
  // matching comment in ../page.tsx). `email` is a plain prefill
  // convenience (the address the person's own forgot-password submission
  // was for) - it is not trusted for anything beyond seeding this field,
  // and it is always re-editable.
  const [nextPath, setNextPath] = useState("/");
  const [email, setEmail] = useState("");
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
      const prefill = params.get("email");
      if (typeof prefill === "string") {
        setEmail(prefill);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [step, setStep] = useState<Step>("verify");
  const [code, setCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    router.refresh();
    router.push(nextPath);
  };

  // A recovery session is an ordinary aal1 session, never a scoped
  // one-purpose token - an account with an enrolled TOTP factor must clear
  // that step again before the new-password fields ever render. Fails
  // CLOSED on a lookup error (RB7's fix, applied here too): a failed check
  // must never be read as "no factor enrolled" and silently skip the step.
  const proceedPastVerification = async () => {
    const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) {
      setError(UNAVAILABLE_ERROR);
      return;
    }
    if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
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
    setStep("password");
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { data, error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "recovery",
    });
    if (verifyError) {
      setSubmitting(false);
      // otp_expired covers both an expired code and an already-used one -
      // GoTrue returns the same code for both, so this screen cannot (and
      // does not try to) tell them apart.
      const mapped = noticeFromConfirmError(verifyError.code);
      setError(mapped === "link-invalid" ? "That code is no longer valid. Request a new one." : GENERIC_ERROR);
      return;
    }
    if (!data.session) {
      setSubmitting(false);
      setError(GENERIC_ERROR);
      return;
    }
    await proceedPastVerification();
    setSubmitting(false);
  };

  const handleMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: mfaError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: mfaCode.trim(),
    });
    setSubmitting(false);
    if (mfaError) {
      setError(mfaError.message);
      return;
    }
    setStep("password");
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError("Could not set your new password. Make sure it meets the requirements and try again.");
      return;
    }
    finish();
  };

  if (step === "mfa") {
    return (
      <AuthCard title="Two-factor authentication" subtitle="Enter the 6-digit code from your authenticator app.">
        <form className={styles.form} onSubmit={handleMfa}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="reset-mfa-code">
              Authentication code
            </label>
            <input
              id="reset-mfa-code"
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
      </AuthCard>
    );
  }

  if (step === "password") {
    return (
      <AuthCard title="Choose a new password" subtitle="At least 12 characters. Not your name or email address.">
        <form className={styles.form} onSubmit={handlePassword}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="reset-password">
              New password
            </label>
            <input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <AuthAlert message={error} />

          <button className={styles.button} type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Save and sign in"}
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Enter your reset code"
      subtitle="Enter the email the code was sent to, and the code itself."
      footnote={
        <Link href={`/login/forgot${nextLinkSuffix(nextPath)}`} className={styles.linkButton}>
          Request a new code
        </Link>
      }
    >
      <form className={styles.form} onSubmit={handleVerify}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="reset-email">
            Email
          </label>
          <input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            className={styles.input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="reset-code">
            Reset code
          </label>
          <input
            id="reset-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            className={styles.input}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </div>

        <AuthAlert message={error} />

        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Verifying…" : "Verify code"}
        </button>
      </form>
    </AuthCard>
  );
}
