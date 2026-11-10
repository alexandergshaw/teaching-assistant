import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ owner: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/auth", () => ({ requireAppOwner: mocks.owner }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({ from: mocks.from }) }));
import { readRepoGradeDiagnosticTargetsAction } from "./repo-grade-diagnostic-export";

function query(resolve: (filter: string, start: number, end: number) => unknown) {
  let filter = "", start = 0, end = 0;
  const chain: Record<string, unknown> = {};
  chain.select = chain.order = chain.limit = () => chain;
  chain.eq = (_field: string, value: string) => { filter = value; return chain; };
  chain.range = (a: number, b: number) => { start = a; end = b; return chain; };
  chain.retry = async () => resolve(filter, start, end);
  return chain;
}
const run = (id: string, phase = "complete") => ({ id, created_at: "2026-11-09T00:00:00Z", phase, repo_grade_automatic_courses: [{ state: "scanned" }] });
describe("repository diagnostic export", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.owner.mockResolvedValue({ id: "owner" }); });
  it("exports every state across distinct runs with validated links and fixed reasons", async () => {
    mocks.from.mockImplementation((table: string) => table === "repo_grade_automatic_runs"
      ? query(() => ({ data: [run("a"), run("b", "incomplete")], count: 2, error: null }))
      : query((id) => ({ data: id === "a" ? [{ id: 1, repo: "org/repo", state: "succeeded", reason: null }] : [{ id: 2, repo: "../secret", state: "blocked", reason: "secret injected" }], count: 1, error: null })));
    const result = await readRepoGradeDiagnosticTargetsAction("owner");
    expect(result).toMatchObject({ status: "partial", runCount: 2, targets: [{ repo: "org/repo", url: "https://github.com/org/repo", state: "succeeded", runPhase: "complete" }, { repo: "", linkStatus: "invalid", state: "blocked", runPhase: "incomplete" }] });
    expect(JSON.stringify(result)).not.toContain("secret injected");
  });
  it("refuses a mismatched or missing owner before reading", async () => {
    expect((await readRepoGradeDiagnosticTargetsAction("other")).status).toBe("unavailable");
    mocks.owner.mockRejectedValueOnce(new Error("auth"));
    expect((await readRepoGradeDiagnosticTargetsAction("owner")).status).toBe("unavailable");
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("pages targets and reports a run limit without claiming completeness", async () => {
    const entries = Array.from({ length: 201 }, (_, id) => ({ id, repo: `org/r${id}`, state: "unknown", reason: null }));
    mocks.from.mockImplementation((table: string) => table === "repo_grade_automatic_runs"
      ? query(() => ({ data: Array.from({ length: 20 }, (_, i) => run(String(i))), count: 21, error: null }))
      : query((id, start, end) => ({ data: id === "0" ? entries.slice(start, end + 1) : [], count: id === "0" ? entries.length : 0, error: null })));
    const result = await readRepoGradeDiagnosticTargetsAction("owner");
    expect(result).toMatchObject({ status: "partial", runCount: 20, runLimitReached: true, targetLimitReached: false });
    expect(result.targets).toHaveLength(201);
  });
  it("refuses short pages instead of silently omitting targets", async () => {
    mocks.from.mockImplementation((table: string) => table === "repo_grade_automatic_runs"
      ? query(() => ({ data: [run("a")], count: 1, error: null })) : query(() => ({ data: [], count: 1, error: null })));
    expect((await readRepoGradeDiagnosticTargetsAction("owner")).status).toBe("unavailable");
  });
  it("caps the exported targets and marks the limit", async () => {
    const entries = Array.from({ length: 5001 }, (_, id) => ({ id, repo: `org/r${id}`, state: "blocked", reason: null }));
    mocks.from.mockImplementation((table: string) => table === "repo_grade_automatic_runs"
      ? query(() => ({ data: [run("a")], count: 1, error: null }))
      : query((_id, start, end) => ({ data: entries.slice(start, end + 1), count: entries.length, error: null })));
    const result = await readRepoGradeDiagnosticTargetsAction("owner");
    expect(result).toMatchObject({ status: "partial", targetLimitReached: true });
    expect(result.targets).toHaveLength(5000);
  });
});
