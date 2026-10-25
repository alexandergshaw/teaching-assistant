# Institution directory acceptance criteria

Leverage claim - CORPUS: Courses > Institutions gives the instructor a saved,
institution-specific directory that the app reads back on a later visit and uses
to open that institution's email, LMS and faculty sites. Today the app has a
browser-local acronym list and scattered common institution fields; the instructor
must assemble the remaining profile and destinations from bookmarks, memory or
chat text. This feature earns the claim through the reachable directory's later
read-back and usable destinations, not merely through writing a database row or
inheriting authentication. Credential autofill remains the password manager's
capability; this feature does not claim unattended integration.

Backlog item: `COURSES-INSTITUTION-DIRECTORY`. Criteria author reading, 2026-10-17;
the safe defaults below are recommendations acted on, not new owner rulings.

## Evidence and scope boundary

The following observations come from reading the named production sources with
`Get-Content` and finding their callers with
`rg -n 'loadInstitutionFields|saveInstitutionFields|useInstitutionSelection|COURSES_RAIL_ITEMS|CoursesSection' src`.

- `src/lib/institutions.ts` stores the acronym registry and active selection in
  unscoped browser localStorage (`ta-institutions`, `ta-active-institution`). It
  trims/uppercases acronyms and rejects blank and case-insensitive duplicates.
  This is a convenience registry, not proof of authenticated record ownership.
- `src/lib/institution-fields.ts` already loads, lists and saves common fields
  by user ID and acronym in `institution_fields`. Defaults include email,
  Outlook URL, LMS URL/type, start date, syllabus template and calendar feed.
  `supabase/migrations/20260802000000_create_institution_fields.sql` gives that
  table a user/acronym key and owner-scoped policies. The new directory must
  use authenticated user-owned persistence, not a new global localStorage
  profile store. The architect chooses the storage shape.
- `src/app/actions/course-hub-integrations.ts` derives the user from
  `requireUser()` before common-field access. `SyllabusCell.tsx` and workflow
  helpers consume saved institution metadata. Directory work must preserve
  these consumers and metadata it does not edit.
- `src/app/components/CoursesTab.tsx` renders the course table and uses the
  acronym selection hook. `src/app/page.tsx` hosts the Courses navigation rail;
  URL validation/restoration also exists in `src/app/url-state.ts` and
  `src/app/components/home/useAppNavigation.ts`. A new component alone does not
  make the directory reachable or restorable.
- Diagnostics already have an app-wide session surface through
  `src/lib/session-diagnostic-log.ts`. The new capability owes representation
  there, not just a private console message.

This item covers institution directory profiles and external navigation. It does
not configure LMS API credentials, send email, log into a website on the user's
behalf, or rename existing course/institution identities. Profile removal means
removal from this directory, not deletion of courses, common workflow metadata,
the legacy acronym registry, external accounts or vault entries.

## Acceptance criteria

### AC-NAV: reachable, durable location

An authenticated instructor can select **Courses > Institutions** alongside the
existing Courses views and see an institution table. Existing course and task
views remain reachable, including course-focus handoffs. Navigating away and
back, opening the view's app URL, and reloading that URL restore Institutions
and read its saved records. A signed-out visitor sees an authentication state
and no previous user's profiles. Keyboard users can reach the subtab, table
actions and forms, and identify the selected view and focus position.

### AC-FIELDS: useful, explicit profile

Each saved row identifies the institution by acronym and optional full name.
The table exposes the email, email client, LMS name/type and URL, and faculty
portal URL without requiring a chat or a course to exist. The profile editor
has the following fixed fields; optional blank values display as **Not set**
and do not produce empty links.

| Field | Acceptance behavior |
|---|---|
| Institution acronym | Required; trim and uppercase; case-insensitive uniqueness within the signed-in account. Immutable after creation so editing a label cannot silently re-key existing courses or settings. |
| Institution full name | Optional editable plain-text display name, useful for distinguishing acronyms. |
| Institution email | Optional single email address belonging to the instructor at that institution; not a password or arbitrary message. |
| Email client | Optional choice: Outlook, Gmail, Other, or Not set. Other has an editable plain-text client name. Selecting a client does not invent an account URL or claim a connection. |
| Email web URL | Optional HTTPS destination for the institution's webmail; kept separate from the email address and client name. |
| LMS type | Optional choice: Canvas, Blackboard, Moodle, Brightspace, Other, or Not set. Other has an editable plain-text LMS name. Existing recognized Canvas/Blackboard values retain their meaning. |
| LMS URL | Optional HTTPS institution LMS/login destination; not a per-course URL and not an API token. When valid, the same row exposes an explicit **Open LMS** action bound to this institution's URL. |
| Faculty portal URL | Optional HTTPS destination for the institution's faculty portal. |
| Institution website URL | Optional HTTPS public website, useful when the institution has no distinct faculty portal. |
| Department | Optional plain-text department affiliation for distinguishing the instructor's role at that institution. |

The fixed common fields remain distinct from custom columns. The instructor can
add custom columns to the directory using the lifecycle in AC-COLUMNS. Custom
types are limited to plain text, date, and HTTPS link; custom columns are not a
credential store or a free-form object editor. Existing common fields outside
this profile remain intact. The initial scope has no vault-item label/reference
field: the cited extension contract needs website URIs, and no additional
supported reference contract has been established.

### AC-COLUMNS: easy, durable custom columns

The table provides a clearly labeled **Add column** action near the column
headers. The instructor can start adding a column, enter a label and choose
plain text, date, or HTTPS link, then save or cancel. Saving rejects an empty
label, a label equal to a built-in field, or a case-insensitive duplicate of an
existing custom label with field-specific feedback. Cancelling creates no
column. Once created, a column has a stable identity independent of its label;
renaming changes its displayed label without changing or moving any
institution's value to a different column. Its type is fixed after creation so
existing values are never silently reinterpreted.

For each institution row, the instructor can edit or clear each custom value.
Plain-text values display as text. Date values are valid calendar dates with an
unambiguous stored representation. HTTPS-link values obey AC-VALIDATE and
open only through an explicit user action. Blank optional values display as
**Not set** and produce no link. A user can remove a custom column only after a
confirmation naming the column and explaining that its values for all of that
user's institution rows will be removed; cancellation preserves the column and
all values. The UI makes it straightforward to add another column after any
existing one without editing code or leaving the directory.

Column definitions and row values are isolated to the authenticated account,
persist across navigation, reload, sign-out/sign-in and a fresh browser, and
remain associated with the same institution and stable column identity.
Create, rename, row-value update/clear and confirmed removal show pending state
and success only after persistence confirms the operation. On failure, retain
the last confirmed definitions and values plus the user's draft, explain which
operation failed, and offer retry without duplicating or re-keying data. An
account switch or sign-out cannot show the previous account's in-flight column
or values. Existing common fields and their consumers remain unaffected by
custom-column edits.

Custom labels reject a bounded credential-label vocabulary after case folding,
trimming, and treating spaces, hyphens and underscores equivalently. The
reserved labels include `password`, `passphrase`, `master password`, `secret`,
`token`, `access token`, `refresh token`, `api key`, `client secret`,
`private key`, `recovery code`, `one-time code`, `otp`, `totp`, `mfa code`,
`username`, and `vault export`. Structured row or column payloads reject
credential properties including `password`, `masterPassword`, `apiKey`,
`accessToken`, `refreshToken`, `clientSecret`, `secret`, `privateKey`,
`recoveryCode`, `oneTimeCode`, `otp`, `totp`, `mfaCode`, `username`, and
`vaultExport` (case-insensitively, including equivalent separator variants).
These bounded rejects apply before persistence and exclude the rejected values
from diagnostics and model input. This does not promise perfect secret
detection inside arbitrary prose; the interface states that custom columns
must not contain credentials and directs login details to Bitwarden. No model
call receives institution profiles or custom-column values.

### AC-ADD-EDIT: deliberate edits and visible outcomes

**Add institution** works from an empty directory and from a populated table.
The instructor can create an acronym-only profile, fill optional details later,
edit a specific row, clear an optional value, save, or cancel. Cancel leaves
persisted values unchanged. Editing one row does not copy another row's values.
Saving marks the operation as in progress and prevents duplicate submission;
success is shown only after persistence confirms it. Successful edits replace
that row's displayed values and survive a fresh load. Failed saves preserve
the draft and last confirmed saved row, identify that saving failed, and offer
retry. A failed create does not leave a displayed saved row or duplicate on retry.
Leaving an unsaved editor requires saving, explicit discard or returning to
the editor; navigation must not silently discard its draft.

### AC-REMOVE: narrow, recoverable failure behavior

Each saved row has **Remove from directory** with confirmation naming the
institution and explaining the scope stated above. Cancel changes nothing.
Confirmation removes that user's directory profile only after success; a
failure keeps the row available with a retryable error. Removing the last row
returns the empty state. Reopening does not resurrect a removed profile from
legacy common metadata or local acronyms. The same acronym can be added again
explicitly. Existing courses, syllabus settings, feeds, workflows and another
user's identically named institution remain unchanged.

### AC-STATE: loading, empty and unavailable are different

Initial loading is visible and does not flash a false empty directory. A
successful load with no profiles shows **No institutions yet** and the add
action. A failed load shows **Could not load institutions** with retry, not an
empty-success state or fabricated records. A refresh failure may retain the
last confirmed rows, visibly marked as not refreshed; it must not replace them
with defaults. A missing/deleted edit target or expired session has an explicit
not-found or sign-in outcome and cannot silently create or overwrite a record.
An old account's in-flight response cannot repopulate the view after account
switch or sign-out.

### AC-VALIDATE: metadata and safe destinations

Blank/duplicate acronyms and malformed nonblank email addresses are rejected
with field-specific feedback. Optional whitespace-only fields clear to unset.
Client/LMS choices and their Other names remain consistent; switching away from
Other clears its obsolete name. Profile values render as text, never HTML.

Website fields accept absolute HTTPS URLs with a hostname and no embedded
username/password, query or fragment. This initial restriction deliberately
requires a stable non-secret landing/login URL, avoiding signed links and
credential-bearing redirect parameters. Invalid values are rejected without
silently stripping parts into a different destination. Relative, protocol-
relative, HTTP, script, data, file and browser-extension URLs cannot be saved
or opened through this feature. Existing legacy URLs that violate the new
rules are marked unavailable for opening and require correction before use;
they are not silently rewritten. The app does not fetch destinations on load
or save and does not claim they are reachable merely because syntax is valid.
For a row with a valid LMS URL, **Open LMS** is a visible, explicit action in
that same row. It opens exactly that row's validated URL; it cannot fall back to
another institution's URL, a global default, a prior selection, or a per-course
destination. If the LMS URL is unset, the row shows **LMS link not set** and no
active Open LMS link or navigation occurs. If a saved legacy LMS URL is invalid,
the row shows **LMS link unavailable** with a correction action and no external
navigation. The form rejects a newly entered invalid nonblank LMS URL and
identifies the field. These states are per row. Opening any allowed link is an
explicit user action with a recognizable institution and destination; opening
a new tab cannot give it opener access. The test fixture must assign distinct
valid LMS URLs to at least two institutions, invoke Open LMS from one row, and
assert the exact destination equals only that row's URL; unset and invalid rows
must produce no navigation.

No profile operation accepts password, master-password, API-key, token, vault
export or unlock-secret properties. Unexpected credential properties and
credential-shaped payloads in structured fields are rejected before storage
and omitted from logs/errors/model input. This is a bounded schema and dataflow
claim, not a promise that arbitrary prose can be perfectly classified as a
secret. The UI explicitly identifies these as non-secret profile fields and
directs credentials to the vault; there is no model call in this flow.

### AC-OWNERSHIP: account and institution isolation

The authenticated account owns every directory list/read/create/update/remove.
A caller-supplied user ID or another user's record identifier cannot grant
access. Account A and account B can each save the same acronym and see their
own different values. Within one account, changes/removal of institution A
leave institution B intact. Normalization cannot create case-variant twins.
Persisted records survive sign-out/sign-in and a browser without the old
localStorage values. Browser-local acronyms are never silently assigned to a
newly signed-in account as saved profiles.

Existing user-owned common email, Outlook URL and LMS metadata may prefill an
explicit add for the matching acronym, with their provenance visible. Saving
overlapping fields must leave existing consumers observing the same confirmed
value, not competing editable copies. Unrelated common field IDs, values and
types survive directory edits. Unrecognized legacy metadata remains preserved;
it is not coerced to a new LMS type or cleared on an unrelated edit. Merely
opening the directory performs no import, deletion or migration of user data.

### AC-VAULT: external password-manager boundary

Initial integration is **Bitwarden browser-extension URI matching**. The user
stores the login in Bitwarden and assigns its Website URI there, opens a saved
LMS/faculty/webmail HTTPS link from the directory, and uses Bitwarden on that
external page. Bitwarden documents the Website URI when creating a login and
requires a matching URI for extension autofill. These facts support the
recommended link workflow; they do not establish a direct application API.
Sources checked 2026-10-17:
[browser-extension setup](https://bitwarden.com/help/getting-started-browserext/)
and [browser-extension autofill](https://bitwarden.com/help/auto-fill-browser/).

Help text explains that setup/unlock and account selection happen in the
extension, that the app cannot verify the extension is installed or unlocked,
and that a link is not a successful sign-in. With an absent/locked extension or
no matching login, directory navigation still works and makes no autofill
success claim. No app control reads, displays, copies, stores, logs, sends to
a model, or imports vault passwords, master passwords, API keys, tokens,
exports or unlock secrets. Shared SSO domains may match multiple logins; the
user chooses the correct institutional account in the extension. The app
does not claim its row selection forces Bitwarden's account selection.

### AC-DIAGNOSTICS: bounded representation and feature metrics

The existing diagnostics surface represents the directory's operations and
their results. Its vocabulary is enumerated, not derived from profile text:

- Each directory load, profile create/update/remove, custom-column create/rename,
  row-value save/clear, column remove and explicit external-link dispatch has a
  distinct stable operation name and success/failure outcome. Authentication,
  missing-target, validation and storage failures use fixed reason tokens.
  Empty state is measured as zero institutions, not treated as a failed read.
- Reads and mutations include elapsed milliseconds. Directory reads include
  aggregate institution and custom-column counts. External dispatch records
  only a fixed target category: `email`, `lms`, `faculty-portal`,
  `institution-website`, `custom-column-link` or `password-manager-help`.
  Link dispatch does not claim website availability, login, autofill or vault
  status.

The load result distinguishes empty from failed; mutation failure never appears
as success. External-open success denotes link dispatch only, never website
availability, login, autofill or vault status. Diagnostics include no acronym,
name, email, URL, query, field value, free-text error, raw payload, account ID,
vault label, credential or arbitrary exception contents. Session export carries
the same bounded representation. Reporting failure must not turn an otherwise
successful save into an unsaved state or leak the rejected payload.

### AC-LEVERAGE: later app use and removal oracle

Given different saved profile details and destinations for distinct institutions,
a fresh app visit through **Courses > Institutions** returns those confirmed
details under their correct rows and uses the selected row's stored destination
for an external-open action without re-entry. This criterion fails if the
navigation route/render branch is removed, if saved details stop reaching the
directory on reopen, or if destinations are replaced with defaults or another
institution's values. A helper-only test or write-success assertion is
insufficient. The test seat must construct and sabotage-check the production
reachability/read-back instrument; it must not claim a source assertion renders
the table. The authenticated owner walk measures the actual visible path.

## Instruments and outstanding verification

Automated verification must cover authenticated persistence/action outcomes,
validation, normalization, missing targets, failures/retry, cross-account and
cross-institution isolation, legacy-field preservation, the bounded diagnostics
representation and the mutation-sensitive AC-LEVERAGE path. The test seat owns
oracle construction and maps each instrument to its actual observable boundary.
No component is rendered by this repository's tests; a green suite does not
prove markup, focus, keyboard operation, navigation visibility or autofill.

| Residual obligation | Owner | Instrument and step |
|---|---|---|
| Actual table, add/edit/remove, custom-column lifecycle, unsaved navigation, state announcements, keyboard/focus, per-row LMS link destination and reopen behavior | Repository owner | Authenticated browser walk against the built feature at Verify; create and rename columns, edit/clear row values, cancel and confirm removal, reload, include distinct institutions and an account switch; verify each Open LMS action uses its own row URL. |
| Bitwarden setup, locked/absent/no-match behavior, shared-SSO account selection and successful autofill | Repository owner | Browser extension walk on the actual institutional login pages after build; credentials stay inside the external vault/browser, with only pass/fail observations recorded. |
| Deployed user isolation and persistence across sessions | Repository owner or authorized deployment verifier | Authenticated separate-account database/UI exercise against the deployed schema after migration; mocked tests are not a live RLS proof. |
| Storage compatibility and complete navigation seam | Architecture/plan seats | Inspect actual common-field consumers and navigation validators/restoration before implementation; preserve the acceptance behavior above and expand the owned path list where necessary. |

No product question blocks criteria authoring under this recommended scope.
Direct vault API access and vault-item references require a separately verified
contract and are outside this initial feature. The verification obligations
above remain open until their named instruments run.
