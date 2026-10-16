"use client";

import { useEffect, useState } from "react";
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
import styles from "../page.module.css";
import type { UrlNavState } from "../url-state";
import { buildTabHref, isPlainLeftClick } from "./tabs/tab-link";
import type { VcOrgView, VcSubTab } from "./version-control/vc-views";

const VC_ORG_KEY = "ta-vc-org";

/**
 * Version Control Integration: pick a GitHub org and a template repo within it,
 * paste a list of students, and generate one repo per student from the template
 * (the GitHub Classroom distribution pattern).
 */
interface VersionControlTabProps {
  navState: UrlNavState;
  vcSubTab: VcSubTab;
  setVcSubTab: (view: VcSubTab) => void;
  vcOrgView: VcOrgView;
  setVcOrgView: (view: VcOrgView) => void;
}

export default function VersionControlTab({ navState, vcSubTab, setVcSubTab, vcOrgView, setVcOrgView }: VersionControlTabProps) {
  const { total: vcAttention } = useVcCounts();
  const [orgs, setOrgs] = useState<string[]>([]);
  const [orgsState, setOrgsState] = useState<"loading" | "ready" | "unconfigured">("loading");
  const [selectedOrg, setSelectedOrg] = useState(() => (typeof window !== "undefined" ? localStorage.getItem(VC_ORG_KEY) ?? "" : ""));
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [orgReposNonce, setOrgReposNonce] = useState(0);
  const [myRepos, setMyRepos] = useState<GithubRepo[]>([]);
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
    setVcSubTab("repos");
    if (h.githubOrg) setSelectedOrg(h.githubOrg);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [setVcSubTab]);

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
        <a
          href={buildTabHref(navState, { tab: "manual", toolsSection: "manual", manualView: "version-control", vcSubTab: "orgs" })}
          role="tab"
          aria-selected={vcSubTab === "orgs"}
          className={`${styles.lessonInnerTab}${vcSubTab === "orgs" ? ` ${styles.lessonInnerTabActive}` : ""}`}
          onClick={(event) => {
            if (!isPlainLeftClick(event)) return;
            event.preventDefault();
            setVcSubTab("orgs");
          }}
        >
          <span className={styles.tabLabelWrap}>Orgs</span>
        </a>
        <a
          href={buildTabHref(navState, { tab: "manual", toolsSection: "manual", manualView: "version-control", vcSubTab: "repos" })}
          role="tab"
          aria-selected={vcSubTab === "repos"}
          className={`${styles.lessonInnerTab}${vcSubTab === "repos" ? ` ${styles.lessonInnerTabActive}` : ""}`}
          onClick={(event) => {
            if (!isPlainLeftClick(event)) return;
            event.preventDefault();
            setVcSubTab("repos");
          }}
        >
          <span className={styles.tabLabelWrap}>
            Repos
            {vcAttention > 0 && <span className={styles.navBadge}>{vcAttention}</span>}
          </span>
        </a>
        <a
          href={buildTabHref(navState, { tab: "manual", toolsSection: "manual", manualView: "version-control", vcSubTab: "bulk" })}
          role="tab"
          aria-selected={vcSubTab === "bulk"}
          className={`${styles.lessonInnerTab}${vcSubTab === "bulk" ? ` ${styles.lessonInnerTabActive}` : ""}`}
          onClick={(event) => {
            if (!isPlainLeftClick(event)) return;
            event.preventDefault();
            setVcSubTab("bulk");
          }}
        >
          <span className={styles.tabLabelWrap}>Bulk actions</span>
        </a>
      </div>

      {vcSubTab === "orgs" && (
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
          {selectedOrg && <OrgManagementPanel org={selectedOrg} repos={repos} onReposChanged={() => setOrgReposNonce((n) => n + 1)} navState={navState} vcOrgView={vcOrgView} setVcOrgView={setVcOrgView} />}
        </>
      )}

      {vcSubTab === "repos" && <RepoDetail />}

      {/* Keep BulkRepoActionsPanel mounted to preserve state across tab switches */}
      <div style={{ display: vcSubTab === "bulk" ? undefined : "none" }}>
        {/* Bulk actions must offer every repo the token can see - personal and
        collaborator repos included - not just the selected org + templates. */}
        <BulkRepoActionsPanel repos={[...new Set([...myRepos, ...mergedRepos].map((r) => r.fullName))].sort()} active={vcSubTab === "bulk"} />
      </div>
    </div>
  );
}
