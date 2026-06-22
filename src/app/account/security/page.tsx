"use client";

import { useCallback, useEffect, useState } from "react";
import { useSupabase } from "@/context/SupabaseProvider";
import styles from "../../page.module.css";

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

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <main>
      <section className={styles.card} style={{ maxWidth: 560, margin: "6vh auto" }}>
        <div className={styles.header}>
          <h1>Security</h1>
          <p>Manage two-factor authentication (TOTP) for your account.</p>
        </div>

        {error && <p role="alert" className={styles.error}>{error}</p>}
        {notice && <p className={styles.fieldHint} style={{ color: "#15803d" }}>{notice}</p>}

        {verified.length > 0 && verified.length < 2 && (
          <p className={styles.fieldHint}>
            Tip: add a second authenticator as a backup. If you lose your only device
            you would otherwise have to remove the factor from the Supabase dashboard
            to get back in.
          </p>
        )}

        <div className={styles.field}>
          <label>Authenticators</label>
          {loading ? (
            <p className={styles.fieldHint}>Loading…</p>
          ) : factors.length === 0 ? (
            <p className={styles.fieldHint}>
              No authenticators yet. Add one to require a 6-digit code at sign-in.
            </p>
          ) : (
            <ul className={styles.matrixFileList}>
              {factors.map((f) => (
                <li key={f.id} className={styles.savedFileNote}>
                  <span>
                    <strong>{f.friendly_name || "Authenticator"}</strong> ({f.status})
                  </span>
                  <button
                    type="button"
                    className={styles.clearFileButton}
                    onClick={() => remove(f.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!enrolling ? (
          <div className={styles.field}>
            <label htmlFor="factor-name">New authenticator name (optional)</label>
            <input
              id="factor-name"
              type="text"
              className={styles.textInput}
              placeholder="e.g. Phone, 1Password"
              value={friendlyName}
              onChange={(e) => setFriendlyName(e.target.value)}
            />
            <button
              type="button"
              className={styles.submitButton}
              onClick={startEnroll}
              disabled={busy}
            >
              {busy ? "Starting…" : "Add an authenticator"}
            </button>
          </div>
        ) : (
          <div className={styles.field}>
            <label>Scan this QR code in your authenticator app</label>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrolling.qrCode}
              alt="TOTP QR code"
              style={{ width: 200, height: 200, background: "#fff", borderRadius: 8 }}
            />
            <p className={styles.fieldHint}>
              Or enter this secret manually: <code>{enrolling.secret}</code>
            </p>
            <label htmlFor="activate-code">Enter the 6-digit code to activate</label>
            <input
              id="activate-code"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              className={styles.textInput}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <div className={styles.fieldEditActions}>
              <button
                type="button"
                className={styles.submitButton}
                onClick={activate}
                disabled={busy}
              >
                {busy ? "Activating…" : "Activate"}
              </button>
              <button
                type="button"
                className={styles.clearFileButton}
                onClick={cancelEnroll}
                disabled={busy}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
