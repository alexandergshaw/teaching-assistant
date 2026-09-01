// Support functions for the "grade-repo" step (single repo, plus its org
// fan-out) - split out of steps.grading-repos.helpers.ts (which had grown
// past this repo's 1000-line-per-file cap): the run-loop pacing bound
// (repoGradingStopAt), draft persistence + the re-run guard
// (saveRepoGradingDraft and its private helpers), the two "nothing to grade"
// diagnosability messages (describeGradeRepoInputError,
// describeOrgRepoScanError), the org-enumeration fan-out (gradeOrgRepos), and
// the README fallback resolver (resolveReadmeInstructions).
//
// gradeTileRepos and batchGradeReposAcrossCourses - the "batch-grade-repos-
// to-draft" step's support functions - stay in steps.grading-repos.helpers.ts,
// which imports repoGradingStopAt/saveRepoGradingDraft/
// describeGradeRepoInputError/describeOrgRepoScanError/gradeOrgRepos/
// resolveReadmeInstructions from here and re-exports them under their
// original names, so every existing importer (steps.grading-repos.ts,
// steps.grading-repos.stop-at.test.ts,
// steps.grading-repos.unattended-report.test.ts) is unchanged - the same
// re-export idiom steps.grading-repos.ts already uses for
// describeGradeRepoInputError/describeOrgRepoScanError/
// resolveReadmeInstructions. This file has no dependency back on
// steps.grading-repos.helpers.ts, so there is no import cycle.

import {
  listCourseHubAction,
  gradeRepoAction,
  saveGradingDraftAction,
  deleteGradingDraftAction,
  findPendingGradingDraftForWorkflowAction,
  getRepoTreeAction,
  getFileTextAction,
  listOrgReposAction,
} from "@/app/actions";
import type { StepRunHelpers, StepRunResult } from "@/lib/workflows/registry-helpers";
import type { GradingRunEntry, GradeResult } from "@/lib/grade";
import {
  buildRepoGradingLogEntry,
  buildRepoGradingReportMarkdown,
  buildRepoGradingRunLog,
  repoGradingLogFileName,
  type RepoGradingLogEntry,
  type RepoGradingRunLog,
} from "@/lib/repo-grading-log";

// R1 (docs/repo-grading-records-acceptance-criteria.md): gradeTileRepos and
// gradeOrgRepos loop internally, so they must stop themselves before the
// platform kills them - a hard kill saves NOTHING, not even the record of what
// was managed, which is the actual failure this bounding exists to avoid.
//
// The bound is the RUN'S OWN DEADLINE when there is one. It arrives on
// `helpers.deadlineMs`, threaded down by `runWorkflowUnattended` from the same
// value it already enforces between steps (`server-runner.ts`) - which is the
// cron route's `now + 50s` inside a 60-second cap. This replaced a hardcoded
// 45s: guessing a duration when the caller knows the real instant means the
// guess is wrong in both directions - too generous if the run started late
// (releases run first, under their own sub-budget), and needlessly mean if the
// cap is ever raised.
//
// SAVE_RESERVE_MS is subtracted because stopping AT the deadline leaves no
// time to persist anything, which would recreate the exact problem: the loop
// must end while the process is still alive to write the draft and the
// unattended report.
const SAVE_RESERVE_MS = 8_000;

// Used ONLY when no deadline was threaded - an attended run, or a caller that
// predates the field. It is a bound, not a schedule: absent a known deadline,
// an unbounded loop is the one option that is definitely wrong.
const FALLBACK_BUDGET_MS = 45_000;

/**
 * The instant these loops stop starting new repos. Pure and exported so the
 * decision is testable without a workflow, a clock, or a Canvas call.
 *
 * Checked once per repo, never mid-repo, so a single very slow grading call
 * can still overrun slightly - the goal is bounding how many MORE repos are
 * attempted once time is short, not millisecond precision.
 */
export function repoGradingStopAt(deadlineMs: number | undefined, startedAt: number): number {
  return deadlineMs !== undefined ? deadlineMs - SAVE_RESERVE_MS : startedAt + FALLBACK_BUDGET_MS;
}

// --- grade-repo draft persistence + re-run guard (AC1/AC2/AC3/AC4/AC5) -----
//
// The instructor's actual complaint: grade-repo graded repos (single or, via
// gradeOrgRepos above, org fan-out) but never persisted anything - the
// grades existed only in the run log, never in Drafted Grades, unlike
// gradeTileRepos's batch-grade-repos-to-draft. Fixed by reusing
// saveGradingDraftAction and the exact GradingRunEntry/GradingDraftPayload
// shape gradeTileRepos builds above (source "repos") - no second draft
// writer, no second payload shape (AC1).
//
// AC3's flood risk: the instructor's workflow runs unattended every 15
// minutes. Without a guard, every tick would insert another pending draft
// and Drafted Grades would fill with near-identical drafts within a day.
// Identity rule: "the same workflow's still-pending repos draft"
// (findPendingGradingDraftForWorkflowAction, scoped by workflow_id + source
// + status=pending) - NOT the set of repos graded, because an org fan-out's
// repo set legitimately grows as students submit, and keying on the repo set
// would defeat the guard on every run that saw a new submission. At most one
// pending "repos" draft exists per workflow at a time; once the instructor
// reviews/posts it (status flips to "reviewed"), the next run starts fresh.
//
// Within that one candidate draft: if the freshly graded results are
// field-for-field equivalent to what's already pending (fingerprintGradeResult
// below), the run is a genuine no-op re-run - skip, write nothing. If they
// differ in ANY way (a changed score, a dropped/added repo, ...), the stale
// draft is deleted and replaced with the fresh one, so a changed score is
// never silently lost inside a draft the instructor will never look at again
// - their next glance at Drafted Grades always shows the CURRENT grade.
async function findEquivalentOrReplaceableDraft(
  helpers: StepRunHelpers,
  freshResults: GradeResult[]
): Promise<{ skip: true; draftId: string } | { skip: false }> {
  if (!helpers.workflowId) {
    // No workflow context (e.g. an attended one-off run) - nothing to key
    // the re-run guard off of, so every run saves independently.
    return { skip: false };
  }
  try {
    const existingRes = await findPendingGradingDraftForWorkflowAction(helpers.workflowId, "repos");
    if ("error" in existingRes || !existingRes.draft) return { skip: false };

    const priorResults = existingRes.draft.payload.runs.flatMap((r) => r.run.results);
    if (sameGradeResults(priorResults, freshResults)) {
      return { skip: true, draftId: existingRes.draft.id };
    }

    const delRes = await deleteGradingDraftAction(existingRes.draft.id);
    if ("error" in delRes) {
      // Could not clear the stale draft; fall through and save anyway. Worst
      // case for this one tick is a duplicate pending draft, which self-heals
      // once the guard's lookup/delete succeeds on a later run - far better
      // than losing a completed (LLM-expensive) grading run over this.
    }
    return { skip: false };
  } catch {
    // The guard lookup itself failing (network, auth, ...) must never block
    // saving the actual grading results - fall through to a normal save.
    return { skip: false };
  }
}

/** Fingerprints one grading result for the re-run equivalence check (AC3):
 * student + total score + each rubric area's score. Feedback/comment text is
 * intentionally excluded - only the numbers an instructor would act on are
 * compared, so a purely cosmetic reword of feedback (same score) still
 * counts as "the same" and does not replace the pending draft. */
function fingerprintGradeResult(r: GradeResult): string {
  const areas = r.rubricAreas
    .map((a) => `${a.area}:${a.score}`)
    .sort()
    .join(",");
  return `${r.student}|${r.totalScore}|${areas}`;
}

/** Whether two grading-result sets are equivalent for AC3's purposes - the
 * same students graded, with the same scores, regardless of array order. */
function sameGradeResults(a: GradeResult[], b: GradeResult[]): boolean {
  if (a.length !== b.length) return false;
  const fa = a.map(fingerprintGradeResult).sort();
  const fb = b.map(fingerprintGradeResult).sort();
  return fa.every((v, i) => v === fb[i]);
}

/** Saves one grade-repo run as a grading draft (AC1/AC2), applying the
 * re-run guard above (AC3) and never throwing on a failed save (AC4) - a
 * failure comes back as `saveError` so the caller can surface it in its
 * summary while still reporting the grading it completed. Writes nothing
 * when nothing was graded (AC5).
 *
 * R1.3: `repoGradingLog`, when given, rides on this exact write (never a
 * second row, never a follow-up patch) - so it is dropped along with
 * everything else on AC5's empty-run early return and on the AC3 skip path
 * (an unchanged re-run does not get a new/updated log, matching "never a
 * follow-up patch"). */
export async function saveRepoGradingDraft(opts: {
  entry: GradingRunEntry;
  summary: string;
  helpers: StepRunHelpers;
  repoGradingLog?: RepoGradingRunLog;
}): Promise<{ draftId: string; saveError?: string }> {
  const { entry, summary, helpers, repoGradingLog } = opts;

  // R1.4: an UNATTENDED run also leaves a Markdown report, and it is written
  // HERE - above every early return below - because the run this exists for is
  // precisely the one those returns discard. A cron batch where every repo was
  // skipped produces no draft (the AC5 return), so without this it leaves no
  // trace at all, and "nothing happened" is indistinguishable from "it never
  // ran". An attended run does not need it: someone is looking at the result
  // note.
  //
  // Best-effort and never fatal: a failed report must not cost the instructor
  // the draft that follows it. `saveRunReport` is optional on StepRunHelpers
  // and absent in some attended contexts, hence the guard.
  if (helpers.unattended && repoGradingLog && helpers.saveRunReport) {
    try {
      // The stamp comes from the run's own first entry, not a fresh clock
      // read, so the filename and the report body agree about when this ran
      // even if the write itself is slow.
      const title = helpers.workflowName ?? "Repo grading";
      const generatedAt = repoGradingLog.entries[0]?.at ?? "";
      await helpers.saveRunReport(
        repoGradingLogFileName(title, "md", generatedAt),
        buildRepoGradingReportMarkdown(repoGradingLog, { title, generatedAt })
      );
    } catch (err) {
      console.error("Failed to save the unattended repo-grading report:", err);
    }
  }

  if (entry.run.results.length === 0) {
    // AC5: a run that graded nothing writes nothing.
    return { draftId: "" };
  }

  const guard = await findEquivalentOrReplaceableDraft(helpers, entry.run.results);
  if (guard.skip) {
    return { draftId: guard.draftId };
  }

  const saveRes = await saveGradingDraftAction(
    summary,
    { runs: [entry], ...(repoGradingLog ? { repoGradingLog } : {}) },
    helpers.workflowId,
    helpers.workflowName,
    "repos"
  );
  if ("error" in saveRes) {
    return { draftId: "", saveError: saveRes.error };
  }
  return { draftId: saveRes.id };
}

// --- grade-repo diagnosability helpers (single-repo "Grade a repository"
// step's two "nothing to grade" failures) ------------------------------------
//
// Both used to throw a bare "Provide a repository." / "Provide the
// assignment instructions." with no repo, branch, folder, or README context -
// so when a fan-out (course/institution scope) reruns this same step index
// many times in one unattended run, the aggregate detail collapsed into the
// same one or two sentences repeated across every failure, telling an
// instructor nothing about which item actually failed. describeGradeRepoInputError
// is the one place that builds the message for either case, so it stays
// unit-testable without touching GitHub or a real run.

/** Builds a diagnosable error message for grade-repo's two "nothing to
 * grade" failures, naming the concrete repo/branch/folder context the step
 * actually has - and, for instructions, which README paths were tried -
 * rather than a bare "Provide a repository."/"Provide the assignment
 * instructions." that tells someone running many repos nothing at all. */
export function describeGradeRepoInputError(
  missing: "repo" | "instructions",
  ctx: { repo?: string; branch?: string; folder?: string; triedReadmePaths?: string[] }
): string {
  const parts: string[] = [];
  if (missing === "instructions" && ctx.repo) parts.push(ctx.repo);
  if (ctx.branch) parts.push(`branch "${ctx.branch}"`);
  if (ctx.folder) parts.push(`folder "${ctx.folder}"`);
  const context = parts.length > 0 ? ` (${parts.join(", ")})` : "";

  if (missing === "repo") {
    return `Grade a repository: the Repository input resolved to empty${context} - check what is bound to it.`;
  }

  const tried =
    ctx.triedReadmePaths && ctx.triedReadmePaths.length > 0
      ? ctx.triedReadmePaths.join(", ")
      : "no README paths";
  return `Grade a repository${context}: the Assignment instructions input resolved to empty and no usable README was found (tried ${tried}) - provide instructions directly, or add a README.md.`;
}

// --- grade-repo org enumeration (AC1) ---------------------------------------
//
// The instructor's report: grade-repo's Repository input kept resolving
// empty across a fan-out (once per course tile), because the only way to
// feed it a repo was a literal/step-output binding - nothing tied it to a
// course tile's configured GitHub org at all, even though the course tile
// already carries `githubOrg` (src/lib/supabase/courses.ts) and
// listOrgRepos/listOrgReposAction (src/lib/github.repos.ts,
// src/app/actions/github.ts) already know how to enumerate it - the RosterCell
// UI already calls listOrgReposAction for the same org field. Adding an
// optional "Course tile" input (type "hubCourse") to grade-repo lets it cue
// off the org: when Repository is left blank and a course tile is bound (via
// an explicit binding, or inherited from workflow scope, or pinned per
// iteration by a course-tile fan-out - see scopeCoversType in
// src/lib/workflows/types.ts), every repo in that tile's org is graded
// instead of requiring one repo to be wired up per run.

/** Builds a diagnosable error message for grade-repo's org-enumeration path
 * (AC1.2): a blank/missing githubOrg on the bound course tile, an org with no
 * repositories, and a GitHub API failure while listing the org each get their
 * own distinct, actionable message naming the org/tile - never the generic
 * "Repository input resolved to empty" that told the instructor nothing about
 * which of many fanned-out course tiles was the problem. */
export function describeOrgRepoScanError(
  kind: "blank-org" | "empty-org" | "api-error",
  ctx: { org?: string; tileName?: string; detail?: string }
): string {
  if (kind === "blank-org") {
    return `Grade a repository: "${ctx.tileName ?? "the course tile"}" has no GitHub org configured - set one on the course tile, or provide Repository directly.`;
  }
  if (kind === "empty-org") {
    return `Grade a repository: the GitHub org "${ctx.org}" has no repositories to grade.`;
  }
  const detail = (ctx.detail ?? "").trim().replace(/\.$/, "");
  return `Grade a repository: could not list repositories in the GitHub org "${ctx.org}"${detail ? `: ${detail}` : ""}.`;
}

/** Grades every repository in a course tile's GitHub org (AC1.1) - the
 * grade-repo step's fallback when Repository is left blank and a course tile
 * is bound. Per-repo isolation (AC1.3): each repo runs inside its own
 * try/catch and a failure is recorded as a note rather than aborting the
 * batch, mirroring batchGradeReposAcrossCourses's per-course isolation above. */
export async function gradeOrgRepos(opts: {
  hubCourseId: string;
  instructions: string;
  rubric: string;
  branch: string | undefined;
  folder: string | undefined;
  helpers: StepRunHelpers;
  onProgress: (msg: string) => void;
}): Promise<StepRunResult> {
  const { hubCourseId, instructions, rubric, branch, folder, helpers, onProgress } = opts;

  const list = await listCourseHubAction();
  if ("error" in list) throw new Error(list.error);
  const tile = list.courses.find((c) => c.id === hubCourseId);
  if (!tile) throw new Error("Grade a repository: the bound course tile was not found.");

  const org = (tile.githubOrg ?? "").trim();
  if (!org) {
    throw new Error(describeOrgRepoScanError("blank-org", { tileName: tile.name }));
  }

  onProgress(`Listing repositories in ${org}...`);
  const reposRes = await listOrgReposAction(org);
  if ("error" in reposRes) {
    throw new Error(describeOrgRepoScanError("api-error", { org, detail: reposRes.error }));
  }
  if (reposRes.repos.length === 0) {
    throw new Error(describeOrgRepoScanError("empty-org", { org }));
  }

  const notes: string[] = [];
  const summaryBlocks: string[] = [];
  // Accumulated across every repo so the whole fan-out saves as ONE grading
  // draft entry (AC2), matching how gradeTileRepos groups a batch into one
  // entry rather than one draft per repo.
  const results: GradeResult[] = [];
  let graded = 0;
  // R1.2/R1.5: same per-repo attempt record and truncation tracking as
  // gradeTileRepos above - see that function's own comments.
  const logEntries: RepoGradingLogEntry[] = [];
  let truncated = false;
  const notReached: string[] = [];
  const stopAt = repoGradingStopAt(helpers.deadlineMs, Date.now());

  for (let i = 0; i < reposRes.repos.length; i++) {
    const fullName = reposRes.repos[i].fullName;

    if (Date.now() >= stopAt) {
      truncated = true;
      notReached.push(...reposRes.repos.slice(i).map((r) => r.fullName));
      break;
    }

    try {
      onProgress(`Grading ${i + 1}/${reposRes.repos.length}: ${fullName}...`);

      let repoInstructions = instructions;
      let instructionsSourceNote = "";
      if (!repoInstructions) {
        const readmeRes = await resolveReadmeInstructions(fullName, branch, folder);
        if ("error" in readmeRes) {
          const reason = `the Assignment instructions input resolved to empty and no usable README was found (tried ${readmeRes.tried.join(", ")})`;
          notes.push(`${fullName}: ${reason}`);
          logEntries.push(buildRepoGradingLogEntry({ repo: fullName, outcome: "skipped", reason, at: new Date().toISOString() }));
          continue;
        }
        repoInstructions = readmeRes.text;
        instructionsSourceNote = ` (instructions from ${readmeRes.path})`;
      }

      const r = await gradeRepoAction(fullName, repoInstructions, rubric, helpers.provider, branch, folder);
      if ("error" in r) {
        notes.push(`${fullName}: ${r.error}`);
        logEntries.push(buildRepoGradingLogEntry({ repo: fullName, outcome: "failed", reason: r.error, at: new Date().toISOString() }));
        continue;
      }

      // FIX 2: nothing was submitted - not a failure, not a grade. See the
      // identical branch in gradeTileRepos above for the full rationale.
      if ("noSubmission" in r) {
        notes.push(`${fullName}: ${r.reason}`);
        logEntries.push(
          buildRepoGradingLogEntry({
            repo: fullName,
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
        notes.push(`${fullName}: ${reason}`);
        logEntries.push(
          buildRepoGradingLogEntry({
            repo: fullName,
            outcome: "failed",
            reason,
            at: new Date().toISOString(),
            digestTruncated: r.digestTruncated,
          })
        );
        continue;
      }

      graded += 1;
      results.push(gr);
      notes.push(`${fullName}: graded${gr.totalScore ? ` - ${gr.totalScore}` : ""}${instructionsSourceNote}`);
      logEntries.push(
        buildRepoGradingLogEntry({
          repo: fullName,
          outcome: "graded",
          score: gr.totalScore,
          at: new Date().toISOString(),
          digestTruncated: r.digestTruncated,
        })
      );

      const block: string[] = [`${fullName}${instructionsSourceNote}`];
      if (gr.totalScore) block.push(`Total Score: ${gr.totalScore}`);
      for (const area of gr.rubricAreas) {
        if (area.score) block.push(`${area.area}: ${area.score}`);
      }
      if (gr.overallComment) block.push(`Feedback: ${gr.overallComment}`);
      summaryBlocks.push(block.join("\n"));
    } catch (err) {
      // Per-repo isolation (AC1.3): one repo that cannot be read/graded (a
      // private/deleted repo, a transient GitHub error, ...) is recorded as a
      // note and the loop moves on to the next repo - it never aborts the run.
      const reason = err instanceof Error ? err.message : "failed";
      notes.push(`${fullName}: ${reason}`);
      logEntries.push(buildRepoGradingLogEntry({ repo: fullName, outcome: "failed", reason, at: new Date().toISOString() }));
    }
  }

  const repoGradingLog: RepoGradingRunLog = buildRepoGradingRunLog(logEntries, { truncated, notReached });

  const gradeSummary = summaryBlocks.join("\n\n").trim();
  const label = `Graded ${graded}/${reposRes.repos.length} repo(s) in ${org}.`;

  // AC1/AC2/AC6: one draft covering every repo graded this run, in the same
  // "<tile> - <module>: graded N repo(s)" convention gradeTileRepos uses, so
  // repo-sourced drafts read consistently in Drafted Grades no matter which
  // step produced them.
  const rubricAreaNames = results[0]?.rubricAreas.map((a) => a.area) ?? [];
  const entry: GradingRunEntry = {
    courseName: tile.name,
    assignmentName: "Grade a repository",
    canvasUrl: "",
    run: { results, rubricAreaNames, fullCreditChecklist: [], speedGraderUrl: null },
    institution: tile.institution || undefined,
    pointsPossible: null,
  };
  const draftSummary = `${tile.name} - Grade a repository: graded ${results.length} repo(s)`;
  const saveResult = await saveRepoGradingDraft({ entry, summary: draftSummary, helpers, repoGradingLog });

  // AC4: a failed save never discards the grading itself - it's surfaced as
  // an extra note alongside every per-repo result already gathered above.
  const finalNotes = saveResult.saveError
    ? [`Could not save the grading draft: ${saveResult.saveError}`, ...notes]
    : notes;

  return {
    outputs: { gradeSummary, draftId: saveResult.draftId },
    summary: { kind: "list", label, items: finalNotes.length ? finalNotes : ["(nothing to report)"] },
  };
}

/** Resolves fallback assignment instructions from the repository's own
 * README when grade-repo's Assignment instructions input is left blank: the
 * assignment folder's own README first (when the step is pointed at a
 * folder), then the repository root README - reusing getRepoTreeAction +
 * getFileTextAction, the same case-insensitive README lookup gradeTileRepos
 * already uses for the batch/folder-per-module path above, rather than a
 * third way of finding a README. Returns which paths were tried so a genuine
 * failure can name them (see describeGradeRepoInputError). */
export async function resolveReadmeInstructions(
  repo: string,
  branch: string | undefined,
  folder: string | undefined
): Promise<{ text: string; path: string } | { error: true; tried: string[] }> {
  const treeRes = await getRepoTreeAction(repo, branch);
  if ("error" in treeRes) {
    return { error: true, tried: folder ? [`${folder}/README.md`, "README.md"] : ["README.md"] };
  }

  const findReadme = (dirPrefix: string): string | undefined => {
    const wantedDepth = dirPrefix ? dirPrefix.split("/").length + 1 : 1;
    return treeRes.tree.find((e) => {
      if (!/readme\.md$/i.test(e.path)) return false;
      if (e.path.split("/").length !== wantedDepth) return false;
      if (!dirPrefix) return true;
      return e.path.toLowerCase().startsWith(`${dirPrefix.toLowerCase()}/`);
    })?.path;
  };

  const tried: string[] = [];

  if (folder) {
    const folderReadmePath = findReadme(folder);
    if (folderReadmePath) {
      const fileRes = await getFileTextAction(repo, folderReadmePath, branch);
      if (!("error" in fileRes) && fileRes.content.trim()) {
        return { text: fileRes.content, path: folderReadmePath };
      }
    }
    tried.push(`${folder}/README.md`);
  }

  const rootReadmePath = findReadme("");
  if (rootReadmePath) {
    const fileRes = await getFileTextAction(repo, rootReadmePath, branch);
    if (!("error" in fileRes) && fileRes.content.trim()) {
      return { text: fileRes.content, path: rootReadmePath };
    }
  }
  tried.push("README.md");

  return { error: true, tried };
}
