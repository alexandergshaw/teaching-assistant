# Owner-private secrets: the enumeration, and the criterion the remaining R2 sub-waves classify against

Written 2026-09-28 against the tree at `37644e2`, immediately after R2 sub-wave 7.
Consumer: every remaining R2 sub-wave, and any future wave that adds a call site
reaching a shared server secret.

**THE ONE CORRECTION THAT CHANGES WHAT THE REMAINING SUB-WAVES DO.** The brief
that commissioned this document said the criterion "is written down nowhere."
That is not what I found. The criterion is written down in three places, one of
them executing code, and they agree with each other. What was missing is the
ENUMERATION the criterion ranges over - and sub-wave 7's reading of its own
finding does not match the criterion that is already shipped. Section 4 is the
enumeration; section 6 states why the sandbox is not a third owner-private
secret and section 7 is the one fork that is genuinely the owner's.

**What this document is NOT.** It is not a new rule. Every clause in section 5
is quoted from code or from a document that `requireAppOwner()`'s own doc
comment cites. Where I could not derive a clause, section 7 says so and puts the
question to the owner rather than inventing one. I checked
`docs/owner-decisions-2026-09-23.md` and `docs/owner-decisions-2026-09-27.md`
FIRST, as `docs/loop/traps-spec.md:108-129` requires: neither mentions
`requireOwner`, `requireAppOwner`, `owner-private`, `secret`, `GEMINI` or
`PISTON`, so no owner decision bears on this question and this document reasons
from quoted code instead.

```
grep -n "requireAppOwner\|requireOwner\|owner-private\|secret\|GEMINI\|PISTON" \
  docs/owner-decisions-2026-09-23.md docs/owner-decisions-2026-09-27.md
# -> no output, exit 1
```

---

## 1. The criterion, in one paragraph, before the evidence

A call site is `requireAppOwner()` when a non-owner reaching it could act on
**the owner's own identity or the owner's own private data** - their GitHub
repositories, their Canvas gradebook, their cloned face or voice - through a
credential the deployment holds once. A call site is `requireUser()` when the
worst a non-owner can reach is **shared metered spend** on a third-party service
that holds nothing of the owner's, or **rows scoped to the caller's own
`user_id`**. The distinguishing phrase is already in the tree, and it is the
whole criterion in six words: **"not merely a shared billing key"**
(`src/app/actions/action-guard-coverage.test.ts:313`).

Uncontained-ness is NOT the criterion. Many shared secrets in this tree are read
straight from `process.env` with no containment of any kind and are correctly
permissive today, in shipped, tested code. Section 6 works that through, because
mistaking uncontained-ness for the criterion is the single error that would
misclassify the most remaining sites.

---

## 2. The three places the criterion is already written, quoted

**(a) `src/lib/supabase/auth.ts:369-375`, the guard's own doc comment.** Located
by `grep -n "OWNER-PRIVATE resource through a shared server" src/lib/supabase/auth.ts`
-> `:370`.

> Authorize a server action for role==='owner' ONLY. Reserved for call sites
> that spend or reach an OWNER-PRIVATE resource through a shared server
> secret (Canvas, GitHub, the cloned voice/avatar, ...) plus the admin
> surface

and at `:374-375`, why the list is small:

> the actual containment for most capabilities lives at the secret itself rather
> than at every call site, which is why requireAppOwner() is reserved for a
> smaller list than "everything that used to call requireOwner()".

**(b) `src/lib/supabase/auth.ts:294-295`, the same file's enumeration of the
families.** Located by `grep -n "cloned voice/avatar" src/lib/supabase/auth.ts`
-> `:295`. Describing what an active non-owner would reach if the impersonation
check were loosened:

> reach every owner-private capability still gated by the requireOwner() name -
> Canvas, GITHUB_TOKEN, the cloned voice/avatar (AC R7).

**Three families, named in production source, not two.** This matters in section
8.

**(c) `src/app/actions/action-guard-coverage.test.ts:309-317`, the R3 media
split - the criterion applied, in code that executes.** Located by
`grep -n "not merely a shared billing key" src/app/actions/action-guard-coverage.test.ts`
-> `:313`.

> These reach an owner-private identity - HeyGen's single configured avatar
> (media-avatar.ts) or a Tavus-trained likeness that is owner-gated by design
> [...] - not merely a shared billing key. The rest of the media cohort
> (media.ts, media-voice.ts) reaches only per-user data or a shared LLM/TTS key
> without an owner-private identity behind it, so those 27 call sites were
> reclassified to requireUser() instead

This is the load-bearing citation, because it is not a design intention: 27 call
sites shipped permissive on exactly this reasoning, and a test pins the split in
both directions. Re-measured from the tree, not from the comment:

```
grep -cE 'await requireUser\(\)' src/app/actions/media.ts        # 17
grep -cE 'await requireUser\(\)' src/app/actions/media-voice.ts  # 10
```

17 + 10 = 27, matching the comment's own figure. The two files' auth imports are
single-line (`grep -n "supabase/auth" src/app/actions/media.ts` -> `:15`;
`src/app/actions/media-voice.ts` -> `:6`), so no import line is being miscounted
as a call.

**Corroborating, from the doc `requireAppOwner()` tells you to read.**
`docs/multi-user-login-architecture.md:183-185` (located by
`grep -n "No per-user API keys for Gemini" docs/multi-user-login-architecture.md`):

> No per-user API keys for Gemini/ElevenLabs/HeyGen. The approval gate is the
> containment for shared spend in this pass; per-user credentials are a
> follow-up

and `docs/r2-scope.md:428` (located by
`grep -n "shared LLM key with no owner-private identity behind it" docs/r2-scope.md`)
states Group C's rule as: reaches only

> rows scoped to the caller's own `user_id`, their own Microsoft/Google
> credential, or a shared LLM key with no owner-private identity behind it

---

## 3. The instruments, and what each one cannot see

Stated first because four instruments in this repo have claimed more than they
measured, and because my own first parse of one list in this pass was wrong.

**I3.1 - the env-name census.** The brief handed me
`grep -rhoE 'process\.env\.[A-Z0-9_]+' src/lib --include=*.ts` and reported ~53
distinct names. Reproduced exactly, that command returns **52** here, not 53:

```
grep -rhoE 'process\.env\.[A-Z0-9_]+' src/lib --include=*.ts | sort -u | wc -l
# 52
```

It also covers only `src/lib`, includes test files, and - the real gap - its
character class `[A-Z0-9_]` cannot see a lowercase or bracket-form access. My
widened census:

```
find src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.mts' -o -name '*.cts' \
  -o -name '*.js' -o -name '*.mjs' \) ! -name '*.test.ts' ! -name '*.test.tsx' \
  > prod_files.txt
wc -l < prod_files.txt                                    # 1602 production files
xargs -0 grep -hoE 'process\.env\.[A-Za-z0-9_]+' < prod_files.txt(NUL) \
  | sed 's/process\.env\.//' | sort -u | wc -l             # 59 distinct dotted names
xargs -0 grep -hoE 'process\.env\[[^]]*\]' < prod_files.txt(NUL) | sort -u
```

(`prod_files.txt(NUL)` above is shorthand for `cat prod_files.txt | tr '\n' '\0' |
xargs -0 ...`, which is how each of these was actually run; `xargs -0` is used
because this checkout's path contains spaces.)

**The bracket form is the part the brief's grep structurally could not observe**,
and it holds real credentials. Eight non-comment bracket reads, in four files:

| Site | Expression |
|---|---|
| `src/lib/canvas-credentials.ts:128` | ``process.env[`${institution}_CANVAS_URL`]`` |
| `src/lib/canvas-credentials.ts:130` | ``process.env[`${institution}_CANVAS_API_TOKEN`]`` |
| `src/app/actions/course-hub-integrations.ts:177` | `${code}_CANVAS_URL` / `${code}_CANVAS_API_TOKEN` |
| `src/app/actions/course-hub-integrations.ts:181` | `${code}_LLM_URL` / `${code}_LLM_API` |
| `src/app/actions/course-hub-integrations.ts:219` | `process.env[key]` / `${code}_CANVAS_API_TOKEN` |
| `src/app/actions/course-hub-integrations.ts:228` | `${inst.code}_CANVAS_API_TOKEN` |
| `src/lib/grading-engine.ts:22` | `${code.trim().toUpperCase()}_LLM_URL` |
| `src/lib/grading-engine.ts:36` | `${code.trim().toUpperCase()}_LLM_API` |

Also checked and empty, so no third access shape is hiding: destructuring.
`xargs -0 grep -hnE '\}\s*=\s*process\.env' < prod_files.txt(NUL)` returns no
output.

**What I3.1 still cannot see:** an env value read in a build step, a Vercel
dashboard variable no source file names, an `.env` file (none exists in this
checkout - `docs/loop/this-repo.md:59-61`), or a secret reached through a
library that reads `process.env` itself. The enumeration in section 4 is a FLOOR
over `src/`, and section 9 exists because it is a floor.

**I3.2 - comment exclusion, and proof it did something.** A bare `grep -c` counts
prose here; it miscounted twice in one day for the agent that briefed me. Every
count below excludes lines whose first non-space character begins a comment:

```
| grep -vE ':[0-9]+:\s*(//|\*|/\*)'
```

Proof the filter is not a no-op, on the largest census I ran:

```
# createServiceClient references in the 1602 production files
... | grep -vE ':[0-9]+:\s*(//|\*|/\*)' | wc -l    # 206 kept
... | grep -cE  ':[0-9]+:\s*(//|\*|/\*)'           # 14 removed
```

Fourteen comment lines removed. The filter is line-based, so it does NOT strip a
trailing `// requireUser()` on a line that also holds code, and it does not
strip the interior of a block comment whose continuation lines lack a leading
`*`. Both are acknowledged holes, not claimed coverage.

**I3.3 - list sizes are PARSED, not grepped.** `docs/loop/traps-spec.md:5-9`
records a count of 13 against a true 11 from exactly this shortcut. The three
lists in `action-guard-coverage.test.ts` were counted by brace-matching the
declaration in a Python script and extracting top-level keys:

```
OWNER_ONLY keys                : 19
MEDIA_OWNER_ONLY_ACTIONS       : 14
PINNED_UNGUARDED               : 28
REVIEWED_PERMISSIVE (guard-overtightening.test.ts) : 24, across 11 files
```

**My own instrument failed once in this pass and I am recording it.** My first
parse of `REVIEWED_PERMISSIVE` anchored on the string's first occurrence, which
is inside the file's doc comment, and returned **72**. Re-anchored on
`^const REVIEWED_PERMISSIVE` (declaration at `:159`, closing brace at `:303`) it
returns **24**, which matches that file's own header sentence
("exactly the 24 action exports named in REVIEWED_PERMISSIVE"). The 72 was my
instrument, not the tree.

**I3.4 - what executes.** Three files were run, via the wrapper
`docs/loop/this-repo.md:40-45` mandates for any multi-path check:

```
npm run test:paths -- src/app/actions/action-guard-coverage.test.ts \
  src/lib/supabase/auth.test.ts src/lib/no-emojis.test.ts
# Test Files  3 passed (3) / Tests  71 passed (71)
# COVERED src/app/actions/action-guard-coverage.test.ts files=1 passed=15
# COVERED src/lib/supabase/auth.test.ts             files=1 passed=38
# COVERED src/lib/no-emojis.test.ts                 files=1 passed=18
```

Of those, only `auth.test.ts` executes a guard. `action-guard-coverage.test.ts`
is a regex over source text - `docs/r2-scope.md:450-462` retracts an earlier
claim that it executes anything, and this document does not reinstate it.

---

## 4. The enumeration: every shared server secret an action can reach

59 distinct dotted names plus the bracket family. **24 of the 59 carry capability
and are classified in 4.1-4.3; the other 35 are TUNABLES** - model ids, numeric
caps, timezone strings, flags, public URLs and `NEXT_PUBLIC_*` values that ship
to the browser by definition. All 35 are listed in section 4.4 so the reader can
check I did not quietly drop a credential into that bucket.

**The partition was computed, not eyeballed.** A Python set difference over the
census file and a literal of the 24 classified names: `classified: 24 | not in
census: []`, `remainder: 35`, and 24 + 35 = 59, so the two lists are disjoint and
exhaustive over the dotted census. The bracket family
(`<CODE>_CANVAS_API_TOKEN`, `<CODE>_CANVAS_URL`, `<CODE>_LLM_API`,
`<CODE>_LLM_URL`) is outside that 59 by construction - no dotted grep can see
it - and is classified in 4.1 and 4.2 separately.

Column meanings:

- **Read at** - the non-comment line that reads the value.
- **Per-caller containment** - does the READ SITE ITSELF consult the calling
  identity and refuse a non-owner, the way `resolveCanvasCredential` does? Not
  "is there a guard somewhere upstream" - that is the thing being decided.
- **Class** - `OWNER-PRIVATE` (the owner's own identity or data behind it),
  `SHARED SPEND` (metered third-party service, nothing of the owner's behind it),
  `CROSS-TENANT` (reaches other accounts' data), `INBOUND` (compared against an
  incoming request, never spent outward), `CONFIG`.

### 4.1 OWNER-PRIVATE - the set `requireAppOwner()` exists for

| Secret | Read at | Per-caller containment | What a non-owner could cause if a site reaching it stayed permissive |
|---|---|---|---|
| `GITHUB_TOKEN` | `src/lib/github.repos.ts:9` (`githubToken()`), consulted from `ghFetch` at `:32` | **NONE.** The function reads `process.env` and throws only when unset; it never looks at an identity | Create/delete repos, read/write repo content, manage collaborators, read commit and PR data, all against the owner's PAT. `docs/r2-scope.md:428` states this surface |
| `<CODE>_CANVAS_API_TOKEN` and `<CODE>_CANVAS_URL` | `src/lib/canvas-credentials.ts:130` and `:128`, inside `resolveOwnerEnvCredential` | **YES, at the secret.** `resolveCanvasCredential:220` gates the env fallback on `identity.role === "owner"`, where `identity` comes from `getEffectiveIdentity()` at `:191`, never from a parameter | Nothing, on this path. A non-owner with no stored row gets `CANVAS_CREDENTIAL_REQUIRED_MESSAGE` (`:227`). This is the worked precedent for a reach that legitimately stays permissive |
| `<CODE>_CANVAS_*`, second reader | `src/app/actions/course-hub-integrations.ts:177`, `:219`, `:228` | **YES, in the body.** `:170` computes `isOwner` from `identity.role` and `:177` conjoins it; in the second action the guard is at `:212` and `:214` re-checks `identity.role === "owner"` before the `Object.keys(process.env)` scan at `:215` | Nothing, as written. See section 5.3 - this is the site a mechanical converter is most likely to break |
| `HEYGEN_AVATAR_ID`, `HEYGEN_VOICE_ID`, `HEYGEN_API_KEY` | `src/app/actions/media-avatar.ts:31`, `:36`, `:30` | **NONE at the secret.** Contained at the ACTION: all 3 non-comment guard calls in that file are `requireAppOwner()` | Render video as the owner's face. `action-guard-coverage.test.ts:319` calls that avatar id "the owner's own face, configured once for the whole deployment" |
| `TAVUS_API_KEY` (the trained likeness behind it) | `src/app/actions/media-likeness.ts:59` | **NONE at the secret.** Contained at the ACTION: all 12 non-comment guard calls in that file are `requireAppOwner()` | Train, render, retire or delete the owner's own trained likeness |
| `ELEVENLABS_VOICE_ID` | `src/app/actions/media-voice.ts:261`, inside `resolveNarrationVoiceId` | **NONE, at the secret or at the action.** See below - this is a live gap, not a classification | Synthesize speech in the owner's cloned voice, if that variable is set |

**The `ELEVENLABS_VOICE_ID` finding, stated precisely because it is the one place
the shipped code and the shipped criterion disagree.** `resolveNarrationVoiceId`
(`src/app/actions/media-voice.ts:250-262`) resolves in three steps: a
caller-supplied `voiceIdOverride`, then the caller's own `user_style.voice_id`,
then `process.env.ELEVENLABS_VOICE_ID`. Step 3 has no `identity.role === "owner"`
check - compare `canvas-credentials.ts:220`, which does. Its two callers are
`synthesizeNarrationAction` (`:302`, guarded `requireUser()` at `:296`) and
`synthesizeLongNarrationAction` (`:328`, guarded `requireUser()`). Located by
`grep -n "resolveNarrationVoiceId" src/app/actions/media-voice.ts` -> `:250`,
`:302`, `:328`.

`docs/multi-user-login-architecture.md:381-382` planned exactly this assertion -
"The three media env fallbacks (`HEYGEN_AVATAR_ID`, `ELEVENLABS_VOICE_ID`, the
Tavus key) assert at their own read sites." Two of the three are contained at the
action instead, which is equivalent. `ELEVENLABS_VOICE_ID` is contained nowhere.

This is **not R2's defect and not R2's to fix** - R3 shipped these 27 permissive
sites, and the criterion this document states is what makes the gap visible. It
is RES-1 in section 10, and it is the reason section 8 says the owner-private
enumeration is FOUR families rather than two or three.

### 4.2 SHARED SPEND - metered, nothing of the owner's behind it, permissive by the shipped criterion

| Secret | Read at | Per-caller containment | Worst case for a non-owner |
|---|---|---|---|
| `GEMINI_API_KEY` | `src/lib/gemini.ts:89` (`getGeminiApiKey()`) | **NONE.** Flat read, throws only when unset | Spend the deployment's model budget. See section 6 |
| `ELEVENLABS_API_KEY` | `src/app/actions/media-voice.ts:19,31,145,179,297,322,362` | **NONE.** Flat read at each site | Spend the deployment's TTS budget. Shipped permissive at all 10 guard calls in that file |
| `COURSE_ENGINE_API_KEY` | `src/lib/course-engine.ts:24` | **NONE.** Optional - `authHeaders()` at `:28-31` attaches the header only when set | Spend the Course Engine budget. Base URL defaults to a public host (`:13`) |
| `GRADING_API_KEY`, `<CODE>_LLM_API` | `src/lib/grading-engine.ts:37` and `:36` | **NO per-CALLER containment.** `:36` is keyed on an institution acronym supplied by the caller, not on the caller's identity - do not mistake per-institution for per-caller | Spend the grading service budget |
| `UNSPLASH_ACCESS_KEY` | `src/app/actions/unsplash.ts:37`, `:58` | **NONE.** Both actions carry NO guard at all (`grep -cE '\brequire(User\|AppOwner\|Owner)\s*\(' src/app/actions/unsplash.ts` -> 0) and are pinned in `PINNED_UNGUARDED` (`action-guard-coverage.test.ts:237`, `:263`) | Spend the Unsplash quota. Out of R2's scope - there is no `requireOwner()` here to convert |
| `PISTON_API_KEY`, `PISTON_API_URL`, `WANDBOX_API_URL` | `src/lib/code-runner.ts:112`, `:108`, `:115` | **NONE.** Module-level constants, evaluated at import | Section 6 and section 7. This is the one contested entry in the whole table |

### 4.3 CROSS-TENANT, INBOUND, and CONFIG

| Secret | Read at | Containment | Class and note |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `src/lib/supabase/server.ts:129` (`createServiceClient()`); guarded existence check at `src/lib/research/db.ts:60` | **NONE at the secret.** The client bypasses RLS by design (`server.ts:123-124`). Containment is the QUERY PREDICATE, per call | CROSS-TENANT. Referenced from 54 production files / 206 non-comment lines. The predicate idiom is real: `src/lib/lms-credentials.ts:215` filters `.eq("user_id", userId)`. A full per-call audit of those 206 lines is NOT something I did - RES-2 |
| `GOOGLE_TOKEN_ENC_KEY`, `..._PREVIOUS` | `src/lib/crypto.ts:94`, `:112` | **Partial, by AAD.** `decryptSecret` mixes an `aad` into GCM's auth tag (`crypto.ts:126-129`), and `lms-credentials.ts:229` passes `rowAad(userId, normalized)`, so a row decrypts only under the identity it was written for | CROSS-TENANT. The AAD comes from the caller's argument, so the containment is only as good as the identity the caller supplies - which on the Canvas path is `getEffectiveIdentity()`, not a parameter |
| `GOOGLE_OAUTH_CLIENT_SECRET`, `MS_OAUTH_CLIENT_SECRET` | `src/lib/google-oauth.ts:35`, `src/lib/microsoft-oauth.ts:39` | **NONE at the secret.** Reachability is narrow: each module is imported by exactly 3 production files, all of them the OAuth start/callback routes plus the per-user credential module | CROSS-TENANT if leaked, but these are the APP's identity in a per-user token exchange, not the owner's data. Not owner-private |
| `CRON_SECRET` | `src/app/api/cron/run-schedules/route.ts:112`, `sweep-orphan-uploads/route.ts:76` | Compared against an inbound `Authorization` header (`run-schedules/route.ts:117-119`) | INBOUND. Never spent outward. Its own comment at `:107-111` calls it "the entire trust boundary for runAsOwner" |
| `GITHUB_WEBHOOK_SECRET` | `src/lib/github.ts:20` (`githubWebhookSecret()`) | Read by two callers: the verifier (`src/app/api/github/webhook/route.ts:54`) and `registerOrgPushWebhookAction` (`src/app/actions/github.ts:541`), which is already `requireAppOwner()` at `:535` and never returns the secret (`:526`) | INBOUND. Correct as it stands |
| `OWNER_EMAILS` | `src/lib/owner.ts:9`, `src/lib/supabase/app-users.ts:454`, `:612`, `:807` | It IS the allowlist; not a resource anything reaches | CONFIG. `isOwnerEmail` alone is never ownership - `resolveAccess` also requires `emailVerified` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `src/lib/supabase/server.ts:95`, `:96` | Public by construction | CONFIG. Not a secret in any sense |

### 4.4 The 35 tunables, listed so the bucket is auditable

`CLASS_TRENDS_DRAFT_FLOOR`, `COURSE_ENGINE_URL`, `GEMINI_ALLOW_LOW_TEMPERATURE`,
`GEMINI_IMAGE_MODEL`, `GEMINI_MAX_OUTPUT_TOKENS`, `GEMINI_MIN_OUTPUT_TOKENS`,
`GEMINI_MODEL`, `GEMINI_SEARCH_MODEL`, `GEMINI_THINKING_LEVEL`,
`GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_REDIRECT_URI`,
`GRADE_INTER_REQUEST_DELAY_MS`, `GRADE_MAX_CHARS_PER_SUBMISSION`,
`GRADE_MAX_SUBMISSIONS`, `GRADING_ENGINE_URL`, `KNOWLEDGE_GAP_THRESHOLD`,
`MS_OAUTH_CLIENT_ID`, `MS_OAUTH_REDIRECT_URI`, `MS_OAUTH_TENANT`,
`NEXT_PUBLIC_CLASS_TRENDS_DRAFT_FLOOR`, `NEXT_PUBLIC_DOC_AUTHOR`,
`NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_SRC`, `NODE_ENV`,
`SCHEDULING_BUFFER_MINUTES`, `SCHEDULING_LOOKAHEAD_DAYS`,
`SCHEDULING_MAX_SLOTS`, `SCHEDULING_SLOT_MINUTES`, `SCHEDULING_TIMEZONE`,
`SCHEDULING_WORK_END`, `SCHEDULING_WORK_START`, `SIGNUP_ALLOWED_DOMAINS`,
`SIGNUP_EMAIL_REDIRECT_URL`, `SIGNUP_MODE`, `VERCEL_PROJECT_PRODUCTION_URL`,
`WEBHOOK_BASE_URL`.

Those 35 names ARE the computed remainder, pasted from the set-difference output
rather than retyped. Two of them - `COURSE_ENGINE_URL` and `GRADING_ENGINE_URL` -
are mentioned in 4.2 as the URL half of a credential pair; they are counted here,
not there, because a service URL on its own confers nothing. `GEMINI_MODEL` and
its eight siblings are model-selection knobs, not keys. `GOOGLE_OAUTH_CLIENT_ID`
and `MS_OAUTH_CLIENT_ID` are the public halves of the OAuth pairs whose secret
halves are in 4.3.

**Section 4's floor is the 59 dotted names plus the bracket family, and nothing
else.** A secret reached without any `src/` file naming it is invisible to this
census - section 11 says so.

---

## 5. The decision procedure

Apply in this order. Stop at the first step that fires.

**Step 0 - is a site's disposition already decided?** If the action appears in
`OWNER_ONLY` (19 keys), `MEDIA_OWNER_ONLY_ACTIONS` (14),
`GITHUB_NOT_OWNER_ONLY` (30, declared at
`src/app/actions/action-guard-coverage-github-cohort.test.ts:345`, same
brace-match parse) or `REVIEWED_PERMISSIVE` (24, across 11 files), the
disposition is pinned and re-deriving it is how a shipped classification gets
silently reversed. Read the entry's stated reason; do not re-litigate it. That
30 is the figure sub-wave 7's own commit message reports bumping from 14, which
is the cross-check that the parse is reading the live list.

**Step 1 - trace the reach, per ACTION, not per file.** RULING 84: a file-level
module closure is a candidate set, never a classification, because ES modules
evaluate eagerly, so a file's import graph *holding* the spending code never
proves the exported action *calls* it. And per
`docs/loop/traps-spec.md:131-148`, an absence claim may not rest on where a
graph walk's trail begins: the walker in
`src/lib/module-graph/runtime-import-graph.ts` shares one `visited` set across
the walk, so a valid proof is ONE WALK PER DIRECT EDGE, rooted at each import in
turn, with a violation count for each.

**Step 2 - range over EVERY owner-private target, and say which you forbade.**
RULING 90. Section 8 fixes the target set this step ranges over: it is section
4.1's SIX rows, in FOUR families (GitHub PAT, Canvas env pair, the HeyGen/Tavus
likeness, the ElevenLabs voice id), not the two modules `docs/r4-scope.md:109`
walked. A walk against a subset is a partial result and must be labelled one.

**Step 3 - if the action reaches an owner-private target on a verified path, is
the reach already contained AT THE SECRET?** Contained means the read site itself
consults the CALLING identity and refuses a non-owner. The one worked instance is
`resolveCanvasCredential` (`src/lib/canvas-credentials.ts:189`), whose env
fallback is gated at `:220` on `identity.role === "owner"` with `identity` from
`getEffectiveIdentity()` at `:191`. If contained -> **`requireUser()`**. If not
-> **`requireAppOwner()`**.

**Step 4 - if the action reaches no owner-private target, it is
`requireUser()`.** Shared model, TTS, grading-service or course-engine spend does
not make a site owner-only; `action-guard-coverage.test.ts:313-316` is 27 shipped
call sites saying so. Reads scoped to the caller's own `user_id` do not either
(`docs/r2-scope.md:428`).

**Step 5 - the third disposition, which is neither guard.** Some sites keep
`requireUser()` AND carry an in-body `identity.role === "owner"` branch, so the
capability stays reachable by members while the owner-private half stays closed.
`src/app/actions/course-hub-integrations.ts:154` states the rule in its own
words: **"Fixed in the BODY, not the guard"**, and `:159-160` says only an
identity whose role is literally "owner" ever sees the env-derived status. Both
`checkInstitutionsAction` (guard at `:169`) and
`listConfiguredInstitutionsAction` (guard at `:212`) are still on the
deprecated alias today and are already body-contained.
**A sub-wave converting either one converts to `requireUser()` and must not
touch the body.** `:153-157` says why in production source: swapping the guard
to `getEffectiveIdentity()` to simplify it would stop enforcing BLOCK2 for that
action specifically.

### 5.1 The pass conditions, each naming its object, instrument and direction

**PC1 - a restrictive conversion.** Object: the specific action export.
Instrument: an executing per-action test that mocks `@/lib/supabase/auth`'s
client with the fake in `src/lib/supabase/auth.test.ts` configured as an
`active` non-owner, and calls the real export - the idiom
`src/app/actions/grading.guard.test.ts:294-311` uses. Direction: FAILS if the
action RESOLVES (or returns a non-error object) for that session. Never a
source-text grep for the guard name - `docs/r2-scope.md:450-462` retracts the
claim that the source-text check executes anything.

**PC2 - a permissive conversion (the over-tightening direction).** Object: the
specific action export. Instrument: the same executing fake, same session.
Direction: FAILS if the action REJECTS. The reason this direction needs its own
instrument is in `src/app/actions/guard-overtightening.test.ts:22-25`:
over-tightening moves TOWARD what the under-tightening ratchet wants, so that
ratchet will never complain.

**PC3 - the non-vacuity check that must accompany PC2.** Object: the very same
mocked session PC2's permissive assertions accept. Instrument: `requireAppOwner()`
called directly on it. Direction: FAILS if that call RESOLVES. Without PC3 a
mis-built fake makes every permissive assertion pass for the wrong reason;
`grading.guard.test.ts:410` is the shipped instance of exactly this assertion.

### 5.2 Why this document recommends NO new instrument

`docs/overtightening-instrument.md` (36214 bytes, `ls -la`) already owns the
over-tightening direction, carries a sabotage log with verbatim red at its
sections 5.1-5.4, and - section 6 - names two attacks that pass and stay green.
`src/app/actions/guard-overtightening.test.ts` is 689 lines (`wc -l`) and its own
header at `:1-70` enumerates what it cannot see.

I am not proposing a new guard, and the reason is a rule rather than a
preference: my write set for this pass is this one file, so I cannot mutate
`src/` to show a proposed instrument turning red, and
`docs/loop/traps-spec.md` is explicit that four instruments in this repo claimed
more than they measured and every one was caught by RUNNING it. An instrument I
could not run is an instrument I may not recommend. The coverage gaps I found are
RES-3 and RES-4 in section 10, each pointing at the step that can execute the
mutation.

---

## 6. The model key: resolved, and not by me

The brief framed this as possibly ambiguous - either the criterion is not
"uncontained shared secret", or `GEMINI_API_KEY` is a deliberate exception. **It
is the first, and the answer is not a reading of precedent: it is 27 shipped call
sites plus 28 deliberately unguarded actions.**

`GEMINI_API_KEY` is read flat at `src/lib/gemini.ts:89` with no containment.
`ELEVENLABS_API_KEY` is read flat at seven sites in `media-voice.ts` with no
containment. They are structurally identical. **`ELEVENLABS_API_KEY` is permissive
at all 10 guard calls in the file that reads it, and that split is pinned in both
directions** by `action-guard-coverage.test.ts:626-636`, which fails if an action
outside `MEDIA_OWNER_ONLY_ACTIONS` starts calling `requireAppOwner()` - the
over-tightening direction, already enforced, with `MEDIA_OWNER_ONLY_ACTIONS.length`
pinned to 14 at `:599` so a name cannot be moved into the owner-only set to
silence it.

So "uncontained env-direct secret" cannot be the criterion: adopting it would
require reversing 27 shipped, pinned classifications and fighting a green
ratchet to do it.

The repo goes further than permissive on shared model spend. `PINNED_UNGUARDED`
(`action-guard-coverage.test.ts:235-264`, 28 entries parsed) holds actions with
NO guard at all, and its own comment at `:230-233` says: "Every one of these is
reachable by any signed-in account and most spend the deployment's LLM budget."
Its assertion is `expect(unguarded).toEqual(PINNED_UNGUARDED)` (`:450`) - an
exact-set comparison, so it fails in both directions.

One entry in `OWNER_ONLY` looks like a counterexample and is the clearest
confirmation. `generateAvatarScriptAction` is owner-only and its stated reason
(`:339`) is "spending the shared LLM key **on the owner's likeness feature**
(AC5.3)". The LLM key is not the ground; membership in an owner-private feature
is. Read the other way round, that entry would make every model call owner-only,
which the same file's `PINNED_UNGUARDED` list contradicts on the next screen.

**The architecture doc says where shared-spend containment actually lives,** and
it is not the call site: `docs/multi-user-login-architecture.md:183-185` - "The
approval gate is the containment for shared spend in this pass" - with
`:426-431` recording per-user spend quotas as NOT RESOLVED, DEFERRED WITH A
REASON, because `SIGNUP_MODE` defaults to `approval` and nothing is approved by
default. `docs/r2-scope.md:97` restores that handover verbatim and says why it is
load-bearing: the Group-C rule is precisely what makes it so. **R2 must not be
read as closing it.** RES-5.

### 6.1 The sandbox: the same argument, applied to sub-wave 7's own finding

Sub-wave 7's commit message (`git log -1 --format=%B 37644e2`) says
`runSubmissionCodeAction` reaches "a THIRD owner-private secret" and that this is
"structurally identical to the GitHub PAT shape." **The outcome may well be
right. The stated ground is not, and the ground is what ~170 remaining sites get
classified against.**

Read from `src/lib/code-runner.ts:107-115`:

- `PISTON_API_URL` defaults to `https://emkc.org/api/v2/piston` - a public,
  free, third-party service.
- `PISTON_API_KEY` is documented at `:110-111` as an "Optional API key" and
  defaults to the empty string.
- `WANDBOX_API_URL` defaults to `https://wandbox.org/api` - likewise public.

There is no owner identity, no owner data and no owner repository behind any of
the three. Compare the GitHub PAT, which reaches the owner's own private
repositories. The sandbox is SHARED SPEND on the same axis as `GEMINI_API_KEY`
and `ELEVENLABS_API_KEY`, and "read straight from `process.env` with no
per-caller containment" is a description that fits all three equally.

**The cost of adopting sub-wave 7's ground as the general criterion,** stated so
the fork in section 7 has a price on both sides: it would make `GEMINI_API_KEY`,
`ELEVENLABS_API_KEY`, `COURSE_ENGINE_API_KEY`, `GRADING_API_KEY` and
`UNSPLASH_ACCESS_KEY` owner-private too, flipping a large share of the remaining
sites restrictive. `docs/multi-user-login-architecture.md:349-353` already
measured what that direction costs: 72 of 103 files transitively reach a shared
owner-funded secret, including the user's own course list, so "gating those to
the owner would leave an approved member with a login and a blank app."

**What IS different about the sandbox, and it is a different axis.** It executes
attacker-chosen code. A permissive site there confers arbitrary remote code
execution on a third party under the deployment's key, and if
`PISTON_API_URL` is ever pointed at a self-hosted instance the same site becomes
an SSRF and sandbox-escape surface against the owner's own infrastructure. That
is a capability-abuse concern, not an owner-private-resource concern, and the
criterion as written has no slot for it. Which is section 7.

---

## 7. The one fork that is genuinely the owner's

**Everything else in this document is derived from quoted code.** This is not,
and I am not inventing a rule for it.

**THE QUESTION.** The criterion as shipped has exactly one restrictive limb:
the site reaches a resource that is the OWNER'S OWN. The code sandbox reaches
nothing of the owner's, but a permissive site there hands any approved account
arbitrary code execution on a third-party service under the deployment's key.
Sub-wave 7 has already shipped `runSubmissionCodeAction` as `requireAppOwner()`,
with an executing test (`src/app/actions/grading.guard.test.ts:294`).

Which of these three does the criterion say, for the remaining eleven sub-waves:

**(A) One limb - owner-private only.** The sandbox is shared spend, so
`runSubmissionCodeAction` is reclassified to `requireUser()` in a named
follow-up. Section 4.2 keeps the sandbox where it is. Cost of being wrong: any
approved account can run arbitrary code through the deployment's sandbox
credentials, and if the URL is ever self-hosted that is a real SSRF and
sandbox-escape surface.

**(B) Two limbs - add "confers arbitrary code execution on a third-party service
through a shared credential".** Sub-wave 7 stands as shipped. The limb's
membership is exactly `code-runner.ts`, named as a closed set, so it cannot creep
into the model keys - which also process attacker-influenced text and must stay
permissive. Cost of being wrong: the limb's boundary is mine, not measured, and a
later wave could argue an LLM call is "execution" and sweep 27 shipped
classifications back the other way.

**(C) One limb plus a named exception, exactly as `MEDIA_OWNER_ONLY_ACTIONS`
records exceptions.** `runSubmissionCodeAction` stays `requireAppOwner()` as a
single listed entry with its reason, and NO general limb exists. Cost of being
wrong: a future sandbox-reaching action is not covered by the exception and
defaults permissive until someone lists it.

**MY RECOMMENDATION: (C).** It keeps sub-wave 7's shipped, tested outcome, it
does not require reversing a pushed commit, it does not invent a general limb
whose boundary I could not measure, and it matches the shape this repo already
uses for exactly this problem - a permissive default with enumerated restrictive
exceptions carrying one-line reasons, plus a converse test that fails if the
exception set grows silently (`action-guard-coverage.test.ts:626-636`). It is the
only one of the three that ships with an enforcement idiom already proven red in
this tree.

**Every answer terminates this activity.** A, B or C is applied to sections 4.2,
5 and 6.1 as transcription; nothing else in this document is reopened, because
nothing else in it depends on the answer - the model-key question (section 6) is
settled by shipped code under all three.

---

## 8. Disposition of the prior enumeration claims

There is no prior version of this file. There ARE three prior claims about the
owner-private SET, and a restructuring that left them unreconciled would be the
silent-drop failure `docs/DEV_LOOP.md` warns about.

| Prior claim | Where | Disposition |
|---|---|---|
| "The owner-private resource universe this document ranges over is exactly two" - `github.repos.ts` and `canvas-credentials.ts` | `docs/r4-scope.md:98-107` | **KEPT, SCOPED.** Correct for R4's own ten sites, and R4 labelled its target set explicitly, which is what RULING 90 demands. Not correct as the tree-wide universe |
| "No third owner-private singleton exists in this tree." | `docs/r4-scope.md:109` | **WITHDRAWN.** `src/lib/supabase/auth.ts:295` names three families in production source - "Canvas, GITHUB_TOKEN, the cloned voice/avatar" - and the third is reachable: `media-voice.ts:261`. The reasoning at `:109-113` exonerates `microsoft-credentials.ts` and `google-credentials.ts` and is sound for those two; it never considered the media likeness/voice family. Enforcer it protected: the two-target walks at `docs/r2-scope.md:225,246-247,359-374`. Those walks remain valid for the two targets they name and are now PARTIAL with respect to the media family - RES-4 |
| The plan's containment survey enumerates Canvas and GitHub only | `docs/r2-wave1-subwaves.md:148-246` (Rank 1 = the PAT module; Rank 2a = `@/lib/grade*` / `@/lib/canvas*` edges) | **KEPT AS AN ORDERING, NOT A SET.** That section says so itself at `:144-146`: "this section produces an ORDERING, not a disposition. Nothing below classifies a single site." It is not wrong; it was never the enumeration. Section 4 here is the enumeration it lacked |
| `runSubmissionCodeAction` reaches "a THIRD owner-private secret ... structurally identical to the GitHub PAT shape" | `git log -1 --format=%B 37644e2` | **GROUND WITHDRAWN, OUTCOME PENDING THE FORK.** Section 6.1 gives the reading from `code-runner.ts:107-115`. The shipped guard and its test are untouched by this document; section 7 is where the outcome is settled |
| Sub-wave 7's wider list: "Env-direct secrets in `src/lib` include COURSE_ENGINE_API_KEY, GRADING_API_KEY, SUPABASE_SERVICE_ROLE_KEY, the Google and Microsoft OAuth client secrets, the token-encryption keys, and the owner's Canvas fallback tokens - none of which the survey classified" | same commit message | **ADOPTED AND CLASSIFIED.** All seven appear in section 4.2 or 4.3 with a read site and a containment finding. One of the seven - the Canvas fallback tokens - turns out to be the tree's best-contained secret, not an unclassified hazard |

---

## 9. When a sub-wave meets a secret this document does not cover

Section 4 is a floor over `src/`, so this will happen again; sub-wave 7 is the
proof that it does.

1. **Do not classify the site on the new secret's authority.** Run steps 1-5 of
   section 5 against the FOUR owner-private families in 4.1 and dispose the site
   on those. A newly-found secret does not retroactively make a site restrictive
   unless it is owner-private under section 1's test.
2. **Apply section 1's test explicitly and write the answer down:** is there an
   owner identity, owner repository, owner gradebook, owner face or owner voice
   behind this credential - or is it metered spend on a service that holds
   nothing of the owner's? Name the file and line that settles it. `code-runner.ts:110-111`
   is the worked example: the comment saying the key is optional and the URL
   default pointing at a public host are what settle it, not the variable's name.
3. **If it IS owner-private, that is a section-8-class amendment, not a sub-wave
   decision.** It changes the target set every later walk ranges over, which
   retroactively makes earlier walks partial. Say so in the sub-wave's report,
   name the walks it makes partial, and escalate - do not widen the criterion
   inside the sub-wave that found it.
4. **If it is shared spend, the site is permissive and the finding still gets
   recorded** - the per-user spend quota obligation (RES-5) is the row it feeds,
   not the guard.
5. **Never quote this document's enumeration as complete.** Re-run I3.1's widened
   census, including the bracket form, and report what section 4 missed.
   `docs/loop/traps-spec.md:30-33`: the orchestrator's enumeration is a floor,
   never the set.

---

## 10. Residual register

Each entry names an owner, an instrument, and the step that will measure it. An
entry missing any of the three is a deletion, and I have called none of these
that.

| Id | What is not proven now | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| RES-1 | `ELEVENLABS_VOICE_ID` (`media-voice.ts:261`) is reachable by an active non-owner through two `requireUser()` actions, and the owner's cloned voice is named owner-private at `auth.ts:295`. Whether the owner's deployment actually sets that variable is unverifiable here - no `.env` exists in this checkout | repo owner decides the fix shape (gate the fallback on `identity.role === "owner"` like `canvas-credentials.ts:220`, or accept it); a follow-up wave implements | An executing test in the `grading.guard.test.ts` idiom: mock an `active` non-owner, call `synthesizeNarrationAction`, assert the resolved voice id is NOT the env value. FAILS if the env value is returned | A named follow-up wave on `media-voice.ts`, outside R2. This document's write set is one file and cannot touch `src/` |
| RES-2 | That all 206 non-comment `createServiceClient` references across 54 files scope their queries on the caller's own id. I verified the idiom at `lms-credentials.ts:215` and nothing more | repo owner to schedule | A per-call audit, or a source-shape test asserting every service-client query in a `"use server"` file carries an `.eq("user_id"` or an equivalent predicate | A dedicated cross-tenant pass. NOT an R2 sub-wave - R2 changes guards, not predicates |
| RES-3 | `REVIEWED_PERMISSIVE` (24 entries, 11 files) does not cover `grading.ts`. Sub-wave 7's 16 permissive actions are covered instead by `grading.guard.test.ts:316-397`, which is executing and stronger. Whether every LATER sub-wave's permissive sites get equivalent cover is not established by anything I ran | each remaining sub-wave | Its own `*.guard.test.ts` in the `grading.guard.test.ts` idiom, with PC3's non-vacuity assertion present | Each sub-wave's own gate. The check to make is that PC2 and PC3 both exist per converted file, not that a name was added to a list |
| RES-4 | The two-target walks at `docs/r2-scope.md:225,246-247,359-374` are PARTIAL with respect to the media likeness/voice family, per section 8. How many sites that changes is not measured here | repo owner to schedule | `walkRuntimeGraph`/`scanRuntimeEdges` (`src/lib/module-graph/runtime-import-graph.ts`), re-run per direct edge with `media-avatar.ts`, `media-likeness.ts` and `media-voice.ts` added to `forbiddenPathPrefixes`, with a non-zero canary per target | The next sub-wave that runs a closure walk. It must state which targets it forbade - RULING 90 |
| RES-5 | Per-user spend quotas on the shared LLM, TTS, grading-service and sandbox keys. None exists. This document's section 6 makes the obligation MORE load-bearing, not less | repo owner - it is a product decision about what an approved member may spend | None exists to build here; the exposure requires an approval, since `SIGNUP_MODE` defaults to `approval` | Explicitly NOT R2. `docs/multi-user-login-architecture.md:426-431` deferred it with a reason; `docs/r2-scope.md:97` restores the handover verbatim. R2 must not be read as closing it |
| RES-6 | Which of section 7's three answers the criterion carries | repo owner | The answer itself | Section 7. Applying it is transcription into sections 4.2, 5 and 6.1 |

---

## 11. What I could not determine

- **Whether `ELEVENLABS_VOICE_ID` is set in production.** There is no `.env` in
  this checkout (`docs/loop/this-repo.md:227-229`) and no API keys. RES-1's
  severity is therefore conditional and I am not resolving the condition.
- **Whether `PISTON_API_URL` is self-hosted in production.** The code default is
  public (`code-runner.ts:108`); what the deployment sets is an owner fact. This
  changes the weight of section 7's SSRF argument and nothing else.
- **Whether any secret is reached by a path no `src/` file names** - a build
  step, a Vercel-dashboard variable, or a library reading `process.env` itself.
  Section 4 is a floor over `src/` and I am not claiming otherwise.
- **What any of this looks like to a user.** No component is rendered by any
  test in this repo (`docs/loop/this-repo.md:112-118`), so every statement here
  about reachability is a source-READING claim about guards and call paths, not
  an observation of behaviour.
- **Whether `checkInstitutionsAction`'s and `listConfiguredInstitutionsAction`'s
  body containment survives their eventual conversion.** It does as the code
  stands; whether the sub-wave that converts them preserves it is that
  sub-wave's gate, and section 5 step 5 is the warning it needs to read.
- **One stale citation I did not fix, because it is outside my write set.**
  `docs/loop/seats.md:34-37` cites the docs-scanning root list in
  `src/lib/no-emojis.test.ts` at `:243`; the `roots = ["src", "docs"]` line is
  at `:254` (`grep -n 'roots = ' src/lib/no-emojis.test.ts`). The claim is true,
  the address has moved.

---

## 12. Every quantity, with the command that produced it

Run from the repo root at `37644e2`. `PF` abbreviates
`cat prod_files.txt | tr '\n' '\0' | xargs -0`, where `prod_files.txt` is the
1602-file production list built in section 3.

| Quantity | Command | Value |
|---|---|---|
| Brief's grep, reproduced | `grep -rhoE 'process\.env\.[A-Z0-9_]+' src/lib --include=*.ts \| sort -u \| wc -l` | 52 (the brief said ~53) |
| Production files scanned | `wc -l < prod_files.txt` | 1602 |
| Distinct dotted env names | `PF grep -hoE 'process\.env\.[A-Za-z0-9_]+' \| sed 's/process\.env\.//' \| sort -u \| wc -l` | 59 |
| Bracket-form env reads, non-comment | `PF grep -nE 'process\.env\[' \| grep -vE ':[0-9]+:\s*(//\|\*\|/\*)'` | 8 lines, 4 files |
| Destructured env reads | `PF grep -hnE '\}\s*=\s*process\.env'` | none, exit 1 |
| `requireOwner()` call sites remaining, non-comment, non-import | `PF grep -nE '\brequireOwner\s*\(' \| grep -vE ':[0-9]+:\s*(//\|\*\|/\*)' \| grep -vE 'from "@/lib/supabase/auth"\|from "\./auth"' \| wc -l` | 307 references in 73 files |
| Comment lines that filter removed, same scan | same, with `grep -cE ':[0-9]+:\s*(//\|\*\|/\*)'` | 78 |
| `await requireOwner()` exact call shape | `PF grep -cE 'await requireOwner\(\)'`, summed | 305 |
| `createServiceClient` references, non-comment | `PF grep -nE 'createServiceClient' \| grep -vE ':[0-9]+:\s*(//\|\*\|/\*)' \| wc -l`; files via `cut -d: -f1 \| sort -u \| wc -l` | 206 lines, 54 files |
| Comment lines removed, same scan | same with `grep -cE ':[0-9]+:\s*(//\|\*\|/\*)'` | 14 |
| `media.ts` permissive call sites | `grep -cE 'await requireUser\(\)' src/app/actions/media.ts` | 17 |
| `media-voice.ts` permissive call sites | `grep -cE 'await requireUser\(\)' src/app/actions/media-voice.ts` | 10 |
| `media-avatar.ts` restrictive, non-comment non-import | `grep -nE '\brequireAppOwner\s*\(' src/app/actions/media-avatar.ts \| grep -vE ':[0-9]+:\s*(//\|\*)' \| grep -vE 'supabase/auth' \| wc -l` | 3 |
| `media-likeness.ts` restrictive, same filter | same on `media-likeness.ts` | 12 |
| `unsplash.ts` guard calls | `grep -cE '\brequire(User\|AppOwner\|Owner)\s*\(' src/app/actions/unsplash.ts` | 0, exit 1 |
| `OWNER_ONLY` keys | Python brace-match parse of the declaration, top-level keys only | 19 |
| `MEDIA_OWNER_ONLY_ACTIONS` | same parse | 14 |
| `PINNED_UNGUARDED` | same parse | 28 |
| `REVIEWED_PERMISSIVE` | same parse anchored on `^const REVIEWED_PERMISSIVE` (`:159`-`:303`) | 24, across 11 files |
| `GITHUB_NOT_OWNER_ONLY` | same parse, `action-guard-coverage-github-cohort.test.ts:345` | 30 |
| Capability-bearing vs tunable partition | Python set difference: census file minus a literal of the 24 classified names | `classified: 24 \| not in census: []`, `remainder: 35`, 24 + 35 = 59 |
| `guard-overtightening.test.ts` size | `wc -l` | 689 |
| `docs/overtightening-instrument.md` size | `ls -la` | 36214 bytes |
| Tests run for this document | `npm run test:paths -- src/app/actions/action-guard-coverage.test.ts src/lib/supabase/auth.test.ts src/lib/no-emojis.test.ts` | 3 files / 71 tests passed, one `COVERED` line per argument |
| This file's size | `wc -l docs/owner-private-secrets.md` | 720 |
| This file's size, second instrument | `@(Get-Content docs/owner-private-secrets.md).Count` | 720 |

Two line-counting instruments are reported because they disagree by 15 to 138
on real files in this repo (`docs/loop/this-repo.md:5-12`). They agree here.

**Tree state.** `git status --short` at hand-off shows exactly one entry,
`?? docs/owner-private-secrets.md`. No file under `src/` or `supabase/` was
modified by this pass; every measurement above is a read.
