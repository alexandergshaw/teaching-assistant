import { useCallback, useEffect, useRef, useState } from "react";
import { createCopilotTaskAction, listCopilotTasksAction } from "@/app/actions";
import type { CopilotTask } from "@/lib/github";

type CopilotRow = { repo: string; status: "pending" | "done" | "failed" | "skipped"; detail?: string };

interface UseCopilotAgentsOptions {
  active?: boolean;
}

export function useCopilotAgents({ active = true }: UseCopilotAgentsOptions) {
  const [copilotTitle, setCopilotTitle] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-copilot-title") ?? "" : ""
  );
  const [copilotBody, setCopilotBody] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ta-vc-bulk-copilot-body") ?? "" : ""
  );
  const [copilotRows, setCopilotRows] = useState<CopilotRow[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem("ta-vc-bulk-copilot-rows");
    if (!stored) return [];
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (!Array.isArray(parsed)) return [];
      const rows = parsed.filter((row): row is CopilotRow => {
        const r = row as Record<string, unknown>;
        return (
          typeof row === "object" &&
          row !== null &&
          typeof r.repo === "string" &&
          typeof r.status === "string" &&
          ["pending", "done", "failed", "skipped"].includes(r.status)
        );
      });
      return rows.map((row) => ({
        ...row,
        status: row.status === "pending" ? "skipped" : row.status,
      }));
    } catch {
      return [];
    }
  });
  const [copilotRunning, setCopilotRunning] = useState(false);
  const copilotCancelRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-copilot-title", copilotTitle);
  }, [copilotTitle]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-copilot-body", copilotBody);
  }, [copilotBody]);

  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("ta-vc-bulk-copilot-rows", JSON.stringify(copilotRows));
  }, [copilotRows]);

  const [agentStatus, setAgentStatus] = useState<Record<string, CopilotTask[]>>({});
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [agentChecking, setAgentChecking] = useState(false);
  const [lastRunManual, setLastRunManual] = useState(false);
  const agentCancelRef = useRef(false);
  const autoPopulatedRef = useRef(false);

  const runAgentCheck = useCallback(
    async (selectedRepos: Set<string>, manual = false) => {
      if (agentChecking) return;

      const reposToCheck = new Set<string>([...selectedRepos, ...copilotRows.map((r) => r.repo)]);
      if (reposToCheck.size === 0) return;

      setAgentChecking(true);
      setLastRunManual(manual);
      agentCancelRef.current = false;
      const newStatus: Record<string, CopilotTask[]> = {};

      for (const repo of reposToCheck) {
        if (agentCancelRef.current) break;

        const result = await listCopilotTasksAction(repo);
        if (agentCancelRef.current) break;

        if (!("error" in result)) {
          newStatus[repo] = result.tasks;
        }
      }

      setAgentStatus(newStatus);
      setCheckedAt(Date.now());
      setAgentChecking(false);
    },
    [agentChecking, copilotRows]
  );

  const handleCheckAgentStatus = useCallback(
    async (selectedRepos: Set<string>) => {
      await runAgentCheck(selectedRepos, true);
    },
    [runAgentCheck]
  );

  const handleCancelAgentCheck = useCallback(() => {
    agentCancelRef.current = true;
  }, []);

  const handleStartCopilot = useCallback(
    async (selectedRepos: Set<string>) => {
      const selected = [...selectedRepos];
      if (selected.length === 0 || !copilotTitle.trim()) return;

      setCopilotRunning(true);
      copilotCancelRef.current = false;
      setCopilotRows(selected.map((r) => ({ repo: r, status: "pending" })));

      for (let i = 0; i < selected.length; i++) {
        if (copilotCancelRef.current) {
          setCopilotRows((prev) =>
            prev.map((row, idx) => (idx > i ? { ...row, status: "skipped" } : row))
          );
          break;
        }

        const repo = selected[i];
        setCopilotRows((prev) =>
          prev.map((row) => (row.repo === repo ? { ...row, status: "pending" } : row))
        );

        const result = await createCopilotTaskAction(repo, copilotTitle.trim(), copilotBody);
        if (copilotCancelRef.current) {
          setCopilotRows((prev) =>
            prev.map((row) => (row.repo === repo ? { ...row, status: "skipped" } : row))
          );
          break;
        }

        if ("error" in result) {
          setCopilotRows((prev) =>
            prev.map((row) =>
              row.repo === repo ? { ...row, status: "failed", detail: result.error } : row
            )
          );
        } else {
          setCopilotRows((prev) =>
            prev.map((row) =>
              row.repo === repo
                ? { ...row, status: "done", detail: result.issueUrl }
                : row
            )
          );
        }
      }

      setCopilotRunning(false);
    },
    [copilotTitle, copilotBody]
  );

  const handleCancelCopilot = useCallback(() => {
    copilotCancelRef.current = true;
  }, []);

  useEffect(() => {
    if (!active || agentChecking) return;

    const reposToCheck = new Set<string>([...copilotRows.map((r) => r.repo)]);

    if (reposToCheck.size === 0 || Object.keys(agentStatus).length > 0) return;

    if (!autoPopulatedRef.current) {
      autoPopulatedRef.current = true;
      runAgentCheck(new Set(), false);
    }
  }, [active, copilotRows, agentStatus, agentChecking, runAgentCheck]);

  useEffect(() => {
    if (!active) {
      autoPopulatedRef.current = false;
    }
  }, [active]);

  const prevCopilotRunningRef = useRef(copilotRunning);
  useEffect(() => {
    if (prevCopilotRunningRef.current && !copilotRunning && copilotRows.some((r) => r.status === "done")) {
      runAgentCheck(new Set(), false);
    }
    prevCopilotRunningRef.current = copilotRunning;
  }, [copilotRunning, copilotRows, runAgentCheck]);

  useEffect(() => {
    if (!active) return;

    const interval = setInterval(() => {
      if (!agentChecking) {
        runAgentCheck(new Set(), false);
      }
    }, 90000);

    return () => clearInterval(interval);
  }, [active, agentChecking, runAgentCheck]);

  return {
    copilotTitle,
    setCopilotTitle,
    copilotBody,
    setCopilotBody,
    copilotRows,
    setCopilotRows,
    copilotRunning,
    agentStatus,
    checkedAt,
    agentChecking,
    lastRunManual,
    handleStartCopilot,
    handleCancelCopilot,
    handleCheckAgentStatus,
    handleCancelAgentCheck,
  };
}

export type { CopilotRow };
