import { afterEach, describe, expect, it, vi } from "vitest";
import { createRepoFeedbackAuthority } from "./repoFeedbackIdb";
import { createRepoFeedbackIdbAdapter } from "./repoFeedbackIdbAdapter";

const target = { kind: "current", course: "course" } as const;

function start(timeoutMs?: number) {
  const proof = Symbol();
  const authority = createRepoFeedbackAuthority((_challenge, candidate) =>
    candidate === proof ? { account: "account", session: "session" } : null,
  );
  const adapter = createRepoFeedbackIdbAdapter(authority, { timeoutMs });
  const lease = authority.admit(authority.beginSignIn(), proof)!;
  return { adapter, authority, lease };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("feedback IndexedDB admission and open failures", () => {
  it("does not open storage for revoked, forged, or previous-app leases", async () => {
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    const prior = start();
    const { adapter, authority, lease } = start();
    expect(await adapter.load(prior.lease, target)).toEqual({ status: "unauthorized" });
    expect(await adapter.load({ signal: lease.signal }, target)).toEqual({ status: "unauthorized" });
    authority.revoke();
    expect(await adapter.load(lease, target)).toEqual({ status: "unauthorized" });
    expect(open).not.toHaveBeenCalled();
  });

  it("rejects a caller-made revision checkpoint before opening storage", async () => {
    const open = vi.fn();
    vi.stubGlobal("indexedDB", { open });
    const { adapter, lease } = start();
    expect(await adapter.save(lease, target, { revision: 0 }, [])).toEqual({ status: "conflict" });
    expect(await adapter.discard(lease, target, { revision: 0 })).toEqual({ status: "conflict" });
    expect(open).not.toHaveBeenCalled();
  });

  it("reports unavailable IndexedDB without exposing exception details", async () => {
    vi.stubGlobal("indexedDB", { open: () => { throw new Error("private browser error"); } });
    const { adapter, lease } = start();
    expect(await adapter.load(lease, target)).toEqual({ status: "storage_error" });
  });

  it.each(["blocked", "revoked", "timed out"] as const)("closes a connection arriving after open was %s", async (cause) => {
    vi.useFakeTimers();
    const db = { close: vi.fn(), transaction: vi.fn() };
    const request: { result: typeof db; onblocked?: () => void; onsuccess?: () => void } = { result: db };
    vi.stubGlobal("indexedDB", { open: () => request });
    const { adapter, authority, lease } = start(20);
    const result = adapter.load(lease, target);
    if (cause === "blocked") request.onblocked?.();
    else if (cause === "revoked") authority.revoke();
    else await vi.advanceTimersByTimeAsync(20);
    expect(await result).toEqual({ status: cause === "revoked" ? "unauthorized" : "storage_error" });
    expect(vi.getTimerCount()).toBe(0);
    request.onsuccess?.();
    expect(db.close).toHaveBeenCalledOnce();
    expect(db.transaction).not.toHaveBeenCalled();
  });
});
