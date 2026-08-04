// Client-side step catalog: the "Codebase and associated assignments" output
// family's own gate/resolver step - "resolve-codebase-repo".
//
// New file (AC5, the task this shipped under): course-build-scope.ts already
// holds COURSE_BUILD's two general-purpose scope selectors and stays focused
// on that; this family's own resolution logic gets its own file rather than
// growing that one, matching how steps.weekly-significance.ts and
// steps.instructor-notes.ts each got their own file for their own output
// family rather than being folded into an existing one.
//
// WHAT THIS FAMILY DOES (mimics COURSE_KICKOFF's own codebase steps -
// course-setup.ts): reuses `fill-readmes` (steps.github.ts, UNCHANGED) to
// write/refresh assignment READMEs into the course's own repository, and
// reuses `lms-assignments`' EXISTING repo-driven grounding (steps.
// assignments-creation.ts - "Before you start, read the README for this
// module in the course codebase...") by feeding it the SAME repository via a
// bindOverride (course-build.ts's "lms-assignments.repo"). Neither of those two steps is
// modified: this step is the ONLY new code the family needed, and its sole
// job is deciding WHICH repository (if any) they should use this run, and
// failing loudly rather than silently doing nothing when the instructor asks
// for this family without a codebase to attach it to.
//
// THE CONDITION (decided and stated here, not left implicit): this family
// only makes sense when the run is ALREADY anchored to a real codebase - the
// schedule source is "codebase" or "tile-repo" (course-schedule-from-source's
// own resolved "isCodebase"/"repo" outputs - see that step's header comment).
// Selecting it on a run whose source is anything else (a typed description,
// an uploaded cartridge, a syllabus, an existing LMS course, or a tile's LMS
// export) FAILS LOUDLY here rather than silently producing nothing - the
// instructor gets a clear, actionable error naming the fix (pick a
// codebase-anchored source, or deselect this output). What this pass does
// NOT do: auto-create a brand-new repository from a template
// (repo-from-template, steps.github.ts) when no codebase is already in play.
// That is a genuinely separate feature - it would need its own required
// run-form fields (a template repository + a new repository name) whose
// required-ness is conditional on this family's selection, and this
// codebase's `visibleWhen` gate (types.ts / workflow-field-visibility.ts)
// only supports exact-match gating against a single OTHER field's value, not
// "is this option checked inside a multi-select" - wiring that safely
// without also making COURSE_KICKOFF's own (always-required) template/name
// fields on that SAME shared step definition appear optional was judged too
// large a change to fold into this pass. See this repo's own change notes for
// the full accounting.
import { type StepDefinition, type StepRunResult, isGeneratorSelected } from "@/lib/workflows/registry-helpers";

export const courseBuildCodebaseSteps: StepDefinition[] = [
  {
    type: "resolve-codebase-repo",
    name: "Resolve the codebase for this run",
    description:
      "Resolves which repository (if any) this run's 'Codebase and associated assignments' output should use - the repository course-schedule-from-source already anchored this run to (source: Codebase or Course tile's repository). Deselected: does nothing. Selected without a codebase-anchored source: fails loudly rather than silently producing nothing.",
    inputs: [
      {
        key: "repo",
        label: "Schedule source's repository",
        type: "repo",
        required: false,
        help: "course-schedule-from-source's own \"repo\" output - non-blank only when this run's schedule source is Codebase or the course tile's repository.",
      },
      {
        key: "selected",
        label: "Generate this run",
        type: "boolean",
        required: false,
        help: "From COURSE_BUILD's output selection (steps.course-build-scope.ts). Blank/unbound = generate (unchanged default).",
      },
    ],
    outputs: [
      {
        key: "repo",
        label: "Repository",
        type: "repo",
      },
    ],
    run: async (values): Promise<StepRunResult> => {
      // AC1/AC2: deselected means "do no work" - never a runIf gate, so
      // nothing bound to this step's own "repo" output (fill-readmes'
      // runIf, course-refresh's lms-assignments via course-build.ts's
      // "lms-assignments.repo" bindOverride) is ever skip-cascaded through it. A blank
      // "repo" output here reproduces exactly what course-build.ts's
      // "load-course-tile.repo" remap already hard-codes today (literal ""), so a
      // deselected run's lms-assignments step is byte-for-byte unaffected
      // by this family's existence.
      if (!isGeneratorSelected(values.selected)) {
        return {
          outputs: { repo: "" },
          summary: { kind: "text", text: "Skipped - Codebase and associated assignments was not selected in this run's output selection." },
        };
      }

      const repo = String(values.repo ?? "").trim();
      if (!repo) {
        throw new Error(
          "Codebase and associated assignments was selected, but this run has no codebase to attach it to - choose \"Codebase\" or \"Course tile's repository\" as this run's schedule source (or deselect this output)."
        );
      }

      return {
        outputs: { repo },
        summary: { kind: "text", text: `Using ${repo} for the codebase and its associated assignments.` },
      };
    },
  },
];
