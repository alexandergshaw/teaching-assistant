"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VIEW_KEY, type ContentView } from "../content-tab/constants";
import { isManualViewType } from "../manual/manual-rail";
import { useKbInstitutionSelection, KB_DISCARD_MESSAGE } from "../knowledge/knowledge-helpers";
import {
  type ActiveTab,
  type WorkflowsView,
  type DraftsView,
  normalizeActiveTab,
  normalizeManualView,
  normalizeWorkflowsView,
  normalizeBuildView,
  normalizeContentView,
  normalizeDraftsView,
  normalizeKbInstitution,
  normalizeKbPageId,
  parseUrlState,
  buildUrlSearch,
} from "../../url-state";

// ActiveTab, WorkflowsView, and DraftsView live in ../../url-state since that
// module is also the single source of truth for validating/normalizing them
// against the URL - see the Back/Forward history feature.
// ManualViewType/BuildViewType have their own canonical home in manual-rail.ts;
// the local aliases below just keep the existing state-variable naming.
// The Manual tab groups Build Courses, Integrations, and Recording as subtabs.
export type ManualView =
  | "course-planning"
  | "content"
  | "version-control"
  | "recording"
  | "ppt-design"
  | "artifact-design";
const MANUAL_VIEW_KEY = "ta-manual-view";
// The Build Courses tab hosts both flows: "new" (New Build) and "prebuilt" (Pre Built).
export type BuildView = "new" | "prebuilt";
const BUILD_VIEW_KEY = "ta-build-view";
// The Workflows tab groups Workflows, Automations, and Drafts as subtabs.
const WORKFLOWS_VIEW_KEY = "ta-workflows-view";
// The Drafts tab groups Grades and Messages as subtabs.
const DRAFTS_VIEW_KEY = "ta-drafts-view";

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
    // The URL wins over localStorage when it names a tab (AC3) - a shared
    // link, a bookmark, or a reload after navigating. normalizeActiveTab is
    // the single validator shared by the URL and localStorage paths, so an
    // unknown/malformed value in either falls back to the same "manual"
    // default rather than a second hand-copied check.
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    if (urlTab !== null) return normalizeActiveTab(urlTab);
    return normalizeActiveTab(localStorage.getItem("ta-active-tab"));
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
    // The URL wins over localStorage, but only when it actually names the
    // Manual tab - a manualView param is meaningless (and ignored) on a
    // "?tab=courses" URL. Reuses isManualViewType via normalizeManualView,
    // the same validator the MANUAL_VIEW_KEY branch below already applies.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("tab") === "manual") {
      return normalizeManualView(urlParams.get("manualView"));
    }
    const savedManual = localStorage.getItem(MANUAL_VIEW_KEY);
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
    if (saved === "ppt-design") return "ppt-design";
    if (saved === "content" || saved === "grading" || saved === "canvas") return "content";
    return "course-planning";
  });
  const [buildView, setBuildViewState] = useState<BuildView>(() => {
    if (typeof window === "undefined") return "prebuilt";
    // The URL wins over localStorage, but only when it actually named Manual
    // > Build Courses as the branch being restored into - a buildView param
    // is meaningless outside that branch. `manualView` above has already
    // resolved the true branch (URL-derived or localStorage-derived), so
    // checking it here is enough to keep the whole chain consistent without
    // re-deriving manualView from the URL a second time.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("tab") === "manual" && manualView === "course-planning") {
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
    // The URL wins over localStorage, but only when it actually named Manual
    // > LMS as the branch being restored into - see the matching comment on
    // buildView above.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("tab") === "manual" && manualView === "content") {
      return normalizeContentView(urlParams.get("contentView"));
    }
    const saved = localStorage.getItem(VIEW_KEY);
    return saved === "pages" || saved === "files" || saved === "grading" || saved === "announcements" || saved === "inbox" || saved === "version-control"
      ? (saved as ContentView)
      : "modules";
  });
  const setContentView = (v: ContentView) => {
    setContentViewState(v);
    if (typeof window !== "undefined") localStorage.setItem(VIEW_KEY, v);
  };
  const [workflowsView, setWorkflowsView] = useState<WorkflowsView>(() => {
    if (typeof window === "undefined") return "workflows";
    // The URL wins over localStorage, but only when it actually names the
    // Workflows tab - see the matching comment on manualView above.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("tab") === "workflows") {
      return normalizeWorkflowsView(urlParams.get("workflowsView"));
    }
    // Migrate legacy "grade-drafts" or stored "drafts" to "drafts" view.
    const saved = localStorage.getItem("ta-active-tab");
    if (saved === "grade-drafts" || saved === "drafts") return "drafts";
    return normalizeWorkflowsView(localStorage.getItem(WORKFLOWS_VIEW_KEY));
  });
  const [draftsView, setDraftsView] = useState<DraftsView>(() => {
    if (typeof window === "undefined") return "grades";
    // The URL wins over localStorage, but only when it actually named
    // Workflows > Drafts as the branch being restored into - see the
    // matching comment on buildView above.
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("tab") === "workflows" && workflowsView === "drafts") {
      return normalizeDraftsView(urlParams.get("draftsView"));
    }
    const saved = localStorage.getItem(DRAFTS_VIEW_KEY);
    // A stale "presentations" value (the subtab was removed) must never leave
    // the user on a dead view - migrate it to "grades".
    if (saved === "presentations") return "grades";
    return saved === "grades" || saved === "messages" ? saved : "grades";
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
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("tab") !== "courses") return null;
    return urlParams.get("focusCourse");
  });
  // Knowledge's institution + selected page (AC1-AC3): unlike every other
  // sub-view above, the institution is not a fixed enum - it is dynamic,
  // per-user data (registered institution acronyms) resolved by
  // useKbInstitutionSelection's own URL-vs-localStorage-vs-header fallback
  // chain (see that hook's docstring), so this is the one call site for it -
  // KnowledgeTab.tsx no longer calls it itself. Passing a URL-derived
  // institution only when "?tab=knowledge" was actually present mirrors
  // every buildView/contentView/draftsView initializer above: a param is
  // only meaningful when it belongs to the branch actually being restored.
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
      const params = new URLSearchParams(window.location.search);
      return params.get("tab") === "knowledge"
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
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("tab") !== "knowledge") return null;
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
    localStorage.setItem(DRAFTS_VIEW_KEY, draftsView);
  }, [draftsView]);

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
  // predictably (AC3). When the URL already named a tab, the initializers
  // above derived state FROM it, so the first run is expected to be a no-op.
  const urlHadTabOnLoadRef = useRef<boolean>(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tab")
  );
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
  const kbInstitutionRef = useRef(kbInstitution);
  const kbPageIdRef = useRef(kbPageId);
  useEffect(() => {
    activeTabRef.current = activeTab;
    kbInstitutionRef.current = kbInstitution;
    kbPageIdRef.current = kbPageId;
  }, [activeTab, kbInstitution, kbPageId]);

  useEffect(() => {
    const target = buildUrlSearch({
      tab: activeTab,
      manualView,
      workflowsView,
      buildView,
      contentView,
      draftsView,
      kbInstitution,
      kbPageId,
    });

    if (isFirstUrlSyncRef.current) {
      isFirstUrlSyncRef.current = false;
      if (!urlHadTabOnLoadRef.current) {
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
  }, [activeTab, manualView, workflowsView, buildView, contentView, draftsView, kbInstitution, kbPageId]);

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
      // inconsistent behavior rather than closing a gap in existing behavior).
      if (activeTabRef.current === "knowledge" && parsed.tab === "knowledge") {
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
      // restored to - a manualView/workflowsView/buildView/contentView/
      // draftsView value parsed off an unrelated branch's history entry (see
      // url-state.ts) must not reset the sub-view the user had set up the
      // last time they were on that branch. Each level is gated on its own
      // immediate parent, walking the chain one step at a time, so a deep
      // restore sets the whole chain rather than just the leaf.
      if (parsed.tab === "manual") {
        setManualView(parsed.manualView);
        if (parsed.manualView === "course-planning") setBuildView(parsed.buildView);
        if (parsed.manualView === "content") setContentView(parsed.contentView);
      }
      if (parsed.tab === "knowledge") {
        // A null URL institution (no institutions registered at push-time)
        // means "let the hook keep resolving its own fallback" rather than
        // forcing it to an empty string.
        if (parsed.kbInstitution) setKbInstitution(parsed.kbInstitution);
        setKbPageId(parsed.kbPageId);
      }
      if (parsed.tab === "workflows") {
        setWorkflowsView(parsed.workflowsView);
        if (parsed.workflowsView === "drafts") setDraftsView(parsed.draftsView);
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
    manualView,
    setManualView,
    buildView,
    setBuildView,
    contentView,
    setContentView,
    workflowsView,
    setWorkflowsView,
    draftsView,
    setDraftsView,
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
