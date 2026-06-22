"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSupabase } from "@/context/SupabaseProvider";
import styles from "../page.module.css";

export default function LoginPage() {
  const { supabase, user } = useSupabase();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    // Owner check is enforced server-side by middleware; go home and let it route.
    router.refresh();
    router.push("/");
  };

  return (
    <main>
      <section className={styles.card} style={{ maxWidth: 420, margin: "10vh auto" }}>
        <div className={styles.header}>
          <h1>Sign in</h1>
          <p>This app is restricted to approved accounts.</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              required
              className={styles.textInput}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              required
              className={styles.textInput}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <button className={styles.submitButton} type="submit" disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {user && (
          <p className={styles.fieldHint} style={{ marginTop: 12 }}>
            Signed in as {user.email}. If you can&apos;t access the app, this
            account is not on the approved list.{" "}
            <button
              type="button"
              className={styles.clearFileButton}
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
