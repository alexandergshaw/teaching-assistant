import type { TestSummary } from "@/app/actions-types";
import { listRunArtifacts, downloadArtifactZip } from "@/lib/github";

// Sum the suite counters out of one JUnit XML document (prefers a top-level
// <testsuites> aggregate to avoid double-counting nested suites).
function parseJUnit(xml: string): TestSummary | null {
  const num = (tag: string, attr: string): number => Number(tag.match(new RegExp(`\\b${attr}="(\\d+)"`))?.[1] ?? 0);
  const aggregate = xml.match(/<testsuites\b[^>]*>/)?.[0];
  let tests = 0;
  let failures = 0;
  let errors = 0;
  let skipped = 0;
  if (aggregate && /\btests="/.test(aggregate)) {
    tests = num(aggregate, "tests");
    failures = num(aggregate, "failures");
    errors = num(aggregate, "errors");
    skipped = num(aggregate, "skipped");
  } else {
    const suites = xml.match(/<testsuite\b[^>]*>/g);
    if (!suites) return null;
    for (const s of suites) {
      tests += num(s, "tests");
      failures += num(s, "failures");
      errors += num(s, "errors");
      skipped += num(s, "skipped") + num(s, "disabled");
    }
  }
  if (tests === 0 && failures === 0 && errors === 0) return null;
  return { tests, failures, errors, skipped, passed: Math.max(0, tests - failures - errors - skipped) };
}

// Find a JUnit artifact on a completed run, unzip it, and sum its counts.
export async function fetchJUnitSummary(owner: string, repo: string, runId: number): Promise<TestSummary | null> {
  const artifacts = await listRunArtifacts(owner, repo, runId);
  if (artifacts.length === 0) return null;
  const chosen = artifacts.find((a) => /test|result|junit|report/i.test(a.name)) ?? artifacts[0];
  const buffer = await downloadArtifactZip(owner, repo, chosen.id);
  const JSZipMod = (await import("jszip")).default;
  const zip = await JSZipMod.loadAsync(buffer);
  const xmlPaths: string[] = [];
  zip.forEach((path, entry) => {
    if (!entry.dir && /\.xml$/i.test(path)) xmlPaths.push(path);
  });
  let combined: TestSummary | null = null;
  for (const path of xmlPaths) {
    const xml = await zip.file(path)?.async("string");
    const summary = xml ? parseJUnit(xml) : null;
    if (!summary) continue;
    combined = combined
      ? {
          tests: combined.tests + summary.tests,
          failures: combined.failures + summary.failures,
          errors: combined.errors + summary.errors,
          skipped: combined.skipped + summary.skipped,
          passed: combined.passed + summary.passed,
        }
      : summary;
  }
  return combined;
}

// A test workflow per language/runtime: runs the tests and uploads a JUnit
// report as the "test-results" artifact, triggerable via the UI (workflow_dispatch).
export function testWorkflowYaml(template: string, customCommand: string): string {
  const head = "name: Tests\non:\n  workflow_dispatch:\n  push:\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n";
  const upload = (path: string) =>
    `      - uses: actions/upload-artifact@v4\n        if: always()\n        with:\n          name: test-results\n          path: ${path}\n          if-no-files-found: ignore\n`;
  if (template === "python") {
    return (
      head +
      "      - uses: actions/setup-python@v5\n        with:\n          python-version: '3.x'\n" +
      "      - run: pip install -r requirements.txt || true\n" +
      "      - run: pip install pytest\n" +
      "      - run: pytest --junitxml=test-results/results.xml\n" +
      upload("test-results/")
    );
  }
  if (template === "node") {
    return (
      head +
      "      - uses: actions/setup-node@v4\n        with:\n          node-version: '20'\n" +
      "      - run: npm ci || npm install\n" +
      "      - run: npm test\n" +
      upload("'**/junit*.xml'")
    );
  }
  if (template === "java") {
    return (
      head +
      "      - uses: actions/setup-java@v4\n        with:\n          distribution: temurin\n          java-version: '17'\n" +
      "      - run: mvn -B test\n" +
      upload("'**/surefire-reports/*.xml'")
    );
  }
  // custom command
  const cmd = customCommand.trim() || "echo 'set a test command'";
  return head + `      - run: ${cmd}\n` + upload("'**/*.xml'");
}
