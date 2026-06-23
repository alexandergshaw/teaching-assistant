"use client";

import { useEffect, useState } from "react";
import TopBar from "../../components/TopBar";
import {
  getGoogleCalendarStatusAction,
  disconnectGoogleCalendarAction,
} from "../../actions";
import styles from "../security/security.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: "The sign-in attempt expired or didn't match. Please try connecting again.",
  exchange_failed: "Google rejected the connection. Please try again.",
  access_denied: "Connection was cancelled.",
};

export default function IntegrationsPage() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    // await-first so the effect performs no synchronous setState.
    let active = true;
    (async () => {
      const result = await getGoogleCalendarStatusAction();
      if (!active) return;
      if ("error" in result) setError(result.error);
      else setConnected(result.connected);
      setLoading(false);

      // Surface the outcome of the OAuth round-trip (the callback redirects here
      // with ?connected=1 or ?error=...), then clean the URL.
      const params = new URLSearchParams(window.location.search);
      if (params.get("connected") === "1") setNotice("Google Calendar connected.");
      const err = params.get("error");
      if (err) setError(ERROR_MESSAGES[err] ?? "Could not connect Google Calendar.");
      if (params.get("connected") || err) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const disconnect = async () => {
    if (!window.confirm("Disconnect Google Calendar? You can reconnect anytime.")) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await disconnectGoogleCalendarAction();
    setBusy(false);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setConnected(false);
    setNotice("Google Calendar disconnected.");
  };

  return (
    <>
      <TopBar />
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Integrations</h1>
          <p className={styles.subtitle}>
            Connect Google Calendar so the inbox can suggest open meeting times and
            book video calls with students.
          </p>

          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Google Calendar</p>
            {loading ? (
              <p className={styles.empty}>Loading…</p>
            ) : connected ? (
              <>
                <p className={styles.empty}>
                  Connected
                  <span className={styles.pill}>Active</span>
                </p>
                <div className={styles.row}>
                  <a className={styles.secondary} href="/api/google/oauth/start">
                    Reconnect
                  </a>
                  <button type="button" className={styles.remove} onClick={disconnect} disabled={busy}>
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.empty}>
                  Not connected. Connecting lets the app read your free/busy and add
                  Google Meet events on your behalf.
                </p>
                <div className={styles.row}>
                  <a className={styles.primary} href="/api/google/oauth/start">
                    Connect Google Calendar
                  </a>
                </div>
              </>
            )}
          </div>

          <p className={styles.tip}>
            Meeting times are offered in your configured working hours. Adjust them
            with the SCHEDULING_* environment variables.
          </p>
        </section>
      </main>
    </>
  );
}
