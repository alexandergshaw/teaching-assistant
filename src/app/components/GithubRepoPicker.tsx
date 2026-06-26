"use client";

import { useEffect, useRef, useState } from "react";
import { githubConfiguredAction, listGithubReposAction, listGithubBranchesAction } from "../actions";
import type { GithubRepo } from "@/lib/github";

/**
 * A small reusable repository selector: a type-to-filter input backed by a
 * datalist of the token's repos, with free-text entry (owner/name) as a
 * fallback. Shared by every GitHub feature. Reports the chosen "owner/name"
 * string through `onChange`. When `onBranchChange` is supplied, it also renders a
 * branch dropdown that loads the repo's branches and defaults to the default
 * branch.
 */
export default function GithubRepoPicker({
  value,
  onChange,
  disabled,
  placeholder = "owner/repository",
  branch,
  onBranchChange,
}: {
  value: string;
  onChange: (repoRef: string) => void;
  disabled?: boolean;
  placeholder?: string;
  branch?: string;
  onBranchChange?: (branch: string) => void;
}) {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unconfigured" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [branchState, setBranchState] = useState<"idle" | "loading" | "ready">("idle");
  // Read the current branch without re-running the load effect when it changes.
  const branchRef = useRef(branch);
  useEffect(() => {
    branchRef.current = branch;
  }, [branch]);

  // Load the chosen repo's branches (debounced) and default to its default branch.
  // Client-only fetch effect, so the set-state-in-effect rule is suppressed here.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!onBranchChange) return;
    const ref = value.trim();
    if (!ref) {
      setBranches([]);
      setBranchState("idle");
      return;
    }
    let cancelled = false;
    setBranchState("loading");
    const timer = setTimeout(async () => {
      const r = await listGithubBranchesAction(ref);
      if (cancelled) return;
      if ("error" in r) {
        setBranches([]);
        setBranchState("idle");
        return;
      }
      setBranches(r.branches);
      setBranchState("ready");
      if (!branchRef.current || !r.branches.includes(branchRef.current)) onBranchChange(r.defaultBranch);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [value, onBranchChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await githubConfiguredAction();
      if (cancelled) return;
      if (!cfg.configured) {
        setState("unconfigured");
        return;
      }
      const r = await listGithubReposAction();
      if (cancelled) return;
      if ("error" in r) {
        setError(r.error);
        setState("error");
        return;
      }
      setRepos(r.repos);
      setState("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === "unconfigured") {
    return (
      <p style={{ fontSize: "0.82rem", color: "#94a3b8", margin: 0 }}>
        GitHub isn&apos;t configured. Set the <code>GITHUB_TOKEN</code> environment variable to enable repository features.
      </p>
    );
  }

  return (
    <div>
      <input
        type="text"
        list="ta-github-repos"
        value={value}
        disabled={disabled || state === "loading"}
        placeholder={state === "loading" ? "Loading repositories…" : placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.9rem" }}
      />
      <datalist id="ta-github-repos">
        {repos.map((r) => (
          <option key={r.fullName} value={r.fullName}>
            {r.private ? "private" : "public"}
            {r.description ? ` · ${r.description}` : ""}
          </option>
        ))}
      </datalist>
      {state === "error" && error && <p style={{ fontSize: "0.8rem", color: "#dc2626", marginTop: 4 }}>{error}</p>}

      {onBranchChange && value.trim() && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: "0.8rem", color: "#475569" }}>Branch</span>
          <select
            value={branch ?? ""}
            disabled={disabled || branchState !== "ready"}
            onChange={(e) => onBranchChange(e.target.value)}
            style={{ flex: "0 1 240px", padding: "6px 8px", border: "1px solid var(--field-border, #cbd5e1)", borderRadius: 8, fontSize: "0.85rem", background: "#fff", color: "#334155" }}
          >
            {branchState === "loading" && <option value="">Loading branches…</option>}
            {branchState === "ready" && branches.length === 0 && <option value="">(no branches)</option>}
            {branches.map((b, i) => (
              <option key={b} value={b}>
                {b}
                {i === 0 ? " (default)" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
