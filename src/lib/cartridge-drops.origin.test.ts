// A40 disclosure half (docs/a40-disclosure-test-notes.md). Covers R1 (the
// new migration is additive-only and idempotent), R2 (CartridgeDrop carries
// the origin, the mapper populates it, origin never contradicts presence)
// and R3e (the producer executes end to end).
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./supabase/types";
import { saveCartridgeDrop, listCartridgeDrops } from "./cartridge-drops";
import { resolveRubricOriginScope, describeDropRubricOrigin } from "./grade/rubric-origin";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase/migrations");
const BASE_MIGRATION_PATH = path.join(MIGRATIONS_DIR, "20260825000000_create_cartridge_drops.sql");
const NEW_MIGRATION_PATH = path.join(MIGRATIONS_DIR, "20261025000000_add_cartridge_drop_rubric_origin_scope.sql");

const baseMigrationSql = fs.readFileSync(BASE_MIGRATION_PATH, "utf8");
const newMigrationRaw = fs.readFileSync(NEW_MIGRATION_PATH, "utf8");

const COL = "rubric_origin_scope";

// Duplicated from src/lib/cron-heartbeat.test.ts, not imported: importing a
// helper from another *.test.ts re-runs that file's describe blocks inside
// this file's run (docs/loop/traps-tests.md).
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

// The new migration's own column(s), extracted the same line-scoped,
// comment-aware way - never from a "--" comment line.
function extractAddColumns(sql: string): string[] {
  const columns: string[] = [];
  for (const rawLine of sql.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("--")) continue;
    const match = line.match(/^alter table public\.\w+ add column if not exists ([a-z_][a-z0-9_]*)/);
    if (match) columns.push(match[1]);
  }
  return columns;
}

function strip(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

describe("R1: the new migration is additive-only and idempotent on re-apply", () => {
  it("R1a: no line has a trailing comment after code", () => {
    const offenders = newMigrationRaw.split("\n").filter((line) => {
      const at = line.indexOf("--");
      return at > 0 && line.slice(0, at).trim() !== "";
    });
    expect(offenders).toEqual([]);
  });

  it("R1b: exactly one statement in the stripped body", () => {
    expect((strip(newMigrationRaw).match(/;/g) ?? []).length).toBe(1);
  });

  it("R1c: the stripped body equals the frozen literal", () => {
    expect(strip(newMigrationRaw)).toBe(
      `alter table public.cartridge_drops add column if not exists ${COL} text;`
    );
  });

  it("R1d: the raw text carries the repo's idempotency note", () => {
    expect(newMigrationRaw.includes("-- Written idempotently.")).toBe(true);
  });

  it("R1e: the filename sorts after 20261021000000_create_deck_template_files.sql", () => {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    expect(files).toContain(path.basename(NEW_MIGRATION_PATH));
    expect(files[files.length - 1] >= "20261021000000_create_deck_template_files.sql").toBe(true);
  });
});

describe("R2e: the column extractor discriminates", () => {
  it("does not extract a name that appears only inside a comment", () => {
    const fixture = "create table if not exists public.widgets (\n  -- ghost_column was removed\n  id text primary key\n);\n";
    const columns = extractCreateTableColumns(fixture, "widgets");
    expect(columns).not.toContain("ghost_column");
    expect(columns).toContain("id");
  });

  it("extracts both columns when two are declared", () => {
    const fixture = "create table if not exists public.widgets (\n  id text primary key,\n  count integer not null default 0\n);\n";
    expect(extractCreateTableColumns(fixture, "widgets")).toEqual(["id", "count"]);
  });
});

// Proven-feasible stub shapes (docs/a40-disclosure-test-notes.md section on
// R2): the write stub echoes back only what the writer sent, plus the
// server-side defaults the migration declares - no hand-written column name.
function makeCapturingClient(): {
  client: SupabaseClient<Database>;
  inserts: Record<string, unknown>[];
  echoedRows: Record<string, unknown>[];
} {
  const inserts: Record<string, unknown>[] = [];
  const echoedRows: Record<string, unknown>[] = [];
  const client = {
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
      }),
    },
    from: () => ({
      insert: (payload: Record<string, unknown>) => {
        inserts.push(payload);
        const echoed = {
          ...payload,
          csv_storage_path: null,
          csv_name: null,
          graded_at: null,
          created_at: "2026-09-27T00:00:00Z",
          updated_at: "2026-09-27T00:00:00Z",
        };
        echoedRows.push(echoed);
        return {
          select: () => ({
            single: async () => ({ data: echoed, error: null }),
          }),
        };
      },
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as SupabaseClient<Database>;
  return { client, inserts, echoedRows };
}

function makeListingClient(row: Record<string, unknown>): SupabaseClient<Database> {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({ data: [row], error: null }),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any as SupabaseClient<Database>;
}

function baseMeta(overrides: Partial<Parameters<typeof saveCartridgeDrop>[3]> = {}) {
  return {
    courseLabel: "CS101",
    assignmentLabel: "HW1",
    pointsPossible: null as number | null,
    rubricText: "RUBRIC ONE",
    lms: "canvas" as const,
    rubricOriginScope: "cartridge:CS101|HW1" as string | null,
    ...overrides,
  };
}

describe("R2: CartridgeDrop carries the origin, the mapper populates it, origin never contradicts presence", () => {
  it("R2a: every key in the captured insert payload is a real migration column", async () => {
    const { client, inserts } = makeCapturingClient();
    const file = new File([new Uint8Array(9)], "hw2.zip");
    await saveCartridgeDrop(client, "u1", file, baseMeta());

    const columns = new Set([
      ...extractCreateTableColumns(baseMigrationSql, "cartridge_drops"),
      ...extractAddColumns(newMigrationRaw),
    ]);
    const missing = Object.keys(inserts[0]).filter((key) => !columns.has(key));
    expect(missing, `insert payload key(s) with no matching migration column: ${missing.join(", ")}`).toEqual([]);
  });

  it("R2b: the payload contains the origin column", async () => {
    const { client, inserts } = makeCapturingClient();
    const file = new File([new Uint8Array(9)], "hw2.zip");
    await saveCartridgeDrop(client, "u1", file, baseMeta());
    expect(Object.keys(inserts[0])).toContain(COL);
  });

  it("R2c: the value the writer sent round-trips to the mapped object", async () => {
    const { client } = makeCapturingClient();
    const file = new File([new Uint8Array(9)], "hw2.zip");
    const drop = await saveCartridgeDrop(client, "u1", file, baseMeta({ rubricOriginScope: "cartridge:CS101|HW1" }));
    expect(drop.rubricOriginScope).toBe("cartridge:CS101|HW1");
  });

  it("R2d: listCartridgeDrops maps it too, from a row whose keys came from the writer", async () => {
    const { client: writeClient, echoedRows } = makeCapturingClient();
    const file = new File([new Uint8Array(9)], "hw2.zip");
    await saveCartridgeDrop(writeClient, "u1", file, baseMeta({ rubricOriginScope: "cartridge:CS101|HW1" }));

    const listClient = makeListingClient(echoedRows[0]);
    const listed = await listCartridgeDrops(listClient, "u1");
    expect(listed[0].rubricOriginScope).toBe("cartridge:CS101|HW1");
  });

  it("R2f: over the captured payload, origin is null OR rubric_text is a non-empty string", async () => {
    const { client, inserts } = makeCapturingClient();
    const file = new File([new Uint8Array(9)], "hw2.zip");
    await saveCartridgeDrop(client, "u1", file, baseMeta({ rubricText: null, rubricOriginScope: null }));
    const payload = inserts[0];
    const ok = payload[COL] === null || (typeof payload.rubric_text === "string" && payload.rubric_text !== "");
    expect(ok).toBe(true);
  });

  it("R2f discriminates: an origin written onto a rubric-less row violates the invariant", async () => {
    const { client, inserts } = makeCapturingClient();
    const file = new File([new Uint8Array(9)], "hw2.zip");
    await saveCartridgeDrop(client, "u1", file, baseMeta({ rubricText: null, rubricOriginScope: "cartridge:CS101|HW1" }));
    const payload = inserts[0];
    const ok = payload[COL] === null || (typeof payload.rubric_text === "string" && payload.rubric_text !== "");
    expect(ok).toBe(false);
  });
});

describe("R3e: the producer executes end to end - decider -> real saveCartridgeDrop -> mapper -> row copy", () => {
  it("C5 end to end: the row names HW1, not HW2 (the attribution requirement)", async () => {
    const { client } = makeCapturingClient();
    const originScope = resolveRubricOriginScope({
      rubricText: "R",
      currentScope: "cartridge:CS101|HW2",
      restored: { rubric: "R", scope: "cartridge:CS101|HW1" },
      sniffedRubric: null,
      archiveName: "hw2.zip",
    });
    const file = new File([new Uint8Array(9)], "hw2.zip");
    const drop = await saveCartridgeDrop(
      client,
      "u1",
      file,
      baseMeta({ assignmentLabel: "HW2", rubricText: "R", rubricOriginScope: originScope })
    );
    const disclosure = describeDropRubricOrigin(drop.rubricOriginScope);
    expect(disclosure.text).toContain("HW1");
    expect(disclosure.text).not.toContain("HW2");
  });

  it("a rubric-less drop, end to end, renders the frozen no-rubric sentence", async () => {
    const { client } = makeCapturingClient();
    const originScope = resolveRubricOriginScope({
      rubricText: null,
      currentScope: "cartridge:CS101|HW2",
      restored: null,
      sniffedRubric: null,
      archiveName: "hw2.zip",
    });
    const file = new File([new Uint8Array(9)], "hw2.zip");
    const drop = await saveCartridgeDrop(
      client,
      "u1",
      file,
      baseMeta({ assignmentLabel: "HW2", rubricText: null, rubricOriginScope: originScope })
    );
    const disclosure = describeDropRubricOrigin(drop.rubricOriginScope);
    expect(disclosure.present).toBe(false);
    expect(disclosure.text).toBe("No rubric was included with this upload.");
  });
});
