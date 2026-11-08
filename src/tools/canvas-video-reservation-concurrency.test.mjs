import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { committedFixture, guard } from "./canvas-video-reservation-concurrency.mjs";
import { options } from "./canvas-video-reservation-postgres.mjs";

const config = options(["--disposable", "127.0.0.1", "55439", "canvas_video_test_safe", "local_admin"], {});
const draft = readFileSync(new URL("../../docs/canvas-video-reservation-draft.sql", import.meta.url), "utf8");
test("executable fixture requires the original rollback-only draft", () => {
  assert.match(committedFixture(draft, config), /commit;$/i);
  assert.throws(() => committedFixture(draft.replace(/rollback;\s*$/i, "commit;"), config));
});
test("guard binds target database, literal loopback, port, marker and superuser", () => {
  const sql = guard(config, config.db, "canvas-video reservation disposable harness");
  for (const part of [config.db, config.user, "127.0.0.1", "55439", "rolsuper", "canvas-video reservation disposable harness"]) assert.ok(sql.includes(part));
});
test("concurrency driver requires a fresh cluster and observes the lock before commit", () => {
  const source = readFileSync(new URL("./canvas-video-reservation-concurrency.mjs", import.meta.url), "utf8");
  assert.match(source, /await owner\.query\(fresh\); await bootstrap\.query\(fresh\)/);
  assert.match(source, /await waitForLock\(observer, pid\);\s*await owner\.query\("commit;"\)/);
  assert.match(source, /assert\.equal\(await race, "f"\)/);
});
