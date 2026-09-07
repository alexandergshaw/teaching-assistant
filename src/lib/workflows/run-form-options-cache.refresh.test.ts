import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

/**
 * A PAGE REFRESH IS NOT AN OWNER CHANGE.
 *
 * The reported symptom was that registered institutions did not survive a
 * reload. The cause was much wider: `currentOwner` in run-form-options-cache is
 * MODULE state, so a page load resets it to null. SupabaseProvider then declares
 * the already-signed-in user on first mount - the common case, as its own
 * comment says - and the owner-changed check saw null becoming a real id, called
 * that a change, and swept the whole of localStorage. Every persisted control in
 * the app reset on every refresh, against a standing rule that they must not.
 *
 * These tests simulate a page load with `vi.resetModules()`, because that is the
 * only way to reproduce the bug: it lives entirely in module-scope state that a
 * normal test run initialises exactly once. A test that imports the module a
 * single time cannot see it, which is why nothing caught this.
 *
 * WHAT MUST NOT REGRESS IN THE OTHER DIRECTION. The sweep exists to stop one
 * user's browser state reaching the next, so every case that cannot PROVE the
 * owner is unchanged has to sweep. The four below pin both halves: the refresh
 * that must not sweep, and the three that must.
 */

const KEY = "ta-institutions";
const MARKER = "ta-sweep-owner";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";

function fakeLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as unknown as Storage;
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("localStorage", fakeLocalStorage());
  // indexedDB is touched by the sweep's other half; absent is fine and the
  // sweep is documented to tolerate it.
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * One simulated page load: a fresh module graph over the SAME browser storage,
 * which is exactly what a refresh gives you.
 *
 * `vi.resetModules()` IS THE WHOLE MECHANISM and it belongs here, not only in
 * beforeEach. The first version of this file called `import()` twice with a
 * reset only between TESTS, so the second call returned the same cached module
 * with `currentOwner` already populated - the plain same-owner check returned
 * early and every test passed whether or not the fix was present. The sabotage
 * run caught it: removing the reconciliation left all six green.
 *
 * A bug that lives in module-scope state can only be reproduced by discarding
 * the module, and forgetting that makes the test a tautology rather than a
 * weak check.
 */
async function loadModules() {
  vi.resetModules();
  const cache = await import("./run-form-options-cache");
  const sweep = await import("@/lib/client-state-sweep");
  return { cache, sweep };
}

describe("setCacheOwner distinguishes a refresh from an owner change", () => {
  it("does NOT sweep when the same user reloads the page", async () => {
    const first = await loadModules();
    localStorage.setItem(KEY, JSON.stringify(["MCC"]));
    first.cache.setCacheOwner(USER_A);
    // The first sign-in of a session legitimately sweeps, so the value is
    // written after it - the way a user registering an institution would.
    localStorage.setItem(KEY, JSON.stringify(["MCC"]));

    // The refresh: a brand new module graph over the same browser storage.
    const second = await loadModules();
    second.cache.setCacheOwner(USER_A);

    expect(
      localStorage.getItem(KEY),
      "a reload swept the institutions away - this is the reported bug"
    ).toBe(JSON.stringify(["MCC"]));
  });

  it("DOES sweep when a different user signs in on the same browser", async () => {
    const first = await loadModules();
    first.cache.setCacheOwner(USER_A);
    localStorage.setItem(KEY, JSON.stringify(["MCC"]));

    const second = await loadModules();
    second.cache.setCacheOwner(USER_B);

    expect(
      localStorage.getItem(KEY),
      "user B inherited user A's state - the leak the sweep exists to prevent"
    ).toBeNull();
  });

  it("DOES sweep on a first load with no marker at all", async () => {
    // An earlier anonymous visit, or storage that was cleared. Nothing proves
    // the previous state belongs to this user, so it goes.
    const mod = await loadModules();
    localStorage.setItem(KEY, JSON.stringify(["MCC"]));
    mod.cache.setCacheOwner(USER_A);

    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("clears the marker on sign-out, so the next sign-in by anyone sweeps", async () => {
    const first = await loadModules();
    first.cache.setCacheOwner(USER_A);
    expect(localStorage.getItem(MARKER)).not.toBeNull();

    first.cache.setCacheOwner(null);
    expect(localStorage.getItem(MARKER)).toBeNull();

    // And a fresh load for the SAME user now sweeps, because sign-out revoked
    // the proof rather than merely forgetting it.
    localStorage.setItem(KEY, JSON.stringify(["MCC"]));
    const second = await loadModules();
    second.cache.setCacheOwner(USER_A);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps its own marker through a sweep, or the next reload would sweep again", async () => {
    const mod = await loadModules();
    mod.cache.setCacheOwner(USER_A);
    // The sweep ran (no prior marker) - and must not have deleted the record it
    // just wrote of having run.
    expect(localStorage.getItem(MARKER)).not.toBeNull();
  });

  it("stores a hash, never the user id itself", async () => {
    // Identity residue in a browser after someone walks away is the exact class
    // of thing this module's sweep exists to remove; the marker must not
    // reintroduce it.
    const mod = await loadModules();
    mod.cache.setCacheOwner(USER_A);
    expect(localStorage.getItem(MARKER)).not.toContain(USER_A);
  });
});
