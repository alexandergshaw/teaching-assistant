import { classifyGithubFailure } from "@/lib/github-rate-limit";

export class PreparationGithubThrottle extends Error {
  constructor(readonly rateLimit: { retryAtMs: number | null; primary: boolean }) {
    super("GitHub rate limited repository preparation.");
  }
}

function retryAfterTime(raw: string | null, now: number): number | null {
  const value = raw?.trim();
  if (!value) return null;
  const isSeconds = /^\d+$/.test(value);
  const isHttpDate = /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(value);
  if (!isSeconds && !isHttpDate) return null;
  const parsed = isSeconds ? now + Number(value) * 1000 : Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed <= 8.64e15 ? parsed : null;
}

/** Only response metadata is retained; upstream error messages are discarded. */
export function preparationGithubThrottle(status: number, headers: { get(name: string): string | null }): PreparationGithubThrottle | undefined {
  const now = Date.now();
  const verdict = classifyGithubFailure(status, headers, now);
  const retryAfter = retryAfterTime(headers.get("retry-after"), now);
  if (status !== 429 && verdict.kind !== "rate-limited" && !(status === 403 && retryAfter !== null)) return undefined;
  const retryAtMs = Math.max(verdict.remaining === 0 ? verdict.resetAtMs ?? 0 : 0, retryAfter ?? 0);
  return new PreparationGithubThrottle({ retryAtMs: retryAtMs > now ? retryAtMs : null, primary: verdict.remaining === 0 });
}
