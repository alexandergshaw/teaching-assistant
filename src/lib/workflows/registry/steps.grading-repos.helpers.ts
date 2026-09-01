// Grading-repo internal logic, split out of steps.grading-repos.ts (which had
// grown past this repo's 1000-line-per-file cap). gradingRepoSteps (the
// StepDefinition[] array) stays in steps.grading-repos.ts; every helper that
// array's run() functions call - gradeTileRepos, saveRepoGradingDraft,
// describeGradeRepoInputError, describeOrgRepoScanError, gradeOrgRepos,
// resolveReadmeInstructions, batchGradeReposAcrossCourses - used to live here
// in full. This file grew past the same 1000-line cap in turn, so everything
// that supports the "grade-repo" step (single repo + its org fan-out) -
// repoGradingStopAt, saveRepoGradingDraft, describeGradeRepoInputError,
// describeOrgRepoScanError, gradeOrgRepos, resolveReadmeInstructions - moved
// again, to steps.grading-repos.grade-repo.ts. gradeTileRepos and
// batchGradeReposAcrossCourses (the "batch-grade-repos-to-draft" step's
// support functions) stay here, since neither calls into the moved group.
// This file imports the six moved names from steps.grading-repos.grade-repo.ts
// and re-exports them under their original names - the same idiom
// steps.grading-repos.ts already uses one layer up - so every existing
// importer (steps.grading-repos.ts, steps.grading-repos.stop-at.test.ts,
// steps.grading-repos.unattended-report.test.ts) is unchanged.
// steps.grading-repos.grade-repo.ts has no dependency back on this file, so
// there is no import cycle - and this file has no dependency back on
// steps.grading-repos.ts, so that cycle-freedom is unchanged too.

import {
  listCourseHubAction,
  generateAssignmentRubricAction,
  gradeRepoAction,
  ingestRepoAction,
  saveGradingDraftAction,
  getRepoTreeAction,
  getFileTextAction,
} from "@/app/actions";
import {
  type StepRunHelpers,
  type StepRunResult,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import type { GradingRunEntry, GradeResult } from "@/lib/grade";
import type { Course } from "@/lib/supabase/courses";
import { courseProgressStatus, type CourseProgressStatus } from "@/lib/week-numbering";
import {
  buildRepoGradingLogEntry,
  buildRepoGradingRunLog,
  type RepoGradingLogEntry,
  type RepoGradingRunLog,
} from "@/lib/repo-grading-log";
import {
  repoGradingStopAt,
  saveRepoGradingDraft,
  describeGradeRepoInputError,
  describeOrgRepoScanError,
  gradeOrgRepos,
  resolveReadmeInstructions,
} from "./steps.grading-repos.grade-repo";

export {
  repoGradingStopAt,
  saveRepoGradingDraft,
  describeGradeRepoInputError,
  describeOrgRepoScanError,
  gradeOrgRepos,
  resolveReadmeInstructions,
};

// Grades one already-loaded, already-week-resolved course tile's student
// repos and saves the draft - the shared core of both batch-grade-repos-to-draft
// paths (single course below, and the all-courses fan-out in
// batchGradeReposAcrossCourses). Extracted verbatim from what used to be the
// step's entire run() body so the single-course behavior is unchanged bit for
// bit; the caller decides rawWeek/status (see the "currently running" check
// in the all-courses path - this function itself does not skip on status, it
// only uses it to LABEL the module name, exactly as the original code did).
export async function gradeTileRepos(opts: {
  tile: Course;
  rawWeek: number;
  status: CourseProgressStatus;
  instrRepoRef: string;
  userRubric: string;
  assignmentUrl: string;
  pointsPossibleRaw: string;
  helpers: StepRunHelpers;
  onProgress: (msg: string) => void;
}): Promise<{ draftId: string; graded: number; moduleName: string; summaryText: string; repoGradingLog: RepoGradingRunLog }> {
  const { tile, rawWeek, status, instrRepoRef, userRubric, assignmentUrl, pointsPossibleRaw, helpers, onProgress } = opts;

  // Step 2: Get student repos.
  const students = (tile.studentRepos ?? []).filter((s) => s.repo && s.repo.trim());
  if (students.length === 0) {
    throw new Error("Add student repos to the course tile first (the Student repos tile).");
  }

  // Step 3: Resolve the module name for the already-resolved week.
  const displayWeek = tile.weeks && tile.weeks > 0 ? Math.min(rawWeek, tile.weeks) : rawWeek;
  const wt = await loadTileWeekTopic(tile, displayWeek, helpers);
  const topic = "skip" in wt ? "" : wt.topic;
  const moduleName =
    status === "not-started"
      ? "Not started"
      : status === "complete"
        ? "Complete"
        : `Module ${String(displayWeek).padStart(2, "0")}${topic ? `: ${topic}` : ""}`;

  // Step 4-6: Grade each student repo (per-folder or shared-instructions mode).
  const wk = displayWeek;
  const weekRe = new RegExp(`(week|wk|module|unit)[^0-9]?0*${wk}(?![0-9])`, "i");

  // Shared-instructions fallback: read the instructions repo once if provided.
  let sharedInstructions = "";
  let sharedRubric = userRubric;
  if (instrRepoRef) {
    try {
      onProgress("Reading the instructions repo...");
      const r = await ingestRepoAction(instrRepoRef);
      if ("error" in r) {
        onProgress(`Note: could not ingest instructions repo: ${r.error}`);
      } else {
        const matched = r.digest.files.filter((f) => weekRe.test(f.path));
        if (matched.length > 0) {
          const readmeFile = matched.find((f) => /readme/i.test(f.path));
          sharedInstructions = readmeFile ? readmeFile.content : matched[0].content;
        } else {
          sharedInstructions = r.digest.text;
        }
      }
    } catch (err) {
      onProgress(`Note: error reading instructions repo: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!sharedRubric && sharedInstructions) {
      onProgress("Generating rubric...");
      const rr = await generateAssignmentRubricAction(
        moduleName + (topic ? `: ${topic}` : ""),
        sharedInstructions,
        helpers.provider
      );
      if (typeof rr === "string") {
        sharedRubric = rr;
      } else {
        onProgress(`Note: rubric generation failed: ${rr.error}`);
      }
    }
  }

  const results: GradeResult[] = [];
  const notes: string[] = [];
  // R1.2: one log entry per repo ATTEMPTED, carrying the same reason text
  // already pushed to `notes` above - never a second, differently-worded
  // account of the same skip/failure. Every entry that reaches `gradeRepoAction`
  // also carries that call's `digestTruncated` (entry 344) - whether the
  // ingest hit its cap collecting the repo's folder - onto the entry itself,
  // which used to be computed and thrown away here entirely; see
  // repo-grading-log.ts's header for why that stays a separate field rather
  // than folded into `reason` or into the run-level `truncated` below.
  const logEntries: RepoGradingLogEntry[] = [];
  // R1.5: the run must say when it stopped short rather than let a shorter
  // entry list silently read as "there were none".
  let truncated = false;
  const notReached: string[] = [];
  // Cache rubrics by README content to avoid redundant LLM calls.
  const rubricCache = new Map<string, string>();
  const stopAt = repoGradingStopAt(helpers.deadlineMs, Date.now());

  for (let i = 0; i < students.length; i++) {
    const student = students[i];
    const label = student.student || student.repo;

    // R1.4/R1.5: bail out before starting another repo once this step's own
    // time budget is spent, so the process is still alive to save the draft
    // (and the unattended report) covering everything attempted so far,
    // instead of being hard-killed by the cron function's own cap with
    // nothing persisted at all.
    if (Date.now() >= stopAt) {
      truncated = true;
      notReached.push(...students.slice(i).map((s) => s.repo));
      break;
    }

    try {
      // Try per-student folder grading: find the week folder in the student repo.
      let folderPath = "";
      let folderInstructions = "";
      let folderRubric = userRubric;

      if (!instrRepoRef) {
        // Folder-per-module mode: discover the week folder in the student repo.
        const treeRes = await getRepoTreeAction(student.repo);
        if ("error" in treeRes) {
          notes.push(`${label}: ${treeRes.error}`);
          logEntries.push(
            buildRepoGradingLogEntry({ repo: student.repo, outcome: "skipped", reason: treeRes.error, at: new Date().toISOString() })
          );
          continue;
        }
        // Find the first top-level folder matching the week pattern.
        const topFolders = new Set<string>();
        for (const entry of treeRes.tree) {
          const seg = entry.path.split("/")[0];
          topFolders.add(seg);
        }
        const matched = [...topFolders].find((seg) => weekRe.test(seg));
        if (!matched) {
          const reason = `no folder matching week ${wk}`;
          notes.push(`${label}: ${reason}`);
          logEntries.push(buildRepoGradingLogEntry({ repo: student.repo, outcome: "skipped", reason, at: new Date().toISOString() }));
          continue;
        }
        folderPath = matched;

        // Read the folder's README for instructions.
        const readmeEntry = treeRes.tree.find(
          (e) =>
            e.path.toLowerCase().startsWith(`${matched.toLowerCase()}/`) &&
            /\/readme\.md$/i.test(e.path) &&
            e.path.split("/").length === 2
        );
        if (readmeEntry) {
          const fileRes = await getFileTextAction(student.repo, readmeEntry.path);
          if (!("error" in fileRes)) {
            folderInstructions = fileRes.content;
          }
        }
        if (!folderInstructions) {
          folderInstructions = `Evaluate the contents of the ${matched} directory.`;
        }

        // Synthesize or retrieve cached rubric for this README content.
        if (!folderRubric) {
          const cached = rubricCache.get(folderInstructions);
          if (cached) {
            folderRubric = cached;
          } else {
            onProgress(`Generating rubric for ${matched}...`);
            const rr = await generateAssignmentRubricAction(
              moduleName + (topic ? `: ${topic}` : ""),
              folderInstructions,
              helpers.provider
            );
            if (typeof rr === "string") {
              folderRubric = rr;
              rubricCache.set(folderInstructions, rr);
            } else {
              onProgress(`Note: rubric generation failed for ${label}: ${rr.error}`);
            }
          }
        }
      } else {
        // Shared-instructions mode (instructionsRepo provided).
        folderInstructions = sharedInstructions;
        folderRubric = sharedRubric;
      }

      if (!folderRubric && !folderInstructions) {
        const reason = "no rubric or instructions available";
        notes.push(`${label}: ${reason}`);
        logEntries.push(buildRepoGradingLogEntry({ repo: student.repo, outcome: "skipped", reason, at: new Date().toISOString() }));
        continue;
      }

      const progressFolder = folderPath ? ` (${folderPath}/)` : "";
      onProgress(`Grading ${i + 1}/${students.length}: ${label}${progressFolder}...`);
      const r = await gradeRepoAction(
        student.repo,
        folderInstructions,
        folderRubric,
        helpers.provider,
        undefined,
        folderPath || undefined
      );

      if ("error" in r) {
        notes.push(`${label}: ${r.error}`);
        logEntries.push(buildRepoGradingLogEntry({ repo: student.repo, outcome: "failed", reason: r.error, at: new Date().toISOString() }));
        continue;
      }

      // FIX 2: nothing was submitted - not a failure, not a grade. Recorded
      // as its own "no-submission" outcome (never "failed" - the read
      // succeeded and correctly found nothing to grade).
      if ("noSubmission" in r) {
        notes.push(`${label}: ${r.reason}`);
        logEntries.push(
          buildRepoGradingLogEntry({
            repo: student.repo,
            outcome: "no-submission",
            reason: r.reason,
            at: new Date().toISOString(),
            digestTruncated: r.digestTruncated,
          })
        );
        continue;
      }

      const gr = r.run.results[0];
      if (!gr) {
        const reason = "no result returned";
        notes.push(`${label}: ${reason}`);
        logEntries.push(
          buildRepoGradingLogEntry({
            repo: student.repo,
            outcome: "failed",
            reason,
            at: new Date().toISOString(),
            digestTruncated: r.digestTruncated,
          })
        );
        continue;
      }

      gr.student = student.student || gr.student;
      gr.userId = student.canvasUserId && /^\d+$/.test(student.canvasUserId) ? Number(student.canvasUserId) : undefined;
      results.push(gr);
      logEntries.push(
        buildRepoGradingLogEntry({
          repo: student.repo,
          outcome: "graded",
          score: gr.totalScore,
          at: new Date().toISOString(),
          digestTruncated: r.digestTruncated,
        })
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      notes.push(`${label}: ${reason}`);
      logEntries.push(buildRepoGradingLogEntry({ repo: student.repo, outcome: "failed", reason, at: new Date().toISOString() }));
    }
  }

  const repoGradingLog: RepoGradingRunLog = buildRepoGradingRunLog(logEntries, { truncated, notReached });

  // Step 7: Assemble GradingRunEntry and save the draft.
  const rubricAreaNames = results[0]?.rubricAreas.map((a) => a.area) ?? [];
  const entry: GradingRunEntry = {
    courseName: tile.name,
    assignmentName: moduleName,
    canvasUrl: assignmentUrl,
    run: { results, rubricAreaNames, fullCreditChecklist: [], speedGraderUrl: null },
    institution: tile.institution || undefined,
    pointsPossible:
      pointsPossibleRaw !== "" && Number.isFinite(Number(pointsPossibleRaw)) ? Number(pointsPossibleRaw) : null,
  };

  const summary = `${tile.name} - ${moduleName}: graded ${results.length} repo(s)`;
  // R1.3: the log rides on this SAME write - never a second row, never a
  // follow-up patch. If this save fails, the log goes with it (nothing to
  // attach it to), which is correct.
  const saveRes = await saveGradingDraftAction(
    summary,
    { runs: [entry], repoGradingLog },
    helpers.workflowId,
    helpers.workflowName,
    "repos"
  );
  if ("error" in saveRes) throw new Error(saveRes.error);

  return {
    draftId: saveRes.id,
    graded: results.length,
    moduleName,
    summaryText: `${summary}.${notes.length ? ` (${notes.join("; ")})` : ""}`,
    repoGradingLog,
  };
}

// Batch-grades every currently-running course tile in `ids` (the
// batch-grade-repos-to-draft step's all-courses fan-out). A tile that has not
// started or has already finished is SKIPPED WITH A NOTE - never graded -
// exactly like draft-upcoming-lectures' own hubCourseList "*" sweep, using the
// same courseProgressStatus classification draft-missing-zeros' all-courses
// path uses. Per-course isolation: each tile runs inside its own try/catch, so
// one course's failure (no repos configured, a Canvas/GitHub error, ...) is
// recorded as a note and the loop always continues to the next course - it
// never aborts the run. Course-specific single-course inputs (instructions
// repo, a fixed Canvas assignment URL, points possible) do not apply across a
// mixed set of courses, so this path always uses folder-per-module discovery
// (each student's own repo README) and leaves the draft's Canvas assignment
// URL/points blank - postable to Canvas only via the single-course path.
export async function batchGradeReposAcrossCourses(
  ids: string[],
  helpers: StepRunHelpers,
  onProgress: (msg: string) => void
): Promise<StepRunResult> {
  const list = await listCourseHubAction();
  if ("error" in list) throw new Error(list.error);

  const notes: string[] = [];
  const draftIds: string[] = [];
  let totalGraded = 0;
  let coursesProcessed = 0;

  for (const id of ids) {
    const tile = list.courses.find((c) => c.id === id);
    if (!tile) {
      notes.push(`${id}: course tile not found - skipped`);
      continue;
    }

    try {
      const weekResolution = await resolveTileCurrentWeek(tile, helpers);
      if ("skip" in weekResolution) {
        notes.push(`${tile.name}: ${weekResolution.skip} - skipped`);
        continue;
      }

      const status = courseProgressStatus(weekResolution.rawWeek, tile.weeks);
      if (status === "not-started") {
        notes.push(`${tile.name}: has not started yet - skipped`);
        continue;
      }
      if (status === "complete") {
        notes.push(`${tile.name}: already finished - skipped`);
        continue;
      }

      onProgress(`Grading repos for ${tile.name}...`);
      const result = await gradeTileRepos({
        tile,
        rawWeek: weekResolution.rawWeek,
        status,
        instrRepoRef: "",
        userRubric: "",
        assignmentUrl: "",
        pointsPossibleRaw: "",
        helpers,
        onProgress,
      });

      coursesProcessed++;
      totalGraded += result.graded;
      if (result.draftId) draftIds.push(result.draftId);
      notes.push(result.summaryText);
    } catch (err) {
      // Per-course isolation: an unexpected failure anywhere above (no student
      // repos, a Canvas/GitHub error, etc.) is recorded as a note and the loop
      // moves on to the next course tile - it never aborts the run.
      notes.push(`${tile.name}: ${err instanceof Error ? err.message : "failed"} - skipped`);
    }
  }

  const summaryLabel = `Processed ${coursesProcessed} course(s); graded ${totalGraded} repo(s).`;
  return {
    outputs: { draftId: draftIds.join("\n"), graded: totalGraded, moduleName: `${coursesProcessed} course(s)` },
    summary: { kind: "list", label: summaryLabel, items: notes.length ? notes : ["(nothing to report)"] },
  };
}
