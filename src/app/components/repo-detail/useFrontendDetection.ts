"use client";

import { useEffect, useState } from "react";
import { detectRepoFrontendAction } from "../../actions";
import type { BackendInfo } from "@/lib/frontend-detect";

// Detects the selected repo's frontend/backend framework so RepoDetail can
// show sandbox links (StackBlitz / CodeSandbox / Codespaces) above the tabs.
export function useFrontendDetection(repoRef: string) {
  const [frontend, setFrontend] = useState<{ framework: string; devCommand: string } | null>(null);
  const [backend, setBackend] = useState<BackendInfo | null>(null);
  const [frontendChecked, setFrontendChecked] = useState(false);

  // Detect frontend and backend frameworks when repo changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!repoRef) {
      setFrontend(null);
      setBackend(null);
      setFrontendChecked(false);
      return;
    }
    setFrontendChecked(false);
    setFrontend(null);
    setBackend(null);
    (async () => {
      const r = await detectRepoFrontendAction(repoRef);
      if ("error" in r) {
        setFrontendChecked(true);
        return;
      }
      setFrontend(r.frontend);
      setBackend(r.backend);
      setFrontendChecked(true);
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [repoRef]);

  return { frontend, backend, frontendChecked };
}
