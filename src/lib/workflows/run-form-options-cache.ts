// Cross-mount cache for the workflow run form's option lists: course-hub
// tiles (+ the repos/canvasUrl carried on each), deck/assignment/test/
// class-session templates, the LMS course list, and GitHub orgs - everything
// useWorkflowOptions.ts loads for RunFormFields' pickers.
//
// WHY THIS EXISTS: useWorkflowOptions keeps each list in its own useState,
// seeded to null, and only fetches when a "needs this list" effect sees
// null. That already avoids re-fetching on every render WHILE mounted - but
// the component that owns this hook (WorkflowsTab) sits behind two nested
// `{condition && <Component/>}` guards (page.tsx's `activeTab ===
// "workflows"` and WorkflowsPanel.tsx's `workflowsView === "workflows"`), so
// leaving the Workflows tab - to check Drafts, Automations, or any other
// top-level tab - and coming back fully UNMOUNTS the subtree. Every one of
// those useState calls resets to null on remount, and up to seven
// independent server actions (hub courses, four template kinds, the LMS
// course list, GitHub orgs) fire again from a cold start - each repeating
// its own auth check, and two of them (LMS courses, orgs) making a live
// Canvas/GitHub API call. None of that data changes from one tab visit to
// the next in the same sitting, but the pickers pay the full round trip
// again every time. That's what makes them "slow to load" on reopen.
//
// WHAT THIS MODULE DOES: a plain module-scope Map, keyed by caller-chosen
// string, that survives a remount (but NOT a full page reload - a fresh
// page load always starts cold, same as before this existed). Deliberately
// kept out of useWorkflowOptions.ts itself: this project's lint config
// (react-hooks/globals) flags module-level variable mutation reachable from
// a component/hook's render body, and the established workaround elsewhere
// in this codebase (useCoursesData.ts's "hubCache") routes every mutation
// through a setState updater to dodge that. Putting the mutable Map in a
// module with no component or hook in it sidesteps the question entirely -
// useWorkflowOptions.ts only ever calls the plain functions below, never
// touches a module-level binding itself.
//
// INVALIDATION - an unbounded cache that never invalidates is a bug, not a
// fix, so every entry here is bounded one of two ways:
//  - hubCourses has a real signal: useWorkflowRun.ts calls the hook's
//    setHubCourses(null) after every run finishes, because a run can change
//    a course's linked repos (e.g. Course Build's codebase step). Whatever
//    reads that signal must bust this module's cache entry too, or a
//    remount before the next real fetch completes would seed straight back
//    from the stale entry that reset was meant to clear - see
//    useWorkflowOptions.ts's setHubCoursesWithCache.
//  - every entry (hubCourses included) additionally expires after
//    DEFAULT_TTL_MS. Nothing outside this hook can tell it "a template was
//    added" or "a course was created from the Courses tab" - those flows
//    live in other hooks (useCoursesData.ts's own separate hubCache, the
//    template editors) that this hook has no reach into, and wiring that up
//    would mean touching files outside this assignment's scope. The TTL is
//    the honest trade-off: it bounds how long a change made elsewhere can
//    stay invisible in the run form's pickers to a known, short window,
//    while still eliminating the actual reported symptom (repeatedly
//    reopening the run form / switching tabs within one sitting). A full
//    page reload always sees fresh data regardless of TTL, since this Map
//    does not survive one.

/** How long a cached list is trusted before a getCachedList() call treats it
 *  as a miss. Two minutes comfortably covers "switched tabs and came right
 *  back" without leaving a change made elsewhere invisible for long. */
export const DEFAULT_TTL_MS = 2 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  cachedAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

// OWNERSHIP - this Map is module-scope, so it survives a client-side route
// change, and this app's sign-out (TopBar.tsx's handleSignOut) is exactly
// that: `supabase.auth.signOut()` followed by `router.refresh()` +
// `router.push("/login")`, both client-side Next navigations. Neither tears
// down the JS module registry, so without an explicit owner check, user A's
// cached course tiles / LMS course names / GitHub orgs / template names
// would still be sitting in this Map - and still within DEFAULT_TTL_MS -
// when user B signs in in the same tab and opens the run form. That is a
// cross-user data leak, not a cosmetic bug.
//
// currentOwner tracks whose data is currently in the Map (a user id, or null
// for "nobody signed in"). setCacheOwner is the single chokepoint every
// caller uses to declare who that should be; it clears the whole Map
// whenever the declared owner actually changes, which uniformly covers
// sign-out (owner -> null), sign-in (null -> owner), and a direct user
// switch (owner A -> owner B) without having to separately enumerate every
// navigation path that can cause one of those. Calling it again with the
// SAME id (e.g. every SupabaseProvider re-render/auth-event with no actual
// user change) must stay a no-op: clearing on every call would throw away
// the whole point of this module - a same-user remount hitting the cache
// instead of re-fetching.
//
// REJECTED ALTERNATIVE: fold the user id into every cache key instead of
// clearing on owner change (e.g. `workflowOptions:hubCourses:${userId}`).
// That also makes a stale entry unreachable rather than deleting it, which
// avoids this chokepoint entirely. It was rejected because the entries then
// accumulate forever across however many users sign into one browser/tab
// over the tab's lifetime - this Map already has no eviction beyond TTL and
// per-key overwrite, so an ever-growing set of per-user key families is a
// slow memory leak of its own, and it still leaves old users' data resident
// in memory (just unreachable by the current owner) rather than actually
// discarding it, which is a weaker privacy story for data that must not
// outlive its owner's session. An explicit clear-on-owner-change is also one
// property to verify ("wrong owner in -> map is empty") instead of "every
// current and future cache key includes the user id", which is easy to miss
// the next time a key is added.
let currentOwner: string | null = null;

/** Unconditionally clears every cached entry, regardless of key - including
 *  every per-institution lmsCourseOptions entry, since those are just more
 *  keys in the same Map. Exported directly (not only reachable through
 *  setCacheOwner) so it has its own direct test coverage. */
export function clearAllCachedLists(): void {
  cache.clear();
}

/**
 * Declares who the cache currently belongs to. When `userId` differs from
 * the previously recorded owner, every cached entry is discarded before the
 * new owner is recorded, so nothing set under the old owner (including
 * "nobody" / null, i.e. data cached before sign-in) can be read back after
 * the switch. Calling this again with the SAME id is a deliberate cheap
 * no-op - it neither clears nor otherwise touches the Map - because
 * SupabaseProvider calls this from every auth-state event, and most of
 * those (e.g. a token refresh) do not change who is signed in.
 */
export function setCacheOwner(userId: string | null): void {
  if (userId === currentOwner) return;
  clearAllCachedLists();
  currentOwner = userId;
}

/**
 * True when something cached at `cachedAt` is still within `ttlMs` of `now`.
 * No default for `now` - kept pure and deterministic so staleness math is
 * unit-testable without depending on (or faking) the system clock.
 */
export function isFresh(cachedAt: number, ttlMs: number, now: number): boolean {
  return now - cachedAt < ttlMs;
}

/**
 * Reads the cached value for `key`, or null when nothing is cached or the
 * entry is older than `ttlMs`. A stale hit is left in the map rather than
 * deleted - it's harmless, and the next setCachedList for the same key
 * overwrites it anyway.
 */
export function getCachedList<T>(key: string, ttlMs: number = DEFAULT_TTL_MS, now: number = Date.now()): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (!isFresh(entry.cachedAt, ttlMs, now)) return null;
  return entry.value as T;
}

/** Records `value` as the freshest known data for `key`. */
export function setCachedList<T>(key: string, value: T, now: number = Date.now()): void {
  cache.set(key, { value, cachedAt: now });
}

/** Forces the next getCachedList(key) call to miss, regardless of TTL. */
export function invalidateCachedList(key: string): void {
  cache.delete(key);
}

// Stable cache keys for each list useWorkflowOptions loads. Plain constants
// for the ones that aren't parameterized; lmsCourseOptions is keyed per
// institution since listCoursesAction(activeInstitution) returns a different
// list per institution and switching institutions must never read back
// another institution's cached courses.
export const HUB_COURSES_CACHE_KEY = "workflowOptions:hubCourses";
export const DECK_TEMPLATES_CACHE_KEY = "workflowOptions:deckTemplates";
export const ASSIGNMENT_TEMPLATES_CACHE_KEY = "workflowOptions:assignmentTemplates";
export const TEST_TEMPLATES_CACHE_KEY = "workflowOptions:testTemplates";
export const CLASS_SESSION_TEMPLATES_CACHE_KEY = "workflowOptions:classSessionTemplates";
export const ORGS_CACHE_KEY = "workflowOptions:orgs";

/** Cache key for the LMS course list of one institution. Trims first so
 *  " ABC " and "ABC" share a cache entry, matching how activeInstitution is
 *  otherwise compared/used verbatim as an id elsewhere in this hook. */
export function lmsCourseOptionsCacheKey(institution: string): string {
  return `workflowOptions:lmsCourseOptions:${institution.trim()}`;
}
