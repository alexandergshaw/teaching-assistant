"use client";

import { useRef, useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import {
  generateCopilotProjectPromptAction,
  createCopilotRepoAction,
  listMyOrgsAction,
} from "../../actions";
import { getStoredProvider } from "@/lib/llm-provider";

export function useProjectPlanning() {
  const projectFileRef = useRef<HTMLInputElement>(null);
  const [projectFileName, setProjectFileName] = useState<string | null>(null);
  const [projectFileContent, setProjectFileContent] = useState<string | null>(null);
  const [isGeneratingProjectPrompt, setIsGeneratingProjectPrompt] = useState(false);
  const [projectPrompt, setProjectPrompt] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);

  const [repoName, setRepoName] = useState("");
  const [repoPrivate, setRepoPrivate] = useState(true);
  const [repoOrg, setRepoOrg] = useState("");
  const [repoTemplate, setRepoTemplate] = useState(false);
  const [repoOrgs, setRepoOrgs] = useState<string[]>([]);
  const [creatingRepo, setCreatingRepo] = useState(false);
  const [createdRepo, setCreatedRepo] = useState<{ fullName: string; htmlUrl: string } | null>(null);
  const [createRepoError, setCreateRepoError] = useState<string | null>(null);

  const loadRepoOrgs = async () => {
    const r = await listMyOrgsAction();
    if (!("error" in r)) setRepoOrgs(r.orgs);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await listMyOrgsAction();
      if (!cancelled && !("error" in r)) setRepoOrgs(r.orgs);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreateRepo = async () => {
    if (!projectPrompt) return;
    const name = repoName.trim() || (projectFileName ? projectFileName.replace(/\.[^.]+$/, "") : "course-project");
    setCreatingRepo(true);
    setCreateRepoError(null);
    setCreatedRepo(null);
    try {
      const r = await createCopilotRepoAction(name, projectPrompt, repoPrivate, repoOrg || undefined, repoTemplate);
      if ("error" in r) setCreateRepoError(r.error);
      else setCreatedRepo(r);
    } catch (err) {
      setCreateRepoError(err instanceof Error ? err.message : "Failed to create the repository.");
    } finally {
      setCreatingRepo(false);
    }
  };

  const handleProjectFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProjectFileName(file.name);
    setProjectPrompt(null);
    setProjectError(null);
    const reader = new FileReader();
    reader.onload = () => setProjectFileContent(reader.result as string);
    reader.onerror = () => setProjectError("Failed to read file.");
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleGenerateProjectPrompt = async (contentArg?: string, nameArg?: string) => {
    const content = contentArg ?? projectFileContent;
    const name = nameArg ?? projectFileName;
    if (!content || !name) {
      setProjectError("Please upload a schedule file first.");
      return;
    }
    setIsGeneratingProjectPrompt(true);
    setProjectError(null);
    setProjectPrompt(null);
    try {
      const promptResult = await generateCopilotProjectPromptAction(content, name, getStoredProvider());
      if ("error" in promptResult) {
        setProjectError(promptResult.error);
      } else {
        setProjectPrompt(promptResult.prompt);
      }
    } catch (err) {
      setProjectError(err instanceof Error ? err.message : "Failed to generate prompt.");
    } finally {
      setIsGeneratingProjectPrompt(false);
    }
  };

  return {
    projectFileRef,
    projectFileName,
    setProjectFileName,
    projectFileContent,
    setProjectFileContent,
    isGeneratingProjectPrompt,
    projectPrompt,
    setProjectPrompt,
    projectError,
    setProjectError,
    repoName,
    setRepoName,
    repoPrivate,
    setRepoPrivate,
    repoOrg,
    setRepoOrg,
    repoTemplate,
    setRepoTemplate,
    repoOrgs,
    creatingRepo,
    createdRepo,
    setCreatedRepo,
    createRepoError,
    setCreateRepoError,
    loadRepoOrgs,
    handleCreateRepo,
    handleProjectFileChange,
    handleGenerateProjectPrompt,
  };
}
