// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  importLmsSyllabusAction,
  regenerateSyllabusFieldAction,
  listSyllabusTemplatesAction,
  updateSyllabusTemplateAction,
  deleteSyllabusTemplateAction,
} from "@/app/actions";
import type { StepDefinition } from "@/lib/workflows/registry-helpers";
import { scaffoldSyllabusFields } from "@/lib/embedded/syllabus";

export const syllabusSteps: StepDefinition[] = [
  {
    type: "import-lms-syllabus",
    name: "Import syllabus from the LMS",
    description: "Pull an existing syllabus from the live LMS course and save it as a finalized syllabus for reuse.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "courseName", label: "Course name", type: "text", required: false, help: "Names the imported syllabus; defaults to 'Course syllabus'." },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the active institution." },
    ],
    outputs: [
      { key: "syllabusId", label: "Syllabus id", type: "text" },
      { key: "syllabusName", label: "Syllabus name", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        throw new Error("Select an LMS course to import from.");
      }

      const courseName = String(values.courseName ?? "").trim() || "Course syllabus";
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Importing syllabus from the LMS...");
      const r = await importLmsSyllabusAction(course, inst, courseName);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { syllabusId: r.syllabusId, syllabusName: r.name },
        summary: { kind: "text", text: `Imported syllabus "${r.name}".` },
      };
    },
  },

  {
    type: "detect-syllabus-fields",
    name: "Detect syllabus fields to fill",
    description: "Scan syllabus text and list the class-specific fields (instructor, term, office hours, grading, etc.) that need filling, with suggested values.",
    inputs: [
      {
        key: "syllabusText",
        label: "Syllabus text",
        type: "longtext",
        required: true,
      },
    ],
    outputs: [
      {
        key: "fields",
        label: "Detected fields",
        type: "longtext",
      },
    ],
    run: async (values, helpers, onProgress) => {
      const text = String(values.syllabusText ?? "").trim();
      if (!text) {
        throw new Error("Paste the syllabus text to scan.");
      }

      onProgress("Scanning syllabus...");

      const paragraphs = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line, i) => ({ id: String(i), text: line }));

      const detected = scaffoldSyllabusFields(paragraphs);

      const fieldsText = detected.map((f) => `${f.label}: ${f.suggestedText}`).join("\n");

      const items = detected.map((f) => f.label);

      return {
        outputs: { fields: fieldsText },
        summary: {
          kind: "list",
          label: `${detected.length} field(s) to fill`,
          items: items.length ? items : ["(none detected)"],
        },
      };
    },
  },

  {
    type: "regenerate-syllabus-field",
    name: "Regenerate a syllabus field",
    description: "AI-rewrite a single syllabus field (e.g. course description, policies) given its current text and optional context.",
    inputs: [
      { key: "fieldLabel", label: "Field label", type: "text", required: true, help: "e.g. Course description, Grading policy." },
      { key: "currentText", label: "Current text", type: "longtext", required: false },
      { key: "context", label: "Context", type: "longtext", required: false, help: "Optional background (e.g. a codebase or course summary) to steer the rewrite." },
    ],
    outputs: [
      { key: "value", label: "New text", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const label = String(values.fieldLabel ?? "").trim();
      if (!label) throw new Error("Provide the field label to regenerate.");
      const currentText = String(values.currentText ?? "");
      const context = String(values.context ?? "");
      onProgress("Regenerating field...");
      const r = await regenerateSyllabusFieldAction({ label, currentText }, context, {}, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { value: r.text }, summary: { kind: "text", text: r.text } };
    },
  },

  {
    type: "list-syllabus-templates",
    name: "List syllabus templates",
    description: "Enumerate the saved syllabus templates so a later step can pick one to adapt.",
    inputs: [],
    outputs: [
      { key: "templates", label: "Templates", type: "longtext" },
      { key: "templateIds", label: "Template ids", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      onProgress("Loading templates...");
      const r = await listSyllabusTemplatesAction();
      if ("error" in r) throw new Error(r.error);
      const lines = r.templates.map((t) => `${t.name} (${t.id})`);
      const ids = r.templates.map((t) => t.id).join("\n");
      return {
        outputs: { templates: lines.join("\n"), templateIds: ids },
        summary: {
          kind: "list",
          label: `${r.templates.length} template(s)`,
          items: r.templates.length ? r.templates.map((t) => t.name) : ["(none)"],
        },
      };
    },
  },

  {
    type: "manage-syllabus-template",
    name: "Rename or delete a syllabus template",
    description: "Rename or delete a saved syllabus template. Attended-only.",
    inputs: [
      { key: "templateId", label: "Template id", type: "text", required: true },
      { key: "action", label: "Action", type: "text", required: true, help: "rename or delete." },
      { key: "newName", label: "New name", type: "text", required: false, help: "Required when action is rename." },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const id = String(values.templateId ?? "").trim();
      if (!id) throw new Error("Provide the template id.");
      const action = String(values.action ?? "").trim().toLowerCase();
      if (action === "delete") {
        onProgress("Deleting template...");
        const r = await deleteSyllabusTemplateAction(id);
        if ("error" in r) throw new Error(r.error);
        return { outputs: {}, summary: { kind: "text", text: `Deleted template ${id}.` } };
      }
      if (action === "rename") {
        const newName = String(values.newName ?? "").trim();
        if (!newName) throw new Error("Provide the new name for the rename.");
        onProgress("Renaming template...");
        const r = await updateSyllabusTemplateAction(id, { name: newName });
        if ("error" in r) throw new Error(r.error);
        return { outputs: {}, summary: { kind: "text", text: `Renamed template to "${newName}".` } };
      }
      throw new Error("Action must be rename or delete.");
    },
  },
];
