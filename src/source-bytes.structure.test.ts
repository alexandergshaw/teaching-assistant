import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * SOURCE FILES MUST STAY TEXT.
 *
 * THE BUG THIS EXISTS TO STOP, which has now shipped twice. A composite map
 * key wants an separator that cannot occur in either half, and NUL is the
 * obvious choice: `${name}\x00${index}`. Written as the two-character escape
 * that is fine. Written as a LITERAL 0x00 byte - which is what happens when a
 * tool materialises the escape while writing the file - the string still has
 * exactly the same runtime value, so every gate in this repo passes.
 *
 * Then the file is not text any more, and that is the damage:
 *
 *   - git classifies it as binary, so diffs and reviews show nothing.
 *   - grep and ripgrep SKIP it silently. This repo leans on source-text tests
 *     because vitest here is node-env and renders no component, so a file that
 *     greps as binary quietly drops out of its own wiring tests, out of the
 *     emoji scan, and out of every search anyone runs while working on it.
 *
 * The second failure is the one that matters. A file can pass tsc, eslint,
 * vitest and the build while being invisible to the checks that are supposed
 * to read it, and nothing anywhere reports that.
 *
 * REGRESSION.md records the first occurrence as item 10 (repoGradesFolderSelection.ts).
 * That entry did not prevent the second, and the entry itself contained a raw
 * NUL - which is why `grep -a` had become "required" on REGRESSION.md. A note
 * describing a byte-level hazard cannot catch it; only a byte-level check can.
 *
 * THE FIX WHEN THIS FAILS is never to delete the separator. Write it as an
 * escape - "\x00", "\u0000" - which produces a byte-identical string and
 * leaves the file readable by every tool.
 */

const ROOT = process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", ".next", ".claude", "coverage", "dist", ".vercel"]);
const TEXT_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".md", ".json", ".sql", ".yml", ".yaml"];

/** TAB, LF and CR are the only control characters legitimately in source. */
const ALLOWED_CONTROL = new Set([9, 10, 13]);
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

function collect(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, found);
      continue;
    }
    if (TEXT_EXTENSIONS.some((ext) => entry.endsWith(ext))) found.push(full);
  }
  return found;
}

const FILES = collect(ROOT);

/** Byte offset -> the line it sits on, so a failure points somewhere useful
 * rather than just naming a file. */
function lineOf(bytes: Buffer, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (bytes[i] === 10) line += 1;
  return line;
}

describe("every source file is readable as text", () => {
  it("finds a realistic number of files, so this cannot pass over nothing", () => {
    // Without this the whole suite is vacuous the moment collect() breaks or a
    // path assumption changes - it would report zero violations across zero
    // files and read exactly like success.
    expect(FILES.length).toBeGreaterThan(500);
  });

  it("contains no NUL or other stray control bytes", () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const bytes = readFileSync(file);
      for (let i = 0; i < bytes.length; i += 1) {
        const byte = bytes[i];
        if (byte < 32 && !ALLOWED_CONTROL.has(byte)) {
          const hex = byte.toString(16).padStart(2, "0");
          offenders.push(
            `${file.slice(ROOT.length + 1)}:${lineOf(bytes, i)} has a literal 0x${hex} byte`
          );
          break;
        }
      }
    }
    expect(
      offenders,
      "A literal control byte makes the file binary to git, grep and ripgrep - " +
        "so it silently drops out of source-text tests and the emoji scan while " +
        "every other gate stays green. Write it as an escape instead (\"\x00\", " +
        "\"\u0000\"): the string value is identical and the file stays text.\n" +
        offenders.join("\n")
    ).toEqual([]);
  });

  it("carries no UTF-8 BOM", () => {
    // PowerShell's Set-Content and Out-File add one by default, so this arrives
    // whenever a file is written from the shell rather than by an editor. A BOM
    // in a commit message becomes a visible U+FEFF in the subject line; in a
    // .ts file it defeats exact source-text matches anchored at the file start.
    const offenders = FILES.filter((file) => readFileSync(file).subarray(0, 3).equals(BOM)).map((file) =>
      file.slice(ROOT.length + 1)
    );
    expect(
      offenders,
      "Written with a UTF-8 BOM. Use [IO.File]::WriteAllText, or Out-File with " +
        "an explicit BOM-less encoding.\n" + offenders.join("\n")
    ).toEqual([]);
  });
});
