"use client";

import { useCallback, useEffect, useState } from "react";
import {
  listMyOrgsAction,
  listOrgReposAction,
  listGithubReposAction,
} from "../actions";
import type { GithubRepo } from "@/lib/github";
import OrgManagementPanel from "./OrgManagementPanel";
import RepoDetail from "./RepoDetail";
import BulkRepoActionsPanel from "./BulkRepoActionsPanel";
import Typeahead from "./ui/Typeahead";
import { takeCourseHandoff } from "@/lib/course-handoff";
import { useVcCounts } from "./VcCounts";
import { type VcSubTab, type VcOrgView, VC_SUB_TAB_CHANGE_EVENT, VC_SUB_TABS } from "./vc-views";
import { resolveVcSubTabFromUrl, isVersionControlUrl, normalizeVcSubTab, parseUrlState } from "../url-state";
import { buildTabHref, isPlainLeftClick } from "./tabs/tab-link";
import styles from "../page.module.css";

const VC_ORG_KEY = "ta-vc-org";

/**
 * Version Control Integration: pick a GitHub org and a template repo within it,
 * paste a list of students, and generate one repo per student from the template
 * (the GitHub Classroom distribution pattern).
 */
export default function VersionControlTab({ vcOrgView }: { vcOrgView: VcOrgView }) {
  const { total: vcAttention } = useVcCounts();
  const [orgs, setOrgs] = useState<string[]>([]);
  const [orgsState, setOrgsState] = useState<"loading" | "ready" | "unconfigured">("loading");
  const [selectedOrg, setSelectedOrg] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(VC_ORG_KEY) ?? "" : ""));
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [orgReposNonce, setOrgReposNonce] = useState(0);
  const [myRepos, setMyRepos] = useState<GithubRepo[]>([]);
  const [subTab, setViewState] = useState<VcSubTab>(() => {
    if (typeof window === "undefined") return "orgs";
    return resolveVcSubTabFromUrl(window.location.search, localStorage.getItem("ta-vc-subtab"));
  });
  const setSubTab = useCallback((view: VcSubTab) => {
    setViewState(view);
    localStorage.setItem("ta-vc-subtab", view);
    window.dispatchEvent(new CustomEvent(VC_SUB_TAB_CHANGE_EVENT, { detail: view }));
  }, []);
  useEffect(() => {
    const onPopState = () => {
      if (!isVersionControlUrl(window.location.search)) return;
      const parsed = parseUrlState(window.location.search);
      const view = normalizeVcSubTab(parsed.vcSubTab);
      setViewState(view);
      localStorage.setItem("ta-vc-subtab", view);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  const viewHref = (view: VcSubTab) => buildTabHref(parseUrlState(typeof window === "undefined" ? "" : window.location.search), {
    tab: "manual", toolsSection: "manual", manualView: "version-control",
    vcSubTab: view, vcOrgView,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(VC_ORG_KEY, selectedOrg);
  }, [selectedOrg]);

  // Arriving from a course in the Courses hub: open the Repos subtab with the
  // course's GitHub org prefilled.
  useEffect(() => {
    const h = takeCourseHandoff("version-control");
    if (!h) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setSubTab("repos");
    if (h.githubOrg) setSelectedOrg(h.githubOrg);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [setSubTab]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listMyOrgsAction();
      if (cancelled) return;
      if ("error" in r) {
        setOrgsState("unconfigured");
        return;
      }
      setOrgs(r.orgs);
      setOrgsState("ready");
      const mr = await listGithubReposAction();
      if (cancelled) return;
      if (!("error" in mr)) {
        setMyRepos(mr.repos);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the chosen org's repos for the template dropdown. Client-only fetch
  // effect, so the set-state-in-effect rule is suppressed here.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!selectedOrg) {
      setRepos([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await listOrgReposAction(selectedOrg);
      if (cancelled) return;
      if (!("error" in r)) setRepos(r.repos);
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [selectedOrg, orgReposNonce]);


  const externalTemplates = myRepos.filter((r) => r.isTemplate && !repos.some((o) => o.fullName === r.fullName));
  const mergedRepos = [...repos, ...externalTemplates];

  if (orgsState === "unconfigured") {
    return (
      <div className={styles.form}>
        <p style={{ color: "var(--text-secondary)" }}>
          GitHub isn&apos;t configured. Set the <code>GITHUB_TOKEN</code> environment variable (a token that owns the
          target organizations) to use Version Control Integration.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.form}>
      <div className={styles.lessonInnerTabs} role="tablist" aria-label="Version control sections" style={{ marginBottom: "var(--space-1)" }}>
        {VC_SUB_TABS.map(([key, label]) => (
          <a key={key} href={viewHref(key)} role="tab" aria-selected={subTab === key}
            className={`${styles.lessonInnerTab}${subTab === key ? ` ${styles.lessonInnerTabActive}` : ""}`}
            onKeyDown={(event) => { if (event.key === " ") { event.preventDefault(); event.currentTarget.click(); } }}
            onClick={(event) => {
              if (!isPlainLeftClick(event)) return;
              event.preventDefault();
              setSubTab(key);
            }}>
            <span className={styles.tabLabelWrap}>{label}{key === "repos" && vcAttention > 0 && <span className={styles.navBadge}>{vcAttention}</span>}</span>
          </a>
        ))}
      </div>

      {subTab === "orgs" && (
        <>
          <div className={styles.field}>
            <label>Organization</label>
            <Typeahead
              options={orgs.map((o) => ({ value: o, label: o }))}
              value={selectedOrg}
              onChange={setSelectedOrg}
              placeholder={
                orgsState === "loading"
                  ? "Loading organizations…"
                  : "Choose an organization…"
              }
              loading={orgsState === "loading"}
              noOptionsText="No organizations"
            />
            <p className={styles.fieldHint}>
              Student repo assignment moved to the Workflows tab - run the &quot;Student Repo Assignment&quot; workflow.
            </p>
          </div>
          {selectedOrg && <OrgManagementPanel org={selectedOrg} repos={repos} onReposChanged={() => setOrgReposNonce((n) => n + 1)} />}
        </>
      )}

      {subTab === "repos" && <RepoDetail />}

      {/* Keep BulkRepoActionsPanel mounted to preserve state across tab switches */}
      <div style={{ display: subTab === "bulk" ? undefined : "none" }}>
        {/* Bulk actions must offer every repo the token can see - personal and
        collaborator repos included - not just the selected org + templates. */}
        <BulkRepoActionsPanel repos={[...new Set([...myRepos, ...mergedRepos].map((r) => r.fullName))].sort()} active={subTab === "bulk"} />
      </div>
    </div>
  );
}
