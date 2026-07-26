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
  listCourseHubAction,
  generateCourseSyllabusAction,
  createFinalizedSyllabusAction,
  updateCourseHubAction,
} from "@/app/actions";
import {
  type StepDefinition,
  courseToInputPayload,
} from "@/lib/workflows/registry-helpers";
import { scaffoldSyllabusFields } from "@/lib/embedded/syllabus";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { buildSyllabusFactsFromCourse, resolveSyllabusTemplateId } from "@/lib/syllabus-facts";

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

  {
    type: "generate-syllabus",
    name: "Generate the course syllabus",
    description:
      "Build the course's syllabus from its tile - the Syllabus template column plus the row's own facts and the institution's email/LMS URL - then save it to the syllabus library and link it to the tile.",
    inputs: [
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true },
      {
        key: "regenerate",
        label: "Regenerate if one already exists",
        type: "boolean",
        required: false,
        help: "Off by default: a course that already has a linked syllabus is left alone. Turn on to rebuild it from the template.",
      },
    ],
    outputs: [
      { key: "syllabusId", label: "Syllabus id", type: "text" },
      { key: "syllabusName", label: "Syllabus name", type: "text" },
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

      // A course that already has a linked syllabus is left alone unless the
      // caller explicitly asks to rebuild it - unlike starter-materials (whose
      // syllabus generation is one optional part of a larger step), this step's
      // whole job is the syllabus, so it is safe to always report success here.
      const existingSyllabusId = tile.syllabusId?.trim() ?? "";
      if (existingSyllabusId && String(values.regenerate ?? "") !== "1") {
        return {
          outputs: { syllabusId: existingSyllabusId, syllabusName: "" },
          summary: {
            kind: "text",
            text: "Course already has a linked syllabus - left alone (turn on Regenerate to rebuild it).",
          },
        };
      }

      const instFields =
        tile.institution && helpers.getInstitutionFields
          ? await helpers.getInstitutionFields(tile.institution).catch(() => [])
          : [];

      // Per-course column wins; the institution field is only a fallback for
      // tiles that predate the column (its editor was retired in the
      // tiles->table redesign, so it is unsettable in practice).
      const resolvedTemplate = resolveSyllabusTemplateId(tile.syllabusTemplateId, instFields);
      const templateId = resolvedTemplate.templateId;

      if (!templateId) {
        throw new Error("Set a syllabus template on the course (or its institution) first.");
      }

      const instEmail = instFields.find((f) => f.id === "email")?.value ?? "";
      const instLmsUrl = instFields.find((f) => f.id === "lmsUrl")?.value ?? "";

      // Checked trimmed: buildSyllabusFactsFromCourse below trims email/lmsUrl
      // before building the facts payload, so a whitespace-only stored value
      // resolves to "" in the generated syllabus. Testing the raw value here
      // would miss that case and skip the warning even though the fact ends
      // up absent from the document.
      const notes: string[] = [];
      if (!instEmail.trim()) {
        notes.push(
          "the institution has no email on file - the syllabus's email paragraph is left untouched"
        );
      }
      if (!instLmsUrl.trim()) {
        notes.push(
          "the institution has no LMS URL on file - the syllabus's LMS paragraph is left untouched"
        );
      }

      const facts = buildSyllabusFactsFromCourse(tile, {
        email: instEmail,
        lmsUrl: instLmsUrl,
      });

      onProgress(`Generating syllabus for ${tile.name}...`);
      const g = await generateCourseSyllabusAction(templateId, facts, helpers.provider);
      if ("error" in g) {
        throw new Error(g.error);
      }

      const fileName = buildWorkflowFileName({
        course: tile,
        artifact: "Syllabus",
        ext: "docx",
      });
      const saved = await createFinalizedSyllabusAction(
        g.name,
        fileName,
        g.base64,
        tile.courseCode ?? undefined
      );
      if ("error" in saved) {
        throw new Error(saved.error);
      }

      try {
        const linked = await updateCourseHubAction(tile.id, {
          ...courseToInputPayload(tile),
          syllabusId: saved.syllabus.id,
        });
        if ("error" in linked) {
          throw new Error(linked.error);
        }
      } catch (err) {
        notes.push(
          `linking the generated syllabus to the tile failed: ${
            err instanceof Error ? err.message : "unknown error"
          }`
        );
      }

      return {
        outputs: { syllabusId: saved.syllabus.id, syllabusName: saved.syllabus.name },
        summary: {
          kind: "list",
          label: `Syllabus generated: ${saved.syllabus.name}`,
          items: notes,
        },
      };
    },
  },
];
