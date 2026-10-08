"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VIEW_KEY, type ContentView } from "../content-tab/constants";
import { isManualViewType, type AnnouncementsView, type GradingView, type PresentationsView } from "../manual/manual-rail";
import { useKbInstitutionSelection, KB_DISCARD_MESSAGE } from "../knowledge/knowledge-helpers";
import {
  type ActiveTab,
  type CoursesSection,
  type ToolsSection,
  type LibrarySection,
  type WorkflowsView,
  type TasksView,
  isCoursesSection,
  isToolsSection,
  isLibrarySection,
  normalizeManualView,
  normalizeWorkflowsView,
  normalizeBuildView,
  normalizeContentView,
  normalizeGradingView,
  normalizePresentationsView,
  normalizeAnnouncementsView,
  normalizeTasksView,
  normalizeKbInstitution,
  normalizeKbPageId,
  parseUrlState,
  buildUrlSearch,
  resolveTabDestination,
  resolveGradingPointer,
} from "../../url-state";
import { DEFAULT_DESTINATION, type TabDestination } from "../tabs/tab-sections";
import { legacyPptDesignView } from "../../../lib/ppt-view-migration";

// ActiveTab and WorkflowsView live in ../../url-state since that module is
// also the single source of truth for validating/normalizing them against the
// URL - see the Back/Forward history feature. DraftsView was retired entirely
// in GRAD-SUBTAB wave 3 (DECISION 19, E-full): Drafts renders MessageDraftsTab
// directly now, with no inner selector left to validate.
// ManualViewType/BuildViewType have their own canonical home in manual-rail.ts;
// the local aliases below just keep the existing state-variable naming.
// The Manual tab groups Build Courses, Integrations, and Recording as subtabs.
export type ManualView =
  | "course-planning"
  | "content"
  | "version-control"
  | "recording"
  | "artifact-design"
  | "presentations"
  | "grading"
  | "announcements";
const MANUAL_VIEW_KEY = "ta-manual-view";
// The Build Courses tab hosts both flows: "new" (New Build) and "prebuilt" (Pre Built).
export type BuildView = "new" | "prebuilt";
const BUILD_VIEW_KEY = "ta-build-view";
// The Grading sub-tab's own inner selection (GRAD-SUBTAB wave 1).
const GRADING_VIEW_KEY = "ta-grading-view";
// The Presentations sub-tab's own inner selection (PRES-2 S6.7): which of its
// two children - the shipped thin "Slide Deck Creation" flow or the new
// stage-gated pipeline - is showing.
const PRESENTATIONS_VIEW_KEY = "ta-presentations-view";
const ANNOUNCEMENTS_VIEW_KEY = "ta-announcements-view";
// The Workflows tab groups Workflows, Automations, and Drafts as subtabs.
const WORKFLOWS_VIEW_KEY = "ta-workflows-view";
// The Tasks tab groups Term and Recurring as subtabs.
const TASKS_VIEW_KEY = "ta-tasks-view";
// Which half of each merged top-level tab is showing (D25). New keys, and
// they follow the same "ta-" convention and the same "persist every control
// so a reload lands where the user left off" rule as every key above.
const COURSES_SECTION_KEY = "ta-courses-section";
const TOOLS_SECTION_KEY = "ta-tools-section";
const LIBRARY_SECTION_KEY = "ta-library-section";

/**
 * Resolves the whole starting location once, from the URL when it names a
 * tab and from localStorage otherwise, so every useState initializer below
 * reads the SAME answer instead of re-deriving it from a raw param.
 *
 * That matters more than it looks. A retired tab value carries a section with
 * it - "?tab=tasks" means Courses with its Tasks section showing, and a
 * stored "ta-active-tab" of "knowledge" (written by every build before the
 * merge, so every returning user has one) means Library with its Knowledge
 * section. An initializer that compared the raw param against a literal
 * (`params.get("tab") === "manual"`, as each of these did before the merge)
 * would see "workflows" and conclude "not my branch", silently dropping the
 * user's sub-view. Comparing against the RESOLVED destination is what keeps
 * a legacy link landing on the screen it names.
 *
 * Only called from lazy initializers, so it runs once per state, never on a
 * re-render, and never on the server (each caller guards on `window`).
 */
function readNavSource(): { params: URLSearchParams; urlHasTab: boolean; destination: TabDestination } {
  const params = new URLSearchParams(window.location.search);
  const urlTab = params.get("tab");
  // The URL wins over localStorage when it names a tab (AC3) - a shared link,
  // a bookmark, or a reload after navigating.
  const source = urlTab !== null ? urlTab : localStorage.getItem("ta-active-tab");
  return { params, urlHasTab: urlTab !== null, destination: resolveTabDestination(source) };
}

/**
 * Owns every piece of "where in the app am I" state for the Home route: the
 * active top-level tab, each tab's sub-view, the Knowledge tab's
 * (institution, page) selection, and the two-way binding between all of that
 * and the URL (address-bar sync plus Back/Forward restore).
 *
 * Extracted out of page.tsx as one unit rather than split further because
 * these pieces are not independent: each sub-view initializer reads the tab
 * the URL/localStorage chain has already resolved above it, the URL-sync
 * effect depends on all of them at once, and the popstate handler writes all
 * of them back. Anything that reads or writes the URL belongs here; anything
 * that renders belongs in page.tsx.
 */
export function useAppNavigation() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(() => {
    if (typeof window === "undefined") return "manual";
    // resolveTabDestination is the single validator shared by the URL and
    // localStorage paths, so an unknown/malformed value in either falls back
    // to the same "manual" default rather than a second hand-copied check -
    // and a RETIRED value ("tasks"/"workflows"/"knowledge", still sitting in
    // the localStorage of every user who was here before the merge) resolves
    // to its new home instead of silently bouncing to that default.
    return readNavSource().destination.tab;
  });
  // Which half of each merged tab is showing. Resolution order, and it is the
  // same for all three: an explicit VALID section param when the URL named a
  // tab; otherwise the destination the tab value itself implies (this is the
  // branch a legacy "?tab=knowledge" or a stored "ta-active-tab=workflows"
  // takes); otherwise the persisted section key; otherwise the default. The
  // persisted key is consulted only when the resolved tab value was NOT a
  // retired alias - an alias names its section explicitly, and letting a
  // stored value override it would throw away the one thing the old link
  // actually said.
  const [coursesSection, setCoursesSection] = useState<CoursesSection>(() => {
    if (typeof window === "undefined") return "courses";
    const { params, urlHasTab, destination } = readNavSource();
    if (urlHasTab) {
      const raw = params.get("coursesSection");
      return isCoursesSection(raw) ? raw : destination.coursesSection;
    }
    if (destination.coursesSection !== DEFAULT_DESTINATION.coursesSection) return destination.coursesSection;
    const saved = localStorage.getItem(COURSES_SECTION_KEY);
    return isCoursesSection(saved) ? saved : destination.coursesSection;
  });
  const [toolsSection, setToolsSection] = useState<ToolsSection>(() => {
    if (typeof window === "undefined") return "manual";
    const { params, urlHasTab, destination } = readNavSource();
    if (urlHasTab) {
      // GRAD-SUBTAB wave 3 (the toolsSection crossing, section 3.3): the
      // legacy Drafts > Grades URL still carries an explicit
      // toolsSection=workflows param, but a resolved grading pointer's target
      // is in the manual family - the pointer must win over that explicit
      // param, mirroring parseUrlState's own override in url-state.ts.
      const gradingPointer = resolveGradingPointer(
        params.get("manualView"),
        params.get("contentView"),
        params.get("workflowsView"),
        params.get("draftsView")
      );
      if (gradingPointer) return "manual";
      const raw = params.get("toolsSection");
      return isToolsSection(raw) ? raw : destination.toolsSection;
    }
    if (destination.toolsSection !== DEFAULT_DESTINATION.toolsSection) return destination.toolsSection;
    // GRAD-SUBTAB wave 3 BLOCKER 1 fix (docs/tools-grading-subtab-wave3-
    // architecture-check.md): a returning user who last sat on Drafts >
    // Grades carries this exact stored combination. That pointer's target is
    // now in the MANUAL family (Tools > Grading > Drafted Grades), so
    // toolsSection itself - the discriminant page.tsx actually renders on -
    // must be forced here too, symmetric to the manualView/gradingView
    // localStorage migrations below. The raw "ta-drafts-view" string stays a
    // literal on purpose: DRAFTS_VIEW_KEY is retired along with draftsView
    // itself (E-full), but a value stored under that key by an old build is
    // still exactly this string.
    if (
      localStorage.getItem(TOOLS_SECTION_KEY) === "workflows" &&
      localStorage.getItem(WORKFLOWS_VIEW_KEY) === "drafts" &&
      localStorage.getItem("ta-drafts-view") === "grades"
    ) {
      return "manual";
    }
    const saved = localStorage.getItem(TOOLS_SECTION_KEY);
    return isToolsSection(saved) ? saved : destination.toolsSection;
  });
  const [librarySection, setLibrarySection] = useState<LibrarySection>(() => {
    if (typeof window === "undefined") return "files";
    const { params, urlHasTab, destination } = readNavSource();
    if (urlHasTab) {
      const raw = params.get("librarySection");
      return isLibrarySection(raw) ? raw : destination.librarySection;
    }
    if (destination.librarySection !== DEFAULT_DESTINATION.librarySection) return destination.librarySection;
    const saved = localStorage.getItem(LIBRARY_SECTION_KEY);
    return isLibrarySection(saved) ? saved : destination.librarySection;
  });
  const [manualView, setManualView] = useState<ManualView>(() => {
    if (typeof window === "undefined") return "course-planning";
    // A user who was viewing Version Control (inside the old Integrations, tracked
    // by VIEW_KEY) lands on the new standalone Version Control subtab; reset the
    // LMS content view so ContentTab does not open on a now-removed VC subtab.
    if (localStorage.getItem(VIEW_KEY) === "version-control") {
      localStorage.setItem(VIEW_KEY, "modules");
      return "version-control";
    }
    // GRAD-SUBTAB wave 1 (docs/tools-grading-subtab-architecture.md section
    // 5.5, the "content-view:grading" retired pointer): a user whose last LMS
    // content view was Grading (VIEW_KEY === "grading", now retired from
    // ContentView - see content-tab/constants.ts) lands on the new Grading
    // sub-tab instead of being silently dropped to Modules within LMS.
    // Mirrors the version-control migration immediately above.
    if (localStorage.getItem(VIEW_KEY) === "grading") {
      localStorage.setItem(VIEW_KEY, "modules");
      return "grading";
    }
    // The URL wins over localStorage, but only when it actually names the
    // Tools tab's Manual section - a manualView param is meaningless (and
    // ignored) on a "?tab=courses" URL, and equally so on a "?tab=manual&
    // toolsSection=workflows" one. Reuses isManualViewType via
    // normalizeManualView, the same validator the MANUAL_VIEW_KEY branch
    // below already applies.
    const { params: urlParams, urlHasTab, destination } = readNavSource();
    if (urlHasTab && destination.tab === "manual" && toolsSection === "manual") {
      // GRAD-SUBTAB wave 1 fix: a bookmark that predates this consolidation
      // carries the OLD raw pointer value ("?manualView=repo-grades", or
      // "?manualView=content&contentView=grading") rather than "grading",
      // so normalizeManualView alone rejects it and silently falls back to
      // "course-planning"/"modules" (isManualViewType/normalizeContentView
      // do not know this alias). parseUrlState already resolves this exact
      // alias for the popstate/Back-Forward path (url-state.ts); this mirrors
      // it via the shared resolveGradingPointer helper so the INITIAL load
      // from a raw URL gets the same redirect instead of bypassing it.
      const gradingPointer = resolveGradingPointer(
        urlParams.get("manualView"),
        urlParams.get("contentView"),
        urlParams.get("workflowsView"),
        urlParams.get("draftsView")
      );
      if (gradingPointer) return gradingPointer.manualView;
      // PPT-DESIGN-INTO-PRESENTATIONS (channel 3, URL): the retired top-level
      // "?manualView=ppt-design" now means Presentations > PowerPoint Design.
      const pptRedirect = legacyPptDesignView(urlParams.get("manualView"));
      if (pptRedirect) return pptRedirect.manualView;
      return normalizeManualView(urlParams.get("manualView"));
    }
    // GRAD-SUBTAB wave 3 (P3(iii)): a returning user who last sat on
    // Drafts > Grades - symmetric to the toolsSection migration above, and to
    // the gradingView migration below. That stored combination now means the
    // Grading sub-tab's Drafted Grades inner view, not any ta-manual-view
    // value, so it is checked before the ta-manual-view checks below.
    if (
      localStorage.getItem(TOOLS_SECTION_KEY) === "workflows" &&
      localStorage.getItem(WORKFLOWS_VIEW_KEY) === "drafts" &&
      localStorage.getItem("ta-drafts-view") === "grades"
    ) {
      return "grading";
    }
    const savedManual = localStorage.getItem(MANUAL_VIEW_KEY);
    // GRAD-SUBTAB wave 1 (the "repo-grades" retired pointer, M10): a stored
    // ta-manual-view of "repo-grades" - the standalone subtab this
    // consolidation absorbed - is no longer a member of ManualViewType, so
    // isManualViewType would reject it and fall through to the ta-active-tab
    // checks below, silently bouncing the user to Build Courses. Checked
    // before isManualViewType for exactly that reason.
    if (savedManual === "repo-grades") {
      return "grading";
    }
    // PPT-DESIGN-INTO-PRESENTATIONS (channel 3, stored): ta-manual-view =
    // "ppt-design" is no longer a ManualViewType; same ordering reason as above.
    const pptStored = legacyPptDesignView(savedManual);
    if (pptStored) return pptStored.manualView;
    // Validated against manual-rail.ts's authoritative MANUAL_VIEW_ORDER
    // (via isManualViewType) rather than a hand-restated list of literals,
    // so a subtab added to that order is accepted here automatically. A
    // hand-restated list is exactly what let "artifact-design" go missing
    // from this guard after it was added to ManualViewType.
    if (isManualViewType(savedManual)) {
      return savedManual;
    }
    const saved = localStorage.getItem("ta-active-tab");
    if (saved === "recording") return "recording";
    if (saved === "version-control") return "version-control";
    const pptActiveTab = legacyPptDesignView(saved);
    if (pptActiveTab) return pptActiveTab.manualView;
    // GRAD-SUBTAB wave 1 (the "active-tab:grading" retired pointer): this used
    // to land on "content" (the LMS Grading destination); it now lands on the
    // Grading sub-tab directly.
    if (saved === "grading") return "grading";
    if (saved === "content" || saved === "canvas") return "content";
    return "course-planning";
  });
  const [buildView, setBuildViewState] = useState<BuildView>(() => {
    if (typeof window === "undefined") return "prebuilt";
    // The URL wins over localStorage, but only when it actually named Tools >
    // Manual > Build Courses as the branch being restored into - a buildView
    // param is meaningless outside that branch. `toolsSection` and
    // `manualView` above have already resolved the true branch (URL-derived
    // or localStorage-derived), so checking them here is enough to keep the
    // whole chain consistent without re-deriving either from the URL a second
    // time.
    const { params: urlParams, urlHasTab, destination } = readNavSource();
    if (urlHasTab && destination.tab === "manual" && toolsSection === "manual" && manualView === "course-planning") {
      return normalizeBuildView(urlParams.get("buildView"));
    }
    // Users who last used the old Pre Built Courses tab land on that subtab.
    if (localStorage.getItem("ta-active-tab") === "lesson-planning") return "prebuilt";
    return localStorage.getItem(BUILD_VIEW_KEY) === "new" ? "new" : "prebuilt";
  });
  const setBuildView = (v: BuildView) => {
    setBuildViewState(v);
    if (typeof window !== "undefined") localStorage.setItem(BUILD_VIEW_KEY, v);
  };
  const [contentView, setContentViewState] = useState<ContentView>(() => {
    if (typeof window === "undefined") return "modules";
    // The URL wins over localStorage, but only when it actually named Tools >
    // Manual > LMS as the branch being restored into - see the matching
    // comment on buildView above.
    const { params: urlParams, urlHasTab, destination } = readNavSource();
    if (urlHasTab && destination.tab === "manual" && toolsSection === "manual" && manualView === "content") {
      return normalizeContentView(urlParams.get("contentView"));
    }
    // Validated through normalizeContentView - the SAME validator the URL
    // branch two lines above already calls, and itself derived from
    // manual-rail's LMS_VIEWS (see url-state.ts's isContentView) rather than
    // a hand-restated list of literals. A hand-restated list here is exactly
    // how this bug class has already happened once (manual-rail.ts's own
    // isManualViewType/MANUAL_VIEW_ORDER comment tells the identical story
    // for the sibling manualView guard above, after "artifact-design" was
    // added to ManualViewType but not to this kind of list): a user whose
    // last LMS view was Assignments would otherwise be silently bounced to
    // Modules on their next visit, with no error and nothing in the URL to
    // reveal why. Calling normalizeContentView means a future ContentView
    // member added to LMS_VIEWS needs no change here at all - it is covered
    // automatically, the same way MANUAL_VIEW_ORDER-derived isManualViewType
    // now covers manualView.
    //
    // One deliberate behavior change from the list this replaces:
    // normalizeContentView does not accept "version-control" (LMS_VIEWS
    // excludes it - see its own comment in url-state.ts, "never a state a
    // user navigates into directly"), where the old hand-restated list did.
    // That acceptance was already dead in practice: the manualView
    // initializer above unconditionally rewrites VIEW_KEY away from
    // "version-control" to "modules" before this initializer ever runs (see
    // that block's own migration comment), so by the time this line reads
    // VIEW_KEY it can no longer hold that value on any real path.
    return normalizeContentView(localStorage.getItem(VIEW_KEY));
  });
  const setContentView = (v: ContentView) => {
    setContentViewState(v);
    if (typeof window !== "undefined") localStorage.setItem(VIEW_KEY, v);
  };
  const [workflowsView, setWorkflowsView] = useState<WorkflowsView>(() => {
    if (typeof window === "undefined") return "workflows";
    // The URL wins over localStorage, but only when it actually names the
    // Tools tab's Workflows section - see the matching comment on manualView
    // above. A legacy "?tab=workflows&workflowsView=drafts" link resolves to
    // exactly that branch, which is what keeps the deep link working.
    const { params: urlParams, urlHasTab, destination } = readNavSource();
    if (urlHasTab && destination.tab === "manual" && toolsSection === "workflows") {
      return normalizeWorkflowsView(urlParams.get("workflowsView"));
    }
    // Migrate legacy "grade-drafts" or stored "drafts" to "drafts" view.
    const saved = localStorage.getItem("ta-active-tab");
    if (saved === "grade-drafts" || saved === "drafts") return "drafts";
    return normalizeWorkflowsView(localStorage.getItem(WORKFLOWS_VIEW_KEY));
  });
  const [tasksView, setTasksView] = useState<TasksView>(() => {
    if (typeof window === "undefined") return "term";
    // The URL wins over localStorage, but only when it actually names the
    // Courses tab's Tasks section - see the matching comment on manualView
    // above. A legacy "?tab=tasks&tasksView=recurring" link resolves to
    // exactly that branch, which is what keeps the deep link working.
    const { params: urlParams, urlHasTab, destination } = readNavSource();
    if (urlHasTab && destination.tab === "courses" && coursesSection === "tasks") {
      return normalizeTasksView(urlParams.get("tasksView"));
    }
    return normalizeTasksView(localStorage.getItem(TASKS_VIEW_KEY));
  });
  // The Grading sub-tab's own inner selection (GRAD-SUBTAB wave 1): which of
  // its two surfaces - Submissions or Repo Grades - is showing. Placed after
  // tasksView, deliberately outside the isolated slice
  // topLevelTabs.wiring.test.ts pins between the contentView initializer and
  // `const [workflowsView` (a positional guard on that URL-sync effect's
  // first-sync block, not this one - see this file's own popstate/URL-sync
  // code below for the actual guarded window).
  const [gradingView, setGradingView] = useState<GradingView>(() => {
    if (typeof window === "undefined") return "run";
    // The URL wins over localStorage, but only when it actually named Tools >
    // Manual > Grading as the branch being restored into - see the matching
    // comment on buildView above.
    const { params: urlParams, urlHasTab, destination } = readNavSource();
    if (urlHasTab && destination.tab === "manual" && toolsSection === "manual" && manualView === "grading") {
      // GRAD-SUBTAB wave 1 fix: when the URL named a retired pointer (see the
      // matching comment on the manualView initializer above), the pointer's
      // own target names the inner view too ("repo-grades" means Repo Grades
      // specifically, not the "run" default) - the URL has no "gradingView"
      // param on an old bookmark, so normalizeGradingView(null) alone would
      // land on the wrong inner surface even though manualView itself is now
      // correct.
      const gradingPointer = resolveGradingPointer(
        urlParams.get("manualView"),
        urlParams.get("contentView"),
        urlParams.get("workflowsView"),
        urlParams.get("draftsView")
      );
      if (gradingPointer) return gradingPointer.gradingView;
      return normalizeGradingView(urlParams.get("gradingView"));
    }
    // A stored ta-manual-view of "repo-grades" (retired - see
    // manual-rail.ts's RETIRED_GRADING_POINTERS) means the Repo Grades inner
    // item specifically. Consulted here directly because normalizeGradingView
    // has no way to see the OLD manualView key at all.
    if (localStorage.getItem(MANUAL_VIEW_KEY) === "repo-grades") return "repos";
    // GRAD-SUBTAB wave 3 (P3(iii)): a returning user who last sat on
    // Drafts > Grades - symmetric to the toolsSection/manualView migrations
    // above. That stored combination now means this inner view specifically
    // ("drafts"), not the "run" default normalizeGradingView(null) would
    // otherwise fall back to.
    if (
      localStorage.getItem(TOOLS_SECTION_KEY) === "workflows" &&
      localStorage.getItem(WORKFLOWS_VIEW_KEY) === "drafts" &&
      localStorage.getItem("ta-drafts-view") === "grades"
    ) {
      return "drafts";
    }
    return normalizeGradingView(localStorage.getItem(GRADING_VIEW_KEY));
  });
  // The Presentations sub-tab's own inner selection (PRES-2 S6.7, RES-S6-A):
  // which of its two children is showing. Placed immediately after
  // gradingView, deliberately mirroring that state's own placement rule (see
  // gradingView's comment above): it sits OUTSIDE the isolated slice
  // topLevelTabs.wiring.test.ts pins between the contentView initializer and
  // `const [workflowsView` - and it CHURNS the positional guard this file's
  // own useAppNavigation.test.ts pins between the gradingView initializer and
  // `const [focusCourseId` (docs/pres-2-s6-plan.md section 7's line-shift
  // obligation), which that test file re-pins in this same wave to end at
  // `const [presentationsView` instead, plus a new analogous block for this
  // initializer ending at `const [focusCourseId`. Unlike gradingView, there is
  // no retired pointer to migrate - presentations is a PRES-1 (wave 3)
  // addition with nothing predating it in localStorage - so this initializer
  // is the simpler contentView-style shape (URL branch, then a plain
  // normalize-the-stored-value fallback).
  const [presentationsView, setPresentationsView] = useState<PresentationsView>(() => {
    if (typeof window === "undefined") return "slide-deck";
    // The URL wins over localStorage, but only when it actually named Tools >
    // Manual > Presentations as the branch being restored into - see the
    // matching comment on buildView above.
    const { params: urlParams, urlHasTab, destination } = readNavSource();
    if (urlHasTab && destination.tab === "manual" && toolsSection === "manual" && manualView === "presentations") {
      // PPT-DESIGN-INTO-PRESENTATIONS (channel 4, URL sub-case): a cold-load
      // "?manualView=ppt-design" resolved manualView to "presentations" above,
      // so this branch is taken and the bare presentationsView param is absent;
      // this check must precede the normalize return or it yields "slide-deck".
      if (legacyPptDesignView(urlParams.get("manualView"))) return "ppt-design";
      return normalizePresentationsView(urlParams.get("presentationsView"));
    }
    // Channel 4, stored sub-case: a user last on the old top-level PowerPoint
    // Design has no ta-presentations-view value.
    if (legacyPptDesignView(localStorage.getItem(MANUAL_VIEW_KEY))) return "ppt-design";
    return normalizePresentationsView(localStorage.getItem(PRESENTATIONS_VIEW_KEY));
  });
  // Which course the Courses tab should scroll to and highlight on arrival,
  // or null for "no pending focus". Set two ways: by InSessionBanner's
  // onSelectCourse when the banner is clicked on this route (no navigation
  // needed), and off the "focusCourse" URL param when the click happened on
  // some OTHER route and pushed "/?tab=courses&focusCourse=<id>" instead.
  //
  // Deliberately NOT part of buildUrlSearch's canonical query string: it is a
  // one-shot intent, not a location. Leaving it out means the next URL sync
  // drops it naturally, so a later Back/Forward through this entry does not
  // re-fire a focus the user already saw, and the param cannot go stale
  // against a course that has since been deleted (resolveFocusedCourse in
  // in-session-banner-display.ts is what turns the raw id into a real course,
  // or into null if it names nothing).
  const [focusCourseId, setFocusCourseId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const { params: urlParams, urlHasTab, destination } = readNavSource();
    if (!urlHasTab || destination.tab !== "courses") return null;
    return urlParams.get("focusCourse");
  });
  // The Announcements sub-tab's own inner selection (ANNOUNCEMENTS-TAB A-W1):
  // Post-an-announcement or From-a-walkthrough. Placed after focusCourseId so
  // the positional guards in useAppNavigation.test.ts (presentationsView's
  // initializer ends at `const [focusCourseId`) are not churned. Same shape
  // as presentationsView: URL branch gated on the parent view, then a plain
  // normalize-the-stored-value fallback.
  const [announcementsView, setAnnouncementsView] = useState<AnnouncementsView>(() => {
    if (typeof window === "undefined") return "post";
    const { params: urlParams, urlHasTab, destination } = readNavSource();
    if (urlHasTab && destination.tab === "manual" && toolsSection === "manual" && manualView === "announcements") {
      return normalizeAnnouncementsView(urlParams.get("announcementsView"));
    }
    return normalizeAnnouncementsView(localStorage.getItem(ANNOUNCEMENTS_VIEW_KEY));
  });
  // Knowledge's institution + selected page (AC1-AC3): unlike every other
  // sub-view above, the institution is not a fixed enum - it is dynamic,
  // per-user data (registered institution acronyms) resolved by
  // useKbInstitutionSelection's own URL-vs-localStorage-vs-header fallback
  // chain (see that hook's docstring), so this is the one call site for it -
  // KnowledgeTab.tsx no longer calls it itself. Passing a URL-derived
  // institution only when "?tab=knowledge" was actually present mirrors
  // every buildView/contentView initializer above: a param is only
  // meaningful when it belongs to the branch actually being restored.
  const {
    institutions: kbInstitutions,
    active: kbInstitution,
    setActive: setKbInstitution,
  } = useKbInstitutionSelection(
    // Computed in a lazy initializer, not inline: the hook consumes this only
    // in its own once-only useState initializer, but the argument expression
    // is evaluated on EVERY render of this component, so parsing the query
    // string here would re-run for the life of the session to produce a value
    // nothing reads again. Matches how the kbPageId state below does it.
    useState(() => {
      if (typeof window === "undefined") return null;
      const { params, urlHasTab, destination } = readNavSource();
      return urlHasTab && destination.tab === "files" && librarySection === "knowledge"
        ? normalizeKbInstitution(params.get("kbInstitution"))
        : null;
    })[0]
  );
  // The selected page id, mirrored up from KnowledgeTab (AC1) - unlike
  // kbInstitution above, there is no synchronous localStorage-only
  // resolution possible here: whether a candidate id is actually valid
  // depends on the async page list KnowledgeTab fetches per institution, so
  // KnowledgeTab remains the source of truth for the RESOLVED value and
  // reports it up via onKbPageIdChange; this state exists so the URL-sync
  // effect below has something to read. A bare/foreign-tab load starts this
  // at null - KnowledgeTab's own reconciliation effect resolves the
  // localStorage fallback once its pages finish loading (AC3) and reports
  // the result back up.
  const [kbPageId, setKbPageId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const { params: urlParams, urlHasTab, destination } = readNavSource();
    if (!urlHasTab || destination.tab !== "files" || librarySection !== "knowledge") return null;
    return normalizeKbPageId(urlParams.get("kbPage"));
  });
  // Whether the Knowledge tab currently has an unsaved page edit (AC5) -
  // reported by KnowledgeTab on every change via onKbDirtyChange. A ref, not
  // state: the popstate handler below only ever needs to read the latest
  // value synchronously at the moment a restore is being considered, never
  // to re-render on it.
  const kbDirtyRef = useRef(false);
  const handleKbDirtyChange = useCallback((dirty: boolean) => {
    kbDirtyRef.current = dirty;
  }, []);
  // Guards TopBar's institution-removal flow (Settings dropdown) against
  // silently discarding an unsaved Knowledge tab edit (AC5/AC6 of the
  // "delete institutions" feature) - mirrors the popstate handler's own
  // kbDirtyRef check further below. Only relevant when the acronym being
  // removed is the SAME ONE currently open in the Knowledge tab; removing a
  // different institution can never affect this tab's selection or edit
  // session, so it needs no prompt.
  const guardKbUnsavedEditsForInstitutionRemoval = useCallback(
    (code: string): boolean => {
      if (kbInstitution !== code) return true;
      if (!kbDirtyRef.current) return true;
      return window.confirm(KB_DISCARD_MESSAGE);
    },
    [kbInstitution]
  );
  // A different institution's page list makes the old selected page id
  // meaningless (AC2), so switching institution here also clears it -
  // KnowledgeTab's reconciliation effect then re-derives the new
  // institution's own persisted selection instead of carrying the old one
  // over. A popstate-driven institution restore does NOT go through this -
  // see the popstate handler below, which restores the (institution, page)
  // pair exactly as that history entry recorded it.
  const handleKbActiveChange = (code: string) => {
    setKbInstitution(code);
    setKbPageId(null);
  };

  useEffect(() => {
    localStorage.setItem("ta-active-tab", activeTab);
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(MANUAL_VIEW_KEY, manualView);
  }, [manualView]);

  useEffect(() => {
    localStorage.setItem(WORKFLOWS_VIEW_KEY, workflowsView);
  }, [workflowsView]);

  useEffect(() => {
    localStorage.setItem(TASKS_VIEW_KEY, tasksView);
  }, [tasksView]);

  useEffect(() => {
    localStorage.setItem(GRADING_VIEW_KEY, gradingView);
  }, [gradingView]);

  useEffect(() => {
    localStorage.setItem(PRESENTATIONS_VIEW_KEY, presentationsView);
  }, [presentationsView]);

  useEffect(() => {
    localStorage.setItem(ANNOUNCEMENTS_VIEW_KEY, announcementsView);
  }, [announcementsView]);

  useEffect(() => {
    localStorage.setItem(COURSES_SECTION_KEY, coursesSection);
  }, [coursesSection]);

  useEffect(() => {
    localStorage.setItem(TOOLS_SECTION_KEY, toolsSection);
  }, [toolsSection]);

  useEffect(() => {
    localStorage.setItem(LIBRARY_SECTION_KEY, librarySection);
  }, [librarySection]);

  // lastKnownSearchRef tracks the query string the browser is currently at,
  // as best we know it. It is updated both when we push/replace it
  // ourselves and when a popstate event tells us the browser already moved
  // there on its own; the sync effect below only calls pushState when the
  // freshly-computed URL differs from this, which is what keeps a Back- or
  // Forward-driven state change from immediately pushing the very entry the
  // user just navigated away from (the classic "Back does nothing" bug).
  const lastKnownSearchRef = useRef<string>(
    typeof window !== "undefined" ? window.location.search : ""
  );
  // On a bare load (no "tab" param) the initial tab/sub-view above came from
  // localStorage, so lastKnownSearchRef still holds the tab-less URL. The
  // first sync run needs to stamp the URL with replaceState (no history
  // entry) rather than pushState, so Back from a bare "/" load behaves
  // predictably (AC3).
  //
  // It is ALSO what retires a legacy tab value. D25b: an alias is a redirect,
  // not a synonym - "?tab=knowledge" must converge on the canonical
  // "?tab=files&librarySection=knowledge" rather than staying legacy forever.
  // The test for "did the URL actually name a tab" is therefore not enough on
  // its own: a legacy URL names one, and skipping the write on that basis
  // would leave the old shape in the address bar and in whatever the user
  // re-bookmarks from it. Comparing the freshly-built canonical target
  // against the CURRENT search string covers both cases in one rule and is a
  // no-op when the URL was already canonical - the common case.
  const isFirstUrlSyncRef = useRef(true);

  // The popstate listener below is registered once (mount-only effect, `[]`
  // deps - matching every other history effect in this file) and reads
  // activeTab/kbInstitution/kbPageId inside its closure for the AC5 guard.
  // Every other value that closure captures (setActiveTab, setBuildView,
  // etc.) is a stable setter that never itself reads stale state, so a
  // mount-time closure over it stays correct forever - but activeTab/
  // kbInstitution/kbPageId are plain values, which WOULD go stale under `[]`
  // deps. These refs give the closure an always-current read of them without
  // needing the listener to be torn down and re-added on every change.
  // setKbInstitution needs no ref: useKbInstitutionSelection memoizes it, so
  // it is as stable as a plain useState setter and can be depended on
  // directly.
  const activeTabRef = useRef(activeTab);
  const librarySectionRef = useRef(librarySection);
  const kbInstitutionRef = useRef(kbInstitution);
  const kbPageIdRef = useRef(kbPageId);
  useEffect(() => {
    activeTabRef.current = activeTab;
    librarySectionRef.current = librarySection;
    kbInstitutionRef.current = kbInstitution;
    kbPageIdRef.current = kbPageId;
  }, [activeTab, librarySection, kbInstitution, kbPageId]);

  useEffect(() => {
    const target = buildUrlSearch({
      tab: activeTab,
      coursesSection,
      toolsSection,
      librarySection,
      manualView,
      workflowsView,
      buildView,
      contentView,
      gradingView,
      presentationsView,
      announcementsView,
      tasksView,
      kbInstitution,
      kbPageId,
    });

    if (isFirstUrlSyncRef.current) {
      isFirstUrlSyncRef.current = false;
      // replaceState, never pushState: this is the load itself, not a
      // navigation, so it must not leave a history entry the user can go Back
      // to. Fires whenever the address bar is not already showing the
      // canonical string - a bare "/" load, and a legacy "?tab=tasks" one.
      if (target !== window.location.search) {
        window.history.replaceState(null, "", target);
      }
      lastKnownSearchRef.current = target;
      return;
    }

    // No real navigation happened - e.g. the user reselected the tab they
    // were already on, or this run is the direct result of the popstate
    // handler below (which already updated lastKnownSearchRef before
    // calling setState). Either way, do not push a new entry (AC5).
    if (target === lastKnownSearchRef.current) return;

    window.history.pushState(null, "", target);
    lastKnownSearchRef.current = target;
  }, [
    activeTab,
    coursesSection,
    toolsSection,
    librarySection,
    manualView,
    workflowsView,
    buildView,
    contentView,
    gradingView,
    presentationsView,
    announcementsView,
    tasksView,
    kbInstitution,
    kbPageId,
  ]);

  useEffect(() => {
    const onPopState = () => {
      const parsed = parseUrlState(window.location.search);

      // Knowledge's unsaved-edits guard (AC5): a popstate event means the
      // browser has ALREADY moved the address bar to `parsed`'s URL before
      // this handler runs, so a decline below must push a fresh entry
      // matching what's actually still rendered rather than leave the bar
      // lying about the state. Scoped to restores that both start AND land on
      // the Knowledge tab - the same scope the tab's own confirmDiscard()
      // guards today (switching to a different top-level tab already
      // unmounts KnowledgeTab without confirmation via the plain Tabs
      // onChange handler below, so guarding that path here too would be new,
      // inconsistent behavior rather than closing a gap in existing
      // behavior). Since the merge, "the Knowledge tab" is the Library tab
      // with its Knowledge section showing, so both halves of the test check
      // the pair - checking only the tab would fire the prompt on a Back that
      // lands on Library > Files, where no page is open to lose.
      const onKnowledgeNow = activeTabRef.current === "files" && librarySectionRef.current === "knowledge";
      const restoringToKnowledge = parsed.tab === "files" && parsed.librarySection === "knowledge";
      if (onKnowledgeNow && restoringToKnowledge) {
        const currentKbInstitution = kbInstitutionRef.current;
        const currentKbPageId = kbPageIdRef.current;
        const changingSelection =
          parsed.kbInstitution !== currentKbInstitution || parsed.kbPageId !== currentKbPageId;
        if (changingSelection && kbDirtyRef.current && !window.confirm(KB_DISCARD_MESSAGE)) {
          const actual = buildUrlSearch({ ...parsed, kbInstitution: currentKbInstitution, kbPageId: currentKbPageId });
          lastKnownSearchRef.current = actual;
          window.history.pushState(null, "", actual);
          return;
        }
      }

      // Record the URL this restore lands on BEFORE the state updates below
      // trigger the sync effect above, so that effect sees its target
      // already matches and skips pushing another entry.
      lastKnownSearchRef.current = buildUrlSearch(parsed);
      setActiveTab(parsed.tab);
      // Only apply a sub-view when its parent is the one actually being
      // restored to - a manualView/workflowsView/buildView/contentView value
      // parsed off an unrelated branch's history entry (see url-state.ts)
      // must not reset the sub-view the user had set up the
      // last time they were on that branch. Each level is gated on its own
      // immediate parent, walking the chain one step at a time, so a deep
      // restore sets the whole chain rather than just the leaf. Since the
      // merge that chain is one level longer: tab -> section -> view ->
      // inner view, and the section is gated on the tab exactly as the views
      // are gated on the section.
      if (parsed.tab === "courses") {
        setCoursesSection(parsed.coursesSection);
        if (parsed.coursesSection === "tasks") setTasksView(parsed.tasksView);
      }
      if (parsed.tab === "manual") {
        setToolsSection(parsed.toolsSection);
        if (parsed.toolsSection === "manual") {
          setManualView(parsed.manualView);
          if (parsed.manualView === "course-planning") setBuildView(parsed.buildView);
          if (parsed.manualView === "content") setContentView(parsed.contentView);
          if (parsed.manualView === "grading") setGradingView(parsed.gradingView);
          // PRES-2 S6.7: presentations now has TWO inner destinations
          // ("presentations-slide-deck", "presentations-pipeline"), so which
          // one is showing is restored the same way gradingView is above.
          if (parsed.manualView === "presentations") setPresentationsView(parsed.presentationsView);
          // ANNOUNCEMENTS-TAB A-W1: two inner destinations (post, walkthrough),
          // restored the same way presentationsView is above.
          if (parsed.manualView === "announcements") setAnnouncementsView(parsed.announcementsView);
        }
        if (parsed.toolsSection === "workflows") {
          setWorkflowsView(parsed.workflowsView);
        }
      }
      if (parsed.tab === "files") {
        setLibrarySection(parsed.librarySection);
        if (parsed.librarySection === "knowledge") {
          // A null URL institution (no institutions registered at push-time)
          // means "let the hook keep resolving its own fallback" rather than
          // forcing it to an empty string.
          if (parsed.kbInstitution) setKbInstitution(parsed.kbInstitution);
          setKbPageId(parsed.kbPageId);
        }
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // setKbInstitution is memoized by useKbInstitutionSelection, so listing it
    // keeps this effect mount-only in practice while satisfying the lint rule -
    // which is why it no longer needs a ref of its own.
  }, [setKbInstitution]);

  return {
    activeTab,
    setActiveTab,
    coursesSection,
    setCoursesSection,
    toolsSection,
    setToolsSection,
    librarySection,
    setLibrarySection,
    manualView,
    setManualView,
    buildView,
    setBuildView,
    contentView,
    setContentView,
    gradingView,
    setGradingView,
    presentationsView,
    setPresentationsView,
    announcementsView,
    setAnnouncementsView,
    workflowsView,
    setWorkflowsView,
    tasksView,
    setTasksView,
    focusCourseId,
    setFocusCourseId,
    kbInstitutions,
    kbInstitution,
    kbPageId,
    setKbPageId,
    handleKbActiveChange,
    handleKbDirtyChange,
    guardKbUnsavedEditsForInstitutionRemoval,
  };
}
