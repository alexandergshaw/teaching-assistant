# Scope: `accessibility_scans`, RLS, and the migration nobody can auto-apply

A scoping pass over Finding 5 of `docs/service-role-predicate-audit.md`
(`:684-700`), re-derived from the tree rather than inherited from it.

- **Write set: this file only.** Nothing under `src/` or `supabase/` was
  modified, no migration was written, and no test was added or run beyond the
  documentation gate in section 12.
- **Measured at** `git rev-parse --short HEAD` -> `32af6aa`, re-checked at
  `2949437` after the auto-commit hook advanced `HEAD` mid-pass (section 13).
  The audit's own quantities table says it measured at `28bc0c5`; the task brief
  names `b5210a8`. All three agree on the bytes that matter:
  `git diff --stat b5210a8 HEAD -- supabase/migrations src/lib/supabase/accessibility.ts src/lib/supabase/accessibility_scans.sql .github/workflows/supabase-migrations.yml`
  prints nothing, and the same command with `28bc0c5` prints nothing. So every
  artifact this document reasons about is byte-identical across all three
  commits, and the commit discrepancy changes no number below.
- **Owner decisions checked first.**
  `grep -rniE "rls|row.level|accessibility_scans|anon key" docs/owner-decisions-2026-09-23.md docs/owner-decisions-2026-09-27.md`
  exits 1 with no output, against a canary of
  `grep -c "^## DECISION"` -> `7` and `4` on those two files proving both were
  read. **No owner decision touches this question**, so nothing here is
  foreclosed by precedent and the fork in section 8 is genuinely open.

  Re-run at `2949437`, because `docs/owner-decisions-2026-09-27.md` gained 35
  lines (DECISION 18, the Tools > Grading container) while this pass was
  running: same empty result, canary now `7` and `4`. The decision that landed
  is unrelated, so the claim holds at both commits rather than only at the one I
  started from.

---

## 0. The headline, and a correction to the premise I was handed

The brief offered a fallback headline: that if nothing in the anon-key path
touches the table, the exposure is theoretical. **I am not taking it, and the
reason is the substance of this section.**

The anon key is not a path through this application. It is a bearer credential
for the Supabase project's own PostgREST endpoint. A holder of it reaches
`<NEXT_PUBLIC_SUPABASE_URL>/rest/v1/accessibility_scans` directly, with no
Next.js route, no server action, and no line of this repo's code in between.
Row-level security is the only thing in that path that can refuse the request.
So the question "does the browser bundle query this table" is the wrong
question for bounding the exposure, and answering it does not make the exposure
theoretical.

**Section 5 answers it anyway, because it is worth knowing: no, the browser
never queries this table.** That fact bounds something real - it means enabling
RLS cannot break the feature, which is exactly what makes the remedy cheap. It
does not bound the exposure.

What the exposure is actually conditional on is four production facts, none of
which is checkable from this checkout (section 7). And one consequence of the
finding is conditional on nothing at all:

> **The DDL lives where the auto-apply Action cannot see it, so whether this
> table exists in production is unknowable from the repository, by
> construction.** That is true today, needs no credential to establish, and is
> the half a migration fixes regardless of how the RLS question resolves.

**Severity, stated as a range because it is conditional, not because it is
vague:** NONE if the table was never created in production, or if someone
enabled RLS on it by hand, or if this project's default grants do not extend to
`anon`/`authenticated`. HIGH if the table exists, RLS is off, and the grants are
Supabase's stock ones - because then every tenant's row is world-readable and
world-writable to anyone who opens the app and reads the key out of the bundle.
There is no middle branch: the three conditions are independent switches and
the outcome flips on the conjunction.

**This is the third document to record this finding.**
`docs/multi-user-login-architecture.md:439-448` recorded it first,
`docs/service-role-predicate-audit.md:684-700` recorded it second (and
`docs/ruling-127.md:32` deliberately scoped it out of the fix wave as "an
owner-only production fact"). A finding that three passes have written down and
no pass has closed is a finding the loop is re-buying rather than banking. That
is an argument for terminating it in section 8, not for a fourth recording.

---

## 1. Re-derivation: is `accessibility_scans` really the only table without RLS

### 1.1 The instrument, and the way my first attempt was wrong

I wrote a Python pass over `supabase/migrations/*.sql`
(`scratchpad/rls_sets.py`) that regex-matched `create table` and
`alter table ... enable row level security`. It reported **51** created tables,
the 51st named `column`.

The cause, located rather than guessed:

```
grep -rniE "create[[:space:]]+table[[:space:]]+(if[[:space:]]+not[[:space:]]+exists[[:space:]]+)?(public\.)?column" supabase/migrations
# supabase/migrations/20261012000000_create_app_users.sql:198:
#   -- than folded into the CREATE TABLE column list above, so this migration
```

**A SQL line comment, matched as a DDL statement.** This is the exact failure
the brief warned about and the audit warned about, and I walked into it on the
first pass. Every number below therefore comes from a **comment-stripped**
parse, and the stripping is not incidental - it is the difference between 51 and
50.

### 1.2 The sets, both directions, two instruments, with a canary

`scratchpad/rls_sets2.py` strips `--` line comments and `/* */` block comments,
then runs **two structurally different** create-table detectors over the
residue: one matching `create table <name>`, one requiring the name be followed
by an opening parenthesis. Output, verbatim:

```
python scratchpad/rls_sets2.py

CANARY migrations: files=110 raw_bytes=262306 code_bytes=107115 comment_bytes=155191 enable-rls-occurrences=50
CANARY src .sql:   files=1 raw_bytes=1135 code_bytes=836 enable-rls-occurrences=0

A  (instrument 1: create table <name>)      = 50
A2 (instrument 2: create table <name> '(' ) = 50
A vs A2 disagreement: []
B  (alter table <name> enable rls)          = 50

A \ B  (migration-created, RLS never enabled): []
B \ A  (RLS enabled on a table no migration creates): []

C  (tables created by .sql under src/) = 1 ['accessibility_scans']
C \ B  (src-created, no RLS in any migration): ['accessibility_scans']
C \ A  (src-created, not created by any migration): ['accessibility_scans']
policies declared in src/ .sql files: {}
```

**The canary is load-bearing, not decoration.** `C \ B` is a one-element set and
`A \ B` is empty; without the canary line those two zeros and that one are
indistinguishable from a walk that read nothing. The canary proves 110 migration
files and 262306 bytes were read, that 155191 of those bytes were comments
(59 percent of the corpus - which is why comment-stripping decided the answer),
that 50 `enable row level security` occurrences were found in migrations, and
that **0** were found in the single `.sql` file under `src/`. A zero with a
nonzero sibling in the same run is a measurement; a zero alone is a shrug.

**Conclusion, reproduced independently of the audit: the audit's F5 is correct.**
The 50 migration-created tables and the 50 RLS-enabled tables are the same set
in both directions, and `accessibility_scans` is the only table declared
anywhere in this tree with no `enable row level security` and no `create policy`
at all.

### 1.3 The `src/` side, measured on the DDL itself

```
python scratchpad/fkshape.py   (tail)

accessibility_scans.sql: 'references' occurrences = 0
accessibility_scans.sql: 'row level security'      = 0
accessibility_scans.sql: 'create policy'           = 0
accessibility_scans.sql: 'user_id' occurrences     = 3  (canary: nonzero)
```

Three zeros, and the fourth line is the canary that makes them mean something:
`user_id` occurs 3 times in the same file the other three patterns score zero
in, so the file was read.

### 1.4 On `src/tools/symbol-count/count.ts`

The brief asked me to note it exists and that its cross-check flag verifies only
a total. **It does not apply to the decisive artifacts here**, which are `.sql`
and `.yml`: both of its instruments are TypeScript compiler entry points
(`ts.createSourceFile` and `ts.createScanner`, `count.ts:15,31`), and the file's
own header narrows its proven surface further - `count.ts:87` says what it was
proven against "remains a plain `.ts` file with no JSX". Feeding it SQL would be
using an instrument outside the range it documents for itself.

**It does apply to one claim that decides something, so I ran it there** - see
section 5.2. It has no CLI entry point; I imported `countSymbolOccurrences`
(`count.ts:346`) from a scratchpad script under
`node --experimental-strip-types`.

### 1.5 A second measurement the remedy depends on: nothing in the migrations grants anything

```
grep -rniE "^[[:space:]]*(grant|revoke|alter default privileges)" supabase/migrations | wc -l
# 0
```

Canary for the same corpus: `grep -rioc "create policy" supabase/migrations | grep -v ":0" | wc -l` -> `45`
files contain at least one `create policy`, so the directory is not empty and
the grep is not silently failing.

**Zero of the 110 migrations issues a single `grant`, `revoke`, or
`alter default privileges`.** Every table-level privilege in this project
therefore comes from the Supabase project bootstrap, which is not in this
repository. That is why section 4's exposure statement is conditional on a grant
I cannot read, and it is why "RLS is optional" in the DDL header is not
obviously false from inside the repo - it is unfalsifiable from inside the repo,
which is a different and worse property.

### 1.6 The sibling foreign-key shape, because the DDL has none

```
python scratchpad/fkshape.py

CANARY files=110 raw_bytes=262306
user_id uuid ... references auth.users:                45 (in 41 files)
... of those, spelled ... (id) on delete cascade:      38
```

Classifying the tail clause of all 45 (same script, tail-grouping variant):
**38 spell `references auth.users (id) on delete cascade` and 7 spell
`references auth.users on delete cascade`, omitting the explicit `(id)`. All 45
carry `on delete cascade`; none omits it.** The audit's "45 ... references
auth.users (id) on delete cascade" is right in substance and slightly loose on
the spelling; I record the split because section 6.3's hazard turns on the
cascade, not on the parenthesis.

`accessibility_scans` has no foreign key at all (section 1.3, `references` = 0),
so its rows do not cascade when an account is deleted. I looked for a purge path
that would compensate:
`grep -rln "delete.*account\|purgeUser\|deleteUserData\|admin.deleteUser" src/app/actions src/lib --include=*.ts`
returns two files (`src/lib/artifact-templates.ts`,
`src/lib/orphan-upload-sweep.ts`), and `grep -rn "admin.deleteUser" src/ --include=*.ts`
returns nothing. **I found no code path that deletes this table's rows on
account deletion.** That is a floor over `src/`, not a proof of absence - a
Supabase dashboard action or a hand-run `delete` would not appear in `src/`.

### 1.7 A broken instrument, recorded because the number it produced looked fine

Measuring the cascade spelling, I first ran:

```
grep -rhoicE "user_id[[:space:]]+uuid[^,)]*references[[:space:]]+auth\.users[[:space:]]*\(id\)[[:space:]]+on[[:space:]]+delete[[:space:]]+cascade" supabase/migrations | grep -v ":0" | wc -l
# 110
```

110 is not a count of anything. `-c` overrides `-o`, so the command reports one
count per file; `-h` then strips the filenames the `:0` filter needed, so every
line survives and `wc -l` counts **files, not matches**. It happens to equal the
migration count exactly, which is the kind of plausible number that ships. The
Python figure (45 / 38) is the one reported above.

---

## 2. Does the DDL sit outside `supabase/migrations`, and does auto-apply skip it

### 2.1 Where the file is

```
ls -a supabase/
# ./  ../  .temp/  config.toml  migrations/

ls -la src/lib/supabase/*.sql
# -rw-r--r-- 1 alexa 197609 1135 Jun 25 21:07 src/lib/supabase/accessibility_scans.sql
```

`supabase/` contains no `.sql` file at its top level. The only `.sql` file
anywhere under `src/` is the one file (section 1.2's canary: `src .sql: files=1`).

### 2.2 What actually applies migrations, established from the workflow, not assumed

`.github/workflows/supabase-migrations.yml`, 100 lines by both instruments.
Two independent reasons a `.sql` file under `src/` is never applied by it:

**The trigger cannot fire.** `:14-20`:

```yaml
on:
  push:
    branches: [main]
    paths:
      - "supabase/migrations/**"
      - ".github/workflows/supabase-migrations.yml"
  workflow_dispatch:
```

A commit touching only `src/lib/supabase/accessibility_scans.sql` matches
neither path filter, so no run is created. (`workflow_dispatch` means a human
can start a run by hand - which is the second reason, below, for why that would
still not help.)

**The command's own scope excludes it.** `:99-100`:

```yaml
      - name: Apply pending migrations
        run: supabase db push
```

`supabase db push` applies the CLI's migrations directory. It is not given a
path argument and there is no step that copies or symlinks anything from `src/`
into `supabase/migrations/`. So even a manual `workflow_dispatch` run - which
bypasses the path filter entirely - would not create this table.

**Both halves matter and neither is redundant.** If only the trigger were the
obstacle, a manual run would fix it; if only the command's scope were, a future
widening of the path filter would look like a fix and not be one.

The workflow's own header agrees, at `:3-4`: it says it "Applies any pending SQL
files in supabase/migrations/". The DDL's header agrees from the other side,
`src/lib/supabase/accessibility_scans.sql:1-2`: "Run once in the Supabase SQL
editor."

**So the audit is right: this table is created by hand or not at all.** The
consequence is the one in section 0 - the repository cannot answer whether it
exists.

### 2.3 What follows for the feature, with no security reasoning at all

`src/lib/supabase/accessibility.ts:6-8` states the design: the module "never
throws - if the table doesn't exist yet, reads return [] and writes no-op, so
the feature still works (scanning fresh) until the table is created." Verified
in the code: `:49-51` (`catch { return []; }`), `:80-82`
(`catch { console.error(...) }`), `:105-107` (`catch { }` with the comment
"ignore - stale rows are harmless").

So if the table does not exist in production, **every accessibility scan
re-scans every item on every course open, silently, forever**, and no instrument
in this repo or in production reports it. The DDL header calls that "the feature
still works", which is true and is also the whole problem: there is no
observable difference between "the cache is working" and "the cache has never
existed". That is a cost question rather than a security question, and it exists
whichever way the fork in section 8 resolves.

I did not measure that cost. It needs a live Canvas course and a live database,
and this checkout has neither.

---

## 3. The stale citation: real, and what it should point at

**Real.** `src/lib/supabase/accessibility.ts:6` reads:

```
 * table (DDL in supabase/accessibility_scans.sql). Mirrors chat-logs: never
```

`supabase/accessibility_scans.sql` does not exist (section 2.1). The correct
current target is **`src/lib/supabase/accessibility_scans.sql`**.

**Measured, so the repair is one line and not a sweep.** A pass over every
`.ts`/`.tsx` file under `src/`, taking only directory-qualified `.sql` paths and
skipping lines containing `://`:

```
python scratchpad/citedsql.py   (refined variant, section 11 row 14)

CANARY ts/tsx files read = 2772
directory-qualified .sql citations: 52  resolve: 51  UNRESOLVED: 1
  UNRESOLVED src/lib/supabase/accessibility.ts:6  supabase/accessibility_scans.sql
```

**Exactly one unresolved citation in the whole tree, and it is this one.** The
unrefined first pass reported 27 unresolved out of 78, all 26 others being bare
migration filenames cited without a directory (`20261008000000_scheduled_releases.sql`),
property accesses that look like paths (`TOPIC_TO_DIR_MAP.sql`,
`src/lib/visualizer.ts:173-175`), and `https://www.sqlite.org/...` fragments.
The refinement that removes all 26 and keeps this 1 is: require a `/` inside the
path and skip any line containing `://`.

**A sequencing note the repair must carry.** If the fork resolves to branch A
(section 8), the DDL moves under `supabase/migrations/` and the correct target
changes a second time. Repairing the citation to `src/lib/supabase/...` and then
moving the file leaves a second stale citation behind, which is the same defect
with a fresh timestamp. So the repair belongs **in the same commit as the
migration** under branch A, and stands alone only under branch B.

**Not in my write set.** `src/lib/supabase/accessibility.ts` is production
source and an implementer is live in this tree; I did not touch it.

---

## 4. What the table holds, and who can read it

### 4.1 The columns, from the DDL

`src/lib/supabase/accessibility_scans.sql:6-20`, all 12 columns:

| Column | Type | What it is |
|---|---|---|
| `user_id` | `uuid not null` | The tenant key. First column of the primary key. **No foreign key** (section 1.3). |
| `institution` | `text not null default ''` | The institution acronym the course belongs to, or `''`. |
| `course_id` | `text not null` | The Canvas course id, parsed from a URL at `route.ts:49`. |
| `item_type` | `text not null` | One of `page`, `assignment`, `quiz`, `discussion`, `announcement`, `syllabus`, `file` (`src/lib/accessibility/types.ts:41-48`). |
| `item_id` | `text not null` | Canvas slug or content id. |
| `item_title` | `text not null default ''` | The Canvas item's title. |
| `fingerprint` | `text not null` | Change-detection hash used to decide whether to re-scan. |
| `error_count` | `integer not null default 0` | Issue counts by severity. |
| `warning_count` | `integer not null default 0` | |
| `suggestion_count` | `integer not null default 0` | |
| `issues` | `jsonb not null default '[]'` | **The findings themselves. See 4.2 - this is the sensitive column.** |
| `scanned_at` | `timestamptz not null default now()` | |

Primary key: `(user_id, institution, course_id, item_type, item_id)`
(`:19`). One index, `(user_id, institution, course_id)` (`:22-23`).

### 4.2 A correction to the audit: `issues` holds course-content HTML, not only issue text

F5 describes the rows as holding "Canvas item ids, titles and accessibility
issue text". Measured, that understates it.

`issues` is serialized from `Issue[]` (`src/lib/supabase/accessibility.ts:21`),
and `Issue` (`src/lib/accessibility/types.ts:24-38`) carries
`locator: IssueLocator`. `IssueLocator` (`:17-22`) is:

```ts
export interface IssueLocator {
  /** CSS selector path (nth-of-type) relative to the content root. */
  selector: string;
  /** The node's outerHTML (truncated) - display + fallback matching. */
  snippet: string;
}
```

and the producer is `src/lib/accessibility/rules-custom.ts:34`:

```ts
  return { selector: cssPath(el, root), snippet: outer.length > 200 ? `${outer.slice(0, 200)}...` : outer };
```

(the real source spells the truncation marker as a single ellipsis character;
reproduced here as three ASCII periods so this document stays ASCII-only.)

**So each issue carries up to 200 characters of the offending node's raw
`outerHTML`, taken verbatim from the instructor's Canvas course content.** Across
the items of a course, the `issues` column is a corpus of course-content
fragments: page bodies, assignment prose, quiz text, discussion and announcement
bodies (all seven `AccessibleItemType` values are scanned and cached). I found
no cap on the number of issues per row.

I have **not** established that any of it is personal data. Whether a discussion
or announcement body in a real course contains a student name is a production
fact about course content, not something this repo can answer. What is
established from source is the class of content: arbitrary instructor-authored
and Canvas-rendered HTML, not a fixed vocabulary of rule identifiers.

`item_title` on `file` rows is additionally **caller-supplied**: `route.ts:99`
reads `body.files` and `:114` stores `f.title` straight into `item_title`. It is
written under the caller's own `user_id`, so this is not a cross-tenant path -
but it does mean unvalidated client text is persisted through the service-role
client, which is worth a sentence in whichever pass owns that route next.

### 4.3 Who writes rows: not only the owner

F5 says the predicate comes "from `requireOwner()`'s `user.id`". That is
literally true and reads as narrower than it is.
`src/lib/supabase/auth.ts:436-453`:

```ts
/**
 * @deprecated Use requireUser() (any active account) or requireAppOwner()
 * (owner only) instead. ...
 * Until this wave lands, this alias is
 * DELIBERATELY LESS RESTRICTIVE than the requireOwner() it replaces for
 * those specific call sites - a tracked, temporary state, not an oversight.
 */
export async function requireOwner(): Promise<AuthorizedUser> {
  return requireUser();
}
```

**`requireOwner` is a thin alias for `requireUser`, so `/api/accessibility` is
reachable by any active account.** The scoping claim survives intact - every
caller gets its own `user.id` from its own session, and no request field can
supply one - so the service-role path remains correctly scoped, exactly as F5
concluded. What changes is the premise underneath the finding: **rows belonging
to several different tenants genuinely coexist in this table**, rather than it
being a single-tenant cache that only theoretically has a tenant column. The
exposure F5 describes has real cross-tenant content to expose.

### 4.4 What a holder of the anon key could do, split by what I can prove

**Provable from this repository:**

- The anon key ships to every browser. `src/lib/supabase/client.ts:56-58`
  constructs `createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, ...)`,
  and its only "use client" importer is `src/context/SupabaseProvider.tsx`
  (`grep -rln 'from "@/lib/supabase/client"' src/` -> 2 files; the other,
  `src/lib/workflows/registry/steps.course-schedule-from-source.ts`, is a
  client-side step catalog). A `NEXT_PUBLIC_` variable read in a client
  component is inlined into the bundle at build time.
- No `create policy` and no `enable row level security` exists for this table
  anywhere in the tree (sections 1.2, 1.3).
- No migration grants or revokes anything (section 1.5).

**Not provable from this repository, and therefore the conditional:** whether
the production project grants `select`/`insert`/`update`/`delete` on
`public.accessibility_scans` to the `anon` and `authenticated` roles. Supabase's
standard project bootstrap sets default privileges in `public` for those roles,
which is the reasoning `docs/multi-user-login-architecture.md:441-445` already
records ("Under Supabase's default grants to `authenticated`, a table with RLS
disabled is readable AND writable by any signed-in browser session holding the
anon key"). I can neither confirm nor refute it from here, because the bootstrap
is not in this repo and no migration restates it.

**The statement, with the conditional where it belongs:** if the table exists in
production, and RLS was not enabled on it by hand, and the project carries
Supabase's stock default privileges, then anyone holding the anon key can
`select` every row of every tenant - including section 4.2's course-content
fragments - and can `insert`, `update` and `delete` arbitrary rows, including
rows attributed to another tenant's `user_id`. Poisoning is as available as
reading: a forged row with a victim's `user_id` and a matching `fingerprint`
would be served to that victim as cached scan results, because
`getCachedScans` (`accessibility.ts:37-52`) reads whatever is there and the
client trusts the `fingerprint` to decide not to re-scan.

If any one of the three conditions fails, the exposure is zero. They are
independent, and nobody has checked any of them.

---

## 5. Is the table reached by the anon-key client at all

### 5.1 The trace, end to end

1. **Browser.** `src/app/components/AccessibilityProvider.tsx:14` -
  `const res = await fetch("/api/accessibility", { ... })`. An HTTP call to this
  app's own origin. `grep -rn "api/accessibility" src/` returns 6 hits; the only
  non-comment, non-test caller is that one.
2. **The route is gated.** `/api/accessibility` is asserted non-public by
  `src/lib/access.test.ts:689` (inside the "gates everything else" case), so it
  is not in the public-path allowlist.
3. **Server guard.** `src/app/api/accessibility/route.ts:36` -
  `const user = await requireOwner();` - which is `requireUser()` (section 4.3).
4. **All six call sites pass the guard's own id.** `route.ts:56,59,73,82,86,117`
  each pass `user.id`. No request field reaches the `userId` parameter.
5. **The accessors use the service-role client only.**
  `src/lib/supabase/accessibility.ts:39,62,93` each call
  `createServiceClient()`, imported at `:1` from `./server`, which reads
  `process.env.SUPABASE_SERVICE_ROLE_KEY` (`src/lib/supabase/server.ts:129`).

### 5.2 The instrument for step 5, since a zero decides it

The claim "this module never constructs an anon-key client" is a zero, so it
needs a canary in the same run. `countSymbolOccurrences` (`count.ts:346`), AST
walk plus lexical scan:

```
node --experimental-strip-types --experimental-default-type=module scratchpad/symcount.ts

src/lib/supabase/accessibility.ts createServiceClient code=4 decl=1 calls=3 refs=0 inComments=0 inStrings=0 naiveGrepLines=4
src/lib/supabase/accessibility.ts createClient         code=0 decl=0 calls=0 refs=0 inComments=0 inStrings=0 naiveGrepLines=0
src/lib/supabase/accessibility.ts createBrowserClient  code=0 decl=0 calls=0 refs=0 inComments=0 inStrings=0 naiveGrepLines=0
src/app/api/accessibility/route.ts requireOwner        code=2 decl=1 calls=1 refs=0 inComments=0 inStrings=0 naiveGrepLines=2
src/app/api/accessibility/route.ts createServiceClient code=0 decl=0 calls=0 refs=0 inComments=0 inStrings=0 naiveGrepLines=0
```

`createServiceClient` at 4 real code occurrences (1 import declaration + 3
calls) in the same file and the same run where `createClient` and
`createBrowserClient` are both 0. **The two zeros are measured, not assumed.**
The AST instrument also cannot be fooled by a mention in the module's JSDoc
header, which is the reason to use it here rather than `grep -c`.

The tool's own stated blind spot applies and I state it: a client constructed
via a name built by string concatenation or a template substitution is invisible
to both of its instruments (`count.ts`, "WHAT THIS TOOL CANNOT SEE"). I read the
whole 108-line module and saw no such construction, which is a reading claim on
top of the measurement.

### 5.3 The answer, and the latent hazard it does not cover

**No. Nothing in the browser path queries `accessibility_scans`.** The browser
calls a gated route handler; the route handler uses the service-role client,
which bypasses RLS entirely. Two consequences:

- **Enabling RLS on this table cannot break the feature as it stands today.**
  This is the fact that makes section 6's ordering hazard small, and it is why I
  can recommend the remedy at all.
- **It does not bound the exposure**, for the reason in section 0: PostgREST is
  reachable without this app.

**The latent hazard, which is real and cheap to state.** The table IS in the
generated `Database` type: `src/lib/supabase/types.ts:340-345` declares
`accessibility_scans`, and `AccessibilityScansRow` is at
`src/lib/supabase/types.tables-a.ts:5-18`. The browser client is constructed as
`createBrowserClient<Database>` (`client.ts:56`). So a future client component
writing `supabase.from("accessibility_scans").select(...)` **typechecks and
lints clean**, and today it would also succeed at runtime against a table with
no RLS, returning every tenant's rows. Nothing in this repo refuses it. That is
not a current defect; it is a reason the remedy should not wait on someone
discovering it.

---

## 6. The remedy: a migration that has not been written

**I did not write it.** Migrations here auto-apply on push to `main`
(section 2.2), so a migration in this repo is a production change, and one that
could make a table unreadable is not something a scoping pass lands. What
follows is its shape, for whichever wave the owner authorizes.

### 6.1 Location, name and what makes it idempotent

One new file under `supabase/migrations/`, named with a timestamp prefix sorting
after the current maximum. `src/lib/supabase/accessibility_scans.sql` is then
deleted in the same commit (leaving it behind would be a second source of truth
for one table), and `accessibility.ts:6`'s citation is repointed at the new path
in that same commit (section 3).

The migration must be correct in **both** production states, because nobody
knows which one holds:

- **Table absent:** the migration creates it, enables RLS, and adds the policies.
- **Table already present from a hand-run:** `create table if not exists` is a
  no-op for the table, `create index if not exists` a no-op for the index, and
  the RLS enable plus the policies apply to the existing table with its existing
  rows.

Both converge on the same end state, which is the property that makes this
landable without knowing the answer to section 7's first question. It is also
why the existing DDL's `if not exists` spellings must be preserved rather than
tidied away.

Re-apply safety follows the established local shape:
`supabase/migrations/20260825000000_create_cartridge_drops.sql` (76 lines, both
instruments) precedes each `create policy` with
`drop policy if exists "<name>" on public.<table>;` - `:33,38,43,48`. That makes
the whole file re-runnable, which matters because the Action can be re-triggered
by hand (`workflow_dispatch`, `:20`).

### 6.2 The policy shape

The four own-row policies, copied in form from `cartridge_drops` `:31-51`:

```
alter table public.accessibility_scans enable row level security;

drop policy if exists "Users read own accessibility_scans" on public.accessibility_scans;
create policy "Users read own accessibility_scans"
  on public.accessibility_scans for select
  using (auth.uid() = user_id);

-- ... the same for insert (with check), update (using), delete (using)
```

`auth.uid() = user_id` is the right predicate here because `user_id` is the
tenant key and is the first column of the primary key
(`accessibility_scans.sql:6,19`), and because every write already supplies the
caller's own id (section 5.1, step 4). All four verbs are wanted rather than
`select` alone: `upsertScans` inserts and updates, `deleteScans` deletes, and a
future move of any accessor to the RLS-bound client would need the matching
policy or fail silently under section 2.3's swallowed errors.

**`service_role` bypasses RLS**, so all three existing accessors keep working
unchanged after this lands. That is the claim section 5 exists to support, and it
is the one an adversarial reader should attack hardest, because the whole
"cannot break the feature" argument rests on it.

### 6.3 The ordering hazard, stated honestly rather than dramatically

**The generic hazard.** `alter table ... enable row level security` on a table
with no policies is deny-all for every non-`service_role` client. If the enable
lands in one migration and the policies in a later one, every non-service reader
is refused in the window between them.

**Why it is small here, specifically.** The only reader is the service-role
client (section 5), which is not subject to RLS. So the window has no victim
today.

**Why it is nonetheless not zero, and this is the part that would actually
hurt.** Three things stack:

1. `src/lib/supabase/accessibility.ts` swallows every error. A read failure
  returns `[]` (`:47,49-51`); an upsert failure logs to `console.error`
  server-side and returns (`:79-82`); a delete failure is silently ignored
  (`:105-107`). So if RLS ever did refuse a query on this path, **the symptom is
  not an error - it is a cache that stops working**, indistinguishable from the
  table not existing (section 2.3). A break here is silent by construction.
2. `requireOwner`'s deprecation note (`auth.ts:436-447`) says reclassifying its
  ~105 call sites is a scheduled follow-up wave. A wave touching this route is
  foreseeable, and a wave that moved an accessor to the RLS-bound client would
  land inside any policy gap without anything going red.
3. `RUNTIME: supabase db push` applies files in filename order under a
  `concurrency` group that never cancels (`supabase-migrations.yml:25-27`), and
  a failed migration blocks the ones after it. A two-file split is therefore two
  chances to leave production between states.

**So the construction requirement is: the enable and all four policies go in ONE
migration file, adjacent, in that order.** Then no ordering exists to get wrong,
and no claim about transaction boundaries has to be true for it to be safe. I
deliberately do **not** assert that `supabase db push` wraps each migration file
in a transaction; I did not verify that, and same-file placement is the
recommendation precisely because it does not depend on the answer.

### 6.4 The foreign key: a decision the implementer must make, and I am not making it

Every one of the 45 sibling `user_id` columns carries
`references auth.users ... on delete cascade` (section 1.6). This table carries
none.

Adding it is attractive and is **not obviously safe**: if the table already
exists in production and holds rows whose `user_id` no longer has an
`auth.users` row - which is exactly what a table with no cascade accumulates
(section 1.6) - then `alter table ... add constraint ... references auth.users`
**fails on apply**, and a failed migration under this Action blocks every
migration after it (section 6.3, point 3). The repair would then need a
production incident rather than a push.

The two safe forms are: (a) omit the foreign key from this migration and file it
as its own row, or (b) precede the constraint with a
`delete from public.accessibility_scans where user_id not in (select id from auth.users);`
and accept that this deletes production rows on apply.

**My recommendation is (a)**, because the cache is regenerable by design
(section 2.3) so orphan rows cost storage and nothing else, and because a
migration that deletes production rows is a much larger thing to land than the
RLS fix it would be riding along with. **I am not deciding it**, because it is
not the fork the owner was asked and because the decision depends on section 7's
unanswerable first question.

### 6.5 What the migration deliberately does not change

Not the accessors, not the route, not the guard, not the types. The service-role
path is already correctly scoped (F5's own finding, reproduced at section 5.1),
so there is nothing for this remedy to fix in `src/`. Only the citation moves
(section 3), and only because the DDL's path does.

---

## 7. What this pass does NOT settle, and why

Four production facts, none checkable from this checkout. There is no `.env`
here, vitest is node-env and `vitest.setup.ts` throws on any real `fetch`, and
no component is rendered by any test - so there is no database connection, no
anon key, and no browser available to any instrument I could write.

1. **Whether `accessibility_scans` exists in production.** It applies only by
  hand (section 2.2), and whether a hand-run happened is not recorded anywhere
  in this repository. **I looked**: `grep -rn "accessibility_scans"` across the
  tree returns 18 hits, every one of them a code reference, a generated type, or
  a doc recording this same finding. No run log, no applied-migrations table, no
  note.
2. **Whether someone enabled RLS on it by hand.** Same reason. A hand-run DDL
  invites hand-run follow-ups and neither leaves a trace here.
3. **Whether this project's default privileges grant `anon`/`authenticated`
  access to `public` tables.** Section 1.5 measured that no migration says; the
  bootstrap is outside the repo.
4. **Whether rows for more than one tenant actually exist.** Section 4.3
  establishes that the code path allows it; whether more than one account has
  ever opened the accessibility tab is a production fact.

**These are owner facts and I am not inferring them.** In particular I am not
reading "the service-role path is correctly scoped" as evidence that the table
is safe, and I am not reading "no browser code queries it" as evidence that no
exposure exists (section 0).

One more thing I could not determine, unrelated to credentials: **the cost of
the cache never existing** (section 2.3). It needs a live Canvas course.

---

## 8. The owner fork, shaped so every answer ends the activity

**The question.** Should `accessibility_scans` come under the migration system,
or stay a hand-run operational table?

### Branch A - bring it under migrations

One new migration file: `create table if not exists` (the existing DDL body,
unchanged), `create index if not exists`, `enable row level security`, and the
four own-row policies, all in that one file (section 6). No foreign key
(section 6.4, form (a)). Same commit deletes
`src/lib/supabase/accessibility_scans.sql` and repoints
`accessibility.ts:6`.

**What it costs if this is the wrong choice.** One migration reaches production
on the next push to `main`, and one revert migration is the way back - there is
no in-place undo. If some client I did not find reads this table without the
service role, enabling RLS breaks it **silently**, because every error on that
path is swallowed (section 6.3). Section 5 is the evidence that no such client
exists, and it is a source-reading claim. If the table already exists with a
different shape than the DDL - a column added by hand - `create table if not
exists` will not reconcile it, and the policies still apply, so the failure mode
is a shape mismatch nobody notices rather than a failed apply.

**What it buys.** The exposure closes under all three of section 4.4's
conditions at once, without anyone having to determine which of them hold. The
table's existence in production becomes a repository fact instead of an
unknowable one, which also closes section 2.3's silent-degradation question. And
it makes the instruments in section 9 landable, one of which fails on today's
tree with no mutation needed.

### Branch B - leave it hand-run

The DDL stays under `src/`. Repair only the citation (section 3). The RLS
question becomes a permanent owner-owned residual: the owner checks the four
facts in section 7 in the Supabase dashboard and, if needed, runs the enable and
the policies by hand in the SQL editor.

**What it costs if this is the wrong choice.** The exposure in section 4.4 stays
exactly as measured, for an unbounded time, on a table holding up to 200-character
fragments of every scanned item of every course of every tenant (section 4.2).
Nothing in the repository will ever detect it, and the next audit rediscovers it
- this being already the third recording (section 0). The latent
`Database`-typed browser reach (section 5.3) stays unrefused. And the
existence question stays unanswerable, so the cache may be silently doing
nothing in production today.

**What it buys.** Zero production change from this row. If the table does not
exist in production and never will, branch A's migration creates a table for a
cache nobody is using - a real, if small, cost, and the only thing branch B is
genuinely better at.

### Recommendation

**Branch A, no foreign key, enable and all four policies in one migration file.**
The reasoning in one line: branch A is correct under every one of section 7's
four unknowns, and branch B is correct only under the specific combination where
the table does not exist in production - which is the combination that also
means the accessibility cache has never worked.

### Why every answer terminates

- **"A"** produces one backlog row: one implementer wave, write set
  `supabase/migrations/<new>.sql` (new), `src/lib/supabase/accessibility_scans.sql`
  (deleted), `src/lib/supabase/accessibility.ts` (one comment line), plus the two
  instruments in section 9. Nothing is left to decide; the FK sub-choice is
  pre-resolved to "omit" by this recommendation and can be overridden in one word
  without reopening anything else.
- **"B"** produces one citation repair (`accessibility.ts:6`) and one permanent
  owner-owned residual (RES-A11Y-1 below), and withdraws RES-A11Y-2. Also nothing
  left to decide.
- **"A but with the FK"** is branch A plus section 6.4's form (b), which means the
  migration also deletes orphan rows. Still one wave, still nothing to study.

None of the three opens an investigation, and none of them needs section 7's
answers first. That is the property being asked for: the answer ends this
activity, and anything still unproven afterwards is in section 10 with an owner,
an instrument and a step.

---

## 9. The instruments the remedy needs

**I ran none of these, and none of them exists.** My write set is this one
document; I added no test file and modified no source. Each entry therefore
names the mutation that must be shown to make it fail **before** it is trusted -
except where the instrument already fails on today's tree, which I mark, because
that is a stronger proof than a mutation and it is free.

Each pass condition names three things: the object under comparison, the
instrument producing each quantity, and the direction of failure.

### INST-1: the migration's own text declares RLS and four policies

- **Object.** The new migration file's **comment-stripped** text.
- **Instrument.** An offline structural test in the established local idiom:
  `src/lib/knowledge-overview.migration.test.ts` (203 lines by `wc -l` and by
  `@(Get-Content).Count`), which does `readFileSync` on a migration path
  (`:27-34`) and strips `--` lines (`:41-45`) before asserting. Its own header
  (`:14-22`) explains why stripping is mandatory: the file narrates a rejected
  design in prose, so a raw-text match double-counts. That is the same trap
  section 1.1 caught me in.
- **Pass condition.** Exactly one `alter table ... public.accessibility_scans
  enable row level security`, and exactly four `create policy ... on
  public.accessibility_scans` - one each for `select`, `insert`, `update`,
  `delete` - each with `auth.uid() = user_id`, all in this one file.
- **Direction of failure.** RED if the enable line is absent, if fewer than four
  policies are present, if any policy names a different predicate column, or if
  the enable and the policies are not in the same file.
- **Mutation that must be shown to fail it, since it cannot fail today (the file
  does not exist):** delete the `enable row level security` line from the
  migration and observe RED; separately delete the `for delete` policy and
  observe RED. Both must be demonstrated against the real file, in the
  `docs/ruling-127.md` RED/GREEN idiom, not described.
- **Its ceiling, stated.** This proves the migration's TEXT. It does not prove
  the migration APPLIED, and nothing in this repo can - section 7.

### INST-2: no table anywhere in the tree lacks RLS

- **Object.** Two derived sets: tables created by any `.sql` file under
  `supabase/migrations` or under `src`, against tables carrying an
  `enable row level security` in `supabase/migrations`.
- **Instrument.** The comment-stripped two-detector parse of section 1.2, ported
  into a `*.test.ts`. The canary belongs in the test, not just in the report:
  assert the file count and the byte count are nonzero, and assert the two
  create-table detectors agree, so a broken walk fails loudly instead of
  reporting an empty difference.
- **Pass condition.** The set difference `created \ rls_enabled` is empty.
- **Direction of failure.** RED if any created table has no RLS enable.
- **It needs no mutation, because it is RED on today's tree.** Section 1.2
  measured that difference as `['accessibility_scans']` right now. So this
  instrument is self-proving: red before the migration, green after, which is
  exactly the pair `docs/ruling-127.md` demands, obtained without touching
  production source to manufacture a failure.
- **Therefore it can only land WITH or AFTER the migration.** Landing it first
  turns the suite red for a defect it is meant to prevent recurring. Under branch
  B it cannot land at all, which is part of what branch B costs.
- **Its ceiling.** It proves the declaration, never the database. It also cannot
  see a table created by anything that is not a `.sql` file in this repo.

### INST-3: every `.sql` path cited in `src/` resolves on disk

- **Object.** Directory-qualified `.sql` path strings appearing in `src/**/*.ts`
  and `src/**/*.tsx`, against the filesystem.
- **Instrument.** The refined scan of section 3: require a `/` in the candidate,
  skip lines containing `://`, resolve repo-relative and relative to the citing
  file. Canary: assert the walked-file count is nonzero and that the resolving
  count is at least 50, so a scan that finds nothing cannot pass by finding
  nothing.
- **Pass condition.** The unresolved count is 0.
- **Direction of failure.** RED if any cited path does not exist.
- **It needs no mutation either: it is RED on today's tree, with a measured
  failure count of exactly 1** (`src/lib/supabase/accessibility.ts:6`, section
  3). It goes green on the citation repair and stays green only if the branch-A
  file move and the citation repair land together - which makes it the enforcer
  of section 3's sequencing note rather than a nice-to-have.
- **Its ceiling, and the reason the refinement is part of the instrument.** The
  unrefined form reports 27 failures, 26 of them false (bare migration
  filenames, `TOPIC_TO_DIR_MAP.sql` property accesses, `sqlite.org` URL
  fragments - all listed in section 3). An instrument that cries 27 to catch 1
  gets deleted by the next person who sees it fail. The refinement must ship with
  it, and the 26 exclusions must be asserted as exclusions, not filtered
  silently.

### What no instrument here can do

None of these three observes production. **Sections 4.4 and 7's conditional is
not closable by any test in this repository**, and I am not proposing one that
pretends otherwise. That is the whole content of RES-A11Y-1.

---

## 10. Disposition of the prior requirements this document consumes

| Prior requirement | Where | Disposition |
|---|---|---|
| F5: `accessibility_scans` is outside the migration system and has no RLS | `docs/service-role-predicate-audit.md:684-700` | **KEPT**, re-derived independently (section 1.2), with three corrections below. Nothing in it was withdrawn. |
| F5's claim that the service-role path is correctly scoped | same, `:692-694` | **KEPT and confirmed** - section 5.1 re-walked all six call sites. |
| F5's claim that the predicate is `user_id` from `requireOwner()` | same | **KEPT, PREMISE CORRECTED.** `requireOwner` is a deprecated alias for `requireUser` (`auth.ts:436-453`), so any active account reaches the route. The scoping conclusion survives; the finding is stronger than it reads, because multiple tenants' rows genuinely coexist (section 4.3). |
| F5's description of the row contents as "Canvas item ids, titles and accessibility issue text" | same, `:697-698` | **KEPT, WIDENED.** `issues` carries `locator.snippet`, up to 200 characters of the offending node's raw `outerHTML` (`rules-custom.ts:34`), so the rows hold course-content fragments, not only issue text (section 4.2). |
| F5's stale-citation report | `docs/service-role-predicate-audit.md:252-255` | **KEPT and confirmed**, and now bounded: exactly 1 unresolved `.sql` citation exists in the whole tree (section 3). Still not repaired - outside this pass's write set too. |
| RES-E: whether the table exists in production and whether RLS was hand-enabled | same, `:839` | **SPLIT AND CARRIED.** The owner-observation half becomes RES-A11Y-1; the "migration move is a schedulable wave regardless" half becomes RES-A11Y-2, now gated on section 8's fork rather than merely unscheduled. |
| RES-E's instrument: "the owner's own `select` against the table with the anon key" | same | **KEPT, SHARPENED - this is a real gap.** An empty result does not distinguish "RLS is on" from "the table does not exist" from "no grant to `anon`". As written, the instrument cannot fail informatively. RES-A11Y-1 replaces it with three distinguishable observations (below). |
| `docs/multi-user-login-architecture.md:439-448`, pre-existing defect 1 | that file | **SUBSUMED, not withdrawn.** It is the same finding, recorded first, and it supplies the default-grants reasoning section 4.4 leans on. Its own framing - "fixed in the same chunk that creates the second account" - is now moot in one direction: `requireOwner` already admits any active account (section 4.3), so the trigger it named has effectively fired. |
| `docs/ruling-127.md:32`'s scoping-out of Finding 5 as "an owner-only production fact" | that file | **PARTLY OVERTURNED, with the reason.** The production observation is owner-only and stays so (RES-A11Y-1). The migration is not: sections 6.1 and 6.2 land correctly without knowing any of section 7's answers, because both production states converge. So the half ruling-127 deferred as unknowable is smaller than it looked. |

**Nothing is withdrawn**, so there is no withdrawal row and no enforcer left
unprotected. The one thing I am declining to do - write the migration - is
declined under the brief's own instruction and is carried as RES-A11Y-2, not
dropped.

---

## 11. Residual register

Each entry names an owner, an instrument, and the step that will measure it.
An entry missing any of the three is a deletion; I have called none of these
that.

| Id | What is not proven now | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| RES-A11Y-1 | Whether `accessibility_scans` exists in production, whether RLS is on it, and whether `anon`/`authenticated` hold grants on it. Section 4.4's exposure is the conjunction of these three and I can measure none of them | repo owner - no `.env`, no live database, network blocked under vitest | **Three distinguishable observations, not one `select`** (RES-E's single-select form cannot tell its failure modes apart). In the Supabase SQL editor as the project owner: (1) `select count(*) from public.accessibility_scans;` - an error means the table does not exist and the whole exposure is moot; (2) `select relrowsecurity from pg_class where relname = 'accessibility_scans';` - `true` means someone enabled it by hand and the exposure is closed; (3) `select grantee, privilege_type from information_schema.role_table_grants where table_name = 'accessibility_scans';` - the presence of `anon` or `authenticated` is what turns (1)+(2)=exists+off into a live exposure. Direction: exposure is live only if (1) succeeds AND (2) is false AND (3) lists either role | Owner-only, and it does NOT gate section 8's branch A - sections 6.1/6.2 are correct under every combination of the three answers. It gates only how urgently branch A ships, and whether a production incident (rather than a push) is warranted |
| RES-A11Y-2 | The migration itself is not written. This pass establishes its shape, its idempotency requirement, its policy predicate and its one-file ordering constraint, and writes none of it | repo owner decides via section 8's fork; one implementer wave executes | INST-1 and INST-2 from section 9. INST-2 is RED on today's tree with no mutation needed, so the RED/GREEN pair is free; INST-1 needs its two mutations demonstrated (delete the enable line; delete the `for delete` policy) | The implementer wave section 8 branch A authorizes. **Withdrawn outright if the owner answers B** - and if B is answered, INST-2 cannot land either, which is stated in branch B's cost |
| RES-A11Y-3 | Whether the foreign key `user_id references auth.users on delete cascade` can be added. All 45 sibling columns carry it (section 1.6); this one has none; adding it fails on apply if orphan rows exist, and a failed migration blocks every later one | repo owner, because the safe alternative deletes production rows | Section 6.4's two forms. Form (a) omits the FK - no instrument needed beyond INST-1. Form (b) requires the owner first run `select count(*) from public.accessibility_scans s where not exists (select 1 from auth.users u where u.id = s.user_id);` - a nonzero result means form (b) deletes that many production rows on apply. Direction: form (b) is only safe if the owner accepts that count | Folded into RES-A11Y-1's dashboard visit, since it is one more query in the same session. My recommendation is form (a), which needs no answer at all |
| RES-A11Y-4 | The stale citation at `src/lib/supabase/accessibility.ts:6` is confirmed and unrepaired. Exactly 1 unresolved `.sql` citation exists tree-wide (section 3) | the wave that touches `src/lib/supabase/accessibility.ts` - outside this pass's write set, and an implementer is live in this tree | INST-3, which is RED today with a measured failure count of exactly 1, and green on the repair. No mutation needed | Under branch A: the same commit as the migration, because the correct target changes when the DDL moves (section 3). Under branch B: a standalone one-line commit |
| RES-A11Y-5 | Whether the accessibility cache is doing anything in production at all. If the table was never hand-created, every scan re-scans every item forever and every error is swallowed (`accessibility.ts:47-51,79-82,105-107`), so the two states are indistinguishable from outside | repo owner - needs a live Canvas course and a live database | RES-A11Y-1's observation (1) answers the existence half. The cost half needs a real course open twice with the second open timed; there is no instrument for it here | Folded into RES-A11Y-1. This is a cost and observability question, not a security one, and it exists under both branches |
| RES-A11Y-6 | `item_title` on `file` rows is caller-supplied text persisted through the service-role client (`route.ts:99,114`) with no validation. It is written under the caller's own `user_id`, so this is not a cross-tenant path - but it is unvalidated client text in a persisted column | the next pass that owns `src/app/api/accessibility/route.ts` | A unit test asserting `upsertScans` is called with a bounded, type-checked `item_title`. Direction: FAILS if an arbitrary-length or non-string body value reaches the row. Not written; not in this write set | The next wave touching that route. Filed because I found it while tracing section 5.1, not because this scope covers it |

---

## 12. Every quantity, with the command that produced it

Run from the repo root at `32af6aa`. `scratchpad/*.py` and `scratchpad/*.ts`
were written to this session's scratchpad directory, not to the repo.

| Quantity | Command | Value |
|---|---|---|
| Migration files | `ls supabase/migrations \| wc -l` | 110 |
| Tables created by migrations, instrument 1 (comment-stripped `create table <name>`) | `python scratchpad/rls_sets2.py` | 50 |
| ... instrument 2 (same, name must be followed by `(` ) | same script | 50, disagreement set `[]` |
| ... the same count WITHOUT comment-stripping | `python scratchpad/rls_sets.py` | **51** - the 51st is `column`, from a comment at `20261012000000_create_app_users.sql:198` |
| Tables with `enable row level security` in migrations | `python scratchpad/rls_sets2.py` | 50 |
| created \ rls_enabled | same script | `[]` |
| rls_enabled \ created | same script | `[]` |
| Tables created by `.sql` under `src/` | same script | 1: `accessibility_scans` |
| ... of those, with no RLS enable anywhere in migrations | same script | 1: `accessibility_scans` |
| ... of those, not created by any migration | same script | 1: `accessibility_scans` |
| `create policy` statements in `src/` `.sql` files | same script | 0 (`policies declared in src/ .sql files: {}`) |
| Canary: migration bytes read / comment bytes stripped / RLS occurrences | same script's CANARY line | 262306 / 155191 / 50 |
| Canary: `src/` `.sql` files read / bytes / RLS occurrences | same script's CANARY line | 1 / 1135 / 0 |
| `grant` / `revoke` / `alter default privileges` in migrations | `grep -rniE "^[[:space:]]*(grant\|revoke\|alter default privileges)" supabase/migrations \| wc -l` | 0 |
| ... canary for the same corpus | `grep -rioc "create policy" supabase/migrations \| grep -v ":0" \| wc -l` | 45 files |
| `user_id uuid ... references auth.users` in migrations | `python scratchpad/fkshape.py` | 45, in 41 files |
| ... spelled `(id) on delete cascade` | same script, tail-grouping variant | 38 |
| ... spelled `on delete cascade` without `(id)` | same | 7 (38 + 7 = 45; all 45 cascade) |
| `references` / `row level security` / `create policy` in the DDL | `python scratchpad/fkshape.py` | 0 / 0 / 0 |
| ... canary in the same file | same | `user_id` occurs 3 times |
| `.sql` files at the top level of `supabase/` | `ls -a supabase/` | 0 (`.temp/`, `config.toml`, `migrations/`) |
| Directory-qualified `.sql` citations in `src/**/*.{ts,tsx}` | refined `scratchpad/citedsql.py` (require `/`, skip lines with `://`) | 52 cited, 51 resolve, **1 unresolved** |
| ... the unresolved one | same | `src/lib/supabase/accessibility.ts:6  supabase/accessibility_scans.sql` |
| ... canary: `.ts`/`.tsx` files walked | same | 2772 |
| ... the same scan unrefined, for contrast | `scratchpad/citedsql.py` first form | 78 cited, 27 unresolved (26 false: bare filenames, `TOPIC_*.sql` property accesses, `sqlite.org` URLs) |
| `createServiceClient` in `accessibility.ts`, AST + lexical | `node --experimental-strip-types scratchpad/symcount.ts` via `countSymbolOccurrences` (`count.ts:346`) | code=4 (1 decl + 3 calls), inComments=0, inStrings=0 |
| `createClient` in `accessibility.ts` | same run | **0** |
| `createBrowserClient` in `accessibility.ts` | same run | **0** |
| `requireOwner` in `route.ts` | same run | code=2 (1 decl + 1 call) |
| `createServiceClient` in `route.ts` | same run | 0 |
| Callers of the three accessors | `grep -rn "getCachedScans\|upsertScans\|deleteScans" src/ --include=*.ts --include=*.tsx` | 10 lines; 6 call sites, all in `src/app/api/accessibility/route.ts` (`:56,59,73,82,86,117`) |
| ... canary for that grep | `grep -rn "rowToItemScan" src/ ...` | 2 lines in `accessibility.ts` (`:24,48`) |
| Importers of the browser anon client | `grep -rln 'from "@/lib/supabase/client"' src/ \| wc -l` | 2 (`src/context/SupabaseProvider.tsx`, which is `"use client"`) |
| Browser callers of the route | `grep -rn "api/accessibility" src/ --include=*.ts --include=*.tsx` | 6 hits; 1 real caller, `AccessibilityProvider.tsx:14` |
| All references to the table name, tree-wide | `grep -rn "accessibility_scans" . --exclude-dir={node_modules,.git,.next,.claude}` | 18, all code / generated types / docs. No run log or applied-migration record |
| RLS mentions in owner decisions | `grep -rniE "rls\|row.level\|accessibility_scans\|anon key" docs/owner-decisions-2026-09-23.md docs/owner-decisions-2026-09-27.md` | 0 (exit 1) |
| ... canary for those two files | `grep -c "^## DECISION" <both>` | 7 and 4 |
| Relevant paths changed between the audit's commits and HEAD | `git diff --stat b5210a8 HEAD -- supabase/migrations src/lib/supabase/accessibility.ts src/lib/supabase/accessibility_scans.sql .github/workflows/supabase-migrations.yml`, and the same with `28bc0c5` | both empty - byte-identical |
| Relevant paths changed while this pass ran (`32af6aa` -> `2949437`) | `git diff --stat 32af6aa HEAD -- supabase/ src/lib/supabase/ src/app/api/accessibility/ src/lib/accessibility/ .github/workflows/` | empty. The four files that did change are `AGENTS.md`, `docs/BACKLOG.md`, `docs/backlog.yml`, `docs/owner-decisions-2026-09-27.md` |
| This file's size | `wc -l docs/accessibility-scans-rls-scope.md` | measured in section 13, not estimated here |

### Sizes, both instruments

`wc -l` and PowerShell `@(Get-Content <path>).Count`, because
`docs/loop/this-repo.md:5-12` records that the two disagree by 15 to 138 on real
files here, and a gap not measured on THESE files is not 42.

| File | `wc -l` | `@(Get-Content).Count` |
|---|---|---|
| `src/lib/supabase/accessibility_scans.sql` | 23 | 23 |
| `src/lib/supabase/accessibility.ts` | 108 | 108 |
| `src/app/api/accessibility/route.ts` | 133 | 133 |
| `.github/workflows/supabase-migrations.yml` | 100 | 100 |
| `docs/service-role-predicate-audit.md` | 895 | 895 |
| `src/lib/knowledge-overview.migration.test.ts` | 203 | 203 |
| `supabase/migrations/20260825000000_create_cartridge_drops.sql` | 76 | 76 |

Both instruments agree on all seven. This file's own size is in section 13,
measured after the last edit rather than estimated.

---

## 13. Gate and tree state

**Documentation gate.** `npm run docs:gate` expands to
`npm run test:paths src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts src/tools/vitest-paths/gate-commands.structure.test.ts`
(`package.json:22`), which is the wrapper form with one `COVERED` line per
argument. Run against this file after the last edit:

```
npm run docs:gate

 Test Files  3 passed (3)
      Tests  49 passed (49)
COVERED src/lib/no-emojis.test.ts files=1 passed=18
COVERED src/source-bytes.structure.test.ts files=1 passed=3
COVERED src/tools/vitest-paths/gate-commands.structure.test.ts files=1 passed=28
```

`no-emojis.test.ts` scans `roots = ["src", "docs"]` including `.md`, so
this file is in its scope; `gate-commands.structure.test.ts` freezes the exact
set of raw multi-path test commands in `docs/**/*.md` (its header, `:5`), which
is why **every multi-path command quoted in this document uses the
`npm run test:paths` wrapper** - its S8 filter exempts `family === "wrapper"`
(`:44`) and nothing else.

This document deliberately contains no non-ASCII character. The one place the
real source uses a horizontal ellipsis (`rules-custom.ts:34`) is transcribed as
three periods in section 4.2, with that substitution stated where it is made.

**This file's own size**, measured after the last edit rather than estimated,
with both instruments (`wc -l` and `@(Get-Content).Count`). The values are in
the hand-off report for this pass; the two agreed. Re-measure rather than
trusting a number in a document that has been edited since it was written - the
audit's own size row (`:892`) says the same thing for the same reason.

**Tree state.** `git status --short` prints exactly one entry attributable to
this pass, `?? docs/accessibility-scans-rls-scope.md`. A second untracked entry,
`?? docs/tools-grading-subtab-ac.md`, appeared during the pass; it is a
concurrent sibling seat's artifact (DECISION 18's acceptance criteria) and not
mine. No file under `src/` or `supabase/`
was modified by this pass, no migration was written, and the four files the live
implementer holds (`GradingTab.tsx`, `useIncrementalGradingRun.ts`,
`incrementalRunPlan.ts`, and their tests) were not opened for writing. No
`git stash`, `git add -A` or `git checkout --` was run.
