"use client";

import { useEffect, useState } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { useSupabase } from "@/context/SupabaseProvider";
import { isOwnerDecision } from "@/lib/access";
import type { GithubQuotaResult } from "@/lib/github-quota";
import { checkRepoGradesGithubQuota, githubQuotaSnapshotIsStale } from "./repoGradesGithubQuotaClient";

export default function RepoGradesGithubQuota() {
  const { user, accessDecision } = useSupabase();
  return user && isOwnerDecision(accessDecision)
    ? <RepoGradesGithubQuotaReport key={user.id} accountId={user.id} />
    : null;
}

function quotaStatus(result: GithubQuotaResult | undefined, stale: boolean) {
  if (!result) return "Checking GitHub quota…";
  if (result.status === "not-configured") return "Quota unknown. GitHub is not configured.";
  if (result.status === "throttled") return "GitHub throttled the quota check. The primary quota is unknown.";
  if (result.status !== "observed") return "GitHub quota could not be checked.";
  if (stale) {
    return result.remaining === 0
      ? "Snapshot is stale. The primary quota was exhausted at the last check."
      : "Snapshot is stale. The current quota is unknown.";
  }
  if (result.remaining === null) return "GitHub did not report usable remaining quota.";
  return result.remaining === 0 ? "Primary quota exhausted at the last check." : "Primary quota available at the last check.";
}

function timeLeft(resetAtMs: number, nowMs: number) {
  const seconds = Math.ceil((resetAtMs - nowMs) / 1_000);
  if (seconds <= 0) return "Reported reset time passed";
  return seconds < 60 ? `${seconds} sec left` : `${Math.floor(seconds / 60)} min ${seconds % 60} sec left`;
}

export function RepoGradesGithubQuotaReport({ accountId }: { accountId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<{ attempt: number; result: GithubQuotaResult }>();
  const [nowMs, setNowMs] = useState(0);
  const pending = settled?.attempt !== attempt;
  const result = settled?.result;
  const snapshot = result?.status === "observed" ? result : null;
  const stale = !!snapshot && githubQuotaSnapshotIsStale(snapshot, nowMs);
  const warning = !!snapshot && !stale && snapshot.remaining === 0;

  useEffect(() => {
    const controller = new AbortController();
    async function checkQuota() {
      const check = await checkRepoGradesGithubQuota(accountId, controller.signal);
      if (!check || controller.signal.aborted) return;
      setNowMs(check.nowMs);
      setSettled({ attempt, result: check.result });
    }
    void checkQuota();
    return () => controller.abort();
  }, [accountId, attempt]);

  useEffect(() => {
    if (!snapshot) return;
    const lastUpdate = Math.max(snapshot.resetAtMs ?? 0, snapshot.staleAtMs);
    if (Date.now() >= lastUpdate) return;
    const clock = window.setInterval(() => {
      const now = Date.now();
      setNowMs(now);
      if (now >= lastUpdate) window.clearInterval(clock);
    }, 1_000);
    return () => window.clearInterval(clock);
  }, [snapshot]);

  return (
    <Stack component="section" aria-label="GitHub API quota" direction={{ xs: "column", sm: "row" }}
      spacing={1} sx={{
        alignItems: { xs: "flex-start", sm: "center" }, justifyContent: "space-between",
        border: "1px solid var(--field-border)", borderInlineStart: warning ? "4px solid var(--warning-ink)" : undefined,
        bgcolor: warning ? "var(--warning-surface)" : undefined, borderRadius: "var(--radius-md)", p: "var(--space-3)",
      }}>
      <Box>
        <Typography component="h2" variant="body2" sx={{ fontWeight: 700 }}>GitHub API quota</Typography>
        <Typography variant="body2" role="status">
          {pending && settled ? "Checking GitHub quota…" : quotaStatus(result, stale)}
          {snapshot && (
            <> Limit {snapshot.limit?.toLocaleString() ?? "unknown"} · Remaining {snapshot.remaining?.toLocaleString() ?? "unknown"}.</>
          )}
        </Typography>
        {snapshot && (
          <Typography variant="caption" component="p">
            Checked <time dateTime={new Date(snapshot.observedAtMs).toISOString()}>{new Date(snapshot.observedAtMs).toLocaleTimeString()}</time>
            {" · Reset "}
            {snapshot.resetAtMs === null ? "unknown" : (
              <>
                <time dateTime={new Date(snapshot.resetAtMs).toISOString()}>{new Date(snapshot.resetAtMs).toLocaleString()}</time>
                {" ("}<Box component="span" role="timer">{timeLeft(snapshot.resetAtMs, nowMs)}</Box>{")"}
              </>
            )}
          </Typography>
        )}
      </Box>
      <Button type="button" size="small" variant="outlined" aria-disabled={pending} onClick={() => {
        if (!pending) setAttempt(attempt + 1);
      }}>
        Refresh GitHub quota
      </Button>
    </Stack>
  );
}
