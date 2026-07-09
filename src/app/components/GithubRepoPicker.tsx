"use client";

import { useEffect, useRef, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { githubConfiguredAction, listGithubReposAction, listGithubBranchesAction } from "../actions";
import Typeahead from "./ui/Typeahead";
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
      <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", margin: 0 }}>
        GitHub isn&apos;t configured. Set the <code>GITHUB_TOKEN</code> environment variable to enable repository features.
      </p>
    );
  }

  return (
    <div>
      <Autocomplete
        freeSolo
        options={repos.map((r) => r.fullName)}
        value={value}
        onInputChange={(_, v) => onChange(v)}
        disabled={disabled || state === "loading"}
        size="small"
        fullWidth
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={state === "loading" ? "Loading repositories..." : placeholder}
          />
        )}
      />
      {state === "error" && error && <p style={{ fontSize: "0.8rem", color: "var(--danger)", marginTop: 4 }}>{error}</p>}

      {onBranchChange && value.trim() && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Branch</span>
          <Typeahead
            options={branches.map((b, i) => ({ value: b, label: i === 0 ? b + " (default)" : b }))}
            value={branch ?? ""}
            onChange={(v) => onBranchChange(v)}
            placeholder={branchState === "loading" ? "Loading branches..." : "Select a branch..."}
            disabled={disabled || branchState !== "ready"}
            loading={branchState === "loading"}
          />
        </div>
      )}
    </div>
  );
}
