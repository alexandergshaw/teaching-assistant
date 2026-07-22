import {
  listCourseHubAction,
  generateAssignmentRubricAction,
  gradeAction,
  pullSubmissionAction,
  listGradingQueueAction,
} from "@/app/actions";
import {
  type StepRunResult,
  type StepDefinition,
  encodeTextBase64,
} from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { GradingRunEntry } from "@/lib/grade";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import {
  buildGradingReviewRows,
  countPostableResults,
} from "@/lib/workflows/grading-review-rows";

export const gradingRunSteps: StepDefinition[] = [
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
];
