import { describe, expect, it } from "vitest";
import { canonicalRepo, clearManualRepoGradeDiagnostics, readManualRepoGradeDiagnostics, trackManualRepoGrade } from "./manualRepoGradeDiagnostics";

describe("manual repository diagnostics", () => {
  it("exports canonical names and links only, never URL credentials or paths", () => {
    expect(canonicalRepo("Org/Repo.Name")).toEqual({ repo: "Org/Repo.Name", url: "https://github.com/Org/Repo.Name", urlStatus: "available" });
    for (const value of ["https://token@github.com/org/repo", "org/repo?token=x", "../repo", "org/repo/extra"]) expect(canonicalRepo(value)).toEqual({ repo: null, url: null, urlStatus: "invalid" });
  });
  it("preserves account isolation and reports pending or rejected calls as unknown", async () => {
    const account = "manual-test"; clearManualRepoGradeDiagnostics(account);
    let finish!: (value: never) => void;
    const pending = trackManualRepoGrade(account, "Org/Repo", "work", "single", () => new Promise<never>((resolve) => { finish = resolve; }));
    expect(readManualRepoGradeDiagnostics(account)[0]).toMatchObject({ repo: "Org/Repo", status: "running" });
    expect(readManualRepoGradeDiagnostics("other-account")).toEqual([]);
    finish({ error: "private error", admissionStatus: "blocked" } as never); await pending;
    expect(readManualRepoGradeDiagnostics(account)[0].status).toBe("blocked");
    expect(JSON.stringify(readManualRepoGradeDiagnostics(account))).not.toContain("private error");
    await expect(trackManualRepoGrade(account, "Org/Repo", "work", "bulk", async () => { throw new Error("private rejection"); })).rejects.toThrow();
    expect(readManualRepoGradeDiagnostics(account)[1].status).toBe("unknown");
    clearManualRepoGradeDiagnostics(account);
  });
});
