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
    description: "Bundle the generated files into a zip and add it to the course tile's materials list.",
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
        key: "name",
        label: "Zip name",
        type: "text",
        required: false,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const files = values.files as GeneratedCourseFile[];
      if (files.length === 0) {
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

      for (const file of files) {
        zip.file(file.name, file.blob);
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

      onProgress(`Saving ${fileName}...`);
      await helpers.saveCourseMaterialFile(String(values.hubCourse), zipBlob, fileName);

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `Saved ${fileName} to the course materials.`,
        },
      };
    },
  },
];
