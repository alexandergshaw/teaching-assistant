import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildUrlSearch,
  normalizeVcOrgView,
  normalizeVcSubTab,
  parseUrlState,
  resolveVcOrgView,
  resolveVcSubTab,
} from "./url-state";
import type { UrlNavState } from "./url-state";
import { buildTabHref } from "./components/tabs/tab-link";

const DEFAULT_STATE: UrlNavState = {
  tab: "manual",
  coursesSection: "courses",
  toolsSection: "manual",
  librarySection: "files",
  manualView: "version-control",
  automateView: "templates",
  buildView: "prebuilt",
  contentView: "modules",
  gradingView: "chat",
  presentationsView: "slide-deck",
  announcementsView: "post",
  tasksView: "term",
  kbInstitution: null,
  kbPageId: null,
};

const NAV_SOURCE = readFileSync(new URL("./components/home/useAppNavigation.ts", import.meta.url), "utf8");
const VC_HOOK_SOURCE = readFileSync(new URL("./components/home/useVersionControlNavigation.ts", import.meta.url), "utf8");
const PAGE_SOURCE = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const VC_SOURCE = readFileSync(new URL("./components/VersionControlTab.tsx", import.meta.url), "utf8");
const ORG_SOURCE = readFileSync(new URL("./components/OrgManagementPanel.tsx", import.meta.url), "utf8");
const POPSTATE_SOURCE = NAV_SOURCE.slice(
  NAV_SOURCE.indexOf("const onPopState = () => {"),
  NAV_SOURCE.indexOf('window.addEventListener("popstate", onPopState)')
);

function tabAnchorBlocks(source: string): string[] {
  return (source.match(/<a\b[\s\S]*?<\/a>/g) ?? []).filter(
    (block) => block.includes('role="tab"') && block.includes("href={buildTabHref(navState")
  );
}

describe("Version Control view URL state", () => {
  it("round-trips every Version Control view and builds cold-loadable hrefs", () => {
    for (const vcSubTab of ["orgs", "repos", "bulk"] as const) {
      const search = buildUrlSearch({ ...DEFAULT_STATE, vcSubTab });
      expect(parseUrlState(search).vcSubTab ?? "orgs").toBe(vcSubTab);
      expect(buildTabHref(DEFAULT_STATE, { vcSubTab })).toBe(`/${search}`);
    }
    for (const vcOrgView of ["students", "management"] as const) {
      const search = buildUrlSearch({ ...DEFAULT_STATE, vcSubTab: "orgs", vcOrgView });
      expect(parseUrlState(search).vcOrgView ?? "students").toBe(vcOrgView);
      expect(buildTabHref(DEFAULT_STATE, { vcSubTab: "orgs", vcOrgView })).toBe(`/${search}`);
    }
  });

  it("omits defaults and prevents inner views leaking outside their parent chain", () => {
    expect(buildUrlSearch({ ...DEFAULT_STATE, vcSubTab: "orgs", vcOrgView: "students" })).toBe(
      "?tab=manual&manualView=version-control"
    );
    expect(buildUrlSearch({ ...DEFAULT_STATE, vcSubTab: "repos", vcOrgView: "management" })).toBe(
      "?tab=manual&manualView=version-control&vcSubTab=repos"
    );
    expect(buildUrlSearch({ ...DEFAULT_STATE, manualView: "grading", vcSubTab: "bulk", vcOrgView: "management" })).toBe(
      "?tab=manual&manualView=grading"
    );
    expect(parseUrlState("?tab=manual&manualView=version-control&vcSubTab=invalid").vcSubTab).toBe("orgs");
    expect(parseUrlState("?tab=manual&manualView=version-control&vcSubTab=orgs&vcOrgView=invalid").vcOrgView).toBe("students");
    expect(normalizeVcSubTab(null)).toBe("orgs");
    expect(normalizeVcOrgView(null)).toBe("students");
  });

  it("uses explicit URL views over conflicting persisted choices and falls back otherwise", () => {
    expect(resolveVcSubTab("repos", true, "bulk")).toBe("repos");
    expect(resolveVcSubTab(null, true, "bulk")).toBe("orgs");
    expect(resolveVcSubTab(null, false, "bulk")).toBe("bulk");
    expect(resolveVcSubTab(null, false, "unknown")).toBe("orgs");
    expect(resolveVcOrgView("management", true, "students")).toBe("management");
    expect(resolveVcOrgView(null, true, "management")).toBe("students");
    expect(resolveVcOrgView(null, false, "management")).toBe("management");
    expect(resolveVcOrgView(null, false, "unknown")).toBe("students");
  });

  it("wires persisted state, URL history restoration, and native anchor behavior", () => {
    expect(VC_HOOK_SOURCE).toContain('const VC_SUBTAB_KEY = "ta-vc-subtab";');
    expect(VC_HOOK_SOURCE).toContain('const VC_ORG_VIEW_KEY = "ta-vc-org-view";');
    expect(VC_HOOK_SOURCE).toContain("resolveVcSubTab(");
    expect(VC_HOOK_SOURCE).toContain("resolveVcOrgView(");
    expect(VC_HOOK_SOURCE).toContain('return parsed.tab === "manual" && parsed.toolsSection === "manual" && parsed.manualView === "version-control";');
    expect(VC_HOOK_SOURCE).toContain('=== "orgs"');
    expect(VC_HOOK_SOURCE).toContain("parsed?.vcSubTab ?? null, urlNamesVcView");
    expect(VC_HOOK_SOURCE).toContain("localStorage.setItem(VC_SUBTAB_KEY, vcSubTab)");
    expect(VC_HOOK_SOURCE).toContain("localStorage.setItem(VC_ORG_VIEW_KEY, vcOrgView)");
    expect(NAV_SOURCE).toContain("useVersionControlNavigation()");
    expect(NAV_SOURCE).toContain("vcSubTab,");
    expect(NAV_SOURCE).toContain("vcOrgView,");
    expect(NAV_SOURCE).toContain('if (parsed.manualView === "version-control")');
    expect(POPSTATE_SOURCE).toContain('setVcSubTab(parsed.vcSubTab ?? "orgs");');
    expect(POPSTATE_SOURCE).toContain('if ((parsed.vcSubTab ?? "orgs") === "orgs") setVcOrgView(parsed.vcOrgView ?? "students");');
    expect(PAGE_SOURCE).toContain("vcSubTab={nav.vcSubTab}");
    expect(PAGE_SOURCE).toContain("setVcSubTab={nav.setVcSubTab}");
    expect(PAGE_SOURCE).toContain("vcOrgView={nav.vcOrgView}");
    expect(PAGE_SOURCE).toContain("setVcOrgView={nav.setVcOrgView}");
    expect(VC_SOURCE).toContain('import { buildTabHref, isPlainLeftClick } from "./tabs/tab-link";');
    const vcAnchors = tabAnchorBlocks(VC_SOURCE);
    expect(vcAnchors).toHaveLength(3);
    for (const block of vcAnchors) {
      expect(block).toContain("href={buildTabHref(navState");
      expect(block).toContain("isPlainLeftClick(event)");
      expect(block).toContain("event.preventDefault()");
      expect(block).toMatch(/setVcSubTab\("(?:orgs|repos|bulk)"\)/);
    }
    expect(vcAnchors.some((block) => block.includes('vcSubTab: "orgs"'))).toBe(true);
    expect(vcAnchors.some((block) => block.includes('vcSubTab: "repos"'))).toBe(true);
    expect(vcAnchors.some((block) => block.includes('vcSubTab: "bulk"'))).toBe(true);
    expect(ORG_SOURCE).toContain('import { buildTabHref, isPlainLeftClick } from "./tabs/tab-link";');
    const orgAnchors = tabAnchorBlocks(ORG_SOURCE);
    expect(orgAnchors).toHaveLength(1);
    expect(ORG_SOURCE).toContain('[["students", "Student management"], ["management", "Org management"]]');
    for (const block of orgAnchors) {
      expect(block).toContain("href={buildTabHref(navState");
      expect(block).toContain('vcSubTab: "orgs"');
      expect(block).toContain("isPlainLeftClick(event)");
      expect(block).toContain("event.preventDefault()");
      expect(block).toContain("setVcOrgView(key)");
    }
    expect(orgAnchors[0]).toContain("vcOrgView: key");
  });
});
