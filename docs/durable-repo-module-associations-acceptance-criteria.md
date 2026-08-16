# Durable repo-to-module associations

Two instructor requirements, which are one chunk:

- **The bug**: "fix the repo pairing key collision."
- **The feature**: "i need a way to permanently associate files/folders in a
  repo with certain modules in the module view."

## The bug is not a collision, and the real symptom is worse

`repoPairingState.ts` keys on `courseUrl`, and every read and write is guarded
`if (typeof window === "undefined" || !courseUrl) return EMPTY;`. `ContentTab`
derives `courseUrl` as `""` for EVERY export-sourced course. So for an export
course the pairing is not shared with other courses - it is **never persisted at
all**. Pair a repo, reload, it is gone. The instructor works almost entirely in
export-sourced courses, so in practice the persistence half of this feature has
never worked for them.

This is the THIRD instance of the same root cause. Entry 274 check 6a: an export
capability keyed on `courseUrl` shipped DEAD. Entry 300: the same keying shipped
BROKEN. This one shipped SILENTLY NON-PERSISTENT. The lesson is now explicit:
**`courseUrl` is not an identifier. It is a live-Canvas address that happens to
be empty for half the courses in the app.**

## The design

**The association hangs off the `course_hub` row id, so `courseUrl` leaves the
identity question entirely.** `ModulesView` already holds `exportCourseId` for
exports; a live selection resolves its row through the existing
`resolveLmsCourseRowAction` / `resolveLmsCourseRowByIdAction` pair that entry 300
established.

**It lives in the database, not localStorage**, because "permanently" means
surviving a cleared browser and a different machine. One new nullable JSONB
column on `course_hub` - not a new table: the data is one small blob per course,
single-writer, unversioned and always read with the course, exactly like
`course_project` and `student_repos`. A table would need its own RLS, module and
cascade for no benefit.

**One tagged array, not two maps:**
`{ v: 1, repoRef, branch, associations: [{ path, kind: "folder" | "file",
moduleId, boundAt }] }`. Folders and files coexist without a key-space collision,
and each entry has room for the metadata a durable record wants. A folder and a
file inside it can both carry associations - "module_08 belongs to Module 8, but
module_08/extra-credit.md belongs to Module 12" must be representable.

## Acceptance criteria

**AC1. Associations survive a reload, a new browser and a different machine**,
for BOTH live and export-sourced courses. This is the whole point; verify it for
an export course specifically, since that is the case that never worked.

**AC2. Files are associable, not just folders.** The per-file control lives in
the row `RepoFoldersSection` already renders for each file, and defaults to
showing the association inherited from its folder so the common case needs no
interaction.

**AC3. A STALE ASSOCIATION IS PRESERVED AND MARKED INACTIVE - NEVER DELETED.**
This is the most important criterion and it REVERSES the current localStorage
rule. Today `filterRepoModuleOverrides` drops any override whose folder is
absent, and the persist effect writes the filtered map straight back. Against a
database that means: switch to a branch that lacks `assignments/module_11`, the
folder vanishes from the tree, the association is deleted for every device,
permanently - and switching back does not restore it. The instructor never asked
for that and would never see it happen.
Instead: load everything, compute `active = path is present AND moduleId is
present` at read time, and feed only the active subset into
`applyRepoModuleOverrides` so all four pairing states and every downstream
consumer stay byte-identical. A branch switch, a rename, a rate-limited tree
fetch and an unpushed folder all produce "absent right now" and none of them
mean the instructor changed their mind. Deletion happens ONLY on explicit
action - setting the select back to Auto, or a remove control.

**AC4. `filterRepoModuleOverrides` keeps its current behaviour and changes
ROLE**: it becomes the activation filter, not the persistence filter. Its
same-reference-when-nothing-dropped optimisation then usefully signals "nothing
became inactive".

**AC5. The recompute is gated on a loaded tree.** `useRepoPairing` currently
re-runs its filter whenever `folderRoot` changes reference - including to `null`
mid-load - which evaluates against an empty folder list. Under localStorage that
was recoverable; under the database it would deactivate (and, without AC3,
delete) everything on every branch switch. Gate on the tree actually being
ready.

**AC6. Inactive associations are visible, never silent.** `RepoFoldersSection`
already reports "No repo folder maps to: ..." honestly; add the mirror - "N
saved associations aren't in this branch: ..." - and a fifth badge case for the
inactive state. That file's own header forbids silent empty states.

**AC7. The column is registered everywhere it must be, and omitted from the one
place it must not.** It is a DEDICATED-WRITER column: it must NOT appear on
`CourseInput`, in `toRow`, in `courseToInput`, or in `courseToInputPayload`.
That rule is the INVERSE of the rule for plain scalar columns, which must appear
in the latter two or be wiped - and getting the two backwards is the single most
likely way to break this. `syllabus-upload.preserves-columns.test.ts` exists
because this exact mistake once cleared fifteen columns. Add a mirror guard test:
a full `updateCourse` round trip leaves the pairing untouched.

**AC8. `Course.repoModulePairing` is OPTIONAL**, following the
`courseKind` / `weeklyChecklist` / `gradesDueDate` precedent, so ~74 existing
test fixtures stay valid. `toCourse` always produces a concrete coerced value;
readers go through the coercer rather than assuming presence. The one fixture
typed `Required<Course>` will fail to compile - that is deliberate friction, and
it must be updated AND added to that test's dedicated-writer exclusion list.

**AC9. The client reaches the database only through a server action.** Every
hook in `content-tab/modules/` imports from the actions barrel; the only
`@/lib/supabase` imports there are `import type`. The persist path becomes async:
it needs a cancellation guard and must surface a failure rather than swallowing
it the way the current localStorage `catch {}` does.

**AC10. Migration hygiene.** `add column if not exists`, nullable, no default,
following `20260912000000_course_weekly_checklist.sql`. Migrations auto-apply
via GitHub Actions on push to main; the coercer must tolerate the column being
absent (reading `undefined` as "unpaired") so a failed migration degrades to
today's behaviour rather than throwing.

**AC11. Existing localStorage pairings.** Decide explicitly and state it: either
one-time-migrate the old `ta-repo-pairing-*` values into the database, or accept
the loss. Do not leave it unsaid. Note that export courses have nothing to
migrate, since nothing was ever stored for them.

## Out of scope

- Repo pairing for anything outside the Modules view.
- Any Canvas write driven by an association. Associations feed selection,
  download and generation only, per the repo-pairing criteria's AC7.

## Verification

Nothing in this area renders under test - vitest is node-env and collects only
`src/**/*.test.ts` - so the UI half is read-verified and must be declared as
such. The three guard tests that matter: the `updateCourse` round trip leaves
the column untouched; a branch switch that empties the folder list preserves
every stored association and marks them inactive; and two different export
courses keep their pairings apart.
