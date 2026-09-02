// The "generate-concept-animations" step, extracted out of steps.media.ts
// only to keep that file under the repo-wide 1000-line ceiling
// (src/file-size-ceiling.structure.test.ts) - same split idiom as
// discussion-serialization.ts, takeAnnouncementTranscription.ts, and
// course-schedule-docx.ts (see each file's own header comment): a cohesive,
// independently-dispatched sub-operation moved to its own leaf, imported
// back by its one caller (steps.media.ts spreads this array into its own
// `mediaSteps` export, so the registry's public surface is unchanged). NO
// BEHAVIOR CHANGED - the step below is copied verbatim from steps.media.ts.
//
// This step is self-contained: no other step in steps.media.ts (or in this
// file) touches concept planning/animation generation, Canvas page
// creation, or the library save it makes. resolveTileCurrentWeek is the one
// helper it shares with steps.media.presentation-from-template.ts's
// generate-presentation-from-template step - imported here directly from
// registry-helpers, never from that sibling file or from steps.media.ts, so
// there is no cross-leaf dependency.
//
// Client-side step catalog: the registry imports server actions and browser
// libraries; it is imported only from client components and drives workflow
// execution - same contract as steps.media.ts itself.
import {
  listCourseHubAction,
  createPageAction,
  generateConceptPlanAction,
  generateConceptAnimationAction,
  saveLibraryFileAction,
} from "@/app/actions";
import {
  type StepDefinition,
  blobToBase64,
  resolveTileCurrentWeek,
  loadTileWeekTopic,
} from "@/lib/workflows/registry-helpers";
import { nextLectureWeek } from "@/lib/workflows/next-week";
import { wrapAnimationDocument } from "@/lib/animation-html";

export const conceptAnimationSteps: StepDefinition[] = [
  {
    type: "generate-concept-animations",
    name: "Generate concept animations",
    description:
      "For each selected course tile, detect NEXT week's module and generate a set of animated concept visualizations (self-contained SVG/CSS, no JavaScript) into the tile's materials and the Files tab - optionally also created as unpublished Canvas pages. The week's topic comes from the live LMS first, then the course's LMS export, then the tile's schedule CSV, then its topics list. Courses that are finished, not yet near their start, or where no topic is found are skipped with a note.",
    inputs: [
      {
        key: "courses",
        label: "Course tiles",
        type: "hubCourseList",
        required: true,
        help: "One, several, or all course tiles.",
      },
      {
        key: "maxConcepts",
        label: "Concepts per course",
        type: "number",
        required: false,
        help: "How many animations per course. Default 3 (max 6).",
      },
      {
        key: "lookahead",
        label: "How far ahead",
        type: "lookahead",
        required: false,
        help: "How far ahead to prepare. Default 7 days (the coming week); 14 days prepares the next two weeks.",
      },
      {
        key: "extraNotes",
        label: "Extra notes (optional)",
        type: "longtext",
        required: false,
        help: "Optional guidance folded into every animation (e.g. emphasize runtime complexity).",
      },
      {
        key: "publish",
        label: "Create Canvas pages?",
        type: "boolean",
        required: false,
        help: "Also create each animation as an UNPUBLISHED page in the tile's Canvas course - publish them from Canvas when happy.",
      },
    ],
    outputs: [
      { key: "report", label: "Report", type: "longtext" },
      { key: "generated", label: "Animations generated", type: "number" },
      { key: "hasGenerated", label: "Any generated?", type: "boolean" },
    ],
    run: async (values, helpers, onProgress) => {
      const ids = String(values.courses ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        throw new Error("Select at least one course tile.");
      }

      let maxConceptsVal = Number(values.maxConcepts ?? 3);
      if (Number.isNaN(maxConceptsVal) || maxConceptsVal < 1 || maxConceptsVal > 6) {
        maxConceptsVal = 3;
      } else {
        maxConceptsVal = Math.round(maxConceptsVal);
      }

      const lookaheadRaw = String(values.lookahead ?? "").trim();
      const daysAhead = Number.isFinite(Number(lookaheadRaw)) && Number(lookaheadRaw) >= 1
        ? Math.floor(Number(lookaheadRaw))
        : 7;
      const weeksAhead = Math.max(1, Math.min(4, Math.ceil(daysAhead / 7)));

      const extraNotes = String(values.extraNotes ?? "").trim();
      const publish = String(values.publish ?? "") === "1";

      const hub = await listCourseHubAction();
      if ("error" in hub) {
        throw new Error(hub.error);
      }

      const reportLines: string[] = [];
      let generated = 0;

      for (const id of ids) {
        const tile = hub.courses.find((c) => c.id === id);
        if (!tile) {
          reportLines.push(`${id}: course tile not found - skipped`);
          continue;
        }

        try {
          onProgress(`Generating animations for ${tile.name}...`);
          const weekResolution = await resolveTileCurrentWeek(tile, helpers);
          const nw = nextLectureWeek({
            startDate: tile.startDate,
            weeks: tile.weeks,
            nowMs: Date.now(),
            rawWeek: "skip" in weekResolution ? undefined : weekResolution.rawWeek,
          });

          if ("skip" in nw) {
            reportLines.push(`${tile.name}: skipped - ${nw.skip}.`);
            continue;
          }

          const startWeek = nw.week;
          let sourceNote = "skip" in weekResolution ? "" : (weekResolution.source === "deadlines" ? " (from module deadlines)" : "");

          for (let w = 0; w < weeksAhead; w++) {
            const targetWeek = startWeek + w;

            if (tile.weeks && tile.weeks > 0 && targetWeek > tile.weeks) {
              if (w === 0) {
                reportLines.push(`${tile.name}: skipped - target week ${targetWeek} is past course end.`);
              }
              break;
            }

            try {
              const weekTopic = await loadTileWeekTopic(tile, targetWeek, helpers);
              if ("skip" in weekTopic) {
                if (w === 0) {
                  reportLines.push(`${tile.name}: skipped - ${weekTopic.skip}.`);
                }
                break;
              }

              const topic = weekTopic.topic;
              const summary = weekTopic.summary;
              if (w === 0) {
                sourceNote = weekTopic.source !== "schedule"
                  ? ` (topic from the ${
                      weekTopic.source === "live"
                        ? "live LMS"
                        : weekTopic.source === "export"
                          ? "LMS export"
                          : "tile's topics list"
                    })`
                  : "";
              }
              const context = extraNotes
                ? `${tile.name} week ${targetWeek}: ${topic}. ${summary}. ${extraNotes}`
                : `${tile.name} week ${targetWeek}: ${topic}. ${summary}`;

          const sanitize = (s: string) =>
            s.trim().replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_");

          const pageNotes: string[] = [];
          let tileSaved = 0;
          let signInNeeded = false;

          try {
            onProgress(`Planning concepts for ${tile.name}...`);
            const planResult = await generateConceptPlanAction(
              topic,
              summary,
              maxConceptsVal,
              helpers.provider
            );
            if ("error" in planResult) {
              throw new Error(planResult.error);
            }

            for (const { concept, visualIdea } of planResult.concepts) {
              try {
                onProgress(`Animating "${concept}" for ${tile.name}...`);
                const animResult = await generateConceptAnimationAction(
                  concept,
                  visualIdea,
                  context,
                  helpers.provider
                );
                if ("error" in animResult) {
                  throw new Error(animResult.error);
                }

                const fileName = `${sanitize(tile.name)}_Week${targetWeek}_${sanitize(concept)}_Animation.html`;
                const wrapped = wrapAnimationDocument(`${concept} - Week ${targetWeek}`, animResult.html);
                const blob = new Blob([wrapped], { type: "text/html" });

                if (helpers.saveCourseMaterialFile) {
                  try {
                    await helpers.saveCourseMaterialFile(tile.id, blob, fileName);
                    generated++;
                    tileSaved++;
                    const base64 = await blobToBase64(blob);
                    const animLib = await saveLibraryFileAction({
                      name: fileName,
                      base64,
                      mimeType: "text/html",
                      fileExt: "html",
                      workflowId: helpers.workflowId,
                      workflowName: helpers.workflowName,
                      workflowRunId: helpers.workflowRunId,
                    });
                    if ("error" in animLib) {
                      pageNotes.push(`${concept}: library save skipped - ${animLib.error}`);
                    }
                  } catch (err) {
                    pageNotes.push(
                      `Failed to save ${concept}: ${err instanceof Error ? err.message : String(err)}`
                    );
                  }
                } else {
                  signInNeeded = true;
                }

                if (publish && tile.canvasUrl) {
                  try {
                    await createPageAction(
                      tile.canvasUrl,
                      {
                        title: `Week ${targetWeek}: ${concept} (animation)`,
                        body: animResult.html,
                        published: false,
                      },
                      tile.institution ?? undefined
                    );
                  } catch (err) {
                    pageNotes.push(
                      `Failed to create Canvas page for ${concept}: ${
                        err instanceof Error ? err.message : String(err)
                      }`
                    );
                  }
                }
              } catch (err) {
                pageNotes.push(
                  `Concept "${concept}": ${err instanceof Error ? err.message : "failed"}`
                );
              }
            }

            if (signInNeeded) {
              pageNotes.push("Sign in to save animations");
            }

            const notesSuffix = pageNotes.length > 0 ? ` (${pageNotes.join("; ")})` : "";
            reportLines.push(`${tile.name}: week ${targetWeek} (${topic}) - ${tileSaved} animation(s) saved${sourceNote}${notesSuffix}`);
          } catch (err) {
            reportLines.push(
              `${tile.name}: planning failed - ${err instanceof Error ? err.message : "failed"}`
            );
          }
            } catch (err) {
              reportLines.push(
                `${tile.name}, week ${targetWeek}: ${err instanceof Error ? err.message : "failed"}`
              );
            }
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
          generated: String(generated),
          hasGenerated: generated > 0 ? "1" : "",
        },
        summary: { kind: "text", text: report },
      };
    },
  },
];
