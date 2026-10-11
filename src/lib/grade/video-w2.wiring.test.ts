// VIDEO-GRADING W2 wiring pins (source text; no component renders in vitest).
// They pin the FACT and the ORDER, never the spelling: the count charge sits
// between the plan pass and the member reads, the stager reaches extraction
// only through the dark flag, and every typed field has a producer.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("extraction: the count cap is charged from the plan, before any read", () => {
  const src = read("src/lib/grade/extraction.ts");
  it("chargeArchiveLevel < chargeVideoCount < runBounded(leaves", () => {
    const plan = src.indexOf("chargeArchiveLevel(");
    const charge = src.indexOf("chargeVideoCount(");
    const pool = src.indexOf("runBounded(leaves");
    expect(plan).toBeGreaterThan(-1);
    expect(charge).toBeGreaterThan(plan);
    expect(pool).toBeGreaterThan(charge);
  });
  it("extraction stays free of Storage and network imports (the stager is injected)", () => {
    expect(src).not.toMatch(/from "@\/lib\/supabase\/storage"/);
    expect(src).not.toMatch(/\bfetch\(/);
  });
});

describe("the ingest route", () => {
  const src = read("src/app/api/grade-submission-zip/route.ts");
  it("builds the stager only under the dark flag and hands it to extraction", () => {
    expect(src).toMatch(/VIDEO_GRADING_ENABLED\s*\?/);
    expect(src).toMatch(/ingestZipEntries\([\s\S]{0,200}stageVideo/);
  });
  it("binds the .zip extension as well as the segment (O-10) and forwards the ledger counts", () => {
    expect(src).toMatch(/\.zip\$\/i\.test\(storagePath\)/);
    expect(src).toMatch(/buildIngestLines\([^)]*videoOutcomes/);
  });
  it("removes staged videos on every non-success outcome", () => {
    expect((src.match(/await discardStaged\(\)/g) ?? []).length).toBe(3);
  });
});

describe("the loose route and the grade-run-item guard", () => {
  it("the video route validates the path through the shared contract before any Storage dependency runs", () => {
    const prepare = read("src/lib/grade/video-prepare.ts");
    const validate = prepare.indexOf("isVideoUploadPath(");
    const stat = prepare.indexOf("deps.statObjectSize(");
    const head = prepare.indexOf("deps.readHead(");
    expect(validate).toBeGreaterThan(-1);
    expect(stat).toBeGreaterThan(validate);
    expect(head).toBeGreaterThan(stat);
  });
  it("grade-run-item refuses videoRef with rawBase64 and any extra key on a ref", () => {
    const src = read("src/app/api/grade-run-item/route.ts");
    expect(src).toMatch(/value\.videoRef !== undefined/);
    expect(src).toMatch(/value\.rawBase64 !== undefined\) return false/);
    expect(src).toMatch(/keys\.length !== 2/);
  });
});
