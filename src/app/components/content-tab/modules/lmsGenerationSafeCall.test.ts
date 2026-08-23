import { describe, expect, it } from "vitest";
import { runGenerationCall } from "./lmsGenerationSafeCall";

describe("runGenerationCall", () => {
  it("passes a resolved success value straight through, unchanged", async () => {
    const result = await runGenerationCall(async () => ({ artifact: { id: "a1" } }));
    expect(result).toEqual({ artifact: { id: "a1" } });
  });

  it("passes a resolved {error} value straight through, unchanged", async () => {
    const result = await runGenerationCall(async () => ({ error: "The model returned no script. Try again." }));
    expect(result).toEqual({ error: "The model returned no script. Try again." });
  });

  // THE DEFECT THIS CLOSES. SABOTAGE-CHECKED (reported in this wave's own
  // writeup): calling the raw async function directly instead of through
  // runGenerationCall throws/rejects here rather than resolving to {error} -
  // confirmed by awaiting the un-wrapped call in a try/catch during this
  // wave and observing the rejection.
  it("JOB 2 FIX: a REJECTED call resolves to {error, rejected: true} instead of propagating the rejection", async () => {
    const result = await runGenerationCall(async () => {
      throw new Error("fetch failed");
    });
    expect(result).toEqual({ error: "Could not generate content: fetch failed", rejected: true });
  });

  it("a rejection with a non-Error thrown value still resolves to a usable {error}, never a second throw", async () => {
    const result = await runGenerationCall(async () => {
      return Promise.reject("a plain string rejection");
    });
    expect(result).toEqual({
      error: "Could not generate content - the request failed unexpectedly.",
      rejected: true,
    });
  });

  // The `rejected` marker distinguishes a caught rejection from a normally
  // RESOLVED {error} - a resolved value (even one shaped like {error, ...})
  // must never gain a `rejected` field it did not already have, or a
  // diagnostic record built from it (lmsGenerationDiagRecord.ts) would
  // misreport "the server said no" as "the call never reached the server".
  it("a resolved {error} the wrapped call returns itself never gains a rejected marker", async () => {
    const result = await runGenerationCall(async () => ({ error: "The model returned no script. Try again." }));
    expect(result).not.toHaveProperty("rejected");
  });
});
