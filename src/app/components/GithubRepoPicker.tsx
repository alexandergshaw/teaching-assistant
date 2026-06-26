"use client";

import { useEffect, useState } from "react";
import { githubConfiguredAction, listGithubReposAction } from "../actions";
import type { GithubRepo } from "@/lib/github";

/**
 * A small reusable repository selector: a type-to-filter input backed by a
 * datalist of the token's repos, with free-text entry (owner/name) as a
 * fallback. Shared by every GitHub feature. Reports the chosen "owner/name"
 * string through `onChange`.
 */
export default function GithubRepoPicker({
  value,
  onChange,
  disabled,
  placeholder = "owner/repository",
}: {
  value: string;
  onChange: (repoRef: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "unconfigured" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

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
    </div>
  );
}
