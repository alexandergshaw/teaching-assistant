import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source checks only. No SQL is parsed or executed by these tests.
const draft = readFileSync(new URL(
  "../../../docs/repo-grades-admission-v2-settlement-draft.sql", import.meta.url,
), "utf8");
const sql = draft.replace(/^\s*--.*$/gm, "").replace(/\s+/g, " ").trim();
const schema = "repo_grade_admission_private";
const apiRoles = "public, anon, authenticated, service_role";
const tables = ["verified_transport_receipts", "verified_settlement_claims", "settlement_history"];
const routines = ["guard_settlement_insert", "close_operation", "settle_attempt"];
const accountLock = (account: string) =>
  `perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || ${account}::text, 0));`;

function body(name: string): string {
  const match = sql.match(new RegExp(`create function ${schema}\\.${name}\\((.*?)\\$\\$;`));
  if (!match) throw new Error(`Missing draft routine ${name}`);
  return match[1];
}

describe("repo grade admission v2 settlement SQL review draft", () => {
  it("rolls back and keeps the extension private and isolated from legacy writers", () => {
    expect(sql).toMatch(/^begin; .* rollback;$/);
    expect(sql).not.toMatch(/\b(?:grant|commit)\b|security definer|create or replace|drop (?:function|index|table)/i);
    expect(sql).not.toMatch(/(?:insert into|update|delete from|alter table) (?:public|auth)\./);
    expect([...sql.matchAll(/create table ([\w.]+) /g)].map(([, name]) => name))
      .toEqual(tables.map((name) => `${schema}.${name}`));
    expect([...sql.matchAll(/create function ([\w.]+)\(/g)].map(([, name]) => name))
      .toEqual(routines.map((name) => `${schema}.${name}`));
    for (const table of tables) {
      expect(sql).toContain(`alter table ${schema}.${table} enable row level security;`);
    }
    expect(sql).toContain(`revoke all on table ${tables.map((name) => `${schema}.${name}`).join(", ")} from ${apiRoles};`);
    expect(sql).toContain(`revoke all on function ${schema}.guard_settlement_insert(), ${schema}.close_operation(uuid, bigint, text, text, uuid), ${schema}.settle_attempt(uuid, bigint, text, text, uuid) from ${apiRoles};`);
  });

  it("serializes owner-only writes and protects the evidence from rewriting", () => {
    for (const name of routines) {
      const routine = body(name);
      expect(routine).toContain("volatile security invoker set search_path = ''");
      expect(routine).toContain("pg_catalog.current_setting('transaction_isolation') <> 'read committed'");
      expect(routine).toContain("and pg_catalog.pg_get_userbyid(n.nspowner) = current_user");
    }
    expect(body("guard_settlement_insert")).toContain("if tg_op <> 'INSERT'");
    expect(body("guard_settlement_insert")).toContain(`${accountLock("new.account_id")} return new;`);
    for (const table of tables) {
      expect(sql).toContain(`before insert or update or delete on ${schema}.${table} for each row execute function ${schema}.guard_settlement_insert();`);
      expect(sql).toContain(`before truncate on ${schema}.${table} for each statement execute function ${schema}.guard_settlement_insert();`);
    }
  });

  it("closes only the consumed permit whose exact terminal receipt is already verified", () => {
    expect(sql).toContain(`foreign key (account_id, generation, slot_id, permit_id, kind, provider, model, input_digest) references ${schema}.operation_slots (account_id, generation, slot_id, permit_id, kind, provider, model, input_digest)`);
    expect(sql).toContain(`foreign key (terminal_proof_id, account_id, generation, slot_id, permit_id, terminal_outcome) references ${schema}.verified_transport_receipts (receipt_id, account_id, generation, slot_id, permit_id, outcome)`);
    const close = body("close_operation");
    expect(close).toMatch(/^ p_account_id uuid, p_generation bigint, p_protocol text, p_executor_id text, p_receipt_id uuid \) returns text /);
    expect(close).toContain(`${accountLock("p_account_id")} select r.* into receipt`);
    expect(close).toContain("r.receipt_id = p_receipt_id and r.account_id = p_account_id and r.generation = p_generation and r.protocol = p_protocol and r.executor_id = p_executor_id");
    expect(close).toContain("slot.terminal_proof_id = receipt.receipt_id and slot.terminal_outcome = receipt.outcome then 'replayed' else 'rejected'");
    expect(close).toContain("terminal_proof_id = receipt.receipt_id, terminal_outcome = receipt.outcome");
    expect(close).not.toMatch(/insert into|set disposition/);
  });

  it("checks replay, live scope, and the unresolved fence before publishing history and releasing the attempt", () => {
    const settle = body("settle_attempt");
    expect(settle).toMatch(/^ p_account_id uuid, p_generation bigint, p_protocol text, p_executor_id text, p_settlement_id uuid \) returns text /);
    expect(settle).toContain(`${accountLock("p_account_id")} select a.* into attempt`);
    expect(settle).toContain("a.account_id = p_account_id and a.generation = p_generation and a.protocol = p_protocol and a.executor_id = p_executor_id");
    expect(settle).toContain(`select c.* into claim from ${schema}.verified_settlement_claims c where c.settlement_id = p_settlement_id and c.account_id = attempt.account_id and c.generation = attempt.generation and c.protocol = attempt.protocol and c.executor_id = attempt.executor_id`);
    const [guards, writes] = settle.split(`insert into ${schema}.settlement_history`);
    expect(guards).toContain("prior_settlement_id = claim.settlement_id then 'replayed' else 'rejected'");
    expect(guards).toContain("a.origin = 'v2-only' and a.deleted_at is null");
    expect(guards).toContain("t.account_id = p_account_id and t.course_id = attempt.course_id");
    expect(guards).toContain("from public.repo_grade_reservations r where r.user_id = p_account_id");
    expect(guards).toContain("from auth.users u where u.id = p_account_id for key share; if not found then return 'rejected';");
    expect(guards).toContain("from public.course_hub c where c.id = attempt.course_id and c.user_id = p_account_id for share; if not found then return 'rejected';");
    expect(guards).toContain(`attempt.disposition := ${schema}.expire_attempt(`);
    expect(guards).toContain("s.consumed_at is not null and s.closed_at is null ) then return 'fenced';");
    expect(guards).not.toContain("set disposition = 'settled'");
    expect(writes).toContain("claim.settlement_id, count(*) filter (where s.consumed_at is null)");
    for (const outcome of ["completed", "refused", "never-dispatched"]) {
      expect(writes).toContain(`count(*) filter (where s.terminal_outcome = '${outcome}')`);
    }
    expect(writes).toContain(`update ${schema}.sealed_attempts a set disposition = 'settled' where a.account_id = attempt.account_id and a.generation = attempt.generation and a.disposition in ('active', 'unknown'); if not found then raise exception`);
  });
});
