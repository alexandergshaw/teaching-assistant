// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  type ScheduleWeekPlan,
  listCourseContentAction,
  listCourseHubAction,
  createCourseAssignmentAction,
  createGradableAction,
  createQuizQuestionAction,
  previewFileAction,
  generateAssignmentAction,
  draftAssignmentDescriptionAction,
  getAssignmentSyncStateAction,
  syncAssignmentFromRepoAction,
  syncAssignmentToRepoAction,
  generateModelAnswerAction,
  fetchCanvasMetaAction,
  saveLibraryFileAction,
} from "@/app/actions";
import {
  type StepDefinition,
  weekDeadline,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  resolveModuleObjectives,
  gatherModuleMaterials,
} from "@/lib/workflows/registry-helpers";
import { moduleItemContentUrl } from "@/lib/canvas-url";
import { scaffoldQuizQuestions, renderQuizText } from "@/lib/embedded/quiz";
import type { GeneratedCourseFile, EnsuredModule } from "@/lib/workflows/types";
import type { CanvasModule, CanvasModuleItem } from "@/lib/canvas-modules";
import { courseProgressStatus, parseWeekToken } from "@/lib/week-numbering";
import { parseLmsModuleValue, liveModuleValue } from "@/lib/workflows/module-value";

export const assignmentSteps: StepDefinition[] = [
  {
    type: "lms-assignments",
    name: "Create module assignments",
    description: "Create one deliverable assignment per module: students submit their GitHub repository URL as a text entry, with the deadline at the end of each week.",
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
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
      },
      {
        key: "repo",
        label: "Repository",
        type: "repo",
        required: true,
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "The tile's start date drives the weekly deadlines.",
      },
      {
        key: "startDate",
        label: "Class start date",
        type: "date",
        required: false,
        help: "Overrides the course tile's start date for deadline calculation.",
      },
      {
        key: "files",
        label: "Generated files",
        type: "files",
        required: false,
        help: "When bound, each module's generated instructions become the assignment description.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      const modules = values.modules as EnsuredModule[];
      if (modules.length === 0) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      const repoRef = String(values.repo);
      const schedule = values.schedule as ScheduleWeekPlan[];
      const genFiles = Array.isArray(values.files) ? (values.files as GeneratedCourseFile[]) : [];

      // Deadlines key off the course tile's start date; the form field is an
      // override.
      const hubCourseId = String(values.hubCourse ?? "").trim();
      const list = hubCourseId ? await listCourseHubAction() : null;
      const tile =
        list && !("error" in list)
          ? list.courses.find((c) => c.id === hubCourseId)
          : undefined;

      const startRaw =
        String(values.startDate ?? "").trim() ||
        (tile?.startDate ?? "").trim();
      const start = startRaw
        ? new Date(`${startRaw}T00:00:00`)
        : null;

      if (start && Number.isNaN(start.getTime())) {
        throw new Error("Enter the class start date as a valid date.");
      }

      const lines: string[] = [];

      for (const m of modules) {
        const sw = schedule.find((w) => w.week === m.week);
        const name =
          sw?.assignmentTitle ||
          `Week ${String(m.week).padStart(2, "0")} Deliverable`;

        const instructionsFile = genFiles.find(
          (f) => f.weekNumber === m.week && f.role === "instructions" && f.pageText
        );

        let description: string;
        if (instructionsFile?.pageText) {
          description = instructionsFile.pageText;
        } else {
          const descriptionLines = [
            "Submit the URL of your GitHub repository containing this week's deliverable in the text box.",
          ];

          if (repoRef) {
            descriptionLines.push(
              `Before you start, read the README for this module in the course codebase${
                sw?.assignmentSlug
                  ? ` (folder "${sw.assignmentSlug}")`
                  : ""
              }: https://github.com/${repoRef}`
            );
          }

          description = descriptionLines.join("\n\n");
        }

        let dueAt = "";
        let dueDateStr = "";
        if (start) {
          const due = weekDeadline(start, m.week);
          dueAt = due.toISOString();
          dueDateStr = ` (due ${due.toLocaleDateString()})`;
        }

        onProgress(`Creating "${name}" in ${m.name}...`);
        const created = await createCourseAssignmentAction(
          course,
          {
            name,
            description,
            pointsPossible: 100,
            dueAt,
            submissionType: "online_text_entry",
            published: true,
          },
          m.id,
          helpers.activeInstitution || undefined
        );

        if ("error" in created) {
          throw new Error(created.error);
        }

        lines.push(`${name} -> ${m.name}${dueDateStr}`);
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Created ${modules.length} assignment(s)`,
          items: lines,
        },
      };
    },
  },

  {
    type: "generate-assignment-brief",
    name: "Generate an assignment",
    description: "Draft a structured assignment (overview, steps, deliverables) from a module's objectives.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile (optional)",
        type: "hubCourse",
        required: false,
        help: "Scope the workflow to a course tile (or bind one) to auto-fill the objectives from its current module - no need to paste them.",
      },
      { key: "objectives", label: "Module objectives", type: "longtext", required: false, courseDerived: true },
      { key: "context", label: "Context", type: "longtext", required: false, help: "Optional source material." },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      { key: "assignment", label: "Assignment", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const objectives = await resolveModuleObjectives(values, helpers);
      if (!objectives) {
        throw new Error("Provide the module objectives, or scope/bind a course tile to derive them from its current module.");
      }
      const context = String(values.context ?? "");
      onProgress("Generating assignment...");
      const r = await generateAssignmentAction(objectives, context, [], helpers.provider);
      if ("error" in r) throw new Error(r.error);

      const lines: string[] = [];
      lines.push(`# ${r.title}\n`);
      lines.push("## Overview");
      lines.push(r.overview);
      lines.push("");

      if (r.steps && r.steps.length > 0) {
        lines.push("## Steps");
        for (let i = 0; i < r.steps.length; i++) {
          const step = r.steps[i];
          lines.push(`${i + 1}. ${step.stepTitle}`);
          lines.push(`   ${step.description}`);
        }
        lines.push("");
      }

      if (r.tools && r.tools.length > 0) {
        lines.push("## Tools");
        for (const tool of r.tools) {
          lines.push(`- ${tool}`);
        }
        lines.push("");
      }

      if (r.deliverables && r.deliverables.length > 0) {
        lines.push("## Deliverables");
        for (const deliverable of r.deliverables) {
          lines.push(`- ${deliverable}`);
        }
        lines.push("");
      }

      const assignment = lines.join("\n").trim();
      const items = [r.title];

      return {
        outputs: { assignment },
        summary: { kind: "list", label: "Assignment", items },
      };
    },
  },

  {
    type: "draft-assignment-description",
    name: "Draft an assignment description",
    description: "AI-draft an assignment description from its name and some notes, ready to attach when creating the assignment.",
    inputs: [
      { key: "name", label: "Assignment name", type: "text", required: true },
      { key: "notes", label: "Notes", type: "longtext", required: false, help: "Optional - what the assignment should cover." },
    ],
    outputs: [
      { key: "description", label: "Description", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const name = String(values.name ?? "").trim();
      if (!name) throw new Error("Provide the assignment name.");
      const notes = String(values.notes ?? "");
      onProgress("Drafting description...");
      const r = await draftAssignmentDescriptionAction(name, notes, helpers.provider);
      if ("error" in r) throw new Error(r.error);
      return {
        outputs: { description: r.text },
        summary: { kind: "text", text: r.text },
      };
    },
  },

  {
    type: "get-assignment-sync-state",
    name: "Check assignment/repo sync",
    description: "Compare an LMS assignment against its repo file and report whether they are in sync.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path in repo", type: "text", required: true, help: "e.g. week01/README.md" },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "inSync", label: "In sync", type: "boolean" },
      { key: "diff", label: "Difference", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const assignmentUrl = String(values.assignmentUrl ?? "").trim();
      if (!assignmentUrl) throw new Error("Provide the assignment URL.");
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide the repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path in the repo.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Comparing assignment and repo...");
      const r = await getAssignmentSyncStateAction(assignmentUrl, repo, path, inst, branch);
      if ("error" in r) throw new Error(r.error);

      const isSync = r.repoMarkdown !== null && r.repoMarkdown === r.canvasMarkdown;
      const inSyncOutput = isSync ? "1" : "";

      let diffText: string;
      if (r.repoMarkdown === null) {
        diffText = "Repo file does not exist.\n\nCanvas assignment markdown:\n" + r.canvasMarkdown;
      } else if (isSync) {
        diffText = "No differences.";
      } else {
        diffText = "Canvas:\n" + r.canvasMarkdown + "\n\n---\n\nRepo file:\n" + r.repoMarkdown;
      }

      const summaryText = isSync
        ? "In sync."
        : r.repoMarkdown === null
          ? "Repo file does not exist."
          : "Content differs between Canvas and repo file.";

      return {
        outputs: { inSync: inSyncOutput, diff: diffText },
        summary: { kind: "text", text: summaryText },
      };
    },
  },

  {
    type: "sync-assignment-to-repo",
    name: "Push assignment into the repo",
    description: "Write an LMS assignment's content into the repo file (README). Attended-only.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path in repo", type: "text", required: true, help: "e.g. week01/README.md" },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [
      { key: "path", label: "Committed path", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const assignmentUrl = String(values.assignmentUrl ?? "").trim();
      if (!assignmentUrl) throw new Error("Provide the assignment URL.");
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide the repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path in the repo.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Syncing assignment to the repo...");
      const r = await syncAssignmentToRepoAction(assignmentUrl, repo, path, inst, branch);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: { path: r.path },
        summary: { kind: "text", text: `Wrote the assignment to ${r.path}.` },
      };
    },
  },

  {
    type: "sync-assignment-from-repo",
    name: "Update assignment from the repo",
    description: "Update an LMS assignment's description from the repo file (README). Attended-only.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
      { key: "repo", label: "Repository", type: "repo", required: true },
      { key: "path", label: "File path in repo", type: "text", required: true, help: "e.g. week01/README.md" },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "branch", label: "Branch", type: "text", required: false },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const assignmentUrl = String(values.assignmentUrl ?? "").trim();
      if (!assignmentUrl) throw new Error("Provide the assignment URL.");
      const repo = String(values.repo ?? "").trim();
      if (!repo) throw new Error("Provide the repository.");
      const path = String(values.path ?? "").trim();
      if (!path) throw new Error("Provide the file path in the repo.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;
      const branch = String(values.branch ?? "").trim() || undefined;

      onProgress("Updating the assignment from the repo...");
      const r = await syncAssignmentFromRepoAction(assignmentUrl, repo, path, inst, branch);
      if ("error" in r) throw new Error(r.error);

      return {
        outputs: {},
        summary: { kind: "text", text: "Updated the assignment from the repo file." },
      };
    },
  },

  {
    type: "generate-quiz-from-material",
    name: "Generate a quiz from material",
    description: "Generate cloze and multiple-choice questions (with a verbatim answer key) from the instructor's own material. Emits the questions as JSON for an LMS import step.",
    inputs: [
      { key: "material", label: "Source material", type: "longtext", required: true },
      { key: "count", label: "How many questions", type: "number", required: false, help: "Default 5." },
    ],
    outputs: [
      { key: "quiz", label: "Quiz (with answer key)", type: "longtext" },
      { key: "questionsJson", label: "Questions (JSON)", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const material = String(values.material ?? "").trim();
      if (!material) throw new Error("Provide the source material.");
      const countRaw = String(values.count ?? "").trim();
      const count = countRaw && Number.isInteger(Number(countRaw)) && Number(countRaw) > 0 ? Number(countRaw) : 5;

      onProgress("Generating quiz...");
      const questions = scaffoldQuizQuestions(material, count);
      const quiz = renderQuizText(questions);

      return {
        outputs: { quiz, questionsJson: JSON.stringify(questions) },
        summary: { kind: "text", text: quiz || "(no questions could be generated from this material)" },
      };
    },
  },

  {
    type: "import-quiz-questions",
    name: "Import questions into a quiz",
    description: "Create quiz questions in a Canvas quiz from a generated question set (JSON from Generate a quiz). Attended-only.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "quizId", label: "Quiz id", type: "text", required: true, help: "The numeric Canvas quiz id." },
      { key: "questionsJson", label: "Questions (JSON)", type: "longtext", required: true, help: "Wired from Generate a quiz from material." },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "created", label: "Questions created", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const course = String(values.course ?? "").trim();
      if (!course) throw new Error("Select an LMS course.");

      const quizIdRaw = String(values.quizId ?? "").trim();
      if (!/^\d+$/.test(quizIdRaw)) throw new Error("Provide the numeric quiz id.");
      const quizId = Number(quizIdRaw);

      const raw = String(values.questionsJson ?? "").trim();
      if (!raw) throw new Error("Provide the questions JSON (wire it from Generate a quiz from material).");

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("The questions JSON is not valid JSON.");
      }

      if (!Array.isArray(parsed)) throw new Error("The questions JSON must be an array.");

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || undefined;

      onProgress("Creating quiz questions...");
      let created = 0;
      const failures: string[] = [];

      for (let i = 0; i < parsed.length; i++) {
        const q = parsed[i] as { type?: string; prompt?: string; answer?: string; choices?: string[] };
        const prompt = String(q.prompt ?? "");
        const answer = String(q.answer ?? "");
        const question = (q.type === "multiple_choice" && Array.isArray(q.choices))
          ? { name: `Question ${i + 1}`, text: prompt, type: "multiple_choice_question" as const, points: 1, answers: q.choices.map((c) => ({ text: String(c), correct: String(c) === answer })) }
          : { name: `Question ${i + 1}`, text: prompt, type: "short_answer_question" as const, points: 1, answers: [{ text: answer, correct: true }] };
        const r = await createQuizQuestionAction(course, quizId, question, inst);
        if ("error" in r) {
          failures.push(`Question ${i + 1}: ${r.error}`);
        } else {
          created++;
        }
      }

      const items = failures.length ? failures : [`Created ${created} question(s).`];
      return { outputs: { created }, summary: { kind: "list", label: `Created ${created} of ${parsed.length} question(s)`, items } };
    },
  },

  {
    type: "generate-module-answers",
    name: "Generate module homework answers",
    description: "Generate a full-credit model answer for every homework item (assignments and discussions) in a module, grounded in the module's objectives and materials, and save them as an instructor answer key (plain-text file on the course tile and the Files tab). Answers are saved privately to the course tile and Files tab; never published to the LMS.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "moduleId",
        label: "Module",
        type: "lmsModule",
        required: false,
        help: "Pick from the live LMS connection or the course's LMS export; without either or if left blank, falls back to the tile's current module.",
      },
      {
        key: "maxItems",
        label: "Homework items per module to answer",
        type: "number",
        required: false,
        help: "Default 6, max 10.",
      },
      {
        key: "modulesAhead",
        label: "Modules ahead",
        type: "moduleOffset",
        required: false,
        help: "How many modules past the current one to target. 0 or blank = the current module.",
      },
    ],
    outputs: [
      { key: "answers", label: "Answer key", type: "longtext" },
      { key: "report", label: "Report", type: "longtext" },
      { key: "generated", label: "Generated count", type: "number" },
      { key: "hasGenerated", label: "Has generated?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) {
        throw new Error("Choose a course tile.");
      }

      const moduleIdRaw = String(values.moduleId ?? "").trim();
      const maxItemsRaw = Number(values.maxItems ?? 6);
      const maxItems = Math.max(1, Math.min(10, maxItemsRaw));

      // Load the tile
      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      const canvasUrl = (tile.canvasUrl ?? "").trim();
      const inst = helpers.activeInstitution || undefined;
      const picked = parseLmsModuleValue(moduleIdRaw);

      // Determine which module to use: picked module or current module
      let targetModule: CanvasModule | null = null;
      let moduleName = "";
      let moduleWeekNumber: number | null = null;

      // Try to resolve the picked module or current module
      if (picked.liveId || picked.fromExport || picked.name) {
        // User picked a module or we need to resolve the current module
        if (!canvasUrl && !picked.fromExport) {
          // No live connection and not an export module
          if (moduleIdRaw) {
            return {
              outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
              summary: {
                kind: "text",
                text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
              },
            };
          }
          // Fall back to current module, but we can't resolve without LMS
          return {
            outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
            summary: {
              kind: "text",
              text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
            },
          };
        }

        if (canvasUrl && picked.liveId) {
          // Fetch from live LMS
          onProgress("Loading module items...");
          try {
            const content = await listCourseContentAction(canvasUrl, inst);
            if ("error" in content) {
              throw new Error(content.error);
            }
            const pickedIdx = content.modules.findIndex((m) => String(m.id) === picked.liveId);
            if (pickedIdx < 0) {
              throw new Error("the chosen module was not found in the LMS course");
            }
            // A modules-ahead offset applies relative to the picked module's
            // position (mirroring prepare-lecture), clamped to the last module.
            const modulesAhead = resolveModulesAhead(values);
            const targetIdx = Math.min(pickedIdx + modulesAhead, content.modules.length - 1);
            const foundModule = content.modules[targetIdx];
            targetModule = foundModule;
            moduleName = foundModule.name;
          } catch {
            return {
              outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
              summary: {
                kind: "text",
                text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
              },
            };
          }
        } else if (picked.fromExport && helpers.loadCourseExport) {
          // Load from course export (not implemented for answers generation)
          return {
            outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
            summary: {
              kind: "text",
              text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
            },
          };
        }
      } else {
        // No module picked - try to derive the current module
        if (!canvasUrl) {
          return {
            outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
            summary: {
              kind: "text",
              text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
            },
          };
        }

        // Use deadline-based current module resolution
        onProgress("Resolving current module...");
        try {
          const weekResolution = await resolveTileCurrentWeek(tile, helpers);
          if ("skip" in weekResolution) {
            return {
              outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
              summary: {
                kind: "text",
                text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
              },
            };
          }

          const rawWeek = weekResolution.rawWeek;
          const status = courseProgressStatus(rawWeek, tile.weeks);
          if (status === "not-started" || status === "complete") {
            return {
              outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
              summary: {
                kind: "text",
                text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
              },
            };
          }

          // Apply modulesAhead offset
          const modulesAhead = resolveModulesAhead(values);
          let effectiveWeek = rawWeek + modulesAhead;
          if (tile.weeks && tile.weeks > 0) {
            effectiveWeek = Math.min(effectiveWeek, tile.weeks);
          }

          // Fetch modules and find the target module
          onProgress("Loading modules...");
          const content = await listCourseContentAction(canvasUrl, inst);
          if ("error" in content) {
            throw new Error(content.error);
          }

          // Find the module matching the target week by iterating through modules
          let foundByWeek: CanvasModule | null = null;
          for (const mod of content.modules) {
            if (parseWeekToken(mod.name) === effectiveWeek) {
              foundByWeek = mod;
              break;
            }
          }

          if (!foundByWeek) {
            return {
              outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
              summary: {
                kind: "text",
                text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
              },
            };
          }

          targetModule = foundByWeek;
          moduleName = foundByWeek.name;
        } catch {
          return {
            outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
            summary: {
              kind: "text",
              text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
            },
          };
        }
      }

      if (!targetModule) {
        return {
          outputs: { answers: "", report: "", generated: 0, hasGenerated: "" },
          summary: {
            kind: "text",
            text: "Skipped - generating homework answers needs the live LMS module with its assignment text.",
          },
        };
      }

      // Parse week number from module name for the docx filename
      moduleWeekNumber = parseWeekToken(moduleName);

      // Gather module materials for context grounding
      let moduleContextTrimmed = "";
      let materialsSource = "";
      try {
        const gathered = await gatherModuleMaterials(
          tile,
          liveModuleValue(String(targetModule.id), targetModule.name),
          helpers,
          onProgress
        );
        if (gathered.materialsText) {
          moduleContextTrimmed = gathered.materialsText.slice(0, 9000);
          materialsSource = gathered.materialsSource;
        }
      } catch {
        // Fail-soft: continue without context
      }

      // Collect Assignment and Discussion items
      const answerLines: string[] = [];
      const reportLines: string[] = [];
      let generatedCount = 0;
      let erroredCount = 0;

      const assignmentLikeItems = targetModule.items.filter(
        (item: CanvasModuleItem) =>
          (item.type === "Assignment" || item.type === "Discussion") &&
          moduleItemContentUrl(canvasUrl, item.type, item.contentId, item.htmlUrl) !== null
      );

      const itemsToProcess = assignmentLikeItems.slice(0, maxItems);
      const skippedItems = assignmentLikeItems.length - itemsToProcess.length;

      // Categorize non-answerable items
      const nonAnswerableItems: string[] = [];
      for (const item of targetModule.items) {
        if (
          item.type === "Quiz" ||
          item.type === "Page" ||
          item.type === "File" ||
          item.type === "SubHeader" ||
          item.type === "ExternalUrl"
        ) {
          nonAnswerableItems.push(`${item.type}: ${item.title}`);
        }
      }

      // Process each item
      for (const item of itemsToProcess) {
        try {
          onProgress(`Generating answer for: ${item.title}...`);

          // The module item's html_url is the /modules/items/ wrapper link;
          // build the direct assignment/discussion URL from its content id.
          const contentUrl = moduleItemContentUrl(canvasUrl, item.type, item.contentId, item.htmlUrl);
          if (!contentUrl) {
            reportLines.push(`${item.title}: skipped (no URL)`);
            continue;
          }

          // Fetch the description and rubric
          const meta = await fetchCanvasMetaAction(contentUrl);
          if ("error" in meta) {
            reportLines.push(`${item.title}: ${meta.error}`);
            erroredCount++;
            continue;
          }

          let description = meta.description.trim();
          if (!description) {
            reportLines.push(`${item.title}: skipped (no description)`);
            continue;
          }

          const rubric = meta.rubricText ?? "";

          // Process linked files (up to 4)
          const linkedFileIds = meta.linkedFileIds ?? [];
          const filesToProcess = linkedFileIds.slice(0, 4);
          if (filesToProcess.length < linkedFileIds.length) {
            reportLines.push(`${item.title}: skipped ${linkedFileIds.length - filesToProcess.length} linked file(s) beyond the 4-file limit`);
          }

          for (const fileId of filesToProcess) {
            try {
              const filePreview = await previewFileAction(canvasUrl, fileId, inst);
              if ("error" in filePreview) {
                reportLines.push(`${item.title}: could not preview linked file ${fileId} - ${filePreview.error}`);
                continue;
              }

              const previewText = filePreview.preview.text ?? "";
              if (previewText) {
                const trimmedPreview = previewText.slice(0, 4000);
                description += `\n\nLINKED FILE:\n${trimmedPreview}`;
              }
            } catch {
              reportLines.push(`${item.title}: could not load linked file ${fileId}`);
            }
          }

          // Generate the model answer with module context
          const answerResult = await generateModelAnswerAction(
            description,
            rubric,
            helpers.provider,
            moduleContextTrimmed
          );

          if ("error" in answerResult) {
            reportLines.push(`${item.title}: ${answerResult.error}`);
            erroredCount++;
            continue;
          }

          // Add to answer key
          answerLines.push(`## ${item.title}`);

          // Add points and due date when present
          const suffixes: string[] = [];
          if (typeof item.pointsPossible === "number" && item.pointsPossible > 0) {
            suffixes.push(`${item.pointsPossible} point${item.pointsPossible === 1 ? "" : "s"}`);
          }
          if (item.dueAt) {
            const dueDate = new Date(item.dueAt);
            const dateStr = dueDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            });
            suffixes.push(`due ${dateStr}`);
          }
          if (suffixes.length > 0) {
            answerLines.push(`${suffixes.join(", ")}`);
          }

          answerLines.push("");
          answerLines.push(answerResult.modelAnswer);
          answerLines.push("");

          generatedCount++;
          reportLines.push(`${item.title}: OK`);
        } catch (err) {
          reportLines.push(
            `${item.title}: ${err instanceof Error ? err.message : "error"}`
          );
          erroredCount++;
        }
      }

      // Check if all attempted items errored. Surface the first per-item
      // error - the report lines are lost when the step throws, and a bare
      // "failed for all" message hides the actual cause.
      if (itemsToProcess.length > 0 && erroredCount === itemsToProcess.length) {
        const firstError = reportLines.find((l) => !l.endsWith(": OK")) ?? "";
        throw new Error(
          `Failed to generate answers for any items${firstError ? ` - first error: ${firstError}` : ""}.`
        );
      }

      // Add context report line
      if (moduleContextTrimmed) {
        reportLines.push(`answers grounded in module materials (${materialsSource})`);
      } else {
        reportLines.push("module context unavailable - answers generated from assignment text only");
      }

      // Add report sections
      if (skippedItems > 0) {
        reportLines.push(
          `Skipped ${skippedItems} assignment/discussion item(s) beyond the ${maxItems}-item limit.`
        );
      }

      if (nonAnswerableItems.length > 0) {
        reportLines.push("Not answerable items:");
        for (const item of nonAnswerableItems) {
          if (item.includes("Quiz")) {
            reportLines.push(`  ${item} (quiz answers not supported)`);
          } else {
            reportLines.push(`  ${item}`);
          }
        }
      }

      const report = reportLines.join("\n");

      // Build and save the answer key as plain text
      if (generatedCount > 0) {
        onProgress("Building document...");
        const answerText = answerLines.join("\n");
        const base64 = Buffer.from(answerText, "utf-8").toString("base64");

        // Determine the filename
        let filename = `Module ${moduleName} Homework Answers.txt`;
        if (moduleWeekNumber !== null) {
          filename = `Module ${moduleWeekNumber} Homework Answers.txt`;
        }

        // Save to library with workflow tagging
        onProgress("Saving to Files tab...");
        const libResult = await saveLibraryFileAction({
          name: filename,
          base64,
          mimeType: "text/plain",
          fileExt: "txt",
          workflowId: helpers.workflowId,
          workflowName: helpers.workflowName,
          workflowRunId: helpers.workflowRunId,
        });

        if ("error" in libResult) {
          reportLines.push(`Files tab save failed: ${libResult.error}`);
        }

        // Save to course tile if available
        if (helpers.saveCourseMaterialFile) {
          try {
            onProgress("Saving to course tile...");
            const blob = new Blob([answerText], { type: "text/plain" });
            await helpers.saveCourseMaterialFile(tile.id, blob, filename);
          } catch (err) {
            reportLines.push(
              `Course tile save failed: ${
                err instanceof Error ? err.message : String(err)
              }`
            );
          }
        }
      }

      const answers = answerLines.join("\n");

      return {
        outputs: {
          answers,
          report,
          generated: generatedCount,
          hasGenerated: generatedCount > 0 ? "1" : "",
        },
        summary: {
          kind: "list",
          label: `Generated ${generatedCount} answer(s)`,
          items: reportLines,
        },
      };
    },
  },

  {
    type: "fetch-assignment-brief",
    name: "Fetch an assignment brief",
    description: "Read an LMS assignment's description and attached rubric, to prefill instructions and rubric for grading or rubric generation.",
    inputs: [
      { key: "assignmentUrl", label: "Assignment URL", type: "text", required: true },
    ],
    outputs: [
      { key: "description", label: "Description", type: "longtext" },
      { key: "rubric", label: "Rubric", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const url = String(values.assignmentUrl ?? "").trim();
      if (!url) throw new Error("Provide the assignment URL.");
      onProgress("Fetching assignment brief...");
      const r = await fetchCanvasMetaAction(url);
      if ("error" in r) throw new Error(r.error);
      return { outputs: { description: r.description, rubric: r.rubricText }, summary: { kind: "text", text: r.description || "(no description)" } };
    },
  },

  {
    type: "create-canvas-quiz",
    name: "Create a Canvas quiz",
    description:
      "Create an empty classic quiz (unpublished) in a Canvas course, ready for Import quiz questions. Points come from the questions you import; publish it from Canvas when ready.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "title", label: "Quiz title", type: "text", required: true },
      { key: "description", label: "Description (optional)", type: "longtext", required: false },
      { key: "dueAt", label: "Due date (optional)", type: "date", required: false },
      { key: "institution", label: "Institution", type: "institution", required: false, help: "Defaults to the institution matching the course URL." },
    ],
    outputs: [
      { key: "quizId", label: "Quiz id", type: "text" },
      { key: "quizUrl", label: "Quiz URL", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const courseUrl = String(values.course ?? "").trim();
      if (!courseUrl) {
        throw new Error("Select an LMS course.");
      }

      const title = String(values.title ?? "").trim();
      if (!title) {
        throw new Error("Provide a quiz title.");
      }

      const description = String(values.description ?? "").trim() || undefined;
      const dueAt = String(values.dueAt ?? "").trim() || null;
      const inst = String(values.institution ?? "").trim() || undefined;

      onProgress("Creating quiz...");
      const res = await createGradableAction(courseUrl, "Quiz", { title, description, dueAt }, inst);
      if ("error" in res) {
        throw new Error(res.error);
      }

      const quizId = String(res.id);
      const quizUrl = `${courseUrl.replace(/\/+$/, "")}/quizzes/${quizId}`;

      return {
        outputs: { quizId, quizUrl },
        summary: { kind: "link", label: title, url: quizUrl },
      };
    },
  },
];
