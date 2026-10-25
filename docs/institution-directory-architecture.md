# Institution directory architecture

Architecture and reuse artifact for `COURSES-INSTITUTION-DIRECTORY`. It consumes
the accepted behavior in `docs/institution-directory-criteria.md`; its choices
are implementation guidance, not new owner rulings.

## Reuse findings

| Existing seam | Evidence and reuse decision |
|---|---|
| `institution_fields` persistence | `src/lib/institution-fields.ts:7-14,22-28,31-89` loads and saves the per-user/acronym JSON field list. `lmsUrl` is a field ID whose `InstitutionField.lms` property carries the platform metadata; `lms` is not a separate field ID. Preserve that nested metadata whenever mapping or updating the field list. `supabase/migrations/20260802000000_create_institution_fields.sql:3-30` has `(user_id, acronym)` primary key and owner policies. Reuse `email`, `outlookUrl`, and `lmsUrl` as the sole canonical field IDs for overlapping directory values, with LMS type in `lmsUrl.lms`. Directory edits must update the same values consumed by workflows and course rows. Do not create a second editable copy of them. |
| Existing auth boundary | `src/app/actions/course-hub-integrations.ts:75-89` derives `user.id` with `requireUser()` before using the server-only service client. Use the same server-action boundary; never accept an authoritative user ID from the browser. Keep owner-scoped RLS on all new tables as defense in depth and test that actions filter by the authenticated identity. |
| Local acronym registry | `src/lib/institutions.ts:14-50` keeps `ta-institutions` and active institution in browser localStorage. Reuse acronym normalization only. Do not treat this list as saved directory rows or silently import it into the account-owned directory. |
| Courses view routing | `src/app/components/tabs/tab-sections.ts:68-79,95,136` owns the `CoursesSection` union, ordering, labels, and default. `src/app/components/tabs/tab-rails.ts:74-112` derives the rail and maps its selection to section state. Add `institutions` there as a peer course view, preserving existing item IDs and order. |
| URL and restore chain | `src/app/url-state.ts:147-164,298,507-552,599-607` validates, parses, and emits `coursesSection`. `src/app/components/home/useAppNavigation.ts:95,231-240,719,799-820,864-915` restores it from `ta-courses-section`, URL, and popstate. Reuse that state; do not add a parallel storage key or ad hoc query parameter. |
| Reachable render branch | `src/app/page.tsx:567-601` renders the Courses rail and switches among Courses, Tasks, and One-Off Tasks. Add an `institutions` branch here and keep `CoursesTab`'s course focus handoff intact. `CoursesTab.tsx:56-57` is the existing courses table orchestrator and acronym-selection consumer; keep the institution directory as a sibling view instead of nesting it in the course table. |
| Diagnostics | `src/lib/session-diagnostic-log.ts:73-108,129-179,345-359` provides a closed surface registry and scrubbed session event store. Reuse the existing `courses` surface, extend its coverage description, and emit only the fixed operation/outcome/validation/target tokens from the criteria. Never put institution text or destinations in `institution`, `host`, `error`, or `detail`. |
| Framework gates | `docs/loop/this-repo.md` records that tests do not render components and `npm run test:paths` is required for multiple test paths. Keep persistence, validation, link-target selection, and diagnostics vocabulary in plain `.ts` modules for direct tests; source wiring tests cover route/render presence but do not prove the UI was rendered. |

Do not reuse `institution_fields.fields` as the schema for all profile and
custom-column data. Its public `InstitutionField` mapper at
`src/lib/institution-fields.ts:7-14,52-68,93-98` deliberately normalizes a
small field shape, and its save operation replaces the complete JSON array
(`:72-90`). Mixing directory metadata into this list would make unrelated
course/workflow saves able to drop or coerce directory data. Do not reuse
`ta-institutions` as persistence: it has no account boundary. Do not put
credentials, vault references, or custom-column values into model context.

## Data and server boundary

Keep the existing `institution_fields.fields` list as canonical storage for
overlapping common values. Add a dedicated account-owned directory profile row
keyed by `(user_id, acronym)` for only the additional fixed profile values
(full name, email-client choice/name, LMS Other name, faculty portal URL,
institution website URL, and department). The selected LMS platform remains
canonical in the `lms` metadata property on the existing `lmsUrl` field; store
only the editable display name for LMS type Other in the supplemental profile.
Add an account-owned custom-column definition table with
stable UUID identity, label, fixed type (`text`, `date`, or HTTPS link), and
ordering. Store row values in a separate account-owned value table keyed by
`(user_id, acronym, column_id)`; composite foreign keys cascade values when a
profile or column is deliberately removed. Acronym is immutable after create.
Normalize before persistence and enforce account-local uniqueness for
normalized acronyms and case-folded labels in the database as well as in the
action validator.

An authenticated directory read returns two top-level collections: `records`
and `columns`. It must query definitions independently of profile rows, so a
user with zero institutions can still list, rename, or remove their column
definitions. Profiles join to `institution_fields` by `user_id` and normalized
acronym, and values join to definitions by stable column ID. Legacy common-
field-only rows do not appear as directory profiles unless a profile row
exists. This avoids an import side effect on open and means removing a
directory profile does not delete common workflow metadata. Existing common
field IDs, unknown entries, unknown properties, and nested LMS platform
metadata must survive updates; storage patches the raw JSON and changes only
the owned properties on matching common-field objects.

The directory mutation boundary must make one profile save atomic across the
profile row and its overlapping common fields. The common-value projection is
exactly `email.value`, `outlookUrl.value`, `lmsUrl.value`, and
`lmsUrl.lms`; `lmsUrl.lms` is the platform type, not another field ID. The
supplemental profile row stores `lmsOtherName` when that platform is Other.
Implement a server-only transaction function/RPC called by the action after
`requireUser()` has
resolved the identity. Pass that server-derived user ID, not browser input;
restrict direct execution to the service role, keep RLS enabled with
`auth.uid() = user_id` policies for user-scoped table access, and verify every
target acronym belongs to the intended profile operation. The RPC patches the
current raw `institution_fields.fields` JSON array, updating only those named
properties for the matching common field objects. It preserves unknown array
entries and unknown properties on known entries, including `lmsUrl.lms`, and
does not reconstruct the array from the lossy `InstitutionField` mapper or
overwrite directory columns or values. Custom column create/rename/value/remove actions
use similarly explicit writes and return success only after the database
confirms them. Removal of a profile clears its values by cascade while leaving
common fields, courses, and `ta-institutions` untouched. Removal of a column
clears only that user's values for its stable ID.

Expected module contracts:

```ts
export type DirectoryColumnType = "text" | "date" | "https";
export interface InstitutionDirectoryProfile {
  acronym: string;
  fullName: string;
  emailClient: "outlook" | "gmail" | "other" | "";
  emailClientOtherName: string;
  lmsOtherName: string;
  facultyPortalUrl: string;
  websiteUrl: string;
  department: string;
}
export interface InstitutionDirectoryColumn {
  id: string;
  label: string;
  type: DirectoryColumnType;
  position: number;
}
export interface InstitutionDirectoryRecord {
  profile: InstitutionDirectoryProfile;
  commonValues: { email: string; outlookUrl: string; lmsUrl: string; lmsType: string };
  values: Readonly<Record<string, string>>;
}
export interface InstitutionDirectoryState {
  records: readonly InstitutionDirectoryRecord[];
  columns: readonly InstitutionDirectoryColumn[];
}
export function normalizeInstitutionAcronym(raw: string): string;
export function validateInstitutionDirectoryProfile(input: unknown): ProfileValidation;
export function validateInstitutionDirectoryColumn(input: unknown, existing: readonly InstitutionDirectoryColumn[]): ColumnValidation;
export function validateInstitutionDirectoryValue(type: DirectoryColumnType, raw: unknown): ValueValidation;
export function validateInstitutionDestination(raw: string): { ok: true; href: string } | { ok: false; reason: "blank" | "invalid" };
export function resolveInstitutionLmsAction(record: InstitutionDirectoryRecord):
  | { kind: "open"; href: string }
  | { kind: "not-set" }
  | { kind: "unavailable" };
```

The server-only persistence module is
`src/lib/institution-directory-storage.ts`; it owns explicitly typed reads
and writes for every directory table and the atomic profile/common-field RPC.
Keep the action as its caller; the panel must not import a Supabase server
client or issue table queries directly. The concrete server-action contract
is: `listInstitutionDirectoryAction()` returns a discriminated
`{ok:true, state: InstitutionDirectoryState}` or `{ok:false, code}` result.
The action obtains definitions independently of profiles, so
`state.columns` remains listable after the last profile is removed and when
`state.records` is empty. It returns canonical common values using the exact
field projection above;
`saveInstitutionDirectoryProfileAction(input)` saves profile plus the canonical
common fields atomically; `removeInstitutionDirectoryProfileAction(acronym)`
removes just the directory profile; `saveInstitutionDirectoryColumnAction`
handles create/rename; `saveInstitutionDirectoryValueAction` writes/clears one
typed value; and `removeInstitutionDirectoryColumnAction(id)` confirms/removes
one definition and cascades its values. Every action derives identity from
`requireUser()`, validates the entire structured payload before persistence,
and returns fixed error codes only. No action accepts credential properties.
Use the generated Supabase `Database` types from `src/lib/supabase/types.ts`;
update that file for every new table and RPC. Keep pure validation and mapping
in a leaf `.ts` module, server reads/writes in a server-only `.ts` module, and
`"use server"` exports async-only.

Custom labels use a normalized reserved-word check for the criteria's bounded
credential vocabulary. Validate structured keys recursively against the
credential-property deny set before writes. This only bounds structured data;
it cannot promise secret detection in arbitrary prose, so UI copy continues to
direct login details to Bitwarden. No profile or custom value is passed to an
LLM. Use Bitwarden's documented browser-extension Website URI matching only:
store destination URLs here, let the user store credentials and select the
matching login in their extension. The app must never claim extension
installation, unlock, account selection, autofill, or login success.

The Open LMS action is derived from the same record's `commonValues.lmsUrl`.
`resolveInstitutionLmsAction` returns only a validated absolute HTTPS URL with
hostname and without userinfo, query, or fragment; unset and invalid legacy
values resolve to non-navigation states. Bind the row action to that returned
href, open only on explicit click with `target="_blank"` and
`rel="noopener noreferrer"`, and provide a correction path for invalid saved
values. Do not use active-institution localStorage, current-course metadata,
another row, or a global fallback. Mirror this pure resolver for email,
faculty-portal, website, and custom HTTPS columns so all outbound links share
the same allowlist. Add target/source to diagnostics only as the closed target
category, never the URL.

## Navigation and diagnostics seam

The route value is `tab=courses&coursesSection=institutions`; the rail item ID
is `institutions`; the persisted state remains `ta-courses-section`. Add the
union member once in `tab-sections.ts`, then derive the validator from
`COURSES_SECTION_ORDER` as it already does in `url-state.ts`. Add the label and
rail mapping in `tab-rails.ts`; initialize and restore through the existing
section state in `useAppNavigation.ts`; render `InstitutionDirectoryTab` from
the `institutions` branch in `page.tsx`. Tests must cover URL parse/build
round-trip, localStorage restoration, popstate restoration, rail state
mapping, and exact page branch reachability. Existing Courses, Tasks,
One-Off Tasks and course focus paths remain the baseline.

Reuse the existing `courses` diagnostic surface. Add a closed directory
operation/result builder in a plain `.ts` leaf; only fixed operations,
outcomes, validation categories, and destination categories from the criteria
are allowed. On diagnostics write failure, do not change the persistence
outcome. Update the surface coverage string and add exact-shape/redaction tests
so acronym, email, URL, labels, rejected values, account IDs and exception
strings cannot enter diagnostics or exported session logs.

## Minimal pushable implementation waves

These waves are sequential and share files; they are not disjoint and must not
run in parallel. After Wave 1 lands, regenerate Wave 2's brief from the
resulting tree and verify Wave 1 is quiescent before editing the shared model,
storage, action, panel, types, diagnostics, or diagnostics canary files. Each
wave includes the callers of its exports. For planned source sizes, measure current anchors using
`@(Get-Content <path>).Count`; current measured anchors are
`CoursesTab.tsx` 485, `page.tsx` 948, `url-state.ts` 664,
`useAppNavigation.ts` 996, `tab-sections.ts` 208, `tab-rails.ts` 163,
`institution-fields.ts` 145, `course-hub-integrations.ts` 283,
`session-diagnostic-log.ts` 673, and `supabase/types.ts` 619. Keep the
directory panel, validation, and diagnostic vocabulary in separate files so
no existing near-limit navigation file grows beyond the repo's 1000-line
ceiling.

### Wave 1: directory profile, fixed fields, navigation, and external links

Owned paths:

- CLI-generated `supabase/migrations/<timestamp>_institution_directory_profiles.sql`, produced by `supabase migration new institution_directory_profiles`
- `src/lib/institution-directory.ts`
- `src/lib/institution-directory.test.ts`
- `src/lib/institution-directory-storage.ts`
- `src/lib/institution-directory-storage.test.ts`
- `src/lib/institution-directory-diagnostics.ts`
- `src/lib/institution-directory-diagnostics.test.ts`
- `src/lib/supabase/types.ts`
- `src/app/actions/institution-directory.ts`
- `src/app/actions/institution-directory.test.ts`
- `src/app/components/institution-directory/InstitutionDirectoryTab.tsx`
- `src/app/components/institution-directory/ProfileEditor.tsx`
- `src/app/components/institution-directory/directory-wiring.test.ts`
- `src/app/components/tabs/tab-sections.ts`
- `src/app/components/tabs/tab-rails.ts`
- `src/app/components/home/useAppNavigation.ts`
- `src/app/url-state.ts`
- `src/app/page.tsx`
- `src/lib/session-diagnostic-log.ts`
- `src/lib/session-diagnostic-log.test.ts` (exact Courses coverage assertion)
- `src/lib/session-diagnostic-log.detail.test.ts` (bounded detail sanitization)
- `src/app/actions/wholesale-auth-mock-population.structure.test.ts` (auth-mock population canary)
- `src/lib/use-server-exports.test.ts` (server-action export restriction)
- `src/file-size-ceiling.structure.test.ts` (mandatory source-size canary)
- `src/supabase-migrations.structure.test.ts` (migration syntax gate)
- `src/supabase-migrations.accessibility-scans-rls.migration.test.ts` (migration/RLS canary)
- `src/supabase-migrations.rls-coverage.structure.test.ts` (RLS coverage gate)
- navigation tests owning these seams: `src/app/components/tabs/tab-sections.test.ts`, `tab-rails.test.ts`, `tab-link.test.ts`, `tab-link.wiring.test.ts`, `src/app/url-state.test.ts`, and `src/app/components/tabs/topLevelTabs.wiring.test.ts` (add only where inspection confirms the tested seam).

This wave includes the page caller and the server-action caller in the panel.
It delivers base profile CRUD, all fixed fields, read-through of canonical
common fields, exact-row outbound destinations, bounded diagnostics, and the
durable Courses > Institutions route. Gate against profile/common-field
preservation, auth isolation, invalid/unset/exact LMS destinations, normal
course/task rail restoration, and every acceptance criterion in the fixed
profile/nav/validation/removal/state sections.

### Wave 2: custom-column lifecycle

Owned paths:

- CLI-generated `supabase/migrations/<timestamp>_institution_directory_columns.sql`, produced by `supabase migration new institution_directory_columns`
- `src/lib/institution-directory.ts`
- `src/lib/institution-directory.test.ts`
- `src/lib/institution-directory-storage.ts`
- `src/lib/institution-directory-storage.test.ts`
- `src/lib/institution-directory-diagnostics.ts`
- `src/lib/institution-directory-diagnostics.test.ts`
- `src/app/actions/institution-directory.ts`
- `src/app/actions/institution-directory.test.ts`
- `src/app/components/institution-directory/InstitutionDirectoryTab.tsx`
- `src/app/components/institution-directory/CustomColumnsEditor.tsx`
- `src/app/components/institution-directory/directory-wiring.test.ts`
- `src/lib/supabase/types.ts`
- `src/lib/session-diagnostic-log.ts`
- `src/lib/session-diagnostic-log.test.ts` (exact Courses coverage assertion)
- `src/lib/session-diagnostic-log.detail.test.ts` (bounded detail sanitization)
- `src/app/actions/wholesale-auth-mock-population.structure.test.ts` (auth-mock population canary)
- `src/lib/use-server-exports.test.ts` (server-action export restriction)
- `src/file-size-ceiling.structure.test.ts` (mandatory source-size canary)
- `src/supabase-migrations.structure.test.ts` (migration syntax gate)
- `src/supabase-migrations.accessibility-scans-rls.migration.test.ts` (migration/RLS canary)
- `src/supabase-migrations.rls-coverage.structure.test.ts` (RLS coverage gate)

This wave's callers are included: actions are invoked by the directory panel,
and diagnostics are emitted there. Gate stable-ID rename behavior, label/type
validation, row value validation, confirmed cascade removal, account isolation,
preservation of other rows/columns, retry behavior, and exact diagnostic
redaction. The owner browser walk remains required for actual table layout,
keyboard/focus, unsaved navigation, external link dispatch and Bitwarden
behavior; tests here do not render components.

Generate each migration path using the named `supabase migration new` command;
do not hand-invent its timestamp. Migration behavior and RLS require separate SQL review and a later authorized
live-account exercise. Do not claim deployed persistence or real extension
autofill from unit tests. Run the structural migration gates in each migration
wave; vitest does not run at push (`docs/loop/this-repo.md`, "The pre-push gate
runs NO vitest").

## Reversibility and design-seat triage for Verify

The schema migrations are not trivially reversible after user data exists:
profile/column/value cascades can delete that data. New navigation values are
reversible in code but existing bookmarks can carry them, so retain the URL
value after landing. Changes to `institution_fields.fields` are high-risk
because workflows read existing IDs; update only the explicitly owned common
IDs and prove preservation of unknown IDs. The legacy acronym registry remains
separate and untouched.

Verify must revisit triaged seats against the actual diff:

- Data/storage runs: new persistent tables, migrations, and typed row mapping.
- Security runs: new authenticated server actions, credential-shaped payload
  rejection, and external navigation.
- Operability/admin runs: account-scoped create/edit/remove and column
  lifecycle.
- UX, visual/aesthetic, and accessibility run: new surface, visible actions,
  forms, tab order, focus and keyboard behavior.
- Reliability runs: persistent mutations, retry/error states, and stale account
  response handling.
- External-facts research runs only for the password-manager contract already
  evidenced in criteria; the implementation must not expand this to an API.
- Baseline is already specified in `docs/REGRESSION.md` only if a matching
  Courses/institution-directory behavior entry exists; Verify must check with
  `rg -n -i "institution directory|Courses > Institutions" docs/REGRESSION.md`
  and add a measured baseline before implementation if absent.
- Test seat runs by the always trigger: test the actual action/model boundary,
  full URL parse/build restoration and exact row destination; assert diagnostic
  redaction, not component rendering.

The app-specific leverage claim remains the directory's authenticated later
read-back and correct-row destination reuse. Verify must judge it against the
as-built route and persisted read-back; a database row or a link helper alone
does not earn it.
