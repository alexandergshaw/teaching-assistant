"use client";

import { useState } from "react";
import type { GithubRepo } from "@/lib/github";
import RepoSettingsPanel from "./RepoSettingsPanel";
import CopyRepoPanel from "./CopyRepoPanel";
import { useVcCounts } from "./VcCounts";
import Typeahead from "./ui/Typeahead";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Button from "@mui/material/Button";
import styles from "../page.module.css";
import { useFilesTab } from "./repo-detail/useFilesTab";
import { useRepoBranchSync } from "./repo-detail/useRepoBranchSync";
import { useFrontendDetection } from "./repo-detail/useFrontendDetection";
import { useCreateRepoPanel } from "./repo-detail/useCreateRepoPanel";
import { useBranchesTab } from "./repo-detail/useBranchesTab";
import { usePullsTab } from "./repo-detail/usePullsTab";
import { useActionsTab } from "./repo-detail/useActionsTab";
import { useCopilotTab } from "./repo-detail/useCopilotTab";
import { RepoHeaderCard } from "./repo-detail/RepoHeaderCard";
import { CreateRepoPanel } from "./repo-detail/CreateRepoPanel";
import { FilesTab } from "./repo-detail/FilesTab";
import { BranchesTab } from "./repo-detail/BranchesTab";
import { PullsTab } from "./repo-detail/PullsTab";
import { ActionsTab } from "./repo-detail/ActionsTab";
import { CopilotTab } from "./repo-detail/CopilotTab";

const VC_REPO_KEY = "ta-vc-repo";

export default function RepoDetail() {
  const { openPrs: attentionPrs, agentPrs: attentionAgents, runsNeedingApproval: attentionRuns, refresh: refreshVcCounts } = useVcCounts();
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [reposState, setReposState] = useState<"loading" | "ready" | "error">("loading");
  const [repoRef, setRepoRef] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem(VC_REPO_KEY) ?? "" : ""
  );
  const [branch, setBranch] = useState("");
  const [branches, setBranches] = useState<string[]>([]);
  const [defaultBranch, setDefaultBranch] = useState("");
  const [tab, setTab] = useState<"files" | "branches" | "copy" | "pulls" | "actions" | "copilot" | "settings">("files");

  const filesTab = useFilesTab(repoRef, branch, tab);
  const { reloadBranches } = useRepoBranchSync(
    repoRef,
    branch,
    setRepos,
    setReposState,
    setBranch,
    setBranches,
    setDefaultBranch,
    refreshVcCounts,
    filesTab.resetForRepoChange
  );
  const { frontend, backend, frontendChecked } = useFrontendDetection(repoRef);
  const createRepoPanel = useCreateRepoPanel(repos, setRepos, setRepoRef);
  const branchesTab = useBranchesTab(repoRef, branch, defaultBranch, reloadBranches);
  const pullsTab = usePullsTab(repoRef, branch, defaultBranch, tab, setTab, refreshVcCounts);
  const actionsTab = useActionsTab(repoRef, branch, tab, refreshVcCounts);
  const copilotTab = useCopilotTab(repoRef, tab);

  const repoOptions = repos.map((r) => ({
    value: r.fullName,
    label: r.fullName,
    hint: r.private ? "private" : "public",
  }));

  const branchOptions = branches.map((b) => ({
    value: b,
    label: b,
  }));

  const selectedRepoInfo = repoRef ? repos.find((r) => r.fullName === repoRef) : undefined;

  return (
    <div className={styles.field}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px" }}>
          <label className={styles.panelTitle} style={{ display: "block", marginBottom: 6 }}>Repository</label>
          <Typeahead
            options={repoOptions}
            value={repoRef}
            onChange={(v) => setRepoRef(v)}
            placeholder={
              reposState === "loading"
                ? "Loading repositories..."
                : reposState === "error"
                  ? "Error loading repositories"
                  : "Choose a repository..."
            }
            disabled={reposState === "loading"}
            loading={reposState === "loading"}
            noOptionsText="No repositories"
          />
          {reposState === "error" && <p className={styles.error}>Failed to load repositories</p>}
        </div>
        {repoRef && (
          <div style={{ flex: "1 1 220px" }}>
            <label className={styles.panelTitle} style={{ display: "block", marginBottom: 6 }}>Branch</label>
            <Typeahead
              options={branchOptions}
              value={branch}
              onChange={(v) => setBranch(v)}
              placeholder="Branch"
              noOptionsText="No branches"
            />
          </div>
        )}
        <Button variant="outlined" size="small" onClick={() => createRepoPanel.setShowCreate((v) => !v)}>
          {createRepoPanel.showCreate ? "Cancel" : "New repository"}
        </Button>
      </div>

      {!repoRef && <p className={styles.fieldHint}>Pick a repository to browse its files, branches, pull requests, and actions.</p>}

      <RepoHeaderCard
        selectedRepoInfo={selectedRepoInfo}
        frontend={frontend}
        backend={backend}
        frontendChecked={frontendChecked}
      />

      {createRepoPanel.showCreate && (
        <CreateRepoPanel
          repos={repos}
          createName={createRepoPanel.createName}
          setCreateName={createRepoPanel.setCreateName}
          createDescription={createRepoPanel.createDescription}
          setCreateDescription={createRepoPanel.setCreateDescription}
          createPrivate={createRepoPanel.createPrivate}
          setCreatePrivate={createRepoPanel.setCreatePrivate}
          createTemplate={createRepoPanel.createTemplate}
          setCreateTemplate={createRepoPanel.setCreateTemplate}
          createPrompt={createRepoPanel.createPrompt}
          setCreatePrompt={createRepoPanel.setCreatePrompt}
          createBusy={createRepoPanel.createBusy}
          createMsg={createRepoPanel.createMsg}
          createResult={createRepoPanel.createResult}
          createFromTemplate={createRepoPanel.createFromTemplate}
          setCreateFromTemplate={createRepoPanel.setCreateFromTemplate}
          templateSource={createRepoPanel.templateSource}
          setTemplateSource={createRepoPanel.setTemplateSource}
          handleCreateRepo={createRepoPanel.handleCreateRepo}
          handleCreateFromTemplate={createRepoPanel.handleCreateFromTemplate}
        />
      )}

      {repoRef && (
        <>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v as "files" | "branches" | "copy" | "pulls" | "actions" | "copilot" | "settings")}
            sx={{
              marginTop: 2,
              minHeight: 40,
              borderBottom: "1px solid var(--field-border)",
              "& .MuiTabs-indicator": { backgroundColor: "var(--accent)" },
              "& .MuiTab-root": {
                fontFamily: "inherit",
                fontSize: "0.88rem",
                fontWeight: 500,
                textTransform: "none",
                color: "var(--text-secondary)",
                minHeight: 40,
                padding: "8px 16px",
              },
              "& .Mui-selected": { color: "var(--accent-ink) !important", fontWeight: 600 },
            }}
          >
            <Tab label="Files" value="files" disableRipple />
            <Tab label="Branches" value="branches" disableRipple />
            <Tab label="Copy" value="copy" disableRipple />
            <Tab
              label={
                <span className={styles.tabLabelWrap}>
                  Pull requests
                  {attentionPrs > 0 && <span className={styles.navBadge}>{attentionPrs}</span>}
                </span>
              }
              value="pulls"
              disableRipple
            />
            <Tab
              label={
                <span className={styles.tabLabelWrap}>
                  Actions
                  {attentionRuns > 0 && <span className={styles.navBadge}>{attentionRuns}</span>}
                </span>
              }
              value="actions"
              disableRipple
            />
            <Tab
              label={
                <span className={styles.tabLabelWrap}>
                  Copilot
                  {attentionAgents > 0 && <span className={styles.navBadge}>{attentionAgents}</span>}
                </span>
              }
              value="copilot"
              disableRipple
            />
            <Tab label="Settings" value="settings" disableRipple />
          </Tabs>

          {tab === "files" && <FilesTab branch={branch} files={filesTab} />}

          {tab === "branches" && (
            <BranchesTab
              branches={branches}
              branch={branch}
              defaultBranch={defaultBranch}
              newBranch={branchesTab.newBranch}
              setNewBranch={branchesTab.setNewBranch}
              fromBranch={branchesTab.fromBranch}
              setFromBranch={branchesTab.setFromBranch}
              branchBusy={branchesTab.branchBusy}
              branchMsg={branchesTab.branchMsg}
              forkOrg={branchesTab.forkOrg}
              setForkOrg={branchesTab.setForkOrg}
              forkBusy={branchesTab.forkBusy}
              forkResult={branchesTab.forkResult}
              forkMsg={branchesTab.forkMsg}
              handleCreateBranch={branchesTab.handleCreateBranch}
              handleDeleteBranch={branchesTab.handleDeleteBranch}
              handleFork={branchesTab.handleFork}
            />
          )}

          {tab === "copy" && (
            <CopyRepoPanel
              repoRef={repoRef}
              branches={branches}
              defaultBranch={defaultBranch}
              description={repos.find(r => r.fullName === repoRef)?.description}
              repos={repos}
            />
          )}

          {tab === "pulls" && (
            <PullsTab
              branch={branch}
              branches={branches}
              defaultBranch={defaultBranch}
              attentionPrs={attentionPrs}
              pullsTab={pullsTab}
            />
          )}
          {tab === "actions" && <ActionsTab repoRef={repoRef} branch={branch} actions={actionsTab} />}

          {tab === "copilot" && (
            <CopilotTab repoRef={repoRef} copilot={copilotTab} openPrInPullsTab={pullsTab.openPrInPullsTab} />
          )}

          {tab === "settings" && (() => {
            const selectedRepo = repos.find((r) => r.fullName === repoRef);
            return selectedRepo ? (
              <RepoSettingsPanel
                repo={selectedRepo}
                onUpdated={(u, previousFullName) => {
                  // Reconcile by the pre-save name so renames update the row
                  // instead of leaving a stale entry, and follow the rename in
                  // the selected-repo reference.
                  setRepos((prev) => prev.map((r) => (r.fullName === previousFullName ? u : r)));
                  if (repoRef === previousFullName && u.fullName !== previousFullName) {
                    setRepoRef(u.fullName);
                  }
                }}
              />
            ) : (
              <p className={styles.fieldHint}>Repository details unavailable.</p>
            );
          })()}
        </>
      )}
    </div>
  );
}
