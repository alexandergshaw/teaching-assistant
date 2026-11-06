import assert from "node:assert/strict";

const ownerId = "00000000-0000-4000-8000-000000000091";
const otherId = "00000000-0000-4000-8000-000000000092";
const courseId = "00000000-0000-4000-8000-000000000191";
const discoveryLease = "00000000-0000-4000-8000-000000000291";
const targetLease = "00000000-0000-4000-8000-000000000292";

export async function runAutomaticRepoGradeScheduleCases({ owner, worker }) {
  await owner.query(`
    insert into auth.users values ('${ownerId}'), ('${otherId}');
    insert into public.course_hub (id, user_id, github_org, name)
      values ('${courseId}', '${ownerId}', 'Example', 'Scheduled course');
  `);
  const status = async (id = ownerId) =>
    JSON.parse(await worker.query(`select public.repo_grade_automatic_status('${id}');`));
  const set = (time, zone) => worker.query(`select public.repo_grade_automatic_set_schedule('${ownerId}', ${time}, ${zone});`);
  const wake = async () => JSON.parse(await worker.query("select public.repo_grade_automatic_enqueue_due();"));
  const due = () => owner.query(`update public.repo_grade_automatic_settings set next_scheduled_at = clock_timestamp() - interval '3 days'
    where user_id = '${ownerId}';`);
  const claim = async (lease) => JSON.parse(await worker.query(`select public.repo_grade_automatic_claim('${lease}');`));

  assert.equal(await owner.query(`select has_function_privilege('authenticated',
    'public.repo_grade_automatic_set_schedule(uuid,time,text)', 'execute');`), "f");
  assert.equal(await owner.query(`select has_function_privilege('anon',
    'public.repo_grade_automatic_enqueue_due()', 'execute');`), "f");

  await worker.query("set role service_role;");
  try {
    assert.equal(await worker.query(`select public.repo_grade_automatic_next_daily(
      '2026-03-08T05:00:00Z', '02:30', 'America/Chicago') = '2026-03-08T08:30:00Z'::timestamptz;`), "t");
    assert.equal(await worker.query(`select public.repo_grade_automatic_next_daily(
      '2026-11-01T07:30:00Z', '01:30', 'America/Chicago') = '2026-11-02T07:30:00Z'::timestamptz;`), "t");
    assert.equal(await set("'08:30'", "'Bad/Zone'"), "f");
    assert.equal(await set("'24:00'", "'UTC'"), "f");
    assert.equal(await set("'08:30'", "'America/Chicago'"), "t");
    const saved = await status();
    assert.equal(saved.enabled, false, "Daily scheduling is independent of the browser-opening preference.");
    assert.equal(saved.schedule.time, "08:30");
    assert.equal(saved.schedule.zone, "America/Chicago");
    assert.equal((await status(otherId)).schedule, null);
    assert.deepEqual(await wake(), { accepted: 0, failed: 0 });
    assert.equal(await worker.query(`select public.repo_grade_automatic_control('${ownerId}', 'enqueue');`), "f");

    await due();
    assert.deepEqual(await wake(), { accepted: 1, failed: 0 });
    const run = (await status()).run;
    assert.deepEqual(run.courses.map(({ courseId: id }) => id), [courseId]);
    assert.deepEqual(await wake(), { accepted: 0, failed: 0 });
    assert.equal(await owner.query(`select next_scheduled_at > clock_timestamp()
      from public.repo_grade_automatic_settings where user_id = '${ownerId}';`), "t");
    await due();
    assert.deepEqual(await wake(), { accepted: 0, failed: 0 });
    assert.equal((await status()).run.id, run.id, "A due tick cannot create a duplicate while a run is active.");

    assert.equal((await claim(discoveryLease)).phase, "discovering");
    const selectors = [{ repo: "Example/Repo", folder: "A", ref: "main", sha: "a".repeat(40) }];
    const coverage = { checked: 1, found: 2, enumerationComplete: true };
    assert.equal(await worker.query(`select public.repo_grade_automatic_finish_discovery(
      '${run.id}', '${discoveryLease}', '${courseId}', 'partial', 'tree-truncated',
      '${JSON.stringify(selectors)}', '${JSON.stringify(coverage)}');`), "t");
    assert.deepEqual((await status()).run.courses[0].repositories, coverage);
    assert.equal((await claim(targetLease)).phase, "grading");
    assert.equal(await worker.query(`select public.repo_grade_automatic_finish(
      '${run.id}', '${targetLease}', '${courseId}', 'partial', 'feedback-recovery-available', null, null, null, 'e30=');`), "t");
    const beforeExpiry = await status();
    assert.equal(beforeExpiry.recoveries.length, 1);
    assert.equal(typeof beforeExpiry.recoveries[0].expiresAt, "string");
    await owner.query(`update public.repo_grade_automatic_targets set recovery_until = clock_timestamp()
      where run_id = '${run.id}';`);
    const expired = await status();
    assert.deepEqual(expired.recoveries, []);
    assert.equal(expired.run.courses[0].counts[0].reason, "feedback-retention-unconfirmed");
    assert.equal(await owner.query(`select recovery is not null
      from public.repo_grade_automatic_targets where run_id = '${run.id}';`), "t", "Status is correct before cleanup.");

    assert.deepEqual(await claim(discoveryLease), { phase: "advanced" });
    assert.equal(await set("null", "null"), "t");
    assert.equal((await status()).schedule, null);
    assert.equal(await worker.query(`select public.repo_grade_automatic_control('${ownerId}', 'start');`), "t");
  } finally {
    await worker.query("reset role;");
  }
}
