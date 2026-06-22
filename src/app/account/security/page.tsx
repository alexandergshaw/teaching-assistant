"use client";

import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import TopBar from "../../components/TopBar";
import styles from "./security.module.css";

type Factor = {
  id: string;
  friendly_name?: string | null;
  status: string;
  created_at?: string;
};

type Enrolling = { factorId: string; qrCode: string; secret: string };

export default function SecurityPage() {
  const { supabase } = useSupabase();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<Enrolling | null>(null);
  const [friendlyName, setFriendlyName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadFactors = useCallback(async () => {
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError(listError.message);
    } else {
      setFactors((data?.totp ?? []) as Factor[]);
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    let active = true;
    supabase.auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (!active) return;
      if (listError) setError(listError.message);
      else setFactors((data?.totp ?? []) as Factor[]);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  const startEnroll = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    const { data, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: friendlyName.trim() || `Authenticator ${factors.length + 1}`,
    });
    setBusy(false);
    if (enrollError || !data) {
      setError(enrollError?.message ?? "Could not start enrollment.");
      return;
    }
    setEnrolling({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    setCode("");
  };

  const activate = async () => {
    if (!enrolling) return;
    setError(null);
    setBusy(true);
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrolling.factorId,
      code: code.trim(),
    });
    setBusy(false);
    if (verifyError) {
      setError(verifyError.message);
      return;
    }
    setEnrolling(null);
    setFriendlyName("");
    setCode("");
    setNotice("Authenticator added.");
    await loadFactors();
  };

  const cancelEnroll = async () => {
    if (enrolling) {
      // Remove the unverified factor we just created.
      await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId });
    }
    setEnrolling(null);
    setCode("");
    setError(null);
    await loadFactors();
  };

  const remove = async (factorId: string) => {
    if (!window.confirm("Remove this authenticator?")) return;
    setError(null);
    setNotice(null);
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
    if (unenrollError) {
      setError(unenrollError.message);
      return;
    }
    setNotice("Authenticator removed.");
    await loadFactors();
  };

  const verifiedCount = factors.filter((f) => f.status === "verified").length;

  return (
    <>
      <TopBar />
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Two-factor authentication</h1>
          <p className={styles.subtitle}>
            Add an authenticator app to require a 6-digit code at sign-in.
          </p>

          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Your authenticators</p>
            {loading ? (
              <p className={styles.empty}>Loading…</p>
            ) : factors.length === 0 ? (
              <p className={styles.empty}>
                None yet. Add one below to turn on two-factor authentication.
              </p>
            ) : (
              <ul className={styles.factorList}>
                {factors.map((f) => (
                  <li key={f.id} className={styles.factor}>
                    <span className={styles.factorName}>
                      {f.friendly_name || "Authenticator"}
                      <span
                        className={`${styles.pill}${f.status !== "verified" ? ` ${styles.pillPending}` : ""}`}
                      >
                        {f.status === "verified" ? "Active" : f.status}
                      </span>
                    </span>
                    <button type="button" className={styles.remove} onClick={() => remove(f.id)}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!enrolling ? (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Add an authenticator</p>
              <label className={styles.label} htmlFor="factor-name">
                Name (optional)
              </label>
              <input
                id="factor-name"
                type="text"
                className={styles.input}
                placeholder="e.g. Phone, 1Password"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
              />
              <div className={styles.row}>
                <button type="button" className={styles.primary} onClick={startEnroll} disabled={busy}>
                  {busy ? "Starting…" : "Add authenticator"}
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.section}>
              <p className={styles.sectionTitle}>Scan and verify</p>
              <p className={styles.help}>Scan this QR code in your authenticator app.</p>
              <div className={styles.qrFrame}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className={styles.qr} src={enrolling.qrCode} alt="TOTP QR code" />
              </div>
              <p className={styles.help}>
                Or enter this key manually: <span className={styles.secret}>{enrolling.secret}</span>
              </p>
              <label className={styles.label} htmlFor="activate-code">
                Enter the 6-digit code
              </label>
              <input
                id="activate-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                className={styles.input}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <div className={styles.row}>
                <button type="button" className={styles.primary} onClick={activate} disabled={busy}>
                  {busy ? "Activating…" : "Activate"}
                </button>
                <button type="button" className={styles.secondary} onClick={cancelEnroll} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {verifiedCount > 0 && verifiedCount < 2 && (
            <p className={styles.tip}>
              Add a second authenticator as a backup. If you lose your only device,
              you would have to remove the factor from the Supabase dashboard to get
              back in.
            </p>
          )}
        </section>
      </main>
    </>
  );
}
