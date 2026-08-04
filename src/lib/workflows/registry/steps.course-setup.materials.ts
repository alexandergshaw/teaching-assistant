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
  isGeneratorSelected,
} from "@/lib/workflows/registry-helpers";
import { parseCanvasCourseId } from "@/lib/canvas-url";
// Canvas-only guard, shared with lms-wipe/lms-modules/lms-populate/
// lms-assignments (docs/REGRESSION.md entry 217) so all five step families
// word their non-Canvas skip identically instead of near-missing each other.
// Only the tile-shaped helpers are used here: this step already has a
// resolved tile inside its own loop, so resolveTileLms's id-lookup wrapper
// (and the single-course HUB_COURSE_LMS_INPUT it serves) do not apply.
import {
  resolveLmsFromTile,
  isCanvasLms,
  canvasOnlySkipText,
} from "@/lib/workflows/registry/lms-target-guard";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { buildSyllabusFactsFromCourse, resolveSyllabusTemplateId } from "@/lib/syllabus-facts";

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
      {
        // Additive (Start-Here-module output family, output-selection.ts):
        // lets COURSE_BUILD gate this WHOLE step on its own "startHere"
        // output-selector boolean (course-build.ts's "18.selected"
        // bindOverride) without a runIf gate on the step itself (this step
        // declares no outputs at all, so nothing downstream could ever be
        // skip-cascaded through it either way - runIf would have been just
        // as safe, but this matches the isGeneratorSelected convention every
        // other output-family generator in this codebase already uses).
        // Unbound = generate (unchanged default) - COURSE_KICKOFF and
        // COURSE_KICKOFF_NO_CODE both call this step unconditionally and
        // never bind this input, so neither is affected.
        key: "selected",
        label: "Generate this run",
        type: "boolean",
        required: false,
        help: "From COURSE_BUILD's output selection (steps.course-build-scope.ts). Blank/unbound = generate (unchanged default) - every OTHER preset that uses this step leaves it unbound.",
      },
    ],
    outputs: [],
    run: async (values, helpers, onProgress) => {
      if (!isGeneratorSelected(values.selected)) {
        return {
          outputs: {},
          summary: { kind: "text", text: "Skipped - the Start Here module was not selected in this run's output selection." },
        };
      }

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
      // Second index, keyed by the tile's RAW stored URL. `lookup` above can
      // only ever hold a tile whose URL parses as a Canvas course id, so a
      // Blackboard-tiled course is absent from it by construction -
      // parseCanvasCourseId returns null for ".../ultra/courses/_33114_1/
      // outline". That is exactly the tile the Canvas-only guard below needs
      // to find, so resolving the tile by id alone would leave `tile`
      // undefined, resolveLmsFromTile would return "", isCanvasLms would say
      // "Canvas", and the guard would silently never fire - the same
      // gate-can-never-trigger shape docs/REGRESSION.md entry 218 records.
      // The `courses` input is the tile's own canvas_url in every preset that
      // binds it from step 0, so an exact match on the stored string finds
      // the tile regardless of which LMS the URL belongs to.
      const byUrl = new Map<string, (typeof hub.courses)[0]>();
      for (const course of hub.courses) {
        if (course.canvasUrl) {
          const id = parseCanvasCourseId(course.canvasUrl);
          if (id) {
            lookup.set(id, course);
          }
          byUrl.set(course.canvasUrl.trim(), course);
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
      // Courses this step declined to serve because they are not on Canvas.
      // Counted separately from `failures` on purpose: a skip is a correct
      // outcome, not a failure, and the terminal check below must not treat
      // it as one.
      let skipped = 0;

      for (const url of urls) {
        try {
          const inst = helpers.activeInstitution || undefined;
          const id = parseCanvasCourseId(url);
          const tile = (id ? lookup.get(id) : undefined) ?? byUrl.get(url.trim());

          // Canvas-only guard (docs/REGRESSION.md entry 217's pattern, applied
          // per course rather than per step). Every call below -
          // listCourseContentAction, createModuleAction and the rest - routes
          // through canvas-core's resolveCourse, which throws on any URL that
          // is not a Canvas course link. Without this check a Blackboard tile
          // lands in the `failures` bucket, and for the single-course case
          // every preset that binds `courses` from step 0 produces, that makes
          // failures === urls.length and the step throws outright.
          //
          // Gate on the tile's own RECORDED `lms` field, never on parsing the
          // URL - same reasoning as the four steps entry 217 fixed. It fails
          // OPEN (resolveLmsFromTile returns "" for an unknown tile, which
          // isCanvasLms treats as Canvas), so a tile this step cannot find can
          // never be blocked by its own lookup failing.
          const lms = await resolveLmsFromTile(tile, helpers);
          if (!isCanvasLms(lms)) {
            lines.push(`${tile?.name ?? url}: ${canvasOnlySkipText(lms)}`);
            skipped++;
            continue;
          }

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
            // Per-course column wins; the institution field (its editor was
            // retired in the tiles->table redesign, so it is unsettable in
            // practice) is only a fallback for tiles that predate the column.
            const resolvedTemplate = resolveSyllabusTemplateId(tile.syllabusTemplateId, instFields);
            const templateId = resolvedTemplate.templateId;
            const instEmail =
              instFields.find((f) => f.id === "email")?.value ?? "";
            const instLmsUrl =
              instFields.find((f) => f.id === "lmsUrl")?.value ?? "";

            if (!templateId) {
              syllabusNote =
                "no syllabus on the tile, and no syllabus template set on the course or its institution - skipped";
            } else {
              try {
                onProgress(`Generating syllabus for ${tile.name}...`);
                const g = await generateCourseSyllabusAction(
                  templateId,
                  buildSyllabusFactsFromCourse(tile, { email: instEmail, lmsUrl: instLmsUrl }),
                  helpers.provider
                );
                if ("error" in g) {
                  throw new Error(g.error);
                }

                const generatedFileName = buildWorkflowFileName({
                  course: tile,
                  artifact: "Syllabus",
                  ext: "docx",
                });
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
                syllabusNote = resolvedTemplate.source === "course"
                  ? "syllabus generated from the course's syllabus template"
                  : "syllabus generated from the institution template";
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
              const fileName = buildWorkflowFileName({
                course: tile,
                artifact: "Syllabus",
                ext: "docx",
              });
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

      // Only the courses this step actually ATTEMPTED can fail. A run whose
      // every course was skipped as non-Canvas has `attempted === 0` and must
      // NOT throw - it did exactly the right thing for every course it was
      // given, which is the same "never fail for a course this step cannot
      // serve" principle entry 217 established. Before the guard above,
      // `failures === urls.length` was reached by a single Blackboard course
      // and threw.
      const attempted = urls.length - skipped;
      if (attempted > 0 && failures === attempted) {
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
