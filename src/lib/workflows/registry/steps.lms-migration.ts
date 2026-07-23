// Client-side step catalog: LMS course migration step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  createCourseCopyAction,
  getMigrationStateAction,
  submitSelectiveImportAction,
  exportCourseCartridgeAction,
} from "@/app/actions";
import { type StepDefinition, base64ToBlob } from "@/lib/workflows/registry-helpers";
import { parseCanvasCourseId } from "@/lib/canvas-url";

export const lmsMigrationSteps: StepDefinition[] = [
  {
    type: "copy-course-content",
    name: "Copy course content",
    description: "Start a content migration that copies one course's content into another (destination). Emits the migration id for a poll step.",
    inputs: [
      { key: "destCourse", label: "Destination LMS course", type: "lmsCourse", required: true },
      { key: "sourceCourseId", label: "Source course id", type: "text", required: true, help: "The numeric id of the course to copy FROM." },
      { key: "selective", label: "Selective (choose content later)", type: "boolean", required: false },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "migrationId", label: "Migration id", type: "text" },
      { key: "destCourse", label: "Destination course", type: "lmsCourse" },
    ],
    run: async (values, helpers, onProgress) => {
      const destUrl = String(values.destCourse ?? "").trim();
      if (!destUrl) throw new Error("Select the destination LMS course.");
      const destId = parseCanvasCourseId(destUrl);
      if (!destId) throw new Error("The destination course URL must contain a course id.");
      const sourceCourseId = String(values.sourceCourseId ?? "").trim();
      if (!sourceCourseId) throw new Error("Provide the source course id.");
      const selective = String(values.selective ?? "") === "1";
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      onProgress("Starting course copy...");
      const r = await createCourseCopyAction(destUrl, destId, sourceCourseId, selective, inst);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: { migrationId: String(r.migrationId), destCourse: destUrl },
        summary: { kind: "text", text: `Started course copy (migration ${r.migrationId}). Use Poll migration state to track it.` },
      };
    },
  },

  {
    type: "poll-migration-state",
    name: "Poll a course-copy migration",
    description: "Check the state of a running course-content migration.",
    inputs: [
      { key: "destCourse", label: "Destination LMS course", type: "lmsCourse", required: true },
      { key: "migrationId", label: "Migration id", type: "text", required: true },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "state", label: "State", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const destUrl = String(values.destCourse ?? "").trim();
      if (!destUrl) throw new Error("Select the destination LMS course.");
      const destId = parseCanvasCourseId(destUrl);
      if (!destId) throw new Error("The destination course URL must contain a course id.");
      const migRaw = String(values.migrationId ?? "").trim();
      if (!/^\d+$/.test(migRaw)) throw new Error("Provide the numeric migration id.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      onProgress("Checking migration state...");
      const r = await getMigrationStateAction(destUrl, destId, Number(migRaw), inst);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { state: r.state }, summary: { kind: "text", text: `Migration state: ${r.state}.` } };
    },
  },

  {
    type: "submit-selective-import",
    name: "Submit a selective import",
    description: "Commit a selective course-copy: import only the chosen content properties for a migration. Attended-only.",
    inputs: [
      { key: "destCourse", label: "Destination LMS course", type: "lmsCourse", required: true },
      { key: "migrationId", label: "Migration id", type: "text", required: true },
      { key: "properties", label: "Content property ids", type: "longtext", required: true, help: "One copy[...] property id per line (from the selective data)." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const destUrl = String(values.destCourse ?? "").trim();
      if (!destUrl) throw new Error("Select the destination LMS course.");
      const destId = parseCanvasCourseId(destUrl);
      if (!destId) throw new Error("The destination course URL must contain a course id.");
      const migRaw = String(values.migrationId ?? "").trim();
      if (!/^\d+$/.test(migRaw)) throw new Error("Provide the numeric migration id.");
      const properties = String(values.properties ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (properties.length === 0) throw new Error("Provide at least one content property id.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      onProgress("Submitting selective import...");
      const r = await submitSelectiveImportAction(destUrl, destId, Number(migRaw), properties, inst);
      if ("error" in r) throw new Error(r.error);
      return { outputs: {}, summary: { kind: "text", text: `Submitted selective import of ${properties.length} item(s).` } };
    },
  },

  {
    type: "export-course-cartridge",
    name: "Export a course as a cartridge",
    description: "Export a live LMS course as an IMS Common Cartridge (.imscc) for backup or migration, and save it to a course tile.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: false, help: "Save the export to this course's materials." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "fileName", label: "Export file name", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course to export.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      onProgress("Exporting course...");
      const r = await exportCourseCartridgeAction(course, inst);
      if ("error" in r) throw new Error(r.error);
      const blob = base64ToBlob(r.base64, "application/octet-stream");
      const hubCourse = String(values.hubCourse ?? "").trim();
      if (hubCourse && helpers.saveCourseMaterialFile) {
        await helpers.saveCourseMaterialFile(hubCourse, blob, r.fileName);
        return {
          outputs: { fileName: r.fileName },
          summary: { kind: "text", text: `Exported ${r.fileName} and saved it to the course materials.` },
        };
      }
      return {
        outputs: { fileName: r.fileName },
        summary: { kind: "text", text: `Exported ${r.fileName} (${Math.round(blob.size / 1024)} KB). Select a course tile to save it.` },
      };
    },
  },
];
