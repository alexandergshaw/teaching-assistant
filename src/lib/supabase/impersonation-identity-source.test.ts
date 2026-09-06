import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * WHERE AN IMPERSONATED IDENTITY IS ALLOWED TO COME FROM.
 *
 * `runAsOwner(identity, fn)` puts an `OwnerIdentity` into an AsyncLocalStorage
 * store, and everything downstream - `requireUser`, `requireAppOwner`, and now
 * `getEffectiveIdentity` and the Canvas credential resolver - trusts whatever
 * is in that store to say who the request is acting as.
 *
 * `resolveImpersonationIdentity` is the ONLY function that derives one
 * honestly: it re-reads the live `app_users` row and returns null for an
 * account that is not currently active. Everything that is safe about
 * impersonation today rests on every `runAsOwner` caller going through it.
 *
 * BUT THAT IS A FACT ABOUT CURRENT USAGE, NOT A PROPERTY THE TYPES ENFORCE.
 * `runAsOwner` is exported and its parameter is a plain interface, so an
 * object literal typed as `OwnerIdentity` compiles perfectly - including one
 * that says `status: "active"` about an account that was suspended an hour
 * ago. Nothing downstream re-checks: `getEffectiveIdentity` deliberately
 * composes rather than re-implementing the access rule (a second copy of that
 * rule is how the two drift), and the credential resolver gates on ROLE, not
 * status. So a hand-built identity would reach the owner's Canvas credentials.
 *
 * The admin-capability pass flagged that this coverage exists "by accident of
 * composition, not by a stated criterion" and asked for it to be pinned. This
 * file is that pin. It is a source-text ratchet, the same idiom as
 * `action-guard-coverage.test.ts` and `use-server-exports.test.ts`, because
 * the property is about which FUNCTION a value came from - which no type in
 * this codebase can express.
 */

const SRC_ROOT = join(process.cwd(), "src");

/**
 * Every non-test source file that mentions `runAsOwner(`. Collected by walking
 * the tree rather than from a fixed list, so a caller added in a new
 * directory is found rather than silently skipped - the failure mode a
 * hard-coded path list has.
 */
function collectRunAsOwnerCallers(): string[] {
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) {
        continue;
      }
      const body = readFileSync(full, "utf8");
      // The definition and the re-export live in owner-context itself; it is
      // the source of the function, not a caller of it.
      if (full.endsWith(join("supabase", "owner-context.ts"))) {
        continue;
      }
      if (body.includes("runAsOwner(")) {
        found.push(full.slice(SRC_ROOT.length + 1).replace(/\\/g, "/"));
      }
    }
  };

  walk(SRC_ROOT);
  return found.sort();
}

/**
 * The callers as of 2026-09-06, each verified by reading it to obtain its
 * identity from `resolveImpersonationIdentity`.
 *
 * Adding a caller here is a deliberate act: do it in the same change that
 * adds the call site, and only after confirming the identity it passes was
 * derived from a live account check rather than assembled by hand.
 */
const PINNED_CALLERS = [
  "app/api/cron/run-schedules/route.ts",
  "app/api/github/webhook/route.ts",
  "app/api/triggers/[token]/route.ts",
  "lib/workflow-trigger-runner.ts",
].sort();

describe("an impersonated identity may only come from resolveImpersonationIdentity", () => {
  it("has exactly the pinned set of runAsOwner callers", () => {
    // A ratchet, not a formality. A new caller is a new place where the
    // identity could be assembled by hand, so it has to be looked at by a
    // person rather than absorbed silently.
    expect(collectRunAsOwnerCallers()).toEqual(PINNED_CALLERS);
  });

  it("every caller derives its identity from resolveImpersonationIdentity", () => {
    const offenders: string[] = [];

    for (const relative of collectRunAsOwnerCallers()) {
      const body = readFileSync(join(SRC_ROOT, relative), "utf8");
      if (!body.includes("resolveImpersonationIdentity(")) {
        offenders.push(relative);
      }
    }

    expect(
      offenders,
      `these call runAsOwner without ever calling resolveImpersonationIdentity, so the ` +
        `identity they impersonate was not checked against a live account:\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("nobody builds an OwnerIdentity literal outside owner-context", () => {
    // The shape that would defeat everything above: an object literal with a
    // hard-coded `status: "active"`. Only owner-context may produce one, and
    // there it is produced from a freshly read row.
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        if (full.endsWith(join("supabase", "owner-context.ts"))) continue;

        const body = readFileSync(full, "utf8");
        // A type annotation naming OwnerIdentity on something being built,
        // rather than merely imported as a type for a parameter.
        if (/:\s*OwnerIdentity\s*=\s*\{/.test(body)) {
          offenders.push(full.slice(SRC_ROOT.length + 1).replace(/\\/g, "/"));
        }
      }
    };

    walk(SRC_ROOT);

    expect(
      offenders,
      `these assemble an OwnerIdentity by hand instead of deriving one from a live ` +
        `account check:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});
