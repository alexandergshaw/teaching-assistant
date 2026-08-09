// Bulk module creation - the pure planner.
//
// Manual tab > LMS subtab > Modules view gets a control that bulk-creates N
// blank Canvas modules from a name template (default "Module {x}"), e.g. to
// seed a brand-new course's module list in one click instead of clicking "Add
// module" N times through NewAssignmentPanel/useNewAssignmentForm.ts. Every
// decision that can be made without talking to Canvas lives HERE: the modal
// (BulkCreateModulesModal.tsx) only renders this file's output and fires the
// resulting `createModuleAction` calls - it makes no naming, padding, or
// idempotency decisions of its own. This split mirrors the rest of this
// codebase's "pure planner + thin UI" shape (e.g. announcement-schedule.ts +
// the announcement scheduling UI, repoGradesRows.ts + RepoBindingControl.tsx).
//
// Pure module: no I/O, no Date, no React. Every input is a plain value the
// caller already has in hand (the existing module list, already loaded by
// ContentTab.tsx; the count/template/start-at, already typed into the modal's
// own controlled inputs).

/**
 * The template token that expands to a module's number. Deliberately a NEW
 * token, `{x}`, and NOT a reuse of `{n}` - the existing per-module number
 * placeholder `useBulkModuleActions.ts:169`'s "Add to each" naming pattern
 * already uses in this SAME Modules view (`fillNamePattern`). That `{n}` is
 * UNPADDED and means "the week/module number read out of an existing
 * module's title" (e.g. "Week 5" -> 5). This feature's number is padded
 * (see expandModuleNameTemplate below) and means something else entirely -
 * "the Nth module being freshly created" - so reusing `{n}` for it would
 * either (a) silently start padding an existing, unpadded token elsewhere on
 * this same screen, or (b) require the two call sites to somehow agree on
 * padding behavior despite serving different purposes. Both are worse than
 * spending one more token name.
 */
export const BULK_MODULE_TOKEN = "{x}";

/**
 * Upper bound on how many modules a single click can create. Chosen as 200:
 * a real course's module list realistically runs to a few dozen (weeks or
 * units in a term), so 200 is already far more headroom than any legitimate
 * single run needs, including odd-but-real cases like seeding a large
 * standalone item bank as one module per item. The cap exists because every
 * created module is a SEPARATE, SEQUENTIAL, UNTHROTTLED Canvas write (see
 * BulkCreateModulesModal.tsx's throttle-gap comment - writeJson in
 * canvas-modules/fetch-helpers.ts has no retry/backoff, unlike the
 * fetchWithThrottleRetry helper canvas/announcements.ts:299 keeps private to
 * itself) - a mistyped "2000" must not be able to queue two thousand
 * unprotected POSTs from one click. 200 bounds that worst case without
 * getting in the way of any real instructor's course.
 */
export const MAX_BULK_MODULE_COUNT = 200;

/**
 * Expand every `{x}` in `template` into `n`, zero-padded to a 2-digit
 * minimum (1 -> "01", 9 -> "09", 10 -> "10", 100 -> "100" - padStart only
 * ever ADDS digits up to the minimum, it never truncates). This is the exact
 * padding rule `steps.lms-modules.ts:91` (`String(week).padStart(2, "0")`)
 * and `composeModuleTitle` (`src/lib/module-title.ts:140-143`) already write
 * for Canvas module names, chosen deliberately here too (see this feature's
 * brief) so a course built partly by the Course Build workflow and partly by
 * this control stays name-consistent, and so Canvas's own alphabetical
 * module-name ordering never puts "Module 10" before "Module 2" (which an
 * unpadded scheme would).
 *
 * The match is case-insensitive (`{X}` expands the same as `{x}`) and global
 * (every occurrence in the template expands, not just the first) - the same
 * `/{token}/gi` shape `renderAnnouncementTemplate` uses for its own `{week}`
 * token (`src/lib/announcement-schedule.ts:319-321`).
 *
 * A template with NO `{x}` token at all still needs to produce a DIFFERENT
 * name per module - otherwise a plain "Module" template would ask the caller
 * to create N modules that are all literally named "Module", which
 * `planBulkModuleCreation` below would then treat as N-1 "already-present"
 * duplicates of the first (or, worse, N real duplicate Canvas modules if
 * idempotency were ever bypassed). Rather than reject a token-less template
 * as invalid, the number is appended - `"Module"` at n=5 becomes
 * `"Module 05"`, matching the exact string `steps.lms-modules.ts:91` itself
 * writes for a bare "Module" template. Whitespace around the template is
 * trimmed first so `"Module "` doesn't leave a doubled space before the
 * appended number.
 */
export function expandModuleNameTemplate(template: string, n: number): string {
  const padded = String(n).padStart(2, "0");
  if (!/\{x\}/i.test(template)) {
    const base = template.trim();
    return base ? `${base} ${padded}` : padded;
  }
  return template.replace(/\{x\}/gi, padded);
}

/** One planned module: its 1-based sequence number, the name it expands to,
 * and whether creating it is necessary. `existingId` is set only when
 * `action` is `"already-present"`, pointing at the matching module already
 * in the course (useful for a future "open it" affordance; unused by the
 * create loop itself, which simply skips these entries). */
export interface BulkModulePlanEntry {
  n: number;
  name: string;
  action: "create" | "already-present";
  existingId?: number;
}

/** The full plan for one "create N modules" run: every entry in order, the
 * counts the modal's apply button and preview header read directly (so they
 * can never disagree with the entry list they're summarizing), and a single
 * validation error - never a throw - that blocks the whole plan when set. */
export interface BulkModulePlan {
  entries: BulkModulePlanEntry[];
  createCount: number;
  skipCount: number;
  error: string | null;
}

const emptyPlan = (error: string | null = null): BulkModulePlan => ({
  entries: [],
  createCount: 0,
  skipCount: 0,
  error,
});

/**
 * Plan a bulk module creation run: for each n in [startAt, startAt + count),
 * expand the template and decide whether that name already exists in
 * `existing` (case-insensitive, trim-insensitive) or needs to be created.
 *
 * IDEMPOTENCY IS THE LOAD-BEARING RULE HERE. Canvas offers no client-supplied
 * idempotency key for module creation - `createModule`
 * (`src/lib/canvas-modules/modules.ts:49-74`) just POSTs `module[name]`, and
 * `createModuleAction` (`src/app/actions/canvas-modules.ts:55-67`) passes
 * that straight through with no dedup of its own (compare
 * `useNewAssignmentForm.ts:85-94`'s `handleAddModule`, which has no such
 * guard either - clicking "Add module" for an existing name just creates a
 * second one). So the ONLY thing standing between "run this twice" and a
 * course full of duplicate "Module 01" entries is this function's own
 * pre-check against the caller-supplied `existing` list, matched exactly the
 * way `steps.lms-modules.ts:92-95` already matches its own "Module NN" names
 * (`m.name.toLowerCase().trim() === name.toLowerCase().trim()`) and the way
 * REGRESSION entry 236's "re-running creates nothing" doctrine requires for
 * every idempotent Canvas-writing feature in this codebase. A re-run of this
 * planner against a fully-created run therefore returns `"already-present"`
 * for every entry and a `createCount` of 0 - this is the headline case the
 * test suite pins.
 *
 * Validation (returned as `plan.error`, never thrown, so the modal can
 * render it inline exactly like every sibling modal's own `note.text`):
 *   - `template` must have non-whitespace content.
 *   - `count` must be a positive integer, capped at MAX_BULK_MODULE_COUNT.
 *   - `startAt` must be a positive integer.
 */
export function planBulkModuleCreation(
  existing: Array<{ id: number; name: string }>,
  count: number,
  template: string,
  startAt: number
): BulkModulePlan {
  if (!template.trim()) {
    return emptyPlan("Enter a name template.");
  }
  if (!Number.isInteger(count) || count < 1) {
    return emptyPlan("Enter a positive whole number of modules to create.");
  }
  if (count > MAX_BULK_MODULE_COUNT) {
    return emptyPlan(`Cannot create more than ${MAX_BULK_MODULE_COUNT} modules at once.`);
  }
  if (!Number.isInteger(startAt) || startAt < 1) {
    return emptyPlan("Enter a positive whole starting number.");
  }

  // Normalized name -> existing module, built once up front rather than
  // re-scanning `existing` per entry (this list is at most a few hundred
  // items - a real course's whole module list - so either shape is cheap,
  // but a map keeps the per-entry check a single O(1) lookup and reads more
  // obviously as "the same match rule as steps.lms-modules.ts", not a
  // subtly-different re-derivation of it).
  const byNormalizedName = new Map<string, { id: number; name: string }>();
  for (const m of existing) {
    byNormalizedName.set(m.name.trim().toLowerCase(), m);
  }

  const entries: BulkModulePlanEntry[] = [];
  let createCount = 0;
  let skipCount = 0;
  for (let i = 0; i < count; i++) {
    const n = startAt + i;
    const name = expandModuleNameTemplate(template, n);
    const found = byNormalizedName.get(name.trim().toLowerCase());
    if (found) {
      entries.push({ n, name, action: "already-present", existingId: found.id });
      skipCount += 1;
    } else {
      entries.push({ n, name, action: "create" });
      createCount += 1;
    }
  }

  return { entries, createCount, skipCount, error: null };
}
