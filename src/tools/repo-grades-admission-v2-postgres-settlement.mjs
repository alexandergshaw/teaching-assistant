import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = "repo_grade_admission_private";
const protocol = "repo-grade-queue-v2";
const digest = "b".repeat(64);
const id = (n) => `'00000000-0000-4000-8000-${String(n).padStart(12, "0")}'`;
const course = (n) => id(n + 100);
const receipt = (n) => id(n + 300);
const claim = (n) => id(n + 500);

function binding(n, { generation = 1, version = protocol, executor = n } = {}) {
  return `${id(n)}, ${generation}, '${version}', 'worker-${executor}'`;
}

function close(n, proof = receipt(n), overrides) {
  return `${schema}.close_operation(${binding(n, overrides)}, ${proof})`;
}

function settle(n, proof = claim(n), overrides) {
  return `${schema}.settle_attempt(${binding(n, overrides)}, ${proof})`;
}

function fixture(n) {
  return `insert into auth.users values (${id(n)});
    insert into public.course_hub (id, user_id) values (${course(n)}, ${id(n)});
    insert into ${schema}.accounts (account_id, origin) values (${id(n)}, 'v2-only');
    insert into ${schema}.sealed_attempts (account_id, generation, protocol, executor_id, course_id, plan_digest, expires_at)
      values (${binding(n)}, ${course(n)}, '${digest}', clock_timestamp() + interval '1 hour');
    insert into ${schema}.operation_slots (account_id, generation, slot_id, slot_index, kind, provider, model, input_digest)
      values (${id(n)}, 1, 'grade', 0, 'grade', 'provider', 'model', '${digest}');
    insert into ${schema}.verified_settlement_claims
      (settlement_id, account_id, generation, protocol, executor_id, outcome, result_digest, evidence_digest)
      values (${claim(n)}, ${binding(n)}, 'succeeded', '${digest}', '${digest}');`;
}

async function expectStatus(session, operation, expected) {
  assert.equal(await session.query(`select ${operation};`), expected, operation);
}

async function beginGrade(session, n) {
  const outcome = JSON.parse(await session.query(`select ${schema}.begin_operation(
    ${binding(n)}, 'grade', 'grade', 'provider', 'model', '${digest}'
  );`));
  assert.match(outcome.permitId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(outcome, { status: "permitted", permitId: outcome.permitId });
  return outcome.permitId;
}

function receiptInsert(n, permit, slot = "grade") {
  return `insert into ${schema}.verified_transport_receipts
    (receipt_id, account_id, generation, protocol, executor_id, slot_id, permit_id, kind, provider, model,
      input_digest, outcome, evidence_digest)
    values (${receipt(n)}, ${binding(n)}, '${slot}', '${permit}', 'grade', 'provider', 'model',
      '${digest}', 'completed', '${digest}')`;
}

async function history(session, n) {
  const rows = await session.query(`select json_build_array(h.untouched, h.completed, h.refused, h.never_dispatched,
      c.result_digest)
    from ${schema}.settlement_history h join ${schema}.verified_settlement_claims c using (settlement_id)
    where h.account_id = ${id(n)};`);
  return rows === "" ? null : JSON.parse(rows);
}

async function checkPrivileges(owner) {
  const tables = "'verified_transport_receipts', 'verified_settlement_claims', 'settlement_history'";
  assert.equal(await owner.query(`select count(*) from pg_class where relnamespace = '${schema}'::regnamespace
    and relname in (${tables}) and relrowsecurity;`), "3");
  for (const role of ["anon", "authenticated", "service_role", "queue_v2_ungranted"]) {
    await owner.query(`begin; set local role ${role};
      do $acl$ declare command text;
      begin
        if current_user <> '${role}' or has_schema_privilege('${schema}', 'USAGE, CREATE')
          or exists (select from pg_class c where c.relnamespace = '${schema}'::regnamespace
            and c.relname in (${tables})
            and (has_table_privilege(c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
              or has_any_column_privilege(c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')))
          or exists (select from pg_proc p where p.pronamespace = '${schema}'::regnamespace
            and has_function_privilege(p.oid, 'EXECUTE'))
        then raise exception 'unexpected settlement grant for %', current_user; end if;
        foreach command in array array[
          $sql$select * from ${schema}.settlement_history$sql$,
          $sql$delete from ${schema}.verified_transport_receipts$sql$,
          $sql$select ${close(21)}$sql$,
          $sql$select ${settle(21)}$sql$
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

export async function runSettlementCases({ owner, worker, contender, witness, waitForBlock }) {
  const draft = readFileSync(new URL("../../docs/repo-grades-admission-v2-settlement-draft.sql", import.meta.url), "utf8");
  const statements = draft.replace(/^\s*--[^\r\n]*/gm, "").trim();
  assert.match(statements, /^begin;\s+do \$\$/i);
  assert.doesNotMatch(statements, /(?:^\s*\\|\bcommit\b)/im);
  assert.match(draft, /\nrollback;\s*$/i);
  const baseConstraints = `select relation.oid::regclass::text, conname, pg_get_constraintdef(rule.oid)
    from pg_constraint rule join pg_class relation on conrelid = relation.oid
    where relnamespace = '${schema}'::regnamespace order by conrelid, conname;`;
  const expectedConstraints = await owner.query(baseConstraints);
  assert.notEqual(expectedConstraints, "");
  await owner.query(draft);
  const rollbackCheck = `select to_regclass('${schema}.settlement_history') is null
    and to_regclass('${schema}.verified_transport_receipts') is null
    and to_regclass('${schema}.verified_settlement_claims') is null
    and to_regprocedure('${schema}.close_operation(uuid,bigint,text,text,uuid)') is null
    and to_regprocedure('${schema}.settle_attempt(uuid,bigint,text,text,uuid)') is null;`;
  assert.equal(await owner.query(rollbackCheck), "t");
  assert.equal(await witness.query(rollbackCheck), "t");
  assert.equal(await witness.query(baseConstraints), expectedConstraints);
  // Simulate API-role defaults in this test schema before loading the copy.
  await owner.query(`alter default privileges in schema ${schema}
    grant select, insert, update, delete on tables to anon, authenticated, service_role;
    alter default privileges in schema ${schema}
    grant execute on functions to anon, authenticated, service_role;`);
  await owner.query(draft.replace(/rollback;\s*$/i, "commit;\n"));
  await checkPrivileges(owner);
  await owner.query(`begin; ${fixture(21)} ${fixture(22)} ${fixture(23)} commit;`);

  const workerPid = Number(await worker.query("select pg_backend_pid();"));
  const contenderPid = Number(await contender.query("select pg_backend_pid();"));
  assert(Number.isSafeInteger(workerPid) && workerPid > 0);
  assert(Number.isSafeInteger(contenderPid) && contenderPid > 0);
  assert.notEqual(workerPid, contenderPid);
  async function race(operation, winner, loser, release = "commit") {
    assert.equal(await worker.query(`begin isolation level read committed; select ${operation};`), winner);
    const waiting = contender.query(`begin isolation level read committed; select ${operation}; commit;`);
    void waiting.catch(() => {});
    await waitForBlock(contenderPid, workerPid);
    await worker.query(`${release};`);
    assert.equal(await waiting, loser);
  }

  const permit21 = await beginGrade(owner, 21);
  const permit22 = await beginGrade(owner, 22);
  await expectStatus(witness, settle(21), "fenced");
  await expectStatus(witness, close(21), "rejected");
  assert.equal(await history(witness, 21), null);
  await owner.query(`do $binding$ begin
    begin
      ${receiptInsert(21, permit22)};
      raise exception 'accepted a permit from the wrong account';
    exception when foreign_key_violation then null;
    end;
    begin
      ${receiptInsert(21, permit21, "wrong-slot")};
      raise exception 'accepted a permit for the wrong slot';
    exception when foreign_key_violation then null;
    end;
    begin
      update ${schema}.operation_slots set closed_at = clock_timestamp(), terminal_proof_id = ${receipt(21)},
        terminal_outcome = 'completed' where account_id = ${id(21)};
      raise exception 'closed without a matching verified receipt';
    exception when foreign_key_violation then null;
    end;
  end $binding$;`);
  await owner.query(`${receiptInsert(21, permit21)}; ${receiptInsert(22, permit22)};`);
  for (const overrides of [{ generation: 2 }, { version: "other-protocol" }, { executor: 22 }]) {
    await expectStatus(witness, close(21, receipt(21), overrides), "rejected");
    await expectStatus(witness, settle(21, claim(21), overrides), "rejected");
  }
  await expectStatus(witness, close(21, receipt(22)), "rejected");
  await expectStatus(witness, settle(21, claim(22)), "rejected");
  await race(close(21), "applied", "replayed");
  await owner.query(`insert into public.repo_grade_reservations (generation, user_id) values (201, ${id(21)});`);
  await expectStatus(witness, settle(21), "fenced");
  await owner.query(`delete from public.repo_grade_reservations where generation = 201 and user_id = ${id(21)};`);
  await race(settle(21), "applied", "replayed");
  assert.deepEqual(await history(witness, 21), [0, 1, 0, 0, digest]);
  await owner.query(`insert into ${schema}.verified_settlement_claims
    (settlement_id, account_id, generation, protocol, executor_id, outcome, evidence_digest)
    values (${claim(24)}, ${binding(21)}, 'failed', '${digest}');`);
  await expectStatus(witness, settle(21, claim(24)), "rejected");
  assert.deepEqual(await history(witness, 21), [0, 1, 0, 0, digest]);

  await owner.query(`update ${schema}.sealed_attempts set expires_at = clock_timestamp() - interval '1 second'
    where account_id = ${id(22)};`);
  await expectStatus(witness, settle(22), "fenced");
  await expectStatus(witness, `${schema}.expire_attempt(${binding(22)})`, "unknown");
  await expectStatus(owner, close(22), "applied");
  await race(settle(22), "applied", "applied", "rollback");
  await expectStatus(witness, settle(22), "replayed");
  assert.deepEqual(await history(witness, 22), [0, 1, 0, 0, digest]);

  const permit23 = await beginGrade(owner, 23);
  await owner.query(`begin;
    select pg_advisory_xact_lock(hashtextextended('repo-grade:' || ${id(23)}::uuid::text, 0));
    insert into ${schema}.course_tombstones (account_id, course_id) values (${id(23)}, ${course(23)});
    delete from public.course_hub where id = ${course(23)};
    commit;`);
  await owner.query(`${receiptInsert(23, permit23)};`);
  await expectStatus(owner, close(23), "applied");
  await expectStatus(witness, settle(23), "rejected");
  await owner.query(`insert into public.course_hub (id, user_id) values (${course(23)}, ${id(23)});`);
  await expectStatus(witness, settle(23), "rejected");
  assert.equal(await history(witness, 23), null);
}
