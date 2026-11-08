import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { options, fixtureSql } from "./canvas-video-reservation-postgres.mjs";

/** Commit a checked draft only after the disposable-cluster guards pass. */
export function committedFixture(draft, config) {
  const checked = fixtureSql(draft, config);
  assert.match(checked, /rollback;$/i);
  return checked.replace(/rollback;$/i, "commit;");
}

export function guard(config, db, marker) {
  return `do $guard$ begin
    if current_database() <> '${db}' or current_user <> '${config.user}'
      or inet_server_addr() is distinct from inet '127.0.0.1' or inet_client_addr() is distinct from inet '127.0.0.1'
      or inet_server_port() is distinct from ${config.port} or current_setting('server_version_num')::int < 150000
      or shobj_description((select oid from pg_database where datname=current_database()), 'pg_database') is distinct from '${marker}'
      or not exists (select from pg_roles where rolname=current_user and rolsuper)
    then raise exception 'expected marked disposable local postgres cluster'; end if;
  end $guard$;`;
}

function openPsql(config) {
  const child = spawn("psql", config.args, { env: config.env, windowsHide: true });
  let pending, failure, stderr = "", sequence = 0;
  const fail = (err) => { failure = err; pending?.reject(err); };
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  child.stdin.on("error", () => {});
  child.once("error", err => fail(new Error(`Could not launch psql: ${err.message}`)));
  child.once("close", code => fail(new Error(`psql exited (${code}): ${stderr}`)));
  createInterface({ input: child.stdout }).on("line", line => {
    if (!pending) return;
    if (line === pending.marker) pending.resolve(pending.lines.join("\n")); else pending.lines.push(line);
  });
  return {
    async query(sql) {
      if (failure) throw failure;
      assert.equal(pending, undefined, "One query per connection at a time.");
      const marker = `__canvas_video_end_${++sequence}__`;
      let timeout;
      try {
        return await new Promise((resolve, reject) => {
          pending = { marker, lines: [], resolve, reject };
          timeout = setTimeout(() => { child.kill(); fail(new Error(`psql request timed out: ${stderr}`)); }, 20000);
          child.stdin.write(`${sql}\n\\echo ${marker}\n`);
        });
      } finally { clearTimeout(timeout); pending = undefined; }
    },
    close() { child.kill(); },
  };
}

async function waitForLock(observer, pid) {
  assert(/^\d+$/.test(pid));
  for (let i = 0; i < 100; i++) {
    if (await observer.query(`select count(*) from pg_stat_activity where pid=${pid} and wait_event_type='Lock';`) === "1") return;
    await sleep(100);
  }
  throw new Error("Contender did not reach an observed lock wait.");
}

async function main() {
  const config = options(process.argv.slice(2), process.env);
  const draft = readFileSync(new URL("../../docs/canvas-video-reservation-draft.sql", import.meta.url), "utf8");
  const fixture = committedFixture(draft, config);
  const cluster = { ...config, args: config.args.map(arg => arg === `--dbname=${config.db}` ? "--dbname=postgres" : arg) };
  const sessions = [openPsql(config), openPsql(config), openPsql(config), openPsql(cluster)];
  const [owner, contender, observer, bootstrap] = sessions;
  try {
    for (const session of [owner, contender, observer]) await session.query(guard(config, config.db, "canvas-video reservation disposable harness"));
    await bootstrap.query(guard(config, "postgres", "canvas-video reservation disposable cluster"));
    const fresh = `do $fresh$ begin
      if exists (select from pg_database where not datistemplate and datname not in ('postgres', '${config.db}'))
        or exists (select from pg_roles where rolname not like 'pg\\_%' and rolname <> current_user)
        or exists (select from pg_namespace where nspname not in ('pg_catalog','pg_toast','information_schema','public'))
        or exists (select from pg_depend where refclassid='pg_namespace'::regclass and refobjid='public'::regnamespace)
      then raise exception 'expected fresh disposable cluster'; end if;
    end $fresh$;`;
    await owner.query(fresh); await bootstrap.query(fresh);
    await owner.query(fixture);
    const user = "11111111-1111-4111-8111-111111111111";
    const path = `${user}/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5c.mp4`;
    const pid = await contender.query("select pg_backend_pid();");
    assert.equal(await owner.query(`begin; select canvas_video_private.reserve_video('${user}','${path}','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');`), "t");
    const race = contender.query(`select canvas_video_private.reserve_video('${user}','${path}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');`);
    await waitForLock(observer, pid);
    await owner.query("commit;");
    assert.equal(await race, "f");
    assert.equal(await observer.query(`select count(*) from canvas_video_private.reservations where path='${path}';`), "1");
    const retryPath = path.replace("a5c.mp4", "a5d.mp4");
    assert.equal(await owner.query(`begin; select canvas_video_private.reserve_video('${user}','${retryPath}','cccccccc-cccc-4ccc-8ccc-cccccccccccc');`), "t");
    const retry = contender.query(`select canvas_video_private.reserve_video('${user}','${retryPath}','dddddddd-dddd-4ddd-8ddd-dddddddddddd');`);
    await waitForLock(observer, pid);
    await owner.query("rollback;");
    assert.equal(await retry, "t");
    assert.equal(await observer.query(`select reservation_id::text from canvas_video_private.reservations where path='${retryPath}';`), "dddddddd-dddd-4ddd-8ddd-dddddddddddd");
    const firstPath = path.replace("a5c.mp4", "a5e.mp4"), secondPath = path.replace("a5c.mp4", "a5f.mp4");
    const token = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    assert.equal(await owner.query(`begin; select canvas_video_private.reserve_video('${user}','${firstPath}','${token}');`), "t");
    const tokenRace = contender.query(`select canvas_video_private.reserve_video('${user}','${secondPath}','${token}');`);
    await waitForLock(observer, pid);
    await owner.query("commit;");
    assert.equal(await tokenRace, "f");
    assert.equal(await observer.query(`select count(*) from canvas_video_private.reservations where reservation_id='${token}';`), "1");
    process.stdout.write("Canvas video concurrent reservation checks passed.\n");
  } finally { for (const session of sessions) session.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
