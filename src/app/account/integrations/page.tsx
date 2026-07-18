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
              <p className={styles.empty}>Loading...</p>
            ) : connected ? (
              <>
                <p className={styles.empty}>
                  Connected
                  <span className={styles.pill}>Active</span>
                </p>
                <div className={styles.row}>
                  <a className={styles.secondary} href="/api/google/oauth/start">Reconnect</a>
                  <button type="button" className={styles.remove} onClick={disconnect} disabled={busy}>
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.empty}>
                  Not connected. Connecting lets the app read your free/busy and add Google Meet events on your behalf.
                </p>
                <div className={styles.row}>
                  <a className={styles.primary} href="/api/google/oauth/start">Connect Google Calendar</a>
                </div>
              </>
            )}
          </div>

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Outlook (per school)</p>
            {loading ? (
              <p className={styles.empty}>Loading...</p>
            ) : institutions.length === 0 ? (
              <p className={styles.empty}>Add a school in the Settings menu first, then connect its Outlook mailbox here.</p>
            ) : (
              institutions.map((code) => {
                const isConnected = outlookConnected.includes(code);
                const canSend = outlookCanSend.includes(code);
                return (
                  <div key={code}>
                    <div className={styles.row} style={{ alignItems: "center", gap: 10 }}>
                      <span style={{ minWidth: 64, fontWeight: 600 }}>{code}</span>
                      {isConnected ? (
                        <>
                          <span className={styles.pill}>Active</span>
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
                    {isConnected && (
                      <div className={styles.empty} style={{ marginTop: 8, fontSize: "0.9em" }}>
                        Email sending: {canSend ? (
                          "enabled"
                        ) : (
                          <>
                            not granted - <a className={styles.secondary} href={`/api/microsoft/oauth/start?institution=${encodeURIComponent(code)}`}>
                              reconnect to enable
                            </a>
                          </>
                        )}. Mailbox updates: {outlookCanMarkRead.includes(code) ? "enabled" : <>not granted - <a className={styles.secondary} href={`/api/microsoft/oauth/start?institution=${encodeURIComponent(code)}`}>reconnect to enable</a></>}.
                      </div>
                    )}
                  </div>
                );
              })
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
