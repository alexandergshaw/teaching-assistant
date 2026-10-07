// Exact-key-set canary for the grading-chat directory (ruling B1). The
// top-level component key canary scans src/app/components/ NON-recursively, so
// it never sees this subdirectory; a key added here would otherwise ship with
// no canary bumped. The scan is over RAW source (comments included), so any
// other ta- spelling in a non-test file in this directory joins the set: refer
// to shared keys by description, never by literal.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const DIR = join(process.cwd(), "src/app/components/grading-chat");

const EXPECTED: readonly string[] = [
  "ta-grading-chat-harshness",
  "ta-grading-chat-input-mode",
  "ta-grading-chat-instructions",
  "ta-grading-chat-rubric",
  "ta-grading-chat-rubric-memory",
];

function collectTaKeys(source: string): string[] {
  const found = new Set<string>();
  const re = /(?<![a-zA-Z0-9_])ta-[a-z0-9-]*[a-z0-9]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) found.add(m[0]);
  return [...found].sort();
}

function nonTestFiles(): string[] {
  return readdirSync(DIR).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && statSync(join(DIR, f)).isFile(),
  );
}

const files = nonTestFiles();
const source = files.map((f) => readFileSync(join(DIR, f), "utf8")).join("\n");
const keys = collectTaKeys(source);
const SORTED_EXPECTED = [...EXPECTED].sort();

describe("grading-chat ta- key canary", () => {
  it("scans a real population of files", () => {
    expect(files.length).toBeGreaterThan(3);
  });

  it("finds at least one key", () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it("the key set equals the frozen list", () => {
    expect(keys).toEqual(SORTED_EXPECTED);
  });

  it("a newly added quoted key breaks the set", () => {
    expect(collectTaKeys(source + '\nconst x = "ta-new-canary-field";\n')).not.toEqual(SORTED_EXPECTED);
  });

  it("a newly added template-literal key breaks the set", () => {
    expect(collectTaKeys(source + "\nconst y = `ta-new-template-${id}`;\n")).not.toEqual(SORTED_EXPECTED);
  });

  it("removing an existing key literal breaks the set", () => {
    const removed = source.split("ta-grading-chat-input-mode").join("REMOVED");
    expect(collectTaKeys(removed)).not.toEqual(SORTED_EXPECTED);
  });
});
