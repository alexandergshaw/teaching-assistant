import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { walkRuntimeGraph } from "@/lib/module-graph/runtime-import-graph";

// L15: this file walks a real directory tree / reads many real files.
// vitest's 5000ms default testTimeout treats that as slow-but-fine when
// run alone, and as a false timeout under concurrent `npm test` load from
// sibling agents (measured: the slowest single top-level it() here runs
// well under 1s alone). Raised to the repo's existing slow-test
// convention of 30_000, already used by canvas-client-boundary.
// transitive.test.ts and runtime-import-graph.test.ts - this changes
// nothing about what any test asserts.
vi.setConfig({ testTimeout: 30_000 });

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
// R2 wave 0 (docs/r2-scope.md section 3): srcRoot for the walkRuntimeGraph
// closure check below - the tool's own WalkOptions shape, not this file's
// APP_DIR (which is one level deeper, src/app).
const SRC_ROOT = path.join(process.cwd(), "src");
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

/**
 * R2 wave 0 (docs/r2-scope.md section 3, RULING 80): recomputes the
 * GitHub-PAT cohort by walking the REAL import graph from every "use server"
 * module under src/app, instead of trusting a static file list. A specifier-
 * string filter is exactly what missed the exposure this row exists to
 * close - `src/lib/grade/repo-content.ts`'s RELATIVE import of `../github`
 * was invisible to a filter that only matched `@/lib/github`-prefixed or
 * canvas-named specifiers. `walkRuntimeGraph`
 * (src/lib/module-graph/runtime-import-graph.ts) already does a real,
 * TypeScript-compiler-parsed closure walk - built for a different wall
 * (client-bundle vs server-only, docs/a23-architecture.md) but the walk
 * itself is exactly "can file X reach module Y transitively," which is this
 * question with a different forbidden target. No new walker is written here,
 * per Ruling 80's own instruction to look for one before writing one.
 *
 * `treatUseServerAsWall: false` is deliberate, not a default left alone: the
 * tool's "use server" wall exists to stop a walk from a CLIENT entry point at
 * the RPC boundary; here the walk starts FROM a server action file and must
 * be allowed to follow that very file's own edges, or it would find nothing
 * for any root.
 *
 * This is what makes GITHUB_FILES a FLOOR rather than a trusted final list
 * (R2-r9's own rule, restated in docs/r2-scope.md section 7): a file added
 * later whose own module graph starts reaching `lib/github.repos.ts` is
 * caught here the moment it exists, before anyone remembers to add it to the
 * enumeration by hand - see "GITHUB_FILES tracks the live closure" below.
 */
function githubReachingActionFiles(): Set<string> {
  const reaching = new Set<string>();
  for (const filePath of collectCandidateFiles(APP_DIR)) {
    const text = fs.readFileSync(filePath, "utf8");
    if (!isUseServerModule(text)) continue;
    const result = walkRuntimeGraph([filePath], {
      srcRoot: SRC_ROOT,
      forbiddenPathPrefixes: ["lib/github.repos.ts"],
      browserSafeModules: [],
      forbiddenBareSpecifiers: [],
      allowedBareSpecifiers: [],
      allowedAssetExtensions: [],
      treatUseServerAsWall: false,
    });
    if (result.violations.length > 0) {
      reaching.add(path.relative(APP_DIR, filePath).replace(/\\/g, "/"));
    }
  }
  return reaching;
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

  // Media cohort (R3, splitting R2): reclassified from the deprecated
  // requireOwner() alias. These reach an owner-private identity - HeyGen's
  // single configured avatar (media-avatar.ts) or a Tavus-trained likeness
  // that is owner-gated by design (media-likeness.ts's own header comment,
  // AC5.3) - not merely a shared billing key. The rest of the media cohort
  // (media.ts, media-voice.ts) reaches only per-user data or a shared LLM/TTS
  // key without an owner-private identity behind it, so those 27 call sites
  // were reclassified to requireUser() instead and are NOT listed here - see
  // "media actions are owner-only" below for what proves that split holds.
  avatarConfiguredAction:
    "Reports whether HEYGEN_AVATAR_ID/HEYGEN_API_KEY are set; that avatar id is the owner's own face, configured once for the whole deployment.",
  generateAvatarVideoAction:
    "Renders a HeyGen video using the owner's single configured avatar id and voice; only the owner may spend their own likeness this way.",
  getAvatarVideoStatusAction:
    "Polls a HeyGen render job against the owner's single HEYGEN_API_KEY; part of the same owner-only avatar feature as generateAvatarVideoAction.",
  avatarStudioConfiguredAction:
    "Reports whether Avatar Studio (Tavus) is configured; every action in this file is owner-gated by design (media-likeness.ts header, AC5.3).",
  listAvatarLikenessesAction:
    "Lists trained Tavus likenesses; Avatar Studio trains and renders the owner's own likeness only (AC5.3).",
  startAvatarTrainingAction:
    "Starts training a new Tavus face from the owner's own sample recording, spending a paid Tavus training slot (AC5.3).",
  refreshAvatarLikenessAction:
    "Polls and can retire the owner's Tavus likeness rows, including provider-side deletion; owner-only by the same AC5.3 design.",
  setDefaultAvatarLikenessAction:
    "Changes which trained likeness renders as the owner's default avatar; owner-only by the same AC5.3 design.",
  deleteAvatarLikenessAction:
    "Deletes the owner's trained likeness, local row and provider-side face alike; owner-only by the same AC5.3 design.",
  sampleInUseAction:
    "Reads whether the owner's training sample is still in use by a Tavus job; owner-only by the same AC5.3 design.",
  generateAvatarScriptAction:
    "Writes a script for the owner's Avatar Studio video, spending the shared LLM key on the owner's likeness feature (AC5.3).",
  listAvatarCourseOptionsAction:
    "Lists courses for the Avatar Studio course picker, a control surface scoped to the same owner-only feature (AC5.3).",
  startAvatarVideoAction:
    "Starts rendering a video against the owner's default Tavus likeness; owner-only by the same AC5.3 design.",
  refreshAvatarVideoAction:
    "Polls and downloads the owner's rendered Tavus video server-side; owner-only by the same AC5.3 design.",
};

/**
 * The 14 media OWNER_ONLY entries above, kept as its own list (rather than
 * filtering OWNER_ONLY by file) so the closure test below is pinned to
 * exactly the R3 cohort and cannot silently start passing vacuously if an
 * unrelated future OWNER_ONLY entry is added or removed.
 */
const MEDIA_OWNER_ONLY_ACTIONS = [
  "avatarConfiguredAction",
  "generateAvatarVideoAction",
  "getAvatarVideoStatusAction",
  "avatarStudioConfiguredAction",
  "listAvatarLikenessesAction",
  "startAvatarTrainingAction",
  "refreshAvatarLikenessAction",
  "setDefaultAvatarLikenessAction",
  "deleteAvatarLikenessAction",
  "sampleInUseAction",
  "generateAvatarScriptAction",
  "listAvatarCourseOptionsAction",
  "startAvatarVideoAction",
  "refreshAvatarVideoAction",
];

/** The four R3 media files, keyed the same way ActionExport.file is - relative
 * to APP_DIR (src/app), forward slashes. */
const MEDIA_FILES = new Set([
  "actions/media.ts",
  "actions/media-voice.ts",
  "actions/media-avatar.ts",
  "actions/media-likeness.ts",
]);

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

/**
 * R3 (splitting R2): the media cohort. requireOwner() is a bare
 * `return requireUser()` alias (src/lib/supabase/auth.ts) - any active
 * account passes - so its four remaining `@deprecated` call sites in this
 * cohort (media.ts, media-voice.ts, media-avatar.ts, media-likeness.ts) were
 * migrated to the correct one of requireUser()/requireAppOwner() rather than
 * left on the alias. Only the HeyGen avatar (media-avatar.ts, the owner's
 * single configured face) and Tavus Avatar Studio (media-likeness.ts,
 * owner-gated by its own header comment, AC5.3) reach an owner-private
 * identity and became requireAppOwner(); media.ts and media-voice.ts reach
 * only per-user data or a shared LLM/TTS key with no owner-private identity
 * behind it and became requireUser() instead - see the comment above
 * MEDIA_OWNER_ONLY_ACTIONS for the classification.
 */
describe("media actions are owner-only", () => {
  it("every media OWNER_ONLY action calls requireAppOwner directly, never requireOwner/requireUser", () => {
    const byName = new Map(collectActionExports().map((a) => [a.name, a]));
    expect(MEDIA_OWNER_ONLY_ACTIONS.length).toBe(14);
    for (const name of MEDIA_OWNER_ONLY_ACTIONS) {
      const reason = OWNER_ONLY[name];
      expect(reason, `${name} must be listed in OWNER_ONLY`).toBeTruthy();
      const result = checkOwnerOnlyEntry(name, reason, byName);
      expect(result.ok, result.message).toBe(true);
    }
  });

  it("no action in the four R3 media files still relies on requireOwner() or a bare requireUser() where requireAppOwner() is owed", () => {
    // Belt-and-braces on top of the per-name check above: scans by FILE, so an
    // owner-only action added to one of these four files later and left off
    // MEDIA_OWNER_ONLY_ACTIONS would still be caught if it reverted to the
    // deprecated alias - it just would not yet be proven to need
    // requireAppOwner() specifically (that judgment call is per-name, not
    // per-file, per the R3 brief's "classify each call site" rule).
    const inMediaFiles = collectActionExports().filter((a) => MEDIA_FILES.has(a.file));
    expect(inMediaFiles.length).toBeGreaterThanOrEqual(41);
    const stillOnAlias = inMediaFiles
      .filter((a) => BARE_REQUIRE_OWNER_CALL.test(a.body))
      .map((a) => `${a.file}:${a.line} ${a.name}`);
    expect(
      stillOnAlias,
      "these media actions still call the deprecated requireOwner() alias instead of requireUser()/requireAppOwner()"
    ).toEqual([]);
  });

  it("no media action outside MEDIA_OWNER_ONLY_ACTIONS calls requireAppOwner (would silently widen the owner-only set)", () => {
    const byName = new Map(collectActionExports().map((a) => [a.name, a]));
    const mediaOwnerOnly = new Set(MEDIA_OWNER_ONLY_ACTIONS);
    const inMediaFiles = collectActionExports().filter((a) => MEDIA_FILES.has(a.file));
    const unexpectedlyOwnerOnly = inMediaFiles
      .filter((a) => !mediaOwnerOnly.has(a.name) && REQUIRE_APP_OWNER_CALL.test(a.body))
      .map((a) => `${a.file}:${a.line} ${a.name}`);
    expect(
      unexpectedlyOwnerOnly,
      "an action outside MEDIA_OWNER_ONLY_ACTIONS now calls requireAppOwner() - add it to that list with a reason, or use requireUser() instead"
    ).toEqual([]);
    for (const name of byName.keys()) {
      if (mediaOwnerOnly.has(name)) continue;
      const action = byName.get(name)!;
      if (!MEDIA_FILES.has(action.file)) continue;
      expect(
        BARE_REQUIRE_USER_CALL.test(action.body),
        `${action.file}:${action.line} ${name} should call requireUser() directly, having been classified as not owner-only`
      ).toBe(true);
    }
  });
});

/**
 * R2 wave 0 (docs/r2-scope.md, RULINGS 80/83/84): the instrument that will
 * police the requireOwner() call-site reclassification, landed BEFORE any
 * of the 255 GitHub-cohort call sites moves off the deprecated alias
 * (docs/r2-scope.md section 7, "lands red-then-green so the instrument is
 * proven before it is trusted" - restored from the prior draft after the
 * check (docs/r2-check.md, B5.1) found a version of this document that
 * dropped it).
 *
 * THE POLARITY (RULING 83), stated once so nobody re-derives it wrong: the
 * media block above (MEDIA_OWNER_ONLY_ACTIONS) defaults its cohort to
 * PERMISSIVE and lists the RESTRICTIVE exceptions, because media's resource
 * is shared and non-owner-private - permissive is safe there. The owner's
 * GitHub personal access token is the opposite kind of resource: a single-
 * owner secret, where permissive IS the harm. A block modelled line-for-line
 * on the media block (defaulting the cohort to requireUser(), listing
 * restrictive exceptions) would therefore PIN THE EXPOSURE GREEN - exactly
 * the defect docs/r2-check.md's Ruling 83 finding is about. This block is
 * the CONVERSE: the cohort defaults to requireAppOwner(), and
 * GITHUB_NOT_OWNER_ONLY lists the PERMISSIVE exceptions - each one an action
 * a per-action review has already proven safe on requireUser(). It starts
 * empty, because no per-action review has run yet; that is wave 1-3's job,
 * not this wave's.
 *
 * WHAT THIS INSTRUMENT IS, STATED HONESTLY (RULING 81, correcting a checked
 * draft's own "EXECUTES the guard-name check" - that was a verb dressing up
 * a grep): every assertion below is a regex over source text
 * (BARE_REQUIRE_USER_CALL / REQUIRE_APP_OWNER_CALL against `action.body`,
 * itself a text slice from `collectActionExports()`), except the closure
 * membership check, which is a real TypeScript-parsed import-graph walk
 * (`githubReachingActionFiles()`) but still never RUNS anything - no guard
 * executes, no Supabase client is mocked, no authorization decision is
 * exercised. That is a legitimate COVERAGE NET - cheap, and it is exactly
 * what would have caught the media cohort's four leftover alias sites - but
 * it cannot see a correctly-NAMED guard sitting on the WRONG resource, only
 * a wrongly-named one. The instrument that catches THAT is the repo's real
 * executing idiom, `src/lib/supabase/auth.test.ts:432-493`
 * (`requireAppOwner()` mocked and actually invoked against an `active`
 * non-owner, asserted to reject) - a per-action test in that shape belongs
 * to wave 1-3, written the same day each call site's guard actually changes,
 * which is out of this wave's write set (no guard call site moves here).
 *
 * WHAT A MECHANICAL RENAME DOES NOT SATISFY: a global find-replace of every
 * `requireOwner(` call in the 41 GITHUB_FILES to `requireUser(` is textually
 * different and behaviourally IDENTICAL (both admit any active account, not
 * just the owner) - it would satisfy a check that only asserts "no
 * `requireOwner` remains in src", and would satisfy nothing else this file
 * already had (BUG 2(b)'s GUARD_CALL treats all three names as equivalent
 * "some guard" evidence). It does NOT satisfy "no action in a GITHUB_FILES
 * module calls requireUser() directly unless reviewed safe" below, because
 * that check does not care what a call USED to say, only what it calls NOW -
 * see the "mechanical rename" sabotage in the wave-0 report for the verbatim
 * red this produces.
 */

// R2 wave 0: the 41 production files whose module graph closure-reaches
// `lib/github.repos.ts` (docs/r2-scope.md section 3 - 255 requireOwner()
// call sites today, reproduced in this checkout: `grep -c "await
// requireOwner()" <these 41 files> | awk -F: '{s+=$2} END {print s}'` -> 255).
// Keyed the same way ActionExport.file is - relative to APP_DIR (src/app),
// forward slashes. This is a FLOOR, not the trusted final set - see
// githubReachingActionFiles() and the "tracks the live closure" test below,
// which recomputes membership from the real import graph on every run and
// fails the moment a file this list does not know about starts reaching the
// same target (R2-r9's rule: an enumeration is a floor, never the set).
const GITHUB_FILES = new Set([
  "actions/accommodations.ts",
  "actions/automation-runs.ts",
  "actions/canvas-inbox.ts",
  "actions/canvas-modules.ts",
  "actions/carry-module-pattern.ts",
  "actions/castletop.ts",
  "actions/command-interface.ts",
  "actions/course-calendar.ts",
  "actions/course-hub-core.ts",
  "actions/course-hub-integrations.ts",
  "actions/course-intel.ts",
  "actions/course-project.ts",
  "actions/current-events-assignments.ts",
  "actions/github-content.ts",
  "actions/github-repos.ts",
  "actions/github-student-repos.ts",
  "actions/github.ts",
  "actions/grading-inbox.ts",
  "actions/grading.ts",
  "actions/institutions.ts",
  "actions/live-class.ts",
  "actions/llm-tools.ts",
  "actions/lms-generation-refine.ts",
  "actions/lms-generation.ts",
  "actions/lms-syllabus-buttons.ts",
  "actions/messaging-outlook.ts",
  "actions/messaging.ts",
  "actions/repo-grades.ts",
  "actions/selection-chat-context.ts",
  "actions/submission-repo.ts",
  "actions/syllabus-templates.ts",
  "actions/syllabus-upload.ts",
  "actions/visualizer-coverage.ts",
  "actions/visualizer-selection.ts",
  "actions/visualizer.ts",
  "actions/weekly-announcement-drafting.ts",
  "api/automations/run-now/route.ts",
  "api/lms-export/selection/route.ts",
  "api/lms-generation/deck-from-capture/route.ts",
  "api/lms-generation/deck/route.ts",
  "api/visualizer/create/route.ts",
]);

// R2 wave 0 (RULING 83): the PERMISSIVE exceptions inside an otherwise
// owner-only cohort - the mirror image of MEDIA_OWNER_ONLY_ACTIONS above,
// which lists the RESTRICTIVE exceptions inside an otherwise-permissive
// cohort. Starts empty: populated only as wave 1-3's per-action review
// proves a specific GITHUB_FILES action's own body never reaches the
// GitHub-spending chain, each entry carrying a one-line stated reason.
const GITHUB_NOT_OWNER_ONLY: Record<string, string> = {};

// WAVE-0 FINDING, not an R2-scoped classification (see the "tracks the live
// closure" test below for the full account): docs/r2-scope.md derived its
// 81-file/41-file/255-call cohort from `grep -rlE "await requireOwner\(\)"`,
// which is blind to a file that already stopped calling the alias. Walking
// EVERY "use server" file's own closure (not just those 81) finds these 4
// ALSO reaching lib/github.repos.ts, entirely outside R2's stated universe:
//   - actions/deck-source.ts: 2 actions call requireUser() directly today
//     (already migrated off the alias per its own P14 comment) and reach
//     GitHub - UNREVIEWED under RULING 83's rule, same shape as R2's own
//     exposure, just never counted by R2's census.
//   - actions/walkthrough-announcement.ts: 7 actions, same shape - its own
//     header comment ("every action below calls requireUser() explicitly,
//     never requireOwner()") shows the migration happened without the
//     GitHub-reachability question ever being asked.
//   - actions/media-likeness.ts: already requireAppOwner() on every action
//     (the R3 media wave) - safe today, just absent from the enumeration.
//   - actions/llm-content.ts: no guard call at all on any export - a
//     PINNED_UNGUARDED matter (already tracked above by name), not a wrong-
//     guard matter; still closure-reaches GitHub, so still named here rather
//     than left for a reader to rediscover.
// SHRINK-ONLY: this is not a safety classification (unlike
// GITHUB_NOT_OWNER_ONLY) - it is a record of "known, not yet folded into a
// per-action review." A name leaves this list only when GITHUB_FILES or
// GITHUB_NOT_OWNER_ONLY takes it over for real; nothing may be added without
// deliberately widening this comment to say why.
const GITHUB_FILES_PENDING_ENUMERATION = new Set([
  "actions/deck-source.ts",
  "actions/llm-content.ts",
  "actions/media-likeness.ts",
  "actions/walkthrough-announcement.ts",
]);

describe("R2 wave 0: GitHub-PAT cohort defaults to owner-only (RULING 83)", () => {
  it("GITHUB_NOT_OWNER_ONLY starts empty - no per-action review has run yet", () => {
    // Pinned on the EXCEPTION list, never on an owner-only set enumerating
    // the 255 call sites (RULING 84): asserting "every GITHUB_FILES action
    // IS owner-only" would be false and would lock out most of the app - the
    // closure only proves the FILE's graph contains owner-private code, not
    // that every export in it calls it.
    expect(Object.keys(GITHUB_NOT_OWNER_ONLY).length).toBe(0);
  });

  it("every GITHUB_NOT_OWNER_ONLY entry names a real action export with a stated reason", () => {
    const byName = new Map(collectActionExports().map((a) => [a.name, a]));
    for (const [name, reason] of Object.entries(GITHUB_NOT_OWNER_ONLY)) {
      expect(byName.has(name), `${name} is listed in GITHUB_NOT_OWNER_ONLY but is not an action export`).toBe(true);
      expect(reason.trim().length, `${name} needs a stated reason`).toBeGreaterThan(10);
    }
  });

  it("no action in a GITHUB_FILES module calls requireUser() directly unless reviewed safe", () => {
    const notOwnerOnly = new Set(Object.keys(GITHUB_NOT_OWNER_ONLY));
    const violations = collectActionExports()
      .filter((a) => GITHUB_FILES.has(a.file))
      .filter((a) => BARE_REQUIRE_USER_CALL.test(a.body) && !notOwnerOnly.has(a.name))
      .map((a) => `${a.file}:${a.line} ${a.name}`);
    expect(
      violations,
      "these GitHub-cohort actions call requireUser() directly without a per-action review listing them in " +
        "GITHUB_NOT_OWNER_ONLY - default posture for this cohort is requireAppOwner() (RULING 83); either switch " +
        "to requireAppOwner() or add a reviewed GITHUB_NOT_OWNER_ONLY entry with a stated reason"
    ).toEqual([]);
  });

  it("GITHUB_FILES tracks the live import-graph closure - a floor, not a trusted final list (RULING 80/84)", () => {
    // WAVE-0 FINDING (reported alongside this instrument, not fixed by it -
    // out of this wave's write set): running the live closure over EVERY
    // "use server" file under src/app, not just the 81 that still call
    // `requireOwner()`, finds 4 files docs/r2-scope.md's own census could
    // not see, because that census was `grep -rlE "await requireOwner\(\)"`
    // - a filter that is blind to a file that ALREADY moved off the alias.
    // Two of the four (deck-source.ts, walkthrough-announcement.ts) call
    // requireUser() directly today and closure-reach lib/github.repos.ts -
    // under RULING 83's own rule, applied consistently, that is an
    // UNREVIEWED, PERMISSIVE guard on a GitHub-PAT-reaching action, the same
    // shape of exposure R2 exists to close, just outside R2's own stated
    // 81-file/408-call universe. This is named here, exactly, rather than
    // silently folded into GITHUB_FILES (which would claim it was reviewed
    // under R2's wave 1-3 plan, and it was not) or silently dropped (which
    // would hide it). GITHUB_FILES_PENDING_ENUMERATION below is a SHRINK-ONLY
    // list of exactly these names - not a safety classification like
    // GITHUB_NOT_OWNER_ONLY, a record of "known, not yet reviewed."  A fifth
    // file joining this set, or any of DECK_SOURCE_AND_WALKTHROUGH's actions
    // changing shape, still fails loud below; only removing a name (once it
    // is properly folded into GITHUB_FILES or GITHUB_NOT_OWNER_ONLY by a
    // real per-action review) shrinks it.
    const detected = githubReachingActionFiles();
    const missingFromEnumeration = [...detected].filter((f) => !GITHUB_FILES.has(f)).sort();
    expect(
      missingFromEnumeration,
      "the live closure found a DIFFERENT set of not-yet-enumerated files than GITHUB_FILES_PENDING_ENUMERATION " +
        "expects - update the pending list deliberately (it must only shrink) rather than pins failing silently"
    ).toEqual([...GITHUB_FILES_PENDING_ENUMERATION].sort());
  });
});
