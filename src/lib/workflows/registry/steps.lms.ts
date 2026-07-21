// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  listCourseContentAction,
  createModuleAction,
  requestFileUploadAction,
  createModuleItemAction,
  deleteModuleAction,
  updateModuleAction,
  listCourseHubAction,
  getFinalizedSyllabusAction,
  bulkDeleteAction,
  createPageAction,
  autoFixOfficeFileAction,
  checkBrokenLinksAction,
  copyFileToCanvasPageAction,
  revisePageWithAiAction,
  renameCourseFileAction,
  deleteCourseFileAction,
  createCourseCopyAction,
  getMigrationStateAction,
  submitSelectiveImportAction,
  exportCourseCartridgeAction,
} from "@/app/actions";
import { type StepDefinition, base64ToBlob, weekDeadline } from "@/lib/workflows/registry-helpers";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import type { GeneratedCourseFile, EnsuredModule } from "@/lib/workflows/types";
import { buildCommonCartridge } from "@/lib/workflows/common-cartridge";
import { planCartridgeModules } from "@/lib/week-numbering";

export const lmsSteps: StepDefinition[] = [
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

  {
    // The type id stays "blackboard-export" because saved custom workflows
    // reference it; the step now serves any Common Cartridge LMS.
    type: "blackboard-export",
    name: "LMS export (.imscc)",
    description: "Package the generated materials as a Common Cartridge for the course tile's LMS. Canvas imports deliverables as assignments with real due dates; Blackboard imports each deliverable as a gradable test (one essay submission) with the deadline in its instructions. Canvas imports via Settings > Import Course Content > Common Cartridge; Blackboard via Import Package. Modules are numbered 01 through the number of scheduled weeks.",
    inputs: [
      {
        key: "files",
        label: "Generated files",
        type: "files",
        required: true,
      },
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "Optional - names the export after this course tile.",
      },
      {
        key: "startDate",
        label: "Class start date",
        type: "date",
        required: false,
        help: "Shown on each deliverable page as the end-of-week deadline.",
      },
      {
        key: "name",
        label: "Export name",
        type: "text",
        required: false,
      },
      {
        key: "rubricFiles",
        label: "Rubric files",
        type: "files",
        required: false,
        help: "Optional - rubric documents to include in the Start Here module.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const files = values.files as GeneratedCourseFile[];
      const schedule = values.schedule as ScheduleWeekPlan[];

      // Resolve the tile once if a hubCourse is bound; used for the skip
      // check, the name default, and the LMS-specific save and summary.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const list = hubCourseId ? await listCourseHubAction() : null;
      const tile =
        list && !("error" in list)
          ? list.courses.find((c) => c.id === hubCourseId)
          : undefined;
      let tileLms = (tile?.lms ?? "").trim().toLowerCase();

      // The course tile's LMS inherits from the institution's LMS field when unset, matching the Courses tab display.
      if (!tileLms && tile?.institution && helpers.getInstitutionFields) {
        const fields = await helpers.getInstitutionFields(tile.institution).catch(() => []);
        tileLms = (fields.find((f) => f.id === "lmsUrl")?.lms ?? "").trim().toLowerCase();
      }

      // Skip if the tile was provided but not found, or it has no LMS set;
      // both Canvas and Blackboard import Common Cartridge natively, so
      // either builds. No hubCourse bound means always build.
      if (hubCourseId) {
        if (!tile || (tileLms !== "blackboard" && tileLms !== "canvas")) {
          return {
            outputs: {},
            summary: {
              kind: "text",
              text: "Skipped - the course tile has no LMS set; the plain zip download covers it.",
            },
          };
        }
      }

      let baseName = String(values.name ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/gi, "_")
        .replace(/_+/g, "_");

      if (!baseName && tile?.name?.trim()) {
        baseName = tile.name
          .trim()
          .replace(/[^a-z0-9]/gi, "_")
          .replace(/_+/g, "_");
      }

      if (!baseName) {
        baseName = "course-export";
      }

      // Deadline text keys off the course tile's start date; the form field
      // is an override.
      const startRaw =
        String(values.startDate ?? "").trim() ||
        (tile?.startDate ?? "").trim();
      const start = startRaw ? new Date(`${startRaw}T00:00:00`) : null;

      if (start && Number.isNaN(start.getTime())) {
        throw new Error("Enter the class start date as a valid date.");
      }

      const esc = (s: string): string => {
        return s
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      };

      // Canvas parses zoneless due_at values as UTC, so the timestamp must
      // be the UTC instant (suffix stripped); Canvas renders it back in the
      // course timezone. A local wall-clock string would shift the imported
      // deadline earlier by the exporter's UTC offset.
      const toUtcTimestamp = (d: Date): string =>
        d.toISOString().replace(/\.\d{3}Z$/, "");

      const weeksMap = new Map<number, GeneratedCourseFile[]>();
      for (const file of files) {
        if (!weeksMap.has(file.weekNumber)) {
          weeksMap.set(file.weekNumber, []);
        }
        weeksMap.get(file.weekNumber)!.push(file);
      }

      // Modules are numbered 01 through the number of scheduled weeks; file weeks
      // are already normalized 1-based upstream. Every numbered module ships exactly
      // one deliverable assignment so imports never produce an assignment-less module.
      const modulePlans = planCartridgeModules(schedule, Array.from(weeksMap.keys()));

      const weeks = modulePlans.map((plan) => {
        const weekFiles = weeksMap.get(plan.week) ?? [];
        const sorted = [...weekFiles].sort((a, b) => a.sortOrder - b.sortOrder);

        // Find and exclude the instructions file if it carries pageText; it becomes
        // the assignment body instead of a module file.
        const instructionsFile = sorted.find(
          (f) => f.role === "instructions" && f.pageText
        );

        // Introductions ship as .docx files in the cartridge (like slides and
        // instructions); the live path (lms-populate) converts intro text to
        // proper HTML via markdown-lite. Exclude instructions files that carry pageText
        // (they ride the assignment). All other files go into cartridgeFiles.
        const cartridgeFiles: Array<{ name: string; blob: Blob }> = [];
        const pages: Array<{ title: string; html: string }> = [];
        for (const f of sorted) {
          if (instructionsFile && f === instructionsFile) {
            continue;
          }
          cartridgeFiles.push({ name: f.name, blob: f.blob });
        }

        // Deliverables ride the CC assignment extension so the import
        // creates real assignments with rendered instructions.
        let dueText = "";
        let dueAt: string | undefined;
        if (start) {
          const due = weekDeadline(start, plan.week);
          dueText = due.toLocaleString();
          dueAt = toUtcTimestamp(due);
        }

        let html: string;
        if (instructionsFile) {
          // Each module's assignment is the generated instructions document itself -
          // a standalone artifact, not duplicated as a module file.
          html = markdownLiteToHtml(instructionsFile.pageText ?? "");
          if (dueText) {
            html += `<p><strong>Deadline:</strong> ${esc(dueText)}</p>`;
          }
        } else {
          html = `<p>Submit the URL of your GitHub repository containing this week's deliverable.</p>${
            plan.assignmentSlug
              ? `<p>Read the README for this module in the course codebase (folder "${esc(
                  plan.assignmentSlug
                )}").</p>`
              : ""
          }${dueText ? `<p><strong>Deadline:</strong> ${esc(dueText)}</p>` : ""}`;
        }

        const assignments: Array<{
          title: string;
          html: string;
          points: number;
          dueAt?: string;
        }> = [
          {
            title: plan.assignmentTitle,
            html,
            points: 100,
            dueAt,
          },
        ];

        return {
          week: plan.week,
          title: plan.title,
          files: cartridgeFiles,
          pages,
          assignments,
        };
      });

      // A "Start Here" starter module rides as week 0, purely additive:
      // buildCommonCartridge titles modules from each week's own title
      // (never array position or a week count), so the extra entry cannot
      // shift Module NN numbering. Both Blackboard and Canvas now import
      // the same single full-course cartridge.
      const starterFiles: Array<{ name: string; blob: Blob }> = [];
      let starterNote = "";
      if (tile?.syllabusId) {
        const s = await getFinalizedSyllabusAction(tile.syllabusId);
        if ("error" in s) {
          starterNote = `; syllabus could not be read (${s.error}) - Start Here contains the acknowledgement only`;
        } else {
          starterFiles.push({
            name: `${s.syllabus.name || "Syllabus"}.docx`,
            blob: base64ToBlob(
              s.syllabus.content,
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
          });
        }
      } else {
        starterNote =
          "; no syllabus on the tile - Start Here contains the acknowledgement only";
      }

      // Cartridges cannot express the live path's true/false quiz without
      // QTI; a 1-point acknowledgement assignment is the import-safe
      // equivalent.
      let acknowledgementHtml = "<p>Read the course syllabus, then submit confirming: I read and understand the syllabus.</p>";
      let ackDueAt: string | undefined;
      if (start) {
        const ackDue = new Date(start);
        ackDue.setDate(start.getDate() + 3);
        ackDue.setHours(23, 59, 0, 0);
        acknowledgementHtml += `<p><strong>Deadline:</strong> ${esc(ackDue.toLocaleString())}</p>`;
        ackDueAt = toUtcTimestamp(ackDue);
      }
      const starterAssignments: Array<{
        title: string;
        html: string;
        points: number;
        dueAt?: string;
      }> = [
        {
          title: "Syllabus Acknowledgement",
          html: acknowledgementHtml,
          points: 1,
          dueAt: ackDueAt,
        },
      ];

      const rubricFiles = (values.rubricFiles as GeneratedCourseFile[] | undefined) ?? [];
      for (const rf of rubricFiles) {
        starterFiles.push({ name: rf.name, blob: rf.blob });
      }

      weeks.unshift({
        week: 0,
        title: "Start Here",
        files: starterFiles,
        pages: [],
        assignments: starterAssignments,
      });

      const starterSummary = `Start Here included (acknowledgement as an assignment)${starterNote}.`;

      onProgress("Building Common Cartridge...");
      const blob = await buildCommonCartridge(
        baseName.replace(/_/g, " "),
        weeks,
        { flavor: tileLms === "canvas" ? "canvas" : "cc" }
      );

      // Headless (server) runs have no `document` to build a download link
      // with; the library/tile saves below still carry the file.
      const downloadSkipped = typeof document === "undefined";
      if (!downloadSkipped) {
        onProgress("Downloading .imscc...");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${baseName}.imscc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      if (helpers.saveBundle) {
        try {
          await helpers.saveBundle(blob, `${baseName}-${tileLms || "cartridge"}`);
        } catch (err) {
          console.error("Library save failed:", err);
        }
      }

      // The export also lands in the course tile's LMS Exports tile when a
      // tile is bound; a failure notes on the summary instead of failing
      // the step. No tile bound means no tile save.
      let tileSaveNote = "";
      if (hubCourseId && helpers.saveCourseExportFile) {
        onProgress("Saving to the course tile...");
        try {
          await helpers.saveCourseExportFile(
            hubCourseId,
            blob,
            `${baseName}.imscc`
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          tileSaveNote = `; saving to the course tile failed: ${msg}`;
        }
      }

      let lmsSource: "tile" | "institution" | "none" = "none";
      if (tileLms === "canvas" || tileLms === "blackboard") {
        lmsSource = "tile";
      } else if (tile?.institution && helpers.getInstitutionFields) {
        lmsSource = "institution";
      }

      let lmsSourceSuffix = "";
      if (hubCourseId) {
        if (lmsSource === "institution") {
          lmsSourceSuffix = ` (LMS read from the institution's LMS field)`;
        } else if (lmsSource === "tile") {
          lmsSourceSuffix = ` (LMS read from the course tile)`;
        }
      }

      const fileVerb = downloadSkipped ? "Saved" : "Downloaded";
      let summaryText: string;
      if (tileLms === "canvas") {
        summaryText = `Built for Canvas - deliverables import as assignments with due dates; introductions import as module documents (Word files); files import into modules. ${fileVerb} ${baseName}.imscc${lmsSourceSuffix} - import it in Canvas via Settings > Import Course Content > Common Cartridge 1.x Package.`;
      } else if (tileLms === "blackboard") {
        summaryText = `Built for Blackboard - each deliverable imports as a gradable test (one essay submission) with the deadline in its instructions; introductions import as module documents (Word files); files import into modules. ${fileVerb} ${baseName}.imscc${lmsSourceSuffix} - import it in Blackboard via Import Course Content.`;
      } else {
        summaryText = `${fileVerb} ${baseName}.imscc - import it in Canvas via Settings > Import Course Content > Common Cartridge 1.x Package (Canvas imports deliverables as assignments with due dates), or in Blackboard via Course Content > Import Package (Blackboard imports deliverables as gradable tests with deadlines in instructions).`;
      }

      return {
        outputs: {},
        summary: {
          kind: "text",
          text: `${summaryText} ${starterSummary}${tileSaveNote}`,
        },
      };
    },
  },

  {
    type: "remediate-office-file",
    name: "Remediate a course Office file",
    description: "Auto-fix accessibility issues (alt text, headings, title) in a course docx or pptx file and save it back. Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "fileId", label: "File id", type: "text", required: true, help: "The numeric Canvas file id." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "issuesAddressed", label: "Issues addressed", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        throw new Error("Select an LMS course.");
      }

      const fileIdRaw = String(values.fileId ?? "").trim();
      if (!/^\d+$/.test(fileIdRaw)) {
        throw new Error("Provide the numeric file id.");
      }

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Remediating file...");
      const r = await autoFixOfficeFileAction(course, Number(fileIdRaw), inst, helpers.provider);
      if ("error" in r) {
        throw new Error(r.error);
      }

      return {
        outputs: { issuesAddressed: r.issues.length },
        summary: { kind: "text", text: `Remediated the file (${r.issues.length} accessibility issue(s) addressed).` },
      };
    },
  },

  {
    type: "check-broken-links",
    name: "Check for broken links",
    description: "Run and read Canvas link validation for one, several, or all courses, returning any broken links. Set Kick off to start a fresh scan (results appear on a later run).",
    inputs: [
      { key: "course", label: "LMS courses", type: "lmsCourseList", required: true, help: "One, several, or all courses at the institution." },
      { key: "kickoff", label: "Kick off a fresh scan", type: "boolean", required: false },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "brokenLinks", label: "Broken links", type: "longtext" },
      { key: "state", label: "Scan state", type: "text" },
      { key: "hasBrokenLinks", label: "Has broken links", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      // Scopeable list input: newline-joined course URLs (a single URL is a
      // one-element list, so pre-scope workflows keep working).
      const courses = String(values.course ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (courses.length === 0) {
        throw new Error("Select an LMS course.");
      }

      const kickoff = String(values.kickoff ?? "") === "1";
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const multi = courses.length > 1;
      const outLines: string[] = [];
      const urls: string[] = [];
      const states: string[] = [];
      let totalBroken = 0;

      for (const course of courses) {
        onProgress(`${kickoff ? "Starting" : "Reading"} link validation${multi ? ` (${course})` : ""}...`);
        const r = await checkBrokenLinksAction(course, inst, kickoff);
        if ("error" in r) {
          outLines.push(`# ${course} - error: ${r.error}`);
          states.push("error");
          continue;
        }
        states.push(r.state);
        totalBroken += r.links.length;
        if (multi) outLines.push(`# ${course} (state: ${r.state})`);
        for (const link of r.links) {
          outLines.push(`${link.itemType}: ${link.itemTitle}`);
          outLines.push(`URL: ${link.url}`);
          outLines.push(`Reason: ${link.reason}`);
          if (link.linkText) {
            outLines.push(`Link text: ${link.linkText}`);
          }
          outLines.push("");
          urls.push(link.url);
        }
      }

      const state = multi ? [...new Set(states)].join(",") : states[0] ?? "none";

      return {
        outputs: { brokenLinks: outLines.join("\n").trim(), state, hasBrokenLinks: totalBroken > 0 ? "1" : "" },
        summary: {
          kind: "list",
          label: `${totalBroken} broken link(s) across ${courses.length} course(s)`,
          items: urls.length ? urls : ["(none)"],
        },
      };
    },
  },

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
