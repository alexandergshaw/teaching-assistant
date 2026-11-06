import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { runCases } from "./repo-grades-admission-v2-postgres-cases.mjs";
import { runSettlementCases } from "./repo-grades-admission-v2-postgres-settlement.mjs";
import { runCrossRefClaimCases } from "./repo-grades-claim-cross-ref-postgres.mjs";
import { runDispatchBoundaryCases } from "./repo-grades-dispatch-boundary-postgres.mjs";
import { runRubricPreparationCases } from "./repo-grades-rubric-preparation-postgres.mjs";
import { runStartupRetryCases } from "./repo-grades-startup-retry-postgres.mjs";

import { runAutomaticRepoGradeCases } from "./repo-grades-automatic-postgres.mjs";
import { runAutomaticRepoGradeScheduleCases } from "./repo-grades-automatic-schedule-postgres.mjs";

const migrationFiles = [
  "20260710000000_create_course_syllabi.sql",
  "20260713000000_create_course_hub.sql",
  "20260804000000_course_hub_rubric.sql",
  "20260819000000_course_hub_student_repos.sql",
  "20260918000000_course_hub_course_kind.sql",
  "20261005000000_course_hub_repo_module_pairing.sql",
  "20261105174633_repo_grade_evaluations.sql",
  "20261105175119_repo_grade_profiles.sql",
  "20261105175836_repo_grade_attempt_profile_binding.sql",
  "20261105180704_repo_grade_feedback_fidelity.sql",
  "20261106034919_repo_grade_claim_cross_ref.sql",
];
const draftSchema = "repo_grade_admission_private";
const dispatchMigrationFile = "20261106035612_repo_grade_dispatch_boundary.sql";
const preparationMigrationFile = "20261106043419_repo_grade_rubric_preparation_admission.sql";
const startupMigrationFile = "20261106051231_repo_grade_startup_batch.sql";
const preparationRetryMigrationFile = "20261106053623_repo_grade_preparation_explicit_retry.sql";
const startupRetryMigrationFile = "20261106061811_repo_grade_startup_retry_not_started.sql";
const policyUpdateMigrationFile = "20261106122943_repo_grade_preparation_policy_update.sql";
const coordinatedStartupMigrationFile = "20261106150707_repo_grade_coordinated_startup.sql";

const automaticMigrationFile = "20261106181056_repo_grade_automatic_runs.sql";
const automaticScheduleMigrationFile = "20261106182023_repo_grade_automatic_schedule.sql";

export function connectionOptions(args, env) {
  const [confirmation, host, port, database, user] = args;
  assert.equal(args.length, 5, "Use --disposable 127.0.0.1 PORT repo_grades_queue_v2_test_SUFFIX USER.");
  assert.equal(confirmation, "--disposable", "Explicit --disposable confirmation required.");
  assert.equal(host, "127.0.0.1", "Only literal 127.0.0.1 is allowed.");
  assert(/^[0-9]{1,5}$/.test(port) && Number(port) > 0 && Number(port) <= 65535, "Supply an explicit TCP port.");
  assert(/^repo_grades_queue_v2_test_[a-z0-9_]{1,30}$/.test(database), "Use a disposable queue-v2 test database name.");
  assert(/^[a-z_][a-z0-9_]{0,62}$/.test(user), "Supply an explicit simple PostgreSQL role name.");
  // Use only the OS variables needed to locate and run psql. Ignore ambient
  // libpq settings and credentials. -X disables psql startup files.
  const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) =>
    /^(path|systemroot|windir|temp|tmp)$/i.test(key),
  ));
  Object.assign(childEnv, {
    PGCONNECT_TIMEOUT: "5",
    PGPASSFILE: process.platform === "win32" ? "NUL" : "/dev/null",
    PGSSLMODE: "disable",
    PGGSSENCMODE: "disable",
    PGOPTIONS: "-c search_path=pg_catalog,public -c statement_timeout=12000 -c idle_in_transaction_session_timeout=30000",
  });
  return {
    database,
    port,
    user,
    psqlArgs: ["-X", "-w", "-qAt", "--file=-", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose",
      `--host=${host}`, `--port=${port}`, `--dbname=${database}`, `--username=${user}`],
    env: childEnv,
  };
}

function openPsql(options) {
  const child = spawn("psql", options.psqlArgs, { env: options.env, windowsHide: true });
  let errors = "";
  let pending;
  let failure;
  let sequence = 0;
  function fail(error) {
    failure = error;
    pending?.reject(error);
  }
  child.stderr.setEncoding("utf8").on("data", (chunk) => { errors += chunk; });
  child.stdin.on("error", () => { /* The process error or close event reports the cause. */ });
  child.once("error", (error) => fail(new Error(`Could not launch psql: ${error.message}`)));
  child.once("close", (code) => fail(new Error(`psql exited (${code})\n${errors}`)));
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!pending) return;
    if (line === pending.marker) pending.resolve(pending.lines.join("\n"));
    else pending.lines.push(line);
  });
  return {
    async query(sql) {
      if (failure) throw failure;
      assert.equal(pending, undefined, "Only one query at a time per connection.");
      const marker = `__queue_v2_end_${++sequence}__`;
      let timeout;
      try {
        return await new Promise((resolve, reject) => {
          pending = { marker, lines: [], resolve, reject };
          timeout = setTimeout(() => {
            child.kill();
            fail(new Error(`psql did not complete its request\n${errors}`));
          }, 20000);
          child.stdin.write(`${sql}\n\\echo ${marker}\n`);
        });
      } finally {
        clearTimeout(timeout);
        pending = undefined;
      }
    },
    close: () => child.kill(),
  };
}

function checkConnection({ database, port, user }) {
  return `do $check$ begin
    if current_database() <> '${database}' or current_user <> '${user}'
      or inet_server_addr() is distinct from inet '127.0.0.1'
      or inet_client_addr() is distinct from inet '127.0.0.1'
      or inet_server_port() is distinct from ${Number(port)}
      or current_setting('server_version_num')::integer < 150000
      or shobj_description((select oid from pg_database where datname = current_database()), 'pg_database')
        is distinct from 'repo-grades-queue-v2 disposable harness'
      or not exists (select from pg_roles where rolname = current_user and rolsuper)
    then raise exception 'expected the explicitly marked disposable local PostgreSQL 15+ database and its bootstrap superuser'; end if;
  end $check$;`;
}

function checkFreshDatabase() {
  return `do $fresh$ begin
    if exists (select from pg_database where not datistemplate and datname not in ('postgres', current_database()))
      or exists (select from pg_roles where rolname not like 'pg\\_%' and rolname <> current_user)
      or exists (select from pg_namespace where nspname not in ('pg_catalog', 'pg_toast', 'information_schema', 'public'))
      or exists (select from pg_depend where refclassid = 'pg_namespace'::regclass and refobjid = 'public'::regnamespace)
    then raise exception 'expected a fresh single-use PostgreSQL cluster and empty test database'; end if;
  end $fresh$;`;
}

export function committedDraftCopy(draft) {
  const statements = draft.replace(/^\s*--[^\r\n]*/gm, "").trim();
  assert.match(statements, /^begin;\s+create schema repo_grade_admission_private;/i);
  assert.match(statements, /\brollback;$/i);
  assert.doesNotMatch(statements, /(?:^\s*\\|\bcommit\b)/im);
  assert.match(draft, /\nrollback;\s*$/i);
  return draft.replace(/rollback;\s*$/i, "commit;\n");
}

async function main() {
  const options = connectionOptions(process.argv.slice(2), process.env);
  const draft = readFileSync(new URL("../../docs/repo-grades-admission-v2-draft.sql", import.meta.url), "utf8");
  const committed = committedDraftCopy(draft);
  const migrations = migrationFiles.map((file) =>
    readFileSync(new URL(`../../supabase/migrations/${file}`, import.meta.url), "utf8"),
  );
  const dispatchMigration = readFileSync(new URL(`../../supabase/migrations/${dispatchMigrationFile}`, import.meta.url), "utf8");
  const preparationMigration = readFileSync(new URL(`../../supabase/migrations/${preparationMigrationFile}`, import.meta.url), "utf8");
  const preparationRetryMigration = readFileSync(
    new URL(`../../supabase/migrations/${preparationRetryMigrationFile}`, import.meta.url), "utf8",
  );
  const startupMigration = readFileSync(new URL(`../../supabase/migrations/${startupMigrationFile}`, import.meta.url), "utf8");
  const startupRetryMigration = readFileSync(
    new URL(`../../supabase/migrations/${startupRetryMigrationFile}`, import.meta.url), "utf8",
  );
  const sessions = [];
  async function connect() {
    const session = openPsql(options);
    sessions.push(session);
    await session.query(checkConnection(options));
    return session;
  }
  try {
    const owner = await connect();
    await owner.query(`begin;
      select pg_advisory_xact_lock(8042692560736);
      ${checkFreshDatabase()}
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create role queue_v2_ungranted nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      ${migrations.join("\n")}
      commit;`);
    await owner.query(draft);
    const witness = await connect();
    const schemaAbsent = `select to_regnamespace('${draftSchema}') is null;`;
    assert.equal(await owner.query(schemaAbsent), "t", "Draft schema survived rollback in the writing session.");
    assert.equal(await witness.query(schemaAbsent), "t", "Draft schema survived rollback in a separate session.");
    await owner.query(committed);
    await owner.query(`begin; ${dispatchMigration} rollback;`);
    const dispatchMigrationAbsent = `select
      to_regprocedure('public.repo_grade_claim_tracked(uuid,uuid,text,text,text,text,text,jsonb,uuid,jsonb)') is null
      and to_regprocedure('public.repo_grade_begin_dispatch(uuid,bigint,uuid)') is null
      and not exists (select from pg_attribute where attrelid = 'public.repo_grade_attempts'::regclass
        and attname = 'dispatch_state' and not attisdropped);`;
    assert.equal(await owner.query(dispatchMigrationAbsent), "t", "Dispatch migration survived rollback in the writing session.");
    assert.equal(await witness.query(dispatchMigrationAbsent), "t", "Dispatch migration survived rollback in a separate session.");
    await owner.query(`begin; ${dispatchMigration} commit;`);

    const worker = await connect();
    const contender = await connect();
    async function waitForBlock(waitingPid, holdingPid) {
      const deadline = performance.now() + 4000;
      do {
        const blocked = await witness.query(`select ${holdingPid} = any(pg_blocking_pids(${waitingPid})) and exists (
          select from pg_locks where pid = ${waitingPid} and locktype = 'advisory' and not granted
        );`);
        if (blocked === "t") return;
        await sleep(25);
      } while (performance.now() < deadline);
      throw new Error("Expected the contender to wait on the other backend's advisory lock.");
    }
    await runCases({ owner, worker, contender, witness, waitForBlock });
    await runSettlementCases({ owner, worker, contender, witness, waitForBlock });
    await runCrossRefClaimCases({ owner, worker, contender, witness, waitForBlock });
    console.log("PASS: v1 cross-ref admission, claim privileges and PostgreSQL transaction cases completed.");
    await runDispatchBoundaryCases({ owner, worker, contender, witness, waitForBlock });
    console.log("PASS: v1 tracked dispatch migration rollback, privileges and PostgreSQL transaction cases completed.");
    await owner.query(`begin; ${preparationMigration} rollback;`);
    const preparationAbsent = "select to_regclass('public.repo_grade_preparations') is null;";
    assert.equal(await owner.query(preparationAbsent), "t", "Preparation schema survived rollback in the writing session.");
    assert.equal(await witness.query(preparationAbsent), "t", "Preparation schema survived rollback in a separate session.");
    await owner.query(`begin; ${preparationMigration} commit;`);
    await owner.query(`begin; ${startupMigration} commit;`);
    await owner.query(`begin; ${preparationRetryMigration} rollback;`);
    assert.equal(await witness.query("select to_regclass('public.repo_grade_preparation_history') is null;"), "t");
    await owner.query(`begin; ${preparationRetryMigration} commit;`);
    const policyUpdateMigration = readFileSync(new URL(`../../supabase/migrations/${policyUpdateMigrationFile}`, import.meta.url), "utf8");
    await owner.query(`begin; ${policyUpdateMigration} commit;`);
    await owner.query(`begin; ${startupRetryMigration} commit;`);
    const coordinatedStartupMigration = readFileSync(new URL(`../../supabase/migrations/${coordinatedStartupMigrationFile}`, import.meta.url), "utf8");
    await owner.query(`begin; ${coordinatedStartupMigration} commit;`);
    await runRubricPreparationCases({ owner, worker, contender, witness, waitForBlock });
    console.log("PASS: rubric preparation migration rollback, privileges and PostgreSQL transaction cases completed.");
    await runStartupRetryCases({ owner, worker });
    console.log("PASS: startup retry reclaims only work that did not acquire a grade attempt.");
    const automaticMigration = readFileSync(new URL(`../../supabase/migrations/${automaticMigrationFile}`, import.meta.url), "utf8");
    await owner.query(`begin; ${automaticMigration} commit;`);
    await runAutomaticRepoGradeCases({ owner, worker, contender });
    console.log("PASS: durable startup privileges, concurrent enqueue, worker fencing, interruption and stop.");
    const automaticScheduleMigration = readFileSync(
      new URL(`../../supabase/migrations/${automaticScheduleMigrationFile}`, import.meta.url), "utf8",
    );
    await owner.query(`begin; ${automaticScheduleMigration} commit;`);
    await runAutomaticRepoGradeScheduleCases({ owner, worker });
    console.log("PASS: durable schedule isolation, due wakeup, DST, coverage and recovery expiry.");
    console.log("PASS: queue-v2 rollback, effective privileges and PostgreSQL transaction cases completed, including settlement.");
  } finally {
    for (const session of sessions) session.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`FAIL: ${error.message}`);
    process.exitCode = 1;
  });
}
