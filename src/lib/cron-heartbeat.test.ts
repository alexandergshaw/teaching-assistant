import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  classifyCronHeartbeat,
  recordCronHeartbeat,
  readCronHeartbeat,
  heartbeatIdForSource,
  CRON_TICK_INTERVAL_MINUTES,
  CRON_LATE_AFTER_MINUTES,
  CRON_STALLED_AFTER_MINUTES,
  RUN_SCHEDULES_HEARTBEAT_ID,
  GITHUB_ACTIONS_SOURCE,
  type CronHeartbeatFacts,
} from "./cron-heartbeat";

// Fixed reference instant so every test pins nowMs explicitly rather than
// reading the real clock.
const NOW = new Date("2026-08-24T12:00:00.000Z").getTime();

function minutesAgo(minutes: number): string {
  return new Date(NOW - minutes * 60_000).toISOString();
}

/** Builds the object classifyCronHeartbeat now takes, defaulting lastError to
 * null so most call sites only need to say how old the tick is. */
function hb(lastTickAt: string | null, lastError: string | null = null): CronHeartbeatFacts | null {
  if (lastTickAt === null) return null;
  return { lastTickAt, lastError };
}

describe("threshold constants", () => {
  it("are derived from CRON_TICK_INTERVAL_MINUTES, not hardcoded", () => {
    expect(CRON_LATE_AFTER_MINUTES).toBe(CRON_TICK_INTERVAL_MINUTES * 2 + 5);
    expect(CRON_STALLED_AFTER_MINUTES).toBe(CRON_TICK_INTERVAL_MINUTES * 8);
  });

  it("match the documented values (15-minute cadence -> late 35, stalled 120)", () => {
    expect(CRON_TICK_INTERVAL_MINUTES).toBe(15);
    expect(CRON_LATE_AFTER_MINUTES).toBe(35);
    expect(CRON_STALLED_AFTER_MINUTES).toBe(120);
  });
});

describe("classifyCronHeartbeat - never", () => {
  it("null heartbeat -> never, minutesSince null", () => {
    const status = classifyCronHeartbeat(null, NOW);
    expect(status.state).toBe("never");
    expect(status.minutesSince).toBeNull();
  });

  it("empty-string lastTickAt -> never, minutesSince null", () => {
    const status = classifyCronHeartbeat(hb(""), NOW);
    expect(status.state).toBe("never");
    expect(status.minutesSince).toBeNull();
  });

  it("an unparseable timestamp -> never, minutesSince null", () => {
    const status = classifyCronHeartbeat(hb("not-a-timestamp"), NOW);
    expect(status.state).toBe("never");
    expect(status.minutesSince).toBeNull();
  });
});

describe("classifyCronHeartbeat - clock skew", () => {
  it("a future timestamp reads as healthy, zero minutes, never negative", () => {
    const future = new Date(NOW + 5 * 60_000).toISOString();
    const status = classifyCronHeartbeat(hb(future), NOW);
    expect(status.state).toBe("healthy");
    expect(status.minutesSince).toBe(0);
    expect(status.minutesSince).toBeGreaterThanOrEqual(0);
  });
});

describe("classifyCronHeartbeat - late boundary", () => {
  it("34 minutes -> healthy", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(34)), NOW);
    expect(status.state).toBe("healthy");
    expect(status.minutesSince).toBe(34);
  });

  it("35 minutes -> late", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(35)), NOW);
    expect(status.state).toBe("late");
    expect(status.minutesSince).toBe(35);
  });
});

describe("classifyCronHeartbeat - stalled boundary", () => {
  it("119 minutes -> late", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(119)), NOW);
    expect(status.state).toBe("late");
    expect(status.minutesSince).toBe(119);
  });

  it("120 minutes -> stalled", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(120)), NOW);
    expect(status.state).toBe("stalled");
    expect(status.minutesSince).toBe(120);
  });
});

describe("classifyCronHeartbeat - message facts, not exact prose", () => {
  it("never (missing) message does not read as a failure", () => {
    const status = classifyCronHeartbeat(null, NOW);
    expect(status.message.toLowerCase()).toContain("not reported");
  });

  it("never (unparseable) message differs from the missing-timestamp message", () => {
    const missing = classifyCronHeartbeat(null, NOW).message;
    const unparseable = classifyCronHeartbeat(hb("garbage"), NOW).message;
    expect(unparseable).not.toBe(missing);
  });

  it("healthy message reports the gap", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(10)), NOW);
    expect(status.message).toContain("10 minute");
  });

  it("healthy at zero minutes still reads as healthy without a literal 0-minute gap", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(0)), NOW);
    expect(status.state).toBe("healthy");
    expect(status.minutesSince).toBe(0);
  });

  it("late message mentions the interval and the gap, in that the gap and interval both appear", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(40)), NOW);
    expect(status.message).toContain("40 minute");
    expect(status.message).toContain(String(CRON_TICK_INTERVAL_MINUTES));
  });

  it("stalled message mentions the Actions tab and the gap", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(200)), NOW);
    expect(status.message.toLowerCase()).toContain("actions tab");
  });

  it("stalled and late messages differ in wording, not just state", () => {
    const late = classifyCronHeartbeat(hb(minutesAgo(40)), NOW).message;
    const stalled = classifyCronHeartbeat(hb(minutesAgo(200)), NOW).message;
    expect(stalled).not.toBe(late);
  });
});

describe("formatGap pluralisation via classifyCronHeartbeat", () => {
  it("1 minute is singular", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(1)), NOW);
    expect(status.message).toContain("1 minute");
    expect(status.message).not.toContain("1 minutes");
  });

  it("2 minutes is plural", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(2)), NOW);
    expect(status.message).toContain("2 minutes");
  });

  it("exactly 1 hour is singular ('1 hour', not '60 minutes')", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(60)), NOW);
    expect(status.message).toContain("1 hour");
    expect(status.message).not.toContain("1 hours");
    expect(status.message).not.toContain("60 minute");
  });

  it("2 hours is plural", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(120)), NOW);
    expect(status.message).toContain("2 hours");
  });

  it("exactly 1 day is singular ('1 day', not '24 hours')", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(24 * 60)), NOW);
    expect(status.message).toContain("1 day");
    expect(status.message).not.toContain("1 days");
    expect(status.message).not.toContain("24 hour");
  });

  it("2 days is plural", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(2 * 24 * 60)), NOW);
    expect(status.message).toContain("2 days");
  });
});

describe("classifyCronHeartbeat - failing (on-time tick, non-null lastError)", () => {
  it("a fresh tick with an error classifies as failing and the message contains the error text", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(0), "connection to canvas refused"), NOW);
    expect(status.state).toBe("failing");
    expect(status.minutesSince).toBe(0);
    expect(status.message).toContain("connection to canvas refused");
  });

  it("an on-time (10 minute) tick with an error also classifies as failing", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(10), "boom"), NOW);
    expect(status.state).toBe("failing");
  });

  it("not-firing outranks firing-badly: a 200-minute-old tick with an error is still stalled, not failing", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(200), "boom"), NOW);
    expect(status.state).toBe("stalled");
    expect(status.state).not.toBe("failing");
  });

  it("not-firing outranks firing-badly: a 40-minute-old tick with an error is still late, not failing", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(40), "boom"), NOW);
    expect(status.state).toBe("late");
    expect(status.state).not.toBe("failing");
  });

  it("a healthy-gap tick with lastError null (not just falsy-empty) stays healthy, not failing", () => {
    const status = classifyCronHeartbeat(hb(minutesAgo(5), null), NOW);
    expect(status.state).toBe("healthy");
  });
});

describe("heartbeatIdForSource", () => {
  it("two different sources produce different ids, so one caller's row cannot collide with another's", () => {
    const githubId = heartbeatIdForSource("github-actions");
    const vercelId = heartbeatIdForSource("vercel-cron");
    expect(githubId).not.toBe(vercelId);
  });

  it("prefixes every id with the tick name, keeping ids scoped to run-schedules", () => {
    expect(heartbeatIdForSource("github-actions")).toBe(`${RUN_SCHEDULES_HEARTBEAT_ID}:github-actions`);
  });

  it("a blank source yields the unknown id rather than a trailing-colon id", () => {
    expect(heartbeatIdForSource("")).toBe(`${RUN_SCHEDULES_HEARTBEAT_ID}:unknown`);
  });

  it("a whitespace-only source also yields the unknown id", () => {
    expect(heartbeatIdForSource("   ")).toBe(`${RUN_SCHEDULES_HEARTBEAT_ID}:unknown`);
  });

  it("a hostile value with punctuation and spaces is slugged, not injected verbatim", () => {
    const id = heartbeatIdForSource("  DROP TABLE cron_heartbeat; --  ");
    expect(id.startsWith(`${RUN_SCHEDULES_HEARTBEAT_ID}:`)).toBe(true);
    const slug = id.slice(`${RUN_SCHEDULES_HEARTBEAT_ID}:`.length);
    // No punctuation, spaces, or uppercase survive - only lowercase
    // alphanumerics and single internal hyphens.
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slug).not.toContain(" ");
    expect(slug).not.toContain(";");
  });

  it("is length-bounded even for a very long source", () => {
    const id = heartbeatIdForSource("x".repeat(500));
    const slug = id.slice(`${RUN_SCHEDULES_HEARTBEAT_ID}:`.length);
    expect(slug.length).toBeLessThanOrEqual(40);
  });
});

// ---------------------------------------------------------------------------
// recordCronHeartbeat - capturing stub. The stubs below record the exact
// payload and options recordCronHeartbeat sends to `.upsert(...)`, so this
// suite can assert on WHAT gets written rather than only on the boolean it
// returns - defect 3 from the verification pass: a mis-spelled column name
// used to ship green through vitest, tsc, eslint AND next build (the table
// access is cast to `any`), while every tick 400s in production.

interface CapturedUpsert {
  payload: Record<string, unknown>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
}

function createCapturingUpsertStub(errorToReturn: unknown = null) {
  const calls: CapturedUpsert[] = [];
  const stub = {
    from() {
      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upsert: async (payload: Record<string, unknown>, options: any) => {
          calls.push({ payload, options });
          return { error: errorToReturn };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { stub, calls };
}

const BASE_RECORD_INPUT = {
  tickAt: new Date(NOW),
  source: "github-actions",
  schedulesProcessed: 3,
  triggersProcessed: 1,
  durationMs: 42,
  lastError: null as string | null,
};

describe("recordCronHeartbeat - best-effort contract with a hand-rolled stub", () => {
  it("never throws and returns true when the stubbed upsert succeeds", async () => {
    const { stub } = createCapturingUpsertStub(null);
    const result = await recordCronHeartbeat(stub, BASE_RECORD_INPUT);
    expect(result).toBe(true);
  });

  it("returns false (not a throw) when the stubbed upsert reports an error", async () => {
    const { stub } = createCapturingUpsertStub(new Error("boom"));
    const result = await recordCronHeartbeat(stub, BASE_RECORD_INPUT);
    expect(result).toBe(false);
  });

  it("returns false (not a throw) when the stubbed client throws synchronously", async () => {
    const stub = {
      from() {
        throw new Error("client is on fire");
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const result = await recordCronHeartbeat(stub, { ...BASE_RECORD_INPUT, source: "unknown", durationMs: null });
    expect(result).toBe(false);
  });
});

describe("recordCronHeartbeat - the captured upsert payload", () => {
  it("includes every expected key", async () => {
    const { stub, calls } = createCapturingUpsertStub();
    await recordCronHeartbeat(stub, BASE_RECORD_INPUT);
    expect(calls).toHaveLength(1);
    const keys = Object.keys(calls[0].payload).sort();
    expect(keys).toEqual(
      [
        "duration_ms",
        "id",
        "last_error",
        "last_tick_at",
        "last_tick_source",
        "schedules_processed",
        "triggers_processed",
        "updated_at",
      ].sort()
    );
  });

  it("passes onConflict: 'id' as the upsert options", async () => {
    const { stub, calls } = createCapturingUpsertStub();
    await recordCronHeartbeat(stub, BASE_RECORD_INPUT);
    expect(calls[0].options).toEqual({ onConflict: "id" });
  });

  it("defaults the id to heartbeatIdForSource(source) when input.id is not given", async () => {
    const { stub, calls } = createCapturingUpsertStub();
    await recordCronHeartbeat(stub, { ...BASE_RECORD_INPUT, source: "github-actions" });
    expect(calls[0].payload.id).toBe(heartbeatIdForSource("github-actions"));
  });

  it("an explicit input.id overrides the derived default", async () => {
    const { stub, calls } = createCapturingUpsertStub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await recordCronHeartbeat(stub, { ...BASE_RECORD_INPUT, source: "github-actions", id: "some-other-row" } as any);
    expect(calls[0].payload.id).toBe("some-other-row");
  });

  it("caps last_error at 500 characters", async () => {
    const { stub, calls } = createCapturingUpsertStub();
    const longError = "e".repeat(1000);
    await recordCronHeartbeat(stub, { ...BASE_RECORD_INPUT, lastError: longError });
    expect(calls[0].payload.last_error).toHaveLength(500);
    expect(calls[0].payload.last_error).toBe("e".repeat(500));
  });

  it("a null lastError stays null (not coerced, not the string 'null')", async () => {
    const { stub, calls } = createCapturingUpsertStub();
    await recordCronHeartbeat(stub, { ...BASE_RECORD_INPUT, lastError: null });
    expect(calls[0].payload.last_error).toBeNull();
  });

  it("stores tickAt as an ISO string under last_tick_at, and the schedule/trigger counts and duration verbatim", async () => {
    const { stub, calls } = createCapturingUpsertStub();
    await recordCronHeartbeat(stub, BASE_RECORD_INPUT);
    expect(calls[0].payload.last_tick_at).toBe(BASE_RECORD_INPUT.tickAt.toISOString());
    expect(calls[0].payload.schedules_processed).toBe(3);
    expect(calls[0].payload.triggers_processed).toBe(1);
    expect(calls[0].payload.duration_ms).toBe(42);
    expect(calls[0].payload.last_tick_source).toBe("github-actions");
  });
});

// ---------------------------------------------------------------------------
// The migration guard - defect 3's actual fix. Reads the real migration file
// and confirms every key the captured upsert payload sends exists as a real
// column, so a mis-spelled column name (last_tick_atx, say) fails a fast
// vitest run instead of shipping and silently 400ing every tick in
// production, where nothing in the type system catches it (the table access
// is cast to `any`). Precedent for reading a repo file inside a test:
// src/app/components/repo-grades/repoGrades.wiring.test.ts.

const MIGRATION_PATH = join(process.cwd(), "supabase/migrations/20261007000000_cron_heartbeat.sql");
const migrationSql = readFileSync(MIGRATION_PATH, "utf8");

/**
 * Extracts the column names declared inside `create table if not exists
 * public.<tableName> ( ... );` in `sql`. A narrow, comment-aware text
 * heuristic (this migration's columns are each one per line, with `--`
 * comment lines above them) rather than a real SQL parser - proven against
 * fixtures below before being trusted against the real migration, matching
 * this repo's "structural checker needs a canary" convention.
 */
function extractCreateTableColumns(sql: string, tableName: string): string[] {
  const startMarker = `create table if not exists public.${tableName} (`;
  const start = sql.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`could not find "create table if not exists public.${tableName} (" in the migration`);
  }
  const bodyStart = start + startMarker.length;
  const end = sql.indexOf("\n);", bodyStart);
  if (end === -1) {
    throw new Error(`could not find the closing ");" for public.${tableName}`);
  }
  const body = sql.slice(bodyStart, end);
  const columns: string[] = [];
  for (const rawLine of body.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("--")) continue;
    const match = line.match(/^([a-z_][a-z0-9_]*)\b/);
    if (match) columns.push(match[1]);
  }
  return columns;
}

describe("extractCreateTableColumns (canary: proves the column extractor actually discriminates)", () => {
  it("extracts one column per declaration line, ignoring comment lines above them", () => {
    const fixture = `create table if not exists public.widgets (\n  -- the primary key\n  id text primary key,\n  -- a count\n  count integer not null default 0\n);\n`;
    expect(extractCreateTableColumns(fixture, "widgets")).toEqual(["id", "count"]);
  });

  it("does not pick up a column name that appears only inside a comment", () => {
    const fixture = `create table if not exists public.widgets (\n  -- ghost_column was removed, do not resurrect it\n  id text primary key\n);\n`;
    const columns = extractCreateTableColumns(fixture, "widgets");
    expect(columns).not.toContain("ghost_column");
    expect(columns).toContain("id");
  });

  it("matches the real cron_heartbeat migration's known columns", () => {
    const columns = extractCreateTableColumns(migrationSql, "cron_heartbeat");
    expect(columns).toEqual(
      expect.arrayContaining([
        "id",
        "last_tick_at",
        "last_tick_source",
        "schedules_processed",
        "triggers_processed",
        "duration_ms",
        "last_error",
        "updated_at",
      ])
    );
  });
});

describe("recordCronHeartbeat's upsert payload keys are all real migration columns (defect 3's guard)", () => {
  it("every key the captured payload sends exists as a column in supabase/migrations/20261007000000_cron_heartbeat.sql", async () => {
    const { stub, calls } = createCapturingUpsertStub();
    await recordCronHeartbeat(stub, BASE_RECORD_INPUT);
    const columns = extractCreateTableColumns(migrationSql, "cron_heartbeat");
    const payloadKeys = Object.keys(calls[0].payload);
    const missing = payloadKeys.filter((key) => !columns.includes(key));
    expect(missing, `upsert payload key(s) with no matching migration column: ${missing.join(", ")}`).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// readCronHeartbeat / the row mapper.

function createSelectStub(row: Record<string, unknown> | null, error: unknown = null) {
  const eqCalls: string[] = [];
  const stub = {
    from() {
      return {
        select() {
          return {
            eq(column: string, value: string) {
              // The route/reader queries `.eq("id", id)`, so the id under
              // test is the VALUE, not the column name.
              expect(column).toBe("id");
              eqCalls.push(value);
              return {
                maybeSingle: async () => ({ data: row, error }),
              };
            },
          };
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { stub, eqCalls };
}

const SAMPLE_ROW = {
  id: "run-schedules:github-actions",
  last_tick_at: "2026-08-24T11:45:00.000Z",
  last_tick_source: "github-actions",
  schedules_processed: 5,
  triggers_processed: 2,
  duration_ms: 1234,
  last_error: null,
};

describe("readCronHeartbeat", () => {
  it("defaults to the github-actions row's id when no id is given", async () => {
    const { stub, eqCalls } = createSelectStub(SAMPLE_ROW);
    await readCronHeartbeat(stub);
    expect(eqCalls).toEqual([heartbeatIdForSource(GITHUB_ACTIONS_SOURCE)]);
  });

  it("queries the exact id passed in, overriding the default", async () => {
    const { stub, eqCalls } = createSelectStub(SAMPLE_ROW);
    await readCronHeartbeat(stub, "some-other-row");
    expect(eqCalls).toEqual(["some-other-row"]);
  });

  it("maps a returned row's snake_case columns onto the camelCase CronHeartbeat fields", async () => {
    const { stub } = createSelectStub(SAMPLE_ROW);
    const result = await readCronHeartbeat(stub);
    expect(result).toEqual({
      id: "run-schedules:github-actions",
      lastTickAt: "2026-08-24T11:45:00.000Z",
      lastTickSource: "github-actions",
      schedulesProcessed: 5,
      triggersProcessed: 2,
      durationMs: 1234,
      lastError: null,
    });
  });

  it("maps a non-null last_error through unchanged", async () => {
    const { stub } = createSelectStub({ ...SAMPLE_ROW, last_error: "boom" });
    const result = await readCronHeartbeat(stub);
    expect(result?.lastError).toBe("boom");
  });

  it("a Supabase error returns null rather than a mapped row", async () => {
    const { stub } = createSelectStub(SAMPLE_ROW, new Error("read failed"));
    const result = await readCronHeartbeat(stub);
    expect(result).toBeNull();
  });

  it("a missing row (no error, but data is null) returns null", async () => {
    const { stub } = createSelectStub(null, null);
    const result = await readCronHeartbeat(stub);
    expect(result).toBeNull();
  });

  it("a throwing client returns null rather than propagating", async () => {
    const stub = {
      from() {
        throw new Error("client is on fire");
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const result = await readCronHeartbeat(stub);
    expect(result).toBeNull();
  });
});
