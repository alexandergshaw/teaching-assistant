// Client-side step catalog: LMS module management step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseContentAction,
  createModuleAction,
  requestFileUploadAction,
  createModuleItemAction,
  deleteModuleAction,
  createPageAction,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import type { GeneratedCourseFile, EnsuredModule } from "@/lib/workflows/types";

export const lmsModuleSteps: StepDefinition[] = [
  {
    type: "lms-modules",
    name: "Create LMS modules",
    description: "Ensure LMS course has the required module structure",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: false,
        help: "Optional - leave blank to skip the LMS steps.",
      },
      {
        key: "weeks",
        label: "Number of weeks",
        type: "number",
        required: true,
      },
    ],
    outputs: [
      { key: "modules", label: "LMS modules", type: "modules" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        return {
          outputs: { modules: [] },
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      const weeks = Number(values.weeks);

      onProgress("Loading existing modules...");
      const c = await listCourseContentAction(
        course,
        helpers.activeInstitution || undefined
      );

      if ("error" in c) {
        throw new Error(c.error);
      }

      const existing = c.modules;
      const modules: EnsuredModule[] = [];

      // Exactly N week modules are ensured by exact "Module NN" name match;
      // a "Start Here" (or any other) module never matches, so extra
      // starter modules cannot shift or count toward week numbering.
      for (let week = 1; week <= weeks; week++) {
        const name = `Module ${String(week).padStart(2, "0")}`;
        const found = existing.find(
          (m) => m.name.toLowerCase().trim() === name.toLowerCase().trim()
        );

        if (found) {
          modules.push({
            week,
            id: found.id,
            name: found.name,
          });
        } else {
          onProgress(`Creating ${name}...`);
          const m = await createModuleAction(
            course,
            name,
            week,
            helpers.activeInstitution || undefined
          );

          if ("error" in m) {
            throw new Error(m.error);
          }

          modules.push({
            week,
            id: m.module.id,
            name: m.module.name,
          });
        }
      }

      return {
        outputs: { modules },
        summary: {
          kind: "list",
          label: `Ensured ${modules.length} modules`,
          items: modules.map((m) => m.name),
        },
      };
    },
  },

  {
    type: "lms-populate",
    name: "Add files to LMS modules",
    description: "Upload generated course materials to LMS modules",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: false,
        help: "Optional - leave blank to skip the LMS steps.",
      },
      {
        key: "modules",
        label: "LMS modules",
        type: "modules",
        required: true,
      },
      {
        key: "files",
        label: "Generated files",
        type: "files",
        required: true,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      const modules = values.modules as EnsuredModule[];
      const files = values.files as GeneratedCourseFile[];

      if (!course) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      if (modules.length === 0) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      const uploadedLines: string[] = [];

      // Canvas appends module items in upload sequence, so upload in the
      // order the items should appear: by week, then by in-module position.
      const ordered = [...files].sort(
        (a, b) => a.weekNumber - b.weekNumber || a.sortOrder - b.sortOrder
      );

      for (const file of ordered) {
        // Modules are targeted by their own week number (set when they were
        // ensured), never by list position, so unnumbered starter modules
        // like "Start Here" cannot skew file placement.
        const targetWeek = Math.min(
          Math.max(file.weekNumber, 1),
          modules[modules.length - 1]?.week || 1
        );
        const targetModule =
          modules.find((m) => m.week === targetWeek) ||
          modules[modules.length - 1];

        if (!targetModule) {
          throw new Error("No modules available.");
        }

        // Introductions become real LMS Pages instead of uploaded docx
        // files; the docx still ships in the zip artifacts.
        if (file.role === "introduction" && file.pageText) {
          const pageTitle = file.name.replace(/\.[^.]+$/, "");
          onProgress(`Creating page "${pageTitle}" in ${targetModule.name}...`);
          const created = await createPageAction(
            course,
            { title: pageTitle, body: markdownLiteToHtml(file.pageText) },
            helpers.activeInstitution || undefined
          );

          if ("error" in created) {
            throw new Error(created.error);
          }

          const linked = await createModuleItemAction(
            course,
            targetModule.id,
            { type: "Page", pageUrl: created.page.url },
            helpers.activeInstitution || undefined
          );

          if ("error" in linked) {
            throw new Error(linked.error);
          }

          uploadedLines.push(`${file.name} -> ${targetModule.name} (page)`);
          continue;
        }

        // Instructions files with pageText ride the module assignment, not uploaded as files.
        // lms-assignments puts the text in the assignment description.
        if (file.role === "instructions" && file.pageText) {
          uploadedLines.push(`${file.name} -> ${targetModule.name} (rides the module assignment)`);
          continue;
        }

        const sanitizedFileName = file.name.replace(/[^a-z0-9 ._-]/gi, "_");

        onProgress(`Uploading ${file.name} to ${targetModule.name}...`);
        const ticket = await requestFileUploadAction(
          course,
          {
            name: sanitizedFileName,
            size: file.blob.size,
            contentType: file.mimeType,
            folderPath: "uploads",
          },
          helpers.activeInstitution || undefined
        );

        if ("error" in ticket) {
          throw new Error(ticket.error);
        }

        const form = new FormData();
        for (const [k, v] of Object.entries(
          ticket.ticket.uploadParams
        )) {
          form.append(k, v);
        }
        form.append("file", file.blob, sanitizedFileName);

        const up = await fetch(ticket.ticket.uploadUrl, {
          method: "POST",
          body: form,
        });

        if (!up.ok) {
          throw new Error(`Upload to Canvas failed (HTTP ${up.status}).`);
        }

        const uploaded = (await up.json().catch(() => null)) as {
          id?: number;
        } | null;
        if (typeof uploaded?.id !== "number") {
          throw new Error("Canvas did not return the uploaded file id.");
        }

        const item = await createModuleItemAction(
          course,
          targetModule.id,
          {
            type: "File",
            contentId: uploaded.id,
            title: file.name,
          },
          helpers.activeInstitution || undefined
        );

        if ("error" in item) {
          throw new Error(item.error);
        }

        uploadedLines.push(`${file.name} -> ${targetModule.name}`);
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Uploaded ${files.length} file(s)`,
          items: uploadedLines,
        },
      };
    },
  },

  {
    type: "lms-wipe",
    name: "Wipe LMS modules",
    description: "Deletes every module in the LMS course so it can be rebuilt from fresh contents.",
    inputs: [
      {
        key: "course",
        label: "LMS course",
        type: "lmsCourse",
        required: false,
        help: "Optional - leave blank to skip the LMS steps.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      // An empty LMS course skips the LMS steps so repo/tile-only runs
      // finish cleanly.
      const course = String(values.course ?? "").trim();
      if (!course) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      onProgress("Loading modules...");
      const c = await listCourseContentAction(
        course,
        helpers.activeInstitution || undefined
      );

      if ("error" in c) {
        throw new Error(c.error);
      }

      for (const m of c.modules) {
        onProgress(`Deleting ${m.name}...`);
        const d = await deleteModuleAction(
          course,
          m.id,
          helpers.activeInstitution || undefined
        );

        if ("error" in d) {
          throw new Error(d.error);
        }
      }

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `Deleted ${c.modules.length} module(s).`,
        },
      };
    },
  },
];
