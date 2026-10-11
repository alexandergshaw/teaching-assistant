// The scenario oracle for the send ledger (docs/live-lms-student-messaging-ledger.md
// section 5, pins DL-12, DL-13, DL-14b). The SQL is not executable here (no
// Postgres in this environment), so this file runs the section-5 LITERAL TABLE
// against an in-test MODEL of the ledger functions.
//
// WHAT THIS PROVES, AND WHAT IT DOES NOT. It proves the SPEC is self-consistent
// and that each defence is load-bearing: with the in-lock reconcile removed
// L14 flips, with the settled_at reset removed L6 flips, with `sending` taken
// out of the duplicate set D6/D7/C2 flip. It does NOT prove Postgres does the
// same: a model written from the same reading as the SQL agrees with it by
// construction. Every expected value below is a literal from the design table;
// the model never produces an expected value. The real execution is the
// migration Action run plus the owner walk (R-L-1, R-L-2).

import { describe, expect, it } from "vitest";

const T0 = 1_800_000_000_000;
const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;
const STALE = 120 * S;
const WINDOW = 24 * H;
const MAX_ATTEMPTS = 3;
const RETENTION_DAYS = 90;

type Status = "pending" | "sending" | "accepted" | "refused" | "unknown";

interface MRow {
  id: string;
  user: string;
  batch: string;
  inst: string;
  course: string;
  rec: string;
  digest: string;
  status: Status;
  code: string | null;
  http: number | null;
  attempt: number;
  allow: boolean;
  created: number;
  claimed: number | null;
  settled: number | null;
}

class ModelError extends Error {
  constructor(public sqlstate: string) {
    super(sqlstate);
  }
}

interface Flags {
  /** Mutant: CLAIM and REQUEUE keep the old settled_at (the ops-literal pair; F-L1 has two halves). */
  keepSettledOnClaim?: boolean;
  /** Mutant: CLAIM has no in-lock reconcile. */
  noInLockReconcile?: boolean;
  /** Mutant: the duplicate set omits `sending`. */
  dupWithoutSending?: boolean;
}

function shapeOk(r: MRow): boolean {
  switch (r.status) {
    case "pending":
      return r.claimed === null && r.settled === null && r.code === null && r.http === null;
    case "sending":
      return r.claimed !== null && r.settled === null && r.code === null && r.http === null;
    case "accepted":
      return r.claimed !== null && r.settled !== null && r.code === "ok";
    case "refused":
      return r.claimed !== null && r.settled !== null && ["refused-pre-send", "refused-http", "refused-rate-limited"].includes(r.code ?? "");
    case "unknown":
      return r.claimed !== null && r.settled !== null && ["unknown-http", "unknown-no-response", "unknown-stale-claim"].includes(r.code ?? "");
  }
}

class Ledger {
  rows: MRow[] = [];
  now = T0;
  user: string | null = "U";
  private seq = 0;
  constructor(public flags: Flags = {}) {}

  private uid(): string {
    if (this.user === null) throw new ModelError("28000");
    return this.user;
  }

  private dupStatuses(): Status[] {
    return this.flags.dupWithoutSending ? ["accepted", "unknown"] : ["accepted", "unknown", "sending"];
  }

  private anchor(r: MRow): number {
    return r.settled ?? r.claimed ?? r.created;
  }

  dupRows(uid: string, inst: string, course: string, rec: string, digest: string, window: number, excludeId: string | null, after: number | null): MRow[] {
    return this.rows.filter(
      (s) =>
        s.user === uid &&
        s.inst === inst &&
        s.course === course &&
        s.rec === rec &&
        s.digest === digest &&
        this.dupStatuses().includes(s.status) &&
        this.anchor(s) > this.now - window &&
        (excludeId === null || s.id !== excludeId) &&
        (after === null || this.anchor(s) > after)
    );
  }

  reconcile(staleMs: number): number {
    const uid = this.uid();
    if (staleMs < 30000 || staleMs > 3600000) throw new ModelError("22023");
    let n = 0;
    for (const s of this.rows) {
      if (s.user === uid && s.status === "sending" && s.claimed !== null && s.claimed < this.now - staleMs) {
        s.status = "unknown";
        s.code = "unknown-stale-claim";
        s.settled = this.now;
        n += 1;
      }
    }
    return n;
  }

  dupLookup(inst: string, courses: string[], recs: string[], digests: string[], window: number, stale: number): MRow[] {
    const uid = this.uid();
    if (courses.length < 1 || courses.length > 500 || courses.length !== recs.length || courses.length !== digests.length) {
      throw new ModelError("22023");
    }
    if (window < 3600000 || window > 2592000000) throw new ModelError("22023");
    this.reconcile(stale);
    return courses.flatMap((c, i) => this.dupRows(uid, inst, c, recs[i], digests[i], window, null, null));
  }

  startBatch(
    inst: string,
    courses: string[],
    recs: string[],
    digests: string[],
    allow: boolean[],
    window: number,
    stale: number,
    max: number
  ): { batch: string; course: string; rec: string; outcome: string; dup: string | null }[] {
    const uid = this.uid();
    const n = courses.length;
    if (max < 1 || max > 500 || n < 1 || n > max || n !== recs.length || n !== digests.length || n !== allow.length) {
      throw new ModelError("22023");
    }
    if (window < 3600000 || window > 2592000000) throw new ModelError("22023");
    this.reconcile(stale);
    const pairs = new Set<string>();
    for (let i = 0; i < n; i += 1) {
      const key = `${courses[i]}:${recs[i]}`;
      if (pairs.has(key)) throw new ModelError("23505");
      pairs.add(key);
    }
    const batch = `batch-${(this.seq += 1)}`;
    const rank: Record<string, number> = { sending: 0, unknown: 1, accepted: 2 };
    const out: { batch: string; course: string; rec: string; outcome: string; dup: string | null }[] = [];
    const inserted: MRow[] = [];
    for (let i = 0; i < n; i += 1) {
      const hits = this.dupRows(uid, inst, courses[i], recs[i], digests[i], window, null, null).sort((a, b) => rank[a.status] - rank[b.status]);
      const dup = hits.length > 0 ? hits[0].status : null;
      if (dup === null || allow[i]) {
        inserted.push({
          id: `row-${(this.seq += 1)}`,
          user: uid,
          batch,
          inst,
          course: courses[i],
          rec: recs[i],
          digest: digests[i],
          status: "pending",
          code: null,
          http: null,
          attempt: 0,
          allow: allow[i] && dup !== null,
          created: this.now,
          claimed: null,
          settled: null,
        });
      }
      out.push({ batch, course: courses[i], rec: recs[i], outcome: dup === null || allow[i] ? "inserted" : "duplicate", dup });
    }
    this.rows.push(...inserted);
    return out;
  }

  claim(id: string, digest: string, window: number, stale: number): MRow[] {
    const uid = this.uid();
    if (window < 3600000 || window > 2592000000) throw new ModelError("22023");
    if (stale < 30000 || stale > 3600000) throw new ModelError("22023");
    const row = this.rows.find((r) => r.id === id && r.user === uid);
    if (!row) return [];
    if (!this.flags.noInLockReconcile) {
      for (const s of this.rows) {
        if (
          s.user === uid &&
          s.inst === row.inst &&
          s.course === row.course &&
          s.rec === row.rec &&
          s.digest === row.digest &&
          s.status === "sending" &&
          s.claimed !== null &&
          s.claimed < this.now - stale
        ) {
          s.status = "unknown";
          s.code = "unknown-stale-claim";
          s.settled = this.now;
        }
      }
    }
    if (this.dupRows(uid, row.inst, row.course, row.rec, row.digest, window, row.id, row.allow ? row.created : null).length > 0) return [];
    if (row.status === "pending" && row.digest === digest) {
      row.status = "sending";
      row.attempt += 1;
      row.claimed = this.now;
      if (!this.flags.keepSettledOnClaim) {
        row.settled = null;
        row.code = null;
        row.http = null;
      }
      return [{ ...row }];
    }
    return [];
  }

  settle(id: string, status: string, code: string, http: number | null): boolean {
    const uid = this.uid();
    if (!["accepted", "refused", "unknown"].includes(status)) throw new ModelError("22023");
    const row = this.rows.find((r) => r.id === id && r.user === uid && r.status === "sending");
    if (!row) return false;
    const candidate: MRow = { ...row, status: status as Status, code, http, settled: this.now };
    if (!shapeOk(candidate)) throw new ModelError("23514");
    Object.assign(row, candidate);
    return true;
  }

  requeue(batch: string, max: number): number {
    const uid = this.uid();
    if (max < 1 || max > 10) throw new ModelError("22023");
    let n = 0;
    for (const s of this.rows) {
      if (s.user === uid && s.batch === batch && s.status === "refused" && s.attempt < max) {
        s.status = "pending";
        s.claimed = null;
        if (!this.flags.keepSettledOnClaim) {
          s.settled = null;
          s.code = null;
          s.http = null;
        }
        n += 1;
      }
    }
    return n;
  }

  prune(days: number, limit: number): number {
    const uid = this.uid();
    if (days < 8 || days > 3650 || limit < 1 || limit > 2000) throw new ModelError("22023");
    const doomed = this.rows
      .filter((r) => r.user === uid && r.created < this.now - days * D)
      .sort((a, b) => a.created - b.created)
      .slice(0, limit);
    const ids = new Set(doomed.map((r) => r.id));
    this.rows = this.rows.filter((r) => !ids.has(r.id));
    return doomed.length;
  }
}

// ---------------------------------------------------------------------------
// Fixtures: rows are built from the design table's own words
// ---------------------------------------------------------------------------

const D1 = "d1";
const D2 = "d2";

function row(id: string, status: Status, o: { claimed?: number; settled?: number; created?: number; user?: string; batch?: string; digest?: string; rec?: string; inst?: string; attempt?: number; allow?: boolean } = {}): MRow {
  const code: Record<Status, string | null> = { pending: null, sending: null, accepted: "ok", refused: "refused-http", unknown: "unknown-http" };
  return {
    id,
    user: o.user ?? "U",
    batch: o.batch ?? "B1",
    inst: o.inst ?? "MCC",
    course: "100",
    rec: o.rec ?? "200",
    digest: o.digest ?? D1,
    status,
    code: code[status],
    http: null,
    attempt: o.attempt ?? 0,
    allow: o.allow ?? false,
    created: T0 + (o.created ?? -10 * H),
    claimed: o.claimed === undefined ? (status === "pending" ? null : T0 + (o.settled ?? -1 * H)) : T0 + o.claimed,
    settled: o.settled === undefined ? (status === "pending" || status === "sending" ? null : T0 + (o.claimed ?? -1 * H)) : T0 + o.settled,
  };
}

function find(l: Ledger, id: string): MRow {
  const r = l.rows.find((x) => x.id === id);
  if (!r) throw new Error(`no row ${id}`);
  return r;
}
function raises(fn: () => unknown, state: string) {
  try {
    fn();
  } catch (e) {
    expect((e as ModelError).sqlstate).toBe(state);
    return;
  }
  throw new Error("expected a raise");
}

interface Scenario {
  id: string;
  setup: (l: Ledger) => void;
  act: (l: Ledger) => unknown;
  check: (l: Ledger, ret: unknown) => void;
}

const sc: Scenario[] = [];
const add = (s: Scenario) => sc.push(s);

// --- 5.1 RECONCILE -----------------------------------------------------------
add({ id: "Z1", setup: (l) => l.rows.push(row("a", "sending", { claimed: -121 * S })), act: (l) => l.reconcile(STALE),
  check: (l, r) => { const a = find(l, "a"); expect(r).toBe(1); expect([a.status, a.code, a.settled]).toEqual(["unknown", "unknown-stale-claim", T0]); } });
add({ id: "Z2", setup: (l) => l.rows.push(row("a", "sending", { claimed: -120 * S })), act: (l) => l.reconcile(STALE),
  check: (l, r) => { expect(r).toBe(0); expect(find(l, "a").status).toBe("sending"); } });
add({ id: "Z3", setup: (l) => l.rows.push(row("a", "sending", { claimed: -119 * S })), act: (l) => l.reconcile(STALE),
  check: (l, r) => { expect(r).toBe(0); expect(find(l, "a").status).toBe("sending"); } });
add({ id: "Z4", setup: (l) => l.rows.push(row("p", "pending", { rec: "1" }), row("c", "accepted", { rec: "2", claimed: -H, settled: -H }), row("r", "refused", { rec: "3", claimed: -H, settled: -H }), row("u", "unknown", { rec: "4", claimed: -H, settled: -H })),
  act: (l) => l.reconcile(STALE),
  check: (l, r) => { expect(r).toBe(0); expect(l.rows.map((x) => x.status)).toEqual(["pending", "accepted", "refused", "unknown"]); } });
add({ id: "Z5", setup: (l) => l.rows.push(row("a", "sending", { claimed: -300 * S, user: "V" })), act: (l) => l.reconcile(STALE),
  check: (l, r) => { expect(r).toBe(0); expect(find(l, "a").status).toBe("sending"); } });
add({ id: "Z6", setup: (l) => { l.rows.push(row("a", "sending", { claimed: -121 * S })); l.reconcile(STALE); }, act: (l) => l.reconcile(STALE),
  check: (l, r) => { expect(r).toBe(0); expect(find(l, "a").status).toBe("unknown"); } });
add({ id: "Z7", setup: (l) => l.rows.push(row("a", "sending", { claimed: -300 * S })),
  act: (l) => { raises(() => l.reconcile(0), "22023"); raises(() => l.reconcile(10), "22023"); raises(() => l.reconcile(7_200_000), "22023"); return "raised"; },
  check: (l) => expect(find(l, "a").status).toBe("sending") });

// --- 5.2 DUP in isolation ----------------------------------------------------
const dupCase = (id: string, r: MRow, expected: boolean): Scenario => ({
  id,
  setup: (l) => l.rows.push(r),
  act: (l) => l.dupRows("U", "MCC", "100", "200", D1, WINDOW, null, null).length > 0,
  check: (_l, ret) => expect(ret).toBe(expected),
});
add(dupCase("D1", row("a", "accepted", { claimed: -H, settled: -H }), true));
add(dupCase("D2", row("a", "accepted", { claimed: -23 * H - 59 * M, settled: -23 * H - 59 * M }), true));
add(dupCase("D3", row("a", "accepted", { claimed: -24 * H, settled: -24 * H }), false));
add(dupCase("D4", row("a", "accepted", { claimed: -25 * H, settled: -25 * H }), false));
add(dupCase("D5", row("a", "unknown", { claimed: -H, settled: -H }), true));
add(dupCase("D6", row("a", "sending", { claimed: -30 * S }), true));
add(dupCase("D7", row("a", "sending", { claimed: -300 * S }), true));
add(dupCase("D8", row("a", "pending", { created: -H }), false));
add(dupCase("D9", row("a", "refused", { claimed: -H, settled: -H }), false));
add(dupCase("D10", row("a", "accepted", { claimed: -H, settled: -H, digest: D2 }), false));
add(dupCase("D11", row("a", "accepted", { claimed: -H, settled: -H, rec: "201" }), false));
add(dupCase("D12", row("a", "accepted", { claimed: -H, settled: -H, inst: "XYZ" }), false));
add(dupCase("D13", row("a", "accepted", { claimed: -H, settled: -H, user: "V" }), false));
add(dupCase("D14", row("a", "sending", { claimed: -48 * H }), false));

// --- 5.3 DUP after RECONCILE -------------------------------------------------
add({ id: "C1", setup: (l) => l.rows.push(row("a", "sending", { claimed: -48 * H })),
  act: (l) => l.dupLookup("MCC", ["100"], ["200"], [D1], WINDOW, STALE),
  check: (l, ret) => { const a = find(l, "a"); expect([a.status, a.settled]).toEqual(["unknown", T0]); expect((ret as MRow[]).map((x) => x.id)).toEqual(["a"]); } });
add({ id: "C2", setup: (l) => l.rows.push(row("a", "sending", { claimed: -60 * S })),
  act: (l) => l.startBatch("MCC", ["100"], ["200"], [D1], [false], WINDOW, STALE, 250),
  check: (l, ret) => { const r = (ret as { outcome: string; dup: string | null }[])[0]; expect([r.outcome, r.dup]).toEqual(["duplicate", "sending"]); expect(l.rows).toHaveLength(1); } });
add({ id: "C3", setup: (l) => l.rows.push(row("a", "sending", { claimed: -60 * S })),
  act: (l) => l.startBatch("MCC", ["100"], ["200"], [D1], [true], WINDOW, STALE, 250),
  check: (l, ret) => { expect((ret as { outcome: string }[])[0].outcome).toBe("inserted"); expect(l.rows).toHaveLength(2); const n = l.rows[1]; expect([n.status, n.allow]).toEqual(["pending", true]); expect(find(l, "a").status).toBe("sending"); } });

// --- 5.4 CLAIM ---------------------------------------------------------------
const claimOf = (l: Ledger, id: string, d = D1) => l.claim(id, d, WINDOW, STALE);
add({ id: "L1", setup: (l) => l.rows.push(row("a", "pending")), act: (l) => claimOf(l, "a"),
  check: (_l, ret) => { const r = (ret as MRow[]); expect(r).toHaveLength(1); expect([r[0].status, r[0].attempt, r[0].claimed, r[0].settled, r[0].code, r[0].http]).toEqual(["sending", 1, T0, null, null, null]); } });
add({ id: "L2", setup: (l) => l.rows.push(row("a", "pending")), act: (l) => claimOf(l, "a", D2),
  check: (l, ret) => { expect(ret).toHaveLength(0); expect(find(l, "a").status).toBe("pending"); } });
add({ id: "L3", setup: (l) => l.rows.push(row("a", "sending", { claimed: -30 * S })), act: (l) => claimOf(l, "a"),
  check: (l, ret) => { expect(ret).toHaveLength(0); expect(find(l, "a").status).toBe("sending"); } });
add({ id: "L4", setup: (l) => l.rows.push(row("a", "accepted", { claimed: -H, settled: -H })), act: (l) => claimOf(l, "a"),
  check: (l, ret) => { expect(ret).toHaveLength(0); expect(find(l, "a").status).toBe("accepted"); } });
add({ id: "L5", setup: (l) => l.rows.push(row("a", "pending", { user: "V" })), act: (l) => claimOf(l, "a"),
  check: (l, ret) => { expect(ret).toHaveLength(0); expect(find(l, "a").status).toBe("pending"); } });
add({ id: "L6", setup: (l) => l.rows.push(row("a", "refused", { claimed: -31 * H, settled: -30 * H, attempt: 1 })),
  act: (l) => {
    const requeued = l.requeue("B1", MAX_ATTEMPTS);
    const afterRequeue = { ...find(l, "a") };
    const claimed = claimOf(l, "a");
    const lookup = l.dupLookup("MCC", ["100"], ["200"], [D1], WINDOW, STALE);
    return { requeued, afterRequeue, claimed, lookup };
  },
  check: (_l, ret) => {
    const r = ret as { requeued: number; afterRequeue: MRow; claimed: MRow[]; lookup: MRow[] };
    expect(r.requeued).toBe(1);
    expect([r.afterRequeue.status, r.afterRequeue.claimed, r.afterRequeue.settled, r.afterRequeue.code, r.afterRequeue.http, r.afterRequeue.attempt]).toEqual(["pending", null, null, null, null, 1]);
    expect([r.claimed[0].status, r.claimed[0].attempt, r.claimed[0].claimed, r.claimed[0].settled]).toEqual(["sending", 2, T0, null]);
    expect(r.lookup.map((x) => x.id)).toEqual(["a"]);
  } });
add({ id: "L7", setup: (l) => l.rows.push(row("a", "pending", { batch: "B1" }), row("b", "pending", { batch: "B2" })),
  act: (l) => ({ first: claimOf(l, "a"), second: claimOf(l, "b") }),
  check: (l, ret) => { const r = ret as { first: MRow[]; second: MRow[] }; expect(r.first).toHaveLength(1); expect(r.second).toHaveLength(0); expect(find(l, "b").status).toBe("pending"); } });
add({ id: "L8", setup: (l) => l.rows.push(row("a", "accepted", { claimed: -10 * M, settled: -10 * M }), row("b", "pending", { batch: "B2" })), act: (l) => claimOf(l, "b"),
  check: (l, ret) => { expect(ret).toHaveLength(0); expect(find(l, "b").status).toBe("pending"); } });
add({ id: "L9", setup: (l) => l.rows.push(row("a", "accepted", { claimed: -25 * H, settled: -25 * H }), row("b", "pending", { batch: "B2" })), act: (l) => claimOf(l, "b"),
  check: (l, ret) => { expect(ret).toHaveLength(1); expect(find(l, "b").status).toBe("sending"); } });
add({ id: "L10", setup: (l) => l.rows.push(row("b", "pending", { batch: "B2", allow: true, created: -5 * M }), row("a", "accepted", { claimed: -H, settled: -H })), act: (l) => claimOf(l, "b"),
  check: (l, ret) => { expect(ret).toHaveLength(1); expect(find(l, "b").status).toBe("sending"); } });
add({ id: "L11", setup: (l) => l.rows.push(row("b", "pending", { batch: "B2", allow: true, created: -5 * M }), row("a", "accepted", { claimed: -2 * M, settled: -2 * M })), act: (l) => claimOf(l, "b"),
  check: (l, ret) => { expect(ret).toHaveLength(0); expect(find(l, "b").status).toBe("pending"); } });
add({ id: "L12", setup: (l) => l.rows.push(row("a", "sending", { claimed: -300 * S }), row("b", "pending", { batch: "B2" })), act: (l) => claimOf(l, "b"),
  check: (l, ret) => { expect(ret).toHaveLength(0); expect(find(l, "b").status).toBe("pending"); const a = find(l, "a"); expect([a.status, a.code, a.settled]).toEqual(["unknown", "unknown-stale-claim", T0]); } });
add({ id: "L13", setup: (l) => l.rows.push(row("a", "pending")),
  act: (l) => { raises(() => l.claim("a", D1, 0, STALE), "22023"); raises(() => l.claim("a", D1, WINDOW, 0), "22023"); return "raised"; },
  check: (l) => expect(find(l, "a").status).toBe("pending") });
add({ id: "L14", setup: (l) => l.rows.push(row("a", "sending", { claimed: -48 * H }), row("b", "pending", { batch: "B2" })), act: (l) => claimOf(l, "b"),
  check: (l, ret) => { expect(ret).toHaveLength(0); const a = find(l, "a"); expect([a.status, a.code, a.settled]).toEqual(["unknown", "unknown-stale-claim", T0]); expect(find(l, "b").status).toBe("pending"); } });

// --- 5.5 SETTLE --------------------------------------------------------------
add({ id: "S1", setup: (l) => l.rows.push(row("a", "sending", { claimed: -10 * S })), act: (l) => l.settle("a", "accepted", "ok", 200),
  check: (l, ret) => { const a = find(l, "a"); expect(ret).toBe(true); expect([a.status, a.code, a.http, a.settled]).toEqual(["accepted", "ok", 200, T0]); } });
add({ id: "S2", setup: (l) => l.rows.push(row("a", "unknown", { claimed: -300 * S, settled: -10 * S })), act: (l) => { find(l, "a").code = "unknown-stale-claim"; return l.settle("a", "accepted", "ok", 200); },
  check: (l, ret) => { const a = find(l, "a"); expect(ret).toBe(false); expect([a.status, a.code]).toEqual(["unknown", "unknown-stale-claim"]); } });
add({ id: "S3", setup: (l) => l.rows.push(row("a", "pending")), act: (l) => l.settle("a", "accepted", "ok", 200),
  check: (l, ret) => { expect(ret).toBe(false); expect(find(l, "a").status).toBe("pending"); } });
add({ id: "S4", setup: (l) => l.rows.push(row("a", "sending", { claimed: -10 * S })), act: (l) => { raises(() => l.settle("a", "pending", "ok", 200), "22023"); return "raised"; },
  check: (l) => expect(find(l, "a").status).toBe("sending") });
add({ id: "S5", setup: (l) => l.rows.push(row("a", "sending", { claimed: -10 * S })), act: (l) => { raises(() => l.settle("a", "accepted", "refused-http", 400), "23514"); return "raised"; },
  check: (l) => expect(find(l, "a").status).toBe("sending") });
add({ id: "S6", setup: (l) => l.rows.push(row("a", "sending", { claimed: -10 * S })), act: (l) => l.settle("a", "unknown", "unknown-http", 503),
  check: (l, ret) => { const a = find(l, "a"); expect(ret).toBe(true); expect([a.status, a.code, a.http]).toEqual(["unknown", "unknown-http", 503]); } });

// --- 5.6 START, REQUEUE, PRUNE -----------------------------------------------
add({ id: "T1", setup: () => undefined, act: (l) => l.startBatch("MCC", ["100", "100", "100"], ["1", "2", "3"], [D1, D1, D1], [false, false, false], WINDOW, STALE, 250),
  check: (l, ret) => { const out = ret as { batch: string; outcome: string }[]; expect(out.map((o) => o.outcome)).toEqual(["inserted", "inserted", "inserted"]); expect(new Set(out.map((o) => o.batch)).size).toBe(1); expect(l.rows.map((r) => [r.status, r.attempt, r.allow])).toEqual([["pending", 0, false], ["pending", 0, false], ["pending", 0, false]]); } });
add({ id: "T2", setup: () => undefined,
  act: (l) => { const n = 251; raises(() => l.startBatch("MCC", Array(n).fill("100"), Array.from({ length: n }, (_, i) => String(i + 1)), Array(n).fill(D1), Array(n).fill(false), WINDOW, STALE, 250), "22023"); return "raised"; },
  check: (l) => expect(l.rows).toHaveLength(0) });
add({ id: "T3", setup: () => undefined, act: (l) => { raises(() => l.startBatch("MCC", ["100", "100"], ["1"], [D1, D1], [false, false], WINDOW, STALE, 250), "22023"); return "raised"; },
  check: (l) => expect(l.rows).toHaveLength(0) });
add({ id: "T4", setup: () => undefined, act: (l) => { raises(() => l.startBatch("MCC", ["100", "100"], ["1", "1"], [D1, D1], [false, false], WINDOW, STALE, 250), "23505"); return "raised"; },
  check: (l) => expect(l.rows).toHaveLength(0) });
add({ id: "T5", setup: (l) => { l.user = null; },
  act: (l) => {
    const calls: Array<() => unknown> = [
      () => l.reconcile(STALE),
      () => l.dupLookup("MCC", ["100"], ["1"], [D1], WINDOW, STALE),
      () => l.startBatch("MCC", ["100"], ["1"], [D1], [false], WINDOW, STALE, 250),
      () => l.claim("a", D1, WINDOW, STALE),
      () => l.settle("a", "accepted", "ok", 200),
      () => l.requeue("B1", 3),
      () => l.prune(90, 500),
    ];
    for (const c of calls) raises(c, "28000");
    return calls.length;
  },
  check: (l, ret) => { expect(ret).toBe(7); expect(l.rows).toHaveLength(0); } });
add({ id: "Q1", setup: (l) => l.rows.push(row("a", "refused", { rec: "1", claimed: -H, settled: -H, attempt: 1 }), row("b", "refused", { rec: "2", claimed: -H, settled: -H, attempt: 3 }), row("c", "accepted", { rec: "3", claimed: -H, settled: -H }), row("d", "refused", { rec: "4", batch: "B9", claimed: -H, settled: -H, attempt: 1 })),
  act: (l) => l.requeue("B1", MAX_ATTEMPTS),
  check: (l, ret) => { expect(ret).toBe(1); const a = find(l, "a"); expect([a.status, a.claimed, a.settled, a.code, a.http, a.attempt]).toEqual(["pending", null, null, null, null, 1]); expect(["b", "c", "d"].map((i) => find(l, i).status)).toEqual(["refused", "accepted", "refused"]); } });
add({ id: "P1", setup: (l) => l.rows.push(row("old", "accepted", { rec: "1", created: -91 * D }), row("new", "accepted", { rec: "2", created: -89 * D }), row("theirs", "accepted", { rec: "3", created: -91 * D, user: "V" })),
  act: (l) => l.prune(RETENTION_DAYS, 500),
  check: (l, ret) => { expect(ret).toBe(1); expect(l.rows.map((r) => r.id).sort()).toEqual(["new", "theirs"]); } });
add({ id: "P2", setup: (l) => { for (let i = 0; i < 700; i += 1) l.rows.push(row(`r${i}`, "accepted", { rec: String(i + 1), created: -100 * D })); },
  act: (l) => l.prune(RETENTION_DAYS, 500),
  check: (l, ret) => { expect(ret).toBe(500); expect(l.rows).toHaveLength(200); } });

function runScenario(s: Scenario, flags: Flags = {}): void {
  const l = new Ledger(flags);
  s.setup(l);
  const ret = s.act(l);
  s.check(l, ret);
}

describe("DL-13 canary: the scenario table has its literal 52 scenarios", () => {
  it("Z 7, D 14, C 3, L 14, S 6, T 5, Q 1, P 2", () => {
    const count = (prefix: string) => sc.filter((s) => s.id.startsWith(prefix) && /^[A-Z]\d+$/.test(s.id)).length;
    expect({ Z: count("Z"), D: count("D"), C: count("C"), L: count("L"), S: count("S"), T: count("T"), Q: count("Q"), P: count("P") }).toEqual({
      Z: 7, D: 14, C: 3, L: 14, S: 6, T: 5, Q: 1, P: 2,
    });
    expect(sc).toHaveLength(52);
    expect(new Set(sc.map((s) => s.id)).size).toBe(52);
  });
});

describe("DL-12 the section-5 scenario table, run against the model", () => {
  for (const s of sc) {
    it(s.id, () => runScenario(s));
  }
});

describe("DL-12 mutants: each defence is load-bearing in the model", () => {
  const byId = (id: string) => sc.find((s) => s.id === id) as Scenario;
  it("without the in-lock reconcile, L14 flips (b would be claimed: a second send) and L12's stored state flips", () => {
    expect(() => runScenario(byId("L14"), { noInLockReconcile: true })).toThrow();
    expect(() => runScenario(byId("L12"), { noInLockReconcile: true })).toThrow();
  });

  it("without the settled_at reset on claim, L6 flips (the in-flight row is invisible to the lookup)", () => {
    expect(() => runScenario(byId("L6"), { keepSettledOnClaim: true })).toThrow();
  });

  it("without `sending` in the duplicate set, D6, D7 and C2 flip", () => {
    for (const id of ["D6", "D7", "C2"]) {
      expect(() => runScenario(byId(id), { dupWithoutSending: true }), id).toThrow();
    }
  });

  it("the unmutated model passes the same scenarios (the flips are the mutants, not the harness)", () => {
    for (const id of ["L14", "L12", "L6", "D6", "D7", "C2"]) {
      expect(() => runScenario(byId(id)), id).not.toThrow();
    }
  });
});
