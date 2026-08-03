import { describe, it, expect } from "vitest";
import {
  isFresh,
  getCachedList,
  setCachedList,
  invalidateCachedList,
  lmsCourseOptionsCacheKey,
  setCacheOwner,
  clearAllCachedLists,
  DEFAULT_TTL_MS,
} from "./run-form-options-cache";

// The module under test holds one shared Map at module scope (that's the
// whole point - it must survive across "mounts", simulated here by just
// calling the functions again). To keep tests from leaking into each other
// through that shared state, every test uses its own unique key.
let nextKey = 0;
function freshKey(): string {
  nextKey += 1;
  return `test-key-${nextKey}`;
}

describe("isFresh", () => {
  it("is fresh strictly within the ttl", () => {
    expect(isFresh(1000, 500, 1499)).toBe(true);
  });

  it("is stale exactly at the ttl boundary", () => {
    expect(isFresh(1000, 500, 1500)).toBe(false);
  });

  it("is stale past the ttl", () => {
    expect(isFresh(1000, 500, 2000)).toBe(false);
  });

  it("treats a cachedAt in the future as fresh (clock skew is not this function's job)", () => {
    expect(isFresh(2000, 500, 1000)).toBe(true);
  });
});

describe("getCachedList / setCachedList", () => {
  it("misses when nothing was ever cached for the key", () => {
    expect(getCachedList(freshKey(), DEFAULT_TTL_MS, 0)).toBeNull();
  });

  it("returns the exact value that was set", () => {
    const key = freshKey();
    const value = [{ id: "c1", name: "Course One" }];
    setCachedList(key, value, 1000);
    expect(getCachedList(key, DEFAULT_TTL_MS, 1000)).toBe(value);
  });

  it("misses once the entry is older than the ttl passed to getCachedList", () => {
    const key = freshKey();
    setCachedList(key, ["a"], 0);
    expect(getCachedList(key, 1000, 999)).toEqual(["a"]); // still fresh
    expect(getCachedList(key, 1000, 1000)).toBeNull(); // now stale
  });

  it("a later setCachedList resets the freshness clock", () => {
    const key = freshKey();
    setCachedList(key, "old", 0);
    expect(getCachedList(key, 100, 150)).toBeNull(); // stale relative to t=0
    setCachedList(key, "new", 150);
    expect(getCachedList(key, 100, 200)).toBe("new"); // fresh relative to t=150
  });

  it("keeps different keys independent", () => {
    const keyA = freshKey();
    const keyB = freshKey();
    setCachedList(keyA, "value-a", 0);
    expect(getCachedList(keyB, DEFAULT_TTL_MS, 0)).toBeNull();
    expect(getCachedList(keyA, DEFAULT_TTL_MS, 0)).toBe("value-a");
  });

  it("defaults ttlMs to DEFAULT_TTL_MS when the caller does not pass one", () => {
    const key = freshKey();
    const now = Date.now();
    setCachedList(key, "value", now);
    // Just inside the default window.
    expect(getCachedList<string>(key, undefined, now + DEFAULT_TTL_MS - 1)).toBe("value");
    // Just outside it.
    expect(getCachedList<string>(key, undefined, now + DEFAULT_TTL_MS)).toBeNull();
  });
});

describe("invalidateCachedList", () => {
  it("makes an immediately-following getCachedList miss even though the entry was still fresh", () => {
    const key = freshKey();
    setCachedList(key, "value", 1000);
    invalidateCachedList(key);
    expect(getCachedList(key, DEFAULT_TTL_MS, 1000)).toBeNull();
  });

  it("is a no-op for a key that was never cached", () => {
    const key = freshKey();
    expect(() => invalidateCachedList(key)).not.toThrow();
    expect(getCachedList(key, DEFAULT_TTL_MS, 0)).toBeNull();
  });

  it("does not affect other keys", () => {
    const keyA = freshKey();
    const keyB = freshKey();
    setCachedList(keyA, "a", 0);
    setCachedList(keyB, "b", 0);
    invalidateCachedList(keyA);
    expect(getCachedList(keyA, DEFAULT_TTL_MS, 0)).toBeNull();
    expect(getCachedList(keyB, DEFAULT_TTL_MS, 0)).toBe("b");
  });
});

describe("lmsCourseOptionsCacheKey", () => {
  it("embeds the institution in the key", () => {
    expect(lmsCourseOptionsCacheKey("ABC")).toBe("workflowOptions:lmsCourseOptions:ABC");
  });

  it("gives different institutions different keys", () => {
    expect(lmsCourseOptionsCacheKey("ABC")).not.toBe(lmsCourseOptionsCacheKey("XYZ"));
  });

  it("trims surrounding whitespace so ' ABC ' and 'ABC' share a cache entry", () => {
    expect(lmsCourseOptionsCacheKey(" ABC ")).toBe(lmsCourseOptionsCacheKey("ABC"));
  });
});

// These tests close the cross-user leak: this module's Map is module-scope
// and survives a client-side sign-out/sign-in (neither is a full page
// reload - see TopBar.tsx's handleSignOut), so without an owner check user
// B could see user A's cached course tiles, LMS course names, GitHub orgs,
// and template names after signing in on the same tab. Placed after every
// other describe block in this file so that earlier tests' own freshKey()
// entries have already made their assertions before any clearAllCachedLists
// / setCacheOwner call below wipes the whole shared Map out from under them
// - vitest runs `it`s within a file sequentially in source order by
// default, so that ordering is what actually protects them.
describe("setCacheOwner", () => {
  it("switching the owner from one user id to another clears previously cached entries", () => {
    const key = freshKey();
    setCacheOwner("user-a");
    setCachedList(key, "a-data", 0);
    expect(getCachedList(key, DEFAULT_TTL_MS, 0)).toBe("a-data");

    setCacheOwner("user-b");
    expect(getCachedList(key, DEFAULT_TTL_MS, 0)).toBeNull();
  });

  it("setting the SAME owner twice does not clear (the no-op-on-repeat requirement)", () => {
    const key = freshKey();
    setCacheOwner("user-c");
    setCachedList(key, "c-data", 0);

    setCacheOwner("user-c"); // repeat, same id - must be a cheap no-op
    expect(getCachedList(key, DEFAULT_TTL_MS, 0)).toBe("c-data");
  });

  it("signing out (owner becomes null) clears the cache", () => {
    const key = freshKey();
    setCacheOwner("user-d");
    setCachedList(key, "d-data", 0);

    setCacheOwner(null);
    expect(getCachedList(key, DEFAULT_TTL_MS, 0)).toBeNull();
  });

  it("signing in from null to a user id clears, so a cache populated while logged out cannot bleed into a session", () => {
    const key = freshKey();
    setCacheOwner(null);
    setCachedList(key, "anonymous-data", 0);

    setCacheOwner("user-e");
    expect(getCachedList(key, DEFAULT_TTL_MS, 0)).toBeNull();
  });

  it("repeating null twice (two auth events with no session, e.g. still signed out) does not clear", () => {
    const key = freshKey();
    setCacheOwner("user-f");
    setCacheOwner(null);
    setCachedList(key, "f-data", 0);

    setCacheOwner(null); // repeat - already the recorded owner
    expect(getCachedList(key, DEFAULT_TTL_MS, 0)).toBe("f-data");
  });

  it("does not disturb the TTL clock for entries that survive an owner no-op", () => {
    const key = freshKey();
    setCacheOwner("user-g");
    setCachedList(key, "g-data", 0);

    setCacheOwner("user-g"); // no-op; must not reset or otherwise touch cachedAt
    expect(getCachedList(key, 1000, 999)).toBe("g-data"); // still fresh
    expect(getCachedList(key, 1000, 1000)).toBeNull(); // now stale, same TTL math as always
  });
});

describe("clearAllCachedLists", () => {
  it("empties everything, including per-institution lmsCourseOptions keys", () => {
    const key = freshKey();
    const lmsKeyA = lmsCourseOptionsCacheKey(`Institution-A-${freshKey()}`);
    const lmsKeyB = lmsCourseOptionsCacheKey(`Institution-B-${freshKey()}`);
    setCachedList(key, "plain-data", 0);
    setCachedList(lmsKeyA, "lms-a-data", 0);
    setCachedList(lmsKeyB, "lms-b-data", 0);

    clearAllCachedLists();

    expect(getCachedList(key, DEFAULT_TTL_MS, 0)).toBeNull();
    expect(getCachedList(lmsKeyA, DEFAULT_TTL_MS, 0)).toBeNull();
    expect(getCachedList(lmsKeyB, DEFAULT_TTL_MS, 0)).toBeNull();
  });

  it("is a no-op-safe call on an already-empty map (does not throw)", () => {
    clearAllCachedLists();
    expect(() => clearAllCachedLists()).not.toThrow();
  });
});
