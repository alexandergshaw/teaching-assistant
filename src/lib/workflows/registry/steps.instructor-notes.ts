// Client-side step catalog: per-module INSTRUCTOR NOTES - free software
// alternatives and common debugging problems/solutions for that module's
// ACTUAL tools. Publishable to the LMS but ALWAYS created unpublished (never
// visible to students) - mirrors the "UNPUBLISHED Canvas draft" precedent
// generate-assignment-from-template/generate-test-from-template already use
// for instructor-review-first content (steps.assignments-template.ts),
// verified against this app's own Canvas page-publish plumbing
// (src/lib/canvas-modules/pages.ts's createPage/updatePage, which sends the
// real `wiki_page[published]` flag Canvas itself uses to hide a page from
// students while it still exists on the course for the instructor).
//
// Added ONCE to COURSE_REFRESH (reaching COURSE_KICKOFF and NO_CODE_KICKOFF
// via include-workflow), placed right after generate-weekly-significance so
// it extends the SAME accumulated "files" chain (see the placement comment
// on the preset wiring, presets/course-setup.ts).
//
// TOOL SOURCE (never invented, never LLM-decided which tools to discuss):
// the course's committed CORE toolset (Course.courseProject.tools,
// course-tools-selection.ts's ensureCourseTools/selectCourseTools) narrowed
// to whichever of those tools THIS WEEK's own already-generated text
// actually names, plus any OTHER TOOL_TUTORIAL_MAP-registered tool that text
// names (a per-week SPECIALIST tool) - the exact CORE/intersection and
// SPECIALIST-detection mechanisms resource-links.ts's
// renderToolsYouWillUseSection/renderCourseToolPlanSection already establish
// for the "Tools You Will Use"/"Resources and Tutorials" sections, reused
// here (toolKeysMentionedIn, titleCaseToolKey) rather than re-invented. A
// week whose own generated text names no tool at all - core or specialist -
// gets NO instructor notes rather than a section that lists alternatives to
// software the module never actually used (the "noise" failure this
// feature's own spec warns against).
//
// CHUNK C: the per-week orchestration (the isGeneratorSelected guard, the
// course-tile lookup, the per-week loop, the non-transient-quota short-
// circuit, partial-failure accounting, both terminal return shapes) now
// lives once in weekly-generator.ts's runWeeklyGenerator, shared with the
// other five weekly per-module generators - see that module's own header
// comment. This file supplies only what is genuinely unique to instructor
// notes: the SECOND grounding gate (resolveModuleTools, after the shared
// "no materials" gate), its own document rendering, and its own LMS side
// effect (a page created ALWAYS unpublished, regardless of any input).
//
// The registry imports server actions and browser libraries; it is imported
// only from client components and drives workflow execution.
import {
  generateInstructorNotesAction,
  createPageAction,
  createModuleItemAction,
  type InstructorNoteAlternative,
  type InstructorNoteDebuggingEntry,
} from "@/app/actions";
import { type StepDefinition } from "@/lib/workflows/registry-helpers";
import { buildWorkflowFileName } from "@/lib/workflows/file-names";
import { toolKeysMentionedIn, titleCaseToolKey } from "@/lib/resource-links";
import { markdownLiteToHtml } from "@/lib/markdown-lite";
import type { OutputFamily } from "@/lib/output-selection";
import { groundInWeekMaterials, runWeeklyGenerator, type WeeklyGeneratorConfig } from "./weekly-generator";

/** Whether `coreName` (a committed-toolset display name, e.g. "Trello (free
 * plan)") is actually named in this week's own text. Matched via the SAME
 * TOOL_TUTORIAL_MAP key toolKeysMentionedIn resolves the name to (so
 * "Trello" and "trello.com" are the same check, and an ambiguous key like
 * "sheets" still requires its qualified form) when the name resolves to a
 * curated key at all; falls back to a plain case-insensitive substring check
 * so an uncurated committed tool is not silently dropped just because it
 * will never resolve a tutorial link. Exported for
 * steps.instructor-notes.test.ts. */
export function coreToolMentionedInWeek(coreName: string, weekText: string, mentionedKeys: Set<string>): boolean {
  const keysForName = toolKeysMentionedIn(coreName);
  if (keysForName.length > 0) {
    return keysForName.some((k) => mentionedKeys.has(k));
  }
  const normalized = coreName.toLowerCase().trim();
  if (!normalized) return false;
  return weekText.toLowerCase().includes(normalized);
}

/**
 * This week's ACTUAL tools: the committed CORE toolset narrowed to whichever
 * entries this week's own text actually names, plus any OTHER
 * TOOL_TUTORIAL_MAP-registered tool that text names (a per-week SPECIALIST
 * tool never in the CORE set). [] when the week's text names none of the
 * CORE tools and no specialist tool either - the caller treats that as "no
 * tools to write instructor notes about," never a reason to fall back to
 * discussing the whole course's toolset regardless of this week's activities
 * (see this file's own header comment on the "noise" risk). Exported for
 * steps.instructor-notes.test.ts.
 */
export function resolveModuleTools(coreToolNames: string[], weekText: string): string[] {
  const core = (Array.isArray(coreToolNames) ? coreToolNames : [])
    .map((n) => (typeof n === "string" ? n.trim() : ""))
    .filter(Boolean);
  const text = typeof weekText === "string" ? weekText : "";
  const mentionedKeys = new Set(toolKeysMentionedIn(text));

  const usedCore = core.filter((name) => coreToolMentionedInWeek(name, text, mentionedKeys));
  const coreKeySet = new Set(usedCore.flatMap((name) => toolKeysMentionedIn(name)));

  const seen = new Set(usedCore.map((n) => n.toLowerCase()));
  const specialist: string[] = [];
  for (const key of mentionedKeys) {
    if (coreKeySet.has(key)) continue;
    const display = titleCaseToolKey(key);
    const dedupeKey = display.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    specialist.push(display);
  }

  return [...usedCore, ...specialist];
}

/**
 * Renders the instructor-notes document: "Free Software Alternatives" then
 * "Common Debugging Problems and Solutions" - both sections code-owned in
 * structure (headings, numbering), the content itself LLM-authored and
 * already sanitized by generateInstructorNotesAction. Exported for
 * steps.instructor-notes.test.ts.
 */
export function renderInstructorNotesDocument(
  title: string,
  alternatives: InstructorNoteAlternative[],
  debugging: InstructorNoteDebuggingEntry[]
): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    "Instructor-only notes. Not visible to students by default.",
  ];

  if (alternatives.length > 0) {
    lines.push("", "## Free Software Alternatives");
    for (const a of alternatives) {
      lines.push("", `### ${a.tool}`, `Free alternative: ${a.freeAlternative}`);
      if (a.why) lines.push(a.why);
    }
  }

  if (debugging.length > 0) {
    lines.push("", "## Common Debugging Problems and Solutions");
    for (const d of debugging) {
      lines.push("", `### ${d.tool}`);
      d.problems.forEach((p, i) => {
        lines.push(`${i + 1}. Problem: ${p.issue}`);
        lines.push(`   Solution: ${p.solution}`);
      });
    }
  }

  return lines.join("\n");
}

type InstructorNotesSuccess = Exclude<Awaited<ReturnType<typeof generateInstructorNotesAction>>, { error: string }>;

interface InstructorNotesSetup {
  committedToolNames: string[];
}

interface InstructorNotesGrounding {
  materials: string;
  moduleTools: string[];
}

const instructorNotesConfig: WeeklyGeneratorConfig<InstructorNotesSetup, InstructorNotesGrounding, InstructorNotesSuccess> = {
  selectedKey: "selected",
  countOutputKey: "count",
  sortOrder: 6.5,
  itemLabel: "instructor notes",
  itemLabelPlural: "instructor notes document",
  notSelectedSummaryText: "Skipped - instructor notes were not selected in this run's output selection.",
  noneGeneratedText: "No instructor notes were generated.",
  startProgressText: "Composing per-module instructor notes...",
  weekProgressText: (weekNumber) => `Composing Week ${weekNumber} instructor notes...`,

  setup: (_values, tile) => ({ value: { committedToolNames: tile?.courseProject?.tools ?? [] } }),

  // The shared "no generated materials this run" gate (groundInWeekMaterials
  // - same one generate-weekly-announcements/generate-knowledge-checks use)
  // PLUS a second gate this step alone applies: a week whose own text names
  // no committed or specialist tool at all gets no instructor notes either,
  // rather than a section discussing software the module never used.
  ground: (incoming, weekNumber, ctx) => {
    const base = groundInWeekMaterials(incoming, weekNumber);
    if (!base.ok) return base;
    const moduleTools = resolveModuleTools(ctx.setup.committedToolNames, base.value);
    if (moduleTools.length === 0) {
      return { ok: false, message: `Week ${weekNumber}: skipped - no committed or mentioned tools found for this week's activities.` };
    }
    return { ok: true, value: { materials: base.value, moduleTools } };
  },

  generate: async (grounding, week, ctx) => {
    const topic = (week.topic ?? "").trim();
    return generateInstructorNotesAction(topic, grounding.moduleTools, ctx.helpers.provider, ctx.courseKind);
  },

  render: ({ value, weekNumber, topic, tile }) => {
    const title = `Week ${weekNumber} Instructor Notes${topic ? `: ${topic}` : ""}`;
    const pageText = renderInstructorNotesDocument(title, value.alternatives, value.debugging);
    const fileName = buildWorkflowFileName({
      course: tile ?? null,
      artifact: "Instructor Notes",
      qualifier: topic || `Week ${weekNumber}`,
      ext: "docx",
    });
    return { docxSourceText: pageText, pageText, fileName };
  },

  publish: async (rendered, { grounding, weekNumber, topic, courseUrl, acronym, postToLms, modules }) => {
    const title = `Week ${weekNumber} Instructor Notes${topic ? `: ${topic}` : ""}`;
    let postNote = "not posted - posting is turned off.";
    if (postToLms) {
      if (!courseUrl) {
        postNote = "not posted - no LMS course on the tile.";
      } else {
        try {
          const body = markdownLiteToHtml(rendered.pageText);
          // ALWAYS published: false - instructor notes are never visible to
          // students by default, regardless of postToLms (which only gates
          // whether this LMS call happens at all). See this file's own
          // header comment for how published:false was verified against
          // this app's real Canvas integration.
          const created = await createPageAction(courseUrl, { title, body, published: false }, acronym);
          if ("error" in created) {
            postNote = `LMS error - ${created.error}`;
          } else {
            let placementNote = "; not placed in a module (no module for this week)";
            const targetModule = modules.find((m) => m.week === weekNumber);
            if (targetModule) {
              const linked = await createModuleItemAction(courseUrl, targetModule.id, { type: "Page", pageUrl: created.page.url }, acronym);
              placementNote = "error" in linked ? `; module placement failed - ${linked.error}` : "";
            }
            postNote = `unpublished page created${placementNote}`;
          }
        } catch (err) {
          postNote = `LMS error - ${err instanceof Error ? err.message : "unknown error"}`;
        }
      }
    }
    return `Week ${weekNumber}${topic ? ` (${topic})` : ""}: generated (${grounding.moduleTools.join(", ")}) - ${postNote}`;
  },
};

export const instructorNotesSteps: StepDefinition[] = [
  {
    type: "generate-instructor-notes",
    name: "Generate instructor notes",
    description:
      "Build per-module instructor notes for every week that has one - free software alternatives for that module's ACTUAL tools, and common debugging problems/solutions covering those tools AND the free alternatives. Ships as a Word document in that week's zip folder, and optionally as an LMS page, ALWAYS created unpublished (never visible to students). This step depends only on the course schedule, not on the LMS modules step, so an LMS outage no longer skips it - the cost is that in every built-in preset the page is no longer placed into that week's Canvas module (see the \"modules\" input below).",
    inputs: [
      {
        key: "hubCourse",
        label: "Course tile",
        type: "hubCourse",
        required: false,
        help: "The tile's committed toolset and LMS course drive this step.",
      },
      { key: "schedule", label: "Course schedule", type: "schedule", required: true },
      {
        key: "files",
        label: "Course files so far",
        type: "files",
        required: false,
        help: "This week's already-generated materials (objectives, deck, opener, assignment) are scanned for which tools this week's activities actually use - a week with no generated materials, or that names no tool, is skipped.",
      },
      {
        key: "modules",
        label: "LMS modules",
        type: "modules",
        required: false,
        help: "When bound, the LMS page is placed in that week's own module. None of the built-in presets bind this any more (this step now depends only on the course schedule, not on the LMS modules step, so an LMS-side failure no longer skips this step's local deliverables) - so when postToLms is on, the page is still created (always unpublished) but reports \"not placed in a module\", even on a fully successful LMS modules run.",
      },
      {
        key: "courseKind",
        label: "Course type",
        type: "text",
        required: false,
        options: ["coding", "applied"],
        help: "\"applied\" is a no-code course: nothing generated may involve reading, writing, or running code.",
      },
      {
        key: "postToLms",
        label: "Post instructor notes to the LMS",
        type: "boolean",
        required: false,
        help: "Off by default. When on, the page is ALWAYS created unpublished (invisible to students) regardless of this setting - this only controls whether the LMS call happens at all.",
        // Meaningless (and hidden) once "instructorNotes" is deselected from
        // COURSE_BUILD's own "outputs" multi-select - see workflow-field-
        // visibility.ts's isFieldVisible for the shared predicate. A blank
        // "outputs" (today's default) still shows this - "blank means all".
        visibleWhen: { fieldKey: "outputs", contains: "instructorNotes" satisfies OutputFamily },
      },
      {
        key: "selected",
        label: "Generate this run",
        type: "boolean",
        required: false,
        help: "From COURSE_BUILD's output selection (steps.course-build-scope.ts). Blank/unbound = generate (unchanged default) - every OTHER preset that uses this step leaves it unbound.",
      },
    ],
    outputs: [
      { key: "files", label: "Course files", type: "files" },
      { key: "count", label: "Instructor notes generated", type: "number" },
      { key: "report", label: "Report", type: "longtext" },
    ],
    // Deliverable-resilience pass-through (registry-helpers.ts's
    // StepDefinition.passThroughOnFailure): this step sits mid-chain in
    // COURSE_BUILD/COURSE_REFRESH's "files" accumulator - a thrown failure
    // here would otherwise cascade to every later chain generator AND both
    // terminal deliverables (the Common Cartridge export and the course
    // zip). On a throw, the run loop republishes the incoming "files" it
    // received unchanged instead.
    passThroughOnFailure: { files: "files" },
    run: (values, helpers, onProgress) => runWeeklyGenerator(instructorNotesConfig, values, helpers, onProgress),
  },
];
