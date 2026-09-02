// The "generate-presentation-from-template" step, extracted out of
// steps.media.ts only to keep that file under the repo-wide 1000-line
// ceiling (src/file-size-ceiling.structure.test.ts) - same split idiom as
// discussion-serialization.ts, takeAnnouncementTranscription.ts, and
// course-schedule-docx.ts (see each file's own header comment): a cohesive,
// independently-dispatched sub-operation moved to its own leaf, imported
// back by its one caller (steps.media.ts spreads this array into its own
// `mediaSteps` export, so the registry's public surface is unchanged). NO
// BEHAVIOR CHANGED - the step below is copied verbatim from steps.media.ts.
//
// This step is self-contained: no other step in steps.media.ts (or in this
// file) touches the deck-template lookup, the module-offset resolution, or
// buildSlidesPptx. resolveTileCurrentWeek is the one helper it shares with
// steps.media.concept-animations.ts's generate-concept-animations step -
// imported here directly from registry-helpers, never from that sibling
// file or from steps.media.ts, so there is no cross-leaf dependency.
//
// Client-side step catalog: the registry imports server actions and browser
// libraries; it is imported only from client components and drives workflow
// execution - same contract as steps.media.ts itself.
import {
  listCourseContentAction,
  listCourseHubAction,
  getDeckTemplateAction,
  generateDeckFromTemplateAction,
  savePresentationFileAction,
} from "@/app/actions";
import {
  type StepDefinition,
  resolveModulesAhead,
  resolveTileCurrentWeek,
  gatherModuleMaterials,
} from "@/lib/workflows/registry-helpers";
import { buildSlidesPptx } from "@/lib/pptx";
import type { DeckGenContext } from "@/lib/decks/generate";
import { parseLmsModuleValue, liveModuleValue } from "@/lib/workflows/module-value";
import { resolveSourcePolicy } from "@/lib/workflows/source-policy";
import { DOWNLOADABLE_OUTPUT_KEY } from "@/lib/workflows/run-logging";

const SOURCES_HELP =
  "Which material sources to check (live LMS, course export, uploaded materials zip, repository digest, tile topics/description), their order, and the strategy (stop at first success, check all and merge, or accumulate until a source errors). Blank uses the default (live LMS, then the course export, then the tile's topics/description).";

export const presentationFromTemplateSteps: StepDefinition[] = [
  {
    type: "generate-presentation-from-template",
    name: "Generate a presentation from a template",
    description: "Generate a slide deck from a saved PowerPoint Design template (the assistant fills each slide role) and save it to the Files library. Repeats any loop block over the concepts you list.",
    inputs: [
      { key: "template", label: "Template", type: "deckTemplate", required: true, help: "Pick a PowerPoint Design template." },
      { key: "hubCourse", label: "Course", type: "hubCourse", required: false, help: "Pick the course whose module to build from (optional)." },
      { key: "moduleId", label: "Module", type: "lmsModule", required: false, help: "Pick a module from the course's LMS connection or export; its materials ground the deck." },
      { key: "subject", label: "Subject / topic", type: "text", required: false, help: "Defaults to the picked module or the template name." },
      { key: "concepts", label: "Concepts (one per line)", type: "concepts", required: false, help: "Loop items; defaults to the module's topics when a module is picked." },
      { key: "audience", label: "Audience", type: "text", required: false },
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
      { key: "draftId", label: "Draft id", type: "text" },
      { key: "slideCount", label: "Slide count", type: "text" },
      { key: "presentationTitle", label: "Presentation title", type: "text" },
      { key: "deck", label: "Deck (readable)", type: "longtext" },
      { key: "slidesJson", label: "Slides (JSON)", type: "longtext" }
    ],
    run: async (values, helpers, onProgress) => {
      const key = String(values.template ?? "").trim();
      if (!key) throw new Error("Provide the template.");
      const tplRes = await getDeckTemplateAction(key);
      if ("error" in tplRes) throw new Error(tplRes.error);
      const template = tplRes.template;

      const hubCourseId = String(values.hubCourse ?? "").trim();
      const moduleIdRaw = String(values.moduleId ?? "").trim();
      const modulesAhead = resolveModulesAhead(values);
      let moduleName = "";
      let materials: string | undefined;
      let moduleNotes: string[] = [];
      let materialSourceNotes: string[] = [];
      const offsetNotes: string[] = [];
      if (hubCourseId) {
        const list = await listCourseHubAction();
        if ("error" in list) throw new Error(list.error);
        const tile = list.courses.find((c) => c.id === hubCourseId);
        if (tile) {
          // Apply module offset: when a module is picked, apply offset relative to that
          // module's position; when no module is picked, derive from current+N.
          let effectiveModuleIdRaw = moduleIdRaw;
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

          onProgress("Gathering module materials...");
          const sourcesPolicy = resolveSourcePolicy(String(values.sources ?? ""));
          const g = await gatherModuleMaterials(tile, effectiveModuleIdRaw, helpers, onProgress, sourcesPolicy);
          moduleName = g.moduleName;
          materials = g.materialsText || undefined;
          moduleNotes = [...moduleNotes, ...g.notes];
          materialSourceNotes = g.notes;
        }
      }
      const subject = String(values.subject ?? "").trim() || moduleName || template.name;
      const concepts = String(values.concepts ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const effectiveConcepts = concepts.length > 0 ? concepts : moduleNotes;
      const audience = String(values.audience ?? "").trim() || template.audience || undefined;
      const loopItems: Record<string, string[]> = {};
      for (const g of template.loops) {
        loopItems[g.id] = g.source === "literal" && g.items.length > 0 ? g.items : effectiveConcepts;
      }
      onProgress("Generating the slide deck...");
      const ctx: DeckGenContext = { subject, audience, tone: template.tone, materials, loopItems };
      // Call the server ACTION (not the shared core directly) so the LLM call
      // runs server-side. Attended workflow runs execute this step in the
      // browser, where process.env.GEMINI_API_KEY does not exist; the action
      // runs on the server where it does. Unattended runs work either way.
      const deck = await generateDeckFromTemplateAction(template, ctx, helpers.provider);
      if ("error" in deck) throw new Error(deck.error);
      // Save the real, downloadable .pptx to the Files library as the primary
      // deliverable. A failure here throws so the run fails loudly rather than
      // silently producing nothing.
      const fileRes = await savePresentationFileAction({
        presentationTitle: deck.presentationTitle,
        slides: deck.slides,
        theme: template.theme,
        author: helpers.author,
        workflowName: helpers.workflowName ?? null,
        workflowId: helpers.workflowId,
        workflowRunId: helpers.workflowRunId,
      });
      if ("error" in fileRes) throw new Error(fileRes.error);
      const safeName = deck.presentationTitle.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "Presentation";

      // Also hand the deck to the runner to deliver to the browser. The
      // server save above is the durable copy; this is so a run ends with
      // the .pptx in the user's Downloads rather than only in the Files
      // library. buildSlidesPptx is deterministic over the same inputs, so
      // this is the same deck the action stored, not a second differently-
      // generated one. Defect-2 fix: no longer downloads directly here - see
      // DOWNLOADABLE_OUTPUT_KEY's doc comment (run-logging.ts); the runner
      // flushes it once per course instead of this step popping its own
      // download the moment it finishes.
      let downloadNote = "";
      let downloadable: { blob: Blob; fileName: string } | null = null;
      if (typeof document !== "undefined") {
        try {
          const pptxData = await buildSlidesPptx({
            presentationTitle: deck.presentationTitle,
            slides: deck.slides,
            author: helpers.author,
            theme: template.theme
              ? {
                  backgroundKind: template.theme.backgroundKind,
                  backgroundColor: template.theme.backgroundColor,
                  backgroundColor2: template.theme.backgroundColor2,
                  fontColor: template.theme.fontColor,
                }
              : undefined,
          });
          const blob = new Blob([new Uint8Array(pptxData)], {
            type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          });
          downloadable = { blob, fileName: `${safeName}.pptx` };
        } catch (err) {
          // The library copy already succeeded, so a build failure here is a
          // note - never a lost deck.
          downloadNote = ` (browser download failed: ${err instanceof Error ? err.message : String(err)})`;
        }
      }

      const summaryText = `Generated a ${deck.slides.length}-slide deck from "${template.name}"${moduleName ? ` for ${moduleName}` : ""} and saved "${safeName}.pptx" to the Files library${downloadNote}.`;

      const deckLines: string[] = [deck.presentationTitle];
      for (const slide of deck.slides) {
        deckLines.push(`\n## ${slide.title}`);
        for (const bullet of slide.bullets) {
          deckLines.push(`- ${bullet}`);
        }
        if (slide.code) {
          const codeLanguage = slide.codeLanguage || "";
          deckLines.push(`\`\`\`${codeLanguage}`);
          deckLines.push(slide.code);
          deckLines.push("```");
        }
      }
      const readableDeck = deckLines.join("\n");
      const slidesJson = JSON.stringify(deck.slides);

      return {
        outputs: {
          draftId: fileRes.id,
          slideCount: String(deck.slides.length),
          presentationTitle: deck.presentationTitle,
          deck: readableDeck,
          slidesJson,
          ...(downloadable ? { [DOWNLOADABLE_OUTPUT_KEY]: downloadable } : {}),
        },
        summary: (() => {
          const items = [...offsetNotes, ...materialSourceNotes];
          return items.length > 0
            ? { kind: "list" as const, label: summaryText, items }
            : { kind: "text" as const, text: summaryText };
        })(),
      };
    },
  },
];
