import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { validateDiagnosticEvidence } from "./diagnostic-evidence-check.mjs";

const complete = { inventory: "inventory source", lifecycle: "state coverage", completeness: "paging case", privacy: "boundary", exportRoundTrip: "test command", ownerIsolation: "test command" };
describe("diagnostic evidence check", () => {
  it("runs the CLI and fails for malformed or incomplete evidence", () => {
    const dir = mkdtempSync(join(tmpdir(), "diagnostic-evidence-"));
    try {
      const file = join(dir, "evidence.json");
      const cli = resolve("src/tools/diagnostic-evidence-check.mjs");
      const run = () => spawnSync(process.execPath, [cli, file], { encoding: "utf8" });
      writeFileSync(file, JSON.stringify(complete));
      const valid = run();
      expect(valid.status).toBe(0);
      expect(valid.stdout).toContain("independently verify");
      writeFileSync(file, "{bad json");
      expect(run().status).not.toBe(0);
      writeFileSync(file, JSON.stringify({ ...complete, privacy: "" }));
      const missing = run();
      expect(missing.status).not.toBe(0);
      expect(missing.stderr).toContain("privacy");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it("accepts populated evidence and identifies every absent or blank field", () => {
    expect(validateDiagnosticEvidence(complete)).toEqual([]);
    expect(validateDiagnosticEvidence({ ...complete, lifecycle: " ", privacy: null })).toEqual(["lifecycle", "privacy"]);
    expect(validateDiagnosticEvidence(null)).toHaveLength(6);
  });
});
