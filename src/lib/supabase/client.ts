import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

/**
 * BUG (rival model): this client passed no `global.fetch` at all, so a
 * degraded Supabase instance left a browser call - a sign-up, a login, a
 * write on any of the client-rendered screens this client backs - hanging
 * with no timeout, no error, and no way for the UI to tell whether the
 * write landed. `src/lib/supabase/proxy.ts` already bounds its OWN Supabase
 * calls the same way (see that file's `boundedFetch`/`PROFILE_LOOKUP_TIMEOUT_MS`);
 * this gives the browser client the same treatment, in the same shape, via
 * `@supabase/ssr`'s `global.fetch` option.
 *
 * 18 SECONDS, NOT THE GATE'S 5: the gate's 5s bounds a request FROM ONE
 * FIRST-PARTY SERVER TO ANOTHER, inside the platform's own infrastructure,
 * on the request path of every page load - a slow answer there has to be cut
 * off quickly because it holds up the whole app. This client runs in an
 * arbitrary visitor's BROWSER, over whatever network they happen to be on -
 * hotel wifi, a train, a flaky mobile connection - where round-trip latency
 * and TLS/DNS setup alone can legitimately eat several seconds before the
 * actual request even starts. 18s is short enough that a truly hung request
 * still resolves to a visible error well within the range a person will
 * wait on a submit button before assuming the app is broken, and long
 * enough that it will not fire on a slow-but-working connection that a 5s
 * (server-to-server) bound would have no trouble with.
 */
const BROWSER_FETCH_TIMEOUT_MS = 18_000;

/**
 * See PROFILE_LOOKUP_TIMEOUT_MS's own comment in ./proxy.ts for how this was
 * verified, empirically, against the installed @supabase/auth-js (2.106.2)
 * rather than assumed: an aborted fetch here surfaces to the caller as an
 * `AuthRetryableFetchError`, not as a raw abort. `AbortSignal.timeout()`
 * rejects the underlying fetch with a `DOMException` named "TimeoutError"
 * (distinct from the "AbortError" a manually-triggered
 * `AbortController.abort()` produces), but that distinction never reaches
 * this app's own code: auth-js's `_handleRequest`
 * (`@supabase/auth-js/dist/main/lib/fetch.js`) wraps every call to the
 * fetcher it is given in a try/catch that converts ANY exception the
 * fetcher throws - by catching it outright, before ever inspecting its name
 * or shape - into an `AuthRetryableFetchError`. Every `supabase-js` call this
 * browser client makes (`auth.signUp`, `auth.signInWithPassword`, a table
 * write, and so on) therefore returns a timeout as the ordinary `error` half
 * of its `{ data, error }` result - ordinary, ALREADY-RETRYABLE-typed error
 * handling on the caller's part is what surfaces it, not a thrown exception
 * or an unhandled rejection.
 */
const boundedFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, signal: AbortSignal.timeout(BROWSER_FETCH_TIMEOUT_MS) });

/**
 * Supabase client for use in Client Components ("use client").
 * Safe to call multiple times — the underlying client is internally cached.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: boundedFetch,
      },
    }
  );
}
