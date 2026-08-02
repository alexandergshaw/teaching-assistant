// Client-side step catalog: the "prepare-lecture" step, split out of
// steps.content-lectures.ts (that file was over the 1000-line cap - see
// docs/REGRESSION.md's line-count discipline). This step builds one deck per
// course tile from a module's gathered materials; it shares no state with
// the other lecture steps in that file beyond the SOURCES_HELP input-help
// string (duplicated here, the same way steps.content-generators.ts and
// steps.media.ts already each keep their own local copy rather than sharing
// one across files).
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  listCourseContentAction,
  listCourseHubAction,
  generateLectureFromMaterialsAction,
  regenerateAnnouncementAction,
  saveLibraryFileAction,
} from "@/app/actions";
import {
  type StepRunResult,
  type StepDefinition,
  blobToBase64,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  resolveDeckTheme,
  gatherModuleMaterials,
} from "@/lib/workflows/registry-helpers";
import type { Course } from "@/lib/supabase/courses";
import { buildSlidesPptx } from "@/lib/pptx";
import { parseLmsModuleValue, liveModuleValue } from "@/lib/workflows/module-value";
import { resolveSourcePolicy } from "@/lib/workflows/source-policy";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { resolveCourseKind } from "@/lib/course-kind";
import { DOWNLOADABLE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const SOURCES_HELP =
  "Which additional material sources to check (live LMS, course export, uploaded materials zip, repository digest, tile topics/description), their order, and the strategy (stop at first success, check all and merge, or accumulate until a source errors). Blank uses the default (live LMS, then the course export, then the tile's topics/description).";

export const prepareLectureStep: StepDefinition = {
  type: "prepare-lecture",
  name: "Prepare lecture",
  description:
    "Build a lecture deck from a module's materials (page bodies, files, assignment/homework descriptions, and item titles) and save it to the course tile and the Files tab. Pauses for announcement review unless Autonomous is on; in Autonomous mode with no course tile it prepares a lecture for every tile. Slides are styled by a PPT Design template (Classic Lecture by default).",
  inputs: [
    {
      key: "hubCourse",
      label: "Course tile",
      type: "hubCourse",
      required: false,
      help: "Leave empty in Autonomous mode to prepare a lecture for every course tile.",
    },
    {
      key: "moduleId",
      label: "Module",
      type: "lmsModule",
      required: false,
      help: "Pick from the live LMS connection or the course's LMS export; without either the step falls back to the tile's topics.",
    },
    {
      key: "courseKind",
      label: "Course type",
      type: "text",
      required: false,
      options: ["coding", "applied"],
      help: "\"applied\" is a no-code course (project management, business, ethics): no code appears anywhere in the slides or notes. This step has no other way to know the course's kind - it does not derive it from the tile.",
    },
    {
      key: "autonomous",
      label: "Autonomous (no review, all tiles)",
      type: "boolean",
      required: false,
      help: "Run hands-off: build and save the deck(s) without pausing to review the announcement. With no course tile selected, prepares a lecture for every tile.",
    },
    {
      key: "template",
      label: "Deck template",
      type: "deckTemplate",
      required: false,
      help: "A PPT Design template that styles the generated slides. Blank uses Classic Lecture (the app's standard look). Slide content still comes from this step's own generator.",
    },
    {
      key: "modulesAhead",
      label: "Modules ahead",
      type: "moduleOffset",
      required: false,
      help: "How many modules past the current one to target. 0 or blank = the current module.",
    },
    {
      key: "sources",
      label: "Material sources",
      type: "sourcePolicy",
      required: false,
      help: SOURCES_HELP,
    },
  ],
  outputs: [
    { key: "announcement", label: "Announcement", type: "longtext" },
    { key: "moduleName", label: "Module", type: "text" },
  ],
  run: async (values, helpers, onProgress) => {
    const autonomous = String(values.autonomous ?? "") === "1";
    const hubCourseId = String(values.hubCourse ?? "").trim();
    const moduleIdRaw = String(values.moduleId ?? "").trim();
    const modulesAhead = resolveModulesAhead(values);
    const sourcesPolicy = resolveSourcePolicy(String(values.sources ?? ""));
    const courseKind = resolveCourseKind(values.courseKind);

    const list = await listCourseHubAction();
    if ("error" in list) {
      throw new Error(list.error);
    }

    const deck = await resolveDeckTheme(values.template);
    if (deck.note) onProgress(deck.note);

    // Build the deck + recap for one tile: gather materials, generate the
    // lecture, save the pptx to the tile. Downloads only in the interactive
    // single-tile path (guarded for headless); never pauses.
    const buildForTile = async (
      tile: Course,
      download: boolean
    ): Promise<{
      announcement: string;
      moduleName: string;
      slideCount: number;
      fileName: string;
      // Present only when `download` is true AND a browser is available -
      // the caller uses it to hand the deck to the runner (defect-2 fix, see
      // DOWNLOADABLE_OUTPUT_KEY's doc comment, run-logging.ts) instead of
      // this function downloading it directly.
      downloadable: { blob: Blob; fileName: string } | null;
      materialsText: string;
      materialsSource: string;
      notes: string[];
    }> => {
      // Apply module offset: when no module is picked, derive from current+N;
      // when a module is picked, apply offset relative to that module's position.
      let effectiveModuleIdRaw = moduleIdRaw;
      const offsetNotes: string[] = [];
      if (modulesAhead > 0) {
        const canvasUrl = (tile.canvasUrl ?? "").trim();
        if (canvasUrl) {
          try {
            const picked = parseLmsModuleValue(moduleIdRaw);
            if (picked.fromExport) {
              // Export modules: offset not supported
              offsetNotes.push("modules-ahead is not supported for export-sourced modules");
            } else if (moduleIdRaw) {
              // Explicit live module picked: find its index and offset from there
              const content = await listCourseContentAction(
                canvasUrl,
                helpers.activeInstitution || undefined
              );
              if (!("error" in content)) {
                let targetIdx: number | null = null;
                const pickedIdx = content.modules.findIndex(
                  (m) => String(m.id) === picked.liveId
                );
                if (pickedIdx >= 0) {
                  targetIdx = Math.min(
                    pickedIdx + modulesAhead,
                    content.modules.length - 1
                  );
                }
                if (targetIdx !== null && targetIdx >= 0) {
                  const mod = content.modules[targetIdx];
                  effectiveModuleIdRaw = liveModuleValue(String(mod.id), mod.name);
                }
              }
            } else {
              // No module picked: derive from current + offset
              const content = await listCourseContentAction(
                canvasUrl,
                helpers.activeInstitution || undefined
              );
              if (!("error" in content)) {
                let targetIdx: number | null = null;
                const weekResolution = await resolveTileCurrentWeek(tile, helpers);
                if (!("skip" in weekResolution)) {
                  const rawWeek = weekResolution.rawWeek;
                  targetIdx = Math.min(
                    rawWeek - 1 + modulesAhead,
                    content.modules.length - 1
                  );
                }
                if (targetIdx !== null && targetIdx >= 0) {
                  const mod = content.modules[targetIdx];
                  effectiveModuleIdRaw = liveModuleValue(String(mod.id), mod.name);
                }
              }
            }
          } catch {
            // Fall back to using original moduleIdRaw or empty (will use tile.topics)
          }
        }
      }

      const { moduleName, materialsText, notes, materialsSource } =
        await gatherModuleMaterials(tile, effectiveModuleIdRaw, helpers, onProgress, sourcesPolicy);

      // Combine offset notes with materials gathering notes
      const allNotes = [...offsetNotes, ...notes];

      onProgress(`Generating lecture for ${tile.name}...`);
      const r = await generateLectureFromMaterialsAction(
        tile.name,
        moduleName,
        materialsText,
        helpers.provider,
        courseKind
      );
      if ("error" in r) {
        throw new Error(r.error);
      }

      // AC2: the no-code guard already stripped the code before this point -
      // this note only makes that visible, it does not change the output.
      if (r.codeStripped) {
        allNotes.push(
          `code removed from ${r.codeStripped} slide(s): the model returned code for a course marked "applied" (no-code).`
        );
      }

      const pptxData = await buildSlidesPptx({
        presentationTitle: r.presentationTitle,
        slides: r.slides,
        subtitle: moduleName,
        author: helpers.author,
        theme: deck.theme,
      });
      const blob = new Blob([pptxData], {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });

      const fileName = buildWorkflowFileName({
        course: tile,
        artifact: "Lecture Slides",
        qualifier: moduleName,
        ext: "pptx",
      });

      // Browser-only convenience download; skipped server-side (no document)
      // and in the autonomous multi-tile path. The tile save below is the
      // durable artifact either way. Defect-2 fix: this no longer downloads
      // directly - it hands the blob back to the caller (which sets
      // DOWNLOADABLE_OUTPUT_KEY on the step's own outputs), so the runner
      // can flush it once per course instead of this function downloading
      // it on the spot.
      const downloadable = download && typeof document !== "undefined" ? { blob, fileName } : null;

      if (helpers.saveCourseMaterialFile) {
        try {
          await helpers.saveCourseMaterialFile(tile.id, blob, fileName);
          const base64 = await blobToBase64(blob);
          const lib = await saveLibraryFileAction({
            name: fileName,
            base64,
            mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            fileExt: "pptx",
            workflowId: helpers.workflowId,
            workflowName: helpers.workflowName,
            workflowRunId: helpers.workflowRunId,
          });
          if ("error" in lib) {
            allNotes.push(`library save skipped: ${lib.error}`);
          }
        } catch (err) {
          allNotes.push(
            `saving to the course tile failed: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }

      return {
        announcement: r.announcement,
        moduleName,
        slideCount: r.slides.length,
        fileName,
        downloadable,
        materialsText,
        materialsSource,
        notes: allNotes,
      };
    };

    // Autonomous: build for the chosen tile, or every tile when none is
    // picked, with no review pause.
    if (autonomous) {
      const tiles = hubCourseId
        ? list.courses.filter((c) => c.id === hubCourseId)
        : list.courses;
      if (hubCourseId && tiles.length === 0) {
        throw new Error("Choose a course tile.");
      }
      if (tiles.length === 0) {
        return {
          outputs: { announcement: "", moduleName: "" },
          summary: { kind: "text", text: "No course tiles to prepare lectures for." },
        };
      }

      const items: string[] = [];
      const announcements: string[] = [];
      let built = 0;
      for (const tile of tiles) {
        try {
          const b = await buildForTile(tile, false);
          built++;
          announcements.push(`# ${tile.name} - ${b.moduleName}\n${b.announcement}`);
          items.push(`${tile.name}: ${b.slideCount} slide(s) -> ${b.fileName}`);
          for (const n of b.notes) items.push(`  ${tile.name}: ${n}`);
        } catch (err) {
          items.push(
            `${tile.name}: failed - ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      return {
        outputs: {
          announcement: announcements.join("\n\n"),
          moduleName: `${built} lecture(s)`,
        },
        summary: {
          kind: "list",
          label: `Prepared ${built} lecture(s)`,
          items: items.length ? items : ["(nothing prepared)"],
        },
      };
    }

    // Interactive: one tile, then pause to review the recap announcement.
    const tile = list.courses.find((c) => c.id === hubCourseId);
    if (!tile) {
      throw new Error("Choose a course tile.");
    }

    const b = await buildForTile(tile, true);

    const result: StepRunResult = {
      outputs: {
        announcement: b.announcement,
        moduleName: b.moduleName,
        // Defect-2 fix: hand the deck to the runner instead of downloading
        // it directly - see DOWNLOADABLE_OUTPUT_KEY's doc comment
        // (run-logging.ts). Absent (undefined) in the autonomous multi-tile
        // path (buildForTile's own `downloadable` is null there) and
        // server-side, exactly like the download this replaced.
        ...(b.downloadable ? { [DOWNLOADABLE_OUTPUT_KEY]: b.downloadable } : {}),
      },
      summary: {
        kind: "list",
        label: `Lecture ready for ${b.moduleName}`,
        items: [
          `${b.slideCount} slide(s) -> ${b.fileName}`,
          b.materialsSource,
          ...b.notes,
        ],
      },
    };

    let latestDraft = b.announcement;
    result.requireInput = {
      message: "Review the recap announcement below. Edit it directly, regenerate it with AI, or approve it to schedule; skip to finish without scheduling.",
      key: "announcement",
      kind: "text",
      optional: true,
      initialValue: b.announcement,
      submitLabel: "Approve announcement",
      regenerate: async () => {
        const regen = await regenerateAnnouncementAction(
          tile.name,
          b.moduleName,
          b.materialsText,
          latestDraft,
          helpers.provider
        );
        if ("error" in regen) throw new Error(regen.error);
        latestDraft = regen.announcement;
        return regen.announcement;
      },
    };

    return result;
  },
};
