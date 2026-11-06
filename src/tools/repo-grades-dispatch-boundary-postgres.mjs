import assert from "node:assert/strict";

const account = "'00000000-0000-4000-8000-000000000041'";
const otherAccount = "'00000000-0000-4000-8000-000000000042'";
const wrongToken = "00000000-0000-4000-8000-000000000099";
const tracked = "public.repo_grade_claim_tracked";
const legacy = "public.repo_grade_claim";
const begin = "public.repo_grade_begin_dispatch";
const claimSignature = "(uuid,uuid,text,text,text,text,text,jsonb,uuid,jsonb)";
const beginSignature = "(uuid,bigint,uuid)";

function claimSql(repo, rpc = tracked) {
  return `select ${rpc}(${account}, null, 'Example/${repo}', null, 'manual',
    null, null, null, null, null);`;
}

function beginSql(attempt, { user = account, token = attempt.token } = {}) {
  return `${begin}(${user}, ${attempt.generation}, '${token}')`;
}

async function claim(session, repo, rpc) {
  return JSON.parse(await session.query(claimSql(repo, rpc)));
}

async function assertPermit(session, attempt) {
  const lease = Number(await session.query(`select ${beginSql(attempt)};`));
  assert(Number.isSafeInteger(lease) && lease > 0 && lease <= 15 * 60_000);
}

async function assertDenied(session, attempt, options) {
  assert.equal(await session.query(`select ${beginSql(attempt, options)} is null;`), "t");
}

async function expire(owner, attempt) {
  await owner.query(`update public.repo_grade_attempts set claimed_at = clock_timestamp() - interval '16 minutes'
    where user_id = ${account} and generation = ${attempt.generation};`);
}

async function state(session, attempt) {
  return session.query(`select a.status || ':' || coalesce(a.dispatch_state, 'legacy') || ':' ||
    case when r.generation is null then 'released' else 'reserved' end
    from public.repo_grade_attempts a left join public.repo_grade_reservations r using (user_id, generation)
    where a.user_id = ${account} and a.generation = ${attempt.generation};`);
}

export async function runDispatchBoundaryCases({ owner, worker, contender, witness, waitForBlock }) {
  for (const role of ["anon", "authenticated", "queue_v2_ungranted", "service_role"]) {
    for (const signature of [tracked + claimSignature, begin + beginSignature]) {
      assert.equal(await owner.query(`select has_function_privilege('${role}', '${signature}', 'EXECUTE');`),
        role === "service_role" ? "t" : "f");
    }
    assert.equal(await owner.query(`select has_column_privilege('${role}', 'public.repo_grade_attempts',
      'dispatch_state', 'UPDATE');`), role === "service_role" ? "t" : "f");
  }
  await owner.query(`insert into auth.users values (${account}), (${otherAccount});`);
  await worker.query("set role service_role;");
  await contender.query("set role service_role;");
  const workerPid = Number(await worker.query("select pg_backend_pid();"));
  const contenderPid = Number(await contender.query("select pg_backend_pid();"));

  try {
    await worker.query("begin isolation level read committed;");
    const rolledBack = await claim(worker, "Rollback");
    assert.equal(rolledBack.status, "claimed");
    assert.equal(await state(worker, rolledBack), "claimed:prepared:reserved");
    assert.equal(await state(witness, rolledBack), "");
    await worker.query("rollback;");
    await assertDenied(contender, rolledBack);

    const started = await claim(worker, "Rollback");
    assert.equal(started.status, "claimed");
    assert.notEqual(started.generation, rolledBack.generation);
    await assertDenied(worker, started, { user: otherAccount });
    await assertDenied(worker, started, { token: wrongToken });
    await worker.query("begin isolation level read committed;");
    await assertPermit(worker, started);
    const waitingToBegin = contender.query(`select ${beginSql(started)};`);
    void waitingToBegin.catch(() => {});
    await waitForBlock(contenderPid, workerPid);
    await worker.query("rollback;");
    assert(Number(await waitingToBegin) > 0, "A rollback must allow another session to mark dispatch.");
    await assertDenied(worker, started);
    assert.equal(await state(witness, started), "claimed:started:reserved");
    await expire(owner, started);
    assert.deepEqual(await claim(worker, "Rollback"), { status: "busy" });
    assert.equal(await state(witness, started), "unknown:started:reserved");

    const old = await claim(worker, "Legacy", legacy);
    assert.equal(old.status, "claimed");
    await assertDenied(worker, old);
    await expire(owner, old);
    assert.deepEqual(await claim(worker, "Legacy"), { status: "busy" });
    assert.equal(await state(witness, old), "unknown:legacy:reserved");

    const prepared = await claim(worker, "Prepared");
    assert.equal(prepared.status, "claimed");
    await expire(owner, prepared);
    await assertDenied(worker, prepared);
    await worker.query("begin isolation level read committed;");
    const replacement = await claim(worker, "Prepared");
    assert.equal(replacement.status, "claimed");
    assert.equal(await state(worker, prepared), "failed:prepared:released");
    assert.equal(await state(witness, prepared), "claimed:prepared:reserved");
    const staleBegin = contender.query(`select ${beginSql(prepared)} is null;`);
    void staleBegin.catch(() => {});
    await waitForBlock(contenderPid, workerPid);
    await worker.query("commit;");
    assert.equal(await staleBegin, "t");
    assert.equal(await state(witness, prepared), "failed:prepared:released");
    assert.equal(await state(witness, replacement), "claimed:prepared:reserved");

    assert.equal(await worker.query(`select public.repo_grade_settle(${account}, ${replacement.generation},
      '${replacement.token}', 'failed', false, null, null, null);`), "t");
    await assertDenied(contender, replacement);
    assert.equal(await state(witness, replacement), "failed:prepared:released");
  } finally {
    await worker.query("rollback; reset role;");
    await contender.query("rollback; reset role;");
  }
}
