import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { committedDraftCopy, connectionOptions } from "./archive-review-fence-postgres.mjs";

const valid = ["--disposable", "127.0.0.1", "55439", "archive_review_fence_test_safe", "local_admin"];

test("permits only the explicit disposable loopback target and strips ambient libpq variables", () => {
  const options = connectionOptions(valid, { PATH: "bin", PGHOST: "remote", PGPASSWORD: "secret", PGDATABASE: "real" });
  assert.equal(options.env.PGHOST, undefined);
  assert.equal(options.env.PGPASSWORD, undefined);
  assert.equal(options.env.PGDATABASE, undefined);
  assert(options.psqlArgs.includes("--host=127.0.0.1"));
  for (const invalid of [
    ["--disposable", "localhost", ...valid.slice(2)],
    ["--disposable", "127.0.0.2", ...valid.slice(2)],
    ["--disposable", "127.0.0.1", "5432", "postgres", "local_admin"],
    ["--disposable", "127.0.0.1", "0", valid[3], "local_admin"],
    ["--disposable", "127.0.0.1", "55439", valid[3], "user;drop"],
    valid.slice(1),
  ]) assert.throws(() => connectionOptions(invalid, {}));
});

test("only transforms the intended rollback-only private draft", () => {
  const draft = readFileSync(new URL("../../docs/archive-review-fence-draft.sql", import.meta.url), "utf8");
  const copy = committedDraftCopy(draft);
  assert.match(copy, /commit;\s*$/i);
  assert.match(draft, /rollback;\s*$/i);
  assert.throws(() => committedDraftCopy(draft.replace(/rollback;\s*$/i, "commit;")));
  assert.throws(() => committedDraftCopy(draft.replace("create schema archive_review_private;", "create schema public;")));
  assert.throws(() => committedDraftCopy(draft.replace("rollback;", "commit;\nrollback;")));
});

test("requires an independently marked and empty bootstrap database without creating cluster roles", () => {
  const source = readFileSync(new URL("./archive-review-fence-postgres.mjs", import.meta.url), "utf8");
  assert.match(source, /connectionGuard\(options, "postgres", "archive-review-fence disposable cluster"\)/);
  assert.match(source, /await bootstrap\.query\(freshness/);
  assert.doesNotMatch(source, /create\s+role/i);
});
