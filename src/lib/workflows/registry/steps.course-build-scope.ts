// Client-side step catalog: the two COURSE_BUILD scope-selection steps -
// "select-course-modules" (which modules to (re)generate this run) and
// "select-course-outputs" (which output families to generate this run).
//
// Both are thin wrappers around pure parsers (src/lib/module-selection.ts,
// src/lib/output-selection.ts - see those files for the actual parsing/
// validation logic and their own unit tests). Kept as steps, not resolved
// inline wherever consumed, so course-setup.ts's COURSE_BUILD can wire their
// outputs into every downstream generator through ordinary step/bindOverride
// bindings - the SAME mechanism every other cross-step value in this engine
// uses, and NEVER a runIf gate: server-runner.ts (around lines 218-232)
// cascades a gated-off step's skip transitively to every step bound to its
// output, which would silently take the terminal Common Cartridge export and
// zip down with it the moment a single generator was deselected. Deselecting
// an output therefore means "the generator that makes it does no work and
// passes its files through unchanged," decided INSIDE that generator by
// reading one of this step's boolean outputs as an ordinary input - never by
// gating the generator step itself off.
import { type StepDefinition, type StepRunResult } from "@/lib/workflows/registry-helpers";
import type { ScheduleWeekPlan } from "@/app/actions";
import { parseModuleSelection, narrowScheduleToSelection } from "@/lib/module-selection";
import {
  parseOutputSelection,
  isOutputSelected,
  OUTPUT_FAMILIES,
  OUTPUT_FAMILY_LABELS,
  type OutputFamily,
} from "@/lib/output-selection";

export const courseBuildScopeSteps: StepDefinition[] = [
  {
    type: "select-course-modules",
    name: "Select which modules to generate",
    description:
      "Narrow this run's PER-MODULE generation (assignments, objectives, openers, decks - and, by extension, whichever weeks have material to ground an announcement or knowledge check in) to one, several, or all of the course's modules. Course-wide artifacts - the syllabus, the Castletop workload workbook, the course guides - always describe the whole course and are never narrowed by this selection.",
    inputs: [
      {
        key: "schedule",
        label: "Course schedule",
        type: "schedule",
        required: true,
        help: "The full schedule this run's module selection is validated and narrowed against.",
      },
      {
        key: "modules",
        label: "Modules to generate",
        type: "text",
        required: false,
        help:
          'Which modules to (re)generate this run. Blank = every module (the default - reproduces a full build). A single number ("3"), a comma-separated list ("1,3,5"), a range ("2-4"), or any mix ("1,3-5,8"). Selecting a module number outside this course\'s actual schedule is an error, not an empty success.',
      },
    ],
    outputs: [{ key: "schedule", label: "Narrowed schedule", type: "schedule" }],
    run: async (values): Promise<StepRunResult> => {
      const schedule = (values.schedule as ScheduleWeekPlan[] | undefined) ?? [];
      const modulesRaw = String(values.modules ?? "");
      const selection = parseModuleSelection(modulesRaw);
      // narrowScheduleToSelection throws (naming the missing module(s)) when
      // a selection names a week absent from the schedule - never a silent
      // empty result.
      const narrowed = narrowScheduleToSelection(schedule, selection);

      const summaryText =
        selection.numbers.length === 0
          ? `All ${schedule.length} module(s) selected - no narrowing.`
          : `${narrowed.length} of ${schedule.length} module(s) selected: ${narrowed
              .map((w) => w.week)
              .join(", ")}.`;

      return {
        outputs: { schedule: narrowed },
        summary: { kind: "text", text: summaryText },
      };
    },
  },

  {
    type: "select-course-outputs",
    name: "Select which outputs to generate",
    description:
      "Choose which kinds of content this run should generate - one, several, or all of assignments, module objectives, class openers, lecture decks, course guides, weekly announcements, knowledge checks, weekly Significance of the Material documents, and per-module instructor notes. A deselected output does no work this run: the generator that makes it stays in the workflow and passes its files through unchanged, so the terminal Common Cartridge export and zip always still run and still produce.",
    inputs: [
      {
        key: "outputs",
        label: "Outputs to generate",
        type: "longtext",
        required: false,
        multi: true,
        options: [...OUTPUT_FAMILIES],
        help:
          "Blank = every output (the default - reproduces a full build). Choose one or more: " +
          OUTPUT_FAMILIES.map((f) => `${f} (${OUTPUT_FAMILY_LABELS[f]})`).join("; ") +
          ".",
      },
    ],
    outputs: [
      { key: "selectedAssignments", label: "Generate assignments", type: "boolean" },
      { key: "selectedObjectives", label: "Generate module objectives", type: "boolean" },
      { key: "selectedOpeners", label: "Generate class openers", type: "boolean" },
      { key: "selectedDecks", label: "Generate lecture decks", type: "boolean" },
      { key: "selectedGuides", label: "Generate course guides", type: "boolean" },
      { key: "selectedAnnouncements", label: "Generate weekly announcements", type: "boolean" },
      { key: "selectedKnowledgeChecks", label: "Generate knowledge checks", type: "boolean" },
      { key: "selectedSignificance", label: "Generate Significance of the Material", type: "boolean" },
      { key: "selectedInstructorNotes", label: "Generate instructor notes", type: "boolean" },
    ],
    run: async (values): Promise<StepRunResult> => {
      const raw = String(values.outputs ?? "");
      // parseOutputSelection throws on a line outside OUTPUT_FAMILIES - the
      // run form's multi-select offers only that fixed set, so a value
      // outside it can only be a stale/typo'd saved binding.
      const selection = parseOutputSelection(raw);

      const asFlag = (family: OutputFamily): string => (isOutputSelected(selection, family) ? "1" : "");

      const summaryText = selection.all
        ? "All outputs selected - no narrowing."
        : `${selection.families.size} of ${OUTPUT_FAMILIES.length} output(s) selected: ${[...selection.families].join(
            ", "
          )}.`;

      return {
        outputs: {
          selectedAssignments: asFlag("assignments"),
          selectedObjectives: asFlag("objectives"),
          selectedOpeners: asFlag("openers"),
          selectedDecks: asFlag("decks"),
          selectedGuides: asFlag("guides"),
          selectedAnnouncements: asFlag("announcements"),
          selectedKnowledgeChecks: asFlag("knowledgeChecks"),
          selectedSignificance: asFlag("significance"),
          selectedInstructorNotes: asFlag("instructorNotes"),
        },
        summary: { kind: "text", text: summaryText },
      };
    },
  },
];
