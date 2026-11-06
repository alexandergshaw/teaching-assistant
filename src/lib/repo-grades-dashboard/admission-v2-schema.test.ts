import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// These tests inspect the checked-in text. They do not execute SQL or verify
// database privileges, isolation, transaction races, or transport behavior.
const draft = readFileSync(new URL("../../../docs/repo-grades-admission-v2-draft.sql", import.meta.url), "utf8");
const sql = draft.replace(/^\s*--.*$/gm, "").replace(/\s+/g, " ").trim();
const schema = "repo_grade_admission_private";
const apiRoles = "public, anon, authenticated, service_role";
const begin = sql.split(`create function ${schema}.begin_operation(`)[1]?.split("$$;")[0] ?? "";

const binding = readFileSync(new URL(
  "../../../supabase/migrations/20261105175836_repo_grade_attempt_profile_binding.sql", import.meta.url,
), "utf8");
const lock = "pg_advisory_xact_lock(pg_catalog.hashtextextended('repo-grade:' || p_account_id::text, 0))";

describe("repo grade admission v2 SQL review draft", () => {
  it("rolls back and denies API roles schema, table, and function access", () => {
    expect(sql).toMatch(/^begin; create schema repo_grade_admission_private; /);
    expect(sql).toMatch(/rollback;$/);
    expect(sql).not.toMatch(/\b(?:commit|grant)\b|create (?:policy|view|trigger)|security definer|create or replace/i);
    expect(sql).toContain(`revoke all on schema ${schema} from ${apiRoles};`);
    for (const object of ["tables", "functions"]) {
      expect(sql).toContain(`revoke all on all ${object} in schema ${schema} from ${apiRoles};`);
    }

    const tables = [...sql.matchAll(/create table ([\w.]+) \(/g)].map(([, name]) => name);
    expect(tables).toEqual(["accounts", "course_tombstones", "sealed_attempts", "operation_slots"].map(
      (table) => `${schema}.${table}`,
    ));
    for (const table of tables) {
      expect(sql).toContain(`alter table ${table} enable row level security;`);
    }
  });

  it("keeps the safety records independent of auth, course, and receipt cascades", () => {
    expect(sql).not.toMatch(/references (?:auth|public)\.|on delete cascade|\bdelete from\b/);
    expect(sql).toContain("default 'legacy-unverified'");
    expect(sql).toContain(`on ${schema}.sealed_attempts (account_id) where disposition in ('active', 'unknown')`);
    expect(sql).toContain(`on ${schema}.operation_slots (account_id, generation) where consumed_at is not null and closed_at is null`);
    expect(sql).toContain("primary key (account_id, generation, slot_id)");
    expect(sql).toContain("unique (account_id, generation, slot_index)");
    expect(sql).toContain("check (closed_at is null or consumed_at is not null)");
  });

  it("serializes both transactions in the existing legacy lock namespace before reading state", () => {
    expect(binding).toContain(lock.replace("p_account_id", "p_user_id"));
    const routines = [...sql.matchAll(/create function ([\w.]+)\((.*?)\$\$;/g)];
    expect(routines.map(([, name]) => name)).toEqual([`${schema}.expire_attempt`, `${schema}.begin_operation`]);
    for (const [, , routine] of routines) {
      expect(routine).toContain("language plpgsql volatile security invoker set search_path = ''");
      expect(routine).toContain("pg_catalog.current_setting('transaction_isolation') <> 'read committed'");
      expect(routine).toContain(`perform pg_catalog.${lock}; select a.* into attempt`);
    }
  });

  it("issues a permit only when the exact ordered operation wins the untouched slot update", () => {
    expect(begin).toContain("a.account_id = p_account_id and a.generation = p_generation and a.protocol = p_protocol and a.executor_id = p_executor_id");
    expect(begin).toContain("s.slot_id = p_slot_id and s.kind = p_kind and s.provider = p_provider and s.model = p_model and s.input_digest = p_input_digest");
    expect(begin).toContain("a.origin = 'v2-only' and a.deleted_at is null");
    expect(begin).toContain("t.account_id = p_account_id and t.course_id = attempt.course_id");
    expect(begin).toContain("from public.repo_grade_reservations r where r.user_id = p_account_id");
    expect(begin).toContain("s.slot_index < slot.slot_index and s.consumed_at is null");
    expect(begin).toMatch(/and s\.slot_id = slot\.slot_id and s\.consumed_at is null returning s\.permit_id into issued_permit_id; if not found then return .*'replayed'\); end if; return .*'permitted', 'permitId', issued_permit_id\);/);
    expect(begin.match(/'permitId'/g)).toHaveLength(1);
  });

  it("locks live account and owned course rows before consuming an active, unexpired slot", () => {
    const guards = begin.split(`update ${schema}.operation_slots`)[0];
    const authCheck = "perform 1 from auth.users u where u.id = p_account_id for key share;";
    const courseCheck = "perform 1 from public.course_hub c where c.id = attempt.course_id and c.user_id = p_account_id for key share;";
    const rejectMissing = "if not found then return pg_catalog.jsonb_build_object('status', 'rejected'); end if;";
    const sampleClock = "consumed_time := pg_catalog.clock_timestamp();";
    expect(guards).toContain(`${authCheck} ${rejectMissing} if attempt.course_id is not null then ${courseCheck} ${rejectMissing} end if; ${sampleClock}`);
    const expire = `${schema}.expire_attempt(p_account_id, p_generation, p_protocol, p_executor_id)`;
    expect(guards).toContain(`${sampleClock} if consumed_time >= attempt.expires_at then perform ${expire}; return pg_catalog.jsonb_build_object('status', 'expired'); end if;`);
    expect(guards).toContain("if attempt.disposition <> 'active' then return pg_catalog.jsonb_build_object('status', 'rejected'); end if;");
    expect(begin).toContain(`update ${schema}.operation_slots s set consumed_at = consumed_time`);
  });

  it("revokes only a never-consumed expired attempt and retains unknown safety state", () => {
    expect(sql).toContain("pg_catalog.clock_timestamp() < attempt.expires_at then return attempt.disposition");
    expect(sql).toContain("s.generation = a.generation and s.consumed_at is not null ) then 'unknown' else 'revoked' end");
    expect(sql).not.toMatch(/\btruncate\b|set (?:consumed_at|permit_id) = null/);
  });
});
