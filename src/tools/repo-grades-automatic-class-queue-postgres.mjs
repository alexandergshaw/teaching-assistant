import assert from "node:assert/strict";

const account = "00000000-0000-4000-8000-0000000000e1";
const other = "00000000-0000-4000-8000-0000000000e2";
const [a, b, c, foreign, later] = ["e1", "e2", "e3", "e4", "e5"].map((suffix) => `00000000-0000-4000-8000-0000000001${suffix}`);
const lease = "00000000-0000-4000-8000-0000000002e1";

export async function runAutomaticRepoGradeClassQueueCases({ owner, worker }) {
  await owner.query(`
    insert into auth.users values ('${account}'), ('${other}');
    insert into public.course_hub (id, user_id, name) values
      ('${a}', '${account}', 'Class A'), ('${b}', '${account}', 'Class B'),
      ('${c}', '${account}', 'Class C'), ('${foreign}', '${other}', 'Foreign class');
  `);
  for (const role of ["anon", "authenticated", "queue_v2_ungranted", "service_role"]) {
    assert.equal(await owner.query(`select has_function_privilege(
      '${role}', 'public.repo_grade_automatic_set_class_queue(uuid,uuid[])', 'EXECUTE');`),
    role === "service_role" ? "t" : "f");
  }
  const status = async (id = account) => JSON.parse(await worker.query(
    `select public.repo_grade_automatic_status_with_github_retry('${id}');`,
  ));
  const save = (ids) => worker.query(`select public.repo_grade_automatic_set_class_queue('${account}',
    ${ids === null ? "null" : `array[${ids.map((id) => `'${id}'`).join(",")}]::uuid[]`});`);
  const control = (action, args = "") => worker.query(`select public.repo_grade_automatic_control('${account}', '${action}'${args});`);
  const claim = async () => {
    const value = await worker.query(`select public.repo_grade_automatic_claim('${lease}');`);
    return value ? JSON.parse(value) : null;
  };
  async function discover(run, expected, withTarget = false) {
    const work = await claim();
    assert.equal(work.phase, "discovering");
    assert.equal(work.runId, run);
    assert.equal(work.courseId, expected);
    const selectors = withTarget ? [{ repo: "Example/Repo", folder: "project", ref: "main", sha: "a".repeat(40) }] : [];
    assert.equal(await worker.query(`select public.repo_grade_automatic_finish_discovery(
      '${run}', '${lease}', '${expected}', 'scanned', null, '${JSON.stringify(selectors)}', null);`), "t");
  }
  async function grade(run, expected) {
    const work = await claim();
    assert.equal(work.phase, "grading");
    assert.equal(work.runId, run);
    assert.equal(work.courseId, expected);
    assert.equal(await worker.query(`select public.repo_grade_automatic_finish(
      '${run}', '${lease}', '${expected}', 'succeeded', null);`), "t");
  }
  async function due() {
    await owner.query(`update public.repo_grade_automatic_settings
      set next_scheduled_at = clock_timestamp() - interval '1 second' where user_id = '${account}';`);
  }
  const readQueue = async (id = account) => (await status(id)).classQueue.courses.map(({ courseId, included }) => [courseId, included]);

  await worker.query("set role service_role;");
  try {
    assert.deepEqual(await readQueue(), [[a, true], [b, true], [c, true]], "No saved settings keeps every owned class.");
    assert.equal(await control("start"), "t");
    const legacy = (await status()).run.id;
    await owner.query(`update public.repo_grade_automatic_courses set queue_position = null where run_id = '${legacy}';`);
    assert.equal(await save([c, foreign]), "f");
    assert.equal(await save([c, c]), "f");
    assert.equal(await save([c, b]), "t");
    assert.deepEqual(await readQueue(), [[c, true], [b, true], [a, false]]);
    assert.deepEqual(await readQueue(other), [[foreign, true]]);
    await owner.query(`insert into public.course_hub (id, user_id, name) values ('${later}', '${account}', 'New class');`);
    assert.deepEqual(await readQueue(), [[c, true], [b, true], [a, false], [later, false]], "A new class is not silently added to a custom queue.");
    assert.equal((await status()).enabled, false, "Saving the queue does not enable automatic start.");
    for (const id of [a, b, c]) await discover(legacy, id, true);
    for (const id of [a, b, c]) await grade(legacy, id);
    assert.deepEqual(await claim(), { phase: "advanced" });

    assert.equal(await control("preference", ", true"), "t");
    const selected = (await status()).run.id;
    assert.notEqual(selected, legacy);
    assert.equal(await save([]), "t", "An explicitly empty queue saves successfully.");
    for (const id of [c, b]) await discover(selected, id, true);
    for (const id of [c, b]) await grade(selected, id);
    assert.deepEqual(await claim(), { phase: "advanced" });
    assert.equal(await control("enqueue"), "f");
    assert.equal(await control("start"), "f");
    assert.equal((await status()).run.id, selected, "An empty next queue does not create a run.");
    assert.equal(await worker.query(`select public.repo_grade_automatic_set_interval('${account}', 1, 'hours');`), "t");
    await due();
    assert.deepEqual(JSON.parse(await worker.query("select public.repo_grade_automatic_enqueue_due();")), { accepted: 0, failed: 0 });
    assert.equal(await owner.query(`select next_scheduled_at > clock_timestamp()
      from public.repo_grade_automatic_settings where user_id = '${account}';`), "t", "Empty schedule still advances.");

    assert.equal(await save([c]), "t");
    await due();
    assert.deepEqual(JSON.parse(await worker.query("select public.repo_grade_automatic_enqueue_due();")), { accepted: 1, failed: 0 });
    const scheduled = (await status()).run.id;
    await discover(scheduled, c);
    assert.deepEqual(await claim(), { phase: "advanced" });
    assert.equal(await save(null), "t");
    assert.deepEqual(await readQueue(), [[a, true], [b, true], [c, true], [later, true]]);
    assert.equal((await status()).enabled, true);
    assert.equal((await status()).schedule.kind, "interval", "Queue writes preserve unrelated automatic preferences.");
  } finally {
    await worker.query("reset role;");
  }
}
