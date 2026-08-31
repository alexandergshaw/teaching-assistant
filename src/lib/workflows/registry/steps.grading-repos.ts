// gradingRepoSteps (the StepDefinition[] array) lives here. The internal
// logic it calls - gradeTileRepos, saveRepoGradingDraft,
// describeGradeRepoInputError, describeOrgRepoScanError, gradeOrgRepos,
// resolveReadmeInstructions, batchGradeReposAcrossCourses - moved to
// steps.grading-repos.helpers.ts once this file grew past this repo's
// 1000-line-per-file cap (see AGENTS.md). describeGradeRepoInputError,
// describeOrgRepoScanError, and resolveReadmeInstructions are re-exported
// below under their original names so every existing importer (in
// particular steps.grading-repos.grade-repo.test.ts) is unchanged.
import {
  generateModelAnswerAction,
  gradeRepoAction,
  deleteGradingDraftAction,
  generateFullCreditChecklistAction,
  getInstitutionCountsAction,
  listConfiguredInstitutionsAction,
  listCourseHubAction,
} from "@/app/actions";
import {
  type StepDefinition,
  resolveTileCurrentWeek,
} from "@/lib/workflows/registry-helpers";
import type { GradingRunEntry } from "@/lib/grade";
import { buildRepoGradingLogEntry, buildRepoGradingRunLog, type RepoGradingRunLog } from "@/lib/repo-grading-log";
import { courseProgressStatus } from "@/lib/week-numbering";
import { requireInstitution } from "@/lib/institution-resolution";
import {
  gradeTileRepos,
  saveRepoGradingDraft,
  describeGradeRepoInputError,
  describeOrgRepoScanError,
  gradeOrgRepos,
  resolveReadmeInstructions,
  batchGradeReposAcrossCourses,
} from "./steps.grading-repos.helpers";

export { describeGradeRepoInputError, describeOrgRepoScanError, resolveReadmeInstructions };

export const gradingRepoSteps: StepDefinition[] = [
  {
    type: "generate-full-credit-checklist",
    name: "Generate a full-credit checklist",
    description: "Produce a short student-facing 'how to earn full credit' checklist from an assignment's instructions and rubric.",
    inputs: [
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
      { key: "rubric", label: "Rubric", type: "longtext", required: false },
    ],
    outputs: [
      { key: "checklist", label: "Checklist", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) throw new Error("Provide the assignment instructions.");
      const rubric = String(values.rubric ?? "");

      onProgress("Generating checklist...");
      const r = await generateFullCreditChecklistAction(instructions, rubric, helpers.provider);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: { checklist: r.checklist },
        summary: { kind: "text", text: r.checklist },
      };
    },
  },

  {
    type: "check-needs-grading",
    name: "Check for work needing grading",
    description: "Count submissions waiting to be graded (and unread messages) for an institution, so a scheduled run can fire only when work is waiting.",
    inputs: [
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Defaults to the active institution.",
      },
    ],
    outputs: [
      { key: "needsGrading", label: "Submissions needing grading", type: "number" },
      { key: "unread", label: "Unread messages", type: "number" },
      { key: "hasWork", label: "Has work waiting", type: "boolean" },
      { key: "summary", label: "Summary", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const configuredResult = await listConfiguredInstitutionsAction();
      const inst = requireInstitution({
        bound: String(values.institution ?? ""),
        active: helpers.activeInstitution,
        configured: "acronyms" in configuredResult ? configuredResult.acronyms : [],
      });

      onProgress("Checking for pending work...");
      const r = await getInstitutionCountsAction([inst]);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const needsGrading = r.counts.reduce((n, c) => n + c.needsGrading, 0);
      const unread = r.counts.reduce((n, c) => n + c.unread, 0);

      return {
        outputs: {
          needsGrading,
          unread,
          hasWork: needsGrading > 0 ? "1" : "",
          summary: `${inst}: ${needsGrading} submission(s) need grading, ${unread} unread message(s)`,
        },
        summary: {
          kind: "text",
          text: `${needsGrading} submission(s) need grading; ${unread} unread message(s).`,
        },
      };
    },
  },

  {
    type: "discard-grading-draft",
    name: "Discard a grading draft",
    description: "Delete a pending grading draft during review triage. Attended-only.",
    inputs: [
      { key: "draftId", label: "Draft id", type: "text", required: true },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const draftId = String(values.draftId ?? "").trim();
      if (!draftId) {
        throw new Error("Provide the grading draft id.");
      }

      onProgress("Discarding draft...");
      const r = await deleteGradingDraftAction(draftId);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: {},
        summary: { kind: "text", text: `Discarded grading draft ${draftId}.` },
      };
    },
  },

  {
    type: "generate-model-answer",
    name: "Generate a model answer",
    description: "Write a full-credit model answer for an assignment against its rubric, as an instructor reference.",
    inputs: [
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
      { key: "rubric", label: "Rubric", type: "longtext", required: false },
    ],
    outputs: [
      { key: "modelAnswer", label: "Model answer", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) {
        throw new Error("Provide the assignment instructions.");
      }

      const rubric = String(values.rubric ?? "");
      onProgress("Writing model answer...");
      const r = await generateModelAnswerAction(instructions, rubric, helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { modelAnswer: r.modelAnswer },
        summary: { kind: "text", text: r.modelAnswer },
      };
    },
  },

  {
    type: "grade-repo",
    name: "Grade a repository",
    description: "AI-grade a single student repository against a rubric and save the result as a reviewable grading draft, alongside the score and feedback (does not post to the LMS). When Repository is left blank and Course tile is set, grades every repository in that tile's GitHub org instead of requiring one repo per run, saving all of them as one draft.",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
      { key: "rubric", label: "Rubric", type: "longtext", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
      {
        key: "folder",
        label: "Assignment folder (optional)",
        type: "text",
        required: false,
        help: "Grade only this folder in the repo. When Assignment instructions is left blank, its README.md is tried first, falling back to the repo's root README.",
      },
      {
        key: "hubCourse",
        label: "Course tile (optional)",
        type: "hubCourse",
        required: false,
        help: "When Repository is left blank, grades every repository in this course tile's GitHub org instead of a single repo. Ignored when Repository is set.",
      },
    ],
    outputs: [
      { key: "gradeSummary", label: "Grade and feedback", type: "longtext" },
      { key: "draftId", label: "Draft id", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      const branch = String(values.branch ?? "").trim() || undefined;
      const folder = String(values.folder ?? "").trim().replace(/^\/+|\/+$/g, "") || undefined;
      const hubCourseId = String(values.hubCourse ?? "").trim();

      if (!repo && hubCourseId) {
        return gradeOrgRepos({
          hubCourseId,
          instructions: String(values.instructions ?? "").trim(),
          rubric: String(values.rubric ?? ""),
          branch,
          folder,
          helpers,
          onProgress,
        });
      }

      if (!repo) {
        throw new Error(describeGradeRepoInputError("repo", { branch, folder }));
      }

      // Instructions supplied -> unchanged behavior, no README read at all.
      // Instructions blank -> fall back to the repo's (or folder's) README
      // before failing; only when no README yields usable text does this fail,
      // and the error names which paths were tried.
      let instructions = String(values.instructions ?? "").trim();
      let instructionsSourceNote = "";
      if (!instructions) {
        onProgress("Assignment instructions blank - reading the repository README...");
        const readmeRes = await resolveReadmeInstructions(repo, branch, folder);
        if ("error" in readmeRes) {
          throw new Error(
            describeGradeRepoInputError("instructions", {
              repo,
              branch,
              folder,
              triedReadmePaths: readmeRes.tried,
            })
          );
        }
        instructions = readmeRes.text;
        instructionsSourceNote = `Instructions read from ${readmeRes.path}.`;
      }

      const rubric = String(values.rubric ?? "");

      onProgress("Grading repository...");
      const r = await gradeRepoAction(repo, instructions, rubric, helpers.provider, branch, folder);
      if ("error" in r) {
        throw new Error(r.error);
      }

      // FIX 2: nothing was submitted - never a grade, never surfaced as a
      // failure (the read succeeded; there was correctly nothing to grade).
      // Still recorded as its own "no-submission" outcome so an unattended
      // run's report shows it, same as gradeTileRepos/gradeOrgRepos below.
      if ("noSubmission" in r) {
        const repoGradingLog: RepoGradingRunLog = buildRepoGradingRunLog([
          buildRepoGradingLogEntry({
            repo: r.fullName,
            outcome: "no-submission",
            reason: r.reason,
            at: new Date().toISOString(),
            digestTruncated: r.digestTruncated,
          }),
        ]);
        const entry: GradingRunEntry = {
          courseName: r.fullName,
          assignmentName: "Grade a repository",
          canvasUrl: "",
          run: { results: [], rubricAreaNames: [], fullCreditChecklist: [], speedGraderUrl: null },
          pointsPossible: null,
        };
        // AC5 (saveRepoGradingDraft's own rule): zero results writes no
        // draft, but an unattended run's report still gets this repo's
        // no-submission entry - see that function's own header comment.
        const saveResult = await saveRepoGradingDraft({
          entry,
          summary: `${r.fullName}: nothing to grade`,
          helpers,
          repoGradingLog,
        });
        return {
          outputs: { gradeSummary: r.reason, draftId: saveResult.draftId },
          summary: { kind: "text", text: r.reason },
        };
      }

      const summaryLines: string[] = [];
      summaryLines.push(r.fullName);
      if (instructionsSourceNote) summaryLines.push(instructionsSourceNote);
      summaryLines.push("");

      for (const result of r.run.results) {
        summaryLines.push(`Student: ${result.student}`);
        if (result.totalScore) {
          summaryLines.push(`Total Score: ${result.totalScore}`);
        }
        for (const area of result.rubricAreas) {
          if (area.score) {
            summaryLines.push(`${area.area}: ${area.score}`);
          }
        }
        if (result.overallComment) {
          summaryLines.push(`Feedback: ${result.overallComment}`);
        }
        summaryLines.push("");
      }

      const gradeSummary = summaryLines.join("\n").trim();

      // AC1/AC6: persist the same GradingRunEntry/GradingDraftPayload shape
      // gradeTileRepos builds above, source "repos" - grade-repo used to
      // grade and then discard the result into the run log only, which is
      // why it never showed up in Drafted Grades.
      const rubricAreaNames = r.run.results[0]?.rubricAreas.map((a) => a.area) ?? [];
      const entry: GradingRunEntry = {
        courseName: r.fullName,
        assignmentName: "Grade a repository",
        canvasUrl: "",
        run: { results: r.run.results, rubricAreaNames, fullCreditChecklist: [], speedGraderUrl: null },
        pointsPossible: null,
      };
      const draftSummary = `${r.fullName} - Grade a repository: graded ${r.run.results.length} repo(s)`;
      // R1.2: one repo attempted here (the bound Repository input) - one
      // entry, in the same at-most-one-repo shape gradeOrgRepos/gradeTileRepos
      // build many of. `digestTruncated` (entry 344) rides along either way -
      // it is a fact about this call's ingest, independent of whether a
      // result came back.
      const firstResult = r.run.results[0];
      const repoGradingLog: RepoGradingRunLog = buildRepoGradingRunLog([
        firstResult
          ? buildRepoGradingLogEntry({
              repo: r.fullName,
              outcome: "graded",
              score: firstResult.totalScore,
              at: new Date().toISOString(),
              digestTruncated: r.digestTruncated,
            })
          : buildRepoGradingLogEntry({
              repo: r.fullName,
              outcome: "failed",
              reason: "no result returned",
              at: new Date().toISOString(),
              digestTruncated: r.digestTruncated,
            }),
      ]);
      const saveResult = await saveRepoGradingDraft({ entry, summary: draftSummary, helpers, repoGradingLog });

      // AC4: a failed save never discards the grading itself - the score and
      // feedback are still returned, with the failure surfaced as a warning
      // appended to the same summary text the instructor reads.
      const finalSummaryText = saveResult.saveError
        ? `${gradeSummary}\n\nWarning: could not save the grading draft: ${saveResult.saveError}`
        : gradeSummary;

      return {
        outputs: { gradeSummary, draftId: saveResult.draftId },
        summary: { kind: "text", text: finalSummaryText },
      };
    },
  },

  {
    type: "batch-grade-repos-to-draft",
    name: "Batch grade student repos to a draft",
    description:
      "Grade every student's repo for the current week against a rubric synthesized from the week's README, and save the results as a reviewable grading draft (postable to Canvas when an assignment URL is given). When Course tiles is set, grades every currently-running tile's current week instead of the single Course tile below - tiles that have not started or have already finished are skipped with a note, and one tile's failure never stops the others.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Uses the tile's Student repos and current week. Leave empty when Course tiles below is set.",
      },
      {
        key: "week",
        label: "Current week (optional)",
        type: "number",
        required: false,
        help: "Bind from Find the current week and module, or leave blank to derive from the tile's start date. Ignored when Course tiles is set.",
      },
      {
        key: "instructionsRepo",
        label: "Instructions repo (optional)",
        type: "repo",
        required: false,
        help: "Repo holding the week's assignment README used to synthesize the rubric. Defaults to the tile's first linked repo. Ignored when Course tiles is set (each course's own repos are read instead).",
      },
      {
        key: "rubric",
        label: "Rubric (optional)",
        type: "longtext",
        required: false,
        help: "Provide a rubric directly instead of synthesizing one from the README. Ignored when Course tiles is set.",
      },
      {
        key: "assignmentUrl",
        label: "Canvas assignment URL (optional)",
        type: "text",
        required: false,
        help: "The Canvas assignment these repo grades map to. Provide it to make the draft postable to Canvas. Ignored when Course tiles is set (a single URL cannot span many courses).",
      },
      {
        key: "pointsPossible",
        label: "Points possible (optional)",
        type: "number",
        required: false,
        help: "Ignored when Course tiles is set.",
      },
      {
        key: "hubCourses",
        label: "Course tiles",
        type: "hubCourseList",
        required: false,
        help: "One, several, or all course tiles. When set, grades every currently-running tile's current week instead of the single Course tile above.",
      },
    ],
    outputs: [
      { key: "draftId", label: "Draft id", type: "text" },
      { key: "graded", label: "Repos graded", type: "number" },
      { key: "moduleName", label: "Module", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseIds = String(values.hubCourses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (hubCourseIds.length > 0) {
        return batchGradeReposAcrossCourses(hubCourseIds, helpers, onProgress);
      }

      // Step 1: Load the tile.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile, or select course tiles to run across many courses.");

      onProgress("Reading the course...");
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      // Step 2: Resolve the week (status is used only to label the module name
      // here - unchanged from before this input was added; see
      // batchGradeReposAcrossCourses for the all-courses path's not-started/
      // complete SKIP).
      const boundWeek = Number(values.week);
      let rawWeek: number;
      if (Number.isFinite(boundWeek) && boundWeek > 0) {
        rawWeek = boundWeek;
      } else {
        const weekResolution = await resolveTileCurrentWeek(tile, helpers);
        if ("skip" in weekResolution) {
          throw new Error(
            `"${tile.name}" has no start date set - add one on the course tile, or bind a week.`
          );
        }
        rawWeek = weekResolution.rawWeek;
      }
      const status = courseProgressStatus(rawWeek, tile.weeks);

      const result = await gradeTileRepos({
        tile,
        rawWeek,
        status,
        instrRepoRef: String(values.instructionsRepo ?? "").trim(),
        userRubric: String(values.rubric ?? "").trim(),
        assignmentUrl: String(values.assignmentUrl ?? "").trim(),
        pointsPossibleRaw: String(values.pointsPossible ?? "").trim(),
        helpers,
        onProgress,
      });

      return {
        outputs: { draftId: result.draftId, graded: result.graded, moduleName: result.moduleName },
        summary: { kind: "text", text: result.summaryText },
      };
    },
  },
];
