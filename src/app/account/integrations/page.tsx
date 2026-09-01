"use client";

import { useCallback, useEffect, useState } from "react";
import TopBar from "../../components/TopBar";
import {
  getGoogleCalendarStatusAction,
  disconnectGoogleCalendarAction,
  getOutlookStatusAction,
  disconnectOutlookAction,
} from "../../actions";
import { useInstitutions } from "@/lib/institutions";
import styles from "../security/security.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  state_mismatch: "The sign-in attempt expired or didn't match. Please try connecting again.",
  exchange_failed: "The provider rejected the connection. Please try again.",
  access_denied: "Connection was cancelled.",
  admin_required:
    "This school's Microsoft tenant requires an administrator to approve the app before you can connect. Ask their IT admin to approve it, or use a school where user consent is allowed.",
  bad_institution: "That school code was not recognized.",
};

export default function IntegrationsPage() {
  const institutions = useInstitutions();

  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [outlookConnected, setOutlookConnected] = useState<string[]>([]);
  const [outlookCanSend, setOutlookCanSend] = useState<string[]>([]);
  const [outlookCanMarkRead, setOutlookCanMarkRead] = useState<string[]>([]);
  const [outlookBusy, setOutlookBusy] = useState<string | null>(null);

  const refreshOutlook = useCallback(async () => {
    const r = await getOutlookStatusAction();
    if (!("error" in r)) {
      setOutlookConnected(r.connected);
      setOutlookCanSend(r.canSend);
      setOutlookCanMarkRead(r.canMarkRead ?? []);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const [g, o] = await Promise.all([getGoogleCalendarStatusAction(), getOutlookStatusAction()]);
      if (!active) return;
      if ("error" in g) setError(g.error);
      else setConnected(g.connected);
      if (!("error" in o)) {
        setOutlookConnected(o.connected);
        setOutlookCanSend(o.canSend);
        setOutlookCanMarkRead(o.canMarkRead ?? []);
      }
      setLoading(false);

      const params = new URLSearchParams(window.location.search);
      const inst = params.get("institution");
      if (params.get("connected") === "1") {
        setNotice(inst ? `Outlook connected for ${inst}.` : "Google Calendar connected.");
      }
      const err = params.get("error");
      if (err) {
        const base = ERROR_MESSAGES[err] ?? "Could not connect.";
        const detail = params.get("detail");
        setError(detail ? `${base} - ${detail}` : base);
      }
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

  const disconnectSchool = async (code: string) => {
    if (!window.confirm(`Disconnect Outlook for ${code}?`)) return;
    setOutlookBusy(code);
    setError(null);
    setNotice(null);
    const result = await disconnectOutlookAction(code);
    setOutlookBusy(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setNotice(`Outlook disconnected for ${code}.`);
    await refreshOutlook();
  };

  return (
    <>
      <TopBar />
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Integrations</h1>
          <p className={styles.subtitle}>
            Connect Google Calendar for scheduling, and each school&apos;s Outlook mailbox to work with its inbox.
          </p>

          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p className={styles.notice}>{notice}</p>}

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Google Calendar</p>
            {loading ? (
              <div className={styles.loadingRow} role="status" aria-live="polite">
                <span className={styles.spinner} aria-hidden="true" />
                <span>Loading…</span>
              </div>
            ) : connected ? (
              <div className={styles.factor}>
                <div className={styles.factorMain}>
                  <span className={styles.factorName}>
                    Google Calendar
                    <span className={styles.pill}>Active</span>
                  </span>
                  <div className={styles.actions}>
                    <a className={styles.secondary} href="/api/google/oauth/start">Reconnect</a>
                    <button type="button" className={styles.remove} onClick={disconnect} disabled={busy}>
                      Disconnect
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className={styles.factor}>
                <div className={styles.factorMain}>
                  <span className={styles.factorName}>
                    Google Calendar
                    <span className={`${styles.pill} ${styles.pillNeutral}`}>Not connected</span>
                  </span>
                  <div className={styles.actions}>
                    <a className={styles.primary} href="/api/google/oauth/start">Connect Google Calendar</a>
                  </div>
                </div>
                <p className={styles.rowDetail}>
                  Connecting lets the app read your free/busy and add Google Meet events on your behalf.
                </p>
              </div>
            )}
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Outlook (per school)</p>
            {loading ? (
              <div className={styles.loadingRow} role="status" aria-live="polite">
                <span className={styles.spinner} aria-hidden="true" />
                <span>Loading…</span>
              </div>
            ) : institutions.length === 0 ? (
              <p className={styles.emptyState}>Add a school in the Settings menu first, then connect its Outlook mailbox here.</p>
            ) : (
              <ul className={styles.factorList}>
                {institutions.map((code) => {
                  const isConnected = outlookConnected.includes(code);
                  const canSend = outlookCanSend.includes(code);
                  return (
                    <li key={code} className={styles.factor}>
                      <div className={styles.factorMain}>
                        <span className={styles.factorName}>
                          <span className={styles.schoolCode}>{code}</span>
                          {isConnected && <span className={styles.pill}>Active</span>}
                        </span>
                        <div className={styles.actions}>
                          {isConnected ? (
                            <>
                              <a className={styles.secondary} href={`/api/microsoft/oauth/start?institution=${encodeURIComponent(code)}`}>
                                Reconnect
                              </a>
                              <button
                                type="button"
                                className={styles.remove}
                                onClick={() => disconnectSchool(code)}
                                disabled={outlookBusy === code}
                              >
                                Disconnect
                              </button>
                            </>
                          ) : (
                            <a className={styles.primary} href={`/api/microsoft/oauth/start?institution=${encodeURIComponent(code)}`}>
                              Connect Outlook
                            </a>
                          )}
                        </div>
                      </div>
                      {isConnected && (
                        <p className={styles.rowDetail}>
                          Email sending: {canSend ? (
                            "enabled"
                          ) : (
                            <>
                              not granted - <a className={styles.secondary} href={`/api/microsoft/oauth/start?institution=${encodeURIComponent(code)}`}>
                                reconnect to enable
                              </a>
                            </>
                          )}. Mailbox updates: {outlookCanMarkRead.includes(code) ? "enabled" : <>not granted - <a className={styles.secondary} href={`/api/microsoft/oauth/start?institution=${encodeURIComponent(code)}`}>reconnect to enable</a></>}.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className={styles.tip}>
            Outlook uses only user-consentable permissions (read mail). A school whose tenant requires admin approval will
            say so when you try to connect.
          </p>
        </section>
      </main>
    </>
  );
}
