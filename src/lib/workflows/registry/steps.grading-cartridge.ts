import {
  listNewCartridgeDropsAction,
  takeCartridgeDropAction,
  finishCartridgeDropAction,
  saveLibraryFileAction,
  saveGradingDraftAction,
  gradeAction,
} from "@/app/actions";
import type { StepDefinition } from "@/lib/workflows/registry-helpers";
import {
  buildCanvasGradebookCsv,
  buildMoodleGradebookCsv,
} from "@/lib/gradebook-csv";
import type { GradingRunEntry } from "@/lib/grade";
import {
  stripGradingRunEntriesForDraft,
} from "@/lib/workflows/grading-review-rows";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";

export const gradingCartridgeSteps: StepDefinition[] = [
  {
    type: "grade-cartridge-submissions",
    name: "Grade uploaded submissions",
    description: "Grades student-submission zips uploaded in Files > Submissions, builds upload-ready gradebook CSVs, and produces grading drafts for review.",
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
          const csvName = buildWorkflowFileName({
            course: { courseCode: null, name: drop.courseLabel },
            artifact: "Grades",
            qualifier: drop.assignmentLabel,
            ext: "csv",
          });
          csvFiles.push({
            name: csvName,
            base64: csvBase64,
          });

          // Finish the cartridge drop (upload CSV, mark as graded)
          const finishResult = await finishCartridgeDropAction(drop.id, {
            status: "graded",
            csvName,
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
            helpers.workflowName,
            "cartridge"
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
