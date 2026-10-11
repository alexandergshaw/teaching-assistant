// WORKFLOWREF-DOTSEGMENT: the workflowRef PATH sink in dispatchWorkflow must
// reject a bare dot-segment (after trim) with the WORKFLOW message, and must
// not false-reject legitimate ids / file names. Mocks the global fetch (never
// the github client) so the real URL dispatchWorkflow builds is what is
// asserted; pathnames are read via new URL() because not.toContain("..") is
// green on the bug (the parser has already collapsed the segment). Harness
// duplicated from github.refs.sweep.ref-traversal.test.ts (no cross-test-file
// imports).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchWorkflow } from "./github.actions";
import { encodeWorkflowSegment } from "./github-ref-name";

const INVALID_WORKFLOW = "That is not a valid workflow id or file name.";
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("GITHUB_TOKEN", "t");
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function thrownMessage(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

describe("Instrument A: encodeWorkflowSegment matrix", () => {
  const REJECT: string[] = [".", "..", " .. ", "  .  "];
  for (const raw of REJECT) {
    it(`rejects ${JSON.stringify(raw)} with the workflow message`, () => {
      let message: string | null = null;
      try {
        encodeWorkflowSegment(raw);
      } catch (err) {
        message = err instanceof Error ? err.message : String(err);
      }
      expect(message).toBe(INVALID_WORKFLOW);
    });
  }

  const ACCEPT: Array<[string, string]> = [
    ["ci.yml", "ci.yml"],
    ["123", "123"],
    ["deploy-prod.yml", "deploy-prod.yml"],
    ["tests.yaml", "tests.yaml"],
    ["my-workflow_2.yml", "my-workflow_2.yml"],
    ["  ci.yml  ", "ci.yml"],
    ["a b.yml", "a%20b.yml"],
  ];
  for (const [raw, expected] of ACCEPT) {
    it(`accepts ${JSON.stringify(raw)}`, () => {
      expect(encodeWorkflowSegment(raw)).toBe(expected);
    });
  }
});

describe("Instrument B: dispatchWorkflow rejects before any fetch", () => {
  for (const d of ["..", ".", " .. "]) {
    it(`throws and never fetches for ${JSON.stringify(d)}`, async () => {
      const message = await thrownMessage(() => dispatchWorkflow("o", "r", d, "main"));
      expect(message).toBe(INVALID_WORKFLOW);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

describe("Instrument C: frozen raw-danger oracle", () => {
  const FROZEN: Array<{ ref: string; bad: string; intended: string }> = [
    {
      ref: "..",
      bad: "/repos/o/r/actions/dispatches",
      intended: "/repos/o/r/actions/workflows/../dispatches",
    },
    {
      ref: ".",
      bad: "/repos/o/r/actions/workflows/dispatches",
      intended: "/repos/o/r/actions/workflows/./dispatches",
    },
  ];
  for (const row of FROZEN) {
    it(`unguarded interpolation of ${JSON.stringify(row.ref)} collapses the path`, () => {
      const pathname = new URL(
        "https://api.github.com/repos/o/r/actions/workflows/" + encodeURIComponent(row.ref) + "/dispatches"
      ).pathname;
      expect(pathname).toBe(row.bad);
      expect(pathname).not.toBe(row.intended);
    });
  }
});

describe("Instrument D: dispatchWorkflow accepts valid ids", () => {
  const CASES: Array<[string, string]> = [
    ["ci.yml", "/repos/o/r/actions/workflows/ci.yml/dispatches"],
    ["123", "/repos/o/r/actions/workflows/123/dispatches"],
    ["deploy-prod.yml", "/repos/o/r/actions/workflows/deploy-prod.yml/dispatches"],
    ["a b.yml", "/repos/o/r/actions/workflows/a%20b.yml/dispatches"],
  ];
  for (const [ref, expectedPath] of CASES) {
    it(`sends ${JSON.stringify(ref)} to ${expectedPath}`, async () => {
      await dispatchWorkflow("o", "r", ref, "main");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(expectedPath);
    });
  }
});
