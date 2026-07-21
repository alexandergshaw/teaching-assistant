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
  setCourseCsvAction,
  listCourseHubAction,
  createCourseAssignmentAction,
  getFinalizedSyllabusAction,
  placeSyllabusInModuleAction,
  createGradableAction,
  createQuizQuestionAction,
  bulkUpdateAction,
  createPageAction,
  listCoursesByTermAction,
  createCourseHubAction,
  updateCourseHubAction,
  setModuleDueDatesAction,
  generateCourseSyllabusAction,
  createFinalizedSyllabusAction,
  listCourseRosterAction,
  listAssignmentTextSubmissionsAction,
  listConfiguredInstitutionsAction,
  fetchIcsFeedAction,
  saveInstitutionFieldsAction,
} from "@/app/actions";
import {
  type TermCoursePreviewRow,
  type StepRunResult,
  type StepDefinition,
  courseToInputPayload,
  weekDeadline,
} from "@/lib/workflows/registry-helpers";
import type { CourseInput } from "@/lib/supabase/courses";
import { extractGithubHandle } from "@/lib/github-usernames";
import { buildRosterUpdate, mergeCanvasRoster, mergeImportedRoster } from "@/lib/workflows/roster-merge";
import { parseIcsEvents } from "@/lib/ics";
import { parseGradebookCsv, detectGradebookFormat } from "@/lib/gradebook-csv";
import type { InstitutionField } from "@/lib/institution-fields";
import { parseCanvasCourseId } from "@/lib/canvas-url";
import { type GeneratedCourseFile, scheduleToCsv, csvToSchedule } from "@/lib/workflows/types";
import type { DueDateUpdate } from "@/lib/canvas-modules";

export const courseSetupSteps: StepDefinition[] = [
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

  {
    type: "link-github-usernames",
    name: "Link GitHub usernames to roster",
    description: "Read a Canvas assignment where students submitted their GitHub username as text, write the course tile's roster, and link each username to the student name on the tile.",
    inputs: [
      {
        key: "course",
        label: "Canvas course",
        type: "lmsCourse",
        required: true,
        help: "The Canvas course with the assignment.",
      },
      {
        key: "assignment",
        label: "Assignment (URL)",
        type: "text",
        required: true,
        help: "The Canvas assignment where students submitted their GitHub username (its URL contains /assignments/<id>).",
      },
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
        help: "The tile whose roster and GitHub links to write.",
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
      },
    ],
    outputs: [
      { key: "roster", label: "Roster", type: "longtext" },
      { key: "linked", label: "Linked", type: "text" },
    ],
    run: async (values, helpers, onProgress) => {
      const courseUrl = String(values.course ?? "").trim();
      if (!courseUrl) {
        throw new Error("Select a Canvas course.");
      }
      const courseId = parseCanvasCourseId(courseUrl);
      if (!courseId) {
        throw new Error("The course URL must contain a course id.");
      }

      const assignmentUrl = String(values.assignment ?? "").trim();
      if (!assignmentUrl) {
        throw new Error("Paste the assignment URL.");
      }
      const assignmentMatch = assignmentUrl.match(/\/assignments\/(\d+)/);
      if (!assignmentMatch || !assignmentMatch[1]) {
        throw new Error("The assignment URL must contain /assignments/<id>.");
      }
      const assignmentId = assignmentMatch[1];

      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || "";
      if (!inst) {
        throw new Error("Select an institution.");
      }

      onProgress("Loading submissions...");
      const subResult = await listAssignmentTextSubmissionsAction(inst, courseId, assignmentId);
      if ("error" in subResult) {
        throw new Error(subResult.error);
      }

      const okRows: Array<{
        student: string;
        canvasUserId: string;
        username: string;
      }> = [];
      const ambiguousNotes: string[] = [];

      for (const s of subResult.submissions) {
        const { handle, ok } = extractGithubHandle(s.submittedText);
        if (ok) {
          okRows.push({
            student: s.name,
            canvasUserId: String(s.userId),
            username: handle,
          });
        } else if (handle) {
          ambiguousNotes.push(`${s.name}: "${s.submittedText}"`);
        }
      }

      onProgress("Loading course tile...");
      const listResult = await listCourseHubAction();
      if ("error" in listResult) {
        throw new Error(listResult.error);
      }

      const tileId = String(values.hubCourse ?? "").trim();
      const tile = listResult.courses.find((c) => c.id === tileId);
      if (!tile) {
        throw new Error("Could not find the course tile.");
      }

      if (okRows.length === 0) {
        const ambiguousNote = ambiguousNotes.length ? ` (${ambiguousNotes.length} ambiguous submission(s) need manual review.)` : "";
        return {
          outputs: { roster: tile.roster ?? "", linked: "0" },
          summary: {
            kind: "text",
            text: `Found no clean GitHub usernames in submissions; the tile was not changed.${ambiguousNote}`,
          },
        };
      }

      onProgress("Building roster...");
      const updateResult = buildRosterUpdate({
        submissions: okRows,
        existingStudentRepos: tile.studentRepos ?? [],
      });

      onProgress("Saving roster...");
      const writeResult = await updateCourseHubAction(tile.id, {
        ...courseToInputPayload(tile),
        roster: updateResult.roster,
        studentRepos: updateResult.studentRepos,
      });

      if ("error" in writeResult) {
        throw new Error(writeResult.error);
      }

      const allNotes = [...updateResult.conflicts, ...ambiguousNotes];
      const conflictSummary = allNotes.length ? ` Needs review: ${allNotes.join("; ")}` : "";

      return {
        outputs: { roster: updateResult.roster, linked: String(updateResult.linked) },
        summary: {
          kind: "text",
          text: `Linked ${updateResult.linked} GitHub username(s) to ${tile.name}.${conflictSummary}`,
        },
      };
    },
  },

  {
    type: "starter-materials",
    name: "Seed Start Here modules",
    description: "Create a Start Here module in each selected LMS course: the course tile's syllabus, a syllabus-acknowledgement quiz due 3 days after the tile's start date, and optionally a GitHub sign-up assignment.",
    inputs: [
      {
        key: "courses",
        label: "LMS courses",
        type: "lmsCourseList",
        required: true,
      },
      {
        key: "includeGithub",
        label: "Include GitHub Starter?",
        type: "boolean",
        required: false,
        help: "Adds a 1-point text-entry assignment asking students to create a GitHub account and submit their username.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const urls = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (urls.length === 0) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - no LMS course selected." },
        };
      }

      const includeGh = String(values.includeGithub ?? "") === "1";

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const lookup = new Map<string, (typeof hub.courses)[0]>();
      for (const course of hub.courses) {
        if (course.canvasUrl) {
          const id = parseCanvasCourseId(course.canvasUrl);
          if (id) {
            lookup.set(id, course);
          }
        }
      }

      // Common Resources load once per run; library file payloads are
      // cached so multi-course runs download each file only once.
      const commonItems = helpers.loadCommonResources
        ? await helpers.loadCommonResources().catch(() => [])
        : [];
      const libCache = new Map<
        string,
        { blob: Blob; name: string; mimeType: string } | null
      >();

      const lines: string[] = [];
      let failures = 0;

      for (const url of urls) {
        try {
          const inst = helpers.activeInstitution || undefined;
          const id = parseCanvasCourseId(url);
          const tile = id ? lookup.get(id) : undefined;

          onProgress(`Preparing ${tile?.name ?? url}...`);

          const content = await listCourseContentAction(url, inst);
          if ("error" in content) {
            throw new Error(content.error);
          }

          let startModule = content.modules.find(
            (m) => m.name.trim().toLowerCase() === "start here"
          );

          if (!startModule) {
            const made = await createModuleAction(url, "Start Here", 1, inst);
            if ("error" in made) {
              throw new Error(made.error);
            }
            startModule = made.module;
          }

          const startRaw = (tile?.startDate ?? "").trim();
          let dueAt = "";
          let dueNote = "no start date on the tile - no deadline";

          if (startRaw) {
            const start = new Date(`${startRaw}T00:00:00`);
            if (!Number.isNaN(start.getTime())) {
              const due = new Date(start);
              due.setDate(start.getDate() + 3);
              due.setHours(23, 59, 0, 0);
              dueAt = due.toISOString();
              dueNote = `due ${due.toLocaleDateString()}`;
            }
          }

          // Tiles without a syllabus try the institution's template first:
          // the generated syllabus is saved to the library, linked back to
          // the tile, and then placed like a pre-existing one.
          let syllabusNote = "no syllabus on the tile - skipped";
          let syllabusId = tile?.syllabusId?.trim() ?? "";
          let generatedFromTemplate = false;
          if (tile && !syllabusId) {
            const instFields =
              tile.institution && helpers.getInstitutionFields
                ? await helpers
                    .getInstitutionFields(tile.institution)
                    .catch(() => [])
                : [];
            const templateId =
              instFields
                .find((f) => f.id === "syllabusTemplate")
                ?.value?.trim() ?? "";
            const instEmail =
              instFields.find((f) => f.id === "email")?.value ?? "";
            const instLmsUrl =
              instFields.find((f) => f.id === "lmsUrl")?.value ?? "";

            if (!templateId) {
              syllabusNote =
                "no syllabus on the tile and no institution syllabus template - skipped";
            } else {
              try {
                onProgress(`Generating syllabus for ${tile.name}...`);
                const g = await generateCourseSyllabusAction(
                  templateId,
                  {
                    courseName: tile.name,
                    courseCode: tile.courseCode ?? "",
                    term: tile.term ?? "",
                    description: tile.description ?? "",
                    dayTime: tile.dayTime ?? "",
                    startDate: tile.startDate ?? "",
                    weeks: tile.weeks != null ? String(tile.weeks) : "",
                    tests: tile.tests != null ? String(tile.tests) : "",
                    textbook: tile.textbook ?? "",
                    email: instEmail,
                    lmsUrl: instLmsUrl,
                    institution: tile.institution ?? "",
                  },
                  helpers.provider
                );
                if ("error" in g) {
                  throw new Error(g.error);
                }

                const generatedFileName = /\.docx$/i.test(g.name)
                  ? g.name
                  : `${g.name}.docx`;
                const saved = await createFinalizedSyllabusAction(
                  g.name,
                  generatedFileName,
                  g.base64,
                  tile.courseCode ?? undefined
                );
                if ("error" in saved) {
                  throw new Error(saved.error);
                }

                syllabusId = saved.syllabus.id;
                syllabusNote = "syllabus generated from the institution template";
                generatedFromTemplate = true;

                try {
                  const linked = await updateCourseHubAction(tile.id, {
                    ...courseToInputPayload(tile),
                    syllabusId: saved.syllabus.id,
                  });
                  if ("error" in linked) {
                    throw new Error(linked.error);
                  }
                } catch (err) {
                  syllabusNote += `; linking the generated syllabus to the tile failed: ${
                    err instanceof Error ? err.message : "unknown error"
                  }`;
                }
              } catch (err) {
                syllabusNote = `syllabus generation failed: ${
                  err instanceof Error ? err.message : "unknown error"
                }`;
              }
            }
          }

          if (syllabusId) {
            const s = await getFinalizedSyllabusAction(syllabusId);
            if ("error" in s) {
              syllabusNote = `syllabus error: ${s.error}`;
            } else {
              const fileName = `${s.syllabus.name || "Syllabus"}.docx`;
              const placed = await placeSyllabusInModuleAction(
                s.syllabus.content,
                url,
                startModule.id,
                fileName,
                undefined,
                inst
              );
              if ("error" in placed) {
                syllabusNote = `syllabus error: ${placed.error}`;
              } else {
                syllabusNote = generatedFromTemplate
                  ? "syllabus generated from the institution template and added"
                  : "syllabus added";
              }
            }
          }

          const quiz = await createGradableAction(
            url,
            "Quiz",
            {
              title: "Syllabus Acknowledgement",
              description: "Confirm you have read and understood the course syllabus.",
              dueAt: dueAt || null,
            },
            inst
          );
          if ("error" in quiz) {
            throw new Error(quiz.error);
          }

          const question = await createQuizQuestionAction(
            url,
            quiz.id,
            {
              name: "Syllabus acknowledgement",
              text: "I read and understand the syllabus.",
              type: "true_false_question",
              points: 1,
              answers: [
                { text: "True", correct: true },
                { text: "False", correct: false },
              ],
            },
            inst
          );
          if ("error" in question) {
            throw new Error(question.error);
          }

          const publish = await bulkUpdateAction(
            url,
            "Quiz",
            [String(quiz.id)],
            { published: true },
            inst
          );
          if ("error" in publish) {
            throw new Error(publish.error);
          }

          const item = await createModuleItemAction(
            url,
            startModule.id,
            {
              type: "Quiz",
              contentId: quiz.id,
              title: "Syllabus Acknowledgement",
            },
            inst
          );
          if ("error" in item) {
            throw new Error(item.error);
          }

          if (includeGh) {
            const ghAssignment = await createCourseAssignmentAction(
              url,
              {
                name: "GitHub Sign Up",
                description:
                  "Sign up for a free account at https://github.com, then submit your GitHub username in the text box.",
                pointsPossible: 1,
                dueAt,
                submissionType: "online_text_entry",
                published: true,
              },
              startModule.id,
              inst
            );
            if ("error" in ghAssignment) {
              throw new Error(ghAssignment.error);
            }
          }

          // Common Resources import after the built-ins; a failed item
          // notes on the course's summary line instead of failing the
          // course.
          let commonAdded = 0;
          const notes: string[] = [];
          for (const item of commonItems) {
            onProgress(`Adding "${item.title}" to ${tile?.name ?? url}...`);
            try {
              if (item.type === "page") {
                const created = await createPageAction(
                  url,
                  { title: item.title, body: item.body ?? "" },
                  inst
                );
                if ("error" in created) {
                  throw new Error(created.error);
                }

                const linked = await createModuleItemAction(
                  url,
                  startModule.id,
                  { type: "Page", pageUrl: created.page.url },
                  inst
                );
                if ("error" in linked) {
                  throw new Error(linked.error);
                }

                commonAdded++;
              } else if (item.type === "file" && item.fileId) {
                let payload = libCache.get(item.fileId);
                if (payload === undefined) {
                  payload = helpers.getLibraryFile
                    ? await helpers.getLibraryFile(item.fileId)
                    : null;
                  libCache.set(item.fileId, payload);
                }

                if (!payload) {
                  notes.push(`${item.title}: library file missing - skipped`);
                  continue;
                }

                const sanitizedFileName = payload.name.replace(
                  /[^a-z0-9 ._-]/gi,
                  "_"
                );
                const ticket = await requestFileUploadAction(
                  url,
                  {
                    name: sanitizedFileName,
                    size: payload.blob.size,
                    contentType: payload.mimeType,
                    folderPath: "uploads",
                  },
                  inst
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
                form.append("file", payload.blob, sanitizedFileName);

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

                const linked = await createModuleItemAction(
                  url,
                  startModule.id,
                  { type: "File", contentId: uploaded.id, title: item.title },
                  inst
                );
                if ("error" in linked) {
                  throw new Error(linked.error);
                }

                commonAdded++;
              }
            } catch (err) {
              const message =
                err instanceof Error ? err.message : "Unknown error";
              notes.push(`${item.title}: ${message}`);
            }
          }

          lines.push(
            `${tile?.name ?? url}: Start Here ready (${syllabusNote}; quiz ${dueNote}${
              includeGh ? "; GitHub Sign Up added" : ""
            }${
              commonItems.length
                ? `; ${commonAdded} common resource(s) added`
                : ""
            }${notes.length ? `; ${notes.join("; ")}` : ""})`
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          lines.push(`${url}: ${message}`);
          failures++;
        }
      }

      if (failures === urls.length) {
        throw new Error("Starter materials failed for every course.");
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Seeded ${urls.length - failures} course(s)${
            failures ? `, ${failures} failed` : ""
          }`,
          items: lines,
        },
      };
    },
  },

  {
    type: "load-course-tile",
    name: "Load course tile",
    description: "Read the course tile's linked repository, LMS course, and start date so later steps need no separate inputs. Missing pieces surface as warnings.",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: true,
      },
      {
        key: "confirmMissingRepo",
        label: "Pause when repository is missing",
        type: "boolean",
        required: false,
        help: "Pause with an alert when the tile has no repository so the run can be cancelled.",
      },
      {
        key: "allowMissingRepo",
        label: "Allow a missing repository",
        type: "boolean",
        required: false,
        help: "Proceed without pausing when the tile has no repository - Course Kickoff creates one later.",
      },
    ],
    outputs: [
      { key: "repo", label: "Repository", type: "repo" },
      { key: "course", label: "LMS course", type: "lmsCourse" },
      { key: "startDate", label: "Start date", type: "date" },
      { key: "description", label: "Course description", type: "longtext" },
      { key: "weeks", label: "Number of weeks", type: "number" },
      { key: "tests", label: "Number of tests", type: "number" },
    ],
    run: async (values, helpers, onProgress) => {
      const hubCourseId = String(values.hubCourse ?? "").trim();

      onProgress("Loading course tile...");
      const listR = await listCourseHubAction();
      if ("error" in listR) {
        throw new Error(listR.error);
      }

      const tile = listR.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Choose a course tile.");
      }

      const repo = tile.repos[0]?.repo?.trim() ?? "";
      const course = (tile.canvasUrl ?? "").trim();
      const startDate = (tile.startDate ?? "").trim();
      const lms = (tile.lms ?? "").trim();
      const description = (tile.description ?? "").trim();
      const weeks =
        typeof tile.weeks === "number" && Number.isFinite(tile.weeks)
          ? String(tile.weeks)
          : "";
      const tests =
        typeof tile.tests === "number" && Number.isFinite(tile.tests)
          ? String(tile.tests)
          : "";

      // Missing-repo handling defaults to a hard stop: a repo-less tile must
      // never reach the destructive LMS steps with nothing to rebuild. The two
      // opt-in flags relax that - allowMissingRepo skips the pause entirely
      // (Course Kickoff creates the repo later); confirmMissingRepo pauses only
      // when a schedule fallback can actually succeed.
      let repoLine: string;
      let confirmMessage = "";
      if (repo) {
        repoLine = `Repository: ${repo}${
          tile.repos.length > 1 ? ` (first of ${tile.repos.length} linked)` : ""
        }`;
      } else if (String(values.allowMissingRepo ?? "") === "1") {
        repoLine = "Note: no repository linked yet.";
      } else if (String(values.confirmMissingRepo ?? "") === "1") {
        const csvOk = csvToSchedule(tile.csvData ?? "").length > 0;
        const topicsOk = Boolean(
          (tile.description?.trim() || tile.topics?.trim()) &&
            typeof tile.weeks === "number" &&
            Number.isInteger(tile.weeks) &&
            tile.weeks >= 1 &&
            tile.weeks <= 52
        );
        if (!csvOk && !topicsOk) {
          throw new Error(
            "The course tile has no repository and no usable fallback - link a repository, save a Schedule of Topics (CSV), or add topics plus a week count to the tile."
          );
        }
        repoLine =
          "Alert: no repository linked to the tile - repo-driven steps will fall back to the tile's Schedule of Topics or skip.";
        confirmMessage = csvOk
          ? "This tile has no linked repository. Continue to fall back to the tile's saved Schedule of Topics (CSV) for the schedule, or cancel to link a repository first."
          : "This tile has no linked repository. Continue to fall back to a schedule generated from the tile's topics and description, or cancel to link a repository first.";
      } else {
        throw new Error(
          "The course tile has no repository linked - add one on the Courses tab."
        );
      }

      const items = [
        repoLine,
        course
          ? `LMS course: ${course}`
          : "Warning: no LMS course (Canvas URL) on the tile - the LMS steps will be skipped.",
        startDate
          ? `Start date: ${startDate}`
          : "Warning: no start date on the tile - generated assignments will have no deadlines.",
        lms
          ? `LMS: ${lms}`
          : "Warning: no LMS set on the tile - the plain zip downloads instead of an LMS cartridge.",
        description
          ? `Description: ${description.slice(0, 80)}${
              description.length > 80 ? "..." : ""
            }`
          : "Note: no description on the tile - Course Kickoff cannot generate a schedule without it.",
        weeks
          ? `Weeks: ${weeks}`
          : "Note: no weeks on the tile - Course Kickoff needs it to generate a schedule.",
        tests
          ? `Tests: ${tests}`
          : "Note: no tests count on the tile.",
      ];

      const result: StepRunResult = {
        outputs: { repo, course, startDate, description, weeks, tests },
        summary: {
          kind: "list",
          label: `Loaded "${tile.name}"`,
          items,
        },
      };

      if (confirmMessage) {
        result.requireConfirmation = confirmMessage;
      }

      return result;
    },
  },

  {
    type: "fetch-term-courses",
    name: "Fetch term courses (preview)",
    description:
      "List every LMS course in the given term, optionally enriched by uploaded exports, and pause for review before any cards are created.",
    inputs: [
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: true,
      },
      {
        key: "term",
        label: "Term",
        type: "text",
        required: true,
        help: "Matched against the LMS term name, e.g. Fall 2026.",
      },
      {
        key: "exports",
        label: "LMS exports",
        type: "uploads",
        required: false,
        help: "Optional .imscc/zip exports; parsed for extra tile details.",
      },
    ],
    outputs: [{ key: "courses", label: "Course list", type: "courseList" }, { key: "hasCourses", label: "Has courses", type: "boolean" }],
    run: async (values, helpers, onProgress) => {
      const institution = String(values.institution ?? "").trim() || (helpers.activeInstitution ?? "").trim();
      const term = String(values.term ?? "").trim();

      onProgress("Fetching the term's courses...");
      const r = await listCoursesByTermAction(institution, term);
      if ("error" in r) {
        throw new Error(r.error);
      }
      const rows = r.courses;

      // The uploads value type resolves to a runtime File[] (never a
      // persisted string); an unbound input stays undefined and skips the
      // parsing pass entirely.
      const exportFiles = Array.isArray(values.exports)
        ? (values.exports as File[])
        : [];

      const warnings: string[] = [];
      const noteByLmsId = new Map<string, string>();
      const extraRows: Array<{
        id: string;
        name: string;
        courseCode: string | null;
        termName: string | null;
      }> = [];

      // Manifest titles were XML-escaped on export; undo the entities the
      // cartridge writer emits before matching against LMS names.
      const decodeEntities = (s: string): string =>
        s
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&");

      for (const file of exportFiles) {
        try {
          onProgress(`Reading ${file.name}...`);
          const { default: JSZip } = await import("jszip");
          const zip = await JSZip.loadAsync(await file.arrayBuffer());
          const manifest = zip.file("imsmanifest.xml");
          if (!manifest) {
            warnings.push(`${file.name}: no imsmanifest.xml found - skipped`);
            continue;
          }

          const xml = await manifest.async("string");
          const m = xml.match(/<lomimscc:string>([^<]+)<\/lomimscc:string>/);
          const title = m ? decodeEntities(m[1]).trim() : "";
          if (!title) {
            warnings.push(`${file.name}: no course title in manifest - skipped`);
            continue;
          }

          // Loose containment match either direction so "CS 101" pairs with
          // "CS 101 - Intro to Programming" and vice versa.
          const lowered = title.toLowerCase();
          const matched = rows.find((row) => {
            const rowName = row.name.toLowerCase();
            return rowName.includes(lowered) || lowered.includes(rowName);
          });

          if (matched) {
            noteByLmsId.set(matched.id, "export attached");
          } else {
            extraRows.push({
              id: "",
              name: title,
              courseCode: null,
              termName: term,
            });
          }
        } catch (err) {
          // A bad export never fails the preview; it surfaces as a warning.
          warnings.push(
            `${file.name}: ${
              err instanceof Error ? err.message : "could not read the export"
            }`
          );
        }
      }

      const payload: TermCoursePreviewRow[] = [
        ...rows.map((row) => ({
          lmsId: row.id,
          name: row.name,
          courseCode: row.courseCode,
          termName: row.termName,
          canvasUrl: row.id ? `/courses/${row.id}` : "",
          note: noteByLmsId.get(row.id) ?? "",
        })),
        ...extraRows.map((row) => ({
          lmsId: row.id,
          name: row.name,
          courseCode: row.courseCode,
          termName: row.termName,
          canvasUrl: "",
          note: "from export only",
        })),
      ];

      return {
        outputs: { courses: payload, hasCourses: payload.length > 0 ? "1" : "" },
        summary: {
          kind: "list",
          label: `${payload.length} course(s) ready to import`,
          items: [
            ...payload.map(
              (c) =>
                `${c.name}${c.courseCode ? ` [${c.courseCode}]` : ""}${
                  c.termName ? ` - ${c.termName}` : ""
                }${c.note ? ` (${c.note})` : ""}`
            ),
            ...warnings,
          ],
        },
        requireConfirmation:
          "Create a course card for each of these? Existing cards with the same LMS course are skipped.",
      };
    },
  },

  {
    type: "create-course-cards",
    name: "Create course cards",
    description:
      "Create a course tile for each previewed course; tiles whose LMS course already has a card are skipped.",
    inputs: [
      {
        key: "courses",
        label: "Course list",
        type: "courseList",
        required: true,
      },
      {
        key: "institution",
        label: "Institution",
        type: "institution",
        required: false,
        help: "Applied to rows that do not carry their own institution (the multi-institution scan sets one per row).",
      },
    ],
    outputs: [
      { key: "created", label: "Cards created", type: "number" },
      { key: "hasCreated", label: "Any created?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const rows = values.courses as TermCoursePreviewRow[];
      const boundInstitution = String(values.institution ?? "").trim() || (helpers.activeInstitution ?? "").trim();

      onProgress("Loading existing course cards...");
      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const dedupeSetsByInst = new Map<string, { ids: Set<string>; nameTerms: Set<string> }>();

      const lines: string[] = [];
      let created = 0;
      let skipped = 0;
      let failed = 0;

      for (const row of rows) {
        // Fail-forward: one bad row records its error and the loop moves on.
        try {
          const effectiveInst = (row.institution || boundInstitution).trim().toUpperCase();
          if (!effectiveInst) {
            lines.push(`${row.name}: no institution - skipped`);
            continue;
          }

          if (!dedupeSetsByInst.has(effectiveInst)) {
            const existing = hub.courses.filter((c) => (c.institution ?? "").trim().toUpperCase() === effectiveInst);
            dedupeSetsByInst.set(effectiveInst, {
              ids: new Set(
                existing
                  .map((c) => parseCanvasCourseId(c.canvasUrl ?? ""))
                  .filter((id): id is string => Boolean(id))
              ),
              nameTerms: new Set(
                existing.map((c) => `${(c.name ?? "").trim().toLowerCase()}||${(c.term ?? "").trim().toLowerCase()}`)
              ),
            });
          }

          const dedupe = dedupeSetsByInst.get(effectiveInst)!;
          const nameKey = `${(row.name ?? "").trim().toLowerCase()}||${(row.termName ?? "").trim().toLowerCase()}`;
          if (row.lmsId ? dedupe.ids.has(row.lmsId) : dedupe.nameTerms.has(nameKey)) {
            lines.push(`${row.name}: already exists`);
            skipped++;
            continue;
          }

          onProgress(`Creating "${row.name}"...`);
          const made = await createCourseHubAction({
            name: row.name,
            courseCode: row.courseCode,
            term: row.termName,
            canvasUrl: row.canvasUrl || null,
            institution: effectiveInst,
            lms: row.canvasUrl ? "canvas" : null,
            startDate: row.startAt ? row.startAt.slice(0, 10) : null,
          });

          if ("error" in made) {
            throw new Error(made.error);
          }

          if (row.lmsId) {
            dedupe.ids.add(row.lmsId);
          } else {
            dedupe.nameTerms.add(nameKey);
          }
          lines.push(`${row.name}: created`);
          created++;
        } catch (err) {
          lines.push(
            `${row.name}: ${err instanceof Error ? err.message : "failed"}`
          );
          failed++;
        }
      }

      return {
        outputs: {
          created: String(created),
          hasCreated: created > 0 ? "1" : "",
        },
        summary: {
          kind: "list",
          label: `${created} created, ${skipped} skipped${
            failed ? `, ${failed} failed` : ""
          }`,
          items: lines,
        },
      };
    },
  },

  {
    type: "set-course-start-dates",
    name: "Set course start dates",
    description:
      "Store the given start date on every selected course tile.",
    inputs: [
      {
        key: "startDate",
        label: "Course start",
        type: "date",
        required: true,
      },
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
    ],
    outputs: [{ key: "courses", label: "Courses", type: "hubCourseList" }],
    run: async (values, helpers, onProgress) => {
      const startRaw = String(values.startDate ?? "").trim();
      const start = startRaw ? new Date(`${startRaw}T00:00:00`) : null;
      if (!start || Number.isNaN(start.getTime())) {
        throw new Error("Enter the course start as a valid date.");
      }

      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const lines: string[] = [];
      let updated = 0;
      let failed = 0;

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        // Fail-forward: one bad tile records its error and the loop moves on.
        try {
          if (!tile) {
            lines.push(`${id}: not found`);
            failed++;
            continue;
          }

          onProgress(`Updating ${tile.name}...`);
          const r = await updateCourseHubAction(id, {
            ...courseToInputPayload(tile),
            startDate: startRaw,
          });
          if ("error" in r) {
            throw new Error(r.error);
          }

          lines.push(`${tile.name}: start date set`);
          updated++;
        } catch (err) {
          lines.push(
            `${tile?.name ?? id}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
          failed++;
        }
      }

      return {
        outputs: { courses: values.courses },
        summary: {
          kind: "list",
          label: `${updated} start date(s) set${
            failed ? `, ${failed} failed` : ""
          }`,
          items: lines,
        },
      };
    },
  },

  {
    type: "assign-week-deadlines",
    name: "Assign weekly deadlines",
    description:
      "Give every module's assignments, quizzes, and discussions a deadline at the Sunday ending its week; Start Here and Module 1 end week one.",
    inputs: [
      {
        key: "courses",
        label: "Courses",
        type: "hubCourseList",
        required: true,
      },
      {
        key: "startDate",
        label: "Course start",
        type: "date",
        required: true,
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      const startRaw = String(values.startDate ?? "").trim();
      const start = startRaw ? new Date(`${startRaw}T00:00:00`) : null;
      if (!start || Number.isNaN(start.getTime())) {
        throw new Error("Enter the course start as a valid date.");
      }


      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const lines: string[] = [];
      let failed = 0;
      let skipped = 0;

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        // Fail-forward: one bad course records its error and the loop moves on.
        try {
          if (!tile) {
            lines.push(`${id}: not found`);
            failed++;
            continue;
          }

          const canvasUrl = (tile.canvasUrl ?? "").trim();
          if (!canvasUrl) {
            lines.push(`${tile.name}: no LMS course on the tile - skipped`);
            skipped++;
            continue;
          }

          const inst = tile.institution?.trim() || helpers.activeInstitution || undefined;

          onProgress(`Loading modules for ${tile.name}...`);
          const content = await listCourseContentAction(
            canvasUrl,
            inst
          );
          if ("error" in content) {
            throw new Error(content.error);
          }

          // Each module's week comes from its OWN name - "Start Here" maps
          // to week 1 and "Module NN" to N - never from list position, so
          // extra or reordered modules cannot skew other modules' deadlines.
          // Legacy "Module 00" exports clamp to week one so no deadline can land
          // before the course starts.
          const updates: DueDateUpdate[] = [];
          let moduleCount = 0;
          for (const m of content.modules) {
            let week: number | null = null;
            if (/start\s*here/i.test(m.name)) {
              week = 1;
            } else {
              const wm = m.name.match(/module\s*0*(\d+)/i);
              if (wm) week = Math.max(1, Number(wm[1]));
            }
            if (week === null) continue;

            moduleCount++;
            for (const item of m.items) {
              if (item.contentId === null) continue;
              if (
                item.type !== "Assignment" &&
                item.type !== "Quiz" &&
                item.type !== "Discussion"
              ) {
                continue;
              }
              updates.push({
                type: item.type,
                contentId: item.contentId,
                dueAt: weekDeadline(start, week).toISOString(),
              });
            }
          }

          onProgress(`Setting ${updates.length} deadline(s) in ${tile.name}...`);
          const r = await setModuleDueDatesAction(
            canvasUrl,
            updates,
            inst
          );
          if ("error" in r) {
            throw new Error(r.error);
          }

          lines.push(
            `${tile.name}: ${r.updated} deadline(s) across ${moduleCount} module(s)${
              r.failures.length ? ` (${r.failures.length} failed)` : ""
            }`
          );
        } catch (err) {
          lines.push(
            `${tile?.name ?? id}: ${
              err instanceof Error ? err.message : "failed"
            }`
          );
          failed++;
        }
      }

      return {
        outputs: {},
        summary: {
          kind: "list",
          label: `Assigned deadlines in ${ids.length - failed - skipped} course(s)${
            skipped ? `, ${skipped} skipped` : ""
          }${failed ? `, ${failed} failed` : ""}`,
          items: lines,
        },
      };
    },
  },

  {
    type: "fetch-course-roster",
    name: "Fetch the course roster",
    description: "Pull an LMS course's enrolled students (names and login ids) into a roster, to feed repo or messaging fan-out.",
    inputs: [
      { key: "course", label: "LMS course", type: "lmsCourse", required: true },
      { key: "institution", label: "Institution", type: "institution", required: false },
    ],
    outputs: [
      { key: "roster", label: "Roster", type: "longtext" },
      { key: "count", label: "Students", type: "number" },
      { key: "hasStudents", label: "Has students", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const url = String(values.course ?? "").trim();
      if (!url) throw new Error("Select an LMS course.");
      const courseId = parseCanvasCourseId(url);
      if (!courseId) throw new Error("The course URL must contain a course id.");
      const inst = String(values.institution ?? "").trim() || helpers.activeInstitution || "";
      if (!inst) throw new Error("Select an institution.");
      onProgress("Loading roster...");
      const r = await listCourseRosterAction(inst, courseId);
      if ("error" in r) throw new Error(r.error);
      const rosterLines = r.students.map((s) => `${s.name} | ${s.loginId}`);
      const rosterText = rosterLines.join("\n");
      const items = r.students.length > 0 ? r.students.map((s) => s.name) : ["(none)"];
      return {
        outputs: { roster: rosterText, count: r.students.length, hasStudents: r.students.length > 0 ? "1" : "" },
        summary: { kind: "list", label: `${r.students.length} student(s)`, items },
      };
    },
  },

  {
    type: "scan-term-courses",
    name: "Scan term courses across institutions",
    description:
      "Fetch the term's courses from every configured institution's LMS and split them into NEW (no course tile yet) and ALREADY IMPORTED - the start-of-term diff. Optionally pauses so you can review before later steps create anything.",
    inputs: [
      {
        key: "institutions",
        label: "Institutions",
        type: "longtext",
        required: false,
        help: "One institution acronym per line. Blank scans every configured institution.",
      },
      {
        key: "term",
        label: "Term",
        type: "text",
        required: false,
        help: "Matched against the LMS term name (e.g. Fall 2026). Blank lists every course you teach.",
      },
      {
        key: "confirm",
        label: "Pause to review?",
        type: "boolean",
        required: false,
        help: "Pause after the scan so you can review the diff before later steps run.",
      },
    ],
    outputs: [
      { key: "newCourses", label: "New courses", type: "courseList" },
      { key: "coverage", label: "Coverage report", type: "longtext" },
      { key: "newCount", label: "New count", type: "number" },
      { key: "existingCount", label: "Already imported", type: "number" },
      { key: "hasNew", label: "Any new?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      let insts: string[] = [];
      const instInput = String(values.institutions ?? "").trim();
      if (instInput) {
        insts = instInput
          .split("\n")
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean);
      } else {
        onProgress("Loading configured institutions...");
        const listResult = await listConfiguredInstitutionsAction();
        if ("error" in listResult) {
          throw new Error(listResult.error);
        }
        if (listResult.acronyms.length === 0) {
          throw new Error("No institutions are configured on the server.");
        }
        insts = listResult.acronyms.map((a) => a.toUpperCase());
      }

      onProgress("Loading course hub...");
      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const termInput = String(values.term ?? "").trim();
      const coverageLines: string[] = [];
      const newCoursesData: TermCoursePreviewRow[] = [];
      let totalNew = 0;
      let totalExisting = 0;

      for (const inst of insts) {
        try {
          onProgress(`Scanning ${inst} for courses...`);

          const coursesResult = await listCoursesByTermAction(inst, termInput);
          if ("error" in coursesResult) {
            coverageLines.push(`${inst}: ${coursesResult.error}`);
            continue;
          }

          const existingIds = new Set(
            hub.courses
              .filter((c) => (c.institution ?? "").trim().toUpperCase() === inst)
              .map((c) => parseCanvasCourseId(c.canvasUrl ?? ""))
              .filter((id): id is string => Boolean(id))
          );

          const existingNameTerms = new Set(
            hub.courses
              .filter((c) => (c.institution ?? "").trim().toUpperCase() === inst)
              .map((c) => `${(c.name ?? "").trim().toLowerCase()}||${(c.term ?? "").trim().toLowerCase()}`)
          );

          const newLines: string[] = [];
          const importedLines: string[] = [];
          let newCount = 0;
          let existingCount = 0;

          for (const row of coursesResult.courses) {
            const nameKey = `${(row.name ?? "").trim().toLowerCase()}||${(row.termName ?? "").trim().toLowerCase()}`;
            const isNew = row.id
              ? !existingIds.has(row.id)
              : !existingNameTerms.has(nameKey);

            if (isNew) {
              newCount++;
              const code = row.courseCode ? ` [${row.courseCode}]` : "";
              newLines.push(`  - NEW: ${row.name}${code}`);
              newCoursesData.push({
                lmsId: row.id ?? "",
                name: row.name,
                courseCode: row.courseCode,
                termName: row.termName,
                canvasUrl: row.id ? `/courses/${row.id}` : "",
                note: "",
                institution: inst,
                startAt: row.startAt ?? null,
              });
            } else {
              existingCount++;
              const tile = hub.courses.find(
                (c) =>
                  (c.institution ?? "").trim().toUpperCase() === inst &&
                  (row.id
                    ? parseCanvasCourseId(c.canvasUrl ?? "") === row.id
                    : `${(c.name ?? "").trim().toLowerCase()}||${(c.term ?? "").trim().toLowerCase()}` === nameKey)
              );
              const tileName = tile?.name ?? "unknown";
              importedLines.push(`  - imported: ${row.name} (tile ${tileName})`);
            }
          }

          totalNew += newCount;
          totalExisting += existingCount;

          coverageLines.push(`${inst}: ${coursesResult.courses.length} course(s) - ${newCount} new, ${existingCount} already imported`);
          coverageLines.push(...newLines, ...importedLines);
        } catch (err) {
          coverageLines.push(
            `${inst}: ${err instanceof Error ? err.message : "failed to scan"}`
          );
        }
      }

      const coverage = coverageLines.join("\n");
      const shouldConfirm = String(values.confirm ?? "") === "1";

      const result: StepRunResult = {
        outputs: {
          newCourses: JSON.stringify(newCoursesData),
          coverage,
          newCount: String(totalNew),
          existingCount: String(totalExisting),
          hasNew: totalNew > 0 ? "1" : "",
        },
        summary: {
          kind: "list",
          label: `${totalNew} new course(s), ${totalExisting} already imported`,
          items: coverageLines,
        },
      };

      if (shouldConfirm) {
        result.requireConfirmation =
          "Continue to create cards for the NEW courses? Already-imported courses are left untouched.";
      }

      return result;
    },
  },

  {
    type: "sync-course-tiles-from-lms",
    name: "Sync course tiles from the LMS",
    description:
      "For each selected course tile with a Canvas link, pull what the LMS knows - course code, term, start date, and the student roster - and fill in ONLY the tile fields that are empty. Existing values are never overwritten and roster merging preserves GitHub username links and repo bindings.",
    inputs: [
      {
        key: "courses",
        label: "Course tiles",
        type: "hubCourseList",
        required: true,
        help: "One, several, or all course tiles.",
      },
      {
        key: "includeRoster",
        label: "Pull rosters?",
        type: "boolean",
        required: false,
        help: "Also merge each course's student roster into the tile.",
      },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "updated", label: "Tiles updated", type: "number" },
      { key: "hasUpdated", label: "Any updated?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const includeRoster = String(values.includeRoster ?? "") === "1";
      type LmsTermCourse = {
        id: string;
        name: string;
        courseCode: string | null;
        termName: string | null;
        startAt: string | null;
      };
      const termCoursesByInst = new Map<string, Map<string, LmsTermCourse>>();
      const reportLines: string[] = [];
      let updated = 0;

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        if (!tile) {
          reportLines.push(`${id}: course tile not found - skipped`);
          continue;
        }

        try {
          onProgress(`Syncing ${tile.name}...`);

          const courseId = parseCanvasCourseId(tile.canvasUrl ?? "");
          if (!courseId) {
            reportLines.push(`${tile.name}: no LMS link - skipped`);
            continue;
          }

          const inst = (tile.institution ?? "").trim().toUpperCase();
          if (!inst) {
            reportLines.push(`${tile.name}: no institution on the tile - skipped`);
            continue;
          }

          if (!termCoursesByInst.has(inst)) {
            const coursesResult = await listCoursesByTermAction(inst, "");
            if ("error" in coursesResult) {
              reportLines.push(`${tile.name}: failed to fetch courses from ${inst} - ${coursesResult.error}`);
              continue;
            }
            const courseMap = new Map<string, LmsTermCourse>();
            for (const row of coursesResult.courses) {
              if (row.id) {
                courseMap.set(row.id, row);
              }
            }
            termCoursesByInst.set(inst, courseMap);
          }

          const courseMap = termCoursesByInst.get(inst)!;
          const lmsRow = courseMap.get(courseId);

          const overrides: Partial<CourseInput> = {};

          if (!tile.courseCode && lmsRow?.courseCode) {
            overrides.courseCode = lmsRow.courseCode;
          }
          if (!tile.term && lmsRow?.termName) {
            overrides.term = lmsRow.termName;
          }
          if (!tile.startDate && lmsRow?.startAt) {
            overrides.startDate = lmsRow.startAt.slice(0, 10);
          }
          if (!tile.lms && tile.canvasUrl) {
            overrides.lms = "canvas";
          }

          let addedStudents = 0;
          if (includeRoster) {
            try {
              const rosterResult = await listCourseRosterAction(inst, courseId);
              if ("error" in rosterResult) {
                reportLines.push(
                  `${tile.name}: failed to fetch roster - ${rosterResult.error}`
                );
              } else {
                const merged = mergeCanvasRoster(
                  tile.studentRepos ?? [],
                  rosterResult.students.map((s) => ({
                    id: s.id,
                    name: s.name,
                  }))
                );
                if (merged.added > 0) {
                  addedStudents = merged.added;
                  overrides.studentRepos = merged.studentRepos;
                  overrides.roster = merged.roster;
                }
              }
            } catch (err) {
              reportLines.push(
                `${tile.name}: roster sync failed - ${
                  err instanceof Error ? err.message : String(err)
                }`
              );
            }
          }

          if (Object.keys(overrides).length > 0) {
            const updatePayload = {
              ...courseToInputPayload(tile),
              ...overrides,
            };
            const updateResult = await updateCourseHubAction(id, updatePayload);
            if ("error" in updateResult) {
              throw new Error(updateResult.error);
            }

            const fields = Object.keys(overrides).join(", ");
            const added = addedStudents > 0 ? ` +${addedStudents} student(s)` : "";
            reportLines.push(`${tile.name}: filled ${fields}${added}`);
            updated++;
          } else {
            reportLines.push(`${tile.name}: already complete`);
          }
        } catch (err) {
          reportLines.push(
            `${tile.name}: ${err instanceof Error ? err.message : "failed"}`
          );
        }
      }

      const report = reportLines.join("\n");
      return {
        outputs: {
          report,
          updated: String(updated),
          hasUpdated: updated > 0 ? "1" : "",
        },
        summary: { kind: "text", text: report },
      };
    },
  },

  {
    type: "import-roster-from-csv",
    name: "Import roster from CSV",
    description: "Parse a roster from a CSV file and merge it into a course tile's student roster.",
    inputs: [
      { key: "roster", label: "Roster CSV", type: "uploads", required: true, help: "Upload the .csv/.txt/.tsv roster file." },
      { key: "hubCourse", label: "Course tile", type: "hubCourse", required: true, help: "The course tile to merge the roster into." },
    ],
    outputs: [
      { key: "added", label: "Students added", type: "number" },
      { key: "matched", label: "Students matched", type: "number" },
      { key: "total", label: "Total students", type: "number" },
      { key: "report", label: "Import report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const files = Array.isArray(values.roster) ? (values.roster as File[]) : [];
      if (files.length === 0) {
        throw new Error("Upload the roster CSV file.");
      }

      const hubCourseId = String(values.hubCourse ?? "").trim();
      if (!hubCourseId) {
        throw new Error("Select a course tile.");
      }

      onProgress("Loading course...");
      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }

      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (!tile) {
        throw new Error("Course tile not found.");
      }

      onProgress("Parsing roster...");
      const csv = await files[0].text();

      let students: Array<{ name: string; email?: string; externalId?: string }> = [];

      // Try parsing as gradebook first
      const headerLine = csv.split("\n")[0];
      const format = detectGradebookFormat(headerLine.split(/[,\t]/).map((s) => s.trim()));

      if (format !== "unknown") {
        const parsed = parseGradebookCsv(csv);
        students = parsed.students.map((s) => ({
          name: s.name,
          email: s.email,
          externalId: s.externalId,
        }));
      } else {
        // Plain CSV with name/email heuristics and header detection
        const lines = csv.split("\n").map((l) => l.trim()).filter(Boolean);
        let startIndex = 0;

        // Detect and skip header row: if first row looks like column labels
        if (lines.length > 0) {
          const firstLineParts = lines[0].split(/[,\t]/).map((p) => p.trim());
          const looksLikeHeader =
            (firstLineParts.some((p) => /^name$/i.test(p) || /^email$/i.test(p))) &&
            (!firstLineParts[1] || !firstLineParts[1].includes("@"));
          if (looksLikeHeader) {
            startIndex = 1;
          }
        }

        for (let i = startIndex; i < lines.length; i++) {
          const parts = lines[i].split(/[,\t]/).map((p) => p.trim());
          if (parts.length >= 1) {
            students.push({
              name: parts[0],
              email: parts[1]?.includes("@") ? parts[1] : undefined,
            });
          }
        }
      }

      if (students.length === 0) {
        throw new Error("No students found in the roster file.");
      }

      onProgress("Merging roster...");
      const merged = mergeImportedRoster(tile.studentRepos ?? [], students);

      const updateResult = await updateCourseHubAction(hubCourseId, {
        ...courseToInputPayload(tile),
        studentRepos: merged.studentRepos,
        roster: merged.roster,
      });

      if ("error" in updateResult) {
        throw new Error(updateResult.error);
      }

      const reportLines: string[] = [];
      reportLines.push(`Added: ${merged.added}`);
      reportLines.push(`Matched: ${merged.matched}`);
      reportLines.push(`Total: ${merged.studentRepos.length}`);

      const report = reportLines.join("\n");

      return {
        outputs: {
          added: String(merged.added),
          matched: String(merged.matched),
          total: String(merged.studentRepos.length),
          report,
        },
        summary: { kind: "text", text: report },
      };
    },
  },

  {
    type: "create-course-tile",
    name: "Create a course tile",
    description: "Create a new course tile with a name, institution, start date, and LMS type.",
    inputs: [
      { key: "name", label: "Course name", type: "text", required: true },
      { key: "institution", label: "Institution", type: "institution", required: false },
      { key: "startDate", label: "Start date", type: "date", required: false },
      { key: "weeks", label: "Number of weeks", type: "number", required: false },
      { key: "lms", label: "LMS", type: "text", required: false, help: "canvas, blackboard, brightspace, moodle, or none." },
    ],
    outputs: [
      { key: "courseId", label: "Course tile", type: "hubCourse" },
      { key: "created", label: "Created?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const name = String(values.name ?? "").trim();
      if (!name) {
        throw new Error("Provide a course name.");
      }

      onProgress("Checking existing courses...");
      const list = await listCourseHubAction();
      if ("error" in list) {
        throw new Error(list.error);
      }

      const institution = String(values.institution ?? "").trim();
      const nameKey = `${name.trim().toLowerCase()}||${institution.trim().toLowerCase()}`;

      // Check if tile already exists
      for (const tile of list.courses) {
        const tileKey = `${(tile.name ?? "").trim().toLowerCase()}||${(tile.institution ?? "").trim().toLowerCase()}`;
        if (tileKey === nameKey) {
          return {
            outputs: { courseId: tile.id, created: "" },
            summary: { kind: "text", text: `Course tile already exists: ${name}` },
          };
        }
      }

      onProgress("Creating course tile...");

      const lms = String(values.lms ?? "").trim().toLowerCase();
      const lmsType = ["canvas", "blackboard", "brightspace", "moodle"].includes(lms)
        ? lms
        : lms === "none"
          ? null
          : null;

      const created = await createCourseHubAction({
        name,
        institution: institution || undefined,
        startDate: String(values.startDate ?? "").trim() || undefined,
        weeks: values.weeks ? Number(values.weeks) : undefined,
        lms: lmsType,
      });

      if ("error" in created) {
        throw new Error(created.error);
      }

      return {
        outputs: { courseId: created.course.id, created: "1" },
        summary: { kind: "text", text: `Created course tile: ${name}` },
      };
    },
  },

  {
    type: "configure-institution-feeds",
    name: "Configure institution feeds",
    description: "Set up calendar feed URLs (ICS) for an institution to enable deadline detection without LMS API access.",
    inputs: [
      { key: "institution", label: "Institution", type: "institution", required: true },
      { key: "calendarFeedUrl", label: "Calendar feed URLs", type: "longtext", required: true, help: "One ICS feed URL per line (from the LMS calendar's export/subscribe)." },
    ],
    outputs: [
      { key: "configured", label: "Configured?", type: "boolean" },
      { key: "report", label: "Configuration report", type: "longtext" },
    ],
    run: async (values, helpers, onProgress) => {
      const inst = String(values.institution ?? "").trim();
      if (!inst) {
        throw new Error("Select an institution.");
      }

      const urlsText = String(values.calendarFeedUrl ?? "").trim();
      if (!urlsText) {
        throw new Error("Provide at least one calendar feed URL.");
      }

      const urls = urlsText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      const invalidUrls = urls.filter((u) => !u.startsWith("http://") && !u.startsWith("https://"));
      if (invalidUrls.length > 0) {
        throw new Error(`Invalid URLs (must start with http:// or https://): ${invalidUrls.join(", ")}`);
      }

      onProgress("Validating feeds...");
      const reportLines: string[] = [];
      let successCount = 0;

      for (const url of urls) {
        try {
          const icsResult = await fetchIcsFeedAction(url);
          if ("error" in icsResult) {
            reportLines.push(`${url}: ${icsResult.error}`);
          } else {
            const events = parseIcsEvents(icsResult.ics);
            reportLines.push(`${url}: ${events.length} events`);
            successCount++;
          }
        } catch (err) {
          reportLines.push(`${url}: ${err instanceof Error ? err.message : "failed to fetch"}`);
        }
      }

      if (successCount === 0) {
        throw new Error("No feeds could be validated. Check the URLs and try again.");
      }

      onProgress("Saving configuration...");

      if (!helpers.getInstitutionFields) {
        throw new Error("Sign in to configure institutions.");
      }

      const getFieldsResult = await helpers.getInstitutionFields(inst);

      // Rebuild field list: keep non-calendarFeedUrl fields, set new calendar fields
      const newFields = getFieldsResult
        .filter((f) => !f.id.startsWith("calendarFeedUrl"))
        .map((f) => ({ ...f }));

      for (let i = 0; i < urls.length; i++) {
        const fieldId = i === 0 ? "calendarFeedUrl" : `calendarFeedUrl${i + 1}`;
        const fieldLabel = i === 0 ? "Calendar feed (.ics)" : `Calendar feed ${i + 1} (.ics)`;
        newFields.push({
          id: fieldId,
          label: fieldLabel,
          type: "url",
          value: urls[i],
        });
      }

      const saveResult = await saveInstitutionFieldsAction(inst, newFields as InstitutionField[]);
      if ("error" in saveResult) {
        throw new Error(saveResult.error);
      }

      const report = reportLines.join("\n");

      return {
        outputs: {
          configured: successCount > 0 ? "1" : "",
          report,
        },
        summary: { kind: "text", text: report },
      };
    },
  },
];
