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
// The VALUE comes from the client-safe leaf directly; the types still come
// from the barrel, because type-only imports erase at compile time and
// carry no module graph. Mixing them on one line is what put this Client
// Component's bundle on a path to next/headers and node:async_hooks.
import { classifyMigration } from "@/lib/canvas-modules/migration-verdict";
import type { ContentMigrationRow, MigrationProgress } from "@/lib/canvas-modules";
import SessionLogSection from "./SessionLogSection";
import { recordSessionDiagnosticEntry } from "@/lib/session-diagnostic-log";
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

/**
 * This screen's own entries in the app-wide session log
 * (src/lib/session-diagnostic-log.ts), which SessionLogSection below hands to
 * the owner as a file. Four operations, chosen because each one currently
 * loses information a later reader would want:
 *
 * - "list_courses" / "list_export_courses": CoursePicker reports every course
 *   listing attempt through its optional onDiagnostic prop, and this page was
 *   simply not passing one - so a failure here rendered its fixed sentence and
 *   left no trace at all, the exact defect that motivated the Course Content
 *   tab's log.
 * - "list_migrations": the surfaced error survives only until the next course
 *   change clears it (see the render-phase reset above), so the reason a
 *   lookup failed is gone the moment the instructor tries something else.
 * - "load_migration_progress": recorded for the whole-lookup failure AND for
 *   a PARTIAL one. The partial case is the valuable one and the easiest to
 *   miss: the rows still render, each carrying its own reason in small text,
 *   and one of those reasons is the SSRF guard refusing a progress_url that
 *   pointed at another host - a finding in its own right (describeProgress's
 *   own comment says so) which nothing outside this screen would ever hear
 *   about.
 * - "cancel_migration_job": the only state-changing action on this screen.
 *   Both outcomes are recorded, so "did I actually cancel it, and what did
 *   Canvas say" is answerable afterwards rather than from memory.
 *
 * Deliberately NOT recorded: individual render decisions, classifyMigration's
 * verdicts, and the Refresh button itself. None of them can fail, and a log
 * padded with events that cannot go wrong buries the ones that did.
 */
type DiagnosticsOperation =
  | "list_courses"
  | "list_export_courses"
  | "list_migrations"
  | "load_migration_progress"
  | "cancel_migration_job";

const DIAGNOSTICS_OPERATION_LABELS: Readonly<Record<DiagnosticsOperation, string>> = {
  list_courses: "List courses",
  list_export_courses: "List courses with a saved export",
  list_migrations: "List Canvas import jobs",
  load_migration_progress: "Load import job progress",
  cancel_migration_job: "Cancel import job",
};

/**
 * Module scope, not a closure inside the component, for one concrete reason:
 * the migrations effect below must NOT list this among its dependencies (a
 * new function identity each render would re-fire the fetch on every render),
 * and a module-level function has no identity to depend on in the first
 * place. It holds no state - the one store is session-diagnostic-log.ts.
 */
function recordDiag(
  operation: DiagnosticsOperation,
  institution: string,
  course: string,
  outcome: "success" | "failure",
  error?: string
): void {
  recordSessionDiagnosticEntry({
    at: new Date().toISOString(),
    surface: "diagnostics",
    operation,
    label: DIAGNOSTICS_OPERATION_LABELS[operation],
    institution,
    course,
    outcome,
    error,
  });
}

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
  if (entry === undefined && !failureReason) return "Progress: loading…";
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
      // Recorded BEFORE the cancelled check, on purpose: the call was made
      // and its outcome is a fact about this session whether or not this
      // screen is still interested in the answer. Recording after the check
      // would silently lose exactly the attempts an impatient user made while
      // switching courses - which are the ones they are most likely to be
      // asking about later.
      if ("error" in migResult) recordDiag("list_migrations", activeInstitution || "", courseUrl, "failure", migResult.error);
      else recordDiag("list_migrations", activeInstitution || "", courseUrl, "success");
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
      if ("error" in progResult) {
        recordDiag("load_migration_progress", activeInstitution || "", courseUrl, "failure", progResult.error);
      } else {
        // The PARTIAL failure, which the whole-call error branch below never
        // sees: the action succeeded, some individual progress_urls did not,
        // and each row quietly renders its own reason in small text. One of
        // those reasons is the SSRF guard refusing a progress_url pointing at
        // another host. The first reason is carried verbatim (and scrubbed by
        // the log itself) rather than flattened to a count.
        const failedUrls = Object.keys(progResult.progressErrors);
        if (failedUrls.length > 0) {
          recordDiag(
            "load_migration_progress",
            activeInstitution || "",
            courseUrl,
            "failure",
            `${failedUrls.length} of ${progressUrls.length} progress lookup(s) failed. First reason: ${progResult.progressErrors[failedUrls[0]]}`
          );
        } else {
          recordDiag("load_migration_progress", activeInstitution || "", courseUrl, "success");
        }
      }
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
      recordDiag("cancel_migration_job", activeInstitution || "", courseUrl, "failure", `Migration ${migrationId}: ${result.error}`);
      setError(result.error);
      return;
    }
    recordDiag("cancel_migration_job", activeInstitution || "", courseUrl, "success");
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

          {/* Placed FIRST, above the Canvas-import-jobs tool: the owner asked
              for a download of "everything that has happened on the app in
              that session" from the admin tools in settings, and burying it
              under an unrelated tool would repeat the mistake this repo has
              already shipped four times - a capability that exists and cannot
              be found. Never gated on the log having entries; see
              SessionLogSection.tsx's own header on why an empty log still has
              to render, and say so. */}
          <SessionLogSection currentInstitution={activeInstitution || ""} currentCourse={courseUrl} />

          <div className={styles.section}>
            <p className={styles.sectionTitle}>Canvas import jobs</p>

            {institutions.length === 0 ? (
              <p className={styles.emptyState}>
                No school is configured yet. Add one from the Settings menu, then come back here to pick a course.
              </p>
            ) : (
              <>
                {/* onDiagnostic was simply not being passed here, so a course
                    listing that failed on THIS screen rendered CoursePicker's
                    fixed sentence and left no trace anywhere - the same defect
                    the Course Content tab's log was built to fix, still open
                    on the one screen actually called "Diagnostics". */}
                <CoursePicker
                  activeInstitution={activeInstitution}
                  courseUrl={courseUrl}
                  onSelect={setCourseUrl}
                  onDiagnostic={(event) =>
                    recordDiag(event.operation, activeInstitution || "", "", event.outcome, event.error)
                  }
                />

                <div className={styles.row}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={refresh}
                    disabled={!courseUrl || loadState === "loading"}
                  >
                    {loadState === "loading" ? "Loading…" : "Refresh"}
                  </button>
                </div>

                {!courseUrl ? (
                  <p className={styles.emptyState}>Choose a course above to see its Canvas import jobs.</p>
                ) : loadState === "error" ? (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                ) : loadState === "loading" && migrations.length === 0 ? (
                  <div className={styles.loadingRow} role="status" aria-live="polite">
                    <span className={styles.spinner} aria-hidden="true" />
                    <span>Loading…</span>
                  </div>
                ) : migrations.length === 0 ? (
                  <p className={styles.emptyState}>No content migrations found for this course.</p>
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
                                  {isBusy ? "Cancelling…" : "Yes, cancel job"}
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
