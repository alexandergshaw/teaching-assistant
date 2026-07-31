// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  setCourseCsvAction,
  listCourseHubAction,
  getAutomationRunLogAction,
  getNotYetRunStepTypesAction,
} from "@/app/actions";
import {
  type StepDefinition,
} from "@/lib/workflows/registry-helpers";
import { type GeneratedCourseFile, scheduleToCsv } from "@/lib/workflows/types";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { SAVED_ZIP_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const RUN_LOG_RULE = "=".repeat(80);

/**
 * The header prepended to the run log embedded in the terminal zip (U8-AC2).
 * `save-zip-to-course` is not the final step of Course Refresh or either
 * no-code/course kickoff preset - other steps (e.g.
 * `integrate-source-into-lms`, `populate-lms-from-class-template`) still run
 * after it, and this step's own outcome obviously cannot appear in its own
 * log. So the log this step can embed is necessarily a SNAPSHOT, never the
 * complete record - this says so explicitly, names the run id and the
 * moment the snapshot was taken, and lists the steps that had not yet run as
 * of that moment (see getNotYetRunStepTypesAction, automation-runs.ts). A
 * log that silently omitted them would read as complete when it is not,
 * which is worse than shipping no log at all.
 *
 * U9-AC7: this SAME header (and therefore this SAME snapshot) is embedded in
 * BOTH the copy saved to the course tile and the copy this step downloads to
 * the instructor's browser - at the moment this step runs they are identical.
 * Once the run finishes, U9 (server-runner.ts's post-run completion stage,
 * via zip-run-log-completion.ts) replaces this entry in the TILE-SAVED copy
 * with the complete log - but the already-downloaded local copy cannot be
 * reached or updated after the fact, so it keeps this snapshot forever. The
 * header says so explicitly, so a reader of the downloaded copy is never
 * left thinking a stale snapshot is the complete record.
 *
 * Exported so steps.course-setup.storage.test.ts can assert on the header's
 * exact content directly, without needing to unzip a real JSZip archive for
 * every case.
 */
export function buildRunLogSnapshotHeader(
  runId: string,
  notYetRun: { ok: true; stepTypes: string[] } | { ok: false },
  snapshotAt: Date = new Date()
): string {
  const lines = [
    RUN_LOG_RULE,
    "SNAPSHOT NOTICE",
    RUN_LOG_RULE,
    `Run id: ${runId}`,
    `Snapshot taken: ${snapshotAt.toISOString()}`,
    'This step ("Save contents zip to course tile") is not necessarily the last step of this run, and the log below cannot include this step\'s own outcome or anything that happened after it - the log below is a SNAPSHOT, not the complete run record.',
    "This downloaded copy's log stops here for good - once this run finishes, the copy saved to the course tile is updated with the complete log (including this step's own outcome and everything that ran after it), but a copy already downloaded to your computer cannot be updated after the fact.",
  ];

  if (notYetRun.ok) {
    if (notYetRun.stepTypes.length > 0) {
      lines.push("Step(s) that had NOT yet run as of this snapshot:");
      for (const type of notYetRun.stepTypes) lines.push(`  - ${type}`);
    } else {
      lines.push("This step was the last step of the run - no further steps were expected to run after it.");
    }
  } else {
    lines.push(
      "Which step(s), if any, ran after this one could not be determined for this snapshot - check the Automate panel once the run finishes for the complete log."
    );
  }

  lines.push(RUN_LOG_RULE);
  return lines.join("\n");
}

export const courseSetupStorageSteps: StepDefinition[] = [
  {
    type: "save-csv-to-course",
    name: "Save schedule CSV to course tile",
    description: "Store the generated schedule as the CSV on the selected course tile.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
      },
      {
        key: "courseTitle",
        label: "CSV name",
        type: "text",
        required: false,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const csv = scheduleToCsv(values.schedule as ScheduleWeekPlan[]);
      const userTitle = String(values.courseTitle ?? "").trim();
      // A user-supplied title stays a literal override; the lookup below
      // does not exist today for this step (no tile fetch), so the default
      // omits the course part rather than adding a new network call.
      const name = userTitle
        ? buildWorkflowFileName({ artifact: userTitle, ext: "csv" })
        : buildWorkflowFileName({ artifact: "Course Schedule", ext: "csv" });

      onProgress(`Saving ${name}...`);
      const r = await setCourseCsvAction(String(values.hubCourse), name, csv);

      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `Saved ${name} to the course tile.`,
        },
      };
    },
  },

  {
    type: "save-zip-to-course",
    name: "Save contents zip to course tile",
    description: "Bundle every generated file from the run - per-week materials, the grading rubric, and the schedule CSV - into ONE zip (organized into Week NN / Course-Wide folders), download it, and add it to the course tile's materials list.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "files",
        label: "Generated files",
        type: "files",
        required: true,
      },
      {
        key: "rubricFiles",
        label: "Rubric files",
        type: "files",
        required: false,
        help: "Optional - the grading rubric document (e.g. from \"Save rubric to LMS\"), included in the zip's Course-Wide folder.",
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: false,
        help: "Optional - when bound, the schedule is also included in the zip as a CSV (the same file \"Save schedule CSV to course tile\" saves to the tile).",
      },
      {
        key: "name",
        label: "Zip name",
        type: "text",
        required: false,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const weekFiles = values.files as GeneratedCourseFile[];
      const rubricFiles = (values.rubricFiles as GeneratedCourseFile[] | undefined) ?? [];
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];

      // The schedule CSV is built here (not read from an upstream output) -
      // save-csv-to-course has no output of its own (it writes straight to
      // the course tile), so the schedule it was built from is reused
      // directly via the same pure scheduleToCsv function, producing an
      // identical CSV without a second network round trip.
      const csvFile: GeneratedCourseFile | null =
        schedule.length > 0
          ? {
              name: buildWorkflowFileName({ artifact: "Course Schedule", ext: "csv" }),
              blob: new Blob([scheduleToCsv(schedule)], { type: "text/csv" }),
              mimeType: "text/csv",
              weekNumber: 0,
              sortOrder: 0,
              role: "supplement",
            }
          : null;

      const allFiles: GeneratedCourseFile[] = [
        ...weekFiles,
        ...rubricFiles,
        ...(csvFile ? [csvFile] : []),
      ];

      if (allFiles.length === 0) {
        return {
          outputs: {},
          summary: {
            kind: "text",
            text: "Skipped - no generated files to bundle.",
          },
        };
      }

      if (!helpers.saveCourseMaterialFile) {
        throw new Error("Sign in to save course materials.");
      }

      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();

      // Folder layout: one folder per week (Week 01, Week 02, ...) for
      // per-module artifacts, and a single Course-Wide folder for anything
      // not tied to a specific week (the rubric, the schedule CSV) - a flat
      // 60+ file zip is unusable for a 16-week course, and grouping by week
      // mirrors how the course itself is organized (and how the LMS modules
      // these same files were uploaded to are organized). Names already
      // differ by week in practice (buildWorkflowFileName bakes the week's
      // topic into the qualifier), but two files landing on the identical
      // name is still handled below rather than assumed away - a silent
      // JSZip overwrite would quietly drop a file from the download.
      const usedPaths = new Set<string>();
      const uniquePath = (path: string): string => {
        if (!usedPaths.has(path)) {
          usedPaths.add(path);
          return path;
        }
        const dot = path.lastIndexOf(".");
        const base = dot === -1 ? path : path.slice(0, dot);
        const ext = dot === -1 ? "" : path.slice(dot);
        let n = 2;
        let candidate = `${base} (${n})${ext}`;
        while (usedPaths.has(candidate)) {
          n++;
          candidate = `${base} (${n})${ext}`;
        }
        usedPaths.add(candidate);
        return candidate;
      };

      for (const file of allFiles) {
        const folder =
          file.weekNumber > 0
            ? `Week ${String(file.weekNumber).padStart(2, "0")}`
            : "Course-Wide";
        const path = uniquePath(`${folder}/${file.name}`);
        zip.file(path, file.blob);
      }

      // U8: the run log, added LAST (after every generated file above) so it
      // captures as much of the run as possible - fetching it is the last
      // thing this step does before finalizing the zip, so any step that
      // logged in the meantime is still reflected. NEVER allowed to fail the
      // zip (U8-AC3): a missing workflowRunId (an unattended path that never
      // set it), a failed fetch, or a throw anywhere in this block all
      // degrade to "no log in this zip" - the zip is the deliverable, the
      // log is an addition to it - and the step's own summary says why.
      let runLogNote = "";
      if (!helpers.workflowRunId) {
        runLogNote = " Run log not included (no run id was available for this run).";
      } else {
        try {
          const [logResult, notYetRun] = await Promise.all([
            getAutomationRunLogAction(helpers.workflowRunId),
            getNotYetRunStepTypesAction(helpers.workflowRunId),
          ]);
          if ("error" in logResult) {
            runLogNote = ` Run log not included (${logResult.error}).`;
          } else {
            const header = buildRunLogSnapshotHeader(helpers.workflowRunId, notYetRun);
            // U8-AC4: buildRunLogText's own text (fetched via
            // getAutomationRunLogAction, reused verbatim - never a second
            // renderer) already went through redactRunInputs before it was
            // ever written to workflow_run_steps (see run-logging.ts's
            // logStepOutcome / safeStartWorkflowRun) - nothing here
            // re-processes or re-redacts it, since doing so would risk
            // UNDOING that redaction rather than reinforcing it.
            //
            // Routed through the SAME uniquePath helper every other entry in
            // this zip already uses (entry 155 AC3, entry 159 AC6): a silent
            // JSZip overwrite would quietly drop a file, and that rule
            // applies here too, not just to the generated per-week/rubric/CSV
            // files above - even though a real course material actually named
            // "Run Log.txt" landing in Course-Wide is exceedingly unlikely.
            // In the ordinary (no collision) case this resolves to exactly
            // "Course-Wide/Run Log.txt", the path U9's post-run completion
            // stage (server-runner.ts) looks for.
            zip.file(uniquePath("Course-Wide/Run Log.txt"), `${header}\n\n${logResult.text}`);
          }
        } catch (err) {
          runLogNote = ` Run log not included (${err instanceof Error ? err.message : "unknown error"}).`;
        }
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });

      // An explicit name wins; otherwise the zip defaults to the course
      // tile's name so both Course Refresh zips share it, with
      // "Course Materials" as the last resort.
      const userName = String(values.name ?? "").trim();
      let fileName: string;
      if (userName) {
        fileName = buildWorkflowFileName({ artifact: userName, ext: "zip" });
      } else {
        const list = await listCourseHubAction();
        let course: { courseCode: string | null; name: string } | null = null;
        if (!("error" in list)) {
          const tile = list.courses.find(
            (c) => c.id === String(values.hubCourse)
          );
          if (tile) course = { courseCode: tile.courseCode, name: tile.name };
        }
        fileName = course
          ? buildWorkflowFileName({ course, artifact: "Course Materials", ext: "zip" })
          : buildWorkflowFileName({ artifact: "Course Materials", ext: "zip" });
      }

      // This is one of the run's terminal deliverables - NOT necessarily the
      // last step of Course Refresh or the kickoff presets that include it
      // (see the SNAPSHOT NOTICE header this step embeds above: a real run
      // had this step running as step 19 of 22, with
      // integrate-source-into-lms and populate-lms-from-class-template still
      // to come - see U9/entry 159 AC6, which is why the log this step can
      // embed is only ever a snapshot) - so it downloads automatically in an
      // attended run exactly like every other artifact-producing step in
      // this registry already does (lecture-zip,
      // generate-class-openers, castletop-workbook, blackboard-export): the
      // instructor should not have to go find it on the course tile. A
      // direct Blob download (not downloadBase64File) avoids doubling this
      // (potentially large) zip's memory footprint through a base64 round
      // trip - downloadBase64File exists for server-action responses that
      // are ALREADY base64 (there is no such payload here; the zip is built
      // as a Blob and stays one). Headless (server) runs have no `document`
      // and skip this exactly as every other producer step does; the tile
      // save below is what a headless run relies on instead.
      let downloadSkipped = false;
      if (typeof document !== "undefined") {
        onProgress(`Downloading ${fileName}...`);
        const url = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        downloadSkipped = true;
      }

      onProgress(`Saving ${fileName}...`);
      const hubCourseId = String(values.hubCourse);
      await helpers.saveCourseMaterialFile(hubCourseId, zipBlob, fileName);

      return {
        // U9-AC1: publish exactly what was saved (the course id + file name
        // this step wrote), so the post-run completion stage
        // (server-runner.ts / useWorkflowRun.ts, via completeCourseZipRunLog)
        // can find this EXACT file rather than re-deriving the naming
        // convention or guessing at "the newest materials file" - see
        // run-logging.ts's SAVED_ZIP_OUTPUT_KEY doc comment. Never set on the
        // early "nothing to bundle" return above, since nothing was saved
        // there.
        outputs: { [SAVED_ZIP_OUTPUT_KEY]: { courseId: hubCourseId, fileName } },
        summary: {
          kind: "text",
          text: `${downloadSkipped ? "Saved" : "Downloaded"} ${fileName} (${allFiles.length} file(s)) to the course materials.${runLogNote}`,
        },
      };
    },
  },
];
