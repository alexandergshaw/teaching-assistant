// Erases the browser-side state a signed-out user leaves behind, so the next
// person to sign in in the SAME TAB never inherits it. See TopBar.tsx's
// handleSignOut and run-form-options-cache.ts's setCacheOwner for the two
// halves of this story: setCacheOwner already tears down the in-memory
// module-scope caches (course tiles, LMS course lists, GitHub orgs, parsed
// cartridges, knowledge-base selections...) on every owner change, but
// nothing before this module touched localStorage or IndexedDB at all -
// those survive a client-side sign-out completely untouched.
//
// THE DESIGN IS A KEEP-LIST, NOT A PREFIX SCAN, and preserving that is the
// entire point of this file (see client-state-sweep.test.ts's own header for
// the full story). An earlier version of the acceptance criteria said "sweep
// the `ta-`, `ta:` and `ta_` namespaces" - implemented literally, that ships
// exactly the leak it exists to prevent: a whole family of course-planning
// screens writes plain, unprefixed keys (`adapt_instructorName`,
// `adapt_courseName`, `schedule_scheduleTerm`, ...), two of which are the
// PREVIOUS USER'S OWN NAME AND EMAIL ADDRESS. A prefix scan walks straight
// past every one of them and hands them to the next person who signs in.
//
// So the rule is inverted: erase everything, and name the small set that is
// allowed to survive. A key nobody has thought about yet - written by code
// that does not exist today - is erased by default, which is safe, rather
// than kept by default, which leaks. The cost of that safety is real: a
// genuine per-device preference (not tied to who is signed in) has to be
// added to DEVICE_PREFERENCE_KEYS on purpose, or it gets wiped out on every
// sign-in/sign-out along with everything else. That is the trade being
// bought here, not an oversight - see `ta-theme` below for the one key that
// has actually earned a spot.

/**
 * localStorage keys that hold a DEVICE preference rather than anything tied
 * to the signed-in user, and must therefore survive a sign-out/sign-in
 * sweep. Keep this list short and defend every entry - see
 * client-state-sweep.test.ts's "the keep-list is small and justified" block,
 * which enforces both the size cap and that no entry merely LOOKS like a
 * device preference while actually smelling of user data.
 *
 * `ta-theme` is the one entry today: src/app/layout.tsx's anti-FOUC
 * bootstrap script reads it synchronously, before React (or this module)
 * ever runs, to paint `data-theme` on `<html>` without a flash. Sweeping it
 * on every sign-in/sign-out would flash the app back to light mode for a
 * split second on every auth transition, for no privacy benefit - a color
 * scheme preference is not another person's data.
 */
export const DEVICE_PREFERENCE_KEYS: readonly string[] = ["ta-theme"];

/**
 * The key recording WHO this browser last swept for, so an ordinary page
 * refresh can be told apart from a real change of owner.
 *
 * THE BUG THIS EXISTS TO FIX, because it is not obvious from either side.
 * setCacheOwner sweeps whenever the declared owner differs from the one it
 * has in memory - and it holds that in a MODULE-LEVEL variable, which a page
 * load resets to null. So for an already-signed-in user (the common case, as
 * SupabaseProvider's own comment notes) EVERY REFRESH looked like a fresh
 * sign-in and swept the whole of localStorage. Every persisted control in the
 * app silently reset on reload - registered institutions, course selections,
 * every ta- key - against a standing project rule that they must persist.
 *
 * It holds a HASH of the user id, never the id. The marker only has to answer
 * "is this the same person as last time", which equality of hashes does, and
 * storing the id itself would leave identity residue in a browser after that
 * person walks away - the exact class of thing this module's own header says
 * the sweep exists to remove.
 *
 * It has to survive the sweep or it would erase its own marker and the next
 * refresh would sweep again, which is why it is kept here rather than being
 * ordinary state.
 */
export const SWEEP_OWNER_MARKER_KEY = "ta-sweep-owner";

/** Non-cryptographic, dependency-free, and only ever compared for equality -
 * this is an identity check, not a security boundary. Mirrors fnv1aHash in
 * lms-generation/generation-diag.ts rather than importing it, so this module
 * keeps its no-imports property. */
function hashOwnerId(userId: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i += 1) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** The marker value for a user id, or null for "nobody signed in". */
export function ownerMarkerFor(userId: string | null): string | null {
  return userId === null || userId === "" ? null : hashOwnerId(userId);
}

/** What this browser last swept for. null when unknown, unreadable, or
 * nobody - all three mean "cannot prove this is the same user", and every
 * caller must treat them the same way: sweep. Failing open here would be a
 * cross-user leak. */
export function readSweepOwnerMarker(): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(SWEEP_OWNER_MARKER_KEY);
    return raw === null || raw.trim() === "" ? null : raw.trim();
  } catch {
    return null;
  }
}

/** Records who was just swept for. Passing null clears it, which is what
 * sign-out wants: the next sign-in, by anyone, must sweep. */
export function writeSweepOwnerMarker(marker: string | null): void {
  try {
    if (typeof localStorage === "undefined") return;
    if (marker === null) localStorage.removeItem(SWEEP_OWNER_MARKER_KEY);
    else localStorage.setItem(SWEEP_OWNER_MARKER_KEY, marker);
  } catch {
    // Storage unavailable. The marker is an optimisation against a spurious
    // sweep, never a correctness requirement - without it the old behaviour
    // returns, which is over-sweeping rather than under-sweeping.
  }
}

/**
 * IndexedDB database names that must be deleted outright on a sweep, rather
 * than filtered key-by-key the way localStorage is. Both hold data with the
 * same shape of privacy problem localStorage's unprefixed keys do:
 *
 *  - "ta-backup" (src/lib/backup-dir.ts) stores a GRANTED
 *    FileSystemDirectoryHandle to a folder on the previous user's machine.
 *    Left in place, the next signed-in user's recordings would be written
 *    straight into that folder with no picker and no prompt.
 *  - "teaching-assistant-files" (src/lib/file-persistence.ts) stores raw
 *    uploaded File blobs, which can be arbitrarily sensitive coursework.
 *
 * A whole-database delete is the right granularity here (as opposed to
 * localStorage's per-key keep-list): unlike localStorage, nothing in either
 * database is a device preference - every record in both is user data.
 */
export const INDEXED_DB_NAMES: ReadonlySet<string> = new Set(["ta-backup", "teaching-assistant-files"]);

/**
 * Whether `key` is allowed to survive a sweep. Total over its input - a
 * non-string `key` (as can arrive if something upstream ever iterated a
 * non-localStorage source, or under a hostile/mocked global) is erased, not
 * kept, matching the "unknown means erase" posture the module comment above
 * describes. Matches DEVICE_PREFERENCE_KEYS by EXACT string equality only:
 * this is deliberately not a prefix or substring test, so a hypothetical
 * future key like "ta-theme-extra" cannot accidentally inherit ta-theme's
 * exemption just by sharing its prefix.
 */
export function shouldKeepLocalStorageKey(key: unknown): boolean {
  if (typeof key !== "string") return false;
  // The sweep must not delete the record of what it swept for - see
  // SWEEP_OWNER_MARKER_KEY. Kept separately from DEVICE_PREFERENCE_KEYS
  // because it is not a device preference: it is this module's own
  // bookkeeping, and folding it into that list would misdescribe both.
  if (key === SWEEP_OWNER_MARKER_KEY) return true;
  return DEVICE_PREFERENCE_KEYS.includes(key);
}

/**
 * Removes every localStorage key except the ones shouldKeepLocalStorageKey
 * allows through. Keys are collected into a plain array BEFORE anything is
 * removed - localStorage.key(i) is defined over live, shifting indices, so
 * deleting while iterating by index would skip entries. Never throws: a
 * browser with storage disabled (or a sandboxed/private context where even
 * touching the `localStorage` global throws a SecurityError) degrades to a
 * silent no-op rather than breaking whatever called this during sign-out.
 * A single key's removeItem failing (e.g. a blocked/exotic storage backend)
 * does not stop the rest of the sweep either.
 */
function sweepLocalStorage(): void {
  try {
    if (typeof localStorage === "undefined") return;
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key !== null && !shouldKeepLocalStorageKey(key)) keysToRemove.push(key);
    }
    for (const key of keysToRemove) {
      try {
        localStorage.removeItem(key);
      } catch {
        // One key's removal failing (exotic storage backend, mid-flight
        // quota/security error) must not stop the rest of the sweep.
      }
    }
  } catch {
    // Storage disabled, private-mode SecurityError on merely touching the
    // global, or any other environment that does not support localStorage -
    // sign-out must proceed regardless.
  }
}

/**
 * Deletes one IndexedDB database, resolving (never rejecting) once the
 * browser stops actively working on it - including the case where it never
 * actually finishes.
 *
 * indexedDB.deleteDatabase fires `onblocked` instead of `onsuccess` when
 * another tab (or another connection in this one) still has the database
 * open; per spec the browser does NOT fail the request when that happens -
 * it leaves the deletion pending indefinitely until every blocking
 * connection closes. Waiting for `onsuccess` in that situation would hang
 * sign-out on another tab's timing. Resolving on `onblocked` just stops THIS
 * call from waiting: the browser still finishes the deletion on its own
 * whenever the blocking connection goes away, this function just stops
 * promising to tell the caller when.
 */
function deleteIndexedDatabase(name: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    try {
      if (typeof indexedDB === "undefined" || typeof indexedDB.deleteDatabase !== "function") {
        finish();
        return;
      }
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => finish();
      request.onerror = () => finish();
      request.onblocked = () => finish();
    } catch {
      // Accessing/using indexedDB itself threw (disabled storage, private
      // mode, a hostile/mocked global) - treat exactly like "nothing to
      // delete" rather than letting it propagate.
      finish();
    }
  });
}

/** Fires off deletion of every database in INDEXED_DB_NAMES. Never rejects -
 *  each deleteIndexedDatabase call above already only ever resolves. */
function sweepIndexedDb(): Promise<void> {
  return Promise.all([...INDEXED_DB_NAMES].map((name) => deleteIndexedDatabase(name))).then(() => undefined);
}

/**
 * Erases everything a sign-out/sign-in must not carry forward to the next
 * person: every non-keep-listed localStorage key, and both IndexedDB
 * databases outright. Intended to be called from run-form-options-cache.ts's
 * setCacheOwner, the single existing chokepoint for "the signed-in owner
 * just changed" - not called directly by feature code.
 *
 * Synchronous from the caller's point of view (returns void, not a Promise):
 * the localStorage half completes before this function returns, but
 * IndexedDB deletion is inherently asynchronous (event-based), so it is
 * kicked off and left to finish in the background rather than awaited here.
 * setCacheOwner is called synchronously from a Supabase auth-state listener
 * that nothing currently awaits, so returning a Promise callers were never
 * going to await would only invite an unhandled-rejection footgun for no
 * benefit - especially since deleteIndexedDatabase already guarantees it
 * never rejects.
 *
 * Never throws, for the same reason every function above never throws:
 * sign-out (and sign-in) must complete even in a browser with storage
 * disabled, a private window that blocks IndexedDB, or any other
 * storage-hostile environment.
 */
export function sweepClientState(): void {
  sweepLocalStorage();
  void sweepIndexedDb();
}
