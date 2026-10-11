// SQL-TEXT pins over the send-ledger migration (docs/live-lms-student-messaging-ledger.md
// section 11: DL-2, DL-3, DL-4, DL-5, DL-14a). These read the migration SOURCE;
// they prove the text asks for the right thing, not that Postgres does it (no
// Postgres exists in this environment; the Action run and the owner walk do
// that). They pin facts, not spelling.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION = path.join(process.cwd(), "supabase", "migrations", "20261029000000_create_live_message_sends.sql");

function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

const RAW = fs.readFileSync(MIGRATION, "utf8");
const SQL = stripSqlComments(RAW);

const PUBLIC_FUNCTIONS = [
  "live_message_reconcile",
  "live_message_dup_lookup",
  "live_message_start_batch",
  "live_message_claim",
  "live_message_settle",
  "live_message_requeue_refused",
  "live_message_prune",
];
const ALL_FUNCTIONS = ["live_message_uid", "live_message_dup_rows", ...PUBLIC_FUNCTIONS];

interface FnBlock {
  name: string;
  header: string;
  params: string[];
  body: string;
}

/** Splits the migration into its `create or replace function` blocks. */
function functionBlocks(sql: string): FnBlock[] {
  const blocks: FnBlock[] = [];
  const re = /create or replace function public\.(\w+)\(([\s\S]*?)\)\s*\n?\s*returns[\s\S]*?as \$fn\$([\s\S]*?)\$fn\$;/g;
  for (const m of sql.matchAll(re)) {
    const header = m[0].slice(0, m[0].indexOf("$fn$"));
    blocks.push({
      name: m[1],
      header,
      params: [...m[2].matchAll(/\b(p_[a-z_]+)\s+/g)].map((p) => p[1]),
      body: m[3],
    });
  }
  return blocks;
}

const FNS = functionBlocks(SQL);
const fn = (name: string): FnBlock => {
  const found = FNS.find((f) => f.name === name);
  if (!found) throw new Error(`function ${name} not found in the migration`);
  return found;
};

/** The columns of a create-table body: lines indented exactly two spaces that
 * are not table-level `constraint` lines. The multi-line CHECK's `or`/`and`
 * continuation lines are indented deeper, and are skipped by the same rule. */
function extractColumns(sql: string, table: string): string[] {
  const start = sql.indexOf(`create table if not exists ${table} (`);
  if (start < 0) throw new Error("table not found");
  const end = sql.indexOf("\n);", start);
  const body = sql.slice(start, end).split("\n").slice(1);
  const names: string[] = [];
  for (const line of body) {
    const m = /^ {2}([a-z_][a-z0-9_]*)\b/.exec(line);
    if (!m) continue;
    if (m[1] === "constraint" || m[1] === "or" || m[1] === "and") continue;
    names.push(m[1]);
  }
  return names;
}

describe("DL-2 extractor canary: it discriminates columns from constraint and continuation lines", () => {
  const FIXTURE = [
    "create table if not exists public.t (",
    "  id uuid primary key,",
    "  status text not null,",
    "  constraint t_shape check (",
    "    (status = 'a' and x is null)",
    "    or (status = 'b' and x is not null",
    "        and code in ('p', 'q'))",
    "    and y",
    "  ),",
    "  constraint t_other check (id is not null)",
    ");",
  ].join("\n");

  it("returns exactly the two columns", () => {
    expect(extractColumns(FIXTURE, "public.t")).toEqual(["id", "status"]);
  });

  it("would see a stray `or` or `and` continuation if the filter were dropped", () => {
    const naive = FIXTURE.split("\n").filter((l) => /^ {2}[a-z_]/.test(l));
    expect(naive.some((l) => l.startsWith("  constraint"))).toBe(true);
  });
});

describe("DL-2 the table's columns", () => {
  it("equal the literal 15 and carry no PII-shaped name", () => {
    const columns = extractColumns(SQL, "public.live_message_sends");
    expect(columns).toEqual([
      "id",
      "user_id",
      "batch_id",
      "institution",
      "course_id",
      "recipient_id",
      "body_digest",
      "status",
      "code",
      "http_status",
      "attempt",
      "allow_resend",
      "created_at",
      "claimed_at",
      "settled_at",
    ]);
    for (const column of columns) {
      expect(column).not.toMatch(/^(name|email|subject|body|message|score|grade|first|last)$/);
    }
  });

  it("carries the state_shape CHECK whose sending arm forbids settled_at (F-L1)", () => {
    expect(SQL).toMatch(/live_message_sends_state_shape check \(/);
    expect(SQL).toMatch(/status = 'sending' and claimed_at is not null and settled_at is null and code is null and http_status is null/);
    expect(SQL).toMatch(/status = 'pending' and claimed_at is null and settled_at is null and code is null and http_status is null/);
  });
});

describe("DL-3 RLS and privileges", () => {
  it("enables RLS and has exactly one policy, a select", () => {
    expect(SQL).toMatch(/alter table public\.live_message_sends enable row level security;/);
    const policies = [...SQL.matchAll(/create policy "[^"]+"\s+on public\.live_message_sends for (\w+)/g)].map((m) => m[1]);
    expect(policies).toEqual(["select"]);
    expect(SQL).not.toMatch(/for (insert|update|delete|all)\b/);
    expect(SQL).toMatch(/using \(auth\.uid\(\) = user_id\)/);
  });

  it("revokes writes from the API roles", () => {
    expect(SQL).toMatch(/revoke insert, update, delete, truncate on public\.live_message_sends from anon, authenticated;/);
  });
});

describe("DL-4 the function set, attributes and grants", () => {
  it("defines exactly the nine functions", () => {
    expect(FNS.map((f) => f.name).sort()).toEqual([...ALL_FUNCTIONS].sort());
  });

  it("every public function is security definer, volatile, pinned search_path, and resolves the owner first", () => {
    for (const name of PUBLIC_FUNCTIONS) {
      const f = fn(name);
      expect(f.header, name).toMatch(/\bsecurity definer\b/);
      expect(f.header, name).toMatch(/\bvolatile\b/);
      expect(f.header, name).toMatch(/set search_path = ''/);
      const declare = f.body.slice(0, f.body.indexOf("begin"));
      expect(declare, name).toMatch(/:= public\.live_message_uid\(\)/);
    }
  });

  it("live_message_uid is SECURITY INVOKER and raises when auth.uid() is null", () => {
    const f = fn("live_message_uid");
    expect(f.header).not.toMatch(/security definer/);
    expect(f.body).toMatch(/auth\.uid\(\)/);
    expect(f.body).toMatch(/raise exception/);
  });

  it("no function is stable or immutable (volatility is load-bearing for the guard snapshot)", () => {
    for (const f of FNS) {
      expect(f.header, f.name).not.toMatch(/\b(stable|immutable)\b/);
      expect(f.header, f.name).toMatch(/\bvolatile\b/);
    }
  });

  it("no public function takes an owner parameter (the owner is never an argument)", () => {
    for (const name of PUBLIC_FUNCTIONS) {
      for (const p of fn(name).params) expect(p, name).not.toMatch(/^p_(user_id|uid|owner)/);
    }
  });

  it("grants execute to authenticated for exactly the seven public functions, and revokes every function from all four roles", () => {
    const granted = [...SQL.matchAll(/grant execute on function public\.(\w+)\([^)]*\)\s+to authenticated;/g)].map((m) => m[1]).sort();
    expect(granted).toEqual([...PUBLIC_FUNCTIONS].sort());
    const revoked = [...SQL.matchAll(/revoke all on function public\.(\w+)\([^)]*\)\s+from ([a-z_, ]+);/g)];
    expect(revoked.map((m) => m[1]).sort()).toEqual([...ALL_FUNCTIONS].sort());
    for (const m of revoked) expect(m[2].replace(/\s+/g, " ").trim(), m[1]).toBe("public, anon, authenticated, service_role");
  });
});

describe("DL-5 predicate facts per query", () => {
  it("RECONCILE: sending, strict < on claimed_at, the DB clock", () => {
    const f = fn("live_message_reconcile").body;
    expect(f).toMatch(/s\.status = 'sending'/);
    expect(f).toMatch(/s\.claimed_at < now\(\) - p_stale_ms \* interval '1 millisecond'/);
    expect(f).toMatch(/set status = 'unknown', code = 'unknown-stale-claim', settled_at = now\(\)/);
  });

  it("DUP: the status list is exactly {accepted, unknown, sending}, anchored on the coalesce, strict >", () => {
    const f = fn("live_message_dup_rows").body;
    const list = /s\.status in \(([^)]*)\)/.exec(f);
    expect(list).not.toBeNull();
    const statuses = (list as RegExpExecArray)[1].split(",").map((s) => s.trim().replace(/'/g, "")).sort();
    expect(statuses).toEqual(["accepted", "sending", "unknown"]);
    expect(f).toMatch(/coalesce\(s\.settled_at, s\.claimed_at, s\.created_at\) > now\(\) - p_window_ms \* interval '1 millisecond'/);
  });

  it("the public lookup and Start reconcile BEFORE the duplicate predicate runs (F-L6)", () => {
    for (const name of ["live_message_dup_lookup", "live_message_start_batch"]) {
      const body = fn(name).body;
      const reconcile = body.indexOf("live_message_reconcile(p_stale_ms)");
      const dup = body.indexOf("live_message_dup_rows(");
      expect(reconcile, name).toBeGreaterThan(-1);
      expect(dup, name).toBeGreaterThan(reconcile);
    }
  });

  it("CLAIM: pending, digest match, advisory lock, isolation assertion, settled_at reset", () => {
    const body = fn("live_message_claim").body;
    expect(body).toMatch(/s\.status = 'pending' and s\.body_digest = p_digest/);
    expect(body).toMatch(/pg_advisory_xact_lock/);
    expect(body).toMatch(/current_setting\('transaction_isolation'\) <> 'read committed'/);
    expect(body).toMatch(/settled_at = null, code = null, http_status = null/);
  });

  it("SETTLE is conditional on status = 'sending'", () => {
    expect(fn("live_message_settle").body).toMatch(/s\.status = 'sending'/);
  });

  it("REQUEUE nulls claimed_at and settled_at and acts only on refused", () => {
    const body = fn("live_message_requeue_refused").body;
    expect(body).toMatch(/claimed_at = null, settled_at = null, code = null, http_status = null/);
    expect(body).toMatch(/s\.status = 'refused'/);
  });
});

describe("DL-14a CLAIM is self-sufficient: it reconciles its own key inside the lock", () => {
  const claim = fn("live_message_claim");

  it("takes p_stale_ms", () => {
    expect(claim.params).toEqual(["p_id", "p_digest", "p_window_ms", "p_stale_ms"]);
  });

  it("orders the lock, then the key-scoped reconcile UPDATE, then the duplicate guard", () => {
    const lock = claim.body.indexOf("pg_advisory_xact_lock");
    const reconcile = claim.body.search(/update public\.live_message_sends s\s+set status = 'unknown', code = 'unknown-stale-claim'/);
    const guard = claim.body.indexOf("live_message_dup_rows(");
    expect(lock).toBeGreaterThan(-1);
    expect(reconcile).toBeGreaterThan(lock);
    expect(guard).toBeGreaterThan(reconcile);
  });

  it("the reconcile is scoped to the five lock-key columns, sending, and a strict < on claimed_at", () => {
    const m = /update public\.live_message_sends s\s+set status = 'unknown'[\s\S]*?;/.exec(claim.body);
    expect(m).not.toBeNull();
    const stmt = (m as RegExpExecArray)[0];
    for (const column of ["user_id", "institution", "course_id", "recipient_id", "body_digest"]) {
      expect(stmt, column).toMatch(new RegExp(`s\\.${column} =`));
    }
    expect(stmt).toMatch(/s\.status = 'sending'/);
    expect(stmt).toMatch(/s\.claimed_at < now\(\) - p_stale_ms \* interval '1 millisecond'/);
  });
});
