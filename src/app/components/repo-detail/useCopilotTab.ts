"use client";

import { useEffect, useState } from "react";
import { createCopilotTaskAction, listCopilotTasksAction } from "../../actions";
import type { CopilotTask } from "@/lib/github";

// Owns the Copilot tab: assigning tasks to GitHub's Copilot coding agent and
// polling the task list (with its linked PR status) while the tab is open.
export function useCopilotTab(repoRef: string, tab: string) {
  const [copilotTaskTitle, setCopilotTaskTitle] = useState("");
  const [copilotTaskBody, setCopilotTaskBody] = useState("");
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [copilotTaskMsg, setCopilotTaskMsg] = useState<{ kind: "success" | "error"; text: string; url?: string } | null>(null);
  const [copilotTasks, setCopilotTasks] = useState<CopilotTask[]>([]);
  const [copilotTasksState, setCopilotTasksState] = useState<"idle" | "loading" | "error">("idle");
  const [copilotLastLoaded, setCopilotLastLoaded] = useState<string | null>(null);

  // Load the loaded repo's Copilot tasks when the Copilot tab is active.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!repoRef || tab !== "copilot") return;
    let cancelled = false;
    setCopilotTasksState("loading");
    (async () => {
      const r = await listCopilotTasksAction(repoRef);
      if (cancelled) return;
      if ("error" in r) {
        setCopilotTasksState("error");
        return;
      }
      setCopilotTasks(r.tasks);
      setCopilotTasksState("idle");
      setCopilotLastLoaded(new Date().toISOString());
    })();
    return () => {
      cancelled = true;
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [repoRef, tab]);

  // Keep the agent view live: poll for updates while the Copilot tab is open.
  useEffect(() => {
    if (!repoRef || tab !== "copilot") return;
    const id = setInterval(() => {
      (async () => {
        const r = await listCopilotTasksAction(repoRef);
        if (!("error" in r)) {
          setCopilotTasks(r.tasks);
          setCopilotLastLoaded(new Date().toISOString());
        }
      })();
    }, 20000);
    return () => clearInterval(id);
  }, [repoRef, tab]);

  const reloadCopilotTasks = async () => {
    if (!repoRef) return;
    setCopilotTasksState("loading");
    const r = await listCopilotTasksAction(repoRef);
    if ("error" in r) {
      setCopilotTasksState("error");
      return;
    }
    setCopilotTasks(r.tasks);
    setCopilotTasksState("idle");
    setCopilotLastLoaded(new Date().toISOString());
  };

  const handleCreateCopilotTask = async () => {
    if (!repoRef || !copilotTaskTitle.trim()) return;
    setCopilotBusy(true);
    setCopilotTaskMsg(null);
    const r = await createCopilotTaskAction(repoRef, copilotTaskTitle, copilotTaskBody);
    setCopilotBusy(false);
    if ("error" in r) {
      setCopilotTaskMsg({ kind: "error", text: r.error });
      return;
    }
    setCopilotTaskMsg({ kind: "success", text: `Created task #${r.issueNumber} and assigned Copilot.`, url: r.issueUrl });
    setCopilotTaskTitle("");
    setCopilotTaskBody("");
    await reloadCopilotTasks();
  };

  return {
    copilotTaskTitle,
    setCopilotTaskTitle,
    copilotTaskBody,
    setCopilotTaskBody,
    copilotBusy,
    copilotTaskMsg,
    copilotTasks,
    copilotTasksState,
    copilotLastLoaded,
    reloadCopilotTasks,
    handleCreateCopilotTask,
  };
}
