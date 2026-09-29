# R2 acceptance criteria - reclassify every requireOwner() call site

- Item: R2, area `owner-guard-call-sites`, kind chore, state unscoped
  (`docs/backlog.yml:91-100`).
- Origin: `docs/multi-user-login-acceptance-criteria.md` A6 (`:82-88`), the
  owner's statement of this work. Where any criterion below and A6 diverge, A6
  wins; where A6's own numbers have drifted, the measured tree wins (see
  "Measured tree state").
- Seat: `loop-ac` (Opus). A fresh `loop-checker` gates this document before any
  later seat consumes it.
- This is the AC round only. No mechanism, no wave plan, no oracle, no code. The
  classification ENUMERATION and per-site decision procedure already exist as
  `docs/owner-private-secrets.md` (the criterion, quoted from code) and
  `docs/r2-scope.md` / `docs/r2-wave1-subwaves.md` (the walks and the ordering);
  the instruments already exist as `src/app/actions/*.guard.test.ts` and
  `src/app/actions/action-guard-coverage*.test.ts`. This document does not
  re-derive any of them - it states, at the criterion level, WHAT must be true
  of the finished work and HOW each direction of failure is detected, and points
  at those artifacts as the receivers of the mechanism.

## The owner's words (quoted, from `docs/multi-user-login-acceptance-criteria.md:82-88`)

> **A6. `requireOwner()` is split, and no call site is left ambiguous.**
> `requireUser()` authorizes any active account; `requireAppOwner()` authorizes
> `role='owner'` only. Every one of the ~183 existing `requireOwner()` call
> sites is migrated to the correct one of the two, and `requireOwner` no longer
> exists as an export. The cron/webhook `runAsOwner` impersonation path keeps
> working unchanged and still re-checks that the impersonated identity is a real
> owner.

The backlog row states the danger in the owner's terms
(`docs/backlog.yml:95`): `requireOwner()` is today `return requireUser()`, so
"any active account passes" - every call site that SHOULD require true app-owner
privilege is currently a privilege-escalation hole, and the reclassification
decides, per site, which of the two guards it needs.

## Measured tree state (HEAD `40965560`, 2026-09-29; every quantity names its command)

**The deprecated shim, quoted from source.** `src/lib/supabase/auth.ts:451-453`:

```
export async function requireOwner(): Promise<AuthorizedUser> {
  return requireUser();
}
```

Its `@deprecated` block (`:436-450`) states the danger in the code's own words:

> Until that wave lands, this alias is DELIBERATELY LESS RESTRICTIVE than the
> requireOwner() it replaces for those specific call sites - a tracked,
> temporary state, not an oversight.

`requireUser()` is defined at `:328` (authorizes any active account),
`requireAppOwner()` at `:408` (authorizes `role==='owner'` only, with the
impersonation branch at `:409-415` re-checking `role` AND `status`). These three
are the real objects the reclassification ranges over.

**Call-site counts. This is a MOVING TARGET - R2 sub-waves are already landing,
so the counts have fallen since the row and A6 were written, and will keep
falling as the work proceeds. Do not size a wave off any single figure; the
done-state (AC-4) is stated as an absolute, not a delta.**

| Quantity | Command | Value |
|---|---|---|
| `await requireOwner()` occurrences, all of `src/` | `grep -roE "await requireOwner\(\)" src/ \| wc -l` | 270 |
| Same, the row's cited PowerShell form | `Get-ChildItem -Path src -Recurse -Include *.ts,*.tsx \| Select-String -Pattern "await requireOwner()"` -> `.Count` | 274 |
| Real call sites (production only, comments excluded) | `grep -rnE "await requireOwner\(\)" src/ --include=*.ts --include=*.tsx \| grep -vE "\.test\.(ts\|tsx):" \| grep -vE ":[0-9]+:\s*(//\|\*\|/\*)" \| wc -l` | 266 |
| Files carrying a real call | same, `\| cut -d: -f1 \| sort -u \| wc -l` | 68 |
| `await requireAppOwner()` real call sites (prod, comments excluded) | `grep -rnE "await requireAppOwner\(\)" src/ --include=*.ts --include=*.tsx \| grep -vE "\.test\.(ts\|tsx):" \| grep -vE ":[0-9]+:\s*(//\|\*\|/\*)" \| wc -l` | 107 |
| Files carrying a `requireAppOwner()` call (prod) | same, `\| cut -d: -f1 \| sort -u \| wc -l` | 18 |
| `requireOwner` still exported? | `grep -rn "export async function requireOwner" src/` | yes, `auth.ts:451` |

**Two measurement findings the consumer must carry:**

1. **The row calls the grep and the PowerShell forms "equivalent"
   (`docs/backlog.yml:99`); they are NOT.** `Select-String -Pattern "await
   requireOwner()"` leaves the `()` unescaped, so it is the regex `await
   requireOwner` followed by an empty group - it matches comment prose that
   writes `await requireOwner` without the literal parens, which is why it
   returns 274 against the grep's 270. When a count settles anything here, use
   the escaped grep form or the comment-excluded production count, never the
   row's Select-String pattern.

2. **The row's numbers (411 call sites; requireAppOwner 19 files / 23 calls) are
   badly stale, in BOTH directions.** `requireOwner()` has fallen from 411
   (2026-09-15) through 305 (`docs/owner-private-secrets.md:695`, 37644e2,
   2026-09-28) to 266 today, and `requireAppOwner()` has GROWN from 23 to 107
   calls as sites migrated INTO it. The row itself
   (`docs/backlog.yml:101`) warns both numbers are stale and must be re-measured
   at scoping time; this is that re-measurement. Any brief that inherits 411 or
   23 is building on a number that was already wrong when it was copied.

## Leverage claim - fired and DECLINED

R2 is a security-hardening chore (kind `chore`, `docs/backlog.yml:93`), not a
capability a user reaches. Per `docs/DEV_LOOP.md` ("The loop / Criteria") and
`docs/loop/leverage.md`, a bug fix / refactor / chore makes no leverage claim;
the fired trigger is recorded and the seat moves on. What R2 EARNS is stated
plainly instead of dressed as a leverage class: it closes a known
privilege-escalation gap - today every one of 266 `requireOwner()` call sites
admits any active account (`auth.ts:451-452`), so any site that reaches an
owner-private resource is a hole an approved member can walk through. There is
no removal-test criterion, because there is no advantage-over-a-chat to remove.

## Numbered acceptance criteria

Each criterion names its object, its instrument, and its direction of failure,
and carries a class tag: [MEASURED] = executable/mechanically checkable here;
[READING] = verified by reading source only (no component renders under vitest,
`docs/loop/this-repo.md`); [HUMAN-RULING] = a policy call an agent must not
guess (routed to the open questions below).

### AC-1 - The classification rule is decidable and single-valued per site [READING]

- Owner's words: "Every one of the ~183 existing `requireOwner()` call sites is
  migrated to the correct one of the two" (A6). "Correct" needs a rule two
  people apply the same way.
- Object: the guard chosen for each converted call site, against the rule below.
- The rule, stated at criterion level (the ENUMERATION it ranges over and the
  per-site walk are `docs/owner-private-secrets.md` sections 4-5, not this
  document): a call site becomes **`requireAppOwner()`** when a non-owner
  reaching it could act on **the owner's own identity or the owner's own private
  data** - their GitHub repositories, their Canvas gradebook, their cloned
  face or voice - through a credential the deployment holds once, AND that reach
  is not already contained at the secret's own read site by an
  `identity.role === "owner"` check. A call site becomes **`requireUser()`**
  when the worst a non-owner can reach is **shared metered spend** on a
  third-party service that holds nothing of the owner's, OR **rows scoped to the
  caller's own `user_id`**, OR an owner-private reach that is ALREADY contained
  at the secret. The distinguishing phrase already exists in executing code:
  "not merely a shared billing key"
  (`src/app/actions/action-guard-coverage.test.ts:313`), and
  `docs/owner-private-secrets.md:36-44` is the one-paragraph statement this
  criterion adopts rather than reinvents.
- A THIRD disposition exists and the rule must not erase it: a site may keep
  `requireUser()` AND carry an in-body `identity.role === "owner"` branch
  ("Fixed in the BODY, not the guard",
  `src/app/actions/course-hub-integrations.ts:154`). Converting such a site
  changes the GUARD only and must not touch the body
  (`docs/owner-private-secrets.md:397-409`).
- Instrument: [READING] each converted site's disposition is traceable to the
  rule above via the section-5 decision procedure, and its reason is recorded
  where the classification is pinned (`OWNER_ONLY`, `MEDIA_OWNER_ONLY_ACTIONS`,
  `GITHUB_NOT_OWNER_ONLY`, `REVIEWED_PERMISSIVE`, or the site's own
  `*.guard.test.ts`). Uncontained-ness is explicitly NOT the criterion
  (`docs/owner-private-secrets.md:46-50`): many shared secrets are read flat
  from `process.env` and are correctly permissive.
- Direction of failure: FAILS if a site's chosen guard cannot be derived from
  the rule (i.e. two reviewers applying section 5 would reach different guards),
  or if a conversion silently rewrites an in-body owner branch instead of only
  the guard. Categories where the rule is genuinely a policy call are
  [HUMAN-RULING] and are listed in "Open questions" - they are NOT to be guessed
  into a disposition (`docs/loop/traps-spec.md:108-129`).

### AC-2 - Safety invariant, restrictive direction: no owner-private site is left permissive [MEASURED + READING]

- The whole point of R2. After a site is converted, an owner-private-reaching
  action must not still admit an active non-owner.
- Object: a specific converted action export that reaches an owner-private
  target on a verified path with no containment at the secret.
- Instrument: [MEASURED] an executing per-action test in the
  `src/app/actions/grading.guard.test.ts:294-311` idiom - mock
  `@/lib/supabase/auth`'s client as an `active` NON-owner and call the real
  export; PC1 in `docs/owner-private-secrets.md:413-420`. Ranging over WHICH
  sites are owner-private is a graph walk per direct edge against the FOUR
  owner-private families (GitHub PAT, Canvas env pair, HeyGen/Tavus likeness,
  ElevenLabs voice id), each walk stating which targets it forbade
  (`docs/owner-private-secrets.md:377-381`, RULING 90) - that walk is the
  architect's/plan's, not this document's.
- Direction of failure: FAILS (RED) if the action RESOLVES (or returns a
  non-error result) for an `active` non-owner session. It must fail on the site
  STILL BEING PERMISSIVE, never only on unrelated breakage.

### AC-3 - Safety invariant, permissive direction: no any-user site is wrongly tightened [MEASURED]

- The equal-and-opposite failure: locking a legitimate any-authenticated-user
  endpoint to `requireAppOwner()` locks real approved members out of the app.
  `docs/multi-user-login-architecture.md:349-353` measured the cost: 72 of 103
  files transitively reach a shared owner-funded secret, so over-gating "would
  leave an approved member with a login and a blank app."
- Object: a specific action export converted to `requireUser()` (or left
  permissive), for an `active` non-owner session.
- Instrument: [MEASURED] the same executing fake, permissive direction - PC2
  (`docs/owner-private-secrets.md:422-427`): assert the action does NOT reject
  for an `active` non-owner. This needs its OWN instrument because
  over-tightening moves toward what the under-tightening ratchet wants, so that
  ratchet never complains (`src/app/actions/guard-overtightening.test.ts:22-25`).
  PC2 must be accompanied by PC3, the non-vacuity check
  (`docs/owner-private-secrets.md:429-433`): `requireAppOwner()` called directly
  on the very same mocked session must FAIL to resolve, or a mis-built fake makes
  every permissive assertion pass for the wrong reason
  (`src/app/actions/grading.guard.test.ts:410` is the shipped instance).
- Direction of failure: FAILS (RED) if the action REJECTS an `active` non-owner
  it should serve; the accompanying PC3 FAILS if the fake is not actually a
  non-owner. Both must be present per converted file - adding a name to a pinned
  list is not evidence (`docs/owner-private-secrets.md:646`, RES-3).

### AC-4 - Done state: `requireOwner()` reaches zero call sites and is no longer exported [MEASURED]

- Owner's words: "`requireOwner` no longer exists as an export" (A6).
- Object: the count of real `requireOwner()` call sites, and the export itself.
- Instrument: [MEASURED] `grep -roE "await requireOwner\(\)" src/ | wc -l`
  returns **0** (agreed residual: none, unless the owner rules otherwise - see
  Open questions Q3); AND `grep -rn "export .*function requireOwner\|export {[^}]*requireOwner" src/`
  returns nothing (the shim is deleted, so a re-introduction is a compile error,
  not a silent alias). A stray `await requireOwner()` inside a COMMENT is
  cosmetic once the export is gone - the grep will flag it and it should be
  cleaned, but it is not a live gate; the load-bearing gate is the missing
  export, which makes any real call a build failure.
- Direction of failure: FAILS if any real call site remains; FAILS if
  `requireOwner` is still exported (so a future edit can re-add a call with no
  error); FAILS if the count is driven to zero by DELETING the guard on a site
  rather than reclassifying it (caught by AC-2/AC-3, which is why AC-4 is the
  done-instrument and never the safety proof).

### AC-5 - Every reclassification is evidenced by an executing guard test, not a render and not a grep [READING + MEASURED]

- Security-sensitive, and nothing renders under vitest
  (`docs/loop/this-repo.md`), so the evidence must be reading plus an executing
  guard test, never a live model or a rendered component.
- Object: the evidence attached to each converted file.
- Instrument: [MEASURED] each converted file has a `*.guard.test.ts` carrying PC1
  (restrictive sites) or PC2+PC3 (permissive sites) in the
  `grading.guard.test.ts` idiom, which drives the REAL exported action through a
  mocked auth client. [READING] a source-text guard (the
  `action-guard-coverage*.test.ts` family) may PIN a disposition but does not by
  itself prove behaviour - `docs/r2-scope.md:450-462` retracts the claim that
  the source-text check executes anything, so it is a pin, not the proof.
- Direction of failure: FAILS if a conversion's only evidence is a source-text
  grep for the guard name, a name added to a pinned list, or a claim about what
  a render would show. A guard test that cannot fail (no PC3 on the permissive
  direction) counts as no evidence.

### AC-6 - Wave-ability: the 266 sites land in independently-reviewable batches, highest owner-private risk first [READING]

- 266 call sites across 68 files cannot land safely in one wave. R2 is already
  being worked this way (sub-waves 1-7 shipped; `docs/r2-wave1-subwaves.md`,
  `docs/r2-scope.md`), so this criterion pins the principle the in-flight work
  already follows rather than inventing a new one.
- Object: the batch boundaries and the order in which the guard test tightens.
- Instrument: [READING] batches are cut by COHORT (the file or the owner-private
  family a set of sites shares - e.g. the media cohort, the GitHub cohort, the
  Canvas cohort), ordered HIGHEST-OWNER-PRIVATE-RISK FIRST (the GitHub PAT and
  Canvas/likeness families before shared-spend-only files), and each batch is
  independently pushable with its own PC1/PC2/PC3 tests green. A batch is a valid
  R2 batch only if its file set is disjoint from every other in-flight item's
  (`docs/loop/parallel-disjointness.md`) - the wave plan owns that computation,
  not this document.
- Direction of failure: FAILS if a batch cannot be reviewed or pushed without a
  sibling batch; FAILS if the export-removal / final tightening in AC-4 is
  attempted before the LAST site is converted (removing the export while any call
  remains is a build break, which is the correct failure but the wrong time);
  FAILS if a batch is ordered so a shared owner-private secret stays permissive
  longer than a shared-spend-only file.

### AC-7 - Ambiguous categories are ruled by a human, not guessed [HUMAN-RULING]

- A6 says "no call site is left ambiguous." Some sites are ambiguous by POLICY,
  not by missing information; the rule (AC-1) cannot decide them, and guessing
  one into a disposition is the failure `docs/loop/traps-spec.md:108-129` names.
- Object: any site whose correct guard depends on a policy decision the code
  does not settle.
- Instrument: [HUMAN-RULING] each such category is listed in "Open questions"
  below with a terminating fork, and no sub-wave converts a site in that category
  until the fork is answered. The already-identified one is the code sandbox
  (`runSubmissionCodeAction`, `docs/owner-private-secrets.md` section 7); any new
  one a sub-wave meets follows the escalation procedure at
  `docs/owner-private-secrets.md:606-632` (do not widen the criterion inside the
  sub-wave that found it).
- Direction of failure: FAILS if a [HUMAN-RULING] site is converted on an agent's
  inferred reading of precedent instead of an owner answer.

## Alignment with A6, and where this document diverges

- A6's "~183 call sites" was measured 2026-09-05
  (`docs/multi-user-login-acceptance-criteria.md:16-18`, "~183 files"). The
  measured figure today is 266 call sites in 68 files (see Measured tree state).
  A6's COUNT is superseded; A6's REQUIREMENT (every site migrated, export
  removed) is kept verbatim.
- A6 requires the `runAsOwner` impersonation path to keep working and still
  re-check that the impersonated identity is a real owner. That is already true
  in the tree - `requireAppOwner()` re-checks `role` AND `status` on the
  impersonation branch (`auth.ts:409-415`). This document adds no criterion for
  it because A6 already owns it and the code already satisfies it; a checker
  should confirm no R2 conversion regresses it.
- No disposition table is included because this is the first
  `docs/r2-acceptance-criteria.md`; there is no prior version of THIS artifact to
  map. A6 is not being restructured - it lives in its own document and its
  Group-A siblings shipped - so it is aligned-with above, not disposed-of here.

## Open questions - forks a human must settle (do NOT guess into the criteria)

Each is phrased so every answer terminates the question: the answer is applied as
transcription to the sites/sections named, and nothing else reopens.

- **Q1 - the code sandbox limb (the one genuine fork).** The shipped criterion
  has exactly one restrictive limb: the site reaches the owner's OWN resource.
  `runSubmissionCodeAction` reaches nothing of the owner's, but a permissive site
  there hands any approved account arbitrary code execution on a third-party
  service under the deployment's key (and an SSRF/sandbox-escape surface if
  `PISTON_API_URL` is ever self-hosted). Sub-wave 7 already shipped it as
  `requireAppOwner()` with an executing test
  (`src/app/actions/grading.guard.test.ts:294`). Which does the criterion carry
  for the remaining sub-waves:
  **(A)** one limb - owner-private only; sandbox reclassified to `requireUser()`;
  **(B)** two limbs - add "confers arbitrary code execution on a third-party
  service through a shared credential", membership = exactly `code-runner.ts` as
  a closed set;
  **(C)** one limb plus a named exception (the `MEDIA_OWNER_ONLY_ACTIONS` shape) -
  `runSubmissionCodeAction` stays `requireAppOwner()` as a single listed entry,
  no general limb.
  `docs/owner-private-secrets.md` section 7 recommends (C) and shows every answer
  is applied as transcription to sections 4.2/5/6.1 with nothing else reopened.
  Terminating: the chosen letter is applied to those sections and the sandbox
  site; no other site's disposition depends on it.

- **Q2 - is any [HUMAN-RULING] category besides the sandbox present?** If a later
  sub-wave meets a secret section 4's floor does not cover and section 1's test
  cannot settle from code, that site is escalated, not guessed. Terminating: the
  owner either rules the site's guard directly, or confirms the section-9
  escalation procedure handles it and no per-site answer is owed now.

- **Q3 - does `requireOwner()` reach exactly ZERO, or is any residual
  deliberately kept?** A6 says the export no longer exists, which forces zero.
  Terminating: either the answer is "zero, delete the export" (AC-4 stands as
  written), or the owner names a specific site to keep and WHY, which becomes a
  listed exception with its own guard test and AC-4's target becomes that named
  residual instead of 0. Recommendation: zero - A6 is explicit and the shim's own
  doc comment calls its existence "a tracked, temporary state, not an oversight"
  (`auth.ts:448-449`).

## Residual register

Each residual names owner, instrument, and the step that will measure it; one
missing any of the three is a deletion (`docs/loop/iteration-caps.md:36-37`).
**These must be filed as rows in `docs/BACKLOG.md` by the orchestrator** - this
seat does not write the backlog under concurrency; until then they exist only
here, which `iteration-caps.md` counts as not yet real.

| id | Residual | Owner | Instrument | Step |
|---|---|---|---|---|
| RR-1 | The classification ENUMERATION and per-site graph walks (which sites reach which owner-private family) | Architect / plan | `docs/owner-private-secrets.md` sections 4-5 + `walkRuntimeGraph` per direct edge, stating targets forbidden | Each R2 sub-wave's scope, before its conversions |
| RR-2 | PC1/PC2/PC3 oracle construction per converted file | Test seat | The `grading.guard.test.ts` idiom, PC3 non-vacuity present | Each sub-wave's test step |
| RR-3 | `ELEVENLABS_VOICE_ID` (`media-voice.ts:261`) is reachable by an active non-owner via two `requireUser()` actions; it is named owner-private at `auth.ts:295`. NOT R2's defect and NOT R2's to fix; surfaced by R2's criterion | Repo owner (decides gate-the-fallback vs accept); a follow-up wave implements | Executing test: mock active non-owner, call `synthesizeNarrationAction`, assert resolved voice id is not the env value | A named follow-up wave outside R2 (`docs/owner-private-secrets.md:644`, RES-1) |
| RR-4 | Per-user spend quotas on shared LLM / TTS / grading / sandbox keys. R2 must not be read as closing this | Repo owner (product decision) | None exists to build here; exposure requires an approval (`SIGNUP_MODE=approval` default) | Explicitly NOT R2 (`docs/multi-user-login-architecture.md:426-431`; `docs/owner-private-secrets.md:648`, RES-5) |
| RR-5 | Whether every converted site's behaviour is correct in the deployed app (nothing renders / no API key here) | Owner | Exercise the deployed app as an approved non-owner and as owner | Post-deploy owner verification |

## What I could not determine

- **The exact final count of sites owed `requireAppOwner()` vs `requireUser()`.**
  That is the enumeration in RR-1, which is the architect's/plan's per-edge walk,
  not this seat's - and it is still moving as sub-waves land. This document pins
  the RULE and the DONE-state (zero + no export), which do not depend on the
  running count.
- **Whether any [HUMAN-RULING] site beyond the sandbox exists.** Section 9 of
  `docs/owner-private-secrets.md` says more will be found; Q2 routes them.
- **Any behaviour in the deployed app.** No component renders under vitest and
  there is no API key (`docs/loop/this-repo.md`), so every reachability statement
  here is a source-reading claim about guards and call paths, not an observation.

## Out of scope for this document (routed)

- The enumeration, the per-edge walks, the file layout of the sub-waves ->
  architect / plan (`docs/r2-scope.md`, `docs/r2-wave1-subwaves.md`,
  `docs/owner-private-secrets.md`).
- Oracle / fixture / sabotage construction for PC1/PC2/PC3 -> test seat.
- The `ELEVENLABS_VOICE_ID` gap and per-user spend quotas -> named follow-ups,
  not R2.
