"use client";

import { useEffect, useId, useState } from "react";
import { Box, Button, Popover, Stack, Typography } from "@mui/material";
import { useSupabase } from "@/context/SupabaseProvider";
import { isOwnerDecision } from "@/lib/access";
import type { GithubQuotaResult } from "@/lib/github-quota";
import {
  checkRepoGradesGithubQuota, githubQuotaNextCheckAt, githubQuotaSnapshotIsStale, type QuotaSnapshot,
} from "./repoGradesGithubQuotaClient";

export default function RepoGradesGithubQuota() {
  const { user, accessDecision } = useSupabase();
  return user && isOwnerDecision(accessDecision)
    ? <RepoGradesGithubQuotaReport key={user.id} accountId={user.id} />
    : null;
}

function quotaStatus(result: GithubQuotaResult | undefined, stale: boolean) {
  if (!result) return "Checking GitHub quota.";
  if (result.status === "not-configured") return "Quota unknown. GitHub is not configured.";
  if (result.status === "throttled") return "GitHub throttled the quota check. The primary quota is unknown.";
  if (result.status !== "observed") return "GitHub quota could not be checked.";
  if (stale) return "The current primary quota is unknown.";
  if (result.remaining === null) return "GitHub did not report usable remaining quota.";
  return result.remaining === 0 ? "Primary quota exhausted at the last check." : "Primary quota available at the last check.";
}

function resetTiming(resetAtMs: number | null, nowMs: number) {
  if (resetAtMs === null) return "reset unknown";
  const minutes = Math.ceil((resetAtMs - nowMs) / 60_000);
  if (minutes <= 0) return "reset time passed";
  return `resets in ${minutes} min`;
}

type QuotaCheck = NonNullable<Awaited<ReturnType<typeof checkRepoGradesGithubQuota>>>;

export function RepoGradesGithubQuotaReport({ accountId }: { accountId: string }) {
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<QuotaCheck & { attempt: number; snapshot: QuotaSnapshot | null }>();
  const [nowMs, setNowMs] = useState(0);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const detailsId = useId();
  const headingId = useId();
  const pending = settled?.attempt !== attempt;
  const result = settled?.result;
  const snapshot = settled?.snapshot;
  const stale = !!snapshot && (result?.status !== "observed" || githubQuotaSnapshotIsStale(snapshot, nowMs));
  const warning = !!snapshot && !stale && snapshot.remaining === 0;

  useEffect(() => {
    const controller = new AbortController();
    async function checkQuota() {
      const check = await checkRepoGradesGithubQuota(accountId, controller.signal);
      if (!check || controller.signal.aborted) return;
      setNowMs(check.nowMs);
      setSettled((previous) => ({
        ...check,
        attempt,
        snapshot: check.result.status === "observed" ? check.result
          : check.accessDenied || check.result.status === "not-configured" ? null : previous?.snapshot ?? null,
      }));
    }
    void checkQuota();
    return () => controller.abort();
  }, [accountId, attempt]);

  useEffect(() => {
    if (pending || !settled || settled.accessDenied) return;
    const dueAtMs = githubQuotaNextCheckAt(settled.result, settled.nowMs);
    if (dueAtMs === null) return;
    let timer: number;
    const schedule = () => {
      window.clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      const remaining = dueAtMs - Date.now();
      if (remaining > 0) timer = window.setTimeout(schedule, Math.min(remaining, 2_147_483_647));
      else setAttempt((current) => current === settled.attempt ? current + 1 : current);
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [pending, settled]);

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

  const remaining = snapshot?.remaining?.toLocaleString() ?? "unknown";
  const limit = snapshot?.limit?.toLocaleString() ?? "unknown";
  return (
    <Box component="section" aria-label="GitHub API quota" sx={{
      position: "sticky",
      // Match the Courses table's offset below the top bar, banner, and 45px tab strip.
      top: "calc(var(--topbar-height, 58px) + var(--in-session-banner-height, 0px) + 45px)",
      zIndex: 5,
      bgcolor: "var(--card-background)",
      py: "var(--space-1)",
    }}>
      <Button id={headingId} aria-controls={anchor ? detailsId : undefined} aria-expanded={!!anchor}
        aria-haspopup="dialog" onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ textTransform: "none", bgcolor: warning ? "var(--warning-surface)" : undefined }}>
        <span>
          GitHub API: {snapshot ? `${remaining} / ${limit} left${stale ? " (stale)" : ""}` : pending ? "checking" : "quota unknown"}
          {snapshot && <Box component="span" role="timer" sx={{ color: "text.secondary" }}>{` · ${resetTiming(snapshot.resetAtMs, nowMs)}`}</Box>}
        </span>
      </Button>
      <Popover id={detailsId} open={!!anchor} anchorEl={anchor} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}>
        <Stack role="dialog" aria-labelledby={headingId} spacing={1} sx={{ p: 2, maxWidth: 320, alignItems: "flex-start" }}>
          <Typography component="h2" variant="body2" sx={{ fontWeight: 700 }}>GitHub API quota</Typography>
          <Typography variant="body2" role="status">
            {pending ? "Checking GitHub quota." : quotaStatus(result, stale)}
            {snapshot && ` ${stale ? "Last known" : "Reported"}: ${remaining} of ${limit} primary requests remaining.`}
          </Typography>
          {snapshot && (
            <Typography variant="caption" component="p">
              Checked <time dateTime={new Date(snapshot.observedAtMs).toISOString()}>{new Date(snapshot.observedAtMs).toLocaleString()}</time>
              {" · Reset "}
              {snapshot.resetAtMs === null ? "unknown" : (
                <time dateTime={new Date(snapshot.resetAtMs).toISOString()}>{new Date(snapshot.resetAtMs).toLocaleString()}</time>
              )}
            </Typography>
          )}
          <Button type="button" size="small" variant="outlined" aria-disabled={pending} onClick={() => {
            if (!pending) setAttempt((current) => current === attempt ? current + 1 : current);
          }}>
            Refresh GitHub quota
          </Button>
        </Stack>
      </Popover>
    </Box>
  );
}
