# R-WK-3 URL-guard hardening - TDD test notes + oracles (authoritative artifact)

These are test NOTES and frozen oracles, not test code. The implementer writes
the tests from them; a fresh loop-checker reads this file before any build.

**Item:** R-WK-3, confirmed at `docs/recording-announcement-owner-walk.md:400-403,461`.
The guard's `BARE_URL_RE` (`src/lib/walkthrough-announcement-link-guard.ts:57`)
requires an `http(s)://` scheme, so a scheme-less `www.evil.example/x` is matched
by neither pass of `stripUnpermittedUrls` and survives into the instructor's
review draft.

**Baseline measured** (node, current regex `/https?:\/\/[^\s)\]"]+/gi`):
`"Try www.evil.example/x now.".match(RE)` returns `[]`. The gap is real and the
guard touches it nowhere today.

---

## The fork - RULED: WIDEN

- **WIDEN (ruled by the coordinator).** Do the conservative `www.`-only widen
  below. Reasons on record: the risk is post-send Canvas autolinking of an
  invented bare link in a bulk class announcement; the fix is small and
  provably non-regressing (26/26 self-proved with existing behavior frozen);
  and CHANGE 2 makes it safe against the false-strip hazard. This is the reading
  the oracles below are built for.
- **ACCEPT (recorded alternative; the owner may still redirect here).** No
  change. Justified by a verified mitigant: the app's own renderer
  `renderInlineMd` (`src/lib/markdown.ts:186`, regex
  `/\[([^\]]+)\]\(([^)]+)\)/g`) autolinks ONLY `[text](href)` constructs - it
  does NOT autolink bare URLs, so a surviving bare `www.foo` is inert in-app
  (rendered as literal text). Choosing ACCEPT DROPS the entire write set below
  and closes R-WK-3 as "accepted, inert in-app", keeping the Canvas-autolink
  risk recorded as a residual.

---

## Scope of the hardening - two changes, BOTH required

**CHANGE 1 - widen detection, `www.`-only, word-boundary anchored.**
`BARE_URL_RE` becomes:

```
/(?:https?:\/\/|\bwww\.)[^\s)\]"]+/gi
```

Scheme branch stays first, so existing scheme matches are byte-identical -
alternation is ordered and `https?://` consumes greedily before the www branch
can fire. Use `\bwww\.` (word boundary), NOT bare `www\.`. Measured distinction:
`"awww.gov/x"` matches `"www.gov/x"` mid-word under bare `www\.` (a false
positive) and matches nothing under `\bwww\.`. The owner's named prose tokens
are safe under both.

**CHANGE 2 - make `normalizeForComparison` treat the scheme-less `www.` form and
its scheme-prefixed equivalent consistently. LOAD-BEARING (see SAB-B).** After
the existing tab/CR strip, if the string begins `www.`, prepend `https://`
before `sanitizeResourceUrl`:

```
const schemed = /^www\./i.test(stripped) ? `https://${stripped}` : stripped;
const cleaned = sanitizeResourceUrl(schemed);
```

This is the coercion-changes-set-membership core. `sanitizeResourceUrl`
(`src/lib/urls.ts:235`) returns `""` for anything without an `http(s)://` prefix
after cleanup, so WITHOUT change 2 a `www.` form normalizes to `""` - meaning a
legitimate transcript `www.good.example/lab` is (a) never added to the permitted
set by `collectPermittedUrls`/`collectTakePermittedUrls`, and (b) never matches
in the draft, so it gets STRIPPED (a false removal of a legit link). SAB-B proves
exactly this.

**Must NOT change** (signatures both consumers depend on):

- `collectPermittedUrls` 8-field arg object - consumed at
  `src/app/actions/walkthrough-announcement.ts:486-495`.
- `collectTakePermittedUrls(carriers: string[])` - consumed at
  `src/lib/take-announcement-draft.ts:30-37`.

Widen the matcher and normalizer only; keep both signatures. By the time a string
reaches `normalizeForComparison` it is already an isolated `BARE_URL_RE` match (it
starts at `www.` - `\b` is zero-width) or a link target, so the `^www\.` anchor in
CHANGE 2 is correct.

---

## Requirements - each with verify row (object / instrument / direction) and sabotage

All oracles are frozen literals from a reference run (26/26 green). Pure module,
node-testable, no render.

### REQ1 - NEW behavior: invented scheme-less `www.` stripped; transcript scheme-less `www.` kept byte-for-byte

- Object: `stripUnpermittedUrls(draft, permitted).{text,stripped}`. Instrument:
  exact-string `toBe` + `toEqual`. Direction: evil survives (text still contains
  it) OR good removed => FAIL.
- Construction: `permitted = collectPermittedUrls(baseCollectArgs({ materialsText: "Lab notes: www.good.example/lab covers it." }))` (any carrier field works; `materialsText` is simplest).
- `draft = "Try www.evil.example/x now, and see www.good.example/lab for the lab."`
- Frozen: `text === "Try  now, and see www.good.example/lab for the lab."` (note
  the DOUBLE space where evil was spliced to `""`),
  `stripped === ["www.evil.example/x"]`.
- Sabotage (= REQ2 removal test): revert CHANGE 1 to the scheme-only regex.
  Result: evil not detected, `text` keeps `www.evil.example/x`,
  `stripped === []`. RED on removal, GREEN after restore. Discriminates
  (measured: SAB-A, 2 assertions flip).

### REQ1b - consistency: transcript written WITH scheme, draft bare `www.` -> KEPT

- `permitted` from carrier `"https://www.good.example/lab"`;
  `draft = "See www.good.example/lab here."` -> frozen
  `text === "See www.good.example/lab here."`, `stripped === []`.
- Sabotage: revert CHANGE 2 (normalize). Result: `www.good.example/lab`
  normalizes to `""`, is absent from permitted, and gets stripped ->
  `text === "See  here."`, `stripped === ["www.good.example/lab"]`.
  Discriminates (measured: SAB-B).

### REQ2 - REMOVAL test

REQ1's sabotage above IS the removal test. Deleting the new bare-`www.` branch
flips the invented-stripped assertion. It fails on REMOVAL, not only on breakage:
SAB-A removes the branch entirely and REQ1 goes red. Measured.

### REQ3 - FROZEN PRESERVATION of existing behavior (the coercion guard)

Pin these as exact-string oracles so the widening cannot silently alter them. All
also pass under the reference with both changes on (measured):

- Invented `https://` stripped:
  `stripUnpermittedUrls("See https://evil.example/x now.", new Set())` ->
  `text === "See  now."`, `stripped === ["https://evil.example/x"]`.
- Transcript `https://` kept: `permitted` from `"https://good.example/x"`,
  `"See https://good.example/x now."` -> unchanged, `stripped === []`.
- Walkthrough md-link strip (existing):
  `"Check out this [Great tutorial](https://evil.example) before you start."`,
  `new Set()` -> `"Check out this Great tutorial before you start."`,
  `["https://evil.example"]`.
- Userinfo smuggling (Ruling 18b): `permitted` from `"https://permitted.example/x"`,
  `"See [Read this](https://permitted.example@evil.example/x) now."` ->
  `"See Read this now."`, `["https://permitted.example@evil.example/x"]`.
- Non-http skips (Ruling 29): `/courses/101/syllabus`, `mailto:prof@example.edu`,
  `attachment:12345`, `#summary` as link targets -> each draft byte-identical,
  `stripped === []`.
- Case-variant scheme/host still equal: `permitted` from `"https://ok.example/a"`,
  `"See HTTPS://OK.EXAMPLE/a here."` -> unchanged.
- Frozen normalized keys (construction proof):
  `normalizeForComparison("https://good.example/x") === "https://good.example/x"`;
  `normalizeForComparison("www.good.example/lab") === "https://www.good.example/lab"`;
  `normalizeForComparison("https://www.good.example/lab") === "https://www.good.example/lab"`
  (bare and scheme forms collapse to ONE key - this is what makes REQ1b work).
- Implementation note: the existing suite
  `walkthrough-announcement-link-guard.test.ts` already carries many of these as
  `toBe` assertions. KEEP every existing assertion byte-identical and passing;
  ADD the new ones. Do NOT refactor the existing tests - consolidating them into
  the new ones would be the refactor-disarms-a-comparison tautology this repo has
  shipped before.
- Sabotage for REQ3 is the whole-file gate: if either change perturbs a
  scheme/relative/mailto/anchor case, these frozen literals go red. Measured:
  under SAB-B (normalize change only, the riskier one) all REQ3 + REQ4 assertions
  stay green (22 pass) - the normalize change is isolated to the www branch, as
  intended.

### REQ4 - false-positive guard: prose host-ish tokens NOT stripped

- `stripUnpermittedUrls("Install Node.js first (e.g. the LTS build), by 9 a.m. tomorrow.", new Set())`
  -> byte-identical, `stripped === []`. Measured green.
- These tokens contain no `www.`/scheme so neither regex form touches them - this
  pins that the widen did not over-match the owner's named prose (`Node.js`,
  `e.g.`, `a.m.`).
- Sabotage: widen CHANGE 1 to the REJECTED bare `host.tld/...` form (no `www.`
  requirement). It would match `Node.js` -> RED. This discriminates the ruled
  narrow scope from the aggressive-parser scope. Not shipped as a test (the
  rejected form is not the proposed impl); it is the argued justification for
  staying `www.`-only.

---

## Self-proof of satisfiability

Reference implementation (throwaway, verbatim copy of `sanitizeResourceUrl` plus
the two proposed changes) scores 26/26 oracle assertions green. The red set is
satisfiable by the exact two-change implementation above - no contradictory or
impossible criterion, and no assertion was dropped to make it pass.

## Sabotages that discriminate - both measured, neither rebuilt

- **SAB-A** (CHANGE 1 reverted to scheme-only regex): REQ1 flips RED (evil www
  undetected). GREEN after restore. Discriminates.
- **SAB-B** (CHANGE 2 reverted, regex widened): REQ1/REQ1b flip RED - the legit
  transcript www is falsely stripped, proving CHANGE 2 is not optional and
  demonstrating the coercion hazard directly. GREEN after restore. Discriminates.
- No mutant was banked as a kill it did not earn; no mutant needed rebuilding.

---

## Executable here vs argued

- **Executable (node leaf, no render):** every REQ1/REQ1b/REQ2/REQ3/REQ4
  assertion above. This module is pure (`import { sanitizeResourceUrl }` plus a
  type import); vitest node-env runs it.
- **Argued, not executable here:** (a) the in-app inertness mitigant -
  `renderInlineMd` not autolinking bare URLs is READ from `markdown.ts:186`, not
  rendered by any test; (b) Canvas autolinking a surviving `www.` post-send -
  off-repo, owner-verifiable only; (c) the `\bwww\.` vs `www\.` recommendation
  rests on the measured `awww.gov/x` case - that single case is executable, but
  the claim "word-boundary is safer across all prose" is argued, not
  exhaustively enumerated.

---

## Write set - small, disjoint, nothing in flight

- `src/lib/walkthrough-announcement-link-guard.ts` (CHANGE 1 + CHANGE 2)
- `src/lib/walkthrough-announcement-link-guard.test.ts` (add
  REQ1/REQ1b/REQ3-new/REQ4 cases + a new sabotage comment documenting SAB-A for
  the new branch)

No other file changes. The two priority features (grader W2 `5756233d`, rec-ann
W2 `589c3bfb`) are shipped; nothing is in flight on these paths.

## Gate - shared file, the consumer suites MUST stay green

The guard is consumed by the take route (`finalizeTakeDraft`,
`take-announcement-draft.ts`) and the walkthrough route
(`walkthrough-announcement.ts`). Neither consumer test asserts anything about
`www.` today (grepped: zero `www.` in either test), so the widen does not break
them - but they gate because the file is shared. Run exactly three files via the
wrapper (two-or-more paths, so NOT a raw multi-path vitest):

```
npm run test:paths -- src/lib/walkthrough-announcement-link-guard.test.ts src/lib/take-announcement-draft.test.ts src/app/actions/walkthrough-announcement.test.ts
```

Then the sabotage pass on the implemented code (SAB-A and SAB-B above), then
`npx tsc --noEmit` (no `/s` regex is used; the proposed regexes are plain).

## Residual register

| Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|
| Canvas autolinks a surviving bare `www.` after send (relevant if owner picks ACCEPT, or for any form the widen still misses) | repo owner | real Canvas post - no render/network under vitest | next owner-run announcement send; observe the posted body |
| `\bwww\.` residual over-match on contrived `awww.gov`-shaped prose | architect/security seat | the `awww.gov/x` node check above | next security pass on the take route (R-WK-3's own listed owner) |
| Scheme-less bare `host.tld/...` (no `www.`) invented links still survive - deliberately out of scope to protect REQ4 | repo owner (scope decision) | a node leaf over `stripUnpermittedUrls("see evil.example/x", new Set())` | only if owner later widens scope beyond `www.`; filed as the known cost of the conservative reading |

## Files to open

- Guard: `src/lib/walkthrough-announcement-link-guard.ts` (`BARE_URL_RE:57`,
  `normalizeForComparison:88-98`, `stripUnpermittedUrls:182-204`,
  `collectPermittedUrls:110-141`, `collectTakePermittedUrls:150-159`)
- Guard test: `src/lib/walkthrough-announcement-link-guard.test.ts`
- `sanitizeResourceUrl` (the http(s)-only gate that forces CHANGE 2):
  `src/lib/urls.ts:224-237`
- Inertness mitigant: `src/lib/markdown.ts:182-196`
- Consumers: `src/lib/take-announcement-draft.ts:30-38`;
  `src/app/actions/walkthrough-announcement.ts:486-496`
- R-WK-3 source: `docs/recording-announcement-owner-walk.md:400-403,461`
