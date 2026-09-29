# PRES-1 security / privacy pass

Area: presentations-authoring. Kind: feature (security/privacy wave, wave 2).
Source row: `docs/backlog.yml:1075` (`- id: 'PRES-1'`, confirmed this pass by
`grep -n "id: 'PRES-1'" docs/backlog.yml` -> `1075:- id: 'PRES-1'`), title
quoted at `docs/backlog.yml:1079`. Seat: `loop-seat` (security). This is round
1 of the security activity; a fresh `loop-checker` reads this before any
implementer consumes it.

Consumed: `docs/pres-1-acceptance-criteria.md` in full, including the two
owner-resolved forks (R-1 deck format = .pptx + on-page preview as a distinct
build item; R-2 new sibling tab reusing infra) and the residual register
(R-1..R-6). Every code citation below was opened THIS pass; none is inherited
from the AC document without being re-checked against the tree, per
`docs/loop/seats.md`'s "brief from the tree, not from the doc" rule.

There is no prior `docs/pres-1-security.md` (`ls docs | grep -i pres-1` this
pass returns only `pres-1-acceptance-criteria.md` and this new file), so **no
disposition table applies** - nothing here restructures a prior security
artifact.

## 0. What this pass does and does not cover

The AC document already routes "mechanism (how the tab is wired, the
generation pipeline shape)" to the architect and "oracle, fixtures, sabotage"
to the test seat (`docs/pres-1-acceptance-criteria.md:333-339`). This pass
threat-models the REAL code the feature will sit on top of - the intake
actions, `callLlm`, the download/persistence idioms, the auth gate pattern,
and the one genuinely new surface (an on-page `.pptx` preview) - and states
constraints those seats must satisfy, not the mechanism itself. Every finding
either has a code citation opened this pass, or is stated as unverifiable in
this environment (section 8) rather than guessed.

## 1. The real data flow, traced through code

**Intake -> client storage (today, for the sibling `ppt-design` tab whose
idioms PRES-1 reuses per R-2).** The pasted/typed context is held in two
`useLocalStorageState("ta-ppt-source-*", ...)` keys
(`src/app/components/ppt-design/hooks.ts:118` -
`useLocalStorageState<DeckSourceReceipt | null>("ta-ppt-source-receipt", null)`;
`:122` - `useLocalStorageState<string>("ta-ppt-source-materials", "")`).
`useLocalStorageState` itself (`hooks.ts:15-35`) reads/writes the browser's
own `localStorage` only - `typeof window === "undefined"` short-circuits
server-side, and the write is a plain `localStorage.setItem` in a `useEffect`
(`:28-32`). **This never leaves the instructor's own browser by itself** - it
is not synced to any server, not visible to any other account, and not
included in any request unless the code that reads the hook's value later
passes it to a server action. PRES-1's AC-8 requires the same idiom for its
own new intake/selection state (`docs/pres-1-acceptance-criteria.md:245-260`).

**File upload -> server extraction, requireUser-gated.**
`extractDeckSourceFileAction` (`src/app/actions/deck-source.ts:34-60`) is the
existing reuse target named in the AC's reuse notes
(`:139,297`). It calls `requireUser()` at `:38` before touching the upload,
checks the WIRE size via `checkWireBudget` (`:42`, `src/lib/upload-budget.ts`
- budgets base64-on-the-wire bytes, not file-on-disk bytes, per that module's
own header, `upload-budget.ts:12-16`), then runs `extractTextFromBuffer`
(`src/lib/office-extract.ts:1-2` imports only `jszip` and `officeparser` -
both local parsers; no `fetch`/network import in that file, confirmed by
`grep -n "^import\|fetch(" src/lib/office-extract.ts`), and finally calls
`normalizeDeckSource` (`src/lib/decks/deck-source.ts:44-62`), which truncates
the extracted text to `DECK_SOURCE_MAX_CHARS = 20000` (`:19`). **No network
egress exists on the file-extraction path itself** - it is local parsing only.
The sibling repo-reference action, `extractDeckSourceRepoAction`
(`src/app/actions/deck-source.ts:63-77`), calls `requireAppOwner()` instead
(`:64`) because it
reaches the deployment's single shared `GITHUB_TOKEN`
(`src/app/actions/deck-source.ts:21-26`'s
own comment states why) - this is the correct precedent if PRES-1 ever adds a
repo-reference intake option; a plain file/paste intake should follow
`extractDeckSourceFileAction`'s `requireUser()` pattern, not
`requireAppOwner()`, since it reaches no owner-private secret.

**Materials -> the model prompt.** `normalizeDeckSource`'s `materials` string
feeds `DeckGenContext.materials` (`src/lib/decks/generate.ts:24`).
`buildDeckPrompt` (`generate.ts:66-129`) is the prompt builder actually on the
path - opened in full this pass - and interpolates it directly at `:114`:
`` ...${ctx.materials ? `SOURCE MATERIALS:\n${ctx.materials}\n` : ""}... ``.
There is no system/user role separation for this content: the whole prompt,
materials included, is sent as a single `{ role: "user", parts: [{ text:
prompt }] }` content block (`generate.ts:400-406`) to `callLlm`
(`src/lib/llm.ts:375`), which for every provider value except an unmatched
`"other"` routes to `callGemini` (`llm.ts:375-386`, `void provider;` at
`:384`). The
text-generation transport is `postGenerateContent`
(`llm.ts:454-472`), whose one `fetch` call (`:472`) posts to
`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
(`:459`). This is the ONLY network egress on the generation path - confirmed
by reading `office-extract.ts` (none), `deck-source.ts` (none beyond the
already-gated GitHub path), `generate.ts` (none), and `llm.ts` itself (the
only other `fetch` in that file, `:635`, is `postInteraction` for
IMAGE generation via a separate `interactions` endpoint - not used by deck/
outline/activity/critique TEXT generation, and out of scope unless a later
wave adds AI-generated slide imagery, which the AC does not ask for).

**Reconciling with the owner's framing (point 1 of this brief).** The
"pasted context" the owner describes - "homework, chapter objectives, lesson
plan copied from the LMS" - is INSTRUCTOR-classified content, not a student
roster or a graded submission. Nothing in the intake path (file upload,
paste, or the deck-source normalizer) inspects or scrubs its content for
names or identifiers before it reaches `callLlm` - there is no PII filter
here, by design, matching how the OTHER LLM paths in this repo treat
instructor-authored text (e.g. `buildDeckPrompt` at `generate.ts:114` is the
same pattern as `renderSubmission`'s free-text pass-through in
`class-trends-insight.ts`, save that THAT surface's inputs are graded
STUDENT work, which is why `docs/n13b-security.md` exists as a dedicated
privacy pass for it - a fundamentally different risk class from an
instructor typing/pasting their OWN lesson materials). **Recommendation:**
because "homework" can mean either an assignment PROMPT (safe - the
instructor's own authored text) or a copied assignment SUBMISSION (which
could carry a student's name in a header or file name), the intake surface's
copy should say plainly what belongs here - "paste the assignment prompt,
objectives, or lesson plan, not a student's submitted work" - which is a UX
wording call (out of this seat's lane) but is filed as Residual R-SEC-5 so it
is not lost. This is a recommendation, not a blocker: the owner's own words
scope the feature to instructor-authored planning material, and nothing in
the code path stores or serves this content beyond what section 5 below
describes.

## 2. Auth: is every server action gated, and is there an unauthenticated path?

**The gate functions, read in full.** `requireUser()`
(`src/lib/supabase/auth.ts:328-365`) authorizes any `active` or `owner`
account. `requireAppOwner()` (`:408-434`) authorizes `owner` only.
`requireOwner()` (`:451-453`) is a **deprecated alias that is a bare
`return requireUser()`** - despite its name it does NOT check ownership,
confirmed by reading its three-line body. Existing call sites already
distinguish correctly on this exact feature area:
`extractDeckSourceFileAction` uses `requireUser()`
(`src/app/actions/deck-source.ts:38`, its
own header comment at `:16-19` explicitly warns against the `requireOwner()`
alias for exactly this reason); `generateDeckFromTemplateAction`
(`src/app/actions/media.ts:567-580`) calls `requireUser()` at `:573`;
`savePresentationFileAction` (`media.ts:590-638`) calls `requireUser()` at
`:600`. **PRES-1's new actions (generate-outline/activities/deck/review,
regenerate, and any save-to-files action) should follow this same
`requireUser()` precedent** - none of them reach an owner-private shared
secret (the deployment's single `GEMINI_API_KEY`, read server-side only via
`getGeminiApiKey()`, `src/lib/gemini.ts:88-92`, is not owner-scoped the way
the shared `GITHUB_TOKEN` is) - so `requireAppOwner()` would be an
unnecessary (though not unsafe) narrowing, and the bare `requireOwner()`
alias should not be used at all on a new call site, per its own deprecation
comment (`auth.ts:436-449`, the `@deprecated` block immediately above the
function body at `:451-453`).

**Is there an existing instrument that actually enforces this, or only a
convention?** Yes - `src/app/actions/action-guard-coverage.test.ts` is a
MACHINE-CHECKABLE ratchet that requires no new authoring to cover PRES-1's
new actions. It walks every `"use server"` module anywhere under `src/app`
(`collectActionExports`, `:118-143`) and: (1) hard-asserts, with no
allowlist, that nothing reachable from the root layout is unguarded (per its
own header comment, `:15-48` (the root-layout claim at `:37-39`, the
ratchet description at `:41-47`), citing the `selectionChatAction` incident this
test exists to prevent); (2) ratchets an allowlist of today's already-known
unguarded actions that "may only shrink" (`:41-47`). **A brand-new PRES-1
action that calls `requireUser()` needs no new test written for this
property - it is swept into this suite automatically the moment the file
exists under `src/app` with a `"use server"` directive.** Confirmed this pass
by reading the guard regex itself: `GUARD_CALL =
/\brequire(Owner|User|AppOwner)\s*\(/` (`:61`), tested against the function's
own textual body.

**The one shape constraint the ratchet cannot see (must be stated to the
implementer, not merely trusted).** `collectActionExports`'s own collector
regex is `/^export async function (\w+)/` (`:127`, column-zero anchored,
confirmed by opening the function in full). **An action written as an arrow
function - `export const generateOutlineAction = async (...) => {...}` -
is invisible to this collector entirely: it is not counted, not checked for
a guard call, and not caught by either the hard root-layout assertion or the
ratchet.** This is a real, load-bearing constraint, not a hypothetical: every
existing action this pass opened on the deck/media path
(`extractDeckSourceFileAction`, `generateDeckFromTemplateAction`,
`savePresentationFileAction`) is written as `export async function NAME(...)`
- the house convention already matches what the collector requires, but
nothing STOPS a new file from being written the other way and shipping a
completely unguarded, unaudited POST endpoint. **This is Finding SEC-1
(below) and Residual R-SEC-3.**

**Is there any unauthenticated path today, before PRES-1 exists?** No path
this pass opened bypasses `requireUser()`/`requireAppOwner()` on the deck
generation/save/intake surface. `action-guard-coverage.test.ts`'s own
root-layout check (`:37-39`) is the standing, executed proof that nothing
reachable from an anonymous visit is unguarded, and it runs today as part of
`npm test` - re-running it is not this pass's job (it is not yet exercising
files that do not exist), but its EXISTENCE is the instrument PRES-1's build
wave gate should point to rather than inventing a bespoke auth test.

## 3. In-house-only: does AC-3's egress test actually close the door?

**The standing rule and its existing enforcement pattern.** `AGENTS.md`'s
`in-house-ai-only.md` memory: generation stays inside the app via provider
APIs, the instructor is never routed to an external tool's UI. The closest
existing enforcer of a SIMILAR shape in this repo is
`src/app/components/drafted-grades/classTrendsDraft.not-postable.test.ts`
(found this pass at that path - not the `repo-grades` directory the seats.md
card cites at `:50`, which is stale; re-derived by `find src -iname
"*not-postable*"`, one hit). That test walks value imports from a layer's own
root files and fails if ANY of them reaches `lib/llm`/`lib/gemini` (the
OPPOSITE direction from what PRES-1 needs: that layer must NEVER call a
model; PRES-1's generation action MUST call `callLlm` and must NOT reach any
OTHER network-capable path). **No existing test in this repo enforces the
PRES-1 shape (must route through `callLlm`, must add no other egress) because
no feature has needed it yet** - AC-3's own instrument
(`docs/pres-1-acceptance-criteria.md:141-149`) correctly identifies this as
new: "an import/source-text test that the Presentations action or route
imports only the in-house generation path... and introduces no egress to a
non-in-house generation endpoint."

**Confirmed this pass: today, the ENTIRE generation path has exactly one
egress point.** Section 1 above traced it in full - `postGenerateContent`'s
`fetch` at `llm.ts:472`, to `generativelanguage.googleapis.com`. Nothing in
`office-extract.ts`, `deck-source.ts`, or `generate.ts` performs its own
`fetch`, opens a socket, or imports an HTTP client. **The concrete, checkable
instrument the test seat should build for AC-3, adapted from the
`not-postable` pattern above but inverted:** walk the new Presentations
action/route files' value imports and assert (a) `lib/llm` IS reached
(generation actually happens), and (b) no file on that walk contains a
`fetch(`, `XMLHttpRequest`, `axios`, or a literal `http://`/`https://` string
whose host is not `generativelanguage.googleapis.com` (already true of every
file this pass opened) or the app's own Supabase project (for the
download/save path, section 5). This is a source-text/import-graph test,
buildable today, with no live key required.

**Where an external egress could sneak in despite that test - the one
genuinely new surface.** AC-6's owner-resolved fork (R-1,
`docs/pres-1-acceptance-criteria.md:223-226,319`) requires an ON-PAGE
`.pptx` PREVIEW that does not exist anywhere in this repo today - confirmed
by `grep -rn "iframe\|view.officeapps\|docs.google.com/viewer\|office.com"
src/app/components/ppt-design/*.tsx src/lib/decks/*.ts src/lib/pptx.ts`,
zero hits. A `.pptx` file cannot render itself inline in a browser tab, and
the two fastest ways to make one "visible" without writing a renderer are
both EXTERNAL: embedding an Office/Google document-viewer iframe (which
would upload the generated deck's bytes - including whatever the instructor
pasted - to a third-party host), or calling a third-party pptx-to-image
conversion API. **Either choice is a new, unaudited egress path that AC-3's
own instrument (scoped to "generation") would NOT catch**, because
rendering a preview is not generation - it is a second, easily-missed
capability. This is Finding SEC-2 (below), the single most important new
attack surface this feature opens, and it has a low-cost fix already
sitting in this codebase (section 6).

## 4. Prompt injection and the adversarial-review/regenerate loop

**Baseline risk is low, matching the AC's own framing.** The pasted context
is the instructor's OWN authored planning material, not third-party or
student-authored text reaching a shared surface - the class of prompt
injection this repo's other security passes worry about (e.g.
`docs/n13b-security.md` section 2, L5/L6: a STUDENT's free text riding into
a CLASS-addressed output) does not apply here, because the only audience for
PRES-1's output is the same instructor who supplied the input. There is no
cross-user blast radius: a hostile paste can only manipulate what that
instructor sees back, in their own session.

**Does the regenerate/review loop compound anything?** The leverage claim
itself (`docs/pres-1-acceptance-criteria.md:46-61`) is that regenerate folds
the PRIOR pasted context AND the prior adversarial critique into the next
request "by code, not by the human re-pasting." That fold-in mechanism is
explicitly the architect's to design (out of scope for AC, per
`docs/pres-1-acceptance-criteria.md:335`, "the generation pipeline shape" and
"regenerate payload assembly" routed there) - but ONE property of it is a
concrete, checkable constraint this pass can state: **`normalizeDeckSource`
already bounds the INITIAL materials to `DECK_SOURCE_MAX_CHARS = 20000`
characters (`src/lib/decks/deck-source.ts:19`), but nothing in the codebase today bounds a
FOLDED payload (prior context + prior critique, repeated across N regenerate
cycles).** If the fold-in concatenates rather than replaces on each
regenerate, and the instructor regenerates repeatedly (the intended flow
explicitly describes at least two regenerate cycles - outline, then deck),
the prompt sent to Gemini grows each round with no stated ceiling, which is
a cost/reliability property more than a security one, but it is ALSO a
"compounding" property this brief was asked to note: an unbounded fold could
eventually crowd out the ACTUAL new instruction the model needs to act on
(the same crowding risk `DECK_SOURCE_MAX_CHARS`'s own comment names for the
single-shot case, `src/lib/decks/deck-source.ts:16-19`), which would make the adversarial
loop degrade rather than sharpen with reuse. **Recommendation (not a
blocker): the architect's fold-in should apply an analogous character
budget to the folded prior-context-plus-critique payload, sized against the
same generation-config token ceiling `generate.ts` already uses
(`maxOutputTokens: 12288`, `:403`), not left unbounded.** Filed as Residual
R-SEC-2.

**Does the review pass itself introduce a new injection surface?** No new
one beyond what section 1 already covers: the adversarial-review artifact
(AC-5) is generated by the SAME `callLlm` path over the SAME already-pasted
materials plus the already-produced content artifact - no new input source,
no new egress, no new trust boundary. The output is more model-authored
prose that section 6 below (rendering) already covers for XSS.

## 5. The download and any server-persisted deck: access control

**Client-only download (the default, per R-1).** The existing download
idiom this AC's reuse notes point to,
`handleDownloadPptx` (`src/app/components/ppt-design/index.tsx:548-561`),
builds the `.pptx` bytes via `buildSlidesPptx`
(`src/lib/pptx.ts`, which imports only `pptxgenjs` - confirmed by `grep -n
"^import\|fetch(\|https://" src/lib/pptx.ts`, no network import) and calls
`URL.createObjectURL(blob)` (`:554`) purely client-side - the bytes never
touch a server round-trip for this path, and nothing persists. **If PRES-1's
download is this idiom alone, there is no access-control question at all: a
blob URL is scoped to the tab that created it and is never durable.**

**If a deck is also persisted to Files (an existing, separate idiom the AC's
reuse notes also name, `savePresentationFileAction`, `media.ts:590-638`) -
who can reach it?** Traced in full this pass:

1. `savePresentationFileAction` calls `requireUser()` (`:600`) and then
   `createServiceClient()` (`:601`) - the SERVICE-ROLE Supabase client
   (`src/lib/supabase/server.ts:126-141`, uses
   `SUPABASE_SERVICE_ROLE_KEY`). **The service-role key bypasses Postgres
   row-level security entirely by design** - this is the operative fact for
   everything below.
2. It inserts via `saveRecordingFile` (`src/lib/recording-files.ts:68-...`),
   which writes an EXPLICIT `user_id: userId` field (`:98`) - the just-
   authenticated user's own id, not a client-supplied value.
3. Every READ path this pass opened filters explicitly by that same
   `user_id`, in application code, NOT via RLS (RLS cannot apply - see point
   1): `listRecordingFiles` (`recording-files.ts:123-130`, `.eq("user_id",
   userId)` at `:130`); `getRecordingFileById`
   (`:173-191`) - its own doc comment states it is "scoped to its owner...
   so a missing/foreign id can never leak another user's file" and its query
   chains `.eq("user_id", userId)` (`:181`) before `.eq("id", id)` (`:182`).
4. RLS policies DO exist on `recording_files`
   (`supabase/migrations/20260718000000_create_recording_files.sql:24-42`,
   all four verbs gated `using (auth.uid() = user_id)`) - these are real,
   correct, defense-in-depth, but they protect only a hypothetical CLIENT-
   side read using the anon/authenticated Postgres role. **They are not what
   is actually protecting `savePresentationFileAction`'s own reads today** -
   the service-role client bypasses them, so the explicit `user_id` filter in
   `recording-files.ts` is the REAL control. This distinction matters for
   PRES-1: if a future wave adds a NEW read of `recording_files` (or a new
   table) through `createServiceClient()` and forgets the explicit
   `user_id` filter, RLS will not catch the omission, because service-role
   traffic never evaluates RLS at all.
5. Net finding: **a persisted PRES-1 deck, if wired through the existing
   `savePresentationFileAction`/`getRecordingFileById` idiom exactly as it
   stands today, is access-controlled to the account that created it** -
   another instructor account cannot list or fetch it, because every read
   this pass found filters by the authenticated caller's own `user_id`
   before touching the row. This is Residual R-SEC-4's positive baseline;
   the residual is only about WHETHER the architect in fact reuses this
   exact idiom rather than inventing a new read path that skips the filter.

**Is this an "owner-only app" where isolation does not matter?** No -
confirmed this pass by reading `docs/multi-user-login-architecture.md:34-81`:
access roles are `owner`/`member` (formerly `active`/`instructor`), i.e. more
than one human account can exist and be `active` simultaneously
(`requireUser()`'s whole reason to exist, `auth.ts:328-365`, is "any active
account," not "the one owner"). So the per-user isolation traced above is a
real requirement, not a formality.

## 6. Rendered model output: XSS, and the on-page preview's provenance question

**Rendering pattern already established in this repo for model-authored
prose.** Two hardened-vs-not renderers exist: `markdownToHtml`
(`src/lib/markdown.ts:199-...`) and `markdownLiteToHtml`
(`src/lib/markdown-lite.ts:40-...`). Both were opened in full this pass and
BOTH escape HTML-significant characters before interpolation
(`markdown.ts`'s `escapeHtml`, defined at `:28-29` - the doc comment
immediately above it, `:18-27`, records a previously-shipped
attribute-injection hole in exactly this function ("a Markdown link target
like `[click](\" onfocus=\"alert(1)  x)` break out of the `href=\"...\"`
attribute"), now fixed and covered by `src/lib/markdown.test.ts`;
`markdown-lite.ts`'s own `escapeHtml`, `:9-15`, applied to both link text and
link target at `:33-35`). **Neither renderer is presently imported anywhere
under `src/app/components/ppt-design`** (confirmed: that directory does not
appear in `grep -rln "dangerouslySetInnerHTML" src/app/components`'s
15-file result list) - the existing deck-editing UI renders slide
title/bullets as PLAIN REACT TEXT NODES (`GeneratePanel.tsx:374`
`{slide.title}`, `:384-386` `{slide.bullets.map(...)}`), which React escapes
by construction with no renderer needed at all.

**What PRES-1 must not do.** If the outline, activity ideas, or per-artifact
adversarial critiques (all model-authored prose, unlike the deck's
structured title/bullets) are rendered via `dangerouslySetInnerHTML`, that
call must go through `markdownToHtml` (preferred - it supports the
formatting model-authored prose commonly uses: headings, lists, emphasis,
code) and never interpolate raw model text into HTML directly. If instead
the new panels render this prose as plain JSX text (the same pattern
`GeneratePanel.tsx` already uses for slide content), no renderer is needed
and no XSS surface exists either way. **This is a real, previously-paid-for
lesson in this exact codebase** (the `markdown.ts` attribute-injection fix
cited above), stated so the architect does not have to relearn it.

**The on-page `.pptx` preview's own provenance question (ties back to
section 3, Finding SEC-2).** The safest, already-available way to build
AC-6's "visible" requirement without any new renderer or any external
viewer is to reuse the SAME structured `title`/`bullets`/theme data already
used to build the `.pptx` (via `buildSlidesPptx`) and already rendered
safely as plain text in `GeneratePanel.tsx:374-386` - i.e., a client-side
slide-shaped layout built from data the app already has and already renders
safely, not a rendering of the `.pptx` BINARY itself. This closes both the
XSS question (same plain-text-node pattern, zero new escaping surface) and
the egress question (section 3) in one recommendation, because it needs no
external viewer and no new HTML-injection point.

## 7. Does PRES-1 reintroduce a provenance problem the app closed elsewhere?

Checked directly against the two closed-provenance precedents this repo
already has: (a) the markdown/XSS hardening (`markdown.ts`, section 6
above) - PRES-1 does not need to touch that file and should reuse it or
avoid the need for it entirely, per section 6; (b) the not-postable/
in-house-only boundary (`classTrendsDraft.not-postable.test.ts`, section 3)
- PRES-1 is not layer C and is EXPECTED to call the model, so that specific
guard does not apply to it, but its INVERSE (AC-3's own egress instrument)
is the equivalent protection PRES-1 needs, and section 3 states exactly what
it must check. No other provenance-closing mechanism in this repo (the
`GEMINI_API_KEY` server-only read at `gemini.ts:88-92`; the wire-budget
check at `upload-budget.ts`) is bypassed or weakened by anything this pass
found in the reuse notes. **No regression found on this question**, subject
to Findings SEC-1 and SEC-2 being closed as stated.

## 8. Ranked findings

**SEC-1 (HIGH) - the auth-gate ratchet's own collector regex cannot see an
arrow-function server action; a new PRES-1 action written that way would
ship completely unguarded and undetected.**
- Attack: an implementer (or a mechanical sweep) writes a new Presentations
  action as `export const generateOutlineAction = async (...) => {...}`
  instead of `export async function generateOutlineAction(...)`.
  `collectActionExports`'s regex, `/^export async function (\w+)/`
  (`action-guard-coverage.test.ts:127`), never matches it, so it is absent
  from BOTH the hard root-layout check and the ratchet - it can call
  `callLlm` (spending the deployment's model budget) with zero
  authentication, and every gate in this repo stays green, because nothing
  ever looked at the file.
- Fix: no code fix needed today - this is a CONSTRAINT ON THE IMPLEMENTER
  BRIEF, not a defect in existing code. Every new PRES-1 "use server" export
  must be written as `export async function NAME(...)`, matching every
  existing precedent this pass opened (`deck-source.ts`, `media.ts`). The
  wave gate should explicitly re-run `action-guard-coverage.test.ts` (it is
  already part of `npm test`) and the implementer brief should quote this
  regex so the constraint is not tribal knowledge.
- Residual: R-SEC-3.

**SEC-2 (HIGH) - AC-6's on-page `.pptx` preview is a genuinely new surface
with no existing precedent in this repo, and the two fastest ways to build
it are both external, in-house-only violations.**
- Attack: the architect (or an implementer working ahead of the architect's
  design) reaches for an Office/Google document-viewer iframe or a
  third-party pptx-render/convert API to satisfy "visible" cheaply. That
  uploads the generated deck - and anything the instructor pasted that made
  it into slide text - to a third party, and it is a new egress AC-3's own
  instrument does not cover (section 3), because rendering is not
  generation.
- Fix: build the preview from the SAME structured slide data
  (`title`/`bullets`/theme) already used for `buildSlidesPptx` and already
  rendered as plain, safely-escaped React text in
  `GeneratePanel.tsx:374-386` - a local, in-house, already-proven pattern,
  not a `.pptx`-binary renderer and not an external viewer.
- Residual: R-SEC-1.

**SEC-3 (MEDIUM) - the regenerate/review fold-in has no stated size ceiling,
unlike the initial-intake path.**
- Attack: not a security exploit given the single-user blast radius (section
  4), but a compounding-degradation risk the owner's own "regenerate...
  regenerate... do the same for the deck" flow makes concrete: repeated
  regenerate cycles could grow the prompt unboundedly if the fold-in
  concatenates rather than bounds.
- Fix: apply a character/token budget to the folded payload, sized against
  `generate.ts:403`'s existing `maxOutputTokens: 12288`, mirroring
  `DECK_SOURCE_MAX_CHARS` (`src/lib/decks/deck-source.ts:19`) for the single-shot case.
- Residual: R-SEC-2.

**INFO-1 (confirmed clean) - the generation path's only network egress is
the single, already-gated Gemini `:generateContent` call.**
No action needed. Traced in full in sections 1 and 3.

**INFO-2 (confirmed clean) - a deck persisted via the existing
`savePresentationFileAction`/`getRecordingFileById` idiom is already
per-account isolated by an explicit query filter, independent of RLS.**
No action needed AS LONG AS the architect reuses this exact idiom rather than
a new read path. See Residual R-SEC-4.

**INFO-3 (confirmed clean) - both existing Markdown-to-HTML renderers in
this repo escape their input; the existing deck-editor UI renders model
output as plain, auto-escaped React text with no renderer at all.**
No action needed as a baseline; section 6 states the one thing PRES-1 must
not do (raw `dangerouslySetInnerHTML` on model prose).

## 9. Residual register (owner + instrument + step; each owed a backlog entry)

I may write only this file; these are handed to the orchestrator to record in
`docs/BACKLOG.md` under PRES-1 at disposal/push. Numbered to extend, not
duplicate, the acceptance-criteria doc's R-1..R-6 - each states which one it
extends, or that it is new to this pass.

- **R-SEC-1 (extends R-1) - the on-page preview must be built from
  structured slide data already rendered safely elsewhere in this repo, never
  a `.pptx`-binary external viewer or iframe (SEC-2).** Owner: architect.
  Instrument: a source-text test over the new preview component scanning for
  `<iframe`, `office.com`, `docs.google.com`, or any host string other than
  the app's own origin and `generativelanguage.googleapis.com`; the positive
  precedent to reuse is `GeneratePanel.tsx:374-386`. Step: architect pass,
  checked before the build wave.
- **R-SEC-2 (extends AC-7/LEV-1) - the regenerate fold-in needs a size
  ceiling on the folded prior-context-plus-critique payload (SEC-3).**
  Owner: architect (design the ceiling) + test seat (assert it holds across
  2+ regenerate cycles in the LEV-1/AC-7 oracle). Instrument:
  `src/lib/decks/deck-source.ts:19`'s `DECK_SOURCE_MAX_CHARS` pattern, `generate.ts:403`'s
  `maxOutputTokens`. Step: architect pass, then the test seat's oracle.
- **R-SEC-3 (new) - every new PRES-1 server action must be an `export async
  function`, never an arrow-function export, or it is invisible to
  `action-guard-coverage.test.ts`'s collector (SEC-1).** Owner: implementer
  brief author (whoever writes the wave assignment) + the wave gate itself.
  Instrument: `action-guard-coverage.test.ts:127`'s collector regex,
  `:61`'s `GUARD_CALL` regex; the test is already part of `npm test`, so no
  new test file is owed - only the explicit constraint in the brief. Step:
  wave gate (re-run `npm test`, confirm the new action names appear in the
  suite's own coverage by construction, i.e. the file is `export async
  function`-shaped).
- **R-SEC-4 (new) - confirm at architect/implementation time that any
  persisted PRES-1 deck reuses `getRecordingFileById`'s owner-scoped query
  shape, not a bare `.eq("id", id)` lookup, since the service-role client
  that performs these reads bypasses RLS entirely.** Owner: architect
  (design) + implementer (build). Instrument:
  `recording-files.ts:170-191` (the pattern to match),
  `server.ts:126-141` (why RLS does not apply to this client). Step:
  architect pass names the read path explicitly; the wave gate confirms the
  shipped code matches it by reading the diff.
- **R-SEC-5 (new) - the intake surface's copy should distinguish "the
  assignment prompt/objectives/lesson plan" (safe, instructor-authored) from
  "a student's submitted work" (out of scope for this feature, and the kind
  of content `docs/n13b-security.md` treats as a distinct risk class), so an
  instructor does not paste the wrong thing by habit.** Owner: UX seat
  (copy is that seat's lane, per `docs/loop/seats.md`'s User experience
  section) - this pass states the security rationale, not the wording. No
  code enforcer exists or is proposed; this is a reading/wording
  recommendation only. Step: UX pass (wave 3), if triaged in.
- **Cross-reference, not duplicated:** `docs/pres-1-acceptance-criteria.md`'s
  own R-3 (model-output quality), R-4 (tab/preview/download reachability),
  and R-5 (critique usefulness) already cover the owner-verification-only
  claims this pass would otherwise restate; this pass adds no new
  owner-only residual beyond R-SEC-1's instrument choice, which IS
  machine-checkable (a source-text scan), not owner-only.

## 10. Machine-checkable versus reading versus unverifiable here

**Machine-checkable today, with a real instrument (some already exist and
require no new authoring; some are proposed for the test seat):**
- SEC-1's premise - the collector regex's column-zero, `async function`-only
  shape (`action-guard-coverage.test.ts:127`) and the guard regex
  (`:61`) - read in full, not inferred.
- `action-guard-coverage.test.ts`'s existing hard root-layout check and
  ratchet already run as part of `npm test`; they will automatically cover
  any new PRES-1 action written in the house shape, with zero new test
  authoring.
- AC-3's egress instrument (section 3) - buildable today from the
  `not-postable` pattern already in this repo, inverted; no live key needed
  since it is an import/source-text walk.
- The single-egress-point claim (section 1/3) - traced by opening every file
  on the path; re-derivable by anyone with the same `grep`/`sed` commands
  quoted inline above.
- The `recording_files` access-control claim (section 5) - traced by
  opening the RLS migration, the service-client constructor, and every read
  function's query chain in full.
- Both Markdown renderers' escaping behavior (section 6) - read in full;
  `src/lib/markdown.test.ts` already exercises `markdownToHtml`'s
  regression coverage for the attribute-injection class of defect.

**Reading claims, not executed here (no component renders under vitest, per
`docs/loop/this-repo.md` section 6):**
- Whether the eventual on-page preview, once built, actually LOOKS like
  slides to the instructor - covered by the AC's own Residual R-4
  (owner-verification).
- Whether the intake copy (R-SEC-5) is actually followed by instructors in
  practice - a UX/behavioral question, not a security one.

**Cannot be verified in this environment at all
(`docs/loop/this-repo.md` section 6):**
- Whether a REAL deployed Gemini call, given real pasted LMS material,
  ever echoes something sensitive back into a generated artifact. No `.env`,
  no live `GEMINI_API_KEY` here; every LLM path in this repo is exercised
  through mocks. This pass can and does prove the CODE has exactly one
  egress point and no PII-specific filter (by design, per the AC's own
  framing); it cannot measure real-world model behavior on real content.
  This is why sections 3's egress instrument and section 6's rendering
  constraint are code-level controls rather than "trust the model" - the
  same reasoning `docs/n13b-security.md` section 5 states for a different
  feature on this same LLM path.
- Whether the deployed `SUPABASE_SERVICE_ROLE_KEY`/RLS configuration in
  production matches what the migration file specifies. No live database
  here; `docs/loop/this-repo.md` section 6's "no live database" ceiling
  applies verbatim.

## 11. Out of lane (deliberately not decided here)

- The exact shape of the on-page preview component (SEC-2/R-SEC-1's fix) -
  architect.
- The exact fold-in mechanism and its size ceiling (SEC-3/R-SEC-2) -
  architect + test seat.
- Whether PRES-1 persists decks to Files at all, versus client-download-only
  (R-1's own note that this is a distinct build item) - architect, per the
  AC document's own fork resolution.
- The intake surface's exact copy (R-SEC-5) - UX seat.
- Whether A43's deck-from-template-plus-content-pack area should be
  subsumed, reused, or kept disjoint from PRES-1 - out of this seat's lane
  entirely; the AC document does not resolve it either
  (`docs/backlog.yml:1085`'s own note says "the scope must decide"), and
  nothing this pass found bears on it from a security angle beyond what
  sections 1-3 already state (both areas would share the same single
  `callLlm` egress point regardless of how they are organized).
