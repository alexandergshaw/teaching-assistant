import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fixtureSql, options } from "./canvas-video-reservation-postgres.mjs";

const args = ["--disposable", "127.0.0.1", "55439", "canvas_video_test_safe", "local_admin"];
test("requires an explicit loopback disposable database and strips libpq settings", () => {
  const value = options(args, { PATH: "bin", PGHOST: "remote", PGPASSWORD: "secret" });
  assert.equal(value.env.PGHOST, undefined); assert.equal(value.env.PGPASSWORD, undefined);
  for (const bad of [[], args.with(1, "localhost"), args.with(3, "postgres"), args.with(4, "admin;drop")]) assert.throws(() => options(bad, {}));
});
test("draft executes only behind a database marker and rolls back", () => {
  const draft = readFileSync(new URL("../../docs/canvas-video-reservation-draft.sql", import.meta.url), "utf8");
  const sql = fixtureSql(draft, options(args, {}));
  assert.match(sql, /canvas-video reservation disposable harness/);
  assert.match(sql, /duplicate path admitted/); assert.match(sql, /foreign path admitted/);
  assert.match(sql, /rollback;$/i); assert.doesNotMatch(sql, /\bcommit\b/i);
  assert.throws(() => fixtureSql(draft.replace(/rollback;\s*$/i, "commit;"), options(args, {})));
});
