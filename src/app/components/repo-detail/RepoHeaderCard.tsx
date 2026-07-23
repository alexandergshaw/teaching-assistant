"use client";

import Button from "@mui/material/Button";
import { sandboxUrls, codespacesUrl, type BackendInfo } from "@/lib/frontend-detect";
import type { GithubRepo } from "@/lib/github";
import { formatRelative } from "../../utils/time";
import styles from "../../page.module.css";

export function RepoHeaderCard({
  selectedRepoInfo,
  frontend,
  backend,
  frontendChecked,
}: {
  selectedRepoInfo: GithubRepo | undefined;
  frontend: { framework: string; devCommand: string } | null;
  backend: BackendInfo | null;
  frontendChecked: boolean;
}) {
  if (!selectedRepoInfo) return null;
  return (
    <div className={styles.ghRepoHead}>
      <div className={styles.ghBadges}>
        <a href={selectedRepoInfo.htmlUrl} target="_blank" rel="noreferrer" className={styles.ghRepoName}>
          {selectedRepoInfo.fullName}
        </a>
        <span className={`${styles.ghBadge} ${styles.ghBadgeNeutral}`}>
          {selectedRepoInfo.private ? "Private" : "Public"}
        </span>
        {selectedRepoInfo.isTemplate && (
          <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`}>Template</span>
        )}
        {selectedRepoInfo.archived && (
          <span className={`${styles.ghBadge} ${styles.ghBadgeWarning}`}>Archived</span>
        )}
      </div>
      {selectedRepoInfo.description && (
        <p className={styles.ghMeta} style={{ margin: "6px 0 0" }}>{selectedRepoInfo.description}</p>
      )}
      <div className={styles.ghMetaRow} style={{ marginTop: 6 }}>
        <span className={styles.ghMetaMono}>default: {selectedRepoInfo.defaultBranch}</span>
        {selectedRepoInfo.updatedAt && <span>updated {formatRelative(selectedRepoInfo.updatedAt)}</span>}
      </div>
      {frontendChecked && frontend && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`}>{frontend.framework}</span>
          <Button size="small" variant="outlined" component="a" href={sandboxUrls(selectedRepoInfo.fullName).stackblitz} target="_blank" rel="noreferrer">
            Spin up in StackBlitz
          </Button>
          <Button size="small" variant="outlined" component="a" href={sandboxUrls(selectedRepoInfo.fullName).codesandbox} target="_blank" rel="noreferrer">
            CodeSandbox
          </Button>
          <p className={styles.fieldHint} style={{ margin: 0, marginLeft: "auto", fontSize: "0.8rem" }}>
            Boots the app&apos;s dev server in your browser (WebContainers). Private repos ask you to sign in to the sandbox with GitHub once.
          </p>
        </div>
      )}
      {frontendChecked && backend && (
        <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`${styles.ghBadge} ${styles.ghBadgeAccent}`}>{backend.framework}</span>
          {backend.runtime === "node" ? (
            <>
              <Button size="small" variant="outlined" component="a" href={sandboxUrls(selectedRepoInfo.fullName).stackblitz} target="_blank" rel="noreferrer">
                Spin up in StackBlitz
              </Button>
              <Button size="small" variant="outlined" component="a" href={sandboxUrls(selectedRepoInfo.fullName).codesandbox} target="_blank" rel="noreferrer">
                CodeSandbox
              </Button>
              <Button size="small" variant="outlined" component="a" href={codespacesUrl(selectedRepoInfo.fullName)} target="_blank" rel="noreferrer">
                Codespaces
              </Button>
              <p className={styles.fieldHint} style={{ margin: 0, marginLeft: "auto", fontSize: "0.8rem" }}>
                Boots the API in your browser (WebContainers) or a cloud dev environment.
              </p>
            </>
          ) : (
            <>
              <Button size="small" variant="outlined" component="a" href={sandboxUrls(selectedRepoInfo.fullName).codesandbox} target="_blank" rel="noreferrer">
                CodeSandbox
              </Button>
              <Button size="small" variant="outlined" component="a" href={codespacesUrl(selectedRepoInfo.fullName)} target="_blank" rel="noreferrer">
                Codespaces
              </Button>
              <p className={styles.fieldHint} style={{ margin: 0, marginLeft: "auto", fontSize: "0.8rem" }}>
                Python APIs need a real VM: CodeSandbox Devboxes run free in the cloud; Codespaces uses your GitHub account. Start command: {backend.devCommand}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
