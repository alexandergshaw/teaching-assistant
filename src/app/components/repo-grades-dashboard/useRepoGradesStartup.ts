"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import {
  startRepoGradesStartup,
  type RepoGradesStartupAdapter,
} from "./startup-coordinator";
import type { RepoGradesStartupProgress } from "./startup-progress";

type StartupView = Readonly<{ progress: RepoGradesStartupProgress; stop?: () => void }>;

export function useRepoGradesStartup(accountId: string | null, adapter: RepoGradesStartupAdapter): StartupView {
  const session = useMemo(() => ({ accountId, adapter }), [accountId, adapter]);
  const [current, setCurrent] = useState<(StartupView & { session: typeof session }) | null>(null);

  useLayoutEffect(() => {
    const { accountId, adapter } = session;
    if (!accountId || adapter.status === "disabled") return;
    const scope = { accountId, generation: crypto.randomUUID() };
    const run = startRepoGradesStartup(scope, adapter, (progress) => {
      setCurrent({ session, progress, stop: run.stop });
    });
    return run.dispose;
  }, [session]);

  if (current?.session === session) return current;
  return { progress: { phase: accountId && adapter.status === "configured" ? "checking" : "unavailable", courses: [] } };
}
