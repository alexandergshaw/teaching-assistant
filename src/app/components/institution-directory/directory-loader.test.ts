import { afterEach, describe, expect, it, vi } from "vitest";
import { createDirectoryLoader, DIRECTORY_LOAD_TIMEOUT_MS, directoryLoaderForAccount, selectDirectoryAccount } from "./directory-loader";
import type { InstitutionDirectoryState } from "@/lib/institution-directory";

vi.mock("@/lib/institution-directory-diagnostics", () => ({ institutionDirectoryDiagnosticReason: () => "storage", recordInstitutionDirectoryDiagnostic: vi.fn() }));
const empty: InstitutionDirectoryState = { records: [], columns: [] };
const populated: InstitutionDirectoryState = { records: [], columns: [{ id: "test", label: "Private column", type: "text", position: 0 }] };
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason?: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
afterEach(() => { selectDirectoryAccount(null); vi.useRealTimers(); });

describe("bounded directory loading", () => {
  it("deduplicates a pending load and exposes loading immediately", async () => {
    const request = deferred<{ ok: true; state: InstitutionDirectoryState }>();
    const run = vi.fn(() => request.promise);
    const loader = createDirectoryLoader(run);
    const first = loader.load();
    expect(loader.load()).toBe(first);
    expect(loader.getSnapshot()).toEqual({ data: null, loading: true, error: null });
    await Promise.resolve(); expect(run).toHaveBeenCalledTimes(1);
    request.resolve({ ok: true, state: empty }); await first;
    expect(loader.getSnapshot()).toEqual({ data: empty, loading: false, error: null });
  });
  it("ends an unresolved load at its deadline, permits retry, and ignores late success", async () => {
    vi.useFakeTimers();
    const old = deferred<{ ok: true; state: InstitutionDirectoryState }>();
    const run = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ok: true, state: empty });
    const loader = createDirectoryLoader(run);
    const first = loader.load();
    await vi.advanceTimersByTimeAsync(DIRECTORY_LOAD_TIMEOUT_MS); await first;
    expect(loader.getSnapshot()).toMatchObject({ loading: false, data: null, error: expect.stringContaining("too long") });
    await loader.load(); old.resolve({ ok: true, state: populated }); await Promise.resolve();
    expect(loader.getSnapshot()).toEqual({ data: empty, loading: false, error: null });
  });
  it("retains last known rows and known-empty data on refresh rejection", async () => {
    for (const state of [empty, populated]) {
      const loader = createDirectoryLoader(vi.fn().mockResolvedValueOnce({ ok: true, state }).mockRejectedValueOnce(new Error("private transport detail")));
      await loader.load(); await loader.load();
      expect(loader.getSnapshot()).toEqual({ data: state, loading: false, error: "Could not refresh institutions. Your last saved rows are still shown; try again." });
    }
  });
  it("forced post-save refresh supersedes pending older reads and late failure", async () => {
    const old = deferred<never>();
    const loader = createDirectoryLoader(vi.fn().mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ok: true, state: populated }));
    const first = loader.load(); await Promise.resolve();
    await loader.load(true); await first; old.reject(new Error("old failure")); await Promise.resolve();
    expect(loader.getSnapshot()).toEqual({ data: populated, loading: false, error: null });
  });
  it("reuses only the active account in memory and clears on signout or switch including pending results", async () => {
    const old = deferred<{ ok: true; state: InstitutionDirectoryState }>();
    const a = directoryLoaderForAccount("a", () => old.promise);
    expect(directoryLoaderForAccount("a", vi.fn())).toBe(a);
    const first = a.load(); await Promise.resolve(); selectDirectoryAccount(null); await first;
    old.resolve({ ok: true, state: populated }); await Promise.resolve();
    expect(a.getSnapshot().data).toBeNull();
    const b = directoryLoaderForAccount("b", async () => ({ ok: true, state: empty })); await b.load();
    expect(directoryLoaderForAccount("a", vi.fn()).getSnapshot().data).toBeNull();
    expect(b.getSnapshot().data).toBeNull();
  });
  it("evicts private rows when server authorization expires", async () => {
    const loader = createDirectoryLoader(vi.fn().mockResolvedValueOnce({ ok: true, state: populated }).mockResolvedValueOnce({ ok: false, code: "unauthenticated" }));
    await loader.load(); await loader.load();
    expect(loader.getSnapshot()).toMatchObject({ data: null, loading: false, error: expect.stringContaining("Sign in") });
  });
});
