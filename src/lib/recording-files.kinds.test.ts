// TDD - written from the AC BEFORE implementation (avatar-likeness work item).
//
// Why this file exists: of the places recording_files.kind is duplicated, the
// DB CHECK constraint is caught by NOTHING. tsc cannot see SQL and vitest never
// touches Postgres. Without this test the failure mode is: the user records a
// two-minute take, uploads ~200 MB to storage, and the row insert is rejected by
// recording_files_kind_check with a raw Postgres error - in production only.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MIGRATIONS = path.resolve(process.cwd(), "supabase/migrations");

const EXPECTED_KINDS = ["recording", "captioned", "narrated", "bundle", "file", "sample", "avatar"];

/** The newest migration that (re)defines recording_files_kind_check. */
function newestKindMigration(): { file: string; sql: string } {
  const files = fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const hits = files.filter((f) =>
    fs.readFileSync(path.join(MIGRATIONS, f), "utf-8").includes("recording_files_kind_check")
  );
  const file = hits[hits.length - 1];
  return { file, sql: fs.readFileSync(path.join(MIGRATIONS, file), "utf-8") };
}

describe("recording_files.kind CHECK constraint", () => {
  it("allows every kind the application can write", () => {
    const { sql, file } = newestKindMigration();
    for (const kind of EXPECTED_KINDS) {
      expect(sql, `${file} must allow '${kind}'`).toContain(`'${kind}'`);
    }
  });

  it("is widened with the established drop-and-recreate pattern", () => {
    const { sql } = newestKindMigration();
    // Every migration in this repo is idempotent - CI re-runs `supabase db push`
    // and a non-idempotent constraint change fails the deploy on replay.
    expect(sql).toContain("drop constraint if exists");
    expect(sql).toContain("add constraint");
  });

  it("sorts AFTER every already-applied migration", () => {
    // The repo's migration version is a monotonic COUNTER, not a real date -
    // the newest is 20260921000000 while commits are dated 2026-08. A migration
    // versioned with today's date would sort BEFORE four applied migrations and
    // `supabase db push` rejects out-of-order local files, breaking the deploy.
    const { file } = newestKindMigration();
    const version = file.split("_")[0];
    expect(version > "20260921000000", `${file} must sort after 20260921000000`).toBe(true);
  });
});

describe("the kind union stays in step across its TypeScript copies", () => {
  const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf-8");

  // A comment can mention a kind word without the type actually allowing it -
  // strip comments first so this test can only be satisfied by real code.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  // Matches the literal-union SHAPE that follows a `kind:` field - e.g.
  // `kind: "recording" | "captioned" | ...` - not a mere reference like
  // `kind: meta.kind,` or `kind: row.kind,`. Targeted at the two known
  // declaration sites instead of counting bare word occurrences across the
  // whole file.
  const KIND_UNION_PATTERN = /kind:\s*("[a-z]+"(?:\s*\|\s*"[a-z]+")*)/g;

  it("src/lib/recording-files.ts declares every kind, in BOTH of its unions", () => {
    // RecordingFile.kind and the inline meta.kind param of saveRecordingFile are
    // two separate literal unions in one file - easy to update only one and
    // leave the other stale. Counting occurrences of the word across the whole
    // file (comments included) would also pass if one union were deleted
    // outright and the kind merely mentioned twice in prose; matching the
    // union shape at exactly the two known sites rules that out.
    const clean = stripComments(read("src/lib/recording-files.ts"));
    const unions = [...clean.matchAll(KIND_UNION_PATTERN)].map((m) => m[1]);

    expect(
      unions.length,
      "expected exactly two kind literal unions in recording-files.ts (the RecordingFile interface field and saveRecordingFile's meta.kind param) - a different count means one was deleted, merged away, or a new one appeared"
    ).toBe(2);

    const [interfaceUnion, metaUnion] = unions;
    for (const kind of EXPECTED_KINDS) {
      expect(interfaceUnion, `RecordingFile.kind must allow "${kind}"`).toContain(`"${kind}"`);
      expect(metaUnion, `saveRecordingFile's meta.kind param must allow "${kind}"`).toContain(`"${kind}"`);
    }
  });

  it("the generated Supabase row types declare every kind", () => {
    const src = read("src/lib/supabase/types.tables-b.ts");
    for (const kind of EXPECTED_KINDS) {
      expect(src, `types.tables-b.ts must know '${kind}'`).toContain(`"${kind}"`);
    }
  });
});
