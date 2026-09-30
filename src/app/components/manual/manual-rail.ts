import type { ContentView } from "../content-tab/constants";

export interface Destination {
  id: string;
  label: string;
  description: string;
}

export interface DestinationGroup {
  name: string | null;
  destinations: Destination[];
}

export type ManualViewType =
  | "course-planning"
  | "content"
  | "version-control"
  | "recording"
  | "ppt-design"
  | "artifact-design"
  | "grading"
  | "presentations";
export type BuildViewType = "new" | "prebuilt";

// The Grading sub-tab's own inner selection: which of its two surfaces is
// showing. Lives here, not in url-state.ts, for the same reason WorkflowsView
// and TasksView do (see url-state.ts's own comment on that) - the ordered
// member list belongs in the leaf module, and declaring it in url-state.ts
// and importing it back would be a cycle this repo has already paid for once.
// "recording"/"snapshots" (GRAD-SUBTAB wave 2,
// docs/tools-grading-subtab-wave2-architecture.md): the two Recording-tab
// grading surfaces (grading-via-recording, snapshot grading) re-parented into
// this inner nav as two more Grading destinations.
// "drafts" (GRAD-SUBTAB wave 3,
// docs/tools-grading-subtab-wave3-architecture.md): Drafted Grades, moved in
// from Workflows > Drafts (DECISION 18/19 - moved, not mirrored). Unlike
// "recording"/"snapshots" it is a plain conditional mount, not an
// always-mounted capture surface - see that document's section 2.2.
// "chat" (GRADING-CHAT wave 1, docs/grading-chat-architecture.md section 7):
// a sixth, genuinely distinct Grading surface - a continuous chat-styled
// submission stream, not a fill of "run". Always-mounted like
// "recording"/"snapshots" (it holds an in-flight continuous run), not a
// plain conditional like "drafts" - see page.tsx's mount comment.
export type GradingView = "run" | "repos" | "recording" | "snapshots" | "drafts" | "chat";

// The Presentations sub-tab's own inner selection (PRES-2 S6.7,
// RES-S6-A/docs/pres-2-s6-plan.md section 0.1): which of its two children is
// showing. The owner's "NEW Slide Deck Creation tab" for the 13-stage
// pipeline lands as a SECOND inner-nav child under the existing
// `presentations` Manual view rather than replacing the shipped thin
// one-shot flow - "slide-deck" is that shipped thin flow
// (`presentations-slide-deck`, unchanged), "pipeline" is the new stage-gated
// surface (`presentations-pipeline`). Same shape as GradingView above.
export type PresentationsView = "slide-deck" | "pipeline";

const PRESENTATIONS_VIEW_PRESENCE: Record<PresentationsView, true> = {
  "slide-deck": true,
  pipeline: true,
};
export const PRESENTATIONS_VIEWS: readonly PresentationsView[] = Object.keys(
  PRESENTATIONS_VIEW_PRESENCE
) as PresentationsView[];

const PRESENTATIONS_VIEW_SET: ReadonlySet<string> = new Set(PRESENTATIONS_VIEWS);
export function isPresentationsView(value: unknown): value is PresentationsView {
  return typeof value === "string" && PRESENTATIONS_VIEW_SET.has(value);
}

const GRADING_VIEW_PRESENCE: Record<GradingView, true> = {
  run: true,
  repos: true,
  recording: true,
  snapshots: true,
  drafts: true,
  chat: true,
};
export const GRADING_VIEWS: readonly GradingView[] = Object.keys(GRADING_VIEW_PRESENCE) as GradingView[];

const GRADING_VIEW_SET: ReadonlySet<string> = new Set(GRADING_VIEWS);
export function isGradingView(value: unknown): value is GradingView {
  return typeof value === "string" && GRADING_VIEW_SET.has(value);
}

// Compile-time exhaustiveness check: ensure all non-version-control ContentView members are present
const LMS_VIEW_PRESENCE: Record<Exclude<ContentView, "version-control">, true> = {
  modules: true,
  assignments: true,
  quizzes: true,
  pages: true,
  files: true,
  announcements: true,
  inbox: true,
};

export const LMS_VIEWS: readonly (Exclude<ContentView, "version-control">)[] = Object.keys(
  LMS_VIEW_PRESENCE
) as (Exclude<ContentView, "version-control">)[];

export const destinations: DestinationGroup[] = [
  {
    name: "Build",
    destinations: [
      { id: "build-new", label: "New Build", description: "Create a new course from scratch" },
      { id: "build-prebuilt", label: "Pre Built", description: "Start from a prebuilt template" },
    ],
  },
  {
    name: "LMS",
    destinations: [
      { id: "lms-modules", label: "Modules", description: "Organize course content into modules" },
      { id: "lms-assignments", label: "Assignments", description: "List and bulk-manage every assignment in the course" },
      { id: "lms-quizzes", label: "Quizzes", description: "List and bulk-manage every quiz in the course" },
      { id: "lms-pages", label: "Pages", description: "Create and manage course pages" },
      { id: "lms-files", label: "Files", description: "Upload and organize course files" },
      { id: "lms-announcements", label: "Announcements", description: "Post course announcements" },
      { id: "lms-inbox", label: "Inbox", description: "View course messages" },
    ],
  },
  {
    name: null,
    destinations: [
      { id: "version-control", label: "Version Control", description: "Manage course repositories and pull requests" },
    ],
  },
  {
    name: null,
    destinations: [
      { id: "recording", label: "Recording", description: "Record and manage course content" },
    ],
  },
  {
    name: null,
    destinations: [
      { id: "ppt-design", label: "PowerPoint Design", description: "Create presentation slides" },
    ],
  },
  {
    name: null,
    destinations: [
      { id: "artifact-design", label: "Artifact Templates", description: "Build reusable assignment and test templates" },
    ],
  },
  {
    name: "Presentations",
    destinations: [
      { id: "presentations-slide-deck", label: "Slide Deck Creation", description: "Generate a lecture outline, activity ideas, and a slide deck from pasted context" },
      { id: "presentations-pipeline", label: "Slide Deck Pipeline", description: "Build a deck through the full 13-stage pipeline, stage by stage, with editable intermediates and a run-to-end option" },
    ],
  },
  {
    name: "Grading",
    destinations: [
      { id: "grading-run", label: "Submissions", description: "Grade student submissions and post results to Canvas" },
      { id: "grading-repos", label: "Repo Grades", description: "Grade student GitHub repos and post the results to Canvas" },
      { id: "grading-recording", label: "Grading (from a recording)", description: "Grade submissions by narrating over a screen recording" },
      { id: "grading-snapshots", label: "Grading (from screenshots)", description: "Grade submissions from screenshots of student work" },
      { id: "grading-drafts", label: "Drafted Grades", description: "Review and post grades saved as drafts" },
      { id: "grading-chat", label: "Chat", description: "Grade a continuous stream of submissions in a chat-style surface" },
    ],
  },
];

export function getDestinationById(id: string): Destination | undefined {
  for (const group of destinations) {
    const found = group.destinations.find((d) => d.id === id);
    if (found) return found;
  }
  return undefined;
}

// The seven Manual views, in display order.
//
// This used to be "row 1 of the Manual subnav" - its own rail, sitting below a
// Manual/Workflows section switch. D26 flattened that away: these seven are
// now the first seven chips of the Tools tab's single rail, followed by the
// three Workflows views, built from this very list by
// components/tabs/tab-rails.ts. The list itself did not change - the order it
// declares is still the order the chips appear in, and "manualView" is still
// the param each one writes.
//
// "grading" sits where "repo-grades" used to (GRAD-SUBTAB wave 1): the
// Grading sub-tab absorbs both the LMS "Grading" destination and the
// standalone Repo Grades subtab into one container with its own inner
// navigation (docs/tools-grading-subtab-architecture.md section 2).
export const MANUAL_VIEW_ORDER: ManualViewType[] = [
  "course-planning",
  "content",
  "version-control",
  "recording",
  "ppt-design",
  "artifact-design",
  "presentations",
  "grading",
];

export const MANUAL_VIEW_LABELS: Record<ManualViewType, string> = {
  "course-planning": "Build Courses",
  content: "LMS",
  "version-control": "Version Control",
  recording: "Recording",
  "ppt-design": "PowerPoint Design",
  "artifact-design": "Artifact Templates",
  presentations: "Presentations",
  grading: "Grading",
};

// Single source of truth for "is this a valid persisted/restored Manual
// subtab value". Built FROM MANUAL_VIEW_ORDER rather than restating the
// members, so a value added to the order list is automatically accepted here
// too - no second hand-maintained list to fall out of sync (that drift is
// exactly how "artifact-design" went missing from page.tsx's saved-view
// restore guard after being added to ManualViewType).
const MANUAL_VIEW_TYPE_SET: ReadonlySet<string> = new Set(MANUAL_VIEW_ORDER);

export function isManualViewType(value: unknown): value is ManualViewType {
  return typeof value === "string" && MANUAL_VIEW_TYPE_SET.has(value);
}

// The inner-nav views: the subset of ManualViewType that has a second row of
// destinations below its rail chip. ONE table drives both the destinations a
// view has and the accessible name announced for them, so a view with inner
// destinations and a view with an accessible name are the same set BY
// CONSTRUCTION - there is no second list either reader could fall out of sync
// with (docs/tools-grading-subtab-architecture.md section 6.1).
type InnerNavViewType = Extract<ManualViewType, "course-planning" | "content" | "grading" | "presentations">;

const INNER_NAV: Record<InnerNavViewType, { groupName: string; ariaLabel: string }> = {
  "course-planning": { groupName: "Build", ariaLabel: "Course build modes" },
  content: { groupName: "LMS", ariaLabel: "LMS views" },
  grading: { groupName: "Grading", ariaLabel: "Grading tools" },
  presentations: { groupName: "Presentations", ariaLabel: "Presentations views" },
};

// The active Manual view's inner destinations, or null when that view has no
// inner views (Version Control, Recording, PowerPoint Design, and Artifact
// Templates are each a single destination with nothing to switch between).
//
// This is the level BELOW a rail chip and D26 deliberately kept it: it is
// where a chip leads, not a second way to choose one. It is the only row
// ManualRail.tsx still renders.
//
// SIGNATURE UNCHANGED, deliberately: existing call sites in
// manual-rail.test.ts use `getInnerDestinations(x)?.map(...)` and
// `.toBeNull()`, and changing the return shape would churn all of them for no
// safety gain.
export function getInnerDestinations(manualView: ManualViewType): Destination[] | null {
  const entry = (INNER_NAV as Record<string, { groupName: string; ariaLabel: string }>)[manualView];
  if (!entry) return null;
  return destinations.find((g) => g.name === entry.groupName)?.destinations ?? null;
}

// The accessible name for the inner nav's tablist, read from the SAME table
// getInnerDestinations reads - see that function's comment. Replaces
// ManualRail.tsx's own hand-written ternary, which could (and did) fall out
// of sync with the set of views that actually have inner destinations.
export function getInnerNavAriaLabel(manualView: ManualViewType): string | null {
  const entry = (INNER_NAV as Record<string, { groupName: string; ariaLabel: string }>)[manualView];
  return entry ? entry.ariaLabel : null;
}

export function getActiveDestinationId(
  manualView: ManualViewType,
  buildView: BuildViewType,
  contentView: ContentView,
  gradingView: GradingView,
  presentationsView: PresentationsView = "slide-deck",
): string {
  if (manualView === "course-planning") {
    return buildView === "new" ? "build-new" : "build-prebuilt";
  } else if (manualView === "content") {
    return `lms-${contentView}`;
  } else if (manualView === "version-control") {
    return "version-control";
  } else if (manualView === "recording") {
    return "recording";
  } else if (manualView === "ppt-design") {
    return "ppt-design";
  } else if (manualView === "artifact-design") {
    return "artifact-design";
  } else if (manualView === "presentations") {
    return presentationsView === "pipeline" ? "presentations-pipeline" : "presentations-slide-deck";
  } else if (manualView === "grading") {
    return `grading-${gradingView}`;
  }
  return "build-new";
}

// A retired grading pointer's target: the place a pointer this consolidation
// retired now means. Modelled on RETIRED_TAB_DESTINATIONS
// (tabs/tab-sections.ts) - an alias is a REDIRECT, not a synonym: the
// canonical value is written back, never left in its legacy shape.
export interface GradingPointerTarget {
  manualView: Extract<ManualViewType, "grading">;
  gradingView: GradingView;
}

// Every pointer at a grading surface this consolidation retires, with the
// place it now means. Keyed by the RAW stored/URL value, because that is the
// only thing an old link or an old localStorage entry carries.
export const RETIRED_GRADING_POINTERS: Record<string, GradingPointerTarget> = {
  // ta-content-view = "grading" (paired with a stored/URL manualView of
  // "content"), and ?manualView=content&contentView=grading.
  "content-view:grading": { manualView: "grading", gradingView: "run" },
  // The rail destination id, for a persisted or hand-typed destination.
  "lms-grading": { manualView: "grading", gradingView: "run" },
  // ta-manual-view = "repo-grades", and ?manualView=repo-grades.
  "repo-grades": { manualView: "grading", gradingView: "repos" },
  // ta-active-tab = "grading", the pre-merge top-level tab value still
  // handled by useAppNavigation.ts's manualView initializer.
  "active-tab:grading": { manualView: "grading", gradingView: "run" },
  // Drafts > Grades (workflowsView=drafts + draftsView=grades) is now Tools >
  // Grading > Drafted Grades (GRAD-SUBTAB wave 3). Unlike every pointer above,
  // its SOURCE sits in the workflows family (toolsSection="workflows") while
  // its TARGET is in the manual family - every read path that resolves this
  // pointer must also force toolsSection to "manual" itself (this target
  // shape carries no toolsSection field, since every OTHER pointer already
  // originates in the manual family and needs no override); see
  // docs/tools-grading-subtab-wave3-architecture.md section 3.3.
  "drafts-view:grades": { manualView: "grading", gradingView: "drafts" },
};

export function resolveStateFromDestinationId(
  id: string,
  currentManualView: ManualViewType,
  currentBuildView: BuildViewType,
  currentContentView: ContentView,
  currentGradingView: GradingView,
  currentPresentationsView: PresentationsView = "slide-deck",
): {
  manualView: ManualViewType;
  buildView: BuildViewType;
  contentView: ContentView;
  gradingView: GradingView;
  presentationsView: PresentationsView;
} {
  const alias = RETIRED_GRADING_POINTERS[id];
  if (alias) {
    return {
      manualView: alias.manualView,
      buildView: currentBuildView,
      contentView: currentContentView,
      gradingView: alias.gradingView,
      presentationsView: currentPresentationsView,
    };
  }

  const manualView: ManualViewType = (() => {
    if (id.startsWith("build-")) return "course-planning";
    if (id.startsWith("lms-")) return "content";
    if (id === "version-control") return "version-control";
    if (id === "recording") return "recording";
    if (id === "ppt-design") return "ppt-design";
    if (id === "artifact-design") return "artifact-design";
    if (id.startsWith("presentations-")) return "presentations";
    if (id.startsWith("grading-")) return "grading";
    return currentManualView;
  })();

  const buildView: BuildViewType = (() => {
    if (id === "build-new") return "new";
    if (id === "build-prebuilt") return "prebuilt";
    return currentBuildView;
  })();

  const contentView: ContentView = (() => {
    if (id === "lms-modules") return "modules";
    if (id === "lms-assignments") return "assignments";
    if (id === "lms-quizzes") return "quizzes";
    if (id === "lms-pages") return "pages";
    if (id === "lms-files") return "files";
    if (id === "lms-announcements") return "announcements";
    if (id === "lms-inbox") return "inbox";
    return currentContentView;
  })();

  const gradingView: GradingView = (() => {
    if (id === "grading-run") return "run";
    if (id === "grading-repos") return "repos";
    if (id === "grading-recording") return "recording";
    if (id === "grading-snapshots") return "snapshots";
    if (id === "grading-drafts") return "drafts";
    if (id === "grading-chat") return "chat";
    return currentGradingView;
  })();

  const presentationsView: PresentationsView = (() => {
    if (id === "presentations-pipeline") return "pipeline";
    if (id === "presentations-slide-deck") return "slide-deck";
    return currentPresentationsView;
  })();

  return { manualView, buildView, contentView, gradingView, presentationsView };
}

export function validateLmsViewsCompleteness(): string[] {
  const errors: string[] = [];
  const destinationsInRail = destinations
    .flatMap((g) => g.destinations)
    .filter((d) => d.id.startsWith("lms-"))
    .map((d) => d.id.split("-")[1]);

  for (const view of LMS_VIEWS) {
    if (!destinationsInRail.includes(view)) {
      errors.push(`LMS view "${view}" is missing from the rail destinations`);
    }
  }

  for (const id of destinationsInRail) {
    if (!LMS_VIEWS.includes(id as Exclude<ContentView, "version-control">)) {
      errors.push(`Rail destination "lms-${id}" does not correspond to a valid LMS view`);
    }
  }

  return errors;
}
