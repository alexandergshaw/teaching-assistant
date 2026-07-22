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

export type ManualViewType = "course-planning" | "content" | "version-control" | "recording" | "ppt-design";
export type BuildViewType = "new" | "prebuilt";

// Compile-time exhaustiveness check: ensure all non-version-control ContentView members are present
const LMS_VIEW_PRESENCE: Record<Exclude<ContentView, "version-control">, true> = {
  modules: true,
  pages: true,
  files: true,
  grading: true,
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
      { id: "lms-pages", label: "Pages", description: "Create and manage course pages" },
      { id: "lms-files", label: "Files", description: "Upload and organize course files" },
      { id: "lms-grading", label: "Grading", description: "View and manage student submissions" },
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
];

export function getDestinationById(id: string): Destination | undefined {
  for (const group of destinations) {
    const found = group.destinations.find((d) => d.id === id);
    if (found) return found;
  }
  return undefined;
}

// Row 1 of the Manual subnav: one chip per top-level subtab, in display order.
export const MANUAL_VIEW_ORDER: ManualViewType[] = [
  "course-planning",
  "content",
  "version-control",
  "recording",
  "ppt-design",
];

export const MANUAL_VIEW_LABELS: Record<ManualViewType, string> = {
  "course-planning": "Build Courses",
  content: "LMS",
  "version-control": "Version Control",
  recording: "Recording",
  "ppt-design": "PowerPoint Design",
};

// Row 2 of the Manual subnav: the active subtab's inner destinations, or null
// when that subtab has no inner views (Version Control, Recording, and
// PowerPoint Design are each a single destination with nothing to switch between).
export function getInnerDestinations(manualView: ManualViewType): Destination[] | null {
  if (manualView === "course-planning") {
    return destinations.find((g) => g.name === "Build")?.destinations ?? null;
  }
  if (manualView === "content") {
    return destinations.find((g) => g.name === "LMS")?.destinations ?? null;
  }
  return null;
}

export function getActiveDestinationId(
  manualView: ManualViewType,
  buildView: BuildViewType,
  contentView: ContentView,
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
  }
  return "build-new";
}

export function resolveStateFromDestinationId(
  id: string,
  currentManualView: ManualViewType,
  currentBuildView: BuildViewType,
  currentContentView: ContentView,
): { manualView: ManualViewType; buildView: BuildViewType; contentView: ContentView } {
  const manualView: ManualViewType = (() => {
    if (id.startsWith("build-")) return "course-planning";
    if (id.startsWith("lms-")) return "content";
    if (id === "version-control") return "version-control";
    if (id === "recording") return "recording";
    if (id === "ppt-design") return "ppt-design";
    return currentManualView;
  })();

  const buildView: BuildViewType = (() => {
    if (id === "build-new") return "new";
    if (id === "build-prebuilt") return "prebuilt";
    return currentBuildView;
  })();

  const contentView: ContentView = (() => {
    if (id === "lms-modules") return "modules";
    if (id === "lms-pages") return "pages";
    if (id === "lms-files") return "files";
    if (id === "lms-grading") return "grading";
    if (id === "lms-announcements") return "announcements";
    if (id === "lms-inbox") return "inbox";
    return currentContentView;
  })();

  return { manualView, buildView, contentView };
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
