import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { committedDraftCopy, connectionOptions } from "./repo-grades-admission-v2-postgres.mjs";

const accepted = ["--disposable", "127.0.0.1", "55439", "repo_grades_queue_v2_test_fresh", "queue_v2_test_admin"];
const executable = fileURLToPath(new URL("./repo-grades-admission-v2-postgres.mjs", import.meta.url));

test("requires explicit, unambiguous local disposable connection parameters", () => {
  const rejected = [
    [],
    ["--help", ...accepted.slice(1)],
    ...["localhost", "::1", "127.0.0.1,other", "db.example.test", "/tmp"].map((host) => accepted.with(1, host)),
    ...["", "0", "65536", "54e2", "5432,5433"].map((port) => accepted.with(2, port)),
    ...["postgres", "repo_grades_queue_v2_test_", "repo_grades_queue_v2_test_a hostaddr=192.0.2.1",
      "postgres://db.example.test/repo_grades_queue_v2_test_a"].map((database) => accepted.with(3, database)),
    ...["", "user host=db.example.test", "'; select 1; --"].map((user) => accepted.with(4, user)),
  ];
  for (const args of rejected) assert.throws(() => connectionOptions(args, {}), undefined, JSON.stringify(args));
});

test("pins psql arguments and drops ambient libpq connection, credential and startup variables", () => {
  const { psqlArgs, env } = connectionOptions(accepted, {
    Path: "psql-bin", PGHOSTADDR: "192.0.2.1", pgservice: "remote", PGSERVICEFILE: "private.conf",
    PGUSER: "remote-role", PGPASSWORD: "secret", PGPASSFILE: "private.pass", PGOPTIONS: "-c role=remote_role",
    PSQLRC: "private.psqlrc", DATABASE_URL: "postgres://db.example.test/live",
  });
  assert.deepEqual(psqlArgs, ["-X", "-w", "-qAt", "--file=-", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose",
    "--host=127.0.0.1", "--port=55439", "--dbname=repo_grades_queue_v2_test_fresh", "--username=queue_v2_test_admin"]);
  assert.deepEqual(Object.keys(env).sort(), ["PGCONNECT_TIMEOUT", "PGGSSENCMODE", "PGOPTIONS", "PGPASSFILE", "PGSSLMODE", "Path"]);
  assert.equal(env.Path, "psql-bin");
  assert.equal(env.PGPASSFILE, process.platform === "win32" ? "NUL" : "/dev/null");
  assert.doesNotMatch(env.PGOPTIONS, /remote_role/);
});

test("transforms only the final rollback in memory and rejects a changed transaction envelope", () => {
  const draft = readFileSync(new URL("../../docs/repo-grades-admission-v2-draft.sql", import.meta.url), "utf8");
  const boundary = draft.lastIndexOf("rollback;");
  assert.equal(committedDraftCopy(draft), draft.slice(0, boundary) + "commit;\n");
  assert.throws(() => committedDraftCopy(draft.replace("begin;", "")));
  assert.throws(() => committedDraftCopy(draft.replace("rollback;", "commit;")));
  assert.throws(() => committedDraftCopy(draft.replace("rollback;", "commit;\nrollback;")));
  assert.throws(() => committedDraftCopy(draft.replace("rollback;", "\\connect other\nrollback;")));
});

test("CLI exits nonzero before trying psql for missing confirmation or a remote target", () => {
  for (const [args, reason] of [[[], /Use --disposable/], [accepted.with(1, "db.example.test"), /Only literal 127\.0\.0\.1/]]) {
    const result = spawnSync(process.execPath, [executable, ...args], { encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, reason);
    assert.equal(result.stdout, "");
  }
});
