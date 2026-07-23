// Client-side step catalog: step definitions that run workflows.
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseHubAction,
  createModuleAction,
  listCourseContentAction,
  createGradableAction,
  createQuizQuestionAction,
  bulkUpdateAction,
  createModuleItemAction,
  createCourseAssignmentAction,
  getFinalizedSyllabusAction,
  generateCourseSyllabusAction,
  createFinalizedSyllabusAction,
  placeSyllabusInModuleAction,
  updateCourseHubAction,
  createPageAction,
  requestFileUploadAction,
} from "@/app/actions";
import {
  type StepDefinition,
  courseToInputPayload,
} from "@/lib/workflows/registry-helpers";
import { parseCanvasCourseId } from "@/lib/canvas-url";

export const courseSetupMaterialsSteps: StepDefinition[] = [
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
];
