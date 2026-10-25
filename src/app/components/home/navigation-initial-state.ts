import { isManualViewType, type ManualViewType, type AutomateView } from "../manual/manual-rail";
import { normalizeManualView, resolveGradingPointer, resolveTabDestination, isRecordingUrl } from "../../url-state";
import { legacyPptDesignView } from "@/lib/ppt-view-migration";

const TOOLS_SECTION_KEY = "ta-tools-section";
const WORKFLOWS_VIEW_KEY = "ta-workflows-view";

/** Initial parent selection, including the existing retired storage migrations. */
export function initializeManualView(
  search: string,
  localStorage: Pick<Storage, "getItem" | "setItem">,
  toolsSection: string,
  readLegacyAutomateView: () => AutomateView | null,
): ManualViewType {
  if (isRecordingUrl(search)) return "recording";
  // A user who was viewing Version Control (inside the old Integrations, tracked
  // by "ta-content-view") lands on the new standalone Version Control subtab; reset the
  // LMS content view so ContentTab does not open on a now-removed VC subtab.
  if (localStorage.getItem("ta-content-view") === "version-control") {
    localStorage.setItem("ta-content-view", "modules");
    return "version-control";
  }
  // GRAD-SUBTAB wave 1 (docs/tools-grading-subtab-architecture.md section
  // 5.5, the "content-view:grading" retired pointer): a user whose last LMS
  // content view was Grading ("ta-content-view" === "grading", now retired from
  // ContentView - see content-tab/constants.ts) lands on the new Grading
  // sub-tab instead of being silently dropped to Modules within LMS.
  // Mirrors the version-control migration immediately above.
  if (localStorage.getItem("ta-content-view") === "grading") {
    localStorage.setItem("ta-content-view", "modules");
    return "grading";
  }
  // The URL wins over localStorage, but only when it actually names the
  // Tools tab's Manual section - a manualView param is meaningless (and
  // ignored) on a "?tab=courses" URL, and equally so on a "?tab=manual&
  // toolsSection=workflows" one. Reuses isManualViewType via
  // normalizeManualView, the same validator the "ta-manual-view" branch
  // below already applies.
  const urlParams = new URLSearchParams(search);
  const urlHasTab = urlParams.has("tab");
  const destination = resolveTabDestination(urlHasTab ? urlParams.get("tab") : localStorage.getItem("ta-active-tab"));
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
    // WORKFLOWS-COLLAPSE W2: a retired Workflows/Automations URL means the
    // Automate container (manualView="artifact-design").
    if (readLegacyAutomateView()) return "artifact-design";
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
  // WORKFLOWS-COLLAPSE W2: a stored retired Workflows section (the drafts
  // pointers above are refused by readLegacyAutomateView) means Automate.
  if (readLegacyAutomateView()) return "artifact-design";
  const savedManual = localStorage.getItem("ta-manual-view");
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
}
