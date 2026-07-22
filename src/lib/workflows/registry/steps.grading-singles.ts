import {
  listCourseHubAction,
  gradeOneSubmissionAction,
  draftZerosForMissingAction,
  listMissingSubmissionsAction,
  listCourseGradeSummariesAction,
  updateCourseHubAction,
} from "@/app/actions";
import {
  type StepDefinition,
  courseToInputPayload,
} from "@/lib/workflows/registry-helpers";
import { mergeImportedRoster } from "@/lib/workflows/roster-merge";
import {
  parseGradebookCsv,
  missingFromGradebook,
  fillGradebookCsv,
  buildCanvasGradebookCsv,
  buildMoodleGradebookCsv,
} from "@/lib/gradebook-csv";
import type { GradingRun } from "@/lib/grade";
import { parseCanvasCourseId } from "@/lib/canvas-url";

export const gradingSinglesSteps: StepDefinition[] = [
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
];
