// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  setCourseCsvAction,
  listCourseHubAction,
} from "@/app/actions";
import {
  type StepDefinition,
} from "@/lib/workflows/registry-helpers";
import { type GeneratedCourseFile, scheduleToCsv } from "@/lib/workflows/types";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";

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

      // This is the run's terminal deliverable - the LAST step of Course
      // Refresh (and both kickoffs, which include it) - so it downloads
      // automatically in an attended run exactly like every other
      // artifact-producing step in this registry already does (lecture-zip,
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
      await helpers.saveCourseMaterialFile(String(values.hubCourse), zipBlob, fileName);

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `${downloadSkipped ? "Saved" : "Downloaded"} ${fileName} (${allFiles.length} file(s)) to the course materials.`,
        },
      };
    },
  },
];
