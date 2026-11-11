import { describe, expect, it } from "vitest";
import { createBundleAuthority } from "./single-zip-authority";

function observer() {
  let state = { epoch: Symbol(), identity: { accountId: "account-a", sessionId: "session-a" } as { accountId: string; sessionId: string } | null };
  const listeners = new Set<() => void>();
  return { snapshot: () => state, subscribe(fn: () => void) { listeners.add(fn); return () => listeners.delete(fn); }, change(identity: typeof state.identity) { state = { epoch: Symbol(), identity }; listeners.forEach((fn) => fn()); } };
}
describe("bundle session authority", () => {
  it("requires server verification matching both observed account and session", async () => {
    const source = observer(), identity = source.snapshot().identity;
    const rejected = createBundleAuthority(source, async () => ({ accountId: "account-b", sessionId: "session-a" }));
    expect(await rejected.admit()).toBeNull(); rejected.close();
    const authority = createBundleAuthority(source, async () => identity);
    const lease = await authority.admit(); expect(lease).not.toBeNull(); expect(authority.resolve(lease!)).toBe("account-a");
    source.change(null); expect(lease!.signal.aborted).toBe(true); expect(authority.resolve(lease!)).toBeNull(); authority.close();
  });
  it("rejects a verification that completes after an account switch", async () => {
    const source = observer(); let finish!: (value: { accountId: string; sessionId: string }) => void;
    const authority = createBundleAuthority(source, () => new Promise((resolve) => { finish = resolve; }));
    const pending = authority.admit(); source.change({ accountId: "account-b", sessionId: "session-b" }); finish({ accountId: "account-a", sessionId: "session-a" });
    expect(await pending).toBeNull(); authority.close();
  });
  it("revokes an old lease on a new admission or close", async () => {
    const source = observer(), authority = createBundleAuthority(source, async () => source.snapshot().identity);
    const first = (await authority.admit())!, second = (await authority.admit())!;
    expect(first.signal.aborted).toBe(true); expect(authority.resolve(first)).toBeNull();
    authority.close(); expect(second.signal.aborted).toBe(true); expect(authority.resolve(second)).toBeNull();
  });
});
