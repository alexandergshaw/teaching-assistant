"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/context/SupabaseProvider";
import styles from "./login.module.css";

function LogoMark() {
  return (
    <span className={styles.mark} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M12 3 1.5 8 12 13l8.5-4.05V14"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 10.5V15c0 1.1 2.7 2.5 6 2.5s6-1.4 6-2.5v-4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export default function LoginPage() {
  const { supabase, user } = useSupabase();
  const router = useRouter();
  const [step, setStep] = useState<"password" | "mfa">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [factorId, setFactorId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const finish = () => {
    router.refresh();
    router.push("/");
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setSubmitting(false);
      setError(signInError.message);
      return;
    }

    // If a verified MFA factor exists, require the second step before proceeding.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.[0];
      setSubmitting(false);
      if (!totp) {
        setError("MFA is required but no authenticator was found. Reset it from the Supabase dashboard.");
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

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>
          <LogoMark />
          <span className={styles.brandName}>Teaching Assistant</span>
        </div>

        {step === "password" ? (
          <>
            <h1 className={styles.title}>Welcome back</h1>
            <p className={styles.subtitle}>Sign in to access your grading workspace.</p>

            <form className={styles.form} onSubmit={handlePassword}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="login-email">Email</label>
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
                <label className={styles.label} htmlFor="login-password">Password</label>
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

              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}

              <button className={styles.button} type="submit" disabled={submitting}>
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className={styles.title}>Two-factor authentication</h1>
            <p className={styles.subtitle}>
              Enter the 6-digit code from your authenticator app.
            </p>

            <form className={styles.form} onSubmit={handleMfa}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="mfa-code">Authentication code</label>
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

              {error && (
                <p role="alert" className={styles.error}>
                  {error}
                </p>
              )}

              <button className={styles.button} type="submit" disabled={submitting}>
                {submitting ? "Verifying…" : "Verify"}
              </button>
            </form>

            <p className={styles.footnote}>
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
            </p>
          </>
        )}

        {user && step === "password" && (
          <p className={styles.footnote}>
            Signed in as {user.email}, but this account is not approved for access.{" "}
            <button
              type="button"
              className={styles.linkButton}
              onClick={async () => {
                await supabase.auth.signOut();
                router.refresh();
              }}
            >
              Sign out
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
