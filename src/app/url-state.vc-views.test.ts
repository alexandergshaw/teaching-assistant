import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildUrlSearch,
  buildVcHref,
  normalizeVcOrgView,
  normalizeVcSubTab,
  parseUrlState,
  resolveInitialVcOrgView,
  resolveInitialVcSubTab,
  type UrlNavState,
} from "./url-state";

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

const navSource = readFileSync("src/app/components/home/useAppNavigation.ts", "utf8");
const vcSource = readFileSync("src/app/components/VersionControlTab.tsx", "utf8");
const orgSource = readFileSync("src/app/components/OrgManagementPanel.tsx", "utf8");

describe("Version Control deep-link views", () => {
  it("normalizes both URL enums with their documented defaults", () => {
    expect(normalizeVcSubTab("orgs")).toBe("orgs");
    expect(normalizeVcSubTab("repos")).toBe("repos");
    expect(normalizeVcSubTab("bulk")).toBe("bulk");
    expect(normalizeVcSubTab("unknown")).toBe("orgs");
    expect(normalizeVcOrgView("students")).toBe("students");
    expect(normalizeVcOrgView("management")).toBe("management");
    expect(normalizeVcOrgView("unknown")).toBe("students");
  });

  it("round-trips VC views and emits nested organization state only on its branch", () => {
    const query = buildUrlSearch({
      ...DEFAULT_STATE,
      vcSubTab: "orgs",
      vcOrgView: "management",
    });
    expect(parseUrlState(query)).toMatchObject({ vcOrgView: "management" });
    expect(resolveInitialVcSubTab(query, "repos")).toBe("orgs");
    expect(query).toContain("vcOrgView=management");
    expect(buildUrlSearch({ ...DEFAULT_STATE, vcSubTab: "bulk", vcOrgView: "management" })).toContain("vcSubTab=bulk");
    expect(buildUrlSearch({ ...DEFAULT_STATE, vcSubTab: "bulk", vcOrgView: "management" })).not.toContain("vcOrgView");

    const otherBranch = buildUrlSearch({ ...DEFAULT_STATE, tab: "courses", vcSubTab: "bulk", vcOrgView: "management" });
    expect(otherBranch).not.toContain("vcSubTab");
    expect(otherBranch).not.toContain("vcOrgView");
    expect(buildVcHref("?tab=manual&manualView=version-control&vcSubTab=bulk", { vcSubTab: "orgs" }, "management"))
      .toBe("/?tab=manual&manualView=version-control&vcOrgView=management");
  });

  it("lets a cold VC URL beat saved views, including omitted URL defaults", () => {
    expect(resolveInitialVcSubTab("?tab=manual&manualView=version-control&vcSubTab=bulk", "repos")).toBe("bulk");
    expect(resolveInitialVcSubTab("?tab=manual&manualView=version-control", "repos")).toBe("orgs");
    expect(resolveInitialVcSubTab("?tab=courses", "repos")).toBe("repos");
    expect(resolveInitialVcOrgView("?tab=manual&manualView=version-control&vcOrgView=management", "students")).toBe("management");
    expect(resolveInitialVcOrgView("?tab=manual&manualView=version-control&vcSubTab=orgs", "management")).toBe("students");
    expect(resolveInitialVcOrgView("?tab=manual&manualView=version-control&vcSubTab=bulk", "management")).toBe("management");
  });

  it("wires hook URL restoration and native anchors with a plain-click SPA guard", () => {
    expect(navSource).toContain("resolveInitialVcSubTab(window.location.search, localStorage.getItem(VC_SUBTAB_KEY))");
    expect(navSource).toContain("resolveInitialVcOrgView(window.location.search, localStorage.getItem(VC_ORG_VIEW_KEY))");
    expect(navSource).toContain("if (parsed.manualView === \"version-control\")");
    expect(vcSource).toContain('href={hrefForSubTab("orgs")}');
    expect(vcSource).toContain('href={hrefForSubTab("repos")}');
    expect(vcSource).toContain('href={hrefForSubTab("bulk")}');
    expect(vcSource).toContain("isPlainLeftClick(event)");
    expect(vcSource).toContain("event.preventDefault();\n    selectSubTab(next);");
    expect(vcSource).toContain("dispatchEvent(new PopStateEvent(\"popstate\"))");
    expect(vcSource).toContain("window.addEventListener(URL_STATE_SYNC_EVENT, onPopState)");
    expect(orgSource).toContain("href={hrefForOrgView(key)}");
    expect(orgSource).toContain("isPlainLeftClick(event)");
    expect(orgSource).toContain("event.preventDefault();\n    selectOrgView(next);");
    expect(orgSource).toContain("window.addEventListener(URL_STATE_SYNC_EVENT, onPopState)");
  });
});
