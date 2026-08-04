// Lecture-file assembly for the client-side step catalog: assembleLectureFiles
// and its immediate helpers (deck theme resolution, the output-selector guard,
// and the required-graphics gap reporting it uses), split out of
// registry-helpers.ts to keep that file under 1000 lines (see AGENTS.md
// gates). registry-helpers.ts re-exports every symbol below so existing
// importers (including registry-helpers.assembleLectureFiles.test.ts and
// registry-helpers.graphicsGapReportLines.test.ts, both of which import from
// "./registry-helpers") are unchanged.
//
// StepRunHelpers/StepRunSummary are type-only imports back from
// registry-helpers.ts (erased at compile time), so this file has NO runtime
// import edge back to the module that re-exports it - same pattern as
// registry-helpers.sources.ts.

import { getDeckTemplateAction, listCourseHubAction } from "@/app/actions";
import type { AssignmentPlan } from "@/app/actions";
import { enforceGraphicsForApplied, GRAPHIC_REQUIRED_PREFIXES, CODING_GRAPHIC_REQUIRED_PREFIXES } from "@/lib/slide-graphics";
import type { CourseKind } from "@/lib/course-kind";
import type { GeneratedCourseFile } from "@/lib/workflows/types";
import type { PptxTheme } from "@/lib/pptx";
import { buildSlidesPptx, withDeckNotes } from "@/lib/pptx";
import { buildDocxFromPlainText } from "@/lib/docx";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import type { StepRunHelpers, StepRunSummary } from "@/lib/workflows/registry-helpers";

// Resolve a template input to its theme for buildSlidesPptx. Defaults to
// Classic Lecture; fails forward with a note if the template is not found.
export async function resolveDeckTheme(
  templateValue: unknown
): Promise<{ theme: PptxTheme | undefined; templateName: string; note: string | null }> {
  const idOrName = String(templateValue ?? "").trim() || "preset-classic-lecture";
  const r = await getDeckTemplateAction(idOrName);
  if ("error" in r) {
    return {
      theme: undefined,
      templateName: "Classic Lecture",
      note: `Template "${idOrName}" not found - used Classic Lecture.`,
    };
  }
  const theme: PptxTheme = {
    backgroundKind: r.template.theme.backgroundKind,
    backgroundColor: r.template.theme.backgroundColor,
    backgroundColor2: r.template.theme.backgroundColor2,
    fontColor: r.template.theme.fontColor,
    // Note: backgroundImageData server/client-side falls back to solid exactly
    // like savePresentationFileAction; gradients without the precomputed PNG
    // render as solid fills.
  };
  return { theme, templateName: r.template.name, note: null };
}

// Whether an optional-generator "selected" input (steps.course-build-scope.ts's
// "select-course-outputs" boolean outputs - selectedAssignments/Objectives/
// Openers/Decks, and the single "selected" input generate-course-guides/
// generate-weekly-announcements/generate-knowledge-checks each declare) says
// this generator should run. UNBOUND (undefined - the value every preset that
// never wires the new selector leaves it at, and every EXISTING saved run
// form with no value for it) means "generate" - the opposite default of most
// boolean inputs in this registry (e.g. postToLms, which defaults OFF when
// unbound). This is deliberate: "blank means ALL" (COURSE_BUILD's output
// selector) must reproduce today's full-generation behavior exactly for
// every preset that does not bind it, so unbound can never mean "skip."
export function isGeneratorSelected(value: unknown): boolean {
  if (value === undefined) return true;
  const v = String(value).trim().toLowerCase();
  return v !== "" && v !== "0" && v !== "false";
}

// The run-report line for `gapCount` slides missing a required graphic, or ""
// when there is nothing to report. Names the ACTUAL required slide types for
// `courseKind`, derived from GRAPHIC_REQUIRED_PREFIXES/CODING_GRAPHIC_
// REQUIRED_PREFIXES (slide-graphics.ts) instead of a third hardcoded
// vocabulary copy: "Artifact/Judgment Call/Agenda" for applied, "Agenda/
// Terminology/concept-intro" for coding (concept-intro has no title prefix -
// see isCodingConceptIntroSlide). Shared by graphicsGapReportLines below and
// steps.content-lectures.prepare.ts so the wording lives in one place.
export function graphicsGapReportLine(gapCount: number, courseKind: CourseKind): string {
  if (gapCount <= 0) return "";
  const prefixes = courseKind === "applied" ? GRAPHIC_REQUIRED_PREFIXES : CODING_GRAPHIC_REQUIRED_PREFIXES;
  const names = prefixes.map((p) => p.replace(/:$/, ""));
  if (courseKind === "coding") names.push("concept-intro");
  return `${gapCount} slide${gapCount === 1 ? "" : "s"} ${gapCount === 1 ? "is" : "are"} missing a required graphic (${names.join("/")}) even after the repair pass.`;
}

// P3-AC3/AC1 (choke point): every "N slide(s) ... missing a required
// graphic" run-report line for a batch of plans, or [] when none survive -
// recomputed directly from each plan's own final slides rather than
// threaded through an AssignmentPlan field, since enforceGraphicsForApplied
// is pure and re-running it here over the already-repaired slides reports
// exactly the same remaining gaps the repair pass itself saw (no risk of a
// stale/unread count field - see the graphicViolations/graphicsMissing
// fields this replaced, AC2). No longer a no-op for coding - see
// graphicsGapReportLine above for the per-kind wording and why.
//
// Pulled out of assembleLectureFiles as its own exported function (rather
// than left inline) so a caller that must mock assembleLectureFiles wholesale
// - its own real body drives pptx/docx/zip generation that needs browser
// Blob-reading support a node test environment lacks, see
// registry-helpers.assembleLectureFiles.test.ts's own header comment - can
// still exercise the REAL gap-computation logic from inside that mock
// instead of re-implementing or hand-waving it. See
// registry.graphics-gap-reporting.test.ts's mockAssembled, which calls this
// directly for exactly that reason.
export function graphicsGapReportLines(plans: AssignmentPlan[], courseKind: CourseKind): string[] {
  const graphicGaps = plans.reduce((total, p) => total + enforceGraphicsForApplied(p.slides, courseKind).missing.length, 0);
  const line = graphicsGapReportLine(graphicGaps, courseKind);
  return line ? [line] : [];
}

// Assemble lecture materials from assignment plans into files and zip,
// handling deck theming, file creation, download/save logic.
// Shared by lecture-zip and lecture-materials-from-schedule steps.
//
// AC1 (graphics-gap-reporting choke point): this is now where a required-
// graphic gap that survived the upstream repair pass (buildScheduleWeekPlan/
// generateSlidesFromTopic and buildAssignmentPlan both already run
// enforceGraphicsForApplied + fillMissingGraphics before a plan ever reaches
// here - course-planning-grounding.ts) gets REPORTED to the run's own
// summary - moved here from being computed inline by only one of this
// function's callers (lecture-materials-from-schedule, steps.content-lectures.ts)
// so every caller inherits it, present and future, instead of a second
// applied-deck-producing path (the repoless lecture-zip branch) shipping a
// genuine gap with nothing said about it anywhere the instructor can see.
// `courseKind` defaults to "coding" so a caller that never passes one (there
// is none left in this codebase, but the default keeps the function total)
// still gets a real answer, not silence: enforceGraphicsForApplied stopped
// being a no-op for coding decks (see graphicsGapReportLine's comment
// above), so an unpassed `courseKind` reports coding's own real gaps too.
export async function assembleLectureFiles(
  plans: AssignmentPlan[],
  values: Record<string, unknown>,
  helpers: StepRunHelpers,
  onProgress: (msg: string) => void,
  baseNameFallback: string,
  courseKind: CourseKind = "coding"
): Promise<{
  files: GeneratedCourseFile[];
  summary: StepRunSummary;
}> {
  const includeInstructions =
    values.includeInstructions === undefined
      ? true
      : String(values.includeInstructions) === "1";

  // COURSE_BUILD's output selector (steps.course-build-scope.ts's
  // "select-course-outputs"): each of the four roles this function can
  // produce per plan is independently selectable. Every OTHER caller
  // (lecture-zip's repo and repoless branches, and lecture-materials-from-
  // schedule when used by NO_CODE_KICKOFF/COURSE_KICKOFF/a standalone Course
  // Refresh) never binds these, so isGeneratorSelected's "unbound means
  // generate" default reproduces today's full-generation behavior exactly.
  // "Module introductions" have no toggle of their own - they ride as the
  // deck's own opening-slide speaker notes (withDeckNotes below) and are
  // therefore controlled by selectedDecks, not a separate flag.
  const selectedObjectives = isGeneratorSelected(values.selectedObjectives);
  const selectedDecks = isGeneratorSelected(values.selectedDecks);
  const selectedAssignments = isGeneratorSelected(values.selectedAssignments);
  const selectedOpeners = isGeneratorSelected(values.selectedOpeners);
  const deselectedRoles = [
    !selectedObjectives && "module objectives",
    !selectedDecks && "lecture decks",
    !selectedAssignments && "assignment instructions",
    !selectedOpeners && "class openers",
  ].filter((r): r is string => Boolean(r));

  const deck = await resolveDeckTheme(values.template);
  const files: GeneratedCourseFile[] = [];

  // Determine the course tile (if any) up front so both the per-file names
  // below and the zip's base name share the same course label.
  const hubCourseId = String(values.hubCourse ?? "").trim();
  let course: { courseCode: string | null; name: string } | null = null;
  if (hubCourseId) {
    const list = await listCourseHubAction();
    if (!("error" in list)) {
      const tile = list.courses.find((c) => c.id === hubCourseId);
      if (tile) {
        course = { courseCode: tile.courseCode, name: tile.name };
      }
    }
  }

  if (deck.note) onProgress(deck.note);
  onProgress(`Processing ${plans.length} assignments...`);
  for (const plan of plans) {
    // AC1/AC2/AC3: the module objectives document ships alongside the other
    // per-week artifacts, generated by the SAME builders that already
    // produce the slides/intro/instructions here (buildScheduleWeekPlan and
    // the repo-driven buildAssignmentPlan) - so it needs no new generation
    // call of its own at this layer, just packaging. Always present
    // (moduleObjectives is never "" - real generation or, on failure, the
    // deterministic scaffold - see the AssignmentPlan field's doc comment),
    // so this always runs; the guard is defensive only. pageText carries the
    // same markdown the docx renders, so lms-populate can turn it into a
    // native LMS Page through the SAME role+pageText mechanism "introduction"
    // already uses (steps.lms-modules.ts).
    if (selectedObjectives && plan.moduleObjectives.trim()) {
      const objectivesData = await buildDocxFromPlainText(plan.moduleObjectives, [], helpers.author);
      files.push({
        name: buildWorkflowFileName({
          course,
          artifact: "Module Objectives",
          qualifier: plan.label,
          ext: "docx",
        }),
        blob: new Blob([objectivesData], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        weekNumber: plan.weekNumber,
        sortOrder: 0.5,
        role: "objectives",
        pageText: plan.moduleObjectives,
        // Carried forward so a downstream per-week generator can find this
        // week's anchor case even when "decks"/"openers" are deselected and
        // this is the only file that ships for the week - see
        // GeneratedCourseFile.caseStudy's own doc comment (types.ts).
        ...(plan.caseStudy ? { caseStudy: plan.caseStudy } : {}),
      });
    }

    // V3 (professional-lift audit): a week whose slide generation failed
    // falls back to an empty slides array (buildScheduleWeekPlan/
    // buildAssignmentPlan), which buildSlidesPptx renders as a single title
    // slide - a real generated run shipped exactly this to Canvas as an
    // ordinary lecture while the run's own header read clean. Mark it
    // unmistakably instead: the one slide it has says so, the filename says
    // so, and needsRegeneration tells lms-populate/the Common Cartridge
    // builder to never upload it as if it were a finished lecture.
    if (selectedDecks) {
      const slidesNeedRegeneration = plan.slidesFailed === true;
      const pptxData = await buildSlidesPptx({
        presentationTitle: slidesNeedRegeneration
          ? `REGENERATE THIS WEEK - ${plan.presentationTitle}`
          : plan.presentationTitle,
        // The module introduction rides in as the opening slide's speaker notes
        // rather than shipping as its own document - so deselecting "decks"
        // also means no module-introduction artifact ships this run (there is
        // no separate toggle for it - see this function's own header note).
        slides: withDeckNotes(plan.slides, plan.moduleIntroduction),
        subtitle: plan.label,
        author: helpers.author,
        theme: deck.theme,
      });

      files.push({
        name: buildWorkflowFileName({
          course,
          artifact: "Lecture Slides",
          qualifier: slidesNeedRegeneration ? `${plan.label} - NEEDS REGENERATION` : plan.label,
          ext: "pptx",
        }),
        blob: new Blob([pptxData], {
          type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        }),
        mimeType:
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        weekNumber: plan.weekNumber,
        sortOrder: 1,
        role: "slides",
        ...(slidesNeedRegeneration ? { needsRegeneration: true } : {}),
        ...(plan.caseStudy ? { caseStudy: plan.caseStudy } : {}),
      });
    }

    if (selectedAssignments && includeInstructions && plan.assignmentInstructions) {
      const docxData = await buildDocxFromPlainText(
        plan.assignmentInstructions,
        plan.instructionsTemplateHeadings,
        helpers.author
      );
      files.push({
        name: buildWorkflowFileName({
          course,
          artifact: "Assignment Instructions",
          qualifier: plan.label,
          ext: "docx",
        }),
        blob: new Blob([docxData], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        weekNumber: plan.weekNumber,
        sortOrder: 2,
        role: "instructions",
        pageText: plan.assignmentInstructions,
        ...(plan.caseStudy ? { caseStudy: plan.caseStudy } : {}),
      });
    }

    // T2 (no-code pipeline reorder): present only when the plan's own
    // sequenceOpenerBeforeDeck phase actually generated one. That phase now
    // runs unconditionally for every production caller of BOTH plan builders
    // - buildAssignmentPlan (shared.ts), reached via lecture-zip's repo
    // branch, and buildScheduleWeekPlan (course-planning-grounding.ts),
    // reached via the schedule-driven branches - so plan.openerText is
    // populated for those. It stays undefined only for a plan built with the
    // phase left off, which today means exactly one caller:
    // generateLecturePlanForAssignmentAction's single-assignment regeneration
    // (lecture-plans.ts), which does not pass sequenceOpenerBeforeDeck and so
    // keeps buildAssignmentPlan's own default (false) - see that parameter's
    // doc comment for why single-assignment regen is deliberately excluded.
    // Ships as its own docx, role "opener", the SAME role and file shape the
    // standalone generate-class-openers step already produces, so
    // gatherWeekMaterials (steps.weekly-announcements.ts) and the cartridge/
    // zip bucketing both pick it up identically either way.
    if (selectedOpeners && plan.openerText && plan.openerText.trim()) {
      const openerData = await buildDocxFromPlainText(plan.openerText, [], helpers.author);
      files.push({
        name: buildWorkflowFileName({
          course,
          artifact: "Class Opener",
          qualifier: plan.label,
          ext: "docx",
        }),
        blob: new Blob([openerData], {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        weekNumber: plan.weekNumber,
        sortOrder: 3,
        role: "opener",
        pageText: plan.openerText,
        ...(plan.caseStudy ? { caseStudy: plan.caseStudy } : {}),
      });
    }
  }

  onProgress("Assembling zip...");
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.blob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });

  const zipFileName = course
    ? buildWorkflowFileName({ course, artifact: "Lecture Materials", ext: "zip" })
    : `${baseNameFallback}.zip`;

  // The zip always downloads in an attended run, regardless of the tile's
  // LMS. A Canvas/Blackboard tile separately gets a Common Cartridge built
  // by its own step (steps.lms-export.ts) for importing into the LMS, but
  // that cartridge is an import artifact FOR the LMS - it is not the
  // instructor's own copy of the materials, and the two are not
  // substitutes for one another. Headless (server) runs have no `document`
  // to build a download link with, so they always skip the download itself
  // and rely on the Files tab/tile save below.
  let downloadSkipped = false;
  if (typeof document !== "undefined") {
    onProgress("Downloading zip...");
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = zipFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    downloadSkipped = true;
  }

  if (helpers.saveBundle) {
    try {
      await helpers.saveBundle(zipBlob, zipFileName);
    } catch (err) {
      console.error("Library save failed:", err);
    }
  }

  // A week that fell back to the deterministic scaffold still produces a
  // file, so without this the run looks like a clean success while shipping
  // placeholder prose. That is exactly how 16 weeks of template lecture notes
  // reached a real course unnoticed.
  const degraded: string[] = [];
  for (const plan of plans) {
    const failures: string[] = [];
    if (plan.slidesFailed) failures.push("slides");
    if (plan.introFailed) failures.push("lecture notes");
    // AC1/AC7: a week whose objectives generation itself failed still ships
    // the deterministic scaffold (never an empty document, never an aborted
    // run) - this only makes that degradation visible, matching how
    // slidesFailed/introFailed already surface here.
    if (plan.objectivesFailed) failures.push("module objectives");
    // T2: mirrors objectivesFailed above - undefined unless
    // sequenceOpenerBeforeDeck actually attempted an opener for this plan.
    if (plan.openerFailed) failures.push("class opener");
    // AC6: the assignment is this module's spine (buildScheduleWeekPlan
    // generates it first, then grounds the intro/deck/objectives in its
    // text) - when it falls back to a placeholder, the intro/deck/objectives
    // were NOT given fake grounding to compensate (see
    // assignmentContextForDownstream there), so that knock-on effect must be
    // visible here too, not just the assignment failure itself.
    if (plan.instructionsFailed) {
      failures.push(
        "assignment instructions (module intro, slides, and objectives generated without assignment grounding as a result)"
      );
    }
    // AC2: a no-code course's model returned code anyway - it was stripped
    // before shipping, but the run must say so rather than looking clean.
    if (plan.codeStrippedFromApplied) {
      failures.push(
        `code removed from ${plan.codeStrippedFromApplied} slide(s) (this course does not use code)`
      );
    }
    // AC3: an applied week whose required-tool selection failed/found
    // nothing - the assignment and the deck each chose independently instead
    // of sharing one tool, so the run must say so rather than looking clean.
    if (plan.moduleToolsSelectionFailed) {
      failures.push(
        "required tool selection (the assignment and slides chose tools independently as a result)"
      );
    }
    // docs/REGRESSION.md #210: mirrors codeStrippedFromApplied/
    // moduleToolsSelectionFailed's "degraded but not fatal" shape - the
    // curated case-study library HAD a matching entry for this week's
    // topic, but every such entry was already claimed by an earlier week in
    // this same run, so this week's case study came from the LLM fallback
    // instead. Never set for a plain content gap (the library never had a
    // candidate for this topic at all) - that is a different problem and
    // deliberately not reported here as noise.
    if (plan.caseStudyLibraryExhausted) {
      failures.push(
        "case study (the curated case-study library ran out of distinct entries for this week - an LLM-invented case was used instead)"
      );
    }
    if (failures.length > 0) {
      degraded.push(`${plan.label}: ${failures.join(", ")} fell back to a placeholder template.`);
    }
  }

  // AC1 (COURSE_BUILD's output selector): a deselected role produced no
  // files this run - said here so the step's own summary shows it, not just
  // a shorter file list with no explanation.
  const selectionNote =
    deselectedRoles.length > 0
      ? [`Not generated this run (deselected in the output selection): ${deselectedRoles.join(", ")}.`]
      : [];

  // P3-AC3/AC1 (choke point): report - never silently pass - any slide still
  // missing a required graphic after the upstream repair pass. See
  // graphicsGapReportLines' own doc comment for why this is a separate,
  // directly-exported pure function rather than inlined here.
  const graphicsNote = graphicsGapReportLines(plans, courseKind);

  return {
    files,
    summary: {
      kind: "list",
      label: downloadSkipped
        ? `Generated ${files.length} files (zip saved to the Files tab as "${zipFileName}" - this run had no browser to download it to)`
        : `Generated ${files.length} files (zip downloaded)`,
      items:
        degraded.length > 0 || selectionNote.length > 0 || graphicsNote.length > 0
          ? [...selectionNote, ...degraded, ...graphicsNote, ...files.map((f) => f.name)]
          : files.map((f) => f.name),
    },
  };
}

