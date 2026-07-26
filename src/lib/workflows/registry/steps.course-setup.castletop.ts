// Client-side step catalog: Castletop workbook generation step.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseHubAction,
  saveLibraryFileAction,
} from "@/app/actions";
import { generateCastletopWorkbookAction } from "@/app/actions/castletop";
import {
  type StepDefinition,
  blobToBase64,
  base64ToBlob,
} from "@/lib/workflows/registry-helpers";

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function parseNumericInput(value: unknown): number | undefined {
  const str = String(value ?? "").trim();
  if (!str) return undefined;
  const num = Number(str);
  return Number.isFinite(num) ? num : undefined;
}

export const courseSetupCastletopSteps: StepDefinition[] = [
  {
    type: "castletop-workbook",
    name: "Build Castletop workload workbook",
    description:
      "Build the Castletop credit-hour workload worksheet (.xlsx) for the course tile from its schedule and connected LMS, and save it to the course's Castletop column and the Files tab.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "instructor",
        label: "Instructor name",
        type: "text",
        required: false,
        help: "Appears in the workbook's title line. Blank omits it.",
      },
      {
        key: "instructorFileAs",
        label: "Instructor (file-as)",
        type: "text",
        required: false,
        help: "Names the file, e.g. \"Loring, William\". Falls back to Instructor name when blank.",
      },
      {
        key: "contactMinutes",
        label: "Minutes per contact hour",
        type: "number",
        required: false,
        help: "The divisor in cell K3. Default 50.",
      },
      {
        key: "readingRate",
        label: "Reading rate (pages/hour)",
        type: "number",
        required: false,
        help: "Default 19.",
      },
      {
        key: "pagesPerChapter",
        label: "Pages per chapter",
        type: "number",
        required: false,
        help: "Default 30.",
      },
      {
        key: "classSessionMinutes",
        label: "Class session minutes",
        type: "number",
        required: false,
        help: "Default 120.",
      },
    ],
    outputs: [
      { key: "fileName", label: "File name", type: "text" },
      { key: "weeks", label: "Weeks covered", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) {
        throw new Error("Choose a course tile.");
      }

      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }

      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Course tile not found.");
      }

      onProgress("Building the Castletop workbook...");

      const result = await generateCastletopWorkbookAction(hubCourseId, {
        instructor: String(values.instructor ?? "").trim() || null,
        instructorFileAs: String(values.instructorFileAs ?? "").trim() || null,
        contactMinutes: parseNumericInput(values.contactMinutes),
        readingRate: parseNumericInput(values.readingRate),
        pagesPerChapter: parseNumericInput(values.pagesPerChapter),
        classSessionMinutes: parseNumericInput(values.classSessionMinutes),
      });

      if ("error" in result) {
        throw new Error(result.error);
      }

      const blob = base64ToBlob(result.base64, MIME_XLSX);

      const fileName = result.fileName;
      const summaryItems: string[] = [];

      if (typeof document !== "undefined") {
        onProgress(`Downloading ${fileName}...`);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      const base64 = await blobToBase64(blob);
      const libResult = await saveLibraryFileAction({
        name: fileName,
        base64,
        mimeType: MIME_XLSX,
        fileExt: "xlsx",
        workflowId: helpers.workflowId,
        workflowName: helpers.workflowName,
        workflowRunId: helpers.workflowRunId,
      });
      if ("error" in libResult) {
        summaryItems.push(`library save skipped: ${libResult.error}`);
      }

      if (helpers.saveCourseCastletopFile) {
        try {
          await helpers.saveCourseCastletopFile(tile.id, blob, fileName);
        } catch (err) {
          summaryItems.push(
            `saving to the course tile failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      } else {
        summaryItems.push("course-tile save skipped (no helper available)");
      }

      if (result.notes && result.notes.length > 0) {
        summaryItems.push(...result.notes);
      }

      return {
        outputs: {
          fileName,
          weeks: result.weeks,
        },
        summary: {
          kind: "list",
          label: `Castletop workbook: ${result.weeks} week(s) -> ${fileName}`,
          items: summaryItems,
        },
      };
    },
  },
];
