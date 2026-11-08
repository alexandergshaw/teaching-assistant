import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function options(args, env) {
  assert.equal(args.length, 5, "Use --disposable 127.0.0.1 PORT canvas_video_test_SUFFIX USER.");
  const [opt, host, port, db, user] = args;
  assert.equal(opt, "--disposable"); assert.equal(host, "127.0.0.1");
  assert(/^[0-9]{1,5}$/.test(port) && +port > 0 && +port <= 65535);
  assert(/^canvas_video_test_[a-z0-9_]{1,30}$/.test(db));
  assert(/^[a-z_][a-z0-9_]{0,62}$/.test(user));
  const safeEnv = Object.fromEntries(Object.entries(env).filter(([key]) => /^(path|systemroot|windir|temp|tmp)$/i.test(key)));
  Object.assign(safeEnv, { PGCONNECT_TIMEOUT: "5", PGPASSFILE: process.platform === "win32" ? "NUL" : "/dev/null", PGSSLMODE: "disable", PGGSSENCMODE: "disable", PGOPTIONS: "-c statement_timeout=12000 -c search_path=pg_catalog,public" });
  return { db, user, port: +port, env: safeEnv, args: ["-X", "-w", "-qAt", "--file=-", "--set=ON_ERROR_STOP=1", `--host=${host}`, `--port=${port}`, `--dbname=${db}`, `--username=${user}`] };
}

export function fixtureSql(draft, config) {
  const clean = draft.replace(/^\s*--[^\r\n]*/gm, "").trim();
  assert.match(clean, /^begin;\s+create schema canvas_video_private;/i);
  assert.match(clean, /rollback;$/i);
  assert.doesNotMatch(clean, /(?:^\s*\\|\bcommit\b)/im);
  const guard = `do $guard$ begin
    if current_database() <> '${config.db}' or current_user <> '${config.user}'
      or inet_server_addr() is distinct from inet '127.0.0.1' or inet_client_addr() is distinct from inet '127.0.0.1'
      or inet_server_port() is distinct from ${config.port} or current_setting('server_version_num')::int < 150000
      or shobj_description((select oid from pg_database where datname=current_database()), 'pg_database') is distinct from 'canvas-video reservation disposable harness'
      or to_regnamespace('canvas_video_private') is not null
    then raise exception 'expected marked disposable local test database'; end if;
  end $guard$;`;
  const tests = `do $test$ declare
    owner uuid := '11111111-1111-4111-8111-111111111111';
    token uuid := '22222222-2222-4222-8222-222222222222';
    path text := '11111111-1111-4111-8111-111111111111/grading-uploads/2f8a4b1e-5c3d-4e6f-8a9b-0c1d2e3f4a5b.mp4';
  begin
    if not canvas_video_private.reserve_video(owner,path,token) then raise exception 'initial reservation failed'; end if;
    if canvas_video_private.reserve_video(owner,path,'33333333-3333-4333-8333-333333333333') then raise exception 'duplicate path admitted'; end if;
    if canvas_video_private.reserve_video('44444444-4444-4444-8444-444444444444',path,'55555555-5555-4555-8555-555555555555') then raise exception 'foreign path admitted'; end if;
    if canvas_video_private.reserve_video(owner,replace(path,'a5b.mp4','a5c.mp4'),token) then raise exception 'duplicate token admitted'; end if;
    if (select count(*) from canvas_video_private.reservations) <> 1 then raise exception 'incorrect reservations'; end if;
  end $test$;`;
  return clean.replace(/^begin;/i, `begin;\n${guard}`).replace(/rollback;$/i, `${tests}\nrollback;`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = options(process.argv.slice(2), process.env);
    const draft = readFileSync(new URL("../../docs/canvas-video-reservation-draft.sql", import.meta.url), "utf8");
    execFileSync("psql", config.args, { input: fixtureSql(draft, config), env: config.env, stdio: ["pipe", "inherit", "inherit"], windowsHide: true });
    process.stdout.write("Canvas video reservation rollback checks passed.\n");
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
