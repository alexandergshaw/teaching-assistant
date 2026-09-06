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

const ACTIONS_DIR = path.join(process.cwd(), "src", "app", "actions");
const GUARD_CALL = /\brequire(Owner|User|AppOwner)\s*\(/;

interface ActionExport {
  file: string;
  name: string;
  line: number;
  guarded: boolean;
}

function isUseServerModule(text: string): boolean {
  return /^\s*["']use server["']/m.test(text);
}

/**
 * Collect every `export async function` in every "use server" module under
 * src/app/actions, and whether its body calls a guard. The body is taken as
 * everything up to the next closing brace in column zero, which is exactly
 * how a top-level function ends under this repo's formatting.
 */
function collectActionExports(): ActionExport[] {
  const found: ActionExport[] = [];

  for (const name of fs.readdirSync(ACTIONS_DIR)) {
    if (!name.endsWith(".ts") || name.includes(".test.")) continue;
    const text = fs.readFileSync(path.join(ACTIONS_DIR, name), "utf8");
    if (!isUseServerModule(text)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const match = /^export async function (\w+)/.exec(lines[i]);
      if (!match) continue;
      let end = i + 1;
      while (end < lines.length && lines[end] !== "}") end++;
      found.push({
        file: name,
        name: match[1],
        line: i + 1,
        guarded: GUARD_CALL.test(lines.slice(i, end).join("\n")),
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
