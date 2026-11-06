import assert from "node:assert/strict";

const ownerId = "00000000-0000-4000-8000-000000000141";
const dailyId = "00000000-0000-4000-8000-000000000142";
const courseId = "00000000-0000-4000-8000-000000000241";

export async function seedRepoGradeDailySchedule({ owner, worker }) {
  await owner.query(`
    insert into auth.users values ('${ownerId}'), ('${dailyId}');
    insert into public.course_hub (id, user_id, github_org, name)
      values ('${courseId}', '${ownerId}', 'Example', 'Interval course');
  `);
  await worker.query("set role service_role;");
  try {
    assert.equal(await worker.query(`select public.repo_grade_automatic_set_schedule('${dailyId}', '08:00', 'UTC');`), "t");
    return JSON.parse(await worker.query(`select public.repo_grade_automatic_status('${dailyId}');`)).schedule;
  } finally {
    await worker.query("reset role;");
  }
}

export async function runAutomaticRepoGradeIntervalCases({ owner, worker, contender }, priorDaily) {
  const status = async (id = ownerId) =>
    JSON.parse(await worker.query(`select public.repo_grade_automatic_status('${id}');`));
  const set = (count, unit) => worker.query(`select public.repo_grade_automatic_set_interval('${ownerId}', ${count}, ${unit});`);
  const wake = async (session = worker) => JSON.parse(await session.query("select public.repo_grade_automatic_enqueue_due();"));
  const anchor = () => owner.query(`update public.repo_grade_automatic_settings set next_scheduled_at = statement_timestamp() - interval '121 hours'
    where user_id = '${ownerId}' returning next_scheduled_at::text;`);
  const currentDue = () => owner.query(`select next_scheduled_at::text from public.repo_grade_automatic_settings where user_id = '${ownerId}';`);
  const advancedBy = (before, hours) => owner.query(`select next_scheduled_at = '${before}'::timestamptz + make_interval(hours => ${hours})
    and next_scheduled_at > clock_timestamp() from public.repo_grade_automatic_settings where user_id = '${ownerId}';`);

  for (const role of ["anon", "authenticated", "queue_v2_ungranted", "service_role"]) {
    assert.equal(await owner.query(`select has_function_privilege('${role}',
      'public.repo_grade_automatic_set_interval(uuid,integer,text)', 'execute');`), role === "service_role" ? "t" : "f");
  }
  await worker.query("set role service_role;");
  await contender.query("set role service_role;");
  try {
    assert.deepEqual((await status(dailyId)).schedule, { ...priorDaily, kind: "daily" });
    assert.equal(await set("null", "'days'"), "f");
    assert.equal(await set(31, "'days'"), "f");
    assert.equal(await set(0, "'hours'"), "f");
    assert.equal(await set(1, "'weeks'"), "f");
    assert.equal((await status()).schedule, null);
    assert.equal(await set(2, "'days'"), "t");
    const saved = await status();
    assert.deepEqual(saved.schedule, { kind: "interval", count: 2, unit: "days", nextAt: saved.schedule.nextAt });
    assert.equal(saved.enabled, false);
    assert.equal(await owner.query(`select next_scheduled_at - clock_timestamp() between interval '47 hours 59 minutes' and interval '48 hours'
      from public.repo_grade_automatic_settings where user_id = '${ownerId}';`), "t");
    assert.equal(await set(2, "'days'"), "t");
    assert.equal((await status()).schedule.nextAt, saved.schedule.nextAt, "Saving unchanged cadence must not postpone a run.");
    const firstDue = await anchor();
    const wakes = await Promise.all([wake(), wake(contender)]);
    assert.deepEqual(wakes.map(({ accepted }) => accepted).sort(), [0, 1], "Overlapping ticks accept a single occurrence.");
    assert.ok(wakes.every(({ failed }) => failed === 0));
    const run = (await status()).run;
    assert.deepEqual(run.courses.map(({ courseId: id }) => id), [courseId]);
    assert.equal(await advancedBy(firstDue, 144), "t", "A delayed tick collapses misses and preserves the original cadence.");
    const overlap = await anchor();
    assert.deepEqual(await wake(), { accepted: 0, failed: 0 });
    assert.equal((await status()).run.id, run.id, "An active run is not duplicated.");
    assert.equal(await advancedBy(overlap, 144), "t", "The overlapped occurrence does not remain due.");
    const due = await currentDue();
    assert.deepEqual(await wake(), { accepted: 0, failed: 0 });
    assert.equal(await currentDue(), due);

    assert.equal(await worker.query(`select public.repo_grade_automatic_set_schedule('${ownerId}', '08:30', 'America/Chicago');`), "t");
    assert.deepEqual((await status()).schedule, {
      kind: "daily", time: "08:30", zone: "America/Chicago", nextAt: (await status()).schedule.nextAt,
    });
    assert.equal(await set(4, "'hours'"), "t");
    assert.equal((await status()).schedule.unit, "hours");
    assert.equal(await worker.query(`select public.repo_grade_automatic_set_schedule('${ownerId}', null, null);`), "t");
    assert.equal((await status()).schedule, null);
    assert.deepEqual((await status(dailyId)).schedule, { ...priorDaily, kind: "daily" });
    assert.equal(await worker.query(`select public.repo_grade_automatic_control(
      '${ownerId}', 'stop', null, '${run.id}');`), "t");
  } finally {
    await worker.query("reset role;");
    await contender.query("reset role;");
  }
}
