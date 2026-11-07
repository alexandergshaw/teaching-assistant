import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRepoGradeStartupHistory } from "./startup-history";
import { repoGradeStartupKey } from "./scheduler";

const { result } = vi.hoisted(() => ({ result: { rows: [] as unknown[] } }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: () => {
  const query = { select: () => query, eq: () => query, neq: () => query, in: () => query,
    order: () => query, limit: () => query, abortSignal: () => query,
    retry: async () => ({ data: result.rows, count: result.rows.length, error: null }) };
  return query;
} }) }));
const target = { accountId: "owner", courseId: "course", repo: "org/repo", folder: "lab", sourceRef: "main", sha: "a".repeat(40) };
const receipt = (generation: number, status: string, dispatch_state: string | null, mode = "automatic") => ({
  generation, user_id: "owner", course_id: "course", repo: "org/repo", folder: "lab", source_ref: "main",
  source_sha: target.sha, mode, status, dispatch_state, claimed_at: new Date().toISOString(),
});
async function observed() { return (await readRepoGradeStartupHistory("owner", "course", [target]))?.get(repoGradeStartupKey(target)); }
describe("automatic prepared-partial recovery history", () => {
  beforeEach(() => { result.rows = []; });
  it("schedules only a partial whose dispatch never started", async () => {
    result.rows = [receipt(1, "partial", "prepared")];
    expect(await observed()).toBe("recoverable-partial");
    result.rows = [receipt(1, "partial", "dispatched")];
    expect(await observed()).toBe("partial");
    result.rows = [receipt(1, "partial", null)];
    expect(await observed()).toBe("partial");
  });
  it("suppresses automatic retry after any retry or unresolved outcome", async () => {
    result.rows = [receipt(2, "partial", "prepared", "retry"), receipt(1, "partial", "prepared")];
    expect(await observed()).toBe("partial");
    result.rows = [receipt(2, "unknown", "prepared"), receipt(1, "partial", "prepared")];
    expect(await observed()).toBe("unknown");
    result.rows = [receipt(2, "succeeded", "dispatched"), receipt(1, "partial", "prepared")];
    expect(await observed()).toBe("succeeded");
  });
});
