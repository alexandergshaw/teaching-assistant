import { afterEach, expect, it, vi } from "vitest";
const run = vi.hoisted(() => vi.fn());
vi.mock("./code-runner-vercel", () => ({ runVercelCode: run }));
import { runSubmittedCode } from "./code-runner";
const files = [{ name: "main.py", extension: "py", previewContent: "import numpy", previewTruncated: false }];
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
function configure() {
  vi.stubEnv("CODE_RUNNER_VERCEL_ENABLED", "true"); vi.stubEnv("VERCEL", "1");
  vi.stubEnv("CODE_RUNNER_PYTHON_SNAPSHOT", "snap_Abc123"); vi.stubEnv("PISTON_API_URL", ""); vi.stubEnv("PISTON_API_KEY", "");
}
it.each(["A valid Python sandbox snapshot ID is required.", "The configured Python sandbox snapshot does not provide the required scientific libraries."])("preserves safe snapshot diagnostic: %s", async (message) => {
  configure(); run.mockRejectedValueOnce(new Error(message));
  expect(await runSubmittedCode(files)).toMatchObject({ error: message, ran: false });
});
it("does not silently bypass the configured snapshot for coordinated execution", async () => {
  configure(); const before = vi.fn();
  const result = await runSubmittedCode(files, undefined, before);
  expect(result?.error).toContain("cannot be used for coordinated execution");
  expect(before).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled();
});
