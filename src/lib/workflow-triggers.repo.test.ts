import { describe, it, expect } from "vitest";
import {
  decideRepoPush,
  decideRepoInactive,
} from "@/lib/workflow-triggers";

describe("decideRepoPush", () => {
  it("first eval records a baseline and does not fire", () => {
    const d = decideRepoPush(null, [{ repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ repos: { a: "2026-01-01T00:00:00.000Z" } });
  });

  it("fires when a repo's lastCommit advances to a lexicographically greater ISO string", () => {
    const base = decideRepoPush(null, [{ repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" }]);
    const d = decideRepoPush(base.cursor, [{ repo: "a", lastCommit: "2026-01-05T00:00:00.000Z" }]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ repos: { a: "2026-01-05T00:00:00.000Z" } });
  });

  it("does not fire when the lastCommit is unchanged", () => {
    const base = decideRepoPush(null, [{ repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" }]);
    const d = decideRepoPush(base.cursor, [{ repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ repos: { a: "2026-01-01T00:00:00.000Z" } });
  });

  it("fires for a brand-new repo appearing with a commit on a non-first eval", () => {
    const base = decideRepoPush(null, [{ repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" }]);
    const d = decideRepoPush(base.cursor, [
      { repo: "a", lastCommit: "2026-01-01T00:00:00.000Z" },
      { repo: "b", lastCommit: "2026-01-02T00:00:00.000Z" },
    ]);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({
      repos: { a: "2026-01-01T00:00:00.000Z", b: "2026-01-02T00:00:00.000Z" },
    });
  });

  it("a repo with a null lastCommit never triggers a fire by itself", () => {
    const base = decideRepoPush(null, [{ repo: "c", lastCommit: null }]);
    expect(base.fired).toBe(false);
    expect(base.cursor).toEqual({ repos: { c: "" } });
    const d = decideRepoPush(base.cursor, [{ repo: "c", lastCommit: null }]);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ repos: { c: "" } });
  });
});

describe("decideRepoInactive", () => {
  const now = Date.parse("2026-07-14T00:00:00Z");

  it("first eval records a baseline and does not fire", () => {
    const d = decideRepoInactive(null, [{ repo: "a", lastCommit: "2026-07-13T00:00:00Z" }], 7, now);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ stale: [] });
  });

  it("fires for a repo that becomes newly stale since the last check", () => {
    const base = decideRepoInactive(null, [{ repo: "a", lastCommit: "2026-07-13T00:00:00Z" }], 7, now);
    expect(base.cursor).toEqual({ stale: [] });
    const d = decideRepoInactive(base.cursor, [{ repo: "a", lastCommit: "2026-06-01T00:00:00Z" }], 7, now);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ stale: ["a"] });
  });

  it("does not re-fire for a repo that was already stale last check", () => {
    const base = decideRepoInactive(null, [{ repo: "a", lastCommit: "2026-06-01T00:00:00Z" }], 7, now);
    expect(base.fired).toBe(false);
    expect(base.cursor).toEqual({ stale: ["a"] });
    const d = decideRepoInactive(base.cursor, [{ repo: "a", lastCommit: "2026-06-01T00:00:00Z" }], 7, now);
    expect(d.fired).toBe(false);
    expect(d.cursor).toEqual({ stale: ["a"] });
  });

  it("treats a repo with a null lastCommit as stale", () => {
    const base = decideRepoInactive(null, [{ repo: "b", lastCommit: "2026-07-13T00:00:00Z" }], 7, now);
    expect(base.cursor).toEqual({ stale: [] });
    const d = decideRepoInactive(base.cursor, [{ repo: "b", lastCommit: null }], 7, now);
    expect(d.fired).toBe(true);
    expect(d.cursor).toEqual({ stale: ["b"] });
  });
});
