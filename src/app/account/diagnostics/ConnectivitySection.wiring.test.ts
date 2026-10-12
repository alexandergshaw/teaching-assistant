import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Source-text wiring (no component is ever rendered by any test here): proves
// the page mounts the section, the section calls the owner-only action and
// records a diagnostics-surface entry, and the action keeps its guard first.
const DIR = path.join(process.cwd(), "src", "app", "account", "diagnostics");
const read = (name: string): string => fs.readFileSync(path.join(DIR, name), "utf8");

describe("connectivity probe wiring", () => {
  it("page.tsx imports and renders ConnectivitySection", () => {
    const page = read("page.tsx");
    expect(page).toMatch(/import ConnectivitySection from "\.\/ConnectivitySection"/);
    expect(page).toMatch(/<ConnectivitySection\s*\/>/);
  });

  it("the section calls the action and records a diagnostics entry", () => {
    const section = read("ConnectivitySection.tsx");
    expect(section).toMatch(/probeLmsConnectivityAction\(/);
    expect(section).toMatch(/recordSessionDiagnosticEntry\(/);
    expect(section).toMatch(/surface:\s*"diagnostics"/);
    expect(section).toMatch(/operation:\s*"probe_lms_connectivity"/);
  });

  it("the section probes one institution per call (a loop, not a batch)", () => {
    const section = read("ConnectivitySection.tsx");
    expect(section).toMatch(/for \(const code of institutions\)/);
    expect(section).toMatch(/await probeOne\(code\)/);
  });

  it("the action keeps requireAppOwner as its first statement and takes a code only", () => {
    const action = read("connectivity-actions.ts");
    const start = action.indexOf("export async function probeLmsConnectivityAction");
    const afterBrace = action.slice(action.indexOf("{", start) + 1).trimStart();
    expect(afterBrace.startsWith("try {")).toBe(true);
    expect(afterBrace.slice(0, 80)).toMatch(/await requireAppOwner\(\)/);
    expect(action.slice(start)).not.toMatch(/requireUser\(|requireOwner\(/);
    expect(action).toMatch(/\^\[A-Z\]\[A-Z0-9\]\{0,31\}\$/);
  });
});
