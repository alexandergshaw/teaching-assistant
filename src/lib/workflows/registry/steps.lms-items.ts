// Client-side step catalog: LMS page and item management step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  revisePageWithAiAction,
  copyFileToCanvasPageAction,
  updateModuleAction,
  bulkDeleteAction,
  renameCourseFileAction,
  deleteCourseFileAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";

export const lmsItemSteps: StepDefinition[] = [
  {
    type: "revise-page-with-ai",
    name: "Revise page HTML with AI",
    description: "Apply an edit instruction to a page's HTML (returns the revised HTML to review or save in a later step).",
    inputs: [
      { key: "html", label: "Page HTML", type: "longtext", required: true },
      { key: "instruction", label: "Edit instruction", type: "text", required: true },
    ],
    outputs: [
      { key: "html", label: "Revised HTML", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const html = String(values.html ?? "").trim();
      if (!html) throw new Error("Provide the page HTML.");
      const instruction = String(values.instruction ?? "").trim();
      if (!instruction) throw new Error("Provide the edit instruction.");
      onProgress("Revising page...");
      const r = await revisePageWithAiAction(html, instruction, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { html: r.html }, summary: { kind: "text", text: r.html } };
    },
  },

  {
    type: "publish-file-as-page",
    name: "Publish a file as a Canvas page",
    description: "Publish file content (e.g. starter code) into Canvas as a code-block wiki page. Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "title", label: "Page title", type: "text", required: true },
      { key: "content", label: "File content", type: "longtext", required: true },
      { key: "filePath", label: "File path/name", type: "text", required: false, help: "Used to label the code block." },
      { key: "published", label: "Publish immediately", type: "boolean", required: false },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "pageUrl", label: "Page URL", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course.");
      const title = String(values.title ?? "").trim();
      if (!title) throw new Error("Provide a page title.");
      const content = String(values.content ?? "");
      if (!content) throw new Error("Provide the file content.");
      const filePath = String(values.filePath ?? "").trim() || title;
      const published = String(values.published ?? "") === "1";
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      onProgress("Publishing page...");
      const r = await copyFileToCanvasPageAction(course, { filePath, content, title, published }, inst);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { pageUrl: r.htmlUrl }, summary: { kind: "link", label: `Published "${title}"`, url: r.htmlUrl } };
    },
  },

  {
    type: "bulk-publish-modules",
    name: "Publish modules",
    description: "Publish (or unpublish) many modules at once. Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "moduleIds", label: "Module ids", type: "longtext", required: true, help: "One numeric module id per line." },
      { key: "unpublish", label: "Unpublish instead", type: "boolean", required: false },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "updated", label: "Modules updated", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course.");
      const ids = String(values.moduleIds ?? "").split("\n").map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
      if (ids.length === 0) throw new Error("Provide at least one numeric module id.");
      const published = String(values.unpublish ?? "") !== "1";
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      onProgress("Publishing modules...");
      let updated = 0;
      const failures: string[] = [];
      for (const id of ids) {
        const r = await updateModuleAction(course, Number(id), { published }, inst);
        if ("error" in r) {
          failures.push(`${id}: ${r.error}`);
        } else {
          updated++;
        }
      }
      const items = failures.length ? failures : [`${published ? "Published" : "Unpublished"} ${updated} module(s).`];
      return { outputs: { updated }, summary: { kind: "list", label: `${updated} of ${ids.length} module(s) updated`, items } };
    },
  },

  {
    type: "bulk-delete-lms-items",
    name: "Delete LMS items",
    description: "Bulk-delete selected assignments, quizzes, discussions, or pages from a course. Attended-only (destructive).",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "kind", label: "Item kind", type: "text", required: true, help: "assignments, quizzes, discussions, or pages (use the exact BulkKind values)." },
      { key: "ids", label: "Item ids", type: "longtext", required: true, help: "One id per line." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "deleted", label: "Items deleted", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course.");
      const kindRaw = String(values.kind ?? "").trim().toLowerCase();
      const kindMap: Record<string, "Assignment" | "Quiz" | "Discussion" | "Page"> = {
        "assignment": "Assignment",
        "assignments": "Assignment",
        "quiz": "Quiz",
        "quizzes": "Quiz",
        "discussion": "Discussion",
        "discussions": "Discussion",
        "page": "Page",
        "pages": "Page",
      };
      const kind = kindMap[kindRaw];
      if (!kind) {
        throw new Error("Item kind must be one of: Assignment, Quiz, Discussion, Page");
      }
      const ids = String(values.ids ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
      if (ids.length === 0) throw new Error("Provide at least one id.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      onProgress("Deleting items...");
      const r = await bulkDeleteAction(course, kind, ids, inst);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { deleted: r.updated }, summary: { kind: "text", text: `Deleted ${r.updated} ${kindRaw}.` } };
    },
  },

  {
    type: "manage-course-files",
    name: "Rename or delete a course file",
    description: "Rename or delete a file in a course's Files area. Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "fileId", label: "File id", type: "text", required: true, help: "The numeric Canvas file id." },
      { key: "action", label: "Action", type: "text", required: true, help: "rename or delete." },
      { key: "newName", label: "New name", type: "text", required: false, help: "Required when action is rename." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course.");
      const fileIdRaw = String(values.fileId ?? "").trim();
      if (!/^\d+$/.test(fileIdRaw)) throw new Error("Provide the numeric file id.");
      const fileId = Number(fileIdRaw);
      const action = String(values.action ?? "").trim().toLowerCase();
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      if (action === "delete") {
        onProgress("Deleting file...");
        const r = await deleteCourseFileAction(course, fileId, inst);
        if ("error" in r) throw new Error(r.error);
        return { outputs: {}, summary: { kind: "text", text: `Deleted file ${fileId}.` } };
      }
      if (action === "rename") {
        const newName = String(values.newName ?? "").trim();
        if (!newName) throw new Error("Provide the new name for the rename.");
        onProgress("Renaming file...");
        const r = await renameCourseFileAction(course, fileId, newName, inst);
        if ("error" in r) throw new Error(r.error);
        return { outputs: {}, summary: { kind: "text", text: `Renamed file ${fileId} to "${newName}".` } };
      }
      throw new Error("Action must be rename or delete.");
    },
  },
];
