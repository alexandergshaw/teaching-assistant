"use client";

// The Success Tracking view shell (LIVE-LMS-STUDENT-MESSAGING W3). A
// cross-course, cross-institution surface: it opens straight to the
// institution switcher and the table, with no course selection first.
//
// PLACEMENT is the orchestrator default (FORK A'): a new top-level tab, pending
// owner confirmation.
//
// Wiring: the switcher is useInstitutionSelection() narrowed to the
// LIVE-connected subset (filterConnectedInstitutions); the rows come from
// useLiveEnrollments, which drives the owner-only server actions that run
// buildLiveEnrollmentReaders -> aggregateEnrollments; the table and the modal
// are mounted here. Switching institution changes the roster and DROPS the
// selection (selectionFor keys it by institution) but KEEPS the draft
// (useMessagingDraft is not keyed by institution).

import { useEffect, useMemo, useState } from "react";
import { checkInstitutionsAction } from "@/app/actions";
import { useInstitutionSelection } from "@/lib/institutions";
import { connectionMapFromCheck } from "@/lib/live-messaging/connection-map";
import {
  filterConnectedInstitutions,
  resolveSwitcherSelection,
  type InstitutionConnectionMap,
} from "@/lib/live-messaging/connected-institutions";
import {
  NO_SELECTION,
  selectionFor,
  setKeys,
  toggleKey,
  type SelectionState,
} from "@/lib/live-messaging/selection-model";
import MessagingModal from "./MessagingModal";
import SuccessTrackingTable from "./SuccessTrackingTable";
import { useLiveEnrollments } from "./useLiveEnrollments";
import { useMessagingDraft } from "./useMessagingDraft";
import styles from "./SuccessTracking.module.css";

interface ConnectionCheck {
  key: string;
  map: InstitutionConnectionMap;
}

export default function SuccessTrackingView() {
  const { institutions, active, setActive } = useInstitutionSelection();
  const [check, setCheck] = useState<ConnectionCheck | null>(null);
  const [selection, setSelection] = useState<SelectionState>(NO_SELECTION);
  // The institution the modal was opened for; a switch therefore closes it.
  const [modalFor, setModalFor] = useState<string | null>(null);
  const { draft, setDraft } = useMessagingDraft();

  const instKey = institutions.join("|");
  useEffect(() => {
    if (!instKey) return;
    let cancelled = false;
    void (async () => {
      await Promise.resolve();
      if (cancelled) return;
      let map: InstitutionConnectionMap;
      try {
        map = connectionMapFromCheck(await checkInstitutionsAction(instKey.split("|")));
      } catch {
        map = {};
      }
      if (cancelled) return;
      setCheck({ key: instKey, map });
    })();
    return () => {
      cancelled = true;
    };
  }, [instKey]);

  const checked = check !== null && check.key === instKey;
  const connected = useMemo(
    () => (checked && check ? filterConnectedInstitutions(institutions, check.map) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- instKey stands in for the institutions array
    [checked, check, instKey]
  );
  const institution = resolveSwitcherSelection(active, connected);

  const enrollments = useLiveEnrollments(institution);
  const selectedKeys = selectionFor(selection, institution);
  const selectedRows = useMemo(() => {
    const wanted = new Set(selectedKeys);
    return enrollments.rows.filter((r) => wanted.has(r.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedKeys is rebuilt each render from `selection`
  }, [enrollments.rows, selection, institution]);

  return (
    <div className={styles.stack}>
      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Institution</span>
          <select
            className={styles.select}
            value={institution}
            disabled={connected.length === 0}
            onChange={(e) => setActive(e.target.value)}
          >
            {connected.length === 0 ? <option value="">No live connection</option> : null}
            {connected.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        {institution ? (
          <button type="button" className={styles.button} onClick={enrollments.reload}>
            Refresh
          </button>
        ) : null}
      </div>

      {!checked && instKey ? (
        <p className={styles.hint} role="status">
          Checking your Canvas connections...
        </p>
      ) : null}
      {checked && connected.length === 0 ? (
        <div className={styles.noticeBanner} role="status">
          No institution has a live Canvas connection yet. Connect one in your account integrations to see students here.
        </div>
      ) : null}

      {enrollments.listError ? (
        <div className={styles.errorBanner} role="alert">
          {`Could not load courses: ${enrollments.listError}`}
        </div>
      ) : null}
      {enrollments.failed > 0 ? (
        <div className={styles.errorBanner} role="alert">
          {`${enrollments.failed} of ${enrollments.totalCourses} courses could not be loaded; the rest are shown.`}
        </div>
      ) : null}
      {enrollments.partial > 0 ? (
        <div className={styles.noticeBanner} role="status">
          {`${enrollments.partial} courses loaded with some columns unavailable (grades, missing work or sections).`}
        </div>
      ) : null}
      {enrollments.status === "loading" ? (
        <p className={styles.hintMuted} role="status">
          {`Loading courses... ${enrollments.totalCourses - enrollments.pending} of ${enrollments.totalCourses} done.`}
        </p>
      ) : null}

      {institution ? (
        <SuccessTrackingTable
          rows={enrollments.rows}
          loading={enrollments.status === "loading-courses" || enrollments.status === "loading"}
          selectedKeys={selectedKeys}
          onToggleRow={(key) => setSelection((prev) => toggleKey(prev, institution, key))}
          onSetRows={(keys, select) => setSelection((prev) => setKeys(prev, institution, keys, select))}
          onOpenMessaging={() => setModalFor(institution)}
        />
      ) : null}

      {modalFor !== null && modalFor === institution ? (
        <MessagingModal
          institution={institution}
          students={selectedRows}
          draft={draft}
          onDraftChange={setDraft}
          onClose={() => setModalFor(null)}
        />
      ) : null}
    </div>
  );
}
