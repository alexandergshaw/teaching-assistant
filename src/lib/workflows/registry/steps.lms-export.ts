// Client-side step catalog: LMS export and file management step definitions.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  listCourseHubAction,
  getFinalizedSyllabusAction,
  autoFixOfficeFileAction,
  checkBrokenLinksAction,
} from "@/app/actions";
import { type StepDefinition, base64ToBlob, weekDeadline } from "@/lib/workflows/registry-helpers";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import { buildCommonCartridge } from "@/lib/workflows/common-cartridge";
import { planCartridgeModules } from "@/lib/week-numbering";

export const lmsExportSteps: StepDefinition[] = [
  {
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
];
