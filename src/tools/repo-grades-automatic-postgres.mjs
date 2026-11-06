import assert from "node:assert/strict";

const account = "00000000-0000-4000-8000-000000000081";
const other = "00000000-0000-4000-8000-000000000082";
const course = "00000000-0000-4000-8000-000000000181";
const foreignCourse = "00000000-0000-4000-8000-000000000182";
const first = "00000000-0000-4000-8000-000000000281";
const second = "00000000-0000-4000-8000-000000000282";
const third = "00000000-0000-4000-8000-000000000283";
const fourth = "00000000-0000-4000-8000-000000000284";

const control = (action, args = "", ownerId = account) =>
  `select public.repo_grade_automatic_control('${ownerId}', '${action}'${args});`;
const claim = (lease) => `select public.repo_grade_automatic_claim('${lease}');`;
const status = (ownerId = account) => `select public.repo_grade_automatic_status('${ownerId}');`;
const finish = (run, lease, state, targets = "") =>
  `select public.repo_grade_automatic_finish('${run}', '${lease}', '${course}', '${state}', null${targets});`;

export async function runAutomaticRepoGradeCases({ owner, worker, contender }) {
  await owner.query(`
    insert into auth.users values ('${account}'), ('${other}');
    insert into public.course_hub (id, user_id, github_org, name) values
      ('${course}', '${account}', 'Example', 'Own course'),
      ('${foreignCourse}', '${other}', 'Other', 'Foreign course');
  `);
  for (const role of ["anon", "authenticated", "queue_v2_ungranted", "service_role"]) {
    assert.equal(await owner.query(`select has_function_privilege(
      '${role}', 'public.repo_grade_automatic_claim(uuid)', 'EXECUTE');`), role === "service_role" ? "t" : "f");
    assert.equal(await owner.query(`select has_table_privilege(
      '${role}', 'public.repo_grade_automatic_targets', 'SELECT');`), role === "service_role" ? "t" : "f");
  }

  await worker.query("set role service_role;");
  await contender.query("set role service_role;");
  try {
    assert.equal(await worker.query(control("enqueue")), "f");
    await owner.query(`insert into public.repo_grade_automatic_settings (user_id, enabled) values ('${account}', true);`);
    const enqueues = await Promise.all([worker.query(control("enqueue")), contender.query(control("enqueue"))]);
    assert.deepEqual(enqueues.sort(), ["f", "t"]);
    const saved = JSON.parse(await worker.query(status()));
    const { id: run } = saved.run;
    assert.deepEqual(saved.run.courses.map(({ courseId }) => courseId), [course]);
    assert.deepEqual(JSON.parse(await worker.query(status(other))), { enabled: false, run: null, preparations: [], recoveries: [] });

    await worker.query("begin;");
    const discovery = JSON.parse(await worker.query(claim(first)));
    assert.equal(discovery.courseId, course);
    assert.equal(discovery.phase, "discovering");
    assert.equal(await contender.query(claim(second)), "", "Another transaction cannot claim locked work.");
    await worker.query("commit;");
    await owner.query(`update public.repo_grade_automatic_runs set lease_until = clock_timestamp() where id = '${run}';`);
    assert.equal(JSON.parse(await contender.query(claim(second))).phase, "discovering");
    assert.equal(await worker.query(finish(run, first, "scanned", ", '[]'")), "f", "The old lease cannot stage targets.");

    const targets = ["A", "B", "C"].map((folder) => ({ repo: "Example/Student", folder, ref: "main", sha: "a".repeat(40) }));
    assert.equal(await contender.query(finish(run, second, "scanned", `, '${JSON.stringify(targets)}'`)), "t");
    assert.equal(JSON.parse(await worker.query(claim(third))).folder, "A");
    await owner.query(`update public.repo_grade_automatic_runs set lease_until = clock_timestamp() where id = '${run}';`);
    assert.equal(JSON.parse(await contender.query(claim(fourth))).folder, "B", "An expired grade must not be replayed.");
    assert.equal(await worker.query(finish(run, third, "succeeded")), "f", "The old lease cannot settle B.");
    assert.equal(await worker.query(control("stop", `, null, '${run}'`, other)), "f");
    assert.equal(await worker.query(control("stop", `, null, '${run}'`)), "t");
    assert.equal(await worker.query(claim(first)), "", "Stopping does not release the in-flight target lease.");
    const key = "a".repeat(64);
    const generation = "b".repeat(64);
    const recovery = Buffer.from('{"grade":"retained for recovery"}').toString("base64");
    assert.equal(await contender.query(finish(run, fourth, "partial", `, null, '${key}', '${generation}', '${recovery}'`)), "t");
    assert.equal(await worker.query(claim(first)), "", "A stopped run cannot start its remaining target.");

    const finalStatus = JSON.parse(await worker.query(status()));
    const finalRun = finalStatus.run;
    const { id: recoveryId } = finalStatus.recoveries[0];
    const recover = (id) => `select public.repo_grade_automatic_recovery('${id}', ${recoveryId});`;
    const retry = (id, args = "") => `select public.repo_grade_automatic_retry('${id}', ${recoveryId}${args});`;
    assert.equal(await worker.query(recover(account)), recovery);
    assert.equal(await worker.query(recover(other)), "");
    assert.equal(await worker.query(retry(other)), "");
    assert.equal(JSON.parse(await worker.query(retry(account))).generation, generation);
    await worker.query(retry(account, `, true, null, null, '${key}'`));
    assert.equal(JSON.parse(await worker.query(retry(account))).generation, generation, "A stale retry cannot clear the current selector.");
    await worker.query(retry(account, `, true, null, null, '${generation}'`));
    assert.equal(await worker.query(retry(account)), "");
    await owner.query(`update public.repo_grade_automatic_targets set recovery_until = clock_timestamp() where id = ${recoveryId};`);
    assert.equal(await worker.query(recover(account)), "");
    assert.equal(await worker.query(claim(first)), "");
    assert.equal(await owner.query(`select recovery is null from public.repo_grade_automatic_targets where id = ${recoveryId};`), "t");
    assert.equal(finalRun.phase, "stopped");
    const counts = Object.fromEntries(finalRun.courses[0].counts.map(({ state, count }) => [state, count]));
    assert.deepEqual(counts, { stopped: 1, partial: 1, unknown: 1 });
    assert.equal(await worker.query(control("preference", ", false")), "t");
    assert.equal(await worker.query(control("enqueue")), "f");
    assert.equal(await worker.query(control("preference", ", true")), "t");
    const next = JSON.parse(await worker.query(status())).run;
    assert.equal(next.phase, "discovering");
    assert.equal(JSON.parse(await worker.query(claim(first))).phase, "discovering");
    const prior = { ...targets[0], state: "unknown", reason: "prior-attempt" };
    assert.equal(await worker.query(finish(next.id, first, "scanned", `, '${JSON.stringify([prior])}'`)), "t");
    assert.deepEqual(JSON.parse(await contender.query(claim(second))), { phase: "advanced" });
    const incomplete = JSON.parse(await worker.query(status())).run;
    assert.equal(incomplete.phase, "incomplete");
    assert.deepEqual(incomplete.courses[0].counts, [{ state: "unknown", count: 1, reason: "prior-attempt" }]);
  } finally {
    await worker.query("rollback; reset role;");
    await contender.query("reset role;");
  }
}
