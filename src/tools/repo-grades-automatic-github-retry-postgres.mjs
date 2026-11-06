import assert from "node:assert/strict";

const account = "00000000-0000-4000-8000-0000000000c1";
const other = "00000000-0000-4000-8000-0000000000c2";
const course = "00000000-0000-4000-8000-0000000001c1";
const lease = "00000000-0000-4000-8000-0000000002c1";
const staleLease = "00000000-0000-4000-8000-0000000002c2";

export async function runAutomaticRepoGradeGithubRetryCases({ owner, worker }) {
  await owner.query(`
    insert into auth.users values ('${account}'), ('${other}');
    insert into public.course_hub (id, user_id, github_org, name)
      values ('${course}', '${account}', 'Example', 'Retry course');
  `);
  for (const role of ["anon", "authenticated", "queue_v2_ungranted", "service_role"]) {
    assert.equal(await owner.query(`select has_function_privilege(
      '${role}', 'public.repo_grade_automatic_finish_github_throttle(uuid,uuid,uuid,boolean,timestamptz,boolean)', 'EXECUTE');`),
    role === "service_role" ? "t" : "f");
  }
  const status = async (id = account) =>
    JSON.parse(await worker.query(`select public.repo_grade_automatic_status_with_github_retry('${id}');`));
  const setRetry = (enabled) => worker.query(`select public.repo_grade_automatic_set_github_retry('${account}', ${enabled});`);
  const claim = async () => {
    const value = await worker.query(`select public.repo_grade_automatic_claim('${lease}');`);
    return value ? JSON.parse(value) : null;
  };
  const start = async () => {
    assert.equal(await worker.query(`select public.repo_grade_automatic_control('${account}', 'start');`), "t");
    return (await status()).run.id;
  };
  const throttle = (run, options = {}) => worker.query(`select public.repo_grade_automatic_finish_github_throttle(
    '${run}', '${options.lease ?? lease}', '${course}', ${options.discovering ?? true},
    ${options.retryAt ?? "null"}, ${options.primary ?? false});`);
  const expireCooldown = (run) => owner.query(`update public.repo_grade_automatic_runs
    set github_retry_at = clock_timestamp() - interval '1 second' where id = '${run}';`);

  await worker.query("set role service_role;");
  try {
    assert.equal((await status()).githubRetryEnabled, false);
    const off = await start();
    assert.equal((await claim()).retryGithubRateLimits, false);
    assert.equal(await throttle(off), "t");
    assert.equal((await status()).githubRetryAt, null);
    assert.equal((await status()).run.courses[0].reason, "rate-limited");
    assert.deepEqual(await claim(), { phase: "advanced" });

    assert.equal(await setRetry(true), "t");
    assert.equal((await status()).enabled, false, "Retry opt-in leaves the opening preference alone.");
    assert.equal((await status(other)).githubRetryEnabled, false);
    const paused = await start();
    assert.equal((await claim()).retryGithubRateLimits, true);
    assert.equal(await throttle(paused, { lease: staleLease }), "f");
    assert.equal(await throttle(paused, {
      retryAt: "clock_timestamp() + interval '20 seconds'", primary: true,
    }), "t");
    assert.equal(await owner.query(`select github_retry_at between clock_timestamp() + interval '15 seconds'
      and clock_timestamp() + interval '22 seconds' from public.repo_grade_automatic_runs where id = '${paused}';`), "t",
    "A primary reset can resume before the secondary fallback floor.");
    const waiting = await status();
    assert.equal(waiting.run.phase, "discovering");
    assert.equal(waiting.run.settling, false);
    assert.equal(waiting.run.courses[0].state, "checking");
    assert.ok(waiting.githubRetryAt);
    assert.equal(await claim(), null);
    assert.equal(await setRetry(false), "t");
    assert.equal((await status()).run.phase, "incomplete");
    assert.equal((await status()).githubRetryAt, null);
    assert.equal(await claim(), null, "Opt-out cancels the pending retry.");

    assert.equal(await setRetry(true), "t");
    const stopped = await start();
    await claim();
    assert.equal(await throttle(stopped, { retryAt: "clock_timestamp() + interval '20 seconds'" }), "t");
    assert.equal(await owner.query(`select github_retry_at between clock_timestamp() + interval '15 seconds'
      and clock_timestamp() + interval '22 seconds' from public.repo_grade_automatic_runs where id = '${stopped}';`), "t",
    "An explicit first Retry-After can resume before the secondary fallback floor.");
    assert.equal(await worker.query(`select public.repo_grade_automatic_control('${account}', 'stop', null, '${stopped}');`), "t");
    assert.equal((await status()).githubRetryAt, null);
    assert.equal(await claim(), null, "Stop cancels cooldown without creating a new lease.");

    const graded = await start();
    assert.equal((await claim()).runId, graded);
    const selectors = JSON.stringify(["one", "two"].map((folder) => ({ repo: "Example/Repo", folder, ref: "main", sha: "a".repeat(40) })));
    assert.equal(await worker.query(`select public.repo_grade_automatic_finish_discovery(
      '${graded}', '${lease}', '${course}', 'scanned', null, '${selectors}', null);`), "t");
    assert.equal((await claim()).folder, "one");
    assert.equal(await throttle(graded, { discovering: false }), "t");
    assert.equal(await claim(), null);
    await expireCooldown(graded);
    assert.equal((await claim()).folder, "one", "A pre-admission throttle retries the same target.");
    assert.equal(await worker.query(`select public.repo_grade_automatic_finish(
      '${graded}', '${lease}', '${course}', 'unknown', 'worker-interrupted');`), "t");
    assert.equal((await claim()).folder, "two", "An uncertain evaluation is not replayed.");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      assert.equal(await throttle(graded, { discovering: false }), "t");
      await expireCooldown(graded);
      assert.equal((await claim()).folder, "two");
    }
    assert.equal(await throttle(graded, { discovering: false }), "t");
    assert.equal(await claim(), null);
    const exhausted = await status();
    assert.equal(exhausted.run.phase, "incomplete");
    assert.ok(exhausted.run.courses[0].counts.some(({ state, reason }) =>
      state === "not-started" && reason === "rate-limit-retry-exhausted"));
    assert.ok(exhausted.run.courses[0].counts.some(({ state }) => state === "unknown"));
  } finally {
    await worker.query("reset role;");
  }
}
