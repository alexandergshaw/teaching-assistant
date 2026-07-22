import {
  listCourseHubAction,
  generateAssignmentRubricAction,
  gradeAction,
  pullSubmissionAction,
  listGradingQueueAction,
  saveGradingDraftAction,
  listPendingGradingDraftsAction,
  getGradingDraftAction,
  markGradingDraftReviewedAction,
  postCanvasGradesAction,
} from "@/app/actions";
import {
  type StepRunResult,
  type StepDefinition,
  encodeTextBase64,
} from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import type { GradingRun, GradingRunEntry } from "@/lib/grade";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import {
  buildGradingReviewRows,
  countPostableResults,
  stripGradingRunEntriesForDraft,
} from "@/lib/workflows/grading-review-rows";

export const gradingDraftFlowSteps: StepDefinition[] = [
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

      const saveResult = await saveGradingDraftAction(summary, { runs: strippedRuns }, helpers.workflowId, helpers.workflowName, "lms");
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
];
