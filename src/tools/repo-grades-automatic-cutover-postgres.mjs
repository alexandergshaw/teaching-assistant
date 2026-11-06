import assert from "node:assert/strict";

const inherited = "00000000-0000-4000-8000-0000000000a1";
const fresh = "00000000-0000-4000-8000-0000000000a2";
const savedFalse = "00000000-0000-4000-8000-0000000000a3";
const courseId = "00000000-0000-4000-8000-0000000001a1";
const legacyBatch = "00000000-0000-4000-8000-0000000002a1";
const futureLegacyBatch = "00000000-0000-4000-8000-0000000002a2";
const discoveryLease = "00000000-0000-4000-8000-0000000002a3";

export async function runAutomaticRepoGradeCutoverCases({ owner, worker, contender, witness, waitForBlock }) {
  await owner.query(`
    insert into auth.users values ('${inherited}'), ('${fresh}'), ('${savedFalse}');
    insert into public.repo_grade_startup_batches (user_id, id, sealed_at, expires_at, closed_at)
      values ('${savedFalse}', '${legacyBatch}', clock_timestamp(), clock_timestamp(), clock_timestamp());
    insert into public.repo_grade_automatic_settings (user_id, enabled, schedule_time, schedule_zone, next_scheduled_at)
      values ('${savedFalse}', false, '08:00', 'UTC', clock_timestamp() + interval '1 day');
    insert into public.course_hub (id, user_id, github_org, name)
      values ('${courseId}', '${inherited}', 'Example', 'Legacy course');
  `);
  const status = async (account = inherited) =>
    JSON.parse(await worker.query(`select public.repo_grade_automatic_status('${account}');`));
  const control = (action, args = "", account = inherited) =>
    worker.query(`select public.repo_grade_automatic_control('${account}', '${action}'${args});`);
  const staged = (batchId, folder) =>
    worker.query(`select public.repo_grade_stage_startup('${inherited}', '${batchId}', '${courseId}',
      '[{"repo":"Example/Repo","folder":"${folder}","ref":"main","sha":"${"a".repeat(40)}"}]');`);
  const seal = (batchId) => worker.query(`select public.repo_grade_seal_startup('${inherited}', '${batchId}', 1);`);
  const claim = () => worker.query(`select public.repo_grade_automatic_claim('${discoveryLease}');`);

  await worker.query("set role service_role;");
  try {
    assert.equal(await control("enqueue", "", fresh), "f");
    assert.equal((await status(fresh)).enabled, false);
    assert.equal((await status(savedFalse)).enabled, false, "A saved false remains off even when it also has a schedule and legacy history.");
    assert.equal(await control("enqueue", "", savedFalse), "f");
    assert.equal(await staged(legacyBatch, "first"), "[]");
    assert.equal((await status()).enabled, false, "An unsealed preview is not evidence of an existing startup run.");
    assert.equal(await seal(legacyBatch), "t");
    assert.equal((await status()).enabled, true, "A previously sealed browser batch supplies the implicit preference.");

    assert.equal(await worker.query(`select public.repo_grade_automatic_set_schedule('${inherited}', '08:00', 'UTC');`), "t");
    assert.equal((await status()).enabled, true, "Saving a schedule must not turn off inherited startup.");
    assert.equal(await owner.query(`select enabled is null from public.repo_grade_automatic_settings
      where user_id = '${inherited}';`), "t", "Schedule-only settings carry no explicit preference.");

    assert.equal(await control("enqueue"), "t");
    assert.equal(await control("enqueue"), "f");
    const { run } = await status();
    assert.equal(run.waitingForBrowserStartup, true);
    assert.equal(await claim(), "", "A queued durable run cannot claim while the sealed browser batch is active.");
    const startLegacyTarget = `select public.repo_grade_start_startup_target(
      '${inherited}', '${legacyBatch}', '${courseId}', 'Example/Repo', 'first', 'main', '${"a".repeat(40)}');`;
    if (contender && witness && waitForBlock) {
      await checkRenewalRace({ owner, worker, contender, witness, waitForBlock, startLegacyTarget });
      const waiting = (await status()).run;
      assert.equal(waiting.waitingForBrowserStartup, true);
      assert.equal(waiting.settling, false);
    } else {
      assert.equal(await worker.query(startLegacyTarget), "t", "The old batch can drain without a second runner.");
    }
    assert.equal(await staged(futureLegacyBatch, "next"), "[]");
    assert.equal(await worker.query(`select public.repo_grade_close_startup('${inherited}', '${legacyBatch}');`), "t");
    assert.equal((await status()).run.waitingForBrowserStartup, false);
    assert.equal(await seal(futureLegacyBatch), "f", "A stale browser cannot seal after durable work has been accepted.");
    assert.equal(JSON.parse(await claim()).runId, run.id);

    assert.equal(await control("stop", `, null, '${run.id}'`), "t");
    assert.equal(await worker.query(`select public.repo_grade_automatic_finish_discovery(
      '${run.id}', '${discoveryLease}', '${courseId}', 'scanned', null, '[]', null);`), "t");
    assert.equal(await seal(futureLegacyBatch), "t", "Legacy can be restored after a stopped durable lease drains.");
    assert.equal(await worker.query(`select public.repo_grade_close_startup('${inherited}', '${futureLegacyBatch}');`), "t");
    assert.equal(await control("preference", ", false"), "t");
    assert.equal((await status()).enabled, false);
    assert.equal(await control("enqueue"), "f", "Explicit off overrides the inherited default.");
  } finally {
    await worker.query("reset role;");
  }
}

async function checkRenewalRace({ owner, worker, contender, witness, waitForBlock, startLegacyTarget }) {
  const holdingPid = await worker.query("select pg_backend_pid();");
  const waitingPid = await contender.query("select pg_backend_pid();");
  await contender.query("set role service_role;");
  try {
    await owner.query(`update public.repo_grade_startup_batches set expires_at = clock_timestamp() + interval '3 seconds'
      where user_id = '${inherited}' and id = '${legacyBatch}';`);
    await worker.query("begin;");
    let claim;
    let result;
    try {
      assert.equal(await worker.query(startLegacyTarget), "t", "Legacy renewal starts before the original expiry.");
      await witness.query(`select pg_sleep(greatest(0, extract(epoch from (
        (select expires_at from public.repo_grade_startup_batches where user_id = '${inherited}' and id = '${legacyBatch}')
        - clock_timestamp()
      )) + 0.1));`);
      claim = contender.query(`select public.repo_grade_automatic_claim('${discoveryLease}');`).then(
        (value) => ({ value }), (error) => ({ error }),
      );
      await waitForBlock(waitingPid, holdingPid);
    } finally {
      await worker.query("commit;");
      result = await claim;
    }
    if (result.error) throw result.error;
    assert.deepEqual(JSON.parse(result.value), { phase: "advanced" }, "Claim rechecks the renewal after the shared lock is released.");
  } finally {
    await contender.query("reset role;");
  }
}
