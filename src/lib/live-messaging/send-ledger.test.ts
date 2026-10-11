import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import {
  DUP_WINDOW_MS,
  LEDGER_RETENTION_DAYS,
  SENDING_STALE_MS,
} from "./send-constants";
import {
  claimRow,
  effectiveStatus,
  ledgerKey,
  ledgerOutcomeFor,
  lookupDuplicates,
  mapLedgerRow,
  pruneOld,
  readBatchRows,
  readRowByKey,
  reconcileStale,
  requeueRefused,
  settleRow,
  startBatch,
  type LedgerRow,
} from "./send-ledger";

const ROOT = process.cwd();
const LEDGER_SOURCE = path.join(ROOT, "src", "lib", "live-messaging", "send-ledger.ts");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20261029000000_create_live_message_sends.sql");

const FULL_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "22222222-2222-2222-2222-222222222222",
  batch_id: "33333333-3333-3333-3333-333333333333",
  institution: "MCC",
  course_id: "100",
  recipient_id: "200",
  body_digest: "a".repeat(64),
  status: "accepted",
  code: "ok",
  http_status: 201,
  attempt: 1,
  allow_resend: false,
  created_at: "2026-10-11T10:00:00Z",
  claimed_at: "2026-10-11T10:00:01Z",
  settled_at: "2026-10-11T10:00:02Z",
};

describe("DL-7 mapLedgerRow over literal rows", () => {
  it("maps a full row field by field, to exactly the 14 keys, without user_id", () => {
    const row = mapLedgerRow(FULL_ROW);
    expect(row).toEqual({
      id: FULL_ROW.id,
      batchId: FULL_ROW.batch_id,
      institution: "MCC",
      courseId: "100",
      recipientId: "200",
      bodyDigest: "a".repeat(64),
      status: "accepted",
      code: "ok",
      httpStatus: 201,
      attempt: 1,
      allowResend: false,
      createdAt: "2026-10-11T10:00:00Z",
      claimedAt: "2026-10-11T10:00:01Z",
      settledAt: "2026-10-11T10:00:02Z",
    });
    expect(Object.keys(row)).toHaveLength(14);
    expect(Object.keys(row)).not.toContain("userId");
  });

  it("keeps nulls null (tri-state), never collapsing them", () => {
    const row = mapLedgerRow({ ...FULL_ROW, status: "pending", code: null, http_status: null, claimed_at: null, settled_at: null });
    expect([row.code, row.httpStatus, row.claimedAt, row.settledAt]).toEqual([null, null, null, null]);
  });

  it("maps an unrecognised status to unknown (never pending, never a throw) and an unrecognised code to null", () => {
    const row = mapLedgerRow({ ...FULL_ROW, status: "weird", code: "mystery" });
    expect(row.status).toBe("unknown");
    expect(row.code).toBeNull();
    expect(mapLedgerRow({ ...FULL_ROW, status: undefined }).status).toBe("unknown");
  });

  it("never carries an extra input key such as a student name", () => {
    const row = mapLedgerRow({ ...FULL_ROW, student_name: "Ada Lovelace", body: "secret" });
    expect(JSON.stringify(row)).not.toMatch(/Ada|secret|student_name/);
    expect(Object.keys(row)).toHaveLength(14);
  });

  it("builds the opaque recipient key", () => {
    expect(ledgerKey({ courseId: "100", recipientId: "200" })).toBe("100:200");
  });
});

describe("effectiveStatus (P22)", () => {
  const now = Date.parse("2026-10-11T10:10:00Z");
  const claimedAgo = (ms: number) => new Date(now - ms).toISOString();

  it("a sending row older than SENDING_STALE_MS reads unknown, a younger one stays sending", () => {
    expect(effectiveStatus({ status: "sending", claimedAt: claimedAgo(SENDING_STALE_MS + 1) }, now)).toBe("unknown");
    expect(effectiveStatus({ status: "sending", claimedAt: claimedAgo(SENDING_STALE_MS - 1) }, now)).toBe("sending");
    expect(effectiveStatus({ status: "sending", claimedAt: claimedAgo(SENDING_STALE_MS) }, now)).toBe("sending");
    expect(effectiveStatus({ status: "accepted", claimedAt: claimedAgo(10 * SENDING_STALE_MS) }, now)).toBe("accepted");
    expect(effectiveStatus({ status: "sending", claimedAt: null }, now)).toBe("unknown");
  });
});

describe("DL-10 constants", () => {
  it("the thresholds sit inside the SQL range checks and retention outlasts the guard", () => {
    expect(SENDING_STALE_MS).toBeGreaterThanOrEqual(30000);
    expect(SENDING_STALE_MS).toBeLessThanOrEqual(3600000);
    expect(DUP_WINDOW_MS).toBeGreaterThanOrEqual(3600000);
    expect(DUP_WINDOW_MS).toBeLessThanOrEqual(2592000000);
    expect(LEDGER_RETENTION_DAYS * 86400000).toBeGreaterThan(DUP_WINDOW_MS + SENDING_STALE_MS);
    expect(LEDGER_RETENTION_DAYS).toBeGreaterThanOrEqual(8);
  });

  it("the ledger wrapper reads the constants leaf and hard-codes neither threshold", () => {
    const source = fs.readFileSync(LEDGER_SOURCE, "utf8");
    expect(source).toMatch(/from "\.\/send-constants"/);
    expect(source).not.toMatch(/\b120000\b|\b86_?400_?000\b|\b86400000\b/);
  });
});

// ---------------------------------------------------------------------------
// DL-9: ledgerOutcomeFor against the CHECK parsed from the migration
// ---------------------------------------------------------------------------

function allowedPairs(): Set<string> {
  const sql = fs.readFileSync(MIGRATION, "utf8").split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  const start = sql.indexOf("live_message_sends_state_shape check (");
  const block = sql.slice(start, sql.indexOf("\n  )\n);", start));
  const pairs = new Set<string>();
  for (const arm of block.split(/\n\s*or /)) {
    const status = /status = '(\w+)'/.exec(arm)?.[1];
    if (!status) continue;
    const eq = /code = '([\w-]+)'/.exec(arm);
    const list = /code in \(([^)]*)\)/.exec(arm);
    if (list) for (const c of list[1].split(",")) pairs.add(`${status}/${c.trim().replace(/'/g, "")}`);
    else if (eq) pairs.add(`${status}/${eq[1]}`);
    else pairs.add(`${status}/null`);
  }
  return pairs;
}

describe("DL-9 ledgerOutcomeFor satisfies the table CHECK", () => {
  const results = [
    { status: "accepted" as const, code: "ok" },
    { status: "refused" as const, code: "refused-pre-send" },
    { status: "refused" as const, code: "refused-http" },
    { status: "refused" as const, code: "refused-rate-limited" },
    { status: "unknown" as const, code: "unknown-http" },
    { status: "unknown" as const, code: "unknown-no-response" },
  ];

  it("every send result maps to a pair the CHECK allows, and the settle-reachable pairs are exactly the allowed ones", () => {
    const allowed = allowedPairs();
    const produced = new Set<string>();
    for (const r of results) {
      const o = ledgerOutcomeFor(r);
      produced.add(`${o.status}/${o.code}`);
      expect(allowed.has(`${o.status}/${o.code}`), `${r.code}`).toBe(true);
    }
    // the only allowed settle pair not produced by a send is the ledger-only reconcile code
    const settleStatuses = new Set(["accepted", "refused", "unknown"]);
    const unreachable = [...allowed].filter((p) => settleStatuses.has(p.split("/")[0]) && !produced.has(p));
    expect(unreachable).toEqual(["unknown/unknown-stale-claim"]);
  });

  it("an unrecognised code falls back to the conservative pair, never an incoherent one", () => {
    const allowed = allowedPairs();
    for (const status of ["accepted", "refused", "unknown"] as const) {
      const o = ledgerOutcomeFor({ status, code: "garbage" });
      expect(allowed.has(`${o.status}/${o.code}`)).toBe(true);
    }
    expect(ledgerOutcomeFor({ status: "unknown", code: "garbage" })).toMatchObject({ status: "unknown", code: "unknown-http" });
  });

  it("carries the http status through, null when absent", () => {
    expect(ledgerOutcomeFor({ status: "refused", code: "refused-http", httpStatus: 403 }).httpStatus).toBe(403);
    expect(ledgerOutcomeFor({ status: "unknown", code: "unknown-no-response" }).httpStatus).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// DL-8: wrappers fail closed
// ---------------------------------------------------------------------------

interface FakeCall {
  name: string;
  args: Record<string, unknown>;
}

function fakeClient(responder: (name: string, args: Record<string, unknown>) => unknown): {
  client: SupabaseClient<Database>;
  calls: FakeCall[];
} {
  const calls: FakeCall[] = [];
  const query = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit"]) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
      Promise.resolve(data).then(resolve, reject);
    return chain;
  };
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return Promise.resolve().then(() => responder(name, args));
    },
    from: (table: string) => {
      calls.push({ name: `from:${table}`, args: {} });
      return query(responder(`from:${table}`, {}));
    },
  } as unknown as SupabaseClient<Database>;
  return { client, calls };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("DL-8 each wrapper is ok:false on an error object, a rejection and a timeout", () => {
  const wrappers: Array<[string, (c: SupabaseClient<Database>) => Promise<{ ok: boolean }>]> = [
    ["reconcileStale", (c) => reconcileStale(c)],
    ["lookupDuplicates", (c) => lookupDuplicates(c, { institution: "MCC", targets: [{ courseId: "1", recipientId: "2", digest: "d" }] })],
    ["startBatch", (c) => startBatch(c, { institution: "MCC", targets: [{ courseId: "1", recipientId: "2", digest: "d", allowResend: false }] })],
    ["claimRow", (c) => claimRow(c, { id: "x", digest: "d" })],
    ["settleRow", (c) => settleRow(c, { id: "x", outcome: { status: "accepted", code: "ok", httpStatus: 200 } })],
    ["requeueRefused", (c) => requeueRefused(c, "b")],
    ["pruneOld", (c) => pruneOld(c)],
    ["readRowByKey", (c) => readRowByKey(c, { batchId: "b", courseId: "1", recipientId: "2" })],
    ["readBatchRows", (c) => readBatchRows(c, "b")],
  ];

  for (const [name, call] of wrappers) {
    it(`${name}: error object -> ok:false`, async () => {
      const { client } = fakeClient(() => ({ data: null, error: { message: "boom" } }));
      expect((await call(client)).ok).toBe(false);
    });

    it(`${name}: rejection -> ok:false`, async () => {
      const { client } = fakeClient(() => {
        throw new Error("network");
      });
      expect((await call(client)).ok).toBe(false);
    });

    it(`${name}: never resolving -> ok:false at the 3s ceiling`, async () => {
      vi.useFakeTimers();
      const { client } = fakeClient(() => new Promise(() => undefined));
      const pending = call(client);
      await vi.advanceTimersByTimeAsync(3001);
      expect((await pending).ok).toBe(false);
    });
  }

  it("an RPC error is never mistaken for 'no rows'", async () => {
    const { client } = fakeClient(() => ({ data: [], error: { message: "denied" } }));
    const result = await lookupDuplicates(client, { institution: "MCC", targets: [{ courseId: "1", recipientId: "2", digest: "d" }] });
    expect(result).toEqual({ ok: false });
  });

  it("(d) rows come back mapped", async () => {
    const { client } = fakeClient(() => ({ data: [FULL_ROW], error: null }));
    const dup = await lookupDuplicates(client, { institution: "MCC", targets: [{ courseId: "100", recipientId: "200", digest: "d" }] });
    expect(dup.ok && dup.rows[0].status).toBe("accepted");
    const claim = await claimRow(client, { id: FULL_ROW.id, digest: "d" });
    expect(claim.ok && (claim.row as LedgerRow).batchId).toBe(FULL_ROW.batch_id);
    const none = await claimRow(fakeClient(() => ({ data: [], error: null })).client, { id: "x", digest: "d" });
    expect(none).toEqual({ ok: true, row: null });
  });

  it("settle reports whether the conditional update landed", async () => {
    const outcome = { status: "accepted" as const, code: "ok" as const, httpStatus: 200 };
    expect(await settleRow(fakeClient(() => ({ data: true, error: null })).client, { id: "x", outcome })).toEqual({ ok: true, settled: true });
    expect(await settleRow(fakeClient(() => ({ data: false, error: null })).client, { id: "x", outcome })).toEqual({ ok: true, settled: false });
  });

  it("start_batch with no rows back is a failure, not an empty batch", async () => {
    const { client } = fakeClient(() => ({ data: [], error: null }));
    expect(await startBatch(client, { institution: "MCC", targets: [{ courseId: "1", recipientId: "2", digest: "d", allowResend: false }] })).toEqual({ ok: false });
  });

  it("start_batch maps the o_ columns", async () => {
    const { client } = fakeClient(() => ({
      data: [
        { o_batch_id: "B", o_course_id: "1", o_recipient_id: "2", o_outcome: "inserted", o_dup_status: null },
        { o_batch_id: "B", o_course_id: "1", o_recipient_id: "3", o_outcome: "duplicate", o_dup_status: "sending" },
      ],
      error: null,
    }));
    const r = await startBatch(client, { institution: "MCC", targets: [{ courseId: "1", recipientId: "2", digest: "d", allowResend: false }, { courseId: "1", recipientId: "3", digest: "d", allowResend: false }] });
    expect(r).toEqual({
      ok: true,
      batchId: "B",
      recipients: [
        { courseId: "1", recipientId: "2", outcome: "inserted", dupStatus: null },
        { courseId: "1", recipientId: "3", outcome: "duplicate", dupStatus: "sending" },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// DL-6: every rpc name and argument key matches the SQL signature
// ---------------------------------------------------------------------------

function sqlSignatures(): Map<string, string[]> {
  const sql = fs.readFileSync(MIGRATION, "utf8").split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  const out = new Map<string, string[]>();
  for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([\s\S]*?)\)\s*\n?\s*returns/g)) {
    out.set(m[1], [...m[2].matchAll(/\b(p_[a-z_]+)\s+/g)].map((p) => p[1]).sort());
  }
  return out;
}

describe("DL-6 the wrappers call the SQL functions by their real names and parameter names", () => {
  it("every callLedgerRpc(...) call names a public function and passes exactly its parameters", () => {
    const sigs = sqlSignatures();
    const source = ts.createSourceFile(LEDGER_SOURCE, fs.readFileSync(LEDGER_SOURCE, "utf8"), ts.ScriptTarget.Latest, true);
    const calls: Array<{ name: string; keys: string[] }> = [];
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "callLedgerRpc" && node.arguments.length === 3) {
        const [, nameArg, argsArg] = node.arguments;
        if (ts.isStringLiteralLike(nameArg) && ts.isObjectLiteralExpression(argsArg)) {
          calls.push({
            name: nameArg.text,
            keys: argsArg.properties.map((p) => (p.name && ts.isIdentifier(p.name) ? p.name.text : "?")).sort(),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(calls.map((c) => c.name).sort()).toEqual([
      "live_message_claim",
      "live_message_dup_lookup",
      "live_message_prune",
      "live_message_reconcile",
      "live_message_requeue_refused",
      "live_message_settle",
      "live_message_start_batch",
    ]);
    for (const call of calls) {
      expect(sigs.has(call.name), call.name).toBe(true);
      expect(call.keys, call.name).toEqual(sigs.get(call.name));
    }
  });

  it("the signature parser is not vacuous (it finds the nine functions)", () => {
    expect(sqlSignatures().size).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// DL-11: no service-role client anywhere on the ledger path
// ---------------------------------------------------------------------------

function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("DL-11 the ledger and the send action never reach for the service-role client", () => {
  const files = [
    LEDGER_SOURCE,
    path.join(ROOT, "src", "lib", "live-messaging", "send-batch.ts"),
    path.join(ROOT, "src", "app", "actions", "live-messaging-send.ts"),
  ];

  it("references neither createServiceClient nor SUPABASE_SERVICE_ROLE_KEY", () => {
    for (const file of files) {
      const text = codeOnly(fs.readFileSync(file, "utf8"));
      expect(text, file).not.toMatch(/createServiceClient|SUPABASE_SERVICE_ROLE_KEY/);
    }
  });

  it("the ledger module has exactly one `as any` (the accessor)", () => {
    const text = codeOnly(fs.readFileSync(LEDGER_SOURCE, "utf8"));
    expect(text.match(/\bas any\b/g) ?? []).toHaveLength(1);
  });
});
