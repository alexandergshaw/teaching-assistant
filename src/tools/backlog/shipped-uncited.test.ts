import { describe, it, expect } from "vitest";
import { shippedButUncited, isWorkCommit, formatShippedUncitedReason } from "./shipped-uncited";
import type { WorkCommit } from "./shipped-uncited";
import type { BacklogItem } from "./types";

function item(over: Partial<BacklogItem> & { id: string }): BacklogItem {
  return {
    id: over.id,
    state: over.state ?? "unscoped",
    kind: over.kind ?? "chore",
    area: over.area ?? "loop-and-docs-maintenance",
    title: over.title ?? "t",
    owns: over.owns ?? [],
    verify: over.verify ?? null,
    blocked_by: over.blocked_by ?? [],
    instrument: over.instrument ?? "",
    from: over.from ?? "",
    note: over.note ?? "",
  };
}

function commit(over: Partial<WorkCommit> & { hash: string; subject: string }): WorkCommit {
  return { hash: over.hash, subject: over.subject, files: over.files ?? ["src/x.ts"] };
}

describe("isWorkCommit", () => {
  it("a commit touching only docs/ is not work", () => {
    expect(isWorkCommit(commit({ hash: "a1b2c3d", subject: "docs", files: ["docs/backlog.yml", "docs/BACKLOG.md"] }))).toBe(false);
  });

  it("a commit touching only .claude/ is not work", () => {
    expect(isWorkCommit(commit({ hash: "a1b2c3d", subject: "agents", files: [".claude/agents/foo.md"] }))).toBe(false);
  });

  it("a commit touching only the two backlog-bookkeeping leaves is not work", () => {
    expect(
      isWorkCommit(
        commit({
          hash: "a1b2c3d",
          subject: "bookkeeping",
          files: ["src/tools/backlog/backlog-file.structure.test.ts", "src/tools/backlog/areas.ts"],
        }),
      ),
    ).toBe(false);
  });

  it("a commit touching one real source file alongside docs is work", () => {
    expect(
      isWorkCommit(commit({ hash: "a1b2c3d", subject: "fix", files: ["docs/backlog.yml", "src/lib/grade/x.ts"] })),
    ).toBe(true);
  });

  // MUTANT to watch for: an implementation that excludes only "docs/" (the
  // reconciliation report's earlier variant, section 6.3) would call a
  // .claude/-only commit WORK and produce false positives on things like
  // agent-definition edits.
  it("a commit touching only src/tools/backlog/areas.ts alone is not work", () => {
    expect(isWorkCommit(commit({ hash: "a1b2c3d", subject: "area", files: ["src/tools/backlog/areas.ts"] }))).toBe(
      false,
    );
  });
});

describe("shippedButUncited", () => {
  // THE CANARY. A code commit names an uncited row in its subject: flag it.
  it("flags a row named in a code commit's subject when the row does not cite the hash", () => {
    const items = [item({ id: "A30" })];
    const commits = [commit({ hash: "832e9d3", subject: "fix(a30): route the per-cell path", files: ["src/lib/grade/x.ts"] })];
    const flags = shippedButUncited(items, commits);
    expect(flags).toHaveLength(1);
    expect(flags[0].itemId).toBe("A30");
    expect(flags[0].commit.hash).toBe("832e9d3");
  });

  // Once the row cites the hash (any of its text fields), the flag clears.
  it("does not flag once the row cites the commit's hash", () => {
    const items = [item({ id: "A30", note: "Shipped at 832e9d3." })];
    const commits = [commit({ hash: "832e9d3", subject: "fix(a30): route the per-cell path", files: ["src/lib/grade/x.ts"] })];
    expect(shippedButUncited(items, commits)).toHaveLength(0);
  });

  // A docs-only commit naming a row is backlog bookkeeping, not a ship.
  it("does not flag a docs-only commit even when it names a row", () => {
    const items = [item({ id: "A30" })];
    const commits = [commit({ hash: "832e9d3", subject: "docs(a30): file the row", files: ["docs/backlog.yml", "docs/BACKLOG.md"] })];
    expect(shippedButUncited(items, commits)).toHaveLength(0);
  });

  // Chosen behaviour: SUBJECT only. A commit naming the row only in its
  // body must NOT be flagged (see shipped-uncited.ts's subjectNamesId
  // comment - the reconciliation report's A14 case, and the false-positive
  // risk of casual cross-references like "unblocks A7").
  it("does not flag a row named only in the commit body, not the subject", () => {
    const items = [item({ id: "A14" })];
    const commits = [
      {
        hash: "cb478e9",
        // Deliberately does not mention A14 - the real cb478e9 names A14
        // only in its body ("A14, live on main and grade-affecting"), and
        // WorkCommit carries no body text at all, so that case is exercised
        // by construction: the checker has nothing to match against there.
        subject: "fix: correct the zip-depth handling",
        files: ["src/lib/canvas/zip.ts"],
      },
    ];
    expect(shippedButUncited(items, commits)).toHaveLength(0);
  });

  // A closed row is not in `items` at all (Ruling BA-8: closed = deleted),
  // so passing a shorter items array that omits it must never flag it.
  it("does not flag a row absent from the items array (a closed row is deleted, not present)", () => {
    const items = [item({ id: "A29" })];
    const commits = [commit({ hash: "832e9d3", subject: "fix(a30): route the per-cell path", files: ["src/lib/grade/x.ts"] })];
    expect(shippedButUncited(items, commits)).toHaveLength(0);
  });

  // Short-vs-long hash, both directions.
  it("does not flag when the row cites a SHORT hash and the commit's is LONG", () => {
    const items = [item({ id: "A30", from: "832e9d3" })];
    const commits = [
      commit({ hash: "832e9d3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", subject: "fix(a30): x", files: ["src/x.ts"] }),
    ];
    expect(shippedButUncited(items, commits)).toHaveLength(0);
  });

  it("does not flag when the row cites the LONG hash and the commit gives a SHORT one", () => {
    const items = [item({ id: "A30", from: "832e9d3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" })];
    const commits = [commit({ hash: "832e9d3", subject: "fix(a30): x", files: ["src/x.ts"] })];
    expect(shippedButUncited(items, commits)).toHaveLength(0);
  });

  it("still flags when a different, unrelated hash is cited", () => {
    const items = [item({ id: "A30", note: "see 1111111 for context" })];
    const commits = [commit({ hash: "832e9d3", subject: "fix(a30): x", files: ["src/x.ts"] })];
    expect(shippedButUncited(items, commits)).toHaveLength(1);
  });

  it("is case-insensitive on the id match in the subject", () => {
    const items = [item({ id: "A30" })];
    const commits = [commit({ hash: "832e9d3", subject: "fix(a30): lowercase id in conventional-commit scope", files: ["src/x.ts"] })];
    expect(shippedButUncited(items, commits)).toHaveLength(1);
  });

  it("does not partial-match an id inside a longer token", () => {
    const items = [item({ id: "A3" })];
    const commits = [commit({ hash: "832e9d3", subject: "fix(a30): something unrelated", files: ["src/x.ts"] })];
    // "a30" must not satisfy the word-boundary match for id "A3".
    expect(shippedButUncited(items, commits)).toHaveLength(0);
  });

  it("returns nothing for an empty commit list", () => {
    expect(shippedButUncited([item({ id: "A1" })], [])).toHaveLength(0);
  });

  it("returns nothing for an empty item list", () => {
    expect(shippedButUncited([], [commit({ hash: "abc1234", subject: "fix(a1): x", files: ["src/x.ts"] })])).toHaveLength(
      0,
    );
  });
});

describe("formatShippedUncitedReason", () => {
  it("names the row id and the commit hash", () => {
    const flags = [
      { itemId: "A30", commit: commit({ hash: "832e9d3", subject: "fix(a30): x", files: ["src/x.ts"] }) },
    ];
    const text = formatShippedUncitedReason(flags);
    expect(text).toContain("A30");
    expect(text).toContain("832e9d3");
  });
});
