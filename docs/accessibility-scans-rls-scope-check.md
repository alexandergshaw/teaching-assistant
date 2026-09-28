# Round-1 adversarial check: `docs/accessibility-scans-rls-scope.md`

Fresh checker. I did not author the scope. Read-only pass; my write set is this
one file. No migration written, no source edited, no commit, no push, no
`git stash`, no `git add -A`, no `git checkout --`.

- **Measured at** `git rev-parse --short HEAD` -> `98c38ee`. The scope measured
  at `32af6aa` and re-checked at `2949437`; the auto-commit hook has advanced
  `HEAD` twice more since. Its byte-identity claim still holds at this fourth
  commit (section E8 below), so every fact it reasons about is unchanged.
- **Subject size**, both instruments: `wc -l docs/accessibility-scans-rls-scope.md`
  -> 1066; `@(Get-Content docs/accessibility-scans-rls-scope.md).Count` -> 1066.
- **My instruments** were written to this session's scratchpad directory, not to
  the repo: `chk_stmts.py` (SQL statement tokenizer), `chk_polshape.py`
  (per-table policy shape), `chk_fk.py` (column-definition walker),
  `chk_cited.py` (string-literal and comment scanner). All four are structurally
  different from the scope's line-regex instruments: comments and string
  literals are consumed by a character scanner BEFORE statements exist, so a
  line comment cannot be classified as DDL by construction rather than by
  filtering.
- **Verdict up front:** the A-versus-B fork is **NOT sound as put**, and A is
  still directionally right but not in the form offered. 4 blockers, 10
  residuals, 10 attacks run and empty.

---

## 1. Blockers

### BLOCKER 1 - UNDER-SURVEYED PRECEDENT PRODUCING A FALSE BINARY. NEW.

**The fork omits this repo's own established form for exactly the access shape
the scope measured.**

The fork is A (RLS plus four own-row `auth.uid() = user_id` policies) against B
(nothing). There is a third form already in this tree: **RLS enabled with ZERO
policies**, used deliberately and at length for a table whose only legitimate
accessor is the service-role client.

`supabase/migrations/20261015000000_lms_credentials.sql:38` -
"RLS - READ THIS TWICE (SEC6). There is deliberately ZERO policy of any kind for
`authenticated` on this table - not select, not insert, not update, not delete."
The enable is at `:174`, the no-policy note at `:176`. The same form at
`supabase/migrations/20261016000000_lms_credential_save_attempts.sql:120,122`.

That migration's stated reasoning is the same argument the scope makes in its own
section 5, reaching the opposite construction - `:59`: "no legitimate
client-side reader to serve; adding one only ever adds a leak" - and it
pre-refuses the scope's recommendation in words, `:61`: "If a future change ever
'simplifies' this by adding an own-row SELECT policy so some client component can
read directly - stop."

**The quantity, because the scope's "established local shape" is not universal.**
`python scratchpad/chk_polshape.py .` (statement tokenizer; canary
`statements=683 created=50 rls=50 tables_with_policies=49`):

| Policy count on an RLS-enabled table | Tables |
|---|---|
| 4 (one each select/insert/update/delete, all `auth.uid() = user_id`) | 37 |
| 2 | 4 |
| 1 | 7 |
| **0 (deliberate, documented)** | **2** |

So the four-policy form is 37 of 50, not all 50, and the zero-policy form is the
**most recent** RLS design decision in the tree (20261015 against
`cartridge_drops` 20260825, the only precedent the scope cites).

**Why this changes the answer rather than the prose.** The scope's own section 5.3
names a latent hazard: the table is in `Database` (`src/lib/supabase/types.ts:340-345`,
verified), the browser client is `createBrowserClient<Database>`
(`src/lib/supabase/client.ts:56`, verified), so a future client-component query
typechecks and lints clean. **Branch A as specified does not close that hazard.
It narrows it from cross-tenant to own-tenant and leaves it open.** The
zero-policy form closes it outright.

And the reach is larger than the scope measured. Its evidence is that the browser
client has two importers. But `SupabaseProvider` publishes the client on a React
context as `supabase: SupabaseClient<Database>`
(`src/context/SupabaseProvider.tsx:11`), and `useSupabase()` is called in **47
files** (`grep -rl "useSupabase()" src/ --include=*.tsx --include=*.ts | wc -l`
-> 47), with **57** sites destructuring `{ supabase`
(`grep -rn "const { supabase" src/ --include=*.tsx --include=*.ts | wc -l`
-> 57). No import of `@/lib/supabase/client` is needed to reach the table; the
two-importer bound is not the bound that matters.

**Internal contradiction underneath it.** Section 6.2 justifies all four verbs by
"a future move of any accessor to the RLS-bound client would need the matching
policy or fail silently" - that is, the policies exist to serve a non-service
reader that section 5 argues does not exist and section 5.3 argues must never be
allowed. The scope never reconciles those two.

**What must change before the owner is asked:** put the third form in the fork
with the `lms_credentials` citation, so the owner chooses between deny-all (repo
precedent, closes 5.3, cheaper - no policy names, no four-verb question, no
`drop policy if exists` guards) and own-row (the 37-table majority form, which
buys a hypothetical future RLS-bound accessor at the price of leaving 5.3 open).
Stated honestly, deny-all's own cost is the mirror image: if some non-service
reader exists that section 5 did not find, deny-all refuses it while four
policies would let it through - and either way the symptom is silent
(`src/lib/supabase/accessibility.ts:47,49-51,79-82,105-107`).

### BLOCKER 2 - AN OFFERED ANSWER THAT OPENS A STUDY WHILE BEING ASSERTED TO CLOSE THE ACTIVITY. NEW.

Section 8's "Why every answer terminates" says of the third offered answer, at
`docs/accessibility-scans-rls-scope.md:816-817`:

> "A but with the FK" is branch A plus section 6.4's form (b), which means the
> migration also deletes orphan rows. Still one wave, still nothing to study.

The document's own residual register contradicts that, at `:948` (RES-A11Y-3):

> Form (b) requires the owner first run
> `select count(*) from public.accessibility_scans s where not exists (select 1 from auth.users u where u.id = s.user_id);`
> - a nonzero result means form (b) deletes that many production rows on apply.
> Direction: form (b) is only safe if the owner accepts that count

So answering "A but with the FK" requires a production observation that cannot be
made from this checkout, followed by a **second** owner decision conditional on
its result. That is precisely the shape `AGENTS.md`'s two-rounds rule forbids -
an answer that feeds another cycle - and it appears in the one section whose
entire purpose is to prove that no answer does.

**Fix:** withdraw "A but with the FK" as an offered answer (RES-A11Y-3 already
carries it as a separate owner residual), or restate it as "A now, FK considered
later after the orphan count", which is form (a) plus a residual - i.e. the
recommendation, not a third answer.

### BLOCKER 3 - SELF-CONTRADICTORY COUNT INSIDE THE DEFINITION OF WHAT AN OWNER ANSWER AUTHORISES. NEW.

`:808-812` defines what answering "A" authorises: "one implementer wave, write
set `supabase/migrations/<new>.sql` (new),
`src/lib/supabase/accessibility_scans.sql` (deleted),
`src/lib/supabase/accessibility.ts` (one comment line), **plus the two
instruments in section 9**."

Section 9 defines **three** instruments. The document names two different pairs
elsewhere:

- RES-A11Y-2's instrument column, `:947`: "INST-1 and INST-2".
- RES-A11Y-4's, `:949`: INST-3, and it requires INST-3 in the SAME commit under
  branch A, because section 3's sequencing note (`:356-359`) makes INST-3 the
  only enforcer that the citation repair and the DDL move land together.

Under branch A all three are required. No instrument's test-file path is named
anywhere in the document - section 9 names only the idiom file
`src/lib/knowledge-overview.migration.test.ts` as a model. An implementer reading
section 8 lands two of three, and the suite is green either way, because vitest
collects whatever exists. Whichever is dropped, something the document itself
calls load-bearing is missing: drop INST-1 and nothing checks the new migration's
own text; drop INST-3 and the sequencing note has no enforcer and the citation
gets repaired to a path that is about to move.

**Fix:** say three, name them, and name a file path for each, so "A" leaves
nothing to re-decide.

### BLOCKER 4 - A REMEDY WHOSE EFFECT IS UNVERIFIED BY CONSTRUCTION. NEW.

Branch A's "what it buys", `:771-773`: "The table's existence in production
becomes a repository fact instead of an unknowable one." **It does not.** It
becomes a repository fact about the DECLARATION. Production changes only if the
Action run succeeds.

**The workflow records a prior instance where it did not.**
`.github/workflows/supabase-migrations.yml:11-12`:

```
# Manually re-triggered to apply the pending microsoft_credentials and
# syllabus_templates migrations.
```

So in this project a committed migration has already once failed to reach
production on push and needed a human. The scope states this ceiling correctly
for INST-1 ("does not prove the migration APPLIED", `:860`) and INST-2 ("proves
the declaration, never the database", `:883`) and then drops it when arguing
branch A's benefit.

**And nothing schedules the confirmation.** RES-A11Y-1 is the only production
observation in the register, and it says explicitly, `:946`: "it does NOT gate
section 8's branch A ... It gates only how urgently branch A ships". There is no
post-apply residual anywhere. So branch A can complete with every gate green,
the Action can fail or be skipped, RLS is still off in production, and every
error on the path is swallowed - the scope's own silent-failure argument turned
on its own remedy. This is the repo's named recurring class: a capability that
ships dead with every gate green.

**Fix:** add a residual owned by the repo owner - after the push, confirm the
Action run succeeded and re-run RES-A11Y-1's observation (2)
(`select relrowsecurity from pg_class where relname = 'accessibility_scans';`)
expecting `true`. That single step is what converts branch A from a declaration
into the outcome it is recommended for. Note the repo constraint that makes it
owner-only: `gh` is not installed here, so the run cannot be checked from this
session.

---

## 2. Residuals

**R1 - unreproducible quantity: 18 against 21.** Section 7 item 1 and section 12
both report `grep -rn "accessibility_scans" . --exclude-dir={node_modules,.git,.next,.claude}`
-> **18**. Measured:

| Command | Value |
|---|---|
| `grep -rn "accessibility_scans" . --exclude-dir={node_modules,.git,.next,.claude} \| wc -l` | 78 |
| same, plus `--exclude=accessibility-scans-rls-scope.md` | 26 |
| `git grep -n "accessibility_scans" 32af6aa -- . \| wc -l` (the scope's own commit) | **21** |
| same at `2949437` | 21 |

18 matches none of them, and the working tree at the time the scope ran also held
its own in-progress file (52 occurrences today), so the true working-tree number
was well above 21. **The conclusion survives**: per-file at `32af6aa` the hits are
8 files - `docs/REGRESSION.md`, `docs/multi-user-login-architecture.md`,
`docs/ruling-127.md`, `docs/service-role-predicate-audit.md`,
`src/lib/supabase/accessibility.ts`, `src/lib/supabase/accessibility_scans.sql`,
`src/lib/supabase/types.tables-a.ts`, `src/lib/supabase/types.ts` - no run log, no
applied-migrations record, no note. Only the number is wrong, and it is the same
class the document confesses twice (sections 1.1 and 1.7) without flagging here.

**R2 - `src/lib/access.test.ts:689` is off by one.** `/api/accessibility` is at
`:688`. Command: `grep -n '"/api/accessibility"' src/lib/access.test.ts` ->
`688:      "/api/accessibility",`. The "gates everything else" case name is
correct, and the substance (the route is asserted non-public) holds.

**R3 - `docs/service-role-predicate-audit.md:892` cited for the audit's size
row.** `sed -n '884,893p'` shows `:884-885` are the two size rows, `:888-890` the
two-instrument rationale, and `:892` is the "**Tree state.**" paragraph.

**R4 - `docs/multi-user-login-architecture.md:439-448` over-reaches by one line.**
`sed -n '437,450p'`: item 1 runs `:439-447`; `:448` is the opening of item 2
("2. **`deleteArtifactTemplate` deletes by id alone.**"). The related `:441-445`
is a loose range for the quoted default-grants sentence, which is at `:443-445`.

**R5 - the inherited grant premise has in-repo corroboration the scope missed, in
a MIGRATION.** The scope calls it "the single load-bearing fact no command of its
own produced" and rests it on `docs/multi-user-login-architecture.md:441-445`.
Two in-tree sources bear on it:

- `supabase/migrations/20261015000000_lms_credentials.sql:44-47` reasons that an
  own-row select policy "would still hand a signed-in browser the full
  `encrypted_token` value on every matching row". That is only true if
  `authenticated` holds a table-level SELECT privilege, because a policy is
  consulted only AFTER the privilege check. So a shipped security decision in
  this repo presupposes the grant. The same file at `:41` says
  `microsoft_credentials` "grants `authenticated` a own-row SELECT and DELETE".
- `supabase/migrations/20261007000000_cron_heartbeat.sql:64` is the only policy in
  the tree with an explicit `to authenticated` clause
  (`grep -rlc "to authenticated" supabase/migrations | wc -l` -> 1).

This **strengthens** the premise rather than overturning it. Reported because the
scope's evidence bound is wrong, not its conclusion.

**Direct answer to the question asked about section 4.4: the severity range
survives if the premise is false.** Section 0's NONE branch already contains "if
this project's default grants do not extend to `anon`/`authenticated`", and
section 4.4 closes with "If any one of the three conditions fails, the exposure
is zero." What weakens is branch A's motivation, not its correctness: if there is
no grant, A's remaining purchase is (i) the table's declaration becoming a repo
fact and (ii) closing the section 5.3 hazard, both of which the document argues
independently. A survives a false premise on weaker but sufficient grounds.

**R6 - INST-1's stripping is under-specified against its own EXACT-count pass
condition.** INST-1 names `src/lib/knowledge-overview.migration.test.ts` (203
lines by both instruments) as its idiom. That file's `stripSqlComments` (`:40-45`)
drops only lines whose TRIMMED content STARTS WITH `--`, and its own JSDoc
(`:36-39`) says that is sufficient only because "None of this migration's real
statements carry a trailing same-line comment". INST-1's pass condition is
"Exactly one ... and exactly four ..." over the comment-stripped text of a file
that does not exist yet. A trailing same-line comment, or a `/* */` block
comment, containing `create policy ... on public.accessibility_scans` survives
that stripper and breaks an exact count - in a corpus that is 59 percent
comments (my canary: `comment_bytes=154953` of `raw_bytes=262306`,
`python scratchpad/chk_stmts.py .`). Fix: specify the stripper (statement-level,
or line-level plus block comments plus trailing `--`), and make the new
migration's comment style a stated constraint of the wave.

**R7 - "INST-2 cannot land at all" under branch B is overstated, and it inflates
branch B's cost in the fork the owner answers.** `:881`. An INST-2 carrying a
named, asserted exemption for `accessibility_scans` lands green today and still
catches the NEXT table created without RLS, which is most of its value. The
document applies exactly that pattern to INST-3 in the same section (`:906-907`:
"the 26 exclusions must be asserted as exclusions, not filtered silently") and
denies its availability to INST-2. Branch B's cost paragraph (`:790`) leans on
the denial.

**R8 - branch A's reversibility is understated, in the branch being
recommended.** `:760-762`: "one revert migration is the way back - there is no
in-place undo." The owner already has SQL-editor access - the document's own
RES-A11Y-1 instrument is a SQL-editor session - and
`alter table public.accessibility_scans disable row level security;` is one
statement there, effective immediately without a push. Understating A's
reversibility makes the recommended branch look riskier than it is.

**R9 - "orphan rows cost storage and nothing else" contradicts the document's own
section 4.2.** `:697-699` prices FK omission at storage. Section 4.2 established
that the rows hold up to 200 characters of raw `outerHTML` per issue taken
verbatim from instructor Canvas content, and explicitly declined to rule out
personal data. I verified the mechanism the scope only inferred: the producer is
`el.toString()` (`src/lib/accessibility/rules-custom.ts:34`), and in
`node-html-parser` `outerHTML` is DEFINED as `toString()` -
`node_modules/node-html-parser/dist/nodes/html.js:322-324`,
`get outerHTML() { return this.toString(); }`. So the correction to the audit is
right, and it has a consequence the FK paragraph drops: with no cascade and no
purge path (`grep -rn "admin.deleteUser" src/ --include=*.ts` returns nothing),
omitting the FK means a deleted account's course-content fragments are retained
indefinitely. That is a data-retention question, not a storage question, and it
is a cost of form (a) the document did not name.

**R10 - the `service_role` bypass premise is asserted flat while its twin is a
conditional, and the register omits the one observation that would refute it.**
Section 6.2 states "`service_role` bypasses RLS" as a fact; section 4.4 states the
`anon`/`authenticated` grant as an explicit conditional with a severity range.
Both are properties of the same out-of-repo Supabase bootstrap and neither is
checkable here.

**The limit, stated as a limit rather than converted into a finding:** there is no
`.env` and no live database in this checkout, and `BYPASSRLS` is an attribute of
the production role in `pg_authid`, so nothing in this repo can bear on it. It is
stock Supabase and I have no reason to doubt it.

**The finding is the register, not the fact.** Two app-side ways for the claim to
fail ARE checkable here and I ruled both out: `createServiceClient` reads
`process.env.SUPABASE_SERVICE_ROLE_KEY!` with no anon-key fallback
(`src/lib/supabase/server.ts:129`, and `grep -n "SERVICE_ROLE_KEY\|ANON_KEY" src/lib/supabase/server.ts`
returns exactly two lines, `:96` anon and `:129` service role, in different
functions); and `createClient`/`createBrowserClient` are both absent from
`accessibility.ts`. So the entire residual risk is "is `service_role` still
`BYPASSRLS` in this project", and RES-A11Y-1's three dashboard observations
(`:946`) do not include it. One more query in a session the document already
schedules would close it:
`select rolname, rolbypassrls from pg_roles where rolname in ('service_role','authenticated','anon');`
- which also answers section 4.4's grant condition in the same statement.

**Sub-note, one indistinguishable state RES-A11Y-5 does not name.** If
`SUPABASE_SERVICE_ROLE_KEY` is absent or rotated in production, supabase-js
throws inside each accessor's own `try` and every call is swallowed. So "cache
working", "table missing" and "service-role key missing" are all one observable,
not two.

---

## 3. Attacks run and empty

**E1 - the central number, re-derived with a structurally different
instrument.** `python scratchpad/chk_stmts.py .` - a character scanner consumes
`--` comments, `/* */` comments, single-quoted literals and `$$`-quoted bodies as
tokens, splits the residue into statements on top-level `;` at paren depth 0, and
classifies each statement by its leading keyword sequence. A comment can never be
classified as DDL because comments cease to exist before statements do. Output:

```
files: migrations=110 src_sql=1
CANARY migrations   files=110 raw_bytes=262306 comment_bytes=154953 statements=683
CANARY src          files=1 raw_bytes=1135 comment_bytes=299 statements=2

A  created-by-migrations           = 50
B  enable-rls-in-migrations        = 50
A \ B = []
B \ A = []
C  created-by-src-sql              = 1 ['accessibility_scans']
C \ B = ['accessibility_scans']
grants in migrations = 0
grants in src sql    = 0
tables created in MORE THAN ONE migration file = 0
tables RLS-enabled in more than one file = 0
```

Every number in the scope's section 1.2 reproduces exactly: 50, 50, both
differences empty, one table created outside migrations, zero grants. The 51st
name from its broken first pass is confirmed to be a comment -
`supabase/migrations/20261012000000_create_app_users.sql:198` is a `--` line.
The migration-file count is independently `ls supabase/migrations | wc -l` -> 110.

**No number in the document still descends from the broken `-c`-overrides-`-o`
shape.** The only surviving 110 is the file count above, which is a genuine count
of files; 45/38/7 came from Python and I reproduce them in E2.

**E2 - the foreign-key numbers.** `python scratchpad/chk_fk.py .` - walks
create-table statements, splits the parenthesised body on top-level commas, and
inspects only the `user_id` column definition, so prose cannot reach the code
path at all:

```
CANARY migrations files=110 raw_bytes=262306 create_table_stmts=50 user_id_cols=45
user_id columns in migrations                 = 45
... that reference auth.users                 = 45 (in 41 files)
... of those, carrying on delete cascade      = 45
... spelled references auth.users (id) casc   = 38
... spelled without the explicit (id)         = 7
... referencing auth.users WITHOUT cascade    = 0
user_id columns with NO references at all     = 0
CANARY src files=1 create_table_stmts=1 user_id_cols=1
   src: accessibility_scans.sql | accessibility_scans | user_id uuid not null
```

Every figure in sections 1.6 and 12 reproduces exactly - 45, 41 files, all
cascading, 38 plus 7. The 45-sibling claim and the cascade claim both hold, and
the scope's correction of the audit's loose spelling is right. The FK hazard
itself is real Postgres behaviour: `add constraint ... references auth.users`
validates existing rows and raises 23503 on a violation, so a table that has
accumulated orphans fails on apply.

**E3 - INST-3 red today with exactly one failure.**
`python scratchpad/chk_cited.py .` - extracts string literals and comment text
with a character scanner and looks for `.sql` candidates inside each, so a
candidate's syntactic context is known rather than inferred from its line:

```
CANARY ts/tsx files walked = 2772
raw .sql candidates (all contexts) = 84
directory-qualified candidates (has '/', line has no '://') = 52
UNRESOLVED = 1
   src/lib/supabase/accessibility.ts:6  [com]  supabase/accessibility_scans.sql
```

Exact agreement with the scope, including 2772 and 52. The one real failure is
confirmed: `src/lib/supabase/accessibility.ts:6` reads "table (DDL in
supabase/accessibility_scans.sql)", `supabase/` holds no `.sql` file at its top
level, and the real file is `src/lib/supabase/accessibility_scans.sql`. The
refinement (require a `/`, skip lines containing `://`) is what separates the one
real failure from the noise; my raw candidate count differs from the scope's
unrefined 78 because I scan more contexts, and the refined numbers match
identically, which is what matters.

**E4 - INST-2 red today, cannot land green under B.** `C \ B =
['accessibility_scans']` above, so the difference `created \ rls_enabled` is
non-empty on today's tree with no mutation. Confirmed red and self-proving.
Confirmed also that branch B does not change any declaration, so INST-2 as
SPECIFIED cannot land green under B - qualified by R7, which says a form that
can land under B exists and was not considered.

**E5 - the convergence claim, and the "policies without the table" third
option.** The cited precedent holds exactly:
`supabase/migrations/20260825000000_create_cartridge_drops.sql` (76 lines by both
instruments) has the enable at `:31` and `drop policy if exists` at
`:33,38,43,48`, four policies for select/insert/update/delete on
`auth.uid() = user_id`, all in one file. `create table if not exists` plus
`create index if not exists` plus `enable row level security` (idempotent) plus
four `drop policy if exists`-guarded policies does converge from both production
states and is re-runnable, exactly as claimed.

And the third option the brief asked me to consider - land the policies WITHOUT
the table creation - does **not** work. `create policy` has no `if not exists`
guard and raises 42P01 against an absent table, so a policies-only migration is
not convergent from both states without a `DO` block. Including
`create table if not exists` is the right call. Attack empty.

**On the case the scope raises and does not resolve** - a table already in
production with a hand-added or differently-typed column: `if not exists` is a
no-op for the whole table, so it reconciles nothing. I judge this a **residual,
not a blocker**, because branch A does not make it worse - the mismatch, if it
exists, already breaks writes today and is already swallowed. One sharpening the
scope should carry: the mismatch class includes the PRIMARY KEY, not just
columns. `upsertScans` passes
`onConflict: "user_id,institution,course_id,item_type,item_id"`
(`src/lib/supabase/accessibility.ts:78`), and a hand-run table whose PK differs
raises 42P10 - the exact trap this repo documents in
`supabase/migrations/20261015000000_lms_credentials.sql:30-36`. So "a shape
mismatch nobody notices" (`:766-767`) may already be a live, silent write
failure.

**E6 - the second browser-client importer.**
`src/lib/workflows/registry/steps.course-schedule-from-source.ts:118` imports the
browser client; its only use is `supabase.storage.from(SYLLABUS_UPLOAD_BUCKET)`
at `:712-714` - Storage, not a table. The scope's dismissal is correct in
substance.

**E7 - "nothing in this repo refuses a future client query of this table."**
Confirmed. No test file mentions the table
(`grep -rn "accessibility_scans" --include=*.test.ts src/` exits 1); the
client-boundary guards (`src/lib/canvas-client-boundary.test.ts` and its
transitive and runtime-graph siblings) target value imports from the
`@/lib/canvas` and `@/lib/canvas-modules` barrels, not Supabase table access;
and no `.tsx` under `src/app/components` or `src/context` performs a `.from("`
call. No existing guard would refuse it. This is what makes BLOCKER 1 matter
rather than being a style preference.

**E8 - commit identity and owner decisions.**
`git diff --stat b5210a8 HEAD -- supabase/migrations src/lib/supabase/accessibility.ts src/lib/supabase/accessibility_scans.sql .github/workflows/supabase-migrations.yml`
prints nothing, and the same with `28bc0c5` prints nothing - at the CURRENT head
`98c38ee`, so the byte-identity claim now holds across four commits rather than
three. `grep -rniE "rls|row.level|accessibility_scans|anon key" docs/owner-decisions-2026-09-23.md docs/owner-decisions-2026-09-27.md`
exits 1 with no output; `grep -c "^## DECISION"` on the two files gives 7 and 4.
Reproduced exactly.

**E9 - sizes.** All seven rows of the scope's size table reproduce, and the two
instruments agree on every one. `wc -l` and `@(Get-Content <path>).Count` both
give: `accessibility_scans.sql` 23, `accessibility.ts` 108,
`api/accessibility/route.ts` 133, `supabase-migrations.yml` 100, the audit 895,
`knowledge-overview.migration.test.ts` 203, `create_cartridge_drops.sql` 76. The
`docs/loop/this-repo.md:5-12` claim it cites ("15 to 138", not 42) is verbatim
correct.

**E10 - the disposition table (section 10), audited first as the caps card
requires.** All ten rows' citations resolve: F5 at
`docs/service-role-predicate-audit.md:684-700`, the scoping claim at `:692-694`,
the row-content description at `:697-698`, the stale-citation report at
`:252-255`, RES-E at `:839`, `docs/ruling-127.md:32`. Nothing is silently
dropped, and the "nothing is withdrawn" claim holds. Three gaps, recorded here
rather than as separate findings because none is a deletion:

- It silently corrects two of the audit's line numbers without recording them as
  corrections - the audit says `accessibility.ts:5` (`:253`) where the truth and
  the scope both say `:6`, and says the primary key is at
  `accessibility_scans.sql:18` (`:250`) where the truth and the scope both say
  `:19`.
- RES-E's own instrument text asserts "the four own-row policies every sibling
  table has". That is false - 37 of 50 (BLOCKER 1) - and the disposition row
  quotes RES-E's instrument without correcting it, while listing three other
  corrections to the same finding.

**Also checked and clean:** the gate discipline. `package.json:22` expands
`docs:gate` to the `npm run test:paths` wrapper over exactly the three paths the
scope quotes, verbatim, so its section 13 is accurate; no gate or instrument
anywhere in the document invokes a raw multi-path `vitest`. The route trace is
sound end to end - `route.ts:36` `requireOwner()`, `:49`
`parseCanvasCourseId`, six accessor call sites all passing `user.id` at
`:56,59,73,82,86,117` (`grep -n "user\.id" src/app/api/accessibility/route.ts`
returns exactly those six), accessors at `accessibility.ts:39,62,93` all calling
`createServiceClient`, and the browser's single real caller at
`src/app/components/AccessibilityProvider.tsx:14`. `requireOwner` as a
deprecated alias for `requireUser` (`src/lib/supabase/auth.ts:436-453`) and the
`INCREMENTAL_ROUTE_ENABLED` line number were named settled in my brief and I did
not re-litigate either.

**The feature-already-exists case, argued at its strongest and coming back
empty.** The DDL exists, the three accessors exist, the route exists, the guard
exists, the generated type exists. Nothing here is a feature build; the only
missing pieces are RLS and a migration. The scope already frames it that way, so
there is no reframing available that removes or redirects the work.

**The weakest requirement** - the single clause most likely to be implemented
exactly as written and still produce a bad result - is section 6.2's four
policies. Built exactly as specified, they yield a table any signed-in browser
holding the anon key can read and write its own rows in directly through
PostgREST. That is smaller than today's exposure and is still the precise
affordance this repo's own SEC6 comment says "stop" about, and the precise
affordance section 5.3 predicts someone will discover. That is BLOCKER 1.

---

## 4. Verdict

**Counts: 4 blockers, 10 residuals, 10 attacks run and empty.**

Blocker classes, all NEW - none shares a corrective rule with another:

| Blocker | Class | NEW / REPEAT |
|---|---|---|
| 1 | Under-surveyed precedent producing a false binary | NEW |
| 2 | An offered answer that opens a study while being asserted to close the activity | NEW |
| 3 | Self-contradictory count inside the definition of what an owner answer authorises | NEW |
| 4 | A remedy whose effect is unverified by construction | NEW |

**Is the A-versus-B fork SOUND AS PUT? No.** Two independent reasons, either
sufficient on its own. It is a false binary: the third form is already in this
tree, is the most recent RLS decision in it, and is strictly better on the very
hazard the scope itself raised and did not close (BLOCKER 1). And one of the
three offered answers does not terminate the activity while the section proving
that they all do asserts that it does (BLOCKER 2). Two of the cost statements
the owner would weigh are also skewed - branch B's cost is inflated by an
overstated INST-2 constraint (R7), and branch A's risk is inflated by an
understated rollback (R8).

**Is A still the right recommendation? Directionally yes, in a different form.**
The argument that survives every attack is the one the scope leads with and that
needs no credential: the DDL lives where the auto-apply Action cannot see it, so
whether this table exists in production is unknowable from the repository by
construction. Branch A fixes that half regardless of how the RLS question
resolves, it is convergent from both production states (E5), and it stays correct
even if the grant premise is false (R5). But the recommendation must become
"branch A, with the policy form as an explicit sub-choice between deny-all and
own-row, all in one file, no foreign key, plus a post-apply owner confirmation" -
the unqualified four-policy form is the part that does not hold.

**STOPPING POINT: rulings.** Not design, not measurement. Every quantity in the
scope is now independently re-derived and only one (R1) is wrong, with its
conclusion intact; the remaining production facts are correctly identified as
owner-only and this checkout cannot bear on any of them. What is left is
decisions, and they are the orchestrator's before they are the owner's:

- whether the fork the owner is asked includes the zero-policy form (BLOCKER 1) -
  this is the one that must be settled before the owner sees anything, because
  asking the current binary forecloses the better branch by omission;
- whether "A but with the FK" stays an offered answer at all (BLOCKER 2);
- whether branch A's write set names three instruments with paths (BLOCKER 3);
- whether a post-apply confirmation residual is added (BLOCKER 4).

None of the four needs another authoring round; each is a ruling plus
transcription. Per `docs/loop/iteration-caps.md`'s routing table, a stopping
point of *rulings* means the orchestrator rules and does not re-dispatch the
author.

---

## 5. Gate and tree state

`npm run docs:gate` was run against this file after the last edit; the result is
in the hand-off report for this check. This file contains no non-ASCII character
and no emoji, quotes no raw multi-path `vitest` command, and pastes no glyph out
of terminal output. `git status --short` shows exactly one entry attributable to
this pass, `?? docs/accessibility-scans-rls-scope-check.md`. The other five
entries are not mine: four modified files under
`src/app/actions/grading-incremental*` and
`src/app/components/grading/useIncrementalGradingRun*` are the live implementer's,
and `?? docs/tools-grading-subtab-ac-check.md` is a concurrent sibling checker's
artifact. No file under `src/` or `supabase/` was modified by me, no migration
was written, and no test file was added.
