import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every `"use server"` export is an UNAUTHENTICATED POST ENDPOINT. Next.js
 * assigns each one an id, ships that id in the client bundle of every route
 * whose tree imports it, and dispatches a matching POST straight to the
 * function. Nothing in the UI is in that path: not a button, not a form, not
 * a client-side check.
 *
 * That makes the request gate the only thing standing in front of an
 * unguarded action - and the gate is NOT a backstop for anything reachable
 * under a public prefix. `/login` is deliberately exempt, and the root layout
 * (src/app/layout.tsx) mounts client components that import from the actions
 * barrel, so their action ids ship in the bundle served to anonymous visitors
 * of the sign-in page.
 *
 * That is not hypothetical. `selectionChatAction` shipped exactly that way:
 * mounted through SelectionChatWidget in the root layout, no guard in its
 * body while all five of its siblings in the same file had one, reachable by
 * an anonymous POST to /login, spending the deployment's LLM budget on
 * attacker-chosen prompts. These tests exist so that cannot recur silently.
 *
 * Two checks, with different jobs:
 *
 *   1. NOTHING REACHABLE FROM THE ROOT LAYOUT IS UNGUARDED. This is the
 *      severity-critical class - anonymous reachability - and it is a hard
 *      assertion with no allowlist.
 *
 *   2. A RATCHET over the rest. The actions that are still unguarded today
 *      are pinned by name. They sit behind the gate, so they are reachable
 *      only by a signed-in account - which is survivable while this app has
 *      exactly one account, and stops being survivable the moment other
 *      people can sign in. The list may only SHRINK. Adding a new unguarded
 *      action fails; fixing one fails until the name is removed here, which
 *      is the nudge to keep the list honest.
 */

// BUG 2(a) FIX: every "use server" module in this app lives somewhere under
// src/app - not necessarily flat inside src/app/actions. The collector used
// to do a single flat `readdirSync` of src/app/actions only, so an action placed in a
// subdirectory (e.g. src/app/actions/admin/*.ts) or colocated with its own
// page (e.g. src/app/account/.../actions.ts) was invisible to
// `collectActionExports()` entirely - which both tests below key off of, so
// such an action would silently escape BOTH the allowlist-free root-layout
// check and the guard-coverage ratchet, exactly the class of bug this file
// exists to prevent. Walking is now recursive, rooted at src/app rather than
// just src/app/actions, so both examples are covered by the same fix.
const APP_DIR = path.join(process.cwd(), "src", "app");
const GUARD_CALL = /\brequire(Owner|User|AppOwner)\s*\(/;
// BUG 2(b): these two are deliberately separate from GUARD_CALL above.
// GUARD_CALL only proves SOME guard was called; an OWNER_ONLY entry needs to
// prove WHICH one - requireAppOwner() is the only one that actually checks
// for the owner. requireOwner() is a bare `return requireUser()` alias (see
// src/lib/supabase/auth.ts) that admits ANY active account, not just the
// owner, so its presence must fail an owner-only check exactly like a bare
// requireUser() would.
const REQUIRE_APP_OWNER_CALL = /\brequireAppOwner\s*\(/;
const BARE_REQUIRE_OWNER_CALL = /\brequireOwner\s*\(/;
const BARE_REQUIRE_USER_CALL = /\brequireUser\s*\(/;

interface ActionExport {
  file: string;
  name: string;
  line: number;
  guarded: boolean;
  // Full source of the export, from its signature line up to (excluding)
  // the closing brace - kept so a caller can check WHICH guard was used
  // (see OWNER_ONLY below), not merely whether one was called at all.
  body: string;
}

function isUseServerModule(text: string): boolean {
  return /^\s*["']use server["']/m.test(text);
}

/**
 * Recursively list every non-test .ts/.tsx file under `dir`. Widened beyond
 * .ts (BUG 2(a)): the `"use server"` directive is a file-level React/Next.js
 * convention, not a `.ts`-specific one - node_modules/next/dist/docs's own
 * `use-server.md` shows the identical file-level form under both a
 * `page.tsx` filename and an `actions.ts` one, so a colocated action sitting
 * in a `.tsx` file (plausible for the next actions this repo adds, colocated
 * with an admin page) cannot be assumed away.
 */
function collectCandidateFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      found.push(...collectCandidateFiles(path.join(dir, entry.name)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!/\.tsx?$/.test(entry.name)) continue;
    if (entry.name.includes(".test.")) continue;
    found.push(path.join(dir, entry.name));
  }
  return found;
}

/**
 * Collect every `export async function` in every "use server" module
 * anywhere under src/app, and whether its body calls a guard. The body is
 * taken as everything up to the next closing brace in column zero, which is
 * exactly how a top-level function ends under this repo's formatting.
 */
function collectActionExports(): ActionExport[] {
  const found: ActionExport[] = [];

  for (const filePath of collectCandidateFiles(APP_DIR)) {
    const text = fs.readFileSync(filePath, "utf8");
    if (!isUseServerModule(text)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const match = /^export async function (\w+)/.exec(lines[i]);
      if (!match) continue;
      let end = i + 1;
      while (end < lines.length && lines[end] !== "}") end++;
      const body = lines.slice(i, end).join("\n");
      found.push({
        file: path.relative(APP_DIR, filePath).replace(/\\/g, "/"),
        name: match[1],
        line: i + 1,
        guarded: GUARD_CALL.test(body),
        body,
      });
    }
  }

  return found;
}

/** Resolve a relative or "@/"-prefixed import specifier to a real file. */
function resolveImport(fromFile: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(process.cwd(), "src", spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null;

  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Walk the module graph from the root layout and collect every identifier
 * imported from the actions barrel along the way. Those are the action ids
 * that end up in the bundle of EVERY route, including the public ones.
 */
function actionsReachableFromRootLayout(): Set<string> {
  const layout = path.join(process.cwd(), "src", "app", "layout.tsx");
  const barrel = path.join(process.cwd(), "src", "app", "actions.ts");
  const seen = new Set<string>();
  const names = new Set<string>();
  const queue = [layout];

  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const text = fs.readFileSync(file, "utf8");
    const importRe = /import\s+(?:type\s+)?(?:([\s\S]*?)\s+from\s+)?["']([^"']+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(text))) {
      const [, clause, spec] = m;
      const target = resolveImport(file, spec);
      if (!target) continue;

      if (target === barrel && clause) {
        const braced = /\{([\s\S]*?)\}/.exec(clause);
        if (braced && !/^\s*import\s+type/.test(m[0])) {
          for (const raw of braced[1].split(",")) {
            const ident = raw.trim().split(/\s+as\s+/)[0].trim();
            if (ident && !/^type\b/.test(ident)) names.add(ident);
          }
        }
      }

      queue.push(target);
    }
  }

  return names;
}

/**
 * Actions that are DELIBERATELY public because they run BEFORE there is an
 * account to authorize. A guard is not merely missing from these - it is
 * impossible: `requireUser()` throws for anyone who is not already an active
 * account, which is exactly who these serve.
 *
 * This list is a different thing from the ratchet below, and conflating the
 * two was a real design error in the first version of this file: a sign-up
 * action would have had to be added to a list documented as "should be
 * guarded, not yet", which would have quietly redefined that list into
 * "unguarded for any reason at all" and destroyed its meaning.
 *
 * The bar for an entry here is high. It must be genuinely pre-authentication,
 * it must not spend an owner-funded resource beyond what the auth provider
 * itself already exposes to anonymous callers, and it must carry a one-line
 * reason. Anything reachable from the ROOT LAYOUT is still forbidden outright
 * - the first test below has no allowlist, because that is the path that
 * reaches the public /login bundle.
 */
const DELIBERATELY_PUBLIC: Record<string, string> = {
  signUpAction:
    "Creates the account a guard would need to authorize; requireUser()/requireAppOwner() both throw for anyone not already active, which is everyone this action serves.",
};

/**
 * Actions that are still unguarded but SHOULD NOT BE, pinned so the set can
 * only shrink. Every one of these is reachable by any signed-in account and
 * most spend the deployment's LLM budget. They are NOT anonymously reachable -
 * the first test below is what proves that.
 */
const PINNED_UNGUARDED = [
  "buildScheduleWeekPlan",
  "fetchUnsplashImageAction",
  "generateCarryModulePatternBody",
  "generateAssignmentAction",
  "generateAssignmentRubricAction",
  "generateCourseFaqAction",
  "generateCourseMaterialsAction",
  "generateCourseProjectAction",
  "generateCourseScheduleAction",
  "generateExamplesAction",
  "generateInstructorNotesAction",
  "generateKnowledgeCheckAction",
  "generateLecturePlanForAssignmentAction",
  "generateLecturePlansAction",
  "generateLectureDeckAction",
  "generateLessonPlanAction",
  "generateModuleIntroAction",
  "generateTestQuestionsAction",
  "generateWeekOpener",
  "generateWeekSignificanceAction",
  "githubConfiguredAction",
  "listAssignmentFoldersAction",
  "askAboutCourseAction",
  "reviseDocumentAction",
  "selectCourseTools",
  "selectRequiredTools",
  "testGeminiAction",
  "unsplashConfiguredAction",
].sort();

/**
 * BUG 2(b): `GUARD_CALL` above (and therefore the ratchet's `guarded`
 * boolean) treats `requireOwner()`, `requireUser()`, and `requireAppOwner()`
 * as interchangeable "some guard was called" evidence. That is correct for
 * the ratchet's own job - keeping the UNGUARDED list from growing - but it
 * cannot express a stronger requirement: an action that must be reachable by
 * the OWNER ONLY (approve/suspend/promote/demote an account, and anything
 * else that changes another account's standing) is not actually protected by
 * `requireOwner()` or a bare `requireUser()` - both admit ANY ACTIVE ACCOUNT,
 * because `requireOwner()` is now a `return requireUser()` alias (see
 * src/lib/supabase/auth.ts). An admin action written with the guard
 * everyone else in this file uses would still show `guarded: true` and pass
 * every test above, while being reachable by any signed-in account rather
 * than only the deployment owner - and lint, tsc, build, and the rest of
 * this suite would all stay green.
 *
 * When the next agent adds them, each export name goes here with a one-line
 * reason, and `checkOwnerOnlyEntry` below then requires that its body calls
 * `requireAppOwner(` and calls neither `requireOwner(` nor a bare
 * `requireUser(`. Do not add requireUser()/requireOwner() as a "temporary"
 * entry to get this list populated - an entry here that isn't actually
 * owner-gated defeats the point of the map.
 *
 * Populated below with the five account-admin actions
 * (src/app/account/people/actions.ts): approve/suspend/restore/promote/demote
 * another account. Each is a thin wrapper that calls requireAppOwner()
 * directly in its own body (not merely through a shared helper - see that
 * file's module comment for why the guard call has to be textually present in
 * each export for this ratchet to see it) before delegating the rest of its
 * work to a shared, unexported pipeline.
 */
const OWNER_ONLY: Record<string, string> = {
  approveAccountAction:
    "Approves a pending account onto the owner's own shared credentials (Canvas, GitHub, voice, avatar); only the owner may grant that access to another account.",
  suspendAccountAction:
    "Bans another account at the auth provider and revokes its stored access; only the owner may revoke another account's standing.",
  restoreAccountAction:
    "Reinstates a suspended account's access; only the owner may reverse a suspension they, or another owner, imposed.",
  promoteAccountAction:
    "Grants another account owner-level control over every account in this workspace, including the acting owner's own; only the owner may grant that.",
  demoteAccountAction:
    "Removes another account's owner-level control over the workspace; only the owner may revoke that standing.",
};

/**
 * Checks one OWNER_ONLY entry against the collected action exports. Pulled
 * out of the `it` block below so the failure path (an entry naming an export
 * that does not exist, or one that relies on the wrong guard) can itself be
 * exercised by a test with a synthetic fixture - see "the OWNER_ONLY check
 * itself..." below - rather than relying on the real, currently-empty map to
 * prove the logic works, which would pass vacuously either way.
 */
function checkOwnerOnlyEntry(
  name: string,
  reason: string,
  byName: ReadonlyMap<string, ActionExport>
): { ok: boolean; message: string } {
  const action = byName.get(name);
  if (!action) {
    return { ok: false, message: `${name} is listed in OWNER_ONLY but is not an action export` };
  }
  if (reason.trim().length <= 10) {
    return { ok: false, message: `${name} needs a stated reason` };
  }
  if (!REQUIRE_APP_OWNER_CALL.test(action.body)) {
    return { ok: false, message: `${name} must call requireAppOwner( directly` };
  }
  if (BARE_REQUIRE_OWNER_CALL.test(action.body)) {
    return {
      ok: false,
      message: `${name} must not rely on requireOwner( - it delegates to requireUser() and would admit any active account, not just the owner`,
    };
  }
  if (BARE_REQUIRE_USER_CALL.test(action.body)) {
    return {
      ok: false,
      message: `${name} must not rely on requireUser( - it would admit any active account, not just the owner`,
    };
  }
  return { ok: true, message: "" };
}

describe("server actions reachable from the root layout", () => {
  it("finds the root-layout action surface at all", () => {
    // If this walk ever returns nothing, the test below passes vacuously and
    // the whole canary is dead. Pin that it actually resolves something.
    expect(actionsReachableFromRootLayout().size).toBeGreaterThan(0);
  });

  it("guards every one of them - they ship in the public /login bundle", () => {
    const reachable = actionsReachableFromRootLayout();
    const byName = new Map(collectActionExports().map((a) => [a.name, a]));

    const unguarded = [...reachable]
      .map((name) => byName.get(name))
      .filter((a): a is ActionExport => Boolean(a) && !a!.guarded)
      .map((a) => `${a.file}:${a.line} ${a.name}`);

    expect(
      unguarded,
      "these actions ship in the bundle of every route, including the gate-exempt /login, " +
        "so an anonymous POST reaches them directly"
    ).toEqual([]);
  });
});

describe("guard coverage ratchet over every other server action", () => {
  it("matches the pinned list exactly - the list may only shrink", () => {
    const unguarded = collectActionExports()
      .filter((a) => !a.guarded)
      .map((a) => a.name)
      .filter((name) => !(name in DELIBERATELY_PUBLIC))
      .sort();

    expect(unguarded).toEqual(PINNED_UNGUARDED);
  });

  it("every deliberately-public action carries a reason, and is really an action", () => {
    // An entry with an empty reason is someone silencing the ratchet.
    const names = new Set(collectActionExports().map((a) => a.name));
    for (const [name, reason] of Object.entries(DELIBERATELY_PUBLIC)) {
      expect(names.has(name), `${name} is listed as public but is not an action export`).toBe(
        true
      );
      expect(reason.trim().length, `${name} needs a stated reason`).toBeGreaterThan(10);
    }
  });

  it("no deliberately-public action is reachable from the root layout", () => {
    // The root-layout test above already forbids this with no allowlist. This
    // asserts the two lists cannot be reconciled by moving a name between
    // them: being "deliberately public" never buys a seat in the /login bundle.
    const reachable = actionsReachableFromRootLayout();
    for (const name of Object.keys(DELIBERATELY_PUBLIC)) {
      expect(reachable.has(name), `${name} must not ship in every route's bundle`).toBe(false);
    }
  });

  it("guards the overwhelming majority, so an exception stays exceptional", () => {
    const all = collectActionExports();
    expect(all.length).toBeGreaterThan(100);
    expect(all.filter((a) => a.guarded).length).toBeGreaterThan(all.length * 0.7);
  });

  it("pins no name that is not actually an action export", () => {
    // A stale entry here would silently absorb a future regression of the
    // same name somewhere else.
    const names = new Set(collectActionExports().map((a) => a.name));
    for (const pinned of PINNED_UNGUARDED) {
      expect(names.has(pinned), `${pinned} is pinned but no longer exists`).toBe(true);
    }
  });
});

describe("owner-only guard ratchet (BUG 2(b))", () => {
  it("every OWNER_ONLY action calls requireAppOwner directly, never requireOwner/requireUser", () => {
    const byName = new Map(collectActionExports().map((a) => [a.name, a]));
    for (const [name, reason] of Object.entries(OWNER_ONLY)) {
      const result = checkOwnerOnlyEntry(name, reason, byName);
      expect(result.ok, result.message).toBe(true);
    }
  });

  it("the OWNER_ONLY check itself fails for a name that is not an action export", () => {
    // Proves the ratchet cannot rot silently: with OWNER_ONLY empty today,
    // the test above passes vacuously and demonstrates nothing about whether
    // checkOwnerOnlyEntry actually catches anything. This exercises it
    // directly against a synthetic, deliberately-invalid entry.
    const byName = new Map(collectActionExports().map((a) => [a.name, a]));
    const result = checkOwnerOnlyEntry(
      "thisActionExportDoesNotExist",
      "a real, long-enough reason",
      byName
    );
    expect(result.ok).toBe(false);
  });

  it("the OWNER_ONLY check itself fails for an action guarded by a bare requireUser()", () => {
    // The exact scenario BUG 2(b) describes: an admin action written with
    // the guard everyone else uses. Synthetic fixture, not a real export -
    // see the test above for why a real one cannot prove this today.
    const byName = new Map<string, ActionExport>([
      [
        "fakeApproveAccountAction",
        {
          file: "actions/fake.ts",
          name: "fakeApproveAccountAction",
          line: 1,
          guarded: true,
          body: "export async function fakeApproveAccountAction() {\n  await requireUser();\n}",
        },
      ],
    ]);
    const result = checkOwnerOnlyEntry(
      "fakeApproveAccountAction",
      "a real, long-enough reason",
      byName
    );
    expect(result.ok).toBe(false);
  });

  it("the OWNER_ONLY check itself fails for an action guarded by the requireOwner() alias", () => {
    // requireOwner() is a bare `return requireUser()` (src/lib/supabase/auth.ts)
    // - it must fail this check exactly like a direct requireUser() call.
    const byName = new Map<string, ActionExport>([
      [
        "fakeSuspendAccountAction",
        {
          file: "actions/fake.ts",
          name: "fakeSuspendAccountAction",
          line: 1,
          guarded: true,
          body: "export async function fakeSuspendAccountAction() {\n  await requireOwner();\n}",
        },
      ],
    ]);
    const result = checkOwnerOnlyEntry(
      "fakeSuspendAccountAction",
      "a real, long-enough reason",
      byName
    );
    expect(result.ok).toBe(false);
  });

  it("the OWNER_ONLY check itself passes for an action guarded by requireAppOwner()", () => {
    const byName = new Map<string, ActionExport>([
      [
        "fakePromoteAccountAction",
        {
          file: "actions/fake.ts",
          name: "fakePromoteAccountAction",
          line: 1,
          guarded: true,
          body: "export async function fakePromoteAccountAction() {\n  await requireAppOwner();\n}",
        },
      ],
    ]);
    const result = checkOwnerOnlyEntry(
      "fakePromoteAccountAction",
      "a real, long-enough reason",
      byName
    );
    expect(result.ok, result.message).toBe(true);
  });
});
