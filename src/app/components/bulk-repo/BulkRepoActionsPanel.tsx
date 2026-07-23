"use client";

import { useCallback } from "react";
import { useRepoSelection } from "./hooks/useRepoSelection";
import { useCopilotAgents } from "./hooks/useCopilotAgents";
import { useMergePullRequests } from "./hooks/useMergePullRequests";
import { RepoSelector } from "./components/RepoSelector";
import { CopilotAgentsSection } from "./components/CopilotAgentsSection";
import { MergePullRequestsSection } from "./components/MergePullRequestsSection";
import styles from "../../page.module.css";

interface BulkRepoActionsPanelProps {
  repos: string[];
  active?: boolean;
}

export default function BulkRepoActionsPanel({ repos, active = true }: BulkRepoActionsPanelProps) {
  const {
    filterText,
    setFilterText,
    selectedRepos,
    setSelectedRepos,
    shown,
    allShownSelected,
    handleSelectAll,
    handleClear,
  } = useRepoSelection({ repos });

  const {
    copilotTitle,
    setCopilotTitle,
    copilotBody,
    setCopilotBody,
    copilotRows,
    copilotRunning,
    agentStatus,
    checkedAt,
    agentChecking,
    lastRunManual,
    handleStartCopilot,
    handleCancelCopilot,
    handleCheckAgentStatus,
    handleCancelAgentCheck,
  } = useCopilotAgents({
    active,
  });

  const {
    prTitleFilter,
    setPrTitleFilter,
    prAuthorFilter,
    setPrAuthorFilter,
    prBranchFilter,
    setPrBranchFilter,
    mergeMethod,
    setMergeMethod,
    prMatches,
    setPrMatches,
    prPreviewing,
    prMerging,
    mergeConfirm,
    setMergeConfirm,
    mergeSummary,
    includedCount,
    handlePreviewPrs,
    handleCancelPreview,
    handleMergePrs,
    handleCancelMerge,
  } = useMergePullRequests();

  const handleToggleRepo = useCallback(
    (repo: string, checked: boolean) => {
      setSelectedRepos((prev) => {
        const next = new Set(prev);
        if (checked) next.add(repo);
        else next.delete(repo);
        return next;
      });
    },
    [setSelectedRepos]
  );

  const handleRemoveRepo = useCallback(
    (repo: string) => {
      setSelectedRepos((prev) => {
        const next = new Set(prev);
        next.delete(repo);
        return next;
      });
    },
    [setSelectedRepos]
  );

  const handleStartCopilotWrapper = useCallback(() => {
    handleStartCopilot(selectedRepos);
  }, [handleStartCopilot, selectedRepos]);

  const handleCheckAgentStatusWrapper = useCallback(() => {
    handleCheckAgentStatus(selectedRepos);
  }, [handleCheckAgentStatus, selectedRepos]);

  const handlePreviewPrsWrapper = useCallback(() => {
    handlePreviewPrs(selectedRepos);
  }, [handlePreviewPrs, selectedRepos]);

  return (
    <div className={styles.form} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <RepoSelector
        filterText={filterText}
        onFilterChange={setFilterText}
        shown={shown}
        selectedRepos={selectedRepos}
        allShownSelected={allShownSelected}
        onSelectAll={handleSelectAll}
        onClear={handleClear}
        onToggleRepo={handleToggleRepo}
        onRemoveRepo={handleRemoveRepo}
      />

      <CopilotAgentsSection
        selectedReposSize={selectedRepos.size}
        copilotTitle={copilotTitle}
        onCopilotTitleChange={setCopilotTitle}
        copilotBody={copilotBody}
        onCopilotBodyChange={setCopilotBody}
        copilotRunning={copilotRunning}
        onStartCopilot={handleStartCopilotWrapper}
        onCancelCopilot={handleCancelCopilot}
        copilotRows={copilotRows}
        agentStatus={agentStatus}
        checkedAt={checkedAt}
        agentChecking={agentChecking}
        lastRunManual={lastRunManual}
        onCheckAgentStatus={handleCheckAgentStatusWrapper}
        onCancelAgentCheck={handleCancelAgentCheck}
      />

      <MergePullRequestsSection
        selectedReposSize={selectedRepos.size}
        prTitleFilter={prTitleFilter}
        onPrTitleFilterChange={setPrTitleFilter}
        prAuthorFilter={prAuthorFilter}
        onPrAuthorFilterChange={setPrAuthorFilter}
        prBranchFilter={prBranchFilter}
        onPrBranchFilterChange={setPrBranchFilter}
        mergeMethod={mergeMethod}
        onMergeMethodChange={setMergeMethod}
        prMatches={prMatches}
        onPrMatchesChange={setPrMatches}
        prPreviewing={prPreviewing}
        prMerging={prMerging}
        mergeConfirm={mergeConfirm}
        onSetMergeConfirm={setMergeConfirm}
        mergeSummary={mergeSummary}
        includedCount={includedCount}
        onPreviewPrs={handlePreviewPrsWrapper}
        onCancelPreview={handleCancelPreview}
        onMergePrs={handleMergePrs}
        onCancelMerge={handleCancelMerge}
      />
    </div>
  );
}
