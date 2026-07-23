"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  listGithubReposAction,
  createRepoAction,
  createRepoFromTemplateAction,
  createCopilotRepoAction,
} from "../../actions";
import type { GithubRepo } from "@/lib/github";

// Owns the "New repository" panel: plain create, Copilot-scaffolded create,
// and create-from-template, all of which select the new repo when done.
export function useCreateRepoPanel(
  repos: GithubRepo[],
  setRepos: Dispatch<SetStateAction<GithubRepo[]>>,
  setRepoRef: Dispatch<SetStateAction<string>>
) {
  // Create repo state
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPrivate, setCreatePrivate] = useState(true);
  const [createTemplate, setCreateTemplate] = useState(false);
  const [createPrompt, setCreatePrompt] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [createResult, setCreateResult] = useState<{ fullName: string; htmlUrl: string; issueUrl?: string; copilotNote?: string } | null>(null);
  // Create-from-template state.
  const [createFromTemplate, setCreateFromTemplate] = useState(false);
  const [templateSource, setTemplateSource] = useState("");

  const handleCreateRepo = async () => {
    const name = createName.trim();
    if (!name) return;
    setCreateBusy(true);
    setCreateMsg(null);
    setCreateResult(null);
    const r = createPrompt.trim()
      ? await createCopilotRepoAction(name, createPrompt, createPrivate, undefined, createTemplate, createDescription)
      : await createRepoAction(name, createDescription, createPrivate, createTemplate);
    setCreateBusy(false);
    if ("error" in r) {
      setCreateMsg(`Error: ${r.error}`);
      return;
    }
    const fullName = "repo" in r ? r.repo.fullName : r.fullName;
    const htmlUrl = "repo" in r ? r.repo.htmlUrl : r.htmlUrl;
    const issueUrl = "repo" in r ? undefined : r.issueUrl;
    const copilotNote = "repo" in r ? undefined : r.copilotNote;
    setCreateResult({ fullName, htmlUrl, issueUrl, copilotNote });
    const list = await listGithubReposAction();
    if (!("error" in list)) setRepos(list.repos);
    setRepoRef(fullName);
    setCreateName("");
    setCreateDescription("");
    setCreatePrompt("");
    setShowCreate(false);
  };

  // Create a new repo from another repo used as a template. If the source isn't
  // marked as a template yet, warn and mark it as part of this operation.
  const handleCreateFromTemplate = async () => {
    const name = createName.trim();
    if (!name) return;
    if (!templateSource.trim()) {
      setCreateMsg("Error: choose a source repository to use as the template.");
      return;
    }
    const source = repos.find((r) => r.fullName === templateSource);
    let markTemplate = false;
    if (!source?.isTemplate) {
      const ok =
        typeof window !== "undefined" &&
        window.confirm(
          `"${templateSource}" isn't marked as a template. Mark it as a template and create "${name}" from it?`
        );
      if (!ok) return;
      markTemplate = true;
    }
    setCreateBusy(true);
    setCreateMsg(null);
    setCreateResult(null);
    const r = await createRepoFromTemplateAction(templateSource, name, createPrivate, markTemplate);
    setCreateBusy(false);
    if ("error" in r) {
      setCreateMsg(`Error: ${r.error}`);
      return;
    }
    setCreateResult({ fullName: r.repo.fullName, htmlUrl: r.repo.htmlUrl });
    const list = await listGithubReposAction();
    if (!("error" in list)) setRepos(list.repos);
    setRepoRef(r.repo.fullName);
    setCreateName("");
    setShowCreate(false);
    setCreateFromTemplate(false);
    setTemplateSource("");
  };

  return {
    showCreate,
    setShowCreate,
    createName,
    setCreateName,
    createDescription,
    setCreateDescription,
    createPrivate,
    setCreatePrivate,
    createTemplate,
    setCreateTemplate,
    createPrompt,
    setCreatePrompt,
    createBusy,
    createMsg,
    createResult,
    createFromTemplate,
    setCreateFromTemplate,
    templateSource,
    setTemplateSource,
    handleCreateRepo,
    handleCreateFromTemplate,
  };
}
