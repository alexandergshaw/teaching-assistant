import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

/** Refuses remote, unmarked, shared and non-disposable database targets. */
export function connectionOptions(args, env) {
  const [optIn, host, port, database, user] = args;
  assert.equal(args.length, 5, "Use --disposable 127.0.0.1 PORT archive_review_fence_test_SUFFIX USER.");
  assert.equal(optIn, "--disposable");
  assert.equal(host, "127.0.0.1");
  assert(/^[0-9]{1,5}$/.test(port) && Number(port) > 0 && Number(port) <= 65535, "Invalid port.");
  assert(/^archive_review_fence_test_[a-z0-9_]{1,30}$/.test(database), "Invalid disposable database name.");
  assert(/^[a-z_][a-z0-9_]{0,62}$/.test(user), "Invalid local role name.");
  const childEnv = Object.fromEntries(Object.entries(env).filter(([key]) => /^(path|systemroot|windir|temp|tmp)$/i.test(key)));
  Object.assign(childEnv, { PGCONNECT_TIMEOUT: "5", PGPASSFILE: process.platform === "win32" ? "NUL" : "/dev/null", PGSSLMODE: "disable", PGGSSENCMODE: "disable", PGOPTIONS: "-c search_path=pg_catalog,public -c statement_timeout=12000 -c idle_in_transaction_session_timeout=30000" });
  return { database, port, user, env: childEnv, psqlArgs: ["-X", "-w", "-qAt", "--file=-", "--set=ON_ERROR_STOP=1", "--set=VERBOSITY=verbose", `--host=${host}`, `--port=${port}`, `--dbname=${database}`, `--username=${user}`] };
}

/** The only executable variant is a checked copy in a disposable cluster. */
export function committedDraftCopy(draft) {
  const sql = draft.replace(/^\s*--[^\r\n]*/gm, "").trim();
  assert.match(sql, /^begin;\s+create schema archive_review_private;/i);
  assert.match(sql, /\brollback;$/i);
  assert.doesNotMatch(sql, /(?:^\s*\\|\bcommit\b)/im);
  return draft.replace(/rollback;\s*$/i, "commit;\n");
}

function openPsql(options) {
  const child = spawn("psql", options.psqlArgs, { env: options.env, windowsHide: true });
  let errors = "", pending, failure, sequence = 0;
  const fail = (error) => { failure = error; pending?.reject(error); };
  child.stderr.setEncoding("utf8").on("data", (chunk) => { errors += chunk; });
  child.stdin.on("error", () => {});
  child.once("error", (error) => fail(new Error(`Could not launch psql: ${error.message}`)));
  child.once("close", (code) => fail(new Error(`psql exited (${code}): ${errors}`)));
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!pending) return;
    if (line === pending.marker) pending.resolve(pending.lines.join("\n")); else pending.lines.push(line);
  });
  return {
    async query(sql) {
      if (failure) throw failure;
      assert.equal(pending, undefined, "One query per connection at a time.");
      const marker = `__archive_review_end_${++sequence}__`;
      let timeout;
      try {
        return await new Promise((resolve, reject) => {
          pending = { marker, lines: [], resolve, reject };
          timeout = setTimeout(() => { child.kill(); fail(new Error(`psql request timed out: ${errors}`)); }, 20000);
          child.stdin.write(`${sql}\n\\echo ${marker}\n`);
        });
      } finally { clearTimeout(timeout); pending = undefined; }
    },
    close() { child.kill(); },
  };
}

function connectionGuard({ port, user }, database, marker) {
  return `do $check$ begin
    if current_database() <> '${database}' or current_user <> '${user}'
      or inet_server_addr() is distinct from inet '127.0.0.1' or inet_client_addr() is distinct from inet '127.0.0.1'
      or inet_server_port() is distinct from ${Number(port)} or current_setting('server_version_num')::integer < 150000
      or shobj_description((select oid from pg_database where datname = current_database()), 'pg_database') is distinct from '${marker}'
      or not exists (select from pg_roles where rolname = current_user and rolsuper)
    then raise exception 'expected the marked disposable local PostgreSQL 15+ database'; end if;
  end $check$;`;
}

const O = "11111111-1111-4111-8111-111111111111", A = "22222222-2222-4222-8222-222222222222", G = "33333333-3333-4333-8333-333333333333", R = "44444444-4444-4444-8444-444444444444", S = "55555555-5555-4555-8555-555555555555", W = "66666666-6666-4666-8666-666666666666", D = "77777777-7777-4777-8777-777777777777", T = "88888888-8888-4888-8888-888888888888";
const principal = `'${O}','${A}','${G}','${R}'`;

async function waitForLock(observer, pid) {
  for (let i = 0; i < 100; i++) {
    if (await observer.query(`select count(*) from pg_stat_activity where pid=${Number(pid)} and wait_event_type='Lock';`) === "1") return;
    await sleep(100);
  }
  throw new Error("Contender did not reach an observed database lock wait.");
}

async function main() {
  const options = connectionOptions(process.argv.slice(2), process.env);
  const draft = readFileSync(new URL("../../docs/archive-review-fence-draft.sql", import.meta.url), "utf8");
  const committed = committedDraftCopy(draft);
  const clusterOptions = { ...options, psqlArgs: options.psqlArgs.map((arg) => arg === `--dbname=${options.database}` ? "--dbname=postgres" : arg) };
  const sessions = [openPsql(options), openPsql(options), openPsql(options), openPsql(clusterOptions)];
  const [owner, contender, observer, bootstrap] = sessions;
  try {
    for (const session of [owner, contender, observer]) await session.query(connectionGuard(options, options.database, "archive-review-fence disposable harness"));
    await bootstrap.query(connectionGuard(options, "postgres", "archive-review-fence disposable cluster"));
    const freshness = `do $fresh$ begin
      if exists (select from pg_database where not datistemplate and datname not in ('postgres', current_database()))
        or exists (select from pg_roles where rolname not like 'pg\\_%' and rolname <> current_user)
        or exists (select from pg_namespace where nspname not in ('pg_catalog', 'pg_toast', 'information_schema', 'public'))
        or exists (select from pg_depend where refclassid = 'pg_namespace'::regclass and refobjid = 'public'::regnamespace)
      then raise exception 'expected a fresh disposable cluster'; end if;
    end $fresh$;`;
    await owner.query(freshness);
    // Check postgres separately: the allowed bootstrap database may not hide
    // application objects. The only other permitted database is the fixture.
    await bootstrap.query(freshness.replace("('postgres', current_database())", `('postgres', '${options.database}')`));
    await owner.query(draft);
    assert.equal(await observer.query("select to_regnamespace('archive_review_private') is null;"), "t");
    await owner.query(committed);
    assert.equal(await owner.query("select count(*) from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a where n.nspname='archive_review_private' and a.grantee=0;"), "0");
    assert.equal(await owner.query("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where n.nspname='archive_review_private' and a.grantee=0;"), "0");
    assert.equal(await owner.query("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a where n.nspname='archive_review_private' and c.relkind in ('r','p') and a.grantee=0;"), "0");
    await owner.query(`insert into archive_review_private.sources(review_id,owner_id,auth_session_id,grading_session_id,source_id,expires_at,writer_boundary_verified,capabilities_never_issued) values ('${R}','${O}','${A}','${G}','${S}',clock_timestamp()+interval '10 minutes',true,true);`);
    assert.equal(await owner.query(`select archive_review_private.start_operation('${A}','${A}','${G}','${R}','${W}','write');`), "unavailable");
    assert.equal(await owner.query(`select archive_review_private.start_operation('${O}','${G}','${G}','${R}','${W}','write');`), "unavailable");
    const pid = await contender.query("select pg_backend_pid();");
    assert.equal(await owner.query(`begin; select archive_review_private.start_operation(${principal},'${W}','write');`), "started");
    const competingWrite = contender.query(`select archive_review_private.start_operation(${principal},'${D}','write');`);
    await waitForLock(observer, pid);
    await owner.query("commit;");
    assert.equal(await competingWrite, "unavailable");
    assert.equal(await owner.query(`select archive_review_private.start_operation(${principal},'${W}','write');`), "unavailable");
    assert.equal(await owner.query(`select archive_review_private.finish_operation(${principal},'${W}','unknown');`), "pending");
    assert.equal(await owner.query(`select archive_review_private.finish_operation(${principal},'${W}','write-verified-stored','${"a".repeat(64)}');`), "pending");
    assert.equal(await owner.query(`select archive_review_private.start_operation(${principal},'${D}','read');`), "unavailable");
    assert.equal(await owner.query(`select archive_review_private.finish_operation(${principal},'${W}','write-verified-stored','${"a".repeat(64)}',jsonb_build_object('sourceSha256','${"a".repeat(64)}','members',jsonb_build_array(jsonb_build_object('id','0','path','work.txt','crc32',1,'uncompressedSize',1))));`), "ended");
    await owner.query(`begin; select archive_review_private.start_operation(${principal},'${D}','read'); update archive_review_private.sources set created_at=clock_timestamp()-interval '2 seconds', expires_at=clock_timestamp()-interval '1 second' where review_id='${R}';`);
    const wait = contender.query(`select status from archive_review_private.tombstone_source(${principal},'${T}');`);
    await waitForLock(observer, pid);
    await owner.query("commit;");
    assert.equal(await wait, "unavailable");
    assert.equal(await owner.query(`select archive_review_private.finish_operation(${principal},'${D}','read-quiesced');`), "ended");
    assert.equal(await owner.query(`select status from archive_review_private.tombstone_source(${principal},'${T}');`), "deleting");
    assert.equal(await owner.query(`select token::text from archive_review_private.tombstone_source(${principal},'${W}');`), T);
    assert.equal(await owner.query(`select archive_review_private.start_operation(${principal},'${D}','read');`), "unavailable");
    assert.equal(await owner.query(`select archive_review_private.mark_deleted(${principal},'${W}','wrong');`), "unavailable");
    assert.equal(await owner.query(`select archive_review_private.mark_deleted(${principal},'${T}',source_path) from archive_review_private.sources where review_id='${R}';`), "deleted");
    assert.equal(await owner.query(`select phase from archive_review_private.sources where review_id='${R}';`), "deleted");
    process.stdout.write("Archive review transactional fence checks passed.\n");
  } finally { for (const session of sessions) session.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
