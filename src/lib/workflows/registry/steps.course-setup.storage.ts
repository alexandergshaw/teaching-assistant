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
      const base = String(values.courseTitle ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .slice(0, 60) || "course-schedule";
      const name = `${base}.csv`;

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
      // "course_materials" as the last resort.
      let base = String(values.name ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_");
      if (!base) {
        const list = await listCourseHubAction();
        if (!("error" in list)) {
          const tile = list.courses.find(
            (c) => c.id === String(values.hubCourse)
          );
          if (tile?.name?.trim()) {
            base = tile.name
              .trim()
              .replace(/[^a-z0-9]/gi, "_")
              .replace(/_+/g, "_");
          }
        }
      }
      if (!base) base = "course_materials";
      const fileName = `${base}.zip`;

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
