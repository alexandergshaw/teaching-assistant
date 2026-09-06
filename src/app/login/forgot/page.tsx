"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { useSupabase } from "@/context/SupabaseProvider";
import { safeNextPath } from "@/lib/access";
import AuthCard, { AuthAlert, nextLinkSuffix } from "../AuthCard";
import styles from "../login.module.css";

const UNAVAILABLE_MESSAGE = "Something went wrong reaching the account service. Try again in a moment.";

export default function ForgotPasswordPage() {
  const { supabase } = useSupabase();

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

  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);
      // B4: this app reports the SAME outcome whether or not the address
      // has an account. The one exception is a genuine transport failure -
      // that is a fact about this app's own reachability, not about the
      // address, so it gets its own message instead of being folded into
      // the uniform "check your email" copy below.
      if (resetError && isAuthRetryableFetchError(resetError)) {
        setError(UNAVAILABLE_MESSAGE);
        return;
      }
      setSent(true);
    } catch {
      setError(UNAVAILABLE_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    const resetParams = new URLSearchParams();
    resetParams.set("email", email);
    if (nextPath !== "/") resetParams.set("next", nextPath);

    return (
      <AuthCard
        title="Check your email"
        subtitle={`If there is an account for ${email}, we have sent a code to reset the password.`}
        footnote={
          <Link href={`/login/reset?${resetParams.toString()}`} className={styles.linkButton}>
            Enter the code
          </Link>
        }
      />
    );
  }

  return (
    <AuthCard
      title="Forgot password"
      subtitle="Enter your email and, if there is an account for it, we will send a code to reset your password."
      footnote={
        <Link href={`/login${nextLinkSuffix(nextPath)}`} className={styles.linkButton}>
          Back to sign in
        </Link>
      }
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="forgot-email">
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            autoComplete="email"
            required
            className={styles.input}
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <AuthAlert message={error} />

        <button className={styles.button} type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send reset code"}
        </button>
      </form>
    </AuthCard>
  );
}
