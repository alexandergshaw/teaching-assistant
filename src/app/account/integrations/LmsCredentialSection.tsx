"use client";

// The Canvas section of /account/integrations - E2/E4/E5 of
// docs/lms-credentials-acceptance-criteria.md. Renders FIRST on the page
// (E-UX2): Outlook's per-school list depends on Canvas being connected for
// that school first (DAT1), so Canvas has to lead.
//
// EVERY STRING BELOW EITHER COMES FROM docs/lms-credentials-copy.md VERBATIM
// OR IS FLAGGED AS AN ADDITION IN THIS CHANGE'S OWN REPORT - see that report
// for the short list of strings the sheet does not specify (institution-code/
// token shape errors, "not signed in", "connection not found", and this
// file's own field labels and busy-state text).
//
// NO MUI COMPONENT LIBRARY IMPORT (AES-D2) - every control below is a plain
// <input>/<button> styled from ../security/security.module.css, matching the
// rest of this page and the rest of /account/*.
//
// PERSISTED FIELDS: the institution code and the Canvas base URL persist
// across reloads under ta-lms-credential-institution / ta-lms-credential-
// base-url, per this project's standing "every new textbox persists" rule.
// THE TOKEN FIELD IS THE ONE DELIBERATE EXCEPTION - it is never written to
// localStorage. E2 exists to guarantee a saved token is never readable again
// through any surface; persisting the live plaintext value the user is in the
// middle of pasting would leave it sitting in the clear on this machine long
// after the form is gone, which is exactly what E2 exists to prevent. Both
// keys are already covered by the sign-out sweep's default-erase posture
// (src/lib/client-state-sweep.ts keeps only "ta-theme") without needing an
// entry there.
//
// NOTHING HERE IS EVER RENDERED BY A TEST (this repo's vitest is node-
// environment and collects only *.test.ts). Every judgment about row
// identity, masking, and outcome wording already lives in the pure modules
// this component only renders (src/lib/lms-credential-view.ts, src/lib/
// lms-credential-probe-outcome.ts) - this file adds no judgment of its own
// beyond form plumbing and the four already-flagged strings.

import { useEffect, useRef, useState } from "react";
import styles from "../security/security.module.css";
import { readInstitutions, writeInstitutions } from "@/lib/institutions";
import {
  listLmsCredentialRowsAction,
  saveLmsCredentialAction,
  checkLmsCredentialConnectionAction,
  deleteLmsCredentialAction,
  type LmsCredentialProbeActionResult,
} from "./lms-actions";
import type { LmsCredentialRow } from "@/lib/lms-credential-view";

const INSTITUTION_KEY = "ta-lms-credential-institution";
const BASE_URL_KEY = "ta-lms-credential-base-url";

function readPersisted(key: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(key) ?? "";
}

function writePersisted(key: string, value: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, value);
}

/**
 * The six-outcome vocabulary (docs/lms-credentials-copy.md) plus this file's
 * own three flagged additions, rendered verbatim. `reason` outcomes render
 * their own carried string instead of a fixed sentence - see the copy
 * sheet's own instruction not to paraphrase `validateLmsBaseUrl`'s or
 * `canvasFetch`'s wording a second time.
 */
function describeOutcome(result: LmsCredentialProbeActionResult): string {
  switch (result.kind) {
    case "verified":
      // Callers needing the fuller "Connected as X" wording build it
      // themselves from the freshly-reloaded row (see submitCredential/
      // runCheckConnection below) - this generic fallback only fires if a
      // caller renders "verified" with no row to read a name from yet.
      return "Connected.";
    case "rejected":
      return "Canvas did not accept that token. Copy a fresh access token from Canvas and paste it here.";
    case "not-canvas":
      return "We reached that address, but it does not look like a Canvas site. Check the host - it should be your school's Canvas address (often something like https://canvas.yourschool.edu), not the school's main website.";
    case "host-not-allowed":
      return result.reason;
    case "unreachable":
      return "We could not reach that host. Check the address is correct, or try again in a few minutes.";
    case "rate-limited":
      return "You have tried to connect several times in a row. Wait a few minutes and try again.";
    case "save-failed":
      return "That token checked out, but we could not save the connection. Nothing was stored - please try again.";
    case "not-authorized":
      // Not in docs/lms-credentials-copy.md - flagged in this change's
      // report. This app already asks a signed-out visitor to sign in
      // rather than describing "authorization" as an abstract concept, so
      // this matches that existing tone rather than inventing a new one.
      return "Your session could not be verified. Refresh the page and sign in again.";
    case "invalid-input":
      return result.reason;
    case "not-found":
      // Not in docs/lms-credentials-copy.md - flagged in this change's
      // report. Only reachable if this row was deleted (from here, or by an
      // administrator) in the moment between this list loading and this
      // click.
      return "This connection could not be found. Refresh the page.";
  }
}

function formatAddedAt(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString();
}

function formatLastUsed(row: Extract<LmsCredentialRow, { source: "stored" }>): string {
  return row.lastUsed.kind === "never" ? "Never" : new Date(row.lastUsed.at).toLocaleDateString();
}

export default function LmsCredentialSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<LmsCredentialRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [institution, setInstitutionState] = useState(() => readPersisted(INSTITUTION_KEY));
  const [baseUrl, setBaseUrlState] = useState(() => readPersisted(BASE_URL_KEY));
  const [token, setToken] = useState("");

  const [editingInstitution, setEditingInstitution] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingInstitution, setCheckingInstitution] = useState<string | null>(null);
  const [deletingInstitution, setDeletingInstitution] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setInstitution = (value: string) => {
    setInstitutionState(value);
    writePersisted(INSTITUTION_KEY, value);
  };
  const setBaseUrl = (value: string) => {
    setBaseUrlState(value);
    writePersisted(BASE_URL_KEY, value);
  };

  const loadRows = async () => {
    const result = await listLmsCredentialRowsAction();
    if (result.kind === "ok") {
      setRows(result.rows);
      setLoadError(null);
    } else {
      setRows([]);
      setLoadError(
        result.kind === "not-authorized"
          ? "Your session could not be verified. Refresh the page and sign in again."
          : "Could not load your Canvas connections. Refresh the page to try again."
      );
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const prefill = params.get("institution");
      if (prefill && prefill.trim() !== "") {
        setInstitution(prefill.trim().toUpperCase());
        sectionRef.current?.scrollIntoView({ block: "start" });
        tokenInputRef.current?.focus();
      }
      await loadRows();
      if (!active) return;
    })();
    return () => {
      active = false;
    };
  }, []);

  function resetForm() {
    setEditingInstitution(null);
    setToken("");
    setError(null);
  }

  function startReplace(row: Extract<LmsCredentialRow, { source: "stored" }>) {
    setEditingInstitution(row.institution);
    setInstitution(row.institution);
    setBaseUrl(`https://${row.host}`);
    setToken("");
    setNotice(null);
    setError(null);
  }

  async function submitCredential() {
    setBusy(true);
    setNotice(null);
    setError(null);

    const result = await saveLmsCredentialAction({ institution, baseUrl, token });

    setBusy(false);

    if (result.kind !== "verified") {
      setError(describeOutcome(result));
      return;
    }

    const wasReplace = editingInstitution !== null;
    const savedInstitution = institution.trim().toUpperCase();
    await loadRows();

    const existing = readInstitutions();
    if (!existing.includes(savedInstitution)) {
      writeInstitutions([...existing, savedInstitution]);
    }

    setToken("");
    setEditingInstitution(null);
    setNotice(
      wasReplace
        ? `Connected. This replaces your previous connection for ${savedInstitution}.`
        : "Connected."
    );
  }

  async function runCheckConnection(row: Extract<LmsCredentialRow, { source: "stored" }>) {
    setCheckingInstitution(row.institution);
    setNotice(null);
    setError(null);

    const result = await checkLmsCredentialConnectionAction(row.institution);

    setCheckingInstitution(null);
    await loadRows();

    if (result.kind === "verified") {
      setNotice(`Connected as ${row.identityLabel}.`);
    } else {
      setError(describeOutcome(result));
    }
  }

  async function runDelete(row: Extract<LmsCredentialRow, { source: "stored" }>) {
    const confirmed = window.confirm(
      `Delete this Canvas connection?\n\n` +
        `This removes your saved Canvas connection for ${row.institution} from this app. Anything here that reads or updates ${row.institution}'s Canvas data on your behalf will stop working until you connect again.\n\n` +
        `This does NOT revoke the token in Canvas, and does NOT remove ${row.institution} from your list of schools - only the connection itself. If you are deleting this because the token may have leaked, also delete or regenerate it from inside Canvas.`
    );
    if (!confirmed) return;

    setDeletingInstitution(row.institution);
    setNotice(null);
    setError(null);

    const result = await deleteLmsCredentialAction(row.institution);

    setDeletingInstitution(null);

    if (result.kind === "ok") {
      if (editingInstitution === row.institution) resetForm();
      await loadRows();
      setNotice(`Connection for ${row.institution} deleted.`);
    } else {
      setError(
        result.kind === "not-authorized"
          ? "Your session could not be verified. Refresh the page and sign in again."
          : "Could not delete this connection. Please try again."
      );
    }
  }

  const storedRows = (rows ?? []).filter(
    (row): row is Extract<LmsCredentialRow, { source: "stored" }> => row.source === "stored"
  );
  const isReplacing = editingInstitution !== null;
  const canSubmit = institution.trim() !== "" && baseUrl.trim() !== "" && token.trim() !== "" && !busy;

  return (
    <div className={styles.section} id="canvas" ref={sectionRef}>
      <p className={styles.sectionTitle}>Canvas</p>

      {loadError && <p role="alert" className={styles.error}>{loadError}</p>}
      {notice && <p className={styles.notice}>{notice}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}

      {rows === null ? (
        <div className={styles.loadingRow} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>Loading...</span>
        </div>
      ) : storedRows.length === 0 ? (
        <p className={styles.emptyState}>
          You have not connected a Canvas account for any school yet. Add one below to let this app read and
          update that school&apos;s Canvas data on your behalf.
        </p>
      ) : (
        <ul className={styles.factorList}>
          {storedRows.map((row) => (
            <li key={row.institution} className={styles.factor}>
              <div className={styles.factorMain}>
                <span className={styles.factorName}>
                  {row.identityLabel}
                  <span className={styles.schoolCode}>{row.institution}</span>
                  {row.needsReentry ? (
                    <span className={styles.pillPending}>Needs reconnecting</span>
                  ) : (
                    <span className={styles.pill}>Connected</span>
                  )}
                </span>
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => runCheckConnection(row)}
                    disabled={checkingInstitution === row.institution || busy}
                  >
                    {checkingInstitution === row.institution ? "Checking..." : "Check connection"}
                  </button>
                  <button type="button" className={styles.secondary} onClick={() => startReplace(row)} disabled={busy}>
                    Replace
                  </button>
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => runDelete(row)}
                    disabled={deletingInstitution === row.institution}
                  >
                    {deletingInstitution === row.institution ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
              <p className={styles.rowDetail}>
                Host: {row.host} - Token: <span className={styles.secret}>{row.maskLabel}</span> - Added{" "}
                {formatAddedAt(row.addedAt)} - Last used: {formatLastUsed(row)}
              </p>
              {row.needsReentry && (
                <p className={styles.rowDetail}>
                  Canvas stopped accepting this connection. Replace it with a current token to restore access.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {storedRows.length > 0 && (
        <p className={styles.help}>
          The token you are replacing keeps working until the new one is confirmed. If the new one fails to
          verify, nothing changes - your current connection is untouched.
          <br />
          Replacing or deleting a connection here does not revoke the token in Canvas itself. If you are
          rotating a token because it may have leaked, also delete or regenerate it from inside Canvas - this
          app has no way to do that for you.
        </p>
      )}

      <div className={styles.spacedTop}>
        <label className={styles.label} htmlFor="lms-credential-institution">
          Institution code
        </label>
        <input
          id="lms-credential-institution"
          className={styles.input}
          value={institution}
          onChange={(e) => setInstitution(e.target.value)}
          disabled={isReplacing}
          placeholder="e.g. MCC"
        />

        <label className={styles.label} htmlFor="lms-credential-base-url">
          Canvas base URL
        </label>
        <input
          id="lms-credential-base-url"
          className={styles.input}
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://canvas.yourschool.edu"
        />

        <label className={styles.label} htmlFor="lms-credential-token">
          Canvas access token
        </label>
        <input
          id="lms-credential-token"
          ref={tokenInputRef}
          className={styles.input}
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
        <p className={styles.help}>
          Need a Canvas access token? In Canvas, go to Account, then Settings, scroll to Approved Integrations,
          and choose New Access Token. Canvas shows you the token exactly once when you create it - copy it
          right away and paste it here.
        </p>
        <p className={styles.help}>
          Canvas access tokens can be set to expire when you create them. This app has no way to detect that a
          token has expired or is about to - if Canvas calls for this school suddenly start failing, check
          whether the token you registered has an expiration date that has passed, and register a new one if
          so.
        </p>

        <div className={styles.row}>
          <button type="button" className={styles.primary} onClick={submitCredential} disabled={!canSubmit}>
            {busy ? (isReplacing ? "Replacing..." : "Connecting...") : isReplacing ? "Replace" : "Connect Canvas"}
          </button>
          {isReplacing && (
            <button type="button" className={styles.secondary} onClick={resetForm} disabled={busy}>
              Cancel
            </button>
          )}
          {busy && (
            <span className={styles.loadingRow} role="status" aria-live="polite">
              <span className={styles.spinner} aria-hidden="true" />
              <span>Checking your Canvas connection...</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
