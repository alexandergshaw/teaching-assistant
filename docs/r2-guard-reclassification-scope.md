# R2 guard reclassification - architecture scope (R2, R2-PERM, R2-HDR)

- Items: `R2` (reclassify every `requireOwner()` call site), `R2-PERM` (what is
  owner-blocked here and why), `R2-HDR` (the false owner-gating header). Area
  `owner-guard-call-sites`.
- Seat: `loop-architect` (Opus). A fresh `loop-checker` gates this document
  before any build wave consumes it.
- READ-ONLY pass. No production file was edited producing this scope;
  `git status --short` at hand-off shows one new file, `?? docs/r2-guard-reclassification-scope.md`.
- HEAD at measurement: `992530c6` (`git rev-parse --short HEAD`).
- This scope does NOT re-derive the classification criterion. That criterion is
  already written, quoted from code, in `docs/owner-private-secrets.md`
  (sections 1, 4, 5), and the acceptance criteria are in
  `docs/r2-acceptance-criteria.md`. This document ADOPTS both, re-measures the
  tree against today's HEAD, and produces the three things the build wave needs
  that those documents leave to the architect/plan seat (RR-1 of the AC doc):
  the measured inventory, the convertible-vs-owner-blocked split, and the wave
  cut with per-wave write sets and verification.

---

## 0. The one conflict the brief handed me, measured and reported

The brief, the backlog row `R2`, and the AC doc disagree on the site count, and
I did not adopt any figure silently (`docs/DEV_LOOP.md`: measure, do not recall;
this repo's own rule to refuse a ruling you can disprove).

| Source | Claimed count | Date of that claim |
|---|---|---|
| This task brief | `~411` invocations | (inherited from the row) |
| `docs/backlog.yml` R2 row | `411` | re-measured 2026-09-15 |
| `docs/owner-private-secrets.md:695` | `305` (`await requireOwner()`, all `src/`) | 37644e2, 2026-09-28 |
| `docs/r2-acceptance-criteria.md:65` | `270` | 40965560, 2026-09-29 |
| THIS scope | see table in section 1 | `992530c6`, today |

The figure has fallen 411 -> 305 -> 270 as cohorts converted, then held roughly
flat 270 -> 268 since 2026-09-29. **R2 stalled after sub-wave 7**: the backlog's
own `R2-PERM` row records why - this environment's permission classifier now
refuses the `requireOwner`->`requireUser` edit as "Security Weaken" and refused
even a bare grep for the guard name, so an agent cannot APPLY the remaining
conversions here. That is a tooling block on the BUILD, not a gap in the
classification. Section 5 separates the two.

Do not size any wave off 411 or off `~91`; both are stale. The done-state
(AC-4) is an absolute - zero call sites, no export - not a delta, so staleness
of the running count does not threaten correctness.

---

## 1. Measured inventory (every quantity names its command)

Run from the repo root at `992530c6`. The repo has two line/count instruments
that disagree (`docs/loop/this-repo.md`); where a count settles anything I use
the escaped `grep -roE` form the AC doc mandates, never the row's unescaped
`Select-String` pattern (which matches comment prose - the AC doc proved it
returns 274 vs the grep's 270 for that reason, `docs/r2-acceptance-criteria.md:75-82`).

| Quantity | Command | Value |
|---|---|---|
| `await requireOwner()`, all of `src/` (incl. tests + comments-with-await are not matched) | `grep -roE "await requireOwner\(\)" src/ \| wc -l` | 272 |
| Same, production only (exclude `*.test.*`) | `grep -rnE "await requireOwner\(\)" src/ --include=*.ts --include=*.tsx \| grep -v "\.test\." \| wc -l` | 268 |
| Files carrying a production call | same, `\| cut -d: -f1 \| sort -u \| wc -l` | 68 |
| Test-file references (not production sites) | the 4-row remainder of 272 - 268 | 4 |
| `await requireAppOwner()` production call sites (already converted) | `grep -rnE "await requireAppOwner\(\)" src/ --include=*.ts --include=*.tsx \| grep -v "\.test\." \| wc -l` | 121 |
| Files carrying a `requireAppOwner()` call | same, `\| cut -d: -f1 \| sort -u \| wc -l` | 24 |
| `requireOwner` still exported? | `grep -rn "export async function requireOwner" src/lib/supabase/auth.ts` | yes, `auth.ts:451` |
| guard-coverage ratchet state at HEAD | `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts src/app/actions/action-guard-coverage-github-cohort.test.ts` | 21 passed (15 + 6) |

**Every production call form is `await requireOwner()`.** I scanned for
non-`await` forms (`return requireOwner()`, `void`, bare) excluding the
definition and tests; every hit was inside a comment, none was a call. So the
`await requireOwner()` grep is the exact and complete production-call instrument
here - there is no second call shape to miss.

### 1.1 Per-file production inventory (the full 68, grouped by cohort)

Command: `grep -roE "await requireOwner\(\)" src/ --include=*.ts --include=*.tsx | grep -v "\.test\." | sed 's/:await.*//' | sort | uniq -c | sort -rn`
Pasted output, bucketed by the cohort section 3 assigns each file to:

```
 34 src/app/actions/canvas-files-bulk.ts              [CANVAS]
 18 src/app/actions/course-hub-core.ts                [CANVAS]
 17 src/app/actions/research.ts                       [SHARED-CURATED + SPEND, mixed]
 15 src/app/actions/syllabus-templates.ts             [OWN-DATA]
 14 src/app/actions/canvas-accessibility.ts           [CANVAS]
  9 src/app/actions/messaging.ts                      [CANVAS]
  8 src/app/actions/llm-tools.ts                      [SPEND]
  7 src/app/actions/workflow-support.ts               [OWN-DATA/SPEND]
  7 src/app/actions/messaging-outlook.ts              [OWN-DATA (MS OAuth, per-user)]
  7 src/app/actions/knowledge-base.ts                 [OWN-DATA (institution_pages, user_id-scoped)]
  7 src/app/actions/course-intel.ts                   [OWN-DATA/SPEND]
  7 src/app/actions/automation-runs.ts                [OWN-DATA + CRON path]
  6 src/app/actions/grading-inbox.ts                  [CANVAS]
  6 src/app/actions/course-tasks.ts                   [OWN-DATA]
  6 src/app/actions/accommodations.ts                 [CANVAS]
  5 src/app/actions/knowledge-overview.ts             [OWN-DATA (QA user_id-scoped)]
  4 src/app/actions/syllabus-adapt.ts                 [SPEND]
  4 src/app/actions/scheduled-releases.ts             [CANVAS + CRON path]
  4 src/app/actions/messaging-scheduling.ts           [OWN-DATA/SPEND]
  4 src/app/actions/lms-syllabus-buttons.ts           [CANVAS/SPEND]
  4 src/app/actions/institution-page-attachments.ts   [OWN-DATA (user_id-scoped)]
  4 src/app/actions/artifact-templates.ts             [OWN-DATA]
  3 src/app/actions/task-institution-instructions.ts  [OWN-DATA]
  3 src/app/actions/rubric-bulk.ts                     [CANVAS/SPEND]
  3 src/app/actions/lms-generation.ts                  [SPEND]
  3 src/app/actions/discussion-replies.ts              [CANVAS/SPEND]
  3 src/app/actions/course-task-attachments.ts         [OWN-DATA]
  3 src/app/actions/course-calendar.ts                 [OWN-DATA]
  3 src/app/actions/canvas-migrations.ts               [CANVAS]
  2 src/app/actions/weekly-announcement-drafting.ts    [CANVAS/SPEND]
  2 src/app/actions/visualizer-selection.ts            [SPEND]
  2 src/app/actions/textbook-research.ts               [SPEND]
  2 src/app/actions/syllabus-upload.ts                 [OWN-DATA/SPEND]
  2 src/app/actions/message-replies.ts                 [CANVAS/SPEND]
  2 src/app/actions/lms-generation-refine.ts           [SPEND]
  2 src/app/actions/lecture-plans.ts                   [SPEND]
  2 src/app/actions/current-events-assignments.ts      [SPEND]
  2 src/app/actions/course-planning.ts                 [SPEND]
  2 src/app/actions/course-planning-lecture.ts         [SPEND]
  2 src/app/actions/command-interface.ts               [CANVAS/SPEND]
  1 src/app/api/visualizer/create/route.ts             [SPEND]
  1 src/app/api/lms-generation/deck/route.ts           [SPEND]
  1 src/app/api/lms-generation/deck-from-capture/route.ts [SPEND]
  1 src/app/api/lms-export/selection/route.ts          [CANVAS]
  1 src/app/api/automations/run-now/route.ts           [CRON path]
  1 src/app/api/accessibility/route.ts                 [CANVAS]
  1 src/app/actions/visualization-concepts-generator.ts [SPEND]
  1 src/app/actions/selection-chat-context.ts          [SPEND]
  1 src/app/actions/module-template.ts                 [CANVAS/SPEND]
  1 src/app/actions/module-content-extract.ts          [SPEND]
  1 src/app/actions/materials-extract.ts               [SPEND]
  1 src/app/actions/legibility-probe.ts                [SPEND]
  1 src/app/actions/learning-resource-links.ts         [SPEND]
  1 src/app/actions/institutions.ts                    [OWN-DATA]
  1 src/app/actions/grading-submission-grade.ts        [SPEND]
  1 src/app/actions/grading-submission-extract.ts      [SPEND]
  1 src/app/actions/current-events.ts                  [SPEND]
  1 src/app/actions/cron-heartbeat.ts                  [CRON path]
  1 src/app/actions/course-project.ts                  [SPEND]
  1 src/app/actions/course-planning-grounding.ts       [SPEND]
  1 src/app/actions/chat-style.ts                      [OWN-DATA]
  1 src/app/actions/castletop.ts                       [SPEND]
  1 src/app/actions/case-study-research.ts             [SPEND]
  1 src/app/actions/case-study-plan.ts                 [SPEND]
  1 src/app/actions/carry-module-pattern.ts            [CANVAS/SPEND]
  1 src/app/actions/canvas-discussions.ts              [CANVAS]
  1 src/app/actions/canvas-cartridge.ts                [CANVAS]
  1 src/app/actions/announcement-image.ts              [SPEND]
```

Sum = 268 across 68 files. **The cohort tag is a candidate per FILE, derived
from direct imports (section 2); it is NOT a final per-action disposition.** The
per-action, per-edge walk that confirms it is each sub-wave's gate (section 3,
RR-1). The tags exist so the wave cut (section 6) can be ordered by risk.

---

## 2. The owner-private-reach measurement that shapes everything

The classification (section 3) turns on one question per site: does it reach an
UNCONTAINED owner-private resource? The four owner-private families are fixed by
`docs/owner-private-secrets.md:377-381` (RULING 90): GitHub PAT
(`GITHUB_TOKEN`), the Canvas env credential pair, the HeyGen/Tavus likeness, and
the ElevenLabs voice id. Of these, only Canvas is reachable by any remaining
file, and Canvas is contained AT the secret.

**Measured: no remaining `requireOwner()` file directly imports an uncontained
owner-private module.** Command (run over the 68-file set):

```
FILES=$(grep -rlE "await requireOwner\s*\(\s*\)" src/ --include=*.ts --include=*.tsx | grep -v "\.test\.")
for f in $FILES; do grep -lE "from \"@/lib/github|githubToken|ghFetch|media-avatar|media-likeness|HEYGEN|TAVUS|ELEVENLABS_VOICE|code-runner|PISTON|WANDBOX" "$f"; done
```

Output: EMPTY. Not one of the 68 files directly imports the GitHub PAT module,
the HeyGen/Tavus/ElevenLabs owner-private modules, or the code sandbox. The only
owner-private family any of them touches is Canvas (16 files import
`@/lib/canvas*`), and `resolveCanvasCredential` gates its env fallback on
`identity.role === "owner"` at `src/lib/canvas-credentials.ts:220` with
`identity` from `getEffectiveIdentity()` at `:191` - contained at the secret, so
a non-owner reaches nothing (`CANVAS_CREDENTIAL_REQUIRED_MESSAGE` at `:227`).

**Consequence, stated conservatively.** By the shipped criterion this strongly
indicates the ENTIRE remaining set is permissive -> `requireUser()`, with the
two exceptions in sections 2.1 and 2.2. BUT a direct-import grep is not a
transitive-reach proof, and `docs/owner-private-secrets.md:367-375` (RULING 84 +
the shared-`visited`-set trap from `docs/loop/traps-spec.md:131-148`) requires
ONE graph walk PER DIRECT EDGE, rooted at each import in turn, before any
absence claim. That walk is each sub-wave's gate (RR-1), not this scope's; a
mechanical "all remaining -> requireUser" without the walk is exactly the false
absence this repo has shipped before. The grep above RAISES the prior that the
remainder is permissive; the per-edge walk DISCHARGES it per file.

### 2.1 Exception A - the shared owner-curated knowledge table (research.ts)

`research.ts` is the one remaining file whose data layer is NOT user_id-scoped.
`verifyKnowledgeEntry` (`src/lib/research/db.ts:313`) and `deleteKnowledgeEntry`
(`:329`) scope by `.eq("id", id)` ONLY - no `.eq("user_id")` - so the knowledge
table is SHARED across accounts, not per-caller. This is the "mutates shared
owner-curated state" category the task brief names, and `SEC-F4` (commit
`98fcb692`, 2026-10-11) already acted on it: `reviewKnowledgeEntryAction`
(`research.ts:75`) now gates the `discard` branch with `requireAppOwner()`
(`:85`) while the `verify` branch stays on the alias (`:87`). That commit's own
message flags the unresolved owner question: "is cross-tenant sharing intended /
tenant key". This is the owner-involved subset (section 5, R2-PERM).

### 2.2 Exception B - the already-correct body-contained sites (step 5)

`course-hub-integrations.ts` is NOT in the remaining set (it carries no
`await requireOwner()`), and it is the worked precedent the build wave must not
break: `checkInstitutionsAction` (`:169`) and `listConfiguredInstitutionsAction`
(`:212`) already call `requireUser()` while keeping an in-body
`identity.role === "owner"` branch (`:170`, `:214`). Any remaining file that
turns out to carry the same shape converts the GUARD only and MUST NOT touch the
body (`docs/owner-private-secrets.md:397-409`). I found no such shape in the 68
remaining files by grep, but the per-action walk confirms it per site.

---

## 3. The classification POLICY (adopted, not invented)

The rule is `docs/owner-private-secrets.md` section 1, quoted here so the build
wave has it in one place. **A call site becomes `requireAppOwner()`** when a
non-owner reaching it could act on the owner's own identity or private data
(GitHub repos, Canvas gradebook, cloned face/voice) through a credential the
deployment holds once, AND that reach is not already contained at the secret.
**A call site becomes `requireUser()`** when the worst a non-owner can reach is
shared metered spend on a third party that holds nothing of the owner's, OR rows
scoped to the caller's own `user_id`, OR an owner-private reach already
contained at the secret. The six-word form: **"not merely a shared billing key"**
(`action-guard-coverage.test.ts:313`). Uncontained-ness is NOT the criterion.

### 3.1 The owner-only categories, enumerated (the only things that become `requireAppOwner()`)

A site is owner-only ONLY if it falls in one of these. Each already has a shipped
home; the remaining set is expected to add almost nothing to them.

1. **Spends or reaches an owner-private CREDENTIAL/IDENTITY uncontained** -
   GitHub PAT, HeyGen/Tavus likeness, ElevenLabs voice. Homes:
   `GITHUB_NOT_OWNER_ONLY` pins the permissive GitHub exceptions (30);
   `MEDIA_OWNER_ONLY_ACTIONS` pins the restrictive media set (14). **No
   remaining file reaches these (section 2), so this category gains zero sites
   from R2's remainder absent a per-edge walk surprise.**
2. **Changes another account's STANDING** - approve / suspend / restore /
   promote / demote. Home: `OWNER_ONLY` (the 5 account-admin actions). **No
   remaining file does this** (they are all content/Canvas/own-data actions).
3. **Mutates or DESTROYS shared owner-curated STATE** - the brief's third
   category, precedent `SEC-F4`. Home: `research.ts` discard branch. The
   remaining research.ts shared-knowledge-table sites are the candidates
   (section 2.1), and their disposition is partly an owner ruling (section 5).
4. **Confers arbitrary code execution through a shared credential** - the code
   sandbox, `runSubmissionCodeAction`. Already shipped `requireAppOwner()` as a
   NAMED EXCEPTION (reading C of `owner-private-secrets.md` section 7, the
   recommended reading). It is NOT in the remaining set. R2 carries it as a
   closed one-entry exception, NOT a general limb (RR-6 / AC Q1).

### 3.2 The recommended default for an ambiguous site (conservative)

Per the task brief's explicit instruction and the repo's "be conservative" rule:
**when a per-edge walk cannot settle whether a site is owner-private - when the
reach to credentials/keys/another-account/shared-curated-state is uncertain -
the SAFER classification is `requireAppOwner()`, and the site is ESCALATED as an
owner ruling, never guessed permissive.** This inverts the convenience default.
The equal-and-opposite cost (AC-3) is real - over-gating locks approved members
out of a capability - so an escalated site ships on NEITHER guess until the
owner rules; it stays on the status quo (the alias) with a recorded residual
until then. Guessing in EITHER direction is the failure AC-7 forbids.

### 3.3 The third disposition the rule must not erase

A site may keep `requireUser()` AND carry an in-body `identity.role === "owner"`
branch. Converting such a site changes the GUARD only; the body is untouched
(`docs/owner-private-secrets.md:397-409`, section 2.2 above). A build wave that
"simplifies" the body by swapping it for `getEffectiveIdentity()` stops
enforcing BLOCK2 for that action and is a defect, not a cleanup.

---

## 4. The `owns` file list (derived, command pasted)

The write set R2 touches is the 68 production files in section 1.1 PLUS the four
files that READ those files as SOURCE TEXT (the ratchets), which go red if a
conversion lands without its pin update. Those reader files are found by:

```
grep -rln "requireOwner\|requireAppOwner\|collectActionExports\|PINNED_UNGUARDED\|OWNER_ONLY\|REVIEWED_PERMISSIVE\|GITHUB_NOT_OWNER_ONLY" src/app/actions/*coverage*.test.ts src/app/actions/guard-overtightening.test.ts src/lib/supabase/auth.test.ts
```

Output (the four source-text readers + the behaviour oracle, each OWNED by R2
because a conversion that forgets them turns a correct change red):

```
src/app/actions/action-guard-coverage.test.ts
src/app/actions/action-guard-coverage-github-cohort.test.ts
src/app/actions/guard-overtightening.test.ts
src/lib/supabase/auth.test.ts
```

And the guard definition itself, edited ONCE at the very end (AC-4):

```
src/lib/supabase/auth.ts            (delete the requireOwner export in the final wave only)
```

Plus, per sub-wave, a NEW per-file behaviour oracle in the
`grading.guard.test.ts` idiom (PC1/PC2/PC3; RR-2, owned by the test seat):

```
src/app/actions/<converted-file-basename>.guard.test.ts   (one per converted file)
```

**R2-HDR adds exactly one file to the owns list:** `src/app/actions/canvas-inbox.ts`
(section 6, Wave 0). It is NOT in the 68 (its 19 actions are already
`requireUser()`); only its header comment is wrong.

---

## 5. Convertible-from-reading vs owner-blocked (R2-PERM), the honest split

The task brief asks me to separate sites classifiable+convertible purely from
code reading from those whose correct guard depends on runtime/owner knowledge.
There are TWO distinct "blocked" notions and both are reported, because
conflating them is how R2 stalled.

### 5.1 Convertible from code reading alone (this environment) - the large majority

**~265 of the 268 sites.** Every file tagged CANVAS, SPEND, OWN-DATA, or
CRON-path in section 1.1. Their correct guard is `requireUser()`, decidable from
source: Canvas is contained at the secret (`canvas-credentials.ts:220`); shared
LLM/TTS/grading spend is permissive by 27 shipped+pinned sites
(`action-guard-coverage.test.ts:313`); own-`user_id` rows are permissive
(`knowledge-base.ts`, `knowledge-overview.ts`, `institution-page-attachments.ts`
all `.eq("user_id", userId)`, measured in section 2). Each site still owes its
sub-wave the per-edge transitive walk (RR-1) and its PC1/PC2/PC3 oracle (RR-2)
before it is called converted - "decidable from reading" means the READING is
available here, not that the walk is skipped.

The CRON-path files (`cron-heartbeat.ts`, `automation-runs.ts`,
`automations/run-now/route.ts`, `scheduled-releases.ts`) carry one extra
obligation, not a block: A6 requires the `runAsOwner` impersonation path to keep
working and keep re-checking a real owner. `requireAppOwner()` already re-checks
`role` AND `status` on its impersonation branch (`auth.ts:409-415`), and
`requireUser()` honours the same owner-only impersonation stopgap (`auth.ts:331`).
A conversion of a cron-reached action to `requireUser()` does not regress this;
the sub-wave's checker confirms no conversion touches the impersonation branch.

### 5.2 Owner-blocked - the correct guard depends on owner knowledge (R2-PERM, classification sense)

**~3 sites, all in `research.ts`'s shared knowledge table (section 2.1).** The
guard turns on a fact only the owner has: **is the knowledge library intended to
be cross-tenant shared (owner-curated, one library all members contribute to and
only the owner may destroy from) or should it be per-user scoped?** The data
layer is shared TODAY (`research/db.ts:313,329`, `.eq("id")` only), and SEC-F4
treated it as owner-curated for the destructive branch. The candidates:

- `reviewKnowledgeEntryAction` verify branch (`research.ts:87`, currently alias):
  mutates a shared row. Owner-curated reading -> `requireAppOwner()`; per-user
  reading -> `requireUser()` AND a data-layer `user_id` scope is owed (out of
  R2's scope - R2 changes guards, not predicates).
- `listUnverifiedKnowledgeAction` (`research.ts:56`): reads the shared table.
  Read-only, lower risk; safe default `requireUser()` under either reading.
- `measureKnowledgeGapAction` / banked-rubric / open-problems sites
  (`research.ts`): the sub-wave's per-action walk states, per export, whether it
  reaches the shared `research/db.ts`/`problems.ts` tables; any that MUTATE a
  shared table inherits the same fork.

These do NOT convert until the owner answers the fork in section 7 (Q-SHARED).
Until then they stay on the status-quo alias with the residual recorded - never
guessed (AC-7).

### 5.3 Owner-blocked - the EDIT cannot be applied/verified in this environment (R2-PERM, tooling sense)

This is the block the backlog's R2-PERM row actually records, and it is
orthogonal to classification. This environment's permission classifier REFUSES
the `requireOwner`->`requireUser` source edit as "Security Weaken" (it denied
the prior effort's SW10 and even a bare grep for the guard name). So EVEN the
~265 sites whose guard is decided cannot be edited by an agent HERE. This is a
property of the build environment, not the code, and it is why this scope is
READ-ONLY and hands the APPLICATION to a build wave that either (a) runs where
the classifier permits the edit, or (b) is applied by the owner from this scope.
The scope, the waves, and the verification are all fully specified so that
application is mechanical wherever it happens. **Do not record this as a reason
the classification is incomplete - it is complete; the blocker is the editor.**

---

## 6. R2-HDR disposition - correct the header, do NOT convert the 19

`src/app/actions/canvas-inbox.ts:56-59` asserts:

> Every action below is owner-gated (owner allowlist + AAL2) because it uses the
> privileged Canvas API token, or - for the AI drafts - bills LLM usage.

Measured, all 19 exported actions call `await requireUser()`, none call
`requireAppOwner()` (section 1 of my grep over that file: 19 `requireUser`, 0
`requireAppOwner`). So the header asserts the opposite of the code.

**Disposition: CORRECT THE HEADER. Do not convert the 19 to `requireAppOwner()`.**
The reason is the classification policy itself: the header's RATIONALE ("owner-
gated because it uses the privileged Canvas API token") is the exact
uncontained-ness fallacy the criterion rejects (`owner-private-secrets.md:46-50`).
Canvas is contained at the secret, so these Canvas-reading actions are CORRECTLY
permissive. Converting them to `requireAppOwner()` would lock approved members
out of the whole Canvas tab (AC-3's measured cost: 72 of 103 files reach a
shared owner-funded secret; over-gating leaves a member "a login and a blank
app"). The header is the bug, not the guards.

The corrected header must state: every action is `requireUser()` (any active
account); the Canvas token is reached through `resolveCanvasCredential`, whose
env fallback is owner-gated AT THE SECRET (`canvas-credentials.ts:220`), which is
why the call sites are permissive; AI-draft actions spend the shared LLM key,
which is permissive by the shipped criterion. No `requireAppOwner` claim.

R2-HDR is its own one-file change (`canvas-inbox.ts`, header comment only), lands
as Wave 0 (lowest risk, nothing executable changes), and its verification is: the
guard-coverage ratchet stays green (canvas-inbox actions remain `requireUser`,
none pinned owner-only), and a reading check that the header text now matches the
19 guards. It is a documentation correction INSIDE a `.ts` file, so it is a
runtime-file change by the loop's rule and the guard-coverage ratchet gates it,
but it changes no behaviour and carries no PC1/PC2/PC3.

---

## 7. The forks a human must settle (routed, not guessed)

Each is phrased so every answer terminates and is applied as transcription.

- **Q-SHARED (the one genuine new fork).** Is the research knowledge library
  (`research/db.ts`, `.eq("id")`-only today) intended to be cross-tenant shared
  and owner-curated, or per-user? Answer determines the guard for the research
  shared-table MUTATION sites (section 5.2). Recommended default (conservative,
  SEC-F4-consistent): treat DESTRUCTIVE mutations of the shared table as
  `requireAppOwner()` and read-only/verify as `requireUser()`, and file the
  "add a tenant key / scope to user_id" question as a SEPARATE data-layer row
  (R2 changes guards, not predicates). Cost of being wrong: if per-user was
  intended, a member cannot verify their own learned entry until the owner
  relaxes it - a one-message redirect, not data loss.
- **Q-SANDBOX (AC Q1 / owner-private-secrets section 7).** Carried forward
  unchanged: `runSubmissionCodeAction` stays `requireAppOwner()` as a single
  named exception (reading C, recommended), no general limb. Already shipped;
  R2 only needs the owner to RATIFY C so the remaining waves do not re-open it.
  Terminating: the letter is transcribed; no other site depends on it.
- **Q-ZERO (AC Q3).** Does `requireOwner()` reach exactly zero and get deleted
  (AC-4 as written, recommended), or is a named residual kept? A6 says the
  export no longer exists, which forces zero.
- **Q-ENV (R2-PERM tooling, section 5.3).** Does the owner (a) apply the edits
  themselves from this scope, (b) run the build wave in an environment whose
  classifier permits the edit, or (c) accept the current partial migration and
  close R2 with the residual recorded? This is the blocker that actually stalled
  R2; it cannot be resolved by any agent here.

---

## 8. The wave cut - cohort-scoped, lowest-owner-private-risk-first

268 sites across 68 files cannot land in one commit (AC-6). Cut by COHORT, each
wave independently pushable and independently revertible, ordered so a shared
owner-private secret never stays permissive LONGER than a shared-spend-only file
(AC-6 direction-of-failure). Because the measured prior is that the entire
remainder is permissive, "highest owner-private risk first" here means: do the
files that TOUCH Canvas or the shared knowledge table first (so their per-edge
walk, the one that could surprise, happens earliest), then the pure-spend and
own-data files whose walk is lowest-stakes.

Each wave's write set includes its converted `.ts` files, its NEW
`*.guard.test.ts` oracles, and ANY pin update in the four ratchet files - all in
the SAME commit (a conversion without its pin update turns the ratchet red;
`docs/DEV_LOOP.md` gate-must-include-directory-canary). No wave touches
`auth.ts`'s export except the final one.

| Wave | Cohort / files | Expected guard | Pin updates in same commit | Why this order |
|---|---|---|---|---|
| 0 | R2-HDR: `canvas-inbox.ts` header only | n/a (already `requireUser`) | none (no classification change) | Zero behaviour change; removes a false security claim immediately |
| 1 | SHARED-CURATED walk + fork: `research.ts` (17) ONLY | per-action: SPEND/own -> `requireUser`; shared-table destructive -> `requireAppOwner` (pending Q-SHARED) | add any new `requireAppOwner` research action to `OWNER_ONLY` with a reason; update the `PINNED_UNGUARDED`/`REVIEWED_PERMISSIVE` membership if an action's guard changes | The only file with a genuine fork and a mixed guard already; do it alone, first, so the owner ruling gates the smallest blast radius |
| 2 | CANVAS cohort: `canvas-files-bulk.ts` (34), `course-hub-core.ts` (18), `canvas-accessibility.ts` (14), `messaging.ts` (9), `grading-inbox.ts` (6), `accommodations.ts` (6), `canvas-migrations.ts` (3), `canvas-discussions.ts` (1), `canvas-cartridge.ts` (1), `api/accessibility/route.ts` (1), `api/lms-export/selection/route.ts` (1) | `requireUser` (Canvas contained at secret) | none expected (permissive sites are not pinned); if a per-edge walk finds an UNCONTAINED owner-private reach, escalate (section 9 of owner-private-secrets) - do NOT convert in-wave | Largest cohort, highest-touch secret (Canvas); its per-edge walk is where a surprise, if any, lives. Split into 2-3 sub-batches of disjoint files if the wave is too large to review |
| 3 | CANVAS/SPEND + CRON: `scheduled-releases.ts` (4), `lms-syllabus-buttons.ts` (4), `rubric-bulk.ts` (3), `discussion-replies.ts` (3), `weekly-announcement-drafting.ts` (2), `message-replies.ts` (2), `command-interface.ts` (2), `module-template.ts` (1), `carry-module-pattern.ts` (1), `automation-runs.ts` (7), `cron-heartbeat.ts` (1), `automations/run-now/route.ts` (1) | `requireUser` | none expected | CRON files carry the impersonation-preservation check (section 5.1); keep them together so one checker rules on the whole runAsOwner path |
| 4 | OWN-DATA: `syllabus-templates.ts` (15), `knowledge-base.ts` (7), `knowledge-overview.ts` (5), `course-tasks.ts` (6), `artifact-templates.ts` (4), `institution-page-attachments.ts` (4), `task-institution-instructions.ts` (3), `course-task-attachments.ts` (3), `course-calendar.ts` (3), `messaging-outlook.ts` (7), `messaging-scheduling.ts` (4), `institutions.ts` (1), `chat-style.ts` (1), `workflow-support.ts` (7), `course-intel.ts` (7) | `requireUser` (all `.eq("user_id")`-scoped) | none expected | Lowest risk - per-user rows, no owner-private reach; walk is a formality |
| 5 | SPEND-only remainder: `llm-tools.ts` (8), `syllabus-adapt.ts` (4), `lms-generation.ts` (3), and the ~22 single-/double-site SPEND files from section 1.1 | `requireUser` | none expected; most are ALREADY candidates for `PINNED_UNGUARDED` review if they carry no guard - but they DO carry `requireOwner`, so they convert, not pin | Pure shared-spend, no owner-private reach; the tail |
| 6 | FINAL: delete the `requireOwner` export in `auth.ts`; sweep any stray comment mentions | n/a | update `auth.test.ts` if it references the export shape; the guard-coverage `BARE_REQUIRE_OWNER_CALL` ratchet stays (it still guards against re-introduction via the alias name) | AC-6: export removal only after the LAST call site is gone, or it is a build break at the wrong time. Only runs when `grep -roE "await requireOwner\(\)" src/ \| wc -l` is 0 |

Disjointness: waves 2-5 are cut on NON-OVERLAPPING file sets; each wave's set is
intersected against every other in-flight item with `sort | uniq -d` before
dispatch (`docs/loop/parallel-disjointness.md`), and the empty intersection is
the only pass. The four ratchet files and `auth.ts` are SHARED resources - only
ONE wave at a time may edit a ratchet file, so waves that touch pins cannot run
concurrently with each other even when their `.ts` sets are disjoint.

---

## 9. Verification per wave

Every wave runs the SAME gate, with the multi-path wrapper the repo mandates
(`docs/loop/this-repo.md`; raw `vitest run a b` silently drops unmatched paths):

```
npm run test:paths -- src/app/actions/action-guard-coverage.test.ts \
  src/app/actions/action-guard-coverage-github-cohort.test.ts \
  src/app/actions/guard-overtightening.test.ts \
  src/lib/supabase/auth.test.ts \
  <each converted file's new *.guard.test.ts in this wave>
```

plus `npx tsc --noEmit` (ONE caller at a time - it races on
`tsconfig.tsbuildinfo`). The pass conditions, each naming object / instrument /
direction (adopted from `owner-private-secrets.md` 5.1 and AC-2/AC-3/AC-5):

- **PC-RATCHET.** Object: the guard-coverage ratchet set. Instrument: the two
  `action-guard-coverage*.test.ts` files. Direction: FAILS (RED) if a converted
  action's name is not reconciled with `PINNED_UNGUARDED` / `OWNER_ONLY` /
  `REVIEWED_PERMISSIVE` / `GITHUB_NOT_OWNER_ONLY` in the SAME commit. This is the
  structural ratchet; it treats `requireOwner`/`requireUser` as interchangeable
  "some guard" but `requireAppOwner` as distinct, so a restrictive conversion
  MUST update `OWNER_ONLY` and a permissive one must not trip the pins.
- **PC1 (restrictive sites only).** Object: the specific converted action.
  Instrument: an executing `*.guard.test.ts` mocking `@/lib/supabase/auth`'s
  client as an `active` NON-owner (the `grading.guard.test.ts:294-311` idiom),
  calling the REAL export. Direction: FAILS if the action RESOLVES for that
  session.
- **PC2 + PC3 (permissive sites - the common case).** Object: the specific
  converted action. PC2 instrument: same fake, same session. Direction: FAILS if
  the action REJECTS an `active` non-owner. PC3 (MANDATORY companion): object is
  that same session; instrument is `requireAppOwner()` called directly on it;
  direction FAILS if that call RESOLVES. Without PC3 the fake can pass PC2 for the
  wrong reason (`grading.guard.test.ts:410` is the shipped instance). Adding a
  name to a pinned list is NOT evidence (`owner-private-secrets.md:646`).
- **PC-FROZEN (the before/after that catches a mis-conversion).** Object: the
  guarded-set membership. Instrument: freeze, before the wave, the output of

  ```
  grep -rnoE "await require(Owner|User|AppOwner)\(\)" src/app/actions src/app/api --include=*.ts | sort > before.txt
  ```

  and after the wave diff it; every line that moved from `Owner` to `User` must
  be in this wave's permissive set and every line that moved to `AppOwner` must
  be a named `OWNER_ONLY`/exception entry. Direction: FAILS if any line moved to
  `AppOwner` without a pin, or moved to `User` for a site section 5.2 escalated.
  This is the frozen oracle the test seat owns per RR-2; it is what makes a
  silent mis-tighten (AC-3) or mis-loosen (AC-2) visible.

**AC-4 done-gate (final wave only).** `grep -roE "await requireOwner\(\)" src/ | wc -l`
returns 0, AND `grep -rn "export .*function requireOwner\|export {[^}]*requireOwner" src/`
returns nothing. A stray comment mention is cosmetic once the export is gone.

---

## 10. Disposition of prior R2 requirements (this scope restructures the in-flight effort)

R2 has prior artifacts; a restructuring that drops a prior requirement silently
is the failure `DEV_LOOP.md` warns of. Each prior requirement mapped to
kept / handed-over / withdrawn. Ids re-derived last.

| Prior requirement | Where | Disposition |
|---|---|---|
| The classification criterion (owner-private vs permissive) | `owner-private-secrets.md` 1,4,5 | KEPT (K1). Adopted verbatim in section 3; not re-derived |
| The four-family owner-private enumeration + per-edge walk obligation | `owner-private-secrets.md` 4.1, RULING 84/90 | KEPT (K2). Section 2 measures no remaining file reaches them directly; the walk is still owed per sub-wave (RR-1) |
| PC1/PC2/PC3 oracle construction | `owner-private-secrets.md` 5.1 | HANDED OVER to the test seat (RR-2), named in section 9 per wave |
| The code-sandbox fork (reading C) | `owner-private-secrets.md` 7, AC Q1 | KEPT as a closed named exception (K3); ratification routed as Q-SANDBOX |
| `ELEVENLABS_VOICE_ID` fallback gap | `owner-private-secrets.md` RES-1 | WITHDRAWN from R2 (explicitly not R2's defect); handed to a named follow-up wave; enforcer it protected (the media-voice guard tests) is unaffected because R2 touches no media file |
| Per-user spend quotas | `owner-private-secrets.md` RES-5 | WITHDRAWN from R2 (product decision); R2 must not be read as closing it |
| `createServiceClient` cross-tenant predicate audit | `owner-private-secrets.md` RES-2 | WITHDRAWN from R2 (R2 changes guards, not query predicates); handed to a dedicated cross-tenant pass |
| The seven shipped sub-waves (media, github, account-admin, live-messaging, grading sub-wave 7) | `r2-wave1-subwaves.md`, `r2-scope.md` | KEPT AS DONE (K4). Their pins (`MEDIA_OWNER_ONLY_ACTIONS` 14, `GITHUB_NOT_OWNER_ONLY` 30, `OWNER_ONLY` 19) are the baseline no wave here reverses; re-deriving them is how a shipped classification gets silently reversed (`owner-private-secrets.md:357-365`) |
| SEC-F4 shared-knowledge discard = owner-only | commit `98fcb692` | KEPT (K5). Section 2.1/3.1 category 3; its open cross-tenant question becomes Q-SHARED |

---

## 11. Residual register

Each names an owner, an instrument, and the step that measures it. These must be
filed as rows in `docs/BACKLOG.md` by the orchestrator (this seat does not write
the backlog under concurrency); until filed they are not real
(`iteration-caps.md:36-37`).

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RR-1 | Per-edge transitive owner-private reach walk for every converted file (section 2 raises the permissive prior; the walk discharges it) | Build wave (plan) | `walkRuntimeGraph`/`scanRuntimeEdges` in `src/lib/module-graph/runtime-import-graph.ts`, ONE walk per direct edge, non-zero canary per target, stating targets forbidden (RULING 90) | Each wave's scope, before its conversions |
| RR-2 | PC1/PC2/PC3 oracle per converted file, PC3 non-vacuity present | Test seat | `grading.guard.test.ts` idiom + PC-FROZEN before/after (section 9) | Each wave's test step |
| RR-3 | Q-SHARED: cross-tenant intent of the research knowledge library; guard for its shared-table mutation sites | Repo owner | The answer; then transcription to research.ts sites + a separate data-layer scoping row if per-user | Section 7; gates Wave 1's research shared-table sites only |
| RR-4 | Q-ENV: the environment permission classifier refuses the edit here (R2-PERM tooling); R2 cannot be APPLIED by an agent in this checkout | Repo owner | None buildable here; owner applies the edits, or runs the build wave where the classifier permits, or closes R2 partial | Section 7 Q-ENV; blocks all application, not classification |
| RR-5 | Q-SANDBOX ratification (reading C) and Q-ZERO (delete the export) | Repo owner | The letter/answer; transcription only | Section 7; Q-ZERO gates Wave 6 |
| RR-6 | Whether any converted site's behaviour is correct in the DEPLOYED app (no component renders, no API key, network blocked here) | Repo owner | Exercise the deployed app as an approved non-owner and as owner | Post-deploy owner verification |
| RR-7 | Inherited from `owner-private-secrets.md`: RES-1 (ELEVENLABS_VOICE_ID), RES-2 (cross-tenant predicate audit), RES-5 (per-user spend quotas) - all WITHDRAWN from R2, must survive as their own rows | Repo owner | As in that doc's section 10 | Named follow-up waves outside R2 |

---

## 12. What I could not determine

- **The exact final `requireAppOwner` vs `requireUser` split.** It depends on
  RR-1's per-edge walks (not run here - my write set is this one doc and the
  walk mutates no file) and on Q-SHARED's answer. Section 2's direct-import grep
  gives a strong permissive prior (0 owner-private direct reaches in 68 files),
  not a proof. I pin the RULE and the DONE-state, which do not move with the
  running count.
- **Whether any remaining file reaches an owner-private secret TRANSITIVELY.**
  The direct-import grep is clean; the transitive walk is each sub-wave's gate.
  I did not run the graph walker (it would be a reading claim either way, and
  RULING 84 requires per-edge rooting I will not approximate in a scope).
- **The cross-tenant intent of the research knowledge library.** The data layer
  is shared today (`.eq("id")` only); whether that is intended is the owner's
  (Q-SHARED). SEC-F4 flagged the same question and did not resolve it.
- **Anything in the deployed app.** No component renders under vitest, there is
  no `.env`, network is blocked (`docs/loop/this-repo.md`). Every reachability
  statement here is a source-reading claim about guards and call paths.
- **Why the environment classifier refuses the edit** and whether the build wave
  will hit the same wall - that is the R2-PERM tooling block (Q-ENV), a property
  of the editor, outside this scope's reach.

---

## 13. Every quantity, with its command (consolidated)

Run at `992530c6` from the repo root.

| Quantity | Command | Value |
|---|---|---|
| requireOwner sites, all src | `grep -roE "await requireOwner\(\)" src/ \| wc -l` | 272 |
| requireOwner sites, production | `grep -rnE "await requireOwner\(\)" src/ --include=*.ts --include=*.tsx \| grep -v "\.test\." \| wc -l` | 268 |
| Production files | same `\| cut -d: -f1 \| sort -u \| wc -l` | 68 |
| requireAppOwner sites, production (done) | `grep -rnE "await requireAppOwner\(\)" src/ --include=*.ts --include=*.tsx \| grep -v "\.test\." \| wc -l` | 121 |
| requireAppOwner files (done) | same `\| cut -d: -f1 \| sort -u \| wc -l` | 24 |
| Remaining files reaching an uncontained owner-private module (direct import) | `for f in $FILES; do grep -lE "@/lib/github\|githubToken\|media-avatar\|media-likeness\|HEYGEN\|TAVUS\|ELEVENLABS_VOICE\|code-runner\|PISTON\|WANDBOX" "$f"; done` | 0 (empty) |
| Remaining files importing `@/lib/canvas*` | `for f in $FILES; do grep -lE "from \"@/lib/canvas\|canvas-credentials\|canvasFetch" "$f"; done \| wc -l` | 16 |
| canvas-inbox.ts actions on requireUser / requireAppOwner | `grep -c "await requireUser()" / "await requireAppOwner()" src/app/actions/canvas-inbox.ts` | 19 / 0 |
| research/db shared-table scope | `grep -nE "\.eq\(" src/lib/research/db.ts` (verify `:321`, delete `:333`) | `.eq("id")` only, no user_id |
| institution_pages scope | `grep -nE "\.eq\(\"user_id\"" src/lib/knowledge-base.ts` | user_id on all read/update/delete |
| knowledge-overview QA scope | `grep -nE "\.eq\(\"user_id\"" src/lib/knowledge-overview.ts` | user_id-scoped |
| guard ratchet at HEAD | `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts src/app/actions/action-guard-coverage-github-cohort.test.ts` | 21 passed (15 + 6) |
| This file's size (instrument 1) | `wc -l < docs/r2-guard-reclassification-scope.md` | run at hand-off |
| This file's size (instrument 2) | `@(Get-Content docs/r2-guard-reclassification-scope.md).Count` | run at hand-off |
