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

test("the preparation migration uses the guarded harness and shares the grade dispatch boundary", () => {
  const harness = readFileSync(executable, "utf8");
  const filename = harness.match(/const preparationMigrationFile = "([^"]+\.sql)";/)?.[1];
  assert.match(filename ?? "", /^\d{14}_repo_grade_rubric_preparation_admission\.sql$/);
  assert.match(harness, /await owner\.query\(`begin;\s*select pg_advisory_xact_lock\([^)]+\);\s*\$\{checkFreshDatabase\(\)\}/);
  assert.match(harness, /await owner\.query\(`begin; \$\{preparationMigration\} rollback;`\)[\s\S]*await owner\.query\(`begin; \$\{preparationMigration\} commit;`\)[\s\S]*await runRubricPreparationCases/);
  const migration = readFileSync(new URL(`../../supabase/migrations/${filename}`, import.meta.url), "utf8");
  const reservation = migration.match(/create table public\.repo_grade_preparation_reservations \(([^;]+)\);/)?.[1];
  assert.match(reservation ?? "", /references auth\.users/);
  assert.doesNotMatch(reservation ?? "", /course_id|token|references public\./);
  assert.match(migration, /count\(\*\) from public\.repo_grade_reservations[\s\S]*count\(\*\) from public\.repo_grade_preparation_reservations/);
  assert.match(migration, /t\.repo = p_repo and t\.source_ref = p_source_ref and t\.source_sha = p_source_sha/);
  assert.match(migration, /or \(case when course\.course_kind in \('coding', 'applied'\) then course\.course_kind <> p_course_kind\s+else p_course_kind <> 'coding' end\)/);
  assert.match(migration, /prep\.state <> \(case when p_outcome = 'failed-before-dispatch' then 'prepared' else 'started' end\)/);
  assert.match(migration, /'rubricFingerprint', public\.repo_grade_preparation_rubric_fingerprint\(p_receipt ->> 'rubric'\)/);
});

test("preparation retry archives the terminal generation before rotating its dispatch token", () => {
  const harness = readFileSync(new URL("./repo-grades-admission-v2-postgres.mjs", import.meta.url), "utf8");
  const filename = harness.match(/const preparationRetryMigrationFile = "([^"]+\.sql)";/)?.[1];
  assert.match(filename ?? "", /^\d{14}_repo_grade_preparation_explicit_retry\.sql$/);
  const migration = readFileSync(new URL(`../../supabase/migrations/${filename}`, import.meta.url), "utf8");
  assert.match(harness, /preparationRetryMigration\} rollback;[\s\S]*preparationRetryMigration\} commit;[\s\S]*runRubricPreparationCases/);
  assert.match(migration, /if prep\.state in \('failed', 'expired'\) then[\s\S]*if p_retry_generation is null then[\s\S]*'explicit-retry-required'/);
  assert.match(migration, /p_retry_generation is distinct from retry_generation[\s\S]*'retry-unavailable'[\s\S]*insert into public\.repo_grade_preparation_history[\s\S]*token = gen_random_uuid\(\)[\s\S]*insert into public\.repo_grade_preparation_reservations/);
  assert.match(migration, /grant select, insert on public\.repo_grade_preparation_history to service_role/);
});
