/**
 * TESTS MUST NOT REACH THE NETWORK.
 *
 * vitest.config.ts already states the principle - "Tests must be hermetic" -
 * and enforced it only for Supabase config. This closes the other half.
 *
 * WHY IT MATTERS MORE THAN SPEED OR FLAKINESS. During the canvasFetch
 * transport migration, a sabotage check STAYED GREEN for the wrong reason: the
 * sabotage reverted a call to the platform `fetch`, which escaped a mock
 * installed on `canvasFetch`, made a REAL request to the institution's live
 * Canvas host, and got back a 401 whose error message was identical to the one
 * the test expected. The test could not tell a correct implementation from a
 * broken one plus a working internet connection.
 *
 * That is a false-green mechanism, and an especially bad one: it defeats the
 * single technique this project relies on to prove a test can fail. A test
 * suite that can silently reach the network has an oracle nobody declared.
 *
 * It also means the suite sends unsolicited requests to a real institution's
 * Canvas whenever someone runs it, which is its own reason not to.
 *
 * HOW THIS BEHAVES. `fetch` is replaced with a stub that throws, naming the URL
 * and pointing at the fix. A test that legitimately exercises a fetch path
 * installs its own mock (`vi.stubGlobal("fetch", ...)`, `vi.spyOn`) exactly as
 * before and never sees this - the stub only fires for a call nobody intended.
 *
 * WHAT THIS DOES NOT COVER, stated so it is not mistaken for total: `canvasFetch`
 * dials through `node:https` rather than `fetch`, so a test that mocks neither
 * could still reach the network through that path. Blocking it needs a module
 * mock rather than a global, which is a larger change; this closes the hole that
 * was actually observed.
 */

const blocked = ((input: unknown) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : ((input as { url?: string })?.url ?? "an unknown URL");

  throw new Error(
    `A test tried to make a real network request to ${url}.\n\n` +
      "Tests here are hermetic (see vitest.config.ts). Mock the transport this " +
      "code path uses - canvasFetch for Canvas calls, or globalThis.fetch via " +
      "vi.stubGlobal for anything else.\n\n" +
      "If you are seeing this during a SABOTAGE check, that is the point: the " +
      "sabotage moved the call onto an unmocked transport, and without this it " +
      "would have hit the real host and possibly passed for the wrong reason."
  );
}) as unknown as typeof fetch;

globalThis.fetch = blocked;
