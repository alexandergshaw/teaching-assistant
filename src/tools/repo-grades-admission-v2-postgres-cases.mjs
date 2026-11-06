import assert from "node:assert/strict";

const schema = "repo_grade_admission_private";
const protocol = "repo-grade-queue-v2";
const digest = "a".repeat(64);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const id = (number) => `'00000000-0000-4000-8000-${String(number).padStart(12, "0")}'`;
const course = (number) => id(100 + number);
const binding = (number, executor = number) => `${id(number)}, 1, '${protocol}', 'worker-${executor}'`;
const begin = (number, executor, slot = "rubric") =>
  `${schema}.begin_operation(${binding(number, executor)}, '${slot}', '${slot}', 'provider', 'model', '${digest}')`;
const expire = (number) => `${schema}.expire_attempt(${binding(number)})`;

async function expectStatus(session, routine, expected) {
  assert.deepEqual(JSON.parse(await session.query(`select ${routine};`)), { status: expected });
}

function permitFrom(result) {
  const permit = JSON.parse(result);
  assert.match(permit.permitId, uuidPattern);
  assert.deepEqual(permit, { status: "permitted", permitId: permit.permitId });
  return permit.permitId;
}

async function assertPersistedPermit(session, number, permit) {
  assert.equal(await session.query(`select permit_id from ${schema}.operation_slots
    where account_id = ${id(number)} and slot_id = 'rubric';`), permit);
}

async function assertUnconsumed(session, number) {
  assert.equal(await session.query(`select bool_and(permit_id is null and consumed_at is null)
    from ${schema}.operation_slots where account_id = ${id(number)};`), "t");
}

async function checkPrivileges(owner) {
  assert.equal(await owner.query(`select count(*) from pg_class
    where relnamespace = '${schema}'::regnamespace and relkind = 'r' and relrowsecurity;`), "4");

  // The ungranted role detects privileges inherited from PUBLIC. service_role
  // bypasses RLS and has a v1 table grant as a positive ACL control.
  for (const role of ["anon", "authenticated", "service_role", "queue_v2_ungranted"]) {
    await owner.query(`begin;
      set local role ${role};
      do $acl$ declare command text;
      begin
        if current_user <> '${role}' or has_schema_privilege('${schema}', 'USAGE, CREATE')
          or exists (select from pg_class c
            where c.relnamespace = '${schema}'::regnamespace and c.relkind = 'r'
              and (has_table_privilege(c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
                or has_any_column_privilege(c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')))
          or exists (select from pg_proc p
            where p.pronamespace = '${schema}'::regnamespace and has_function_privilege(p.oid, 'EXECUTE'))
        then raise exception 'unexpected effective grant for %', current_user; end if;
        if current_user = 'service_role' and not (
          has_table_privilege('public.repo_grade_reservations', 'SELECT')
          and (select rolbypassrls from pg_roles where rolname = current_user)
        ) then raise exception 'service_role privilege control failed'; end if;
        foreach command in array array[
          'select * from ${schema}.accounts',
          'delete from ${schema}.operation_slots',
          $sql$select ${begin(1)}$sql$,
          $sql$select ${expire(1)}$sql$
        ] loop
          begin
            execute command;
            raise exception 'role % unexpectedly executed %', current_user, command;
          exception when insufficient_privilege then null;
          end;
        end loop;
      end $acl$;
      rollback;`);
  }
}

function installCase(number, { expires = "1 hour", origin = "v2-only", ownedCourse = number } = {}) {
  return `insert into auth.users values (${id(number)});
    insert into public.course_hub (id, user_id) values (${course(number)}, ${id(number)});
    insert into ${schema}.accounts (account_id, origin) values (${id(number)}, '${origin}');
    insert into ${schema}.sealed_attempts (account_id, generation, protocol, executor_id, course_id, plan_digest, expires_at)
      values (${id(number)}, 1, '${protocol}', 'worker-${number}', ${course(ownedCourse)}, '${digest}', clock_timestamp() + interval '${expires}');
    insert into ${schema}.operation_slots (account_id, generation, slot_id, slot_index, kind, provider, model, input_digest)
      values (${id(number)}, 1, 'rubric', 0, 'rubric', 'provider', 'model', '${digest}'),
             (${id(number)}, 1, 'grade', 1, 'grade', 'provider', 'model', '${digest}');`;
}

export async function runCases({ owner, worker, contender, witness, waitForBlock }) {
  await checkPrivileges(owner);
  await owner.query(`begin;
    ${installCase(1)}
    ${installCase(2)}
    ${installCase(3)}
    ${installCase(4, { expires: "-1 second" })}
    ${installCase(5)}
    ${installCase(6)}
    ${installCase(7)}
    ${installCase(8, { ownedCourse: 1 })}
    ${installCase(9, { origin: "legacy-unverified" })}
    ${installCase(10)}
    ${installCase(11)}
    commit;`);

  const workerPid = Number(await worker.query("select pg_backend_pid();"));
  const contenderPid = Number(await contender.query("select pg_backend_pid();"));
  assert(Number.isSafeInteger(workerPid) && workerPid > 0);
  assert(Number.isSafeInteger(contenderPid) && contenderPid > 0);
  assert.notEqual(workerPid, contenderPid);
  async function whileContenderWaits(operation, release) {
    const waiting = contender.query(`begin isolation level read committed; select ${operation}; commit;`);
    // The contender may fail before the lock observer returns. Always observe its
    // rejection, even if the observer fails first and the connections are closed.
    void waiting.catch(() => {});
    await waitForBlock(contenderPid, workerPid);
    await release();
    return waiting;
  }

  await expectStatus(witness, begin(1, 1, "grade"), "rejected");
  const first = permitFrom(await worker.query(`begin isolation level read committed; select ${begin(1)};`));
  const duplicate = await whileContenderWaits(begin(1), async () => {
    // Account 2 can use its identical generation/slot IDs while account 1 is locked.
    await expectStatus(witness, begin(2, 1), "rejected");
    const independent = permitFrom(await witness.query(`select ${begin(2)};`));
    assert.notEqual(first, independent);
    await assertPersistedPermit(witness, 2, independent);
    await assertUnconsumed(witness, 1);
    await worker.query("commit;");
  });
  assert.deepEqual(JSON.parse(duplicate), { status: "replayed" });
  await assertPersistedPermit(witness, 1, first);
  await expectStatus(witness, begin(1, 1, "grade"), "fenced");

  const rolledBack = permitFrom(await worker.query(`begin isolation level read committed; select ${begin(3)};`));
  const retry = permitFrom(await whileContenderWaits(begin(3), () => worker.query("rollback;")));
  assert.notEqual(rolledBack, retry);
  await assertPersistedPermit(witness, 3, retry);
  await expectStatus(witness, begin(3), "replayed");

  assert.equal(await worker.query(`begin isolation level read committed; select ${expire(4)};`), "revoked");
  assert.deepEqual(JSON.parse(await whileContenderWaits(begin(4), () => worker.query("commit;"))), { status: "expired" });
  assert.equal(await witness.query(`select ${expire(4)};`), "revoked");
  await assertUnconsumed(witness, 4);

  const consumed = permitFrom(await worker.query(`begin isolation level read committed; select ${begin(5)};`));
  // Move the synthetic deadline across the sampled clock while the winner still
  // holds the account lock. This tests the order without racing a wall-clock sleep.
  await worker.query(`update ${schema}.sealed_attempts set expires_at = clock_timestamp() - interval '1 second'
    where account_id = ${id(5)};`);
  assert.equal(await whileContenderWaits(expire(5), () => worker.query("commit;")), "unknown");
  await assertPersistedPermit(witness, 5, consumed);
  await expectStatus(witness, begin(5), "replayed");
  await expectStatus(witness, begin(5, 5, "grade"), "expired");
  assert.equal(await witness.query(`select ${expire(5)};`), "unknown");

  // The draft has no deletion writer. Install synthetic tombstones, delete the
  // corresponding live rows, then restore the live IDs to isolate tombstone guards.
  await owner.query(`begin;
    insert into ${schema}.course_tombstones (account_id, course_id) values (${id(6)}, ${course(6)});
    update ${schema}.accounts set deleted_at = clock_timestamp() where account_id = ${id(7)};
    delete from public.course_hub where id = ${course(6)};
    delete from auth.users where id = ${id(7)};
    insert into auth.users values (${id(7)});
    insert into public.course_hub (id, user_id) values (${course(6)}, ${id(6)}), (${course(7)}, ${id(7)});
    insert into public.repo_grade_reservations (generation, user_id) values (200, ${id(10)});
    delete from auth.users where id = ${id(11)};
    commit;`);
  for (const number of [6, 7, 8, 9, 11]) {
    await expectStatus(witness, begin(number), "rejected");
    await assertUnconsumed(witness, number);
  }
  for (const number of [6, 7]) {
    assert.equal(await witness.query(`select ${expire(number)};`), "active");
  }
  await expectStatus(witness, begin(10), "fenced");
  await assertUnconsumed(witness, 10);
  assert.deepEqual(JSON.parse(await witness.query(`begin isolation level repeatable read;
    select ${begin(10)}; rollback;`)), { status: "rejected" });
}
