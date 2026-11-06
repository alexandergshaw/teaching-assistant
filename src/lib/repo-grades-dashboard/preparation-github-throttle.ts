import { classifyGithubFailure } from "@/lib/github-rate-limit";

export class PreparationGithubThrottle extends Error {
  constructor(readonly rateLimit: { retryAtMs: number | null; primary: boolean }) {
    super("GitHub rate limited repository preparation.");
  }
}

/** Only response metadata is retained; upstream error messages are discarded. */
export function preparationGithubThrottle(status: number, headers: { get(name: string): string | null }): PreparationGithubThrottle | undefined {
  const now = Date.now();
  const verdict = classifyGithubFailure(status, headers, now);
  if (status !== 429 && verdict.kind !== "rate-limited") return undefined;
  const raw = headers.get("retry-after");
  const parsed = raw && /^\d+$/.test(raw) ? now + Number(raw) * 1000 : Date.parse(raw ?? "");
  const retryAtMs = Math.max(verdict.remaining === 0 ? verdict.resetAtMs ?? 0 : 0, Number.isFinite(parsed) ? parsed : 0);
  return new PreparationGithubThrottle({ retryAtMs: retryAtMs > now ? retryAtMs : null, primary: verdict.remaining === 0 });
}
