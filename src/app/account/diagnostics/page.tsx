"use client";

import { useEffect, useState } from "react";
import TopBar from "../../components/TopBar";
import CoursePicker from "../../components/CoursePicker";
import { useInstitutionSelection } from "@/lib/institutions";
import { formatRelative } from "../../utils/time";
import {
  listContentMigrationsAction,
  listMigrationProgressAction,
  cancelMigrationJobAction,
} from "../../actions";
import { classifyMigration, type ContentMigrationRow, type MigrationProgress } from "@/lib/canvas-modules";
import styles from "../security/security.module.css";

/**
 * This screen exists to tell the truth about a course's Canvas content
 * migrations, not to pretend there is more control over them than the
 * Canvas API actually offers. Canvas has no DELETE and no dequeue for a
 * content migration - the only lever is cancelling the migration's own
 * Progress object, and only while that job is still queued or running. A
 * screen that hid that limitation would be worse than no screen at all, so
 * every row here renders classifyMigration's verdict verbatim (the wording
 * lives once in src/lib/canvas-modules/migrations.ts) instead of re-deriving
 * or re-wording what a given state means.
 */

const COURSE_URL_KEY = "ta-diagnostics-course-url";

type LoadState = "idle" | "loading" | "ready" | "error";

function readStoredCourseUrl(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(COURSE_URL_KEY) ?? "";
}

/**
 * Human-readable summary of a row's Progress object (or the lack of one).
 *
 * A failed lookup reports the REASON it failed, not just that it failed. The
 * reasons are not interchangeable: a 404 means the job is gone, while the
 * SSRF guard's refusal means Canvas handed back a progress_url pointing at
 * some other host - which is a finding in its own right, and exactly the
 * kind of thing a diagnostics screen exists to surface rather than flatten
 * into "could not be loaded".
 */
function describeProgress(
  row: ContentMigrationRow,
  entry: MigrationProgress | null | undefined,
  failureReason: string | undefined
): string {
  if (!row.progressUrl) return "No progress object.";
  if (entry === undefined && !failureReason) return "Progress: loading...";
  if (entry == null) return `Progress: could not be loaded - ${failureReason ?? "reason unknown"}`;
  const pct = entry.completion != null ? ` (${entry.completion}%)` : "";
  return `Progress: ${entry.workflowState}${pct}.`;
}

export default function DiagnosticsPage() {
  const { institutions, active: activeInstitution } = useInstitutionSelection();

  // Own ta- prefixed key, distinct from every other tab's course-url key
  // (ta-canvas-course-url, ta-content-course-url, ta-files-course-url, ...)
  // so choosing a course here never hijacks - or gets hijacked by - another
  // tab's selection.
  const [courseUrl, setCourseUrl] = useState<string>(() => readStoredCourseUrl());
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COURSE_URL_KEY, courseUrl);
  }, [courseUrl]);

  const [migrations, setMigrations] = useState<ContentMigrationRow[]>([]);
  const [progress, setProgress] = useState<Record<string, MigrationProgress | null>>({});
  // Why a per-URL lookup failed, keyed by the same progress_url - see
  // describeProgress above for why the reason is kept rather than collapsed
  // into the null in `progress`.
  const [progressErrors, setProgressErrors] = useState<Record<string, string>>({});
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  const [confirmCancelId, setConfirmCancelId] = useState<number | null>(null);
  const [cancelBusyId, setCancelBusyId] = useState<number | null>(null);

  // Reset to a loading state during render on a course change, so the fetch
  // effect below only ever sets state after an await (no synchronous
  // setState from an effect - repo lint rule).
  const [prevCourseUrl, setPrevCourseUrl] = useState(courseUrl);
  if (courseUrl !== prevCourseUrl) {
    setPrevCourseUrl(courseUrl);
    setMigrations([]);
    setProgress({});
    setProgressErrors({});
    setError(null);
    setNotice(null);
    setConfirmCancelId(null);
    setLoadState(courseUrl ? "loading" : "idle");
  }

  useEffect(() => {
    if (!courseUrl) return;
    let cancelled = false;
    (async () => {
      const migResult = await listContentMigrationsAction(courseUrl, activeInstitution || undefined);
      if (cancelled) return;
      if ("error" in migResult) {
        setMigrations([]);
        setProgress({});
        setProgressErrors({});
        setLoadState("error");
        setError(migResult.error);
        return;
      }
      setMigrations(migResult.migrations);

      const progressUrls = migResult.migrations
        .map((m) => m.progressUrl)
        .filter((u): u is string => !!u);
      if (progressUrls.length === 0) {
        setProgress({});
        setProgressErrors({});
        setLoadState("ready");
        return;
      }
      const progResult = await listMigrationProgressAction(courseUrl, progressUrls, activeInstitution || undefined);
      if (cancelled) return;
      if ("error" in progResult) {
        // The whole progress lookup failed (auth, or the course URL itself no
        // longer resolves). The migration rows themselves loaded fine, so the
        // page still renders them - every row simply reports the one reason
        // rather than a bare "could not be loaded".
        setProgress({});
        setProgressErrors(Object.fromEntries(progressUrls.map((url) => [url, progResult.error])));
      } else {
        setProgress(progResult.progress);
        setProgressErrors(progResult.progressErrors);
      }
      setLoadState("ready");
    })();
    return () => {
      cancelled = true;
    };
    // reloadVersion is a manual re-run trigger for the Refresh button below -
    // this is the only automatic loading this screen ever does (course
    // choice or a deliberate refresh, never a background polling loop).
  }, [courseUrl, activeInstitution, reloadVersion]);

  const requestCancel = (migrationId: number) => {
    setNotice(null);
    setConfirmCancelId(migrationId);
  };

  const abandonCancel = () => setConfirmCancelId(null);

  const confirmCancel = async (migrationId: number) => {
    setCancelBusyId(migrationId);
    setError(null);
    const result = await cancelMigrationJobAction(courseUrl, migrationId, activeInstitution || undefined);
    setCancelBusyId(null);
    setConfirmCancelId(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setNotice(
      `Migration ${migrationId}: job is now "${result.progressState}". The migration row still remains in ` +
        `Canvas's list - Canvas has no way to delete a content migration, only to cancel its job.`
    );
    setReloadVersion((v) => v + 1);
  };

  const refresh = () => {
    if (!courseUrl) return;
    setLoadState("loading");
    setNotice(null);
    setReloadVersion((v) => v + 1);
  };

  return (
    <>
      <TopBar />
      <main className={styles.page}>
        <section className={styles.card}>
          <h1 className={styles.title}>Diagnostics</h1>
          <p className={styles.subtitle}>
            Inspect a course&apos;s Canvas content migrations and their underlying jobs, so a stuck import is
            something you can actually see instead of only suspect.
          </p>

          <p className={styles.tip}>
            Canvas offers no way to delete a content migration once it is created. The only lever available is
            cancelling the migration&apos;s own job - and only while that job is still queued or running. A
            migration row you cancel stays in Canvas&apos;s list forever; there is nothing this screen (or Canvas
            itself) can do to remove it.
          </p>

          {notice && <p className={styles.notice}>{notice}</p>}

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Canvas import jobs</p>

            {institutions.length === 0 ? (
              <p className={styles.empty}>
                No school is configured yet. Add one from the Settings menu, then come back here to pick a course.
              </p>
            ) : (
              <>
                <CoursePicker activeInstitution={activeInstitution} courseUrl={courseUrl} onSelect={setCourseUrl} />

                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={refresh}
                    disabled={!courseUrl || loadState === "loading"}
                  >
                    {loadState === "loading" ? "Loading..." : "Refresh"}
                  </button>
                </div>

                {!courseUrl ? (
                  <p className={styles.empty}>Choose a course above to see its Canvas import jobs.</p>
                ) : loadState === "error" ? (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                ) : loadState === "loading" && migrations.length === 0 ? (
                  <p className={styles.empty}>Loading...</p>
                ) : migrations.length === 0 ? (
                  <p className={styles.empty}>No content migrations found for this course.</p>
                ) : (
                  <ul className={styles.factorList}>
                    {migrations.map((row) => {
                      const progressEntry = row.progressUrl ? progress[row.progressUrl] : undefined;
                      const progressFailure = row.progressUrl ? progressErrors[row.progressUrl] : undefined;
                      const verdict = classifyMigration(row.workflowState, progressEntry?.workflowState ?? null);
                      const isConfirming = confirmCancelId === row.id;
                      const isBusy = cancelBusyId === row.id;

                      return (
                        <li key={row.id} className={styles.migrationRow}>
                          <div className={styles.migrationHeader}>
                            <span className={styles.factorName}>
                              #{row.id} - {row.migrationType}
                              <span className={styles.migrationBadge}>{row.workflowState}</span>
                            </span>
                            {verdict.cancellable && !isConfirming && (
                              <button
                                type="button"
                                className={styles.remove}
                                onClick={() => requestCancel(row.id)}
                                disabled={isBusy}
                              >
                                Cancel job
                              </button>
                            )}
                          </div>

                          <p className={styles.help}>
                            {describeProgress(row, progressEntry, progressFailure)} Created{" "}
                            {formatRelative(row.createdAt) || "at an unknown time"}.
                            {row.migrationIssuesCount > 0 &&
                              ` ${row.migrationIssuesCount} migration issue${row.migrationIssuesCount === 1 ? "" : "s"} reported.`}
                          </p>

                          <p className={styles.migrationSentence}>{verdict.sentence}</p>

                          {isConfirming && (
                            <div className={styles.cancelBox}>
                              <p>
                                {verdict.kind === "running"
                                  ? "This job is currently running - cancelling it now may leave partially imported " +
                                    "content in the course. "
                                  : "This stops the queued job before it runs. "}
                                This does not remove the migration from Canvas&apos;s list; Canvas has no delete for
                                it. Cancel the job anyway?
                              </p>
                              <div className={styles.row}>
                                <button
                                  type="button"
                                  className={styles.remove}
                                  onClick={() => confirmCancel(row.id)}
                                  disabled={isBusy}
                                >
                                  {isBusy ? "Cancelling..." : "Yes, cancel job"}
                                </button>
                                <button
                                  type="button"
                                  className={styles.secondary}
                                  onClick={abandonCancel}
                                  disabled={isBusy}
                                >
                                  Never mind
                                </button>
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
