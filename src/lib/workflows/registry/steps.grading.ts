// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  deleteGradingDraftAction,
  listCourseHubAction,
  updateCourseHubAction,
  gradeAction,
  gradeRepoAction,
  generateAssignmentRubricAction,
  generateFullCreditChecklistAction,
  listGradingQueueAction,
  postCanvasGradesAction,
  pullSubmissionAction,
  saveGradingDraftAction,
  draftZerosForMissingAction,
  listPendingGradingDraftsAction,
  getGradingDraftAction,
  markGradingDraftReviewedAction,
  getInstitutionCountsAction,
  generateModelAnswerAction,
  gradeOneSubmissionAction,
  ingestRepoAction,
  saveLibraryFileAction,
  listMissingSubmissionsAction,
  listCourseGradeSummariesAction,
  listNewCartridgeDropsAction,
  takeCartridgeDropAction,
  finishCartridgeDropAction,
} from "@/app/actions";
import {
  type StepRunResult,
  type StepDefinition,
  encodeTextBase64,
  courseToInputPayload,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import { mergeImportedRoster } from "@/lib/workflows/roster-merge";
import {
  parseGradebookCsv,
  missingFromGradebook,
  fillGradebookCsv,
  buildCanvasGradebookCsv,
  buildMoodleGradebookCsv,
} from "@/lib/gradebook-csv";
import type { GradingRun, GradingRunEntry, GradeResult } from "@/lib/grade";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { courseProgressStatus } from "@/lib/week-numbering";
import {
  buildGradingReviewRows,
  countPostableResults,
  stripGradingRunEntriesForDraft,
} from "@/lib/workflows/grading-review-rows";

export const gradingSteps: StepDefinition[] = [
  {
    type: "grading-preflight",
    name: "Find work needing grading",
    description:
      "List the selected courses' assignments with ungraded submissions and their rubric status.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: false,
        help: "Leave empty and pick an institution instead to grade every course with pending submissions.",
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Used when no course tiles are selected: every course at this institution with assignments awaiting grading is included.",
      },
    ],
    outputs: [{ key: "plan", label: "Grading plan", type: "courseList" }, { key: "hasWork", label: "Has work to grade", type: "boolean" }],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const lines: string[] = [];

      interface PlanRow {
        courseId: string;
        courseName: string;
        institution?: string;
        canvasUrl?: string;
        assignmentName?: string;
        assignmentId?: string;
        needsGrading?: number;
        hasRubric?: boolean;
        rubricText?: string;
        description?: string;
        pointsPossible?: number | null;
        offline?: boolean;
      }

      const plan: PlanRow[] = [];
      const queueErrors: Array<{ acronym: string; error: string }> = [];
      let offline: Course[] = [];

      // Institution-wide mode: no tiles selected
      if (ids.length === 0) {
        const acronym = String(values.institution ?? "").trim().toUpperCase();
        if (!acronym) {
          throw new Error("Select one or more course tiles, or pick an institution.");
        }

        onProgress("Loading grading queue...");
        const queueResult = await listGradingQueueAction([acronym]);
        if ("error" in queueResult) {
          throw new Error(queueResult.error);
        }

        const { rows: queueRows, errors } = queueResult;
        queueErrors.push(...errors);
        for (const e of errors) {
          lines.push(`Institution ${e.acronym}: ${e.error}`);
        }

        // Build plan from ALL returned rows (no tile matching)
        for (const row of queueRows) {
          const hasRubric = !!(row.rubricText && row.rubricText.trim());
          plan.push({
            courseId: "", // no local tile
            courseName: row.courseName || row.canvasUrl,
            institution: row.institution,
            canvasUrl: row.canvasUrl,
            assignmentName: row.title,
            assignmentId: row.assignmentId,
            needsGrading: row.needsGradingCount,
            hasRubric,
            rubricText: row.rubricText ?? "",
            description: row.description ?? "",
            pointsPossible: row.pointsPossible,
          });

          lines.push(
            `${row.courseName || row.canvasUrl} - ${row.title}: ${row.needsGradingCount} to grade${
              hasRubric ? "" : " (no rubric)"
            }`
          );
        }

        if (plan.length === 0 && queueErrors.length > 0) {
          throw new Error(
            `The grading queue could not be loaded for ${acronym}: ${queueErrors
              .map((e) => e.error)
              .join("; ")}`
          );
        }

        if (lines.length === 0) {
          lines.push(`Nothing needs grading at ${acronym}.`);
        }
      } else {
        // Tile-based mode: existing logic
        // Fail-forward: a deleted tile records a line and drops out of the plan.
        const tiles: Course[] = [];
        for (const id of ids) {
          const tile = hub.courses.find((c) => c.id === id);
          if (!tile) {
            lines.push(`${id}: not found`);
            continue;
          }
          tiles.push(tile);
        }

        const withLms = tiles.filter((t) => (t.canvasUrl ?? "").trim());
        // Assign the OUTER offline list (declared above both modes): the
        // no-rubric confirmation below counts offline tiles from it.
        offline = tiles.filter((t) => !(t.canvasUrl ?? "").trim());

        // Uppercase before dedup: listGradingQueueAction uppercases acronyms, so
        // "ut" and "UT" are the same institution and must scan once, not twice.
        const resolveAcronym = (t: Course): string =>
          (t.institution || helpers.activeInstitution || "").trim().toUpperCase();
        const acronyms = [...new Set(withLms.map(resolveAcronym).filter(Boolean))];

        if (withLms.length > 0) {
          onProgress("Loading grading queue...");
          const queueResult = await listGradingQueueAction(acronyms);
          if ("error" in queueResult) {
            throw new Error(queueResult.error);
          }

          const { rows: queueRows, errors } = queueResult;
          // An expired token must surface, never read as "nothing needs grading".
          queueErrors.push(...errors);
          for (const e of errors) {
            lines.push(`Institution ${e.acronym}: ${e.error}`);
          }

          for (const tile of withLms) {
            const tileCanvasId = parseCanvasCourseId(tile.canvasUrl ?? "");
            if (!tileCanvasId) {
              lines.push(`${tile.name}: the LMS URL has no /courses/<id> - skipped`);
              continue;
            }

            // Match on institution + numeric course id: ids alone collide
            // across institutions and would duplicate rows.
            const tileAcronym = resolveAcronym(tile);
            const tileRows = queueRows.filter((row) => {
              const rowCanvasId = parseCanvasCourseId(row.canvasUrl);
              return (
                rowCanvasId === tileCanvasId &&
                row.institution.trim().toUpperCase() === tileAcronym
              );
            });

            for (const row of tileRows) {
              const hasRubric = !!(row.rubricText && row.rubricText.trim());
              plan.push({
                courseId: tile.id,
                courseName: tile.name,
                institution: row.institution,
                canvasUrl: row.canvasUrl,
                assignmentName: row.title,
                assignmentId: row.assignmentId,
                needsGrading: row.needsGradingCount,
                hasRubric,
                rubricText: row.rubricText ?? "",
                description: row.description ?? "",
                pointsPossible: row.pointsPossible,
              });

              lines.push(
                `${tile.name} - ${row.title}: ${row.needsGradingCount} to grade${
                  hasRubric ? "" : " (no rubric)"
                }`
              );
            }
          }
        }

        for (const tile of offline) {
          plan.push({ courseId: tile.id, courseName: tile.name, offline: true });
          lines.push(`${tile.name}: no LMS - submissions can be uploaded as a zip in the next step`);
        }

        if (plan.length === 0 && queueErrors.length > 0) {
          throw new Error(
            `The grading queue could not be loaded for ${queueErrors
              .map((e) => e.acronym)
              .join(", ")}: ${queueErrors.map((e) => e.error).join("; ")}`
          );
        }

        if (lines.length === 0) {
          lines.push("Nothing needs grading in the selected courses.");
        }
      }

      const result: StepRunResult = {
        outputs: { plan, hasWork: plan.length > 0 ? "1" : "" },
        summary: { kind: "list", label: "Grading queue", items: lines },
      };

      // Build display rows from LMS plan rows only (skip offline rows).
      const displayRows: Array<Record<string, string>> = [];
      for (let idx = 0; idx < plan.length; idx++) {
        const p = plan[idx];
        if (!p.offline) {
          displayRows.push({
            planIndex: String(idx),
            course: p.courseName,
            assignment: p.assignmentName ?? "",
            toGrade: String(p.needsGrading ?? 0),
            rubric: p.hasRubric ? "yes" : "generated at grading",
          });
        }
      }

      // When there are LMS rows, use selectable table; otherwise check for offline rows with missing rubrics.
      if (displayRows.length > 0) {
        const noRubricLmsCount = displayRows.filter(
          (r) => r.rubric !== "yes"
        ).length;
        const offlineNoRubric = offline.filter((t) => !(t.rubricData ?? "").trim()).length;

        let message = "Uncheck any assignments you do not want graded, then proceed.";
        if (noRubricLmsCount > 0) {
          message += ` ${noRubricLmsCount} assignment(s) have no rubric - a rubric is generated via the LLM for each at grading time.`;
          if (offlineNoRubric > 0) {
            message += ` ${offlineNoRubric} offline course(s) also have no saved rubric.`;
          }
        }

        result.requireInput = {
          message,
          key: "plan",
          kind: "table",
          selectable: true,
          submitLabel: "Proceed with selected",
          columns: [
            { key: "course", label: "Course" },
            { key: "assignment", label: "Assignment" },
            { key: "toGrade", label: "To grade" },
            { key: "rubric", label: "Rubric" },
          ],
          rows: displayRows,
          transform: (value) => {
            const rows = Array.isArray(value)
              ? (value as Array<Record<string, string>>)
              : [];
            const keep = new Set(rows.map((r) => Number(r.planIndex)));
            // Offline rows always ride along; only LMS rows are selectable.
            return plan.filter((p, idx) => p.offline || keep.has(idx));
          },
        };
      } else if (offline.length > 0) {
        // No LMS rows but offline rows exist - keep old requireConfirmation logic
        const offlineNoRubric = offline.filter((t) => !(t.rubricData ?? "").trim()).length;
        if (offlineNoRubric > 0) {
          result.requireConfirmation = `${offlineNoRubric} offline course(s) have no saved rubric - rubrics will be generated via the LLM where missing. Continue to grade with them, or cancel to stop.`;
        }
      }

      return result;
    },
  },

  {
    type: "collect-offline-submissions",
    name: "Collect offline submissions",
    description: "When a selected course has no LMS, pause to upload its submissions as a zip.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
    ],
    outputs: [{ key: "submissionsZip", label: "Submissions zip", type: "uploads" }],
    run: async (values) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const offline = ids
        .map((id) => hub.courses.find((c) => c.id === id))
        .filter((t): t is typeof hub.courses[0] => !!t && !(t.canvasUrl ?? "").trim());

      if (offline.length === 0) {
        return {
          outputs: { submissionsZip: [] },
          summary: { kind: "text" as const, text: "Skipped - every selected course has an LMS." },
        };
      }

      const offlineNames = offline.map((t) => t.name).join(", ");
      // One zip grades one course: with several offline courses the upload is
      // applied to the first listed one only, and the prompt says so.
      const message =
        offline.length === 1
          ? `${offlineNames} has no LMS. Upload a zip of submissions to grade offline, or skip to grade only the LMS courses.`
          : `${offlineNames} have no LMS. Upload a zip of submissions to grade offline - it is graded against ${offline[0].name} (the first listed); run Grade Submissions again for the others. Skip to grade only the LMS courses.`;
      return {
        outputs: { submissionsZip: [] },
        summary: {
          kind: "text" as const,
          text: `${offline.length} course(s) have no LMS: ${offlineNames}.`,
        },
        requireInput: {
          message,
          key: "submissionsZip",
          kind: "upload",
          optional: true,
        },
      };
    },
  },

  {
    type: "grade-submissions",
    name: "Grade submissions",
    description:
      "Grade every ungraded submission per assignment using its rubric (generating one via the LLM when missing) and prepare the grades for posting.",
    inputs: [
      {
        key: "plan",
        label: "Grading plan",
        type: "courseList",
        required: true,
      },
      {
        key: "submissionsZip",
        label: "Submissions zip",
        type: "uploads",
        required: false,
      },
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
    ],
    outputs: [
      { key: "runs", label: "Grading runs", type: "courseList" },
      { key: "approvedGrades", label: "Approved grades", type: "courseList" },
    ],
    run: async (values, helpers, onProgress) => {
      interface PlanRow {
        courseId: string;
        courseName: string;
        institution?: string;
        canvasUrl?: string;
        assignmentName?: string;
        assignmentId?: string;
        rubricText?: string;
        description?: string;
        pointsPossible?: number | null;
        offline?: boolean;
      }

      const plan = Array.isArray(values.plan)
        ? (values.plan as PlanRow[])
        : [];

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const tileMap = new Map(hub.courses.map((c) => [c.id, c]));
      const zips = Array.isArray(values.submissionsZip) ? (values.submissionsZip as File[]) : [];

      // GradingRunEntry (src/lib/grade.ts) is shared with grade-to-draft and
      // review-grading-draft so every producer of a `runs` array agrees on
      // its shape and on runIndex/resultIndex numbering (see
      // buildGradingReviewRows below).
      const runs: GradingRunEntry[] = [];
      const lines: string[] = [];

      for (const row of plan) {
        if (row.offline) continue;

        try {
          let rubricText = (row.rubricText ?? "").trim();

          if (!rubricText) {
            onProgress(
              `Generating rubric for ${row.courseName} - ${row.assignmentName}...`
            );
            const rubricResult = await generateAssignmentRubricAction(
              row.assignmentName ?? "",
              row.description ?? "",
              helpers.provider
            );

            if (typeof rubricResult === "string") {
              rubricText = rubricResult;
            } else {
              lines.push(
                `${row.courseName} - ${row.assignmentName}: rubric generation failed: ${
                  rubricResult.error
                }`
              );
              continue;
            }
          }

          onProgress(
            `Grading ${row.courseName} - ${row.assignmentName}...`
          );

          const formData = new FormData();
          formData.set("canvasUrl", row.canvasUrl ?? "");
          formData.set("provider", helpers.provider);
          formData.set("rubric", rubricText);
          // Canvas descriptions are often empty and the LLM path requires
          // instructions, so fall back to the assignment name (Live Feed style).
          formData.set(
            "assignmentInstructions",
            row.description ||
              row.assignmentName ||
              "Grade each submission against the rubric."
          );
          formData.set("institution", row.institution ?? "");

          const gradeResult = await gradeAction({ run: null, error: null }, formData);

          if (gradeResult.error) {
            lines.push(
              `${row.courseName} - ${row.assignmentName}: ${gradeResult.error}`
            );
            continue;
          }

          if (!gradeResult.run) {
            lines.push(
              `${row.courseName} - ${row.assignmentName}: no submissions to grade`
            );
            continue;
          }

          runs.push({
            courseName: row.courseName,
            assignmentName: row.assignmentName ?? "",
            canvasUrl: row.canvasUrl ?? "",
            run: gradeResult.run,
            institution: row.institution,
            assignmentId: row.assignmentId,
            pointsPossible: row.pointsPossible,
          });

          lines.push(
            `${row.courseName} - ${row.assignmentName}: graded ${gradeResult.run.results.length} submission(s)`
          );
        } catch (err) {
          lines.push(
            `${row.courseName} - ${row.assignmentName ?? "unknown"}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
        }
      }

      if (zips.length > 0) {
        try {
          // One zip = one course: the upload grades the first offline row and
          // every further offline row gets an honest "not graded" line.
          const offlineRows = plan.filter((r) => r.offline);
          const offlineRow = offlineRows[0];
          if (offlineRow) {
            const courseTile = tileMap.get(offlineRow.courseId);
            const rubric = courseTile?.rubricData ?? "";

            onProgress("Grading offline submissions...");
            const formData = new FormData();
            formData.set("studentSubmissions", zips[0]);
            formData.set("rubric", rubric);
            formData.set("provider", helpers.provider);
            // The zip grading path requires instructions even when the rubric
            // is empty (one is generated from them in that case).
            formData.set(
              "assignmentInstructions",
              "Grade each student submission against the rubric."
            );

            const gradeResult = await gradeAction({ run: null, error: null }, formData);

            if (gradeResult.error) {
              lines.push(`Offline grading: ${gradeResult.error}`);
            } else if (gradeResult.run) {
              runs.push({
                courseName: offlineRow.courseName,
                assignmentName: "Offline submission",
                canvasUrl: "",
                run: gradeResult.run,
                offline: true,
              });
              lines.push(
                `${offlineRow.courseName}: graded ${gradeResult.run.results.length} submission(s)`
              );
            }

            for (const skippedRow of offlineRows.slice(1)) {
              lines.push(
                `${skippedRow.courseName}: not graded - run Grade Submissions again with only this course selected.`
              );
            }

            if (zips.length > 1) {
              lines.push("Note: only the first zip was graded");
            }
          }
        } catch (err) {
          lines.push(
            `Offline grading failed: ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }

      // Only rows with a numeric Canvas user id can be posted; promising
      // run.results.length posts would overcount on providers that return none.
      const nonOfflineRuns = runs.filter((r) => !r.offline);
      const postable = countPostableResults(runs);
      if (nonOfflineRuns.length > 0 && postable === 0) {
        lines.push(
          "No rows carry a Canvas user id - nothing can be posted (provider limitation)"
        );
      }

      const result: StepRunResult = {
        outputs: { runs, approvedGrades: [] },
        summary: { kind: "list", label: "Grading complete", items: lines },
      };

      if (postable > 0) {
        // Build review rows from postable entries; runIndex indexes the FULL runs array
        // so post-grades and rowDetail lookups agree when any offline run is present.
        // Shared with review-grading-draft (see grading-review-rows.ts) so the
        // two producers of this review table can never number rows differently.
        const reviewRows = buildGradingReviewRows(runs);

        result.requireInput = {
          message: `Review the grades below - open a submission to check the student's work, edit scores or comments, then approve to post ${postable} grade(s) to the LMS. Uncheck a row to leave that student out of the post. Skip to finish without posting.`,
          key: "approvedGrades",
          kind: "table",
          optional: true,
          selectable: true,
          submitLabel: "Approve grades",
          columns: [
            { key: "course", label: "Course" },
            { key: "assignment", label: "Assignment" },
            { key: "student", label: "Student", width: 140 },
            { key: "submission", label: "Submission", link: true, width: 90 },
            { key: "grade", label: "Grade", editable: true, width: 80 },
            { key: "outOf", label: "Out of", width: 70 },
            { key: "comment", label: "Comment", editable: true, multiline: true },
          ],
          rows: reviewRows,
          rowDetail: async (row) => {
            const entry = runs[Number(row.runIndex)];
            const gradeResult = entry?.run.results[Number(row.resultIndex)];
            if (!entry || !gradeResult) {
              throw new Error("Submission details are unavailable for this row.");
            }
            // Everything the grader saw is still in memory: rubric breakdown,
            // formatted feedback, the grading-time code run, and the submitted
            // files. Canvas is contacted only when no files were kept (a
            // text-only submission) to recover the text body.
            const sections: string[] = [gradeResult.student];
            if (gradeResult.rubricAreas.length > 0) {
              sections.push(
                [
                  "Rubric breakdown:",
                  ...gradeResult.rubricAreas.map(
                    (a) => `- ${a.area}: ${a.score}${a.comment ? ` (${a.comment})` : ""}`
                  ),
                ].join("\n")
              );
            }
            if (gradeResult.feedback.trim()) {
              sections.push(`AI feedback:\n${gradeResult.feedback.trim()}`);
            }
            if (gradeResult.codeExecution) {
              const ce = gradeResult.codeExecution;
              const status = ce.error
                ? `could not run (${ce.error})`
                : ce.ran
                  ? "ran cleanly (exit 0)"
                  : `failed (exit ${ce.exitCode ?? "unknown"})`;
              const output = (ce.stdout || ce.stderr || ce.compileOutput || "").trim();
              sections.push(
                `Code run during grading: ${status}${output ? `\n${output.slice(0, 2000)}` : ""}`
              );
            }
            if (gradeResult.submittedFiles.length > 0) {
              return {
                text: sections.join("\n\n"),
                files: gradeResult.submittedFiles.map((f) => ({
                  name: f.name,
                  base64: f.rawBase64 ?? encodeTextBase64(f.previewContent),
                  mimeType: f.mimeType ?? "text/plain",
                })),
              };
            }
            if (!entry.offline && typeof gradeResult.userId === "number") {
              const courseId = parseCanvasCourseId(entry.canvasUrl ?? "");
              if (entry.institution && courseId && entry.assignmentId) {
                const pulled = await pullSubmissionAction(
                  entry.institution,
                  courseId,
                  entry.assignmentId,
                  gradeResult.userId
                );
                if (!("error" in pulled)) {
                  const s = pulled.submission;
                  sections.push(
                    s.text?.trim() ? `Text submission:\n${s.text.trim()}` : "(no text submission)"
                  );
                  return { text: sections.join("\n\n"), files: s.files ?? [] };
                }
              }
            }
            return { text: sections.join("\n\n"), files: [] };
          },
        };
      }

      return result;
    },
  },

  {
    // HEADLESS (unattended-safe): the AI *scoring* half of grading, split out
    // so it can run on a schedule with nobody watching. It NEVER sets
    // requireInput/requireConfirmation and NEVER calls postCanvasGradesAction
    // - it only grades and saves a durable draft (saveGradingDraftAction).
    // Grades reach Canvas exclusively through the app-open
    // review-grading-draft -> post-grades pair, after a human approves rows
    // in the review table. See HEADLESS_SAFE_STEP_TYPES in headless.ts.
    type: "grade-to-draft",
    name: "Grade submissions to a draft",
    description:
      "Unattended AI scoring only: grades every LMS assignment with pending submissions for whatever the workflow is scoped to - the selected course tiles, or every course at the scoped institution (scope the workflow to All institutions to cover every configured school, one run each) - and saves the results as a draft. Nothing is posted to Canvas by this step - review and post the draft separately with Review Graded Drafts.",
    inputs: [
      {
        key: "courses",
        label: "Course tiles",
        type: "hubCourseList",
        required: false,
        help: "Grade only these course tiles (usually inherited From workflow scope). Leave empty to grade a whole institution instead.",
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Used when no course tiles are selected: grades every course at this institution with pending submissions. Scope the workflow to All institutions to grade every configured school (one run each).",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      // Mirrors grading-preflight's PlanRow (registry.ts, "grading-preflight"
      // above) minus the fields only that step's review table needs.
      interface PlanRow {
        courseName: string;
        institution?: string;
        canvasUrl?: string;
        assignmentName?: string;
        assignmentId?: string;
        rubricText?: string;
        description?: string;
        pointsPossible?: number | null;
      }

      const plan: PlanRow[] = [];
      const lines: string[] = [];
      const queueErrors: Array<{ acronym: string; error: string }> = [];

      // Institution-wide mode: no tiles selected - mirrors grading-preflight.
      if (ids.length === 0) {
        const acronym = String(values.institution ?? "").trim().toUpperCase();
        // Institution-wide mode. "All institutions" is handled by scoping the
        // workflow to institution "*" (fan-out runs this step once per school
        // with a concrete institution pinned), so a single run always targets
        // exactly one institution here.
        if (!acronym) {
          throw new Error(
            "Nothing to grade: scope the workflow to course tiles or an institution (or All institutions), or select course tiles / an institution on this step."
          );
        }
        const acronyms = [acronym];

        onProgress("Loading grading queue...");
        const queueResult = await listGradingQueueAction(acronyms);
        if ("error" in queueResult) {
          throw new Error(queueResult.error);
        }

        const { rows: queueRows, errors } = queueResult;
        queueErrors.push(...errors);
        for (const e of errors) {
          lines.push(`Institution ${e.acronym}: ${e.error}`);
        }

        for (const row of queueRows) {
          plan.push({
            courseName: row.courseName || row.canvasUrl,
            institution: row.institution,
            canvasUrl: row.canvasUrl,
            assignmentName: row.title,
            assignmentId: row.assignmentId,
            rubricText: row.rubricText ?? "",
            description: row.description ?? "",
            pointsPossible: row.pointsPossible,
          });
        }

        if (plan.length === 0 && queueErrors.length > 0) {
          throw new Error(
            `The grading queue could not be loaded for ${queueErrors
              .map((e) => e.acronym)
              .join(", ")}: ${queueErrors.map((e) => e.error).join("; ")}`
          );
        }
      } else {
        // Tile-based mode: fail-forward per missing tile. Offline tiles (no
        // canvasUrl) are SKIPPED entirely - there is no unattended path for
        // them (no browser to upload a zip); each is noted below instead.
        const tiles: Course[] = [];
        for (const id of ids) {
          const tile = hub.courses.find((c) => c.id === id);
          if (!tile) {
            lines.push(`${id}: not found - skipped`);
            continue;
          }
          tiles.push(tile);
        }

        const withLms = tiles.filter((t) => (t.canvasUrl ?? "").trim());
        const offline = tiles.filter((t) => !(t.canvasUrl ?? "").trim());
        for (const tile of offline) {
          lines.push(
            `${tile.name}: no LMS - unattended grading has no upload step, skipped (run Grade Submissions in the app to grade it offline).`
          );
        }

        const resolveAcronym = (t: Course): string =>
          (t.institution || helpers.activeInstitution || "").trim().toUpperCase();
        const acronyms = [...new Set(withLms.map(resolveAcronym).filter(Boolean))];

        if (withLms.length > 0) {
          onProgress("Loading grading queue...");
          const queueResult = await listGradingQueueAction(acronyms);
          if ("error" in queueResult) {
            throw new Error(queueResult.error);
          }

          const { rows: queueRows, errors } = queueResult;
          queueErrors.push(...errors);
          for (const e of errors) {
            lines.push(`Institution ${e.acronym}: ${e.error}`);
          }

          for (const tile of withLms) {
            const tileCanvasId = parseCanvasCourseId(tile.canvasUrl ?? "");
            if (!tileCanvasId) {
              lines.push(`${tile.name}: the LMS URL has no /courses/<id> - skipped`);
              continue;
            }

            const tileAcronym = resolveAcronym(tile);
            const tileRows = queueRows.filter((row) => {
              const rowCanvasId = parseCanvasCourseId(row.canvasUrl);
              return (
                rowCanvasId === tileCanvasId &&
                row.institution.trim().toUpperCase() === tileAcronym
              );
            });

            for (const row of tileRows) {
              plan.push({
                courseName: tile.name,
                institution: row.institution,
                canvasUrl: row.canvasUrl,
                assignmentName: row.title,
                assignmentId: row.assignmentId,
                rubricText: row.rubricText ?? "",
                description: row.description ?? "",
                pointsPossible: row.pointsPossible,
              });
            }
          }
        }

        if (plan.length === 0 && queueErrors.length > 0) {
          throw new Error(
            `The grading queue could not be loaded for ${queueErrors
              .map((e) => e.acronym)
              .join(", ")}: ${queueErrors.map((e) => e.error).join("; ")}`
          );
        }
      }

      if (plan.length === 0) {
        lines.push("Nothing needs grading - no draft saved.");
        return {
          outputs: {},
          summary: { kind: "list", label: "Nothing to grade", items: lines },
        };
      }

      // Grade every plan row with the EXACT loop grade-submissions uses (same
      // rubric-generation fallback, same gradeAction FormData) so unattended
      // scores match the interactive flow.
      const runs: GradingRunEntry[] = [];

      for (const row of plan) {
        try {
          let rubricText = (row.rubricText ?? "").trim();

          if (!rubricText) {
            onProgress(`Generating rubric for ${row.courseName} - ${row.assignmentName}...`);
            const rubricResult = await generateAssignmentRubricAction(
              row.assignmentName ?? "",
              row.description ?? "",
              helpers.provider
            );

            if (typeof rubricResult === "string") {
              rubricText = rubricResult;
            } else {
              lines.push(
                `${row.courseName} - ${row.assignmentName}: rubric generation failed: ${rubricResult.error}`
              );
              continue;
            }
          }

          onProgress(`Grading ${row.courseName} - ${row.assignmentName}...`);

          const formData = new FormData();
          formData.set("canvasUrl", row.canvasUrl ?? "");
          formData.set("provider", helpers.provider);
          formData.set("rubric", rubricText);
          formData.set(
            "assignmentInstructions",
            row.description ||
              row.assignmentName ||
              "Grade each submission against the rubric."
          );
          formData.set("institution", row.institution ?? "");

          // gradeAction only reads from Canvas and scores with the LLM - it
          // never writes back. Posting only ever happens in the post-grades
          // step, below, after human review.
          const gradeResult = await gradeAction({ run: null, error: null }, formData);

          if (gradeResult.error) {
            lines.push(`${row.courseName} - ${row.assignmentName}: ${gradeResult.error}`);
            continue;
          }

          if (!gradeResult.run) {
            lines.push(`${row.courseName} - ${row.assignmentName}: no submissions to grade`);
            continue;
          }

          runs.push({
            courseName: row.courseName,
            assignmentName: row.assignmentName ?? "",
            canvasUrl: row.canvasUrl ?? "",
            run: gradeResult.run,
            institution: row.institution,
            assignmentId: row.assignmentId,
            pointsPossible: row.pointsPossible,
          });

          lines.push(
            `${row.courseName} - ${row.assignmentName}: graded ${gradeResult.run.results.length} submission(s)`
          );
        } catch (err) {
          lines.push(
            `${row.courseName} - ${row.assignmentName ?? "unknown"}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
        }
      }

      if (runs.length === 0) {
        lines.push("Nothing was gradable - no draft saved.");
        return {
          outputs: {},
          summary: { kind: "list", label: "Nothing to grade", items: lines },
        };
      }

      const submissionCount = runs.reduce((sum, r) => sum + r.run.results.length, 0);
      const summary = `${runs.length} assignment(s), ${submissionCount} submission(s) graded - review to post`;

      // Strip rawBase64/previewContent/codeExecution before persisting: a
      // draft never needs submitted-file bytes (post-grades reads only
      // grade/comment/rubric/totalScore/userId; review-grading-draft
      // re-fetches files from Canvas on demand). This keeps the jsonb payload
      // small and is the ONLY thing that leaves this step - nothing here
      // posts to Canvas.
      const strippedRuns = stripGradingRunEntriesForDraft(runs);

      const saveResult = await saveGradingDraftAction(summary, { runs: strippedRuns }, helpers.workflowId, helpers.workflowName);
      if ("error" in saveResult) {
        throw new Error(`Could not save the grading draft: ${saveResult.error}`);
      }

      lines.push(`Saved draft: ${summary}`);

      return {
        outputs: {},
        summary: { kind: "list", label: "Draft saved", items: lines },
      };
    },
  },

  {
    // APP-OPEN ONLY: sets requireInput below, so it is deliberately absent
    // from HEADLESS_SAFE_STEP_TYPES in headless.ts and cannot be scheduled
    // unattended. This is the ONLY step that turns a saved draft into
    // something post-grades can act on - grades still only reach Canvas
    // after the user approves rows in the table this step renders.
    type: "review-grading-draft",
    name: "Review a grading draft",
    description:
      "Load the oldest pending grading draft (saved by Grade Submissions to a Draft) into an editable review table. Approving posts the checked rows to the LMS via the next step; skipping leaves the draft pending for later.",
    inputs: [],
    outputs: [
      { key: "runs", label: "Grading runs", type: "courseList" },
      { key: "approvedGrades", label: "Approved grades", type: "courseList" },
    ],
    run: async () => {
      const listResult = await listPendingGradingDraftsAction();
      if ("error" in listResult) {
        throw new Error(listResult.error);
      }

      if (listResult.drafts.length === 0) {
        return {
          outputs: { runs: [], approvedGrades: [] },
          summary: { kind: "text", text: "No pending grading drafts to review." },
        };
      }

      // Oldest first (listPendingGradingDraftsAction orders by created_at
      // ascending), so this always takes the longest-waiting draft.
      const draftId = listResult.drafts[0].id;
      const draftResult = await getGradingDraftAction(draftId);
      if ("error" in draftResult) {
        throw new Error(draftResult.error);
      }

      const runs = draftResult.draft.payload.runs;

      const result: StepRunResult = {
        outputs: { runs, approvedGrades: [] },
        summary: {
          kind: "text",
          text: `Loaded the oldest pending draft: ${draftResult.draft.summary}`,
        },
      };

      // Built from the SAME shared helper grade-submissions uses (see
      // grading-review-rows.ts), over the draft's own runs array, so
      // runIndex/resultIndex agree with what post-grades expects.
      const postable = countPostableResults(runs);

      if (postable === 0) {
        // Nothing to show - mark the draft reviewed now so an empty draft
        // does not sit pending forever (best-effort; markGradingDraftReviewedAction
        // is idempotent, so a failure here just leaves it re-reviewable later).
        void markGradingDraftReviewedAction(draftId).catch(() => {});
        return result;
      }

      const reviewRows = buildGradingReviewRows(runs);

      result.requireInput = {
        message: `Review the grades below - open a submission to check the student's work, edit scores or comments, then approve to post ${postable} grade(s) to the LMS. Uncheck a row to leave that student out of the post. Skip to finish without posting (the draft stays pending for later).`,
        key: "approvedGrades",
        kind: "table",
        optional: true,
        selectable: true,
        submitLabel: "Approve grades",
        columns: [
          { key: "course", label: "Course" },
          { key: "assignment", label: "Assignment" },
          { key: "student", label: "Student", width: 140 },
          { key: "submission", label: "Submission", link: true, width: 90 },
          { key: "grade", label: "Grade", editable: true, width: 80 },
          { key: "outOf", label: "Out of", width: 70 },
          { key: "comment", label: "Comment", editable: true, multiline: true },
        ],
        rows: reviewRows,
        rowDetail: async (row) => {
          const entry = runs[Number(row.runIndex)];
          const gradeResult = entry?.run.results[Number(row.resultIndex)];
          if (!entry || !gradeResult) {
            throw new Error("Submission details are unavailable for this row.");
          }

          const sections: string[] = [gradeResult.student];
          if (gradeResult.rubricAreas.length > 0) {
            sections.push(
              [
                "Rubric breakdown:",
                ...gradeResult.rubricAreas.map(
                  (a) => `- ${a.area}: ${a.score}${a.comment ? ` (${a.comment})` : ""}`
                ),
              ].join("\n")
            );
          }
          if (gradeResult.feedback.trim()) {
            sections.push(`AI feedback:\n${gradeResult.feedback.trim()}`);
          }
          // A draft never carries submittedFiles bytes (stripped before
          // persisting - see stripGradingRunEntriesForDraft), so this always
          // falls through to the Canvas re-fetch branch below.
          if (gradeResult.submittedFiles.length > 0) {
            return {
              text: sections.join("\n\n"),
              files: gradeResult.submittedFiles.map((f) => ({
                name: f.name,
                base64: f.rawBase64 ?? encodeTextBase64(f.previewContent),
                mimeType: f.mimeType ?? "text/plain",
              })),
            };
          }
          if (!entry.offline && typeof gradeResult.userId === "number") {
            const courseId = parseCanvasCourseId(entry.canvasUrl ?? "");
            if (entry.institution && courseId && entry.assignmentId) {
              const pulled = await pullSubmissionAction(
                entry.institution,
                courseId,
                entry.assignmentId,
                gradeResult.userId
              );
              if (!("error" in pulled)) {
                const s = pulled.submission;
                sections.push(
                  s.text?.trim() ? `Text submission:\n${s.text.trim()}` : "(no text submission)"
                );
                return { text: sections.join("\n\n"), files: s.files ?? [] };
              }
            }
          }
          return { text: sections.join("\n\n"), files: [] };
        },
        transform: (value) => {
          const rows = Array.isArray(value) ? (value as Array<Record<string, string>>) : [];
          // Best-effort, fire-and-forget: this closure runs synchronously (the
          // runner does not await it), and it fires ONLY on submit, never on
          // skip (see WorkflowsTab's requireInput resolver - a skip resolves
          // with null and this transform is never called). A failure here is
          // swallowed because markGradingDraftReviewedAction is idempotent -
          // reviewing the same draft again later just marks it reviewed again.
          void markGradingDraftReviewedAction(draftId).catch(() => {});
          return rows;
        },
      };

      return result;
    },
  },

  {
    type: "post-grades",
    name: "Post grades to the LMS",
    description: "Post the prepared grades and rubric scores back to each assignment.",
    inputs: [
      {
        key: "runs",
        label: "Grading runs",
        type: "courseList",
        required: true,
      },
      {
        key: "approvedGrades",
        label: "Approved grades",
        type: "courseList",
        required: false,
        help: "The reviewed rows from the grading step; only these are posted.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      interface RunEntry {
        courseName: string;
        assignmentName: string;
        canvasUrl: string;
        run: GradingRun;
        offline?: boolean;
      }

      const runs = Array.isArray(values.runs)
        ? (values.runs as RunEntry[])
        : [];

      const approved = Array.isArray(values.approvedGrades)
        ? (values.approvedGrades as Array<Record<string, string>>)
        : [];

      const lines: string[] = [];

      // Check if there are any non-offline runs with numeric userId entries
      const nonOfflineRuns = runs.filter((r) => !r.offline);
      const hasPostableRows = nonOfflineRuns.some((r) =>
        r.run.results.some((row) => typeof row.userId === "number")
      );

      // If there are postable rows but none were approved, skip posting
      if (hasPostableRows && approved.length === 0) {
        for (const entry of runs) {
          if (entry.offline) {
            lines.push(`${entry.courseName}: offline grades not posted (no LMS)`);
          }
        }
        lines.push("Grades were not approved - nothing posted.");
        return {
          outputs: {},
          summary: { kind: "list" as const, label: "Grades posted", items: lines },
        };
      }

      // Group approved rows by runIndex (indexes the FULL runs array so the posting
      // step and grade-submissions detail lookups agree when any offline run is present).
      const approvedByRunIndex = new Map<string, Array<Record<string, string>>>();
      for (const row of approved) {
        const runIndex = row.runIndex ?? "";
        if (!approvedByRunIndex.has(runIndex)) {
          approvedByRunIndex.set(runIndex, []);
        }
        approvedByRunIndex.get(runIndex)!.push(row);
      }

      for (let i = 0; i < runs.length; i++) {
        const entry = runs[i];

        try {
          if (entry.offline) {
            lines.push(`${entry.courseName}: offline grades not posted (no LMS)`);
            continue;
          }

          onProgress(`Posting grades for ${entry.courseName} - ${entry.assignmentName}...`);

          // Collect approved rows for this run
          const runApprovedRows = approvedByRunIndex.get(String(i)) ?? [];
          if (runApprovedRows.length === 0) {
            lines.push(`${entry.courseName} - ${entry.assignmentName}: no approved grades`);
            continue;
          }

          const payload: Array<{
            userId: number;
            grade?: string;
            comment?: string;
            rubricAreas?: Array<{ area: string; score: string; comment: string }>;
          }> = [];

          for (const approvedRow of runApprovedRows) {
            const resultIndex = approvedRow.resultIndex ? parseInt(approvedRow.resultIndex, 10) : null;
            if (resultIndex === null || resultIndex < 0 || resultIndex >= entry.run.results.length) {
              lines.push(`${approvedRow.student}: result index out of range - skipped`);
              continue;
            }

            const result = entry.run.results[resultIndex];
            const userId = result.userId;
            if (typeof userId !== "number") {
              lines.push(`${approvedRow.student}: no Canvas user id - skipped`);
              continue;
            }

            const grade = (approvedRow.grade ?? "").trim();
            if (grade && !grade.match(/^-?\d+(\.\d+)?$/)) {
              lines.push(`${approvedRow.student}: invalid grade "${grade}" - skipped`);
              continue;
            }

            const comment = approvedRow.comment ?? result.overallComment;

            // When the reviewer edited the total, the AI's per-criterion
            // breakdown no longer adds up to it - post the total alone rather
            // than a contradictory rubric.
            const originalGrade = (() => {
              const m =
                result.totalScore.match(/(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/) ??
                result.totalScore.match(/-?\d+(?:\.\d+)?/);
              return m ? m[1] ?? m[0] : "";
            })();
            // An unparseable AI total counts as edited too: the reviewer's
            // typed grade cannot be reconciled with the AI's breakdown.
            const gradeEdited =
              grade !== "" && (originalGrade === "" || parseFloat(grade) !== parseFloat(originalGrade));
            if (gradeEdited) {
              lines.push(
                `${approvedRow.student}: total edited (${originalGrade || "unparsed"} -> ${grade}) - rubric breakdown omitted`
              );
            }

            payload.push({
              userId,
              grade: grade || undefined,
              comment,
              rubricAreas: gradeEdited
                ? undefined
                : result.rubricAreas.map((a) => ({
                    area: a.area,
                    score: a.score,
                    comment: "",
                  })),
            });
          }

          if (payload.length === 0) {
            lines.push(`${entry.courseName} - ${entry.assignmentName}: no gradable submissions`);
            continue;
          }

          const postResult = await postCanvasGradesAction(entry.canvasUrl, payload);

          if ("error" in postResult) {
            lines.push(`${entry.courseName} - ${entry.assignmentName}: ${postResult.error}`);
          } else {
            lines.push(
              `${entry.courseName} - ${entry.assignmentName}: posted ${postResult.posted}${
                postResult.failures.length ? `, ${postResult.failures.length} failed` : ""
              }`
            );
          }
        } catch (err) {
          lines.push(
            `${entry.courseName} - ${entry.assignmentName ?? "unknown"}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
        }
      }

      return {
        outputs: {},
        summary: { kind: "list" as const, label: "Grades posted", items: lines },
      };
    },
  },

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
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || "";
      if (!inst) {
        throw new Error("Select an institution to check.");
      }

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
    description: "AI-grade a single student repository against a rubric. Produces a score and feedback (does not post to the LMS).",
    inputs: [
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "instructions", label: "Assignment instructions", type: "longtext", required: true },
      { key: "rubric", label: "Rubric", type: "longtext", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "gradeSummary", label: "Grade and feedback", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const repo = String(values.repo ?? "").trim();
      if (!repo) {
        throw new Error("Provide a repository.");
      }

      const instructions = String(values.instructions ?? "").trim();
      if (!instructions) {
        throw new Error("Provide the assignment instructions.");
      }

      const rubric = String(values.rubric ?? "");
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Grading repository...");
      const r = await gradeRepoAction(repo, instructions, rubric, helpers.provider, branch);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const summaryLines: string[] = [];
      summaryLines.push(r.fullName);
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

      return {
        outputs: { gradeSummary },
        summary: { kind: "text", text: gradeSummary },
      };
    },
  },

  {
    type: "batch-grade-repos-to-draft",
    name: "Batch grade student repos to a draft",
    description:
      "Grade every student's repo for the current week against a rubric synthesized from the week's README, and save the results as a reviewable grading draft (postable to Canvas when an assignment URL is given).",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
        help: "Uses the tile's Student repos and current week.",
      },
      {
        key: "week",
        label: "Current week (optional)",
        type: "number",
        required: false,
        help: "Bind from Find the current week and module, or leave blank to derive from the tile's start date.",
      },
      {
        key: "instructionsRepo",
        label: "Instructions repo (optional)",
        type: "repo",
        required: false,
        help: "Repo holding the week's assignment README used to synthesize the rubric. Defaults to the tile's first linked repo.",
      },
      {
        key: "rubric",
        label: "Rubric (optional)",
        type: "longtext",
        required: false,
        help: "Provide a rubric directly instead of synthesizing one from the README.",
      },
      {
        key: "assignmentUrl",
        label: "Canvas assignment URL (optional)",
        type: "text",
        required: false,
        help: "The Canvas assignment these repo grades map to. Provide it to make the draft postable to Canvas.",
      },
      {
        key: "pointsPossible",
        label: "Points possible (optional)",
        type: "number",
        required: false,
      },
    ],
    outputs: [
      { key: "draftId", label: "Draft id", type: "text" },
      { key: "graded", label: "Repos graded", type: "number" },
      { key: "moduleName", label: "Module", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      // Step 1: Load the tile.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) throw new Error("Choose a course tile.");

      onProgress("Reading the course...");
      const list = await listCourseHubAction();
      if ("error" in list) throw new Error(list.error);
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) throw new Error("Course tile not found.");

      // Step 2: Get student repos.
      const students = (tile.studentRepos ?? []).filter((s) => s.repo && s.repo.trim());
      if (students.length === 0) {
        throw new Error("Add student repos to the course tile first (the Student repos tile).");
      }

      // Step 3: Resolve the week and module name.
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
      const displayWeek = tile.weeks && tile.weeks > 0 ? Math.min(rawWeek, tile.weeks) : rawWeek;
      const wt = await loadTileWeekTopic(tile, displayWeek, helpers);
      const topic = "skip" in wt ? "" : wt.topic;
      const moduleName =
        status === "not-started"
          ? "Not started"
          : status === "complete"
            ? "Complete"
            : `Module ${String(displayWeek).padStart(2, "0")}${topic ? `: ${topic}` : ""}`;

      // Step 4: Get instructions text (README) for rubric synthesis.
      let instructions = "";
      const instrRepoRef = String(values.instructionsRepo ?? "").trim() || (tile.repos?.[0]?.repo ?? "").toString();
      if (instrRepoRef) {
        try {
          onProgress("Reading the instructions repo...");
          const r = await ingestRepoAction(instrRepoRef);
          if ("error" in r) {
            onProgress(`Note: could not ingest instructions repo: ${r.error}`);
          } else {
            const wk = displayWeek;
            const re = new RegExp(`(week|wk|module|unit)[^0-9]?0*${wk}(?![0-9])`, "i");
            const matched = r.digest.files.filter((f) => re.test(f.path));

            if (matched.length > 0) {
              const readmeFile = matched.find((f) => /readme/i.test(f.path));
              if (readmeFile) {
                instructions = readmeFile.content;
              } else {
                instructions = matched[0].content;
              }
            } else {
              instructions = r.digest.text;
            }
          }
        } catch (err) {
          onProgress(`Note: error reading instructions repo: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Step 5: Get or synthesize rubric.
      let rubric = String(values.rubric ?? "").trim();
      if (!rubric) {
        onProgress("Generating rubric...");
        const rr = await generateAssignmentRubricAction(
          moduleName + (topic ? `: ${topic}` : ""),
          instructions,
          helpers.provider
        );
        if (typeof rr === "string") {
          rubric = rr;
        } else {
          onProgress(`Note: rubric generation failed: ${rr.error}`);
        }
      }

      if (!rubric && !instructions) {
        throw new Error("Provide a rubric or an instructions repo with the week's README.");
      }

      // Step 6: Grade each student repo.
      const results: GradeResult[] = [];
      const notes: string[] = [];

      for (let i = 0; i < students.length; i++) {
        const student = students[i];
        try {
          onProgress(`Grading ${i + 1}/${students.length}...`);
          const r = await gradeRepoAction(student.repo, instructions, rubric, helpers.provider);

          if ("error" in r) {
            notes.push(`${student.student || student.repo}: ${r.error}`);
            continue;
          }

          const gr = r.run.results[0];
          if (!gr) {
            notes.push(`${student.student || student.repo}: no result returned`);
            continue;
          }

          gr.student = student.student || gr.student;
          gr.userId = student.canvasUserId && /^\d+$/.test(student.canvasUserId) ? Number(student.canvasUserId) : undefined;
          results.push(gr);
        } catch (err) {
          notes.push(
            `${student.student || student.repo}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Step 7: Assemble GradingRunEntry and save the draft.
      const rubricAreaNames = results[0]?.rubricAreas.map((a) => a.area) ?? [];
      const entry: GradingRunEntry = {
        courseName: tile.name,
        assignmentName: moduleName,
        canvasUrl: String(values.assignmentUrl ?? "").trim(),
        run: { results, rubricAreaNames, fullCreditChecklist: [], speedGraderUrl: null },
        institution: tile.institution || undefined,
        pointsPossible:
          String(values.pointsPossible ?? "").trim() !== "" && Number.isFinite(Number(values.pointsPossible))
            ? Number(values.pointsPossible)
            : null,
      };

      const summary = `${tile.name} - ${moduleName}: graded ${results.length} repo(s)`;
      const saveRes = await saveGradingDraftAction(summary, { runs: [entry] }, helpers.workflowId, helpers.workflowName);
      if ("error" in saveRes) throw new Error(saveRes.error);

      return {
        outputs: { draftId: saveRes.id, graded: results.length, moduleName },
        summary: {
          kind: "text",
          text: `${summary}.${notes.length ? ` (${notes.join("; ")})` : ""}`,
        },
      };
    },
  },

  {
    type: "draft-missing-zeros",
    name: "Draft zeros for missing submissions",
    description:
      "For a Canvas course, draft a grade of 0 for every student who has not submitted an assignment by its deadline (already-graded students and students with an unexpired extension are skipped). Saves a grading draft you review in Drafts > Grades before posting to Canvas.",
    inputs: [
      { key: "course", label: "Course", type: "lmsCourse", required: true, help: "The Canvas course URL." },
      {
        key: "assignment",
        label: "Assignment (optional)",
        type: "text",
        required: false,
        help: "A single assignment URL or id. Leave empty to sweep every past-due assignment in the course.",
      },
    ],
    outputs: [
      { key: "draftId", label: "Draft id", type: "text" },
      { key: "zeroed", label: "Zeros drafted", type: "text" },
    ],
    run: async (values) => {
      const courseUrl = String(values.course ?? "").trim();
      if (!courseUrl) throw new Error("Provide the Canvas course URL.");
      const res = await draftZerosForMissingAction({
        courseUrl,
        assignmentId: String(values.assignment ?? "").trim() || undefined,
      });
      if ("error" in res) throw new Error(res.error);
      return { outputs: { draftId: res.draftId ?? "", zeroed: String(res.zeroed) }, summary: { kind: "text", text: res.summary } };
    },
  },

  {
    type: "grade-one-submission",
    name: "Grade one submission",
    description: "AI-score a single submission's code against a rubric (finer-grained than the batch grader). Good for regrades and appeals. Scoring only; does not post.",
    inputs: [
      { key: "code", label: "Submission code/text", type: "longtext", required: true },
      { key: "courseId", label: "Course id", type: "text", required: true },
      { key: "assignmentId", label: "Assignment id", type: "text", required: true },
      { key: "userId", label: "Student user id", type: "text", required: true, help: "The numeric Canvas user id." },
    ],
    outputs: [
      { key: "gradeSummary", label: "Grade and feedback", type: "longtext" },
      { key: "canvasUrl", label: "Submission URL", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const code = String(values.code ?? "").trim();
      if (!code) {
        throw new Error("Provide the submission code or text.");
      }

      const courseId = String(values.courseId ?? "").trim();
      if (!courseId) {
        throw new Error("Provide the course id.");
      }

      const assignmentId = String(values.assignmentId ?? "").trim();
      if (!assignmentId) {
        throw new Error("Provide the assignment id.");
      }

      const userIdRaw = String(values.userId ?? "").trim();
      if (!/^\d+$/.test(userIdRaw)) {
        throw new Error("Provide the numeric student user id.");
      }

      onProgress("Grading submission...");
      const r = await gradeOneSubmissionAction(code, courseId, assignmentId, Number(userIdRaw), helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      const gradeSummaryLines: string[] = [];
      for (const result of r.run.results) {
        gradeSummaryLines.push(`Student: ${result.student}`);
        if (result.totalScore) {
          gradeSummaryLines.push(`Total Score: ${result.totalScore}`);
        }
        for (const area of result.rubricAreas) {
          gradeSummaryLines.push(`${area.area}: ${area.score}`);
        }
        if (result.overallComment) {
          gradeSummaryLines.push(`Feedback: ${result.overallComment}`);
        }
        gradeSummaryLines.push("");
      }

      const gradeSummary = gradeSummaryLines.join("\n").trim();

      return {
        outputs: { gradeSummary, canvasUrl: r.canvasUrl },
        summary: { kind: "text", text: gradeSummary },
      };
    },
  },

  {
    type: "list-missing-submissions",
    name: "List missing submissions",
    description:
      "Report every student who has not submitted a past-due assignment in a Canvas course (already-graded students and unexpired extensions are skipped). Report only - drafts nothing; pair with Draft student nudges or Draft zeros for missing submissions.",
    inputs: [
      { key: "course", label: "Course", type: "lmsCourse", required: true, help: "The Canvas course URL." },
      { key: "assignment", label: "Assignment (optional)", type: "text", required: false, help: "A single assignment URL or id. Leave empty to sweep every past-due assignment in the course." },
    ],
    outputs: [
      { key: "missingJson", label: "Missing (JSON)", type: "longtext" },
      { key: "missing", label: "Missing (readable)", type: "longtext" },
      { key: "count", label: "How many", type: "number" },
      { key: "hasMissing", label: "Any missing?", type: "boolean" },
    ],
    run: async (values) => {
      const courseUrl = String(values.course ?? "").trim();
      if (!courseUrl) {
        throw new Error("Select an LMS course.");
      }

      const res = await listMissingSubmissionsAction({
        courseUrl,
        assignmentId: String(values.assignment ?? "").trim() || undefined,
      });
      if ("error" in res) {
        throw new Error(res.error);
      }

      const missingJson = JSON.stringify(res.missing);
      const pairs = res.missing.reduce((sum, a) => sum + a.students.length, 0);

      const missingLines: string[] = [];
      for (const assignment of res.missing) {
        missingLines.push(`${assignment.assignmentName} (due ${assignment.dueAt ?? "unknown"})`);
        for (const student of assignment.students) {
          missingLines.push(`- ${student.name}`);
        }
      }

      const missing = missingLines.length > 0 ? missingLines.join("\n") : "No missing submissions found.";

      return {
        outputs: {
          missingJson,
          missing,
          count: String(pairs),
          hasMissing: pairs > 0 ? "1" : "",
        },
        summary: { kind: "text", text: res.summary },
      };
    },
  },

  {
    type: "gradebook-health-report",
    name: "Gradebook health report",
    description:
      "Pull every student's current score for the chosen courses, compute the class average, and flag at-risk students below a threshold (or with no score yet).",
    inputs: [
      { key: "courses", label: "LMS courses", type: "lmsCourseList", required: true, help: "One, several, or all courses at the institution." },
      { key: "threshold", label: "At-risk below (percent)", type: "number", required: false, help: "Default 70." },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the active institution." },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "atRisk", label: "At-risk students", type: "longtext" },
      { key: "count", label: "At-risk count", type: "number" },
      { key: "hasAtRisk", label: "Any at risk?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || "";
      if (!inst) {
        throw new Error("Provide an institution (or set one active).");
      }

      const thresholdRaw = String(values.threshold ?? "").trim();
      const threshold = Number.isFinite(Number(thresholdRaw)) && Number(thresholdRaw) >= 0 ? Number(thresholdRaw) : 70;

      const courseLines = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const reportLines: string[] = [];
      const atRiskLines: string[] = [];
      let totalAtRisk = 0;
      const multi = courseLines.length > 1;

      for (const courseUrl of courseLines) {
        const courseId = parseCanvasCourseId(courseUrl);
        if (!courseId) {
          reportLines.push(`${courseUrl}: Invalid Canvas course URL.`);
          continue;
        }

        onProgress(`Reading gradebook for ${multi ? courseUrl : "..."}`);

        const res = await listCourseGradeSummariesAction(inst, courseId);
        if ("error" in res) {
          reportLines.push(`${courseUrl}: ${res.error}`);
          continue;
        }

        reportLines.push(`## ${courseUrl}`);

        const scores = res.students.map((s) => (s.currentScore !== null ? s.currentScore : null)).filter((s) => s !== null) as number[];
        const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : null;

        if (avg !== null) {
          reportLines.push(`Average current score: ${avg}% (${res.students.length} student(s))`);
        } else {
          reportLines.push("Average current score: no scores yet");
        }

        const courseAtRisk: string[] = [];
        for (const student of res.students) {
          const isAtRisk = student.currentScore === null || student.currentScore < threshold;
          if (isAtRisk) {
            totalAtRisk++;
            const scoreStr = student.currentScore !== null ? `${student.currentScore}%` : "no score yet";
            const line = `- ${student.name} - ${scoreStr}`;
            courseAtRisk.push(line);
          }
        }

        if (courseAtRisk.length > 0) {
          reportLines.push("At risk:");
          reportLines.push(...courseAtRisk);
        } else {
          reportLines.push("No students at risk.");
        }

        if (multi) {
          atRiskLines.push(`# ${courseUrl}`);
          atRiskLines.push(...courseAtRisk);
        } else {
          atRiskLines.push(...courseAtRisk);
        }
      }

      const report = reportLines.join("\n");
      const atRisk = atRiskLines.length > 0 ? atRiskLines.join("\n") : "(no at-risk students)";

      return {
        outputs: {
          report,
          atRisk,
          count: String(totalAtRisk),
          hasAtRisk: totalAtRisk > 0 ? "1" : "",
        },
        summary: { kind: "text", text: report },
      };
    },
  },

  {
    type: "import-gradebook-csv",
    name: "Import gradebook CSV",
    description: "Parse a gradebook export from Canvas, Brightspace, Blackboard, or Moodle; extract students and grades; list missing submissions by item.",
    inputs: [
      { key: "gradebook", label: "Gradebook CSV", type: "uploads", required: true, help: "Upload the .csv/.xls/.txt/.tsv gradebook exported from the LMS." },
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: false, help: "Optional - merges imported students into the tile's roster." },
      { key: "assignment", label: "Assignment (optional)", type: "text", required: false, help: "Filter missing submissions to one item name." },
    ],
    outputs: [
      { key: "gradebookJson", label: "Gradebook (JSON)", type: "longtext" },
      { key: "missingJson", label: "Missing (JSON)", type: "longtext" },
      { key: "students", label: "Student count", type: "number" },
      { key: "hasMissing", label: "Any missing?", type: "boolean" },
      { key: "report", label: "Import report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const files = Array.isArray(values.gradebook) ? (values.gradebook as File[]) : [];
      if (files.length === 0) {
        throw new Error("Upload the gradebook CSV exported from the LMS.");
      }

      onProgress("Parsing gradebook...");
      const csv = await files[0].text();
      const parsed = parseGradebookCsv(csv);

      const studentCount = parsed.students.length;
      const itemCount = parsed.items.length;

      const assignmentFilter = String(values.assignment ?? "").trim() || undefined;
      const missing = missingFromGradebook(parsed, assignmentFilter);

      const reportLines: string[] = [];
      reportLines.push(`Format: ${parsed.format}`);
      reportLines.push(`Students: ${studentCount}`);
      reportLines.push(`Items: ${itemCount}`);
      reportLines.push(`Missing submissions: ${missing.length}`);

      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (hubCourseId) {
        try {
          onProgress("Merging roster...");
          const list = await listCourseHubAction();
          if ("error" in list) {
            reportLines.push(`Roster merge failed: ${list.error}`);
          } else {
            const tile = list.courses.find((c) => c.id === hubCourseId);
            if (tile) {
              const students = parsed.students.map((s) => ({
                name: s.name,
                email: s.email,
                externalId: s.externalId,
              }));
              const merged = mergeImportedRoster(tile.studentRepos ?? [], students);

              const overrides: Record<string, unknown> = {};
              if (merged.added > 0 || merged.matched > 0) {
                overrides.studentRepos = merged.studentRepos;
                overrides.roster = merged.roster;
                reportLines.push(`+${merged.added} added, ${merged.matched} matched`);

                const updateResult = await updateCourseHubAction(hubCourseId, {
                  ...courseToInputPayload(tile),
                  ...overrides,
                });
                if ("error" in updateResult) {
                  reportLines.push(`Roster update failed: ${updateResult.error}`);
                } else {
                  reportLines.push(`Roster updated successfully`);
                }
              }
            }
          }
        } catch (err) {
          reportLines.push(`Roster merge error: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }

      const gradebookJson = JSON.stringify({
        format: parsed.format,
        students: parsed.students,
        items: parsed.items,
      });
      const missingJson = JSON.stringify(missing);

      return {
        outputs: {
          gradebookJson,
          missingJson,
          students: String(studentCount),
          hasMissing: missing.length > 0 ? "1" : "",
          report: reportLines.join("\n"),
        },
        summary: { kind: "text", text: reportLines.join("\n") },
      };
    },
  },

  {
    type: "export-grades-for-lms",
    name: "Export grades for LMS",
    description: "Convert approved grades from a grading run into a gradebook file ready to upload to Canvas, Brightspace, Blackboard, or Moodle.",
    inputs: [
      { key: "runs", label: "Grading runs", type: "courseList", required: true },
      { key: "approvedGrades", label: "Approved grades", type: "courseList", required: true, help: "The reviewed rows from the grading step." },
      { key: "template", label: "Gradebook template", type: "uploads", required: false, help: "Optional - an exported gradebook file from the LMS to fill." },
      { key: "lms", label: "LMS", type: "text", required: true, help: "canvas, brightspace, blackboard, or moodle." },
      { key: "itemName", label: "Assignment name (optional)", type: "text", required: false, help: "Overrides the assignment name used for the column." },
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: false, help: "Optional - saves the file to the course's materials." },
    ],
    outputs: [
      { key: "fileName", label: "File name", type: "text" },
      { key: "exported", label: "Grades exported", type: "number" },
      { key: "report", label: "Export report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      interface RunEntry {
        courseName: string;
        assignmentName: string;
        canvasUrl: string;
        run: GradingRun;
        offline?: boolean;
      }

      const runs = Array.isArray(values.runs) ? (values.runs as RunEntry[]) : [];
      const approved = Array.isArray(values.approvedGrades) ? (values.approvedGrades as Array<Record<string, string>>) : [];

      if (runs.length === 0) {
        throw new Error("Provide grading runs to export.");
      }

      const lmsType = String(values.lms ?? "").trim().toLowerCase();
      if (!["canvas", "brightspace", "blackboard", "moodle"].includes(lmsType)) {
        throw new Error("Select a valid LMS: canvas, brightspace, blackboard, or moodle.");
      }

      const itemNameOverride = String(values.itemName ?? "").trim() || undefined;
      const templateFiles = Array.isArray(values.template) ? (values.template as File[]) : [];
      let templateCsv: string | undefined;
      if (templateFiles.length > 0) {
        templateCsv = await templateFiles[0].text();
      }

      // Extract approved scores per the post-grades pattern
      const approvedByRunIndex = new Map<string, Array<Record<string, string>>>();
      for (const row of approved) {
        const runIndex = row.runIndex ?? "";
        if (!approvedByRunIndex.has(runIndex)) {
          approvedByRunIndex.set(runIndex, []);
        }
        approvedByRunIndex.get(runIndex)!.push(row);
      }

      const scores: Array<{ name?: string; externalId?: string; username?: string; email?: string; itemName: string; score: string }> = [];

      for (let i = 0; i < runs.length; i++) {
        const entry = runs[i];
        if (entry.offline) continue;

        const runApprovedRows = approvedByRunIndex.get(String(i)) ?? [];
        const itemName = itemNameOverride || entry.assignmentName;

        for (const approvedRow of runApprovedRows) {
          const resultIndex = approvedRow.resultIndex ? parseInt(approvedRow.resultIndex, 10) : null;
          if (resultIndex === null || resultIndex < 0 || resultIndex >= entry.run.results.length) continue;

          const result = entry.run.results[resultIndex];
          const grade = (approvedRow.grade ?? "").trim();
          if (!grade || !grade.match(/^-?\d+(\.\d+)?$/)) continue;

          scores.push({
            name: approvedRow.student,
            externalId: typeof result.userId === "number" ? String(result.userId) : undefined,
            itemName,
            score: grade,
          });
        }
      }

      if (scores.length === 0) {
        throw new Error("No approved grades to export.");
      }

      // Enrich scores with email from the course tile roster if available
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (hubCourseId) {
        onProgress("Loading course roster...");
        const listResult = await listCourseHubAction();
        if (!("error" in listResult)) {
          const tile = listResult.courses.find((c) => c.id === hubCourseId);
          if (tile && tile.studentRepos && tile.studentRepos.length > 0) {
            for (const score of scores) {
              if (score.email) continue; // Already has email
              const externalIdNum = score.externalId ? parseInt(score.externalId, 10) : NaN;
              let matched = false;
              // Try to match by canvasUserId
              if (!isNaN(externalIdNum)) {
                const student = tile.studentRepos.find((s) => s.canvasUserId === String(externalIdNum));
                if (student && student.email) {
                  score.email = student.email;
                  matched = true;
                }
              }
              // Try to match by name if no canvasUserId match
              if (!matched && score.name) {
                const student = tile.studentRepos.find(
                  (s) => s.student.toLowerCase() === score.name!.toLowerCase()
                );
                if (student && student.email) {
                  score.email = student.email;
                }
              }
            }
          }
        }
      }

      // Check if Moodle export has emails
      if (lmsType === "moodle") {
        const hasEmails = scores.some((s) => s.email && s.email.trim());
        if (!hasEmails) {
          throw new Error("Moodle export needs student emails - upload the Moodle gradebook as a template or import the roster with emails first.");
        }
      }

      onProgress("Building gradebook file...");

      let finalCsv: string;
      let fileName: string;

      if (templateCsv) {
        const fillResult = fillGradebookCsv(templateCsv, scores);
        finalCsv = fillResult.csv;
        fileName = `grades-${lmsType}-${new Date().toISOString().split("T")[0]}.csv`;
        if (lmsType === "blackboard" && templateCsv.includes("\t")) {
          fileName = `grades-${lmsType}-${new Date().toISOString().split("T")[0]}.txt`;
        }
      } else {
        if (["brightspace", "blackboard"].includes(lmsType)) {
          throw new Error(`Upload the gradebook file downloaded from the LMS - ${lmsType} imports must start from its own export.`);
        }

        if (lmsType === "canvas") {
          finalCsv = buildCanvasGradebookCsv(
            scores.map((s) => ({ name: s.name || "", externalId: s.externalId || "" })),
            { name: scores[0].itemName, pointsPossible: 100 },
            new Map(scores.map((s) => [s.externalId || "", s.score]))
          );
          fileName = `grades-canvas-${new Date().toISOString().split("T")[0]}.csv`;
        } else {
          finalCsv = buildMoodleGradebookCsv(
            scores.map((s) => ({ email: s.email || "" })),
            scores[0].itemName,
            new Map(scores.map((s) => [s.email || "", s.score]))
          );
          fileName = `grades-moodle-${new Date().toISOString().split("T")[0]}.csv`;
        }
      }

      const blob = new Blob([finalCsv], { type: "text/csv" });

      if (helpers.saveBundle) {
        try {
          onProgress("Saving file...");
          await helpers.saveBundle(blob, fileName);
        } catch (err) {
          throw new Error(`Could not save file: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }

      if (hubCourseId && helpers.saveCourseMaterialFile) {
        try {
          await helpers.saveCourseMaterialFile(hubCourseId, blob, fileName);
        } catch (err) {
          throw new Error(`Could not save to course materials: ${err instanceof Error ? err.message : "unknown"}`);
        }
      }

      const report = `Exported ${scores.length} grades to ${fileName}`;

      return {
        outputs: {
          fileName,
          exported: String(scores.length),
          report,
        },
        summary: { kind: "text", text: report },
      };
    },
  },

  {
    type: "grade-cartridge-submissions",
    name: "Grade dropped cartridges",
    description: "Grades submission archives (.zip files) uploaded to the Cartridge drop panel, builds upload-ready gradebook CSVs, and produces grading drafts for review.",
    inputs: [
      {
        key: "maxDrops",
        label: "Drops per run",
        type: "number",
        required: false,
        help: "Maximum cartridge drops to grade in one run. Default 3.",
      },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "graded", label: "Graded", type: "number" },
      { key: "hasGraded", label: "Any graded?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const maxDrops = Math.max(Math.min(Number(values.maxDrops ?? 3) || 3, 100), 1);
      const lines: string[] = [];
      let gradedCount = 0;
      const runs: GradingRunEntry[] = [];
      const csvFiles: Array<{ name: string; base64: string }> = [];

      // Load new drops
      onProgress("Loading cartridge drops...");
      const dropsResult = await listNewCartridgeDropsAction(maxDrops);
      if ("error" in dropsResult) {
        throw new Error(dropsResult.error);
      }

      const drops = dropsResult;
      if (drops.length === 0) {
        lines.push("No new cartridge drops to grade.");
        return {
          outputs: {
            report: lines.join("\n"),
            graded: 0,
            hasGraded: "",
          },
          summary: { kind: "text", text: "Nothing to grade." },
        };
      }

      lines.push(`Found ${drops.length} drop(s) to grade.`);

      // Grade each drop
      for (const drop of drops) {
        try {
          onProgress(`Grading ${drop.name}...`);

          // Take the drop (CAS new -> processing)
          const takeResult = await takeCartridgeDropAction(drop.id);
          if ("error" in takeResult) {
            lines.push(`${drop.name}: ${takeResult.error}`);
            await finishCartridgeDropAction(drop.id, {
              status: "error",
              error: takeResult.error,
            });
            continue;
          }

          // Create FormData for gradeAction with the zip
          const formData = new FormData();
          const zipBlob = new Blob([Buffer.from(takeResult.zipBase64, "base64")], {
            type: "application/zip",
          });
          const zipFile = new File([zipBlob], `${drop.name}`, {
            type: "application/zip",
          });
          formData.append("studentSubmissions", zipFile);
          formData.append("assignmentInstructions", `${drop.courseLabel} - ${drop.assignmentLabel}`);
          if (takeResult.rubricText) {
            formData.append("rubric", takeResult.rubricText);
          }
          formData.append("provider", helpers.provider);

          // Grade the zip
          const gradeResult = await gradeAction({ run: null, error: null }, formData);
          if (!gradeResult.run) {
            const errorMsg = gradeResult.error || "Grading failed.";
            lines.push(`${drop.name}: ${errorMsg}`);
            await finishCartridgeDropAction(drop.id, {
              status: "error",
              error: errorMsg,
            });
            continue;
          }

          // Extract student names from grading results
          const allResults = gradeResult.run.results;

          // For Moodle: filter to only students with '@' in their identity
          let students: Array<{ name?: string; externalId?: string; email?: string }>;
          const scores = new Map<string, string>();

          if (takeResult.lms === "moodle") {
            const moodleStudents: Array<{ email: string }> = [];
            for (const result of allResults) {
              const scoreMatch = result.totalScore.match(/(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/) ?? result.totalScore.match(/-?\d+(?:\.\d+)?/);
              const score = scoreMatch ? scoreMatch[1] ?? scoreMatch[0] : result.totalScore;
              if (result.student.includes("@")) {
                moodleStudents.push({ email: result.student });
                scores.set(result.student, score);
              } else {
                lines.push(`${drop.name}: Skipped student "${result.student}" (not a valid email address for Moodle)`);
              }
            }
            students = moodleStudents;
          } else {
            // canvas, brightspace, blackboard all use the same format
            students = allResults.map((r) => ({
              name: r.student,
              externalId: r.student.replace(/\s+/g, "_"),
            }));
            for (const result of allResults) {
              const scoreMatch = result.totalScore.match(/(-?\d+(?:\.\d+)?)\s*\/\s*-?\d+/) ?? result.totalScore.match(/-?\d+(?:\.\d+)?/);
              const score = scoreMatch ? scoreMatch[1] ?? scoreMatch[0] : result.totalScore;
              scores.set(result.student.replace(/\s+/g, "_"), score);
            }
          }

          // Infer pointsPossible from grading results if not set on the drop
          let pointsPossible = takeResult.pointsPossible;
          if (!pointsPossible && allResults.length > 0) {
            const firstScore = allResults[0].totalScore;
            const match = firstScore.match(/\/(\d+(?:\.\d+)?)/);
            if (match) {
              pointsPossible = Math.round(Number(match[1]) * 100) / 100;
            }
          }
          if (!pointsPossible) {
            pointsPossible = 100;
          }

          // Build gradebook CSV based on LMS type
          let csvContent = "";
          if (takeResult.lms === "moodle") {
            csvContent = buildMoodleGradebookCsv(
              students as Array<{ email: string }>,
              drop.assignmentLabel,
              scores
            );
          } else {
            // canvas, brightspace, blackboard all use the same format
            csvContent = buildCanvasGradebookCsv(
              students as Array<{ name: string; externalId: string }>,
              { name: drop.assignmentLabel, pointsPossible },
              scores
            );
          }

          // Convert CSV to base64
          const csvBase64 = Buffer.from(csvContent).toString("base64");
          csvFiles.push({
            name: `${drop.id}-grades.csv`,
            base64: csvBase64,
          });

          // Finish the cartridge drop (upload CSV, mark as graded)
          const finishResult = await finishCartridgeDropAction(drop.id, {
            status: "graded",
            csvName: `${drop.assignmentLabel}_grades.csv`,
            csvBase64,
          });

          if ("error" in finishResult) {
            lines.push(`${drop.name}: Could not save grades - ${finishResult.error}`);
            continue;
          }

          // Create GradingRunEntry for draft (offline-style)
          const entry: GradingRunEntry = {
            courseName: drop.courseLabel,
            assignmentName: drop.assignmentLabel,
            canvasUrl: "",
            run: gradeResult.run,
            offline: true,
            pointsPossible: takeResult.pointsPossible,
          };
          runs.push(entry);
          gradedCount++;
          lines.push(`${drop.name}: graded (${gradeResult.run.results.length} students)`);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          lines.push(`${drop.name}: ${errorMsg}`);
          try {
            await finishCartridgeDropAction(drop.id, {
              status: "error",
              error: errorMsg,
            });
          } catch {
            // Best effort
          }
        }
      }

      // Save CSV files to library
      for (const csvFile of csvFiles) {
        try {
          onProgress(`Saving ${csvFile.name}...`);
          await saveLibraryFileAction({
            name: csvFile.name,
            base64: csvFile.base64,
            mimeType: "text/csv",
            fileExt: "csv",
            workflowId: helpers.workflowId,
            workflowName: helpers.workflowName,
            workflowRunId: helpers.workflowRunId,
          });
        } catch (err) {
          lines.push(`Could not save CSV file: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Save grading draft if any were graded
      if (runs.length > 0) {
        try {
          const strippedRuns = stripGradingRunEntriesForDraft(runs);
          const summary = `${gradedCount} cartridge drop(s) graded`;
          const draftResult = await saveGradingDraftAction(
            summary,
            { runs: strippedRuns },
            helpers.workflowId,
            helpers.workflowName
          );
          if ("error" in draftResult) {
            lines.push(`Could not save grading draft: ${draftResult.error}`);
          } else {
            lines.push(`Grading draft saved.`);
          }
        } catch (err) {
          lines.push(`Could not save grading draft: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      lines.push(`Completed: ${gradedCount} graded.`);

      // Fail the step if we attempted at least one drop but none succeeded
      if (drops.length > 0 && gradedCount === 0) {
        throw new Error("All cartridge drop grading attempts failed.");
      }

      return {
        outputs: {
          report: lines.join("\n"),
          graded: gradedCount,
          hasGraded: gradedCount > 0 ? "1" : "",
        },
        summary: {
          kind: "text",
          text: lines.join("\n"),
        },
      };
    },
  },
];
