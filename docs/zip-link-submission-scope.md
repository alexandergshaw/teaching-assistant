# Scope + wave plan: grade zip-submitted link.html redirects

Owner request (direct chat, 2026-10-07), verbatim: "i need grading by zip to
also support opening links that get submitted for submissions".

HEAD at scoping: da3d60d3. Every quantity below names the command that produced
it. Every `file:line` was opened. This is a design artifact (scope + wave plan),
not production code; the detailed entry-construction shape is handed to
`loop-architect` where noted, with a recommended reading on each fork.

---

## 1. The real artifact (ground truth for the oracle)

A Canvas assignment export zip mixes ordinary file submissions (`*.py`, `*.docx`,
...) with Canvas "Website URL" submissions exported as
`<student>_<id>_link.html`. Each `link.html` is a REDIRECT page carrying the
student's real submission URL in TWO places plus a marker line:

```
<meta http-equiv="Refresh" content="0; url=https://THE-URL" />
<a href="https://THE-URL">Click Here to go to the submission</a>
... body text: "This submission was a url, we're taking you to the url link now."
<title>Assignment ...: <Student Name></title>
```

The two real URLs seen in the owner's sample (these are the oracle's frozen
values):

- `https://github.com/MikeC21006/applied-ai-4-mike-caps.git` - a GitHub repo
  `.git` URL.
- `https://vscode.dev/github/tfuller26-oss/applied-ai-4-Josh-allen/blob/main/Act%202/student_agents/dougdahl_tournament_agent.py`
  - a vscode.dev/github **blob** URL pointing at a GitHub-hosted file.

Today the zip grader reads `link.html` as a normal HTML text file and grades its
boilerplate - useless. The feature: DETECT these redirect files, EXTRACT the
URL, RESOLVE it through the shipped URL resolvers, and grade the RESOLVED content
as the student's submission.

Note: the owner wrote `HTTPS://THE-URL` (uppercase scheme) as a placeholder in
the request; the real sample URLs are lowercase `https`. The detector matches
attribute/keyword names case-insensitively and preserves the URL value exactly.

---

## 2. The seam (located and cited)

**There is ONE shared ingestion chain, and all three local zip-grading paths run
it: `ingestZipEntries`.**

- `src/lib/grade/extraction.ts:170` `ingestZipEntries(zipBuffer, options)` is the
  shared chain: it calls `extractSubmissions` (`:178`), runs the A44 collision
  refusal (`:188-191`), optional filename inference (`:192-194`), then
  `groupSubmissionsByStudent` (`:195`).
- `extractStudentEntries` (`src/lib/grade/extraction.ts:154`) is a thin wrapper
  over `ingestZipEntries` (`:158`).
- `gradeSubmissions` (`src/lib/grade/engine.ts:555`) dynamically imports and
  calls `ingestZipEntries` (`src/lib/grade/engine.ts:562,571`). Its own comment
  (`:564-566`) states "Extract -> refuse -> infer -> group is the shared chain in
  ingestZipEntries".

Where a zipped file becomes content: `extractSubmissions`
(`src/lib/grade/extraction.ts:46-140`) walks the zip and for each supported file
puts its extracted text into `submissions[fullName]` (`:117`) and its base64 into
`rawData[fullName]` (`:118`). `html` is a TEXT extension
(`src/lib/office-extract.ts:26`; `htm` at `:27`), so a `*_link.html` is read as a
string (`src/lib/grade/extraction.ts:34-36`), its boilerplate stored as that
file's `submissions` value. `groupSubmissionsByStudent`
(`src/lib/grade/utils.ts:439-538`) then folds each file's text into the student's
`content` (`:510-515`) and `submittedFiles` (`:517-529`), keyed to the student
parsed from the filename. **That is exactly where the boilerplate is graded
today, and where the resolution must slot in.**

**The chosen seam: a new resolution pass inside `ingestZipEntries`, operating on
the `submissions`/`rawData` maps AFTER `extractSubmissions` and the collision
refusal, BEFORE inference and grouping.** Rationale:

- `extractSubmissions` is network-free by construction (JSZip only). Keep it that
  way; do not add fetch there.
- `ingestZipEntries` is already async and already does network/model work
  (collision refusal is pure, but `inferFileNameConvention` at `:192-193` is a
  model call), so adding a bounded network resolution here is consistent with the
  function's existing nature and server-only call sites.
- Placing it inside `ingestZipEntries` means ONE change covers all three local
  paths (chat file upload, GradingTab embedded, GradingTab Gemini) at once.
- Run it AFTER the collision refusal (`:188-191`) so a zip that will be
  collision-refused never pays a network fetch. The refusal keys on filenames,
  which the resolution does not change, so ordering is safe.

---

## 3. Do the two zip graders share `extractStudentEntries`? (and the "other" caveat)

| Surface | Entry point | Reaches the shared chain? |
|---|---|---|
| **Chat file upload** (multi-file zip) | `prepareChatSubmissionAction` -> `resolveOnePart` -> `extractStudentEntries` (`src/app/actions/grading-chat-intake.ts:199`; Drive-sourced zip at `:269`) | YES - via `ingestZipEntries` |
| **GradingTab Upload ZIP, embedded provider** | `gradeAction` -> `extractStudentEntries` (`src/app/actions/grading.ts:860`) | YES - via `ingestZipEntries` |
| **GradingTab Upload ZIP, Gemini provider** | `gradeAction` -> `gradeSubmissions` (`src/app/actions/grading.ts:943`) -> `ingestZipEntries` (`engine.ts:562,571`) | YES - via `ingestZipEntries` |
| **GradingTab Upload ZIP, "other" provider** | `gradeAction` -> `gradeZipViaEngine` -> `gradeViaGradingEngine` (`src/app/actions/grading.ts:852-854`, Canvas-synthesized zip at `:763-764`) | **NO** |

So: the chat path and the GradingTab embedded path both call
`extractStudentEntries` directly; the GradingTab Gemini path reaches the same
`ingestZipEntries` through `gradeSubmissions`. **One resolution pass in
`ingestZipEntries` fixes all three in one wave.**

**The "other" provider is out of scope and MUST be stated as such.**
`gradeViaGradingEngine` ships the raw base64 zip to an EXTERNAL deterministic
grading service (`src/app/actions/grading.ts:695-699`); extraction and grading
happen in that service, not in this codebase. This repo cannot detect or resolve
a `link.html` on that path without changing the external engine. Record as a
residual (R1) so a user who grades a URL-submission zip under the "other" toggle
is not silently told it worked when it did not.

Note the GradingTab Gemini path also runs a SECOND, extraction-only collision
pre-check at `src/app/actions/grading.ts:931` via `extractSubmissions` directly
(not `ingestZipEntries`). That pre-check inspects filenames only and needs NO
change - it must keep behaving as today (link.html filenames parse to students
the same way other Canvas files do).

---

## 4. The pure detector + URL extractor (machine-checkable core)

A new client-safe leaf module, no `jszip`/`Buffer`/`fetch`/server-only imports
(mirrors `src/lib/canvas-url.ts` and `src/lib/google-drive-url.ts`):

**`src/lib/grade/canvas-link-submission.ts`** (new)

```ts
// PURE. No network, no Buffer, no server-only imports.

/** The submitted URL if `html` is a Canvas "Website URL" redirect page,
 *  else null (an ordinary HTML submission is left untouched). */
export function extractCanvasSubmittedUrl(html: string): string | null;

/** Rewrites vscode.dev/github/<rest> to https://github.com/<rest>, else
 *  returns the URL unchanged. Pure string/URL transform. */
export function normalizeSubmittedRepoUrl(url: string): string;
```

### 4.1 Detection predicate (the fork is resolved - see Fork F1)

`extractCanvasSubmittedUrl` returns a URL only when the input is RECOGNIZABLY a
Canvas URL-redirect page. Recommended predicate, keyed primarily on the
meta-refresh:

1. Find a `<meta>` whose `http-equiv` equals `refresh` (case-insensitive) and
   whose `content` attribute matches `^\s*\d+\s*;\s*url\s*=\s*(\S+)` (the `url=`
   target, case-insensitive on `url`). This is the PRIMARY source.
2. If no meta-refresh URL is found, fall back to the first
   `<a href="...">...Click Here to go to the submission...</a>` whose text or the
   page body contains the marker "This submission was a url".
3. If neither yields a URL, return null (ordinary HTML - never hijacked).

The marker string "This submission was a url" is an ADDITIONAL guard, not the
sole key (Fork F1): a real student webpage can contain a meta-refresh too, so the
recommended predicate requires EITHER (a) a meta-refresh whose extracted target
is itself a resolvable host (GitHub/vscode.dev/Drive - see section 6) OR (b) the
"This submission was a url" marker present. This keeps the detector from
resolving a legitimate HTML submission that happens to auto-redirect to an
unrelated site. The architect finalizes the exact boolean; the oracle below pins
both the positive and negative cases it must satisfy.

The extracted URL value is returned verbatim (HTML-entity-decoded for `&amp;`
only - the sample has none, but `content="0; url=...&amp;..."` is possible). No
`decodeURIComponent` here; the downstream parsers
(`parseSubmissionGithubUrl`, `parseGoogleDriveUrl`) do their own per-segment
decode.

### 4.2 The frozen oracle (built from the two real fixtures)

Two committed fixtures reproduce the owner's sample exactly, under
`src/lib/grade/__fixtures__/` (or inline template literals in the test - the
architect chooses; inline avoids a new fixture-dir canary):

- `mike_12345_link.html` -> `extractCanvasSubmittedUrl` returns
  `https://github.com/MikeC21006/applied-ai-4-mike-caps.git`
- `josh_67890_link.html` -> returns
  `https://vscode.dev/github/tfuller26-oss/applied-ai-4-Josh-allen/blob/main/Act%202/student_agents/dougdahl_tournament_agent.py`

Oracle axes (the generator axes come from a DIFFERENT source than the
expected-value table, per the Test seat rule): the expected URLs are the two
literal strings above; the generator varies the WRAPPER (meta present/absent,
href present/absent, marker present/absent, attribute case, whitespace,
self-closing vs not) around those two fixed targets, plus NEGATIVE inputs:

- an ordinary `.html` with real content and no redirect -> null
- a `.html` with a meta-refresh to a NON-resolvable host and no marker -> null
  (not hijacked)
- `extractTextFromFile`'s output for a `.py`/`.docx` (not HTML) is never passed
  here (the caller only calls it on `.html`/`.htm` files - section 5).

This core is fully machine-checkable (no network): `extractCanvasSubmittedUrl`
and `normalizeSubmittedRepoUrl` are pure.

---

## 5. The resolve-at-extraction flow (the in-wave caller)

Inside `ingestZipEntries` (`src/lib/grade/extraction.ts`), after the collision
refusal and before inference/grouping, a new async step rewrites the
`submissions` map in place for detected link files:

```
for each (path, text) in submissions where getFileExtension(path) in {html, htm}:
    url = extractCanvasSubmittedUrl(text)
    if url is null: continue            # ordinary HTML - untouched
    resolved = await resolveSubmittedLink(url)   # new helper, section 5.1
    submissions[path] = resolved.content          # repo code, or a note
    delete rawData[path]                          # drop the redirect-page bytes
```

Grouping then runs unchanged: the student is still parsed from
`<student>_<id>_link.html`, and the student's `content` now carries the resolved
source instead of the boilerplate. Resolution of all link files runs in parallel
(`Promise.all`), bounded by the number of link files in the zip.

### 5.1 `resolveSubmittedLink(url)` (new, server, in extraction.ts)

Reuses ONLY the shipped bounded-host resolvers. Classification by host:

1. `normalizeSubmittedRepoUrl(url)` (maps vscode.dev/github -> github.com).
2. `parseSubmissionGithubUrl(normalized)` (`src/lib/submission-repo.ts:47`) - if
   it does NOT return `{error}`, fetch via `fetchGradableRepoContent(normalized)`
   (`src/lib/grade/repo-content.ts:55`, already imported by extraction.ts at
   `:26`). On success, fold the repo blob into the file's content exactly as
   `canvasWorkToEntry` already does for a GitHub link
   (`src/lib/grade/extraction.ts:462-465`): a header line
   `GitHub repository code (<repo> @ <ref>[, trimmed...]):` then the content. On
   `{error}`, the content becomes the degrade note
   (`src/lib/grade/extraction.ts:458`): "Could not read the linked GitHub
   repository: <error>." plus the original `Submitted link: <url>`.
3. Else `parseGoogleDriveUrl(url)` (`src/lib/google-drive-url.ts:54`) - **W1:
   NOT fetched** (see Fork F5); content becomes a note naming the URL. Drive-in-
   zip resolution is residual R2.
4. Else (unknown host) - content becomes a note: "This submission was a link to
   <url>; automatic fetch is not supported for this host." No fetch.

`resolveSubmittedLink` NEVER throws: every branch returns a content string (repo
code or a note), mirroring `canvasWorkToEntry`'s GitHub branch which is wrapped
in try/catch precisely because one student's link must not abort the batch
(`src/lib/grade/extraction.ts:452-483`). A419-style note.

### 5.2 Avoiding two dialects of the GitHub fold

`canvasWorkToEntry` (`src/lib/grade/extraction.ts:448-484`) already contains the
GitHub fetch-and-fold logic. Duplicating it in `resolveSubmittedLink` risks the
"two dialects of the same fix" failure this repo has recorded (memory:
roster-text-vs-studentRepos; disambiguateCanvasEntries' own comment at
`extraction.ts:234-236`). **Recommended (Fork F2): extract a shared private
helper** in extraction.ts - e.g. `foldGithubRepoContent(url): Promise<{content;
gradedRepo?; gradedRef?; files?; repoReadNote?}>` - and call it from BOTH
`canvasWorkToEntry` and `resolveSubmittedLink`. Same file, so the write set does
not grow and disjointness is unaffected.

### 5.3 Oversize + size bounds (no new code needed)

The resolved content is bounded by `fetchGradableRepoContent`'s own caps
(`MAX_SUBMISSION_REPO_FILES=80`, `MAX_SUBMISSION_FILE_BYTES=300_000`,
`MAX_SUBMISSION_REPO_TOTAL_BYTES=3_000_000`;
`src/lib/submission-repo.ts:108-115`), so a resolved repo is already trimmed to
<=3MB. The chat surface additionally re-checks each returned entry with
`firstOversizedEntryReason` (`src/app/actions/grading-chat-intake.ts:201`) after
`extractStudentEntries` returns - so an oversized resolved entry is caught there
automatically, with no new code. The engine path has no per-entry wire budget
(it streams to Gemini); the repo caps are its bound.

---

## 6. vscode.dev -> github mapping decision (Fork F3 resolved)

`parseSubmissionGithubUrl` only accepts host `github.com`/`www.github.com`
(`src/lib/submission-repo.ts:39,58`), so the vscode.dev URL fails today.

**Decision: map `vscode.dev/github/<owner>/<repo>/<rest...>` to
`https://github.com/<owner>/<repo>/<rest...>` by dropping the leading `github`
path segment and swapping the host, preserving the rest of the path verbatim
(including percent-encoding like `Act%202`).** Then feed the rewritten URL to the
UNCHANGED `parseSubmissionGithubUrl` + `fetchGradableRepoContent`.

Why this is correct for the sample blob URL:
`https://vscode.dev/github/tfuller26-oss/applied-ai-4-Josh-allen/blob/main/Act%202/student_agents/dougdahl_tournament_agent.py`
rewrites to
`https://github.com/tfuller26-oss/applied-ai-4-Josh-allen/blob/main/Act%202/student_agents/dougdahl_tournament_agent.py`,
which `parseSubmissionGithubUrl` parses as `{owner: tfuller26-oss, repo:
applied-ai-4-Josh-allen, ref: main, subpath: "Act 2/student_agents/dougdahl_tournament_agent.py"}`
(segments decoded per `submission-repo.ts:63-71`, so `Act%202` -> `Act 2`).
`fetchGradableRepoContent` passes `subpath` to `selectSubmissionRepoFiles`
(`repo-content.ts:95`), whose `inScope` matches `path === cleanSubpath`
(`submission-repo.ts:166-168`) against the GitHub tree's own (unencoded) paths -
so it grades EXACTLY that one file.

**Repo vs blob: grade what the URL points at.** A vscode.dev `/blob/<branch>/<path>`
URL points at one file -> grade that file (via `subpath`). A `.git` or bare-repo
URL points at the whole repo -> grade the whole repo. This falls out of
`parseSubmissionGithubUrl`'s existing `tree`/`blob` handling
(`submission-repo.ts:85-88`) for free; no new logic. This is the recommended
reading because it reuses the shipped parser with zero special-casing and grades
the artefact the student actually linked.

Edge: a vscode.dev URL at repo root (`vscode.dev/github/<owner>/<repo>`) rewrites
to a repo URL and grades the whole repo - the correct degrade.

The mapper is the pure `normalizeSubmittedRepoUrl` (section 4), so the
github-vs-vscode decision is machine-checkable against a frozen oracle.

---

## 7. Host allowlist / SSRF posture

The zip-link feature inherits the SAME bounded-host posture the shipped URL
branch already enforces (`grading-chat-intake.ts:210-283`): it resolves ONLY
KNOWN hosts and NEVER fetches an arbitrary URL.

- GitHub (incl. vscode.dev->github): only ever reached through
  `fetchGradableRepoContent`, which fetches via the repo's GitHub client
  (`getRepo`/`getRepoTree`/`getFileText`, `repo-content.ts:19`) - it never fetches
  the pasted URL; it fetches `owner/repo/path` against `api.github.com`. The
  pasted string only ever supplies owner/repo/ref/subpath after
  `parseSubmissionGithubUrl` validation.
- Google Drive (W1: detect, do NOT fetch): `fetchGoogleDriveFile`
  (`google-drive-content.ts:161`) is itself hardened - the URL is BUILT from a
  `DRIVE_ID`-validated id into a host-fixed literal
  (`google-drive-url.ts:119-127`), `redirect: "manual"` with an exact-host
  allowlist on every hop (`google-drive-content.ts:181-194`), `credentials:
  "omit"`, size-capped. W1 does not call it from the zip path; R2 does.
- Any other host: NO fetch. The content becomes a note naming the URL. This is
  the same final refusal the chat url branch gives
  (`grading-chat-intake.ts:280-283`), except here it degrades ONE student to a
  note instead of refusing the whole input.

No new network egress is introduced. The only new code reaching the network is
`resolveSubmittedLink`, and it reaches it only through the two already-hardened,
already-imported fetchers. Security seat (Wave 2) still runs: trigger is "new
network egress path" even though the fetchers are reused.

---

## 8. Per-student failure isolation

A link that 404s, is private, is an unknown host, or whose repo has no readable
source files must NOT fail the whole zip. This is already the contract of the
reused primitive: `fetchGradableRepoContent` "Never throws" and maps every
failure to `{error}` (`repo-content.ts:48-53`), and `canvasWorkToEntry` wraps
even an unexpected rejection and degrades to a note
(`extraction.ts:452-483`). `resolveSubmittedLink` mirrors this exactly: on any
failure the student's `content` becomes a clear note (`Could not read the linked
GitHub repository: <reason>.` or the unknown-host note), grading proceeds on that
note, and every other student in the zip grades normally.

The collision refusal is the ONLY thing that throws from `ingestZipEntries`
(`extraction.ts:189-190`), and it runs BEFORE resolution on filenames only -
unchanged.

---

## 9. Machine-checkable vs owner-walk split

**Machine-checkable here (pure or resolver-mocked; vitest is network-blocked and
`vitest.setup.ts` throws on real fetch - memory: tests-are-network-blocked):**

- `extractCanvasSubmittedUrl` on the two fixtures and the negatives (section 4.2)
  - pure.
- `normalizeSubmittedRepoUrl` vscode.dev->github mapping, and github/non-github
  passthrough - pure.
- Host classification in `resolveSubmittedLink` (which branch fires per URL) -
  pure dispatch, assertable by MOCKING `fetchGradableRepoContent` (the module),
  never `fetch` (memory: mock the resolver modules, not fetch).
- The REMOVAL TEST (section 12): given a link.html fixture and a mocked
  `fetchGradableRepoContent` returning canned repo content `X`, the entry's
  `content` contains `X` and does NOT contain "This submission was a url". Delete
  the resolution call -> content keeps the boilerplate -> assertion goes red.
- Non-hijack: an ordinary `.html` submission flows through `ingestZipEntries`
  unchanged (content is its own text, not resolved).

**Owner-walk (cannot be verified in this checkout - no network, no live GitHub
token):**

- The actual fetch+grade of the two real URLs end to end.
- Whether `MikeC21006/applied-ai-4-mike-caps` and
  `tfuller26-oss/applied-ai-4-Josh-allen` are public/readable with the configured
  `GITHUB_TOKEN`.
- No component renders under vitest, so there is no UI assertion that the
  resolved grade shows correctly in GradingTab or the chat results.

---

## 10. Reuse list (symbol, file:line, what it gives us)

| Symbol | file:line | Gives us |
|---|---|---|
| `ingestZipEntries` | `src/lib/grade/extraction.ts:170` | The single shared seam all three local paths run |
| `extractSubmissions` | `src/lib/grade/extraction.ts:46` | Per-file text already extracted (html as string) - detection input |
| `groupSubmissionsByStudent` | `src/lib/grade/utils.ts:439` | Student grouping, unchanged, consumes the rewritten map |
| `canvasWorkToEntry` GitHub branch | `src/lib/grade/extraction.ts:448-484` | The exact fetch-and-fold pattern to reuse/extract (F2) |
| `parseSubmissionGithubUrl` | `src/lib/submission-repo.ts:47` | Parses github.com URL incl. `.git`, `blob/<ref>`, subpath |
| `fetchGradableRepoContent` | `src/lib/grade/repo-content.ts:55` | Fetch+flatten repo; never throws; already imported by extraction.ts:26 |
| `parseGoogleDriveUrl` | `src/lib/google-drive-url.ts:54` | Drive host/id parse (W1 detect-only; R2 fetch) |
| `fetchGoogleDriveFile` | `src/lib/grade/google-drive-content.ts:161` | Hardened Drive fetch (R2) |
| `getFileExtension` | `src/lib/office-extract.ts` (imported extraction.ts:7) | Identify `.html`/`.htm` files to inspect |
| `firstOversizedEntryReason` | `src/app/actions/grading-chat-intake.ts:113` | Chat-path post-check already bounds resolved entries - no change |

**Do-not-reuse:** `buildRepoUrlEntry`
(`grading-chat-intake.ts:93`) - it is module-private to a `"use server"` action
file; `extraction.ts` must not import from a server-action file, and the fold
logic already exists in `canvasWorkToEntry` (F2 extracts a shared helper there
instead). `gradeViaGradingEngine` path - external engine, out of scope (R1).

---

## 11. File layout + line estimates

| File | Change | Est. lines added | Resulting size |
|---|---|---|---|
| `src/lib/grade/canvas-link-submission.ts` | NEW pure leaf (`extractCanvasSubmittedUrl` + `normalizeSubmittedRepoUrl`) | ~60-90 | ~60-90 |
| `src/lib/grade/canvas-link-submission.oracle.test.ts` | NEW oracle test (2 fixtures + negatives + mapper axes) | ~120-180 | ~120-180 |
| `src/lib/grade/extraction.ts` | EDIT: `resolveSubmittedLink` + the in-chain pass + F2 shared fold helper | ~70-110 | 546 -> ~620-660 |
| `src/lib/grade/zip-link-resolution.test.ts` | NEW: resolver-mocked wiring + REMOVAL TEST | ~120-160 | ~120-160 |

`extraction.ts` current size: 546 (`@(Get-Content src/lib/grade/extraction.ts).Count`
= 546; `wc -l` = 546 - they agree here). Post-feature estimate ~620-660, well
under the 1000 ceiling. No other production file crosses 1000. Re-measure at the
wave gate with `@(Get-Content <file>).Count`, not these estimates.

---

## 12. Leverage (brief; final claim owned by `loop-ac`)

This is feature work (a new capability a user reaches), so a leverage claim is
owed - but the final claim and its single removal criterion belong to the
acceptance-criteria seat. The mechanism, stated for the architect/AC to inherit:
the app FOLLOWS the Canvas redirect page and FETCHES live external source
(GitHub) to grade the actual code, folded into the same batch held to one rubric
(`gradeStudentEntries` SCALE loop). A chat window handed the same zip can only
read the redirect boilerplate - it has no channel to follow
`<student>_<id>_link.html` -> GitHub -> code, and no way to attribute that code
to the right student by filename. Closest taxonomy class: SCALE extended to
URL-submitters (the same rigorous act, one rubric, run over every student
including those who submitted a link).

**Buildable removal test** (hands it to the Test seat): given a `link.html`
fixture and a mocked `fetchGradableRepoContent` returning canned content `X`, the
produced entry's `content` contains `X` and does NOT contain "This submission was
a url". Deleting the `resolveSubmittedLink` call in `ingestZipEntries` leaves the
boilerplate in `content` -> the assertion goes red. This is a true removal test
(the deleted line changes the asserted value), and it is machine-checkable
(resolver mocked, no real fetch).

---

## 13. Forks (each with a recommended reading)

- **F1 - detector key.** Key on meta-refresh + marker, meta-refresh + href, or
  marker alone? RECOMMENDED: require the meta-refresh `url=` target AND either
  (a) the target is a resolvable host or (b) the "This submission was a url"
  marker is present - so a legitimate auto-redirecting HTML submission is not
  hijacked. Oracle pins both positive and negative cases.
- **F2 - GitHub fold duplication.** Duplicate the fold logic or extract a shared
  helper? RECOMMENDED: extract `foldGithubRepoContent` in extraction.ts, called
  by both `canvasWorkToEntry` and `resolveSubmittedLink` (avoids two dialects;
  same file, no disjointness cost).
- **F3 - vscode.dev mapping.** RESOLVED (section 6): rewrite host, drop the
  `github` segment, preserve the rest; reuse `parseSubmissionGithubUrl`; grade
  the blob's file via `subpath`, or the whole repo for a repo URL.
- **F4 - content splice level.** Rewrite the `submissions` map value (string
  seam, RECOMMENDED for W1 - smallest sound change, grouping unchanged) vs build
  full per-entry `StudentSubmissionEntry` with `gradedRepo`/`gradedRef` and
  per-file `submittedFiles` (entry seam, richer results UI). The string seam does
  NOT set `gradedRepo`/`gradedRef` and surfaces the repo as one blob under the
  `_link.html` filename rather than per-file. Per-file surfacing + the repo badge
  are residual R3. RECOMMENDED reading: string seam for W1; R3 if the owner wants
  the Repo-Grades-style per-file view on the zip path.
- **F5 - Drive in a zip.** RECOMMENDED W1: detect Drive links but do NOT fetch
  them from the zip path - emit a per-student note. Rationale: both real fixtures
  are GitHub; Drive needs buffer->text (and image/zip) handling the string seam
  does not cleanly express, and the chat path already supports a direct-pasted
  Drive link. Drive-in-zip resolution is residual R2.

**Owner-decision fork (the one that needs the owner, filed as its own backlog
row per AGENTS.md Shape 5):** none of F1-F5 require the owner to proceed - all
have a recommended reading the architect can build on. The single owner call is
R1 (the "other" external-engine provider): either leave URL-submission zips
unsupported under "other" with a clear message, or fund an external-engine
change. This does not block W1 (W1 covers embedded + Gemini + chat).

---

## 14. Wave plan

**W1 (one wave, ships the caller - no dead-export leaf wave).** All of:

1. NEW `src/lib/grade/canvas-link-submission.ts` (pure leaf: detector + vscode
   mapper).
2. NEW `src/lib/grade/canvas-link-submission.oracle.test.ts` (frozen oracle from
   the two fixtures + negatives + mapper axes). Pure, runs under vitest.
3. EDIT `src/lib/grade/extraction.ts`: add `resolveSubmittedLink` + the in-chain
   resolution pass in `ingestZipEntries` + the F2 shared `foldGithubRepoContent`
   helper. **This is the CALLER** - the new leaf's exports are consumed in the
   same wave, so nothing ships dead (memory:
   assignment-must-include-the-wiring-file).
4. NEW `src/lib/grade/zip-link-resolution.test.ts`: resolver-mocked wiring test
   + the REMOVAL TEST (mock `fetchGradableRepoContent`, never `fetch`).

W1 is a single disjoint write set (all under `src/lib/grade/`, one production file
edited). It covers chat + GradingTab embedded + GradingTab Gemini simultaneously
because all three run `ingestZipEntries`. There is no W2 of required work; R1-R3
are residuals/forks, dispatched only if the owner wants them.

**Why no leaf-only wave:** a wave that shipped `canvas-link-submission.ts`
without the `extraction.ts` caller would ship a dead export with every gate green
(the recorded failure: verify-reachability-not-just-correctness, "the surface is
a layer"). The caller lands in W1.

### Wave gate (run on the tree, not from a report)

The new leaf import into `extraction.ts` is a PURE module (no supabase/github/
canvas reach), so it adds NO new server-only trail to engine.ts. The gate must
still PROVE that and prove the behavior tests still pass. Spelled with
`npm run test:paths` (never a raw multi-path vitest - memory: test-paths-wrapper):

```
npm run test:paths -- \
  src/lib/grade/canvas-link-submission.oracle.test.ts \
  src/lib/grade/zip-link-resolution.test.ts \
  src/lib/grade/extraction.test.ts \
  src/lib/grade/extraction.inference.test.ts \
  src/lib/grade/ingestion-attribution.oracle.test.ts \
  src/lib/grade/grouping-zip-parents.wiring.test.ts \
  src/lib/grade/collisionRefusal.wiring.test.ts \
  src/lib/grade/reply-axis-scoring.oracle.test.ts \
  src/lib/grade/rubric-stamp.wiring.test.ts \
  src/app/actions/grading-chat-intake.test.ts \
  src/app/actions/grading-incremental.test.ts \
  src/app/actions/grading.collisionRefusal.test.ts \
  src/app/actions/grading.budget.test.ts \
  src/app/actions/grading.guard.test.ts \
  src/lib/module-graph/runtime-import-graph.test.ts \
  src/lib/no-emojis.test.ts \
  src/source-bytes.structure.test.ts
```

Pass condition for the structural gate `runtime-import-graph.test.ts`: object =
engine.ts's runtime server-only closure; instrument = `R-16` `FROZEN_TRAILS`
deep-equal (`src/lib/module-graph/runtime-import-graph.test.ts:671-708`);
direction of failure = RED if the new import adds OR shortens a trail. The new
import is a pure leaf, so the expected result is GREEN with `FROZEN_TRAILS`
unchanged; if it goes red, the design is wrong, not the frozen list - do NOT edit
the list to pass.

Plus `git status --short` against the W1 file list (memory: wave-gate-git-status,
stale-worktree-shadows-glob), and the emoji/byte scans (no new file carries an
emoji or a materialized `\uXXXX` escape - memory:
write-tool-materializes-escapes, emoji-scan-grep-p-broken).

---

## 15. `owns` file list (derived, command + output pasted)

Edited/created production + test files:

- `src/lib/grade/canvas-link-submission.ts` (new)
- `src/lib/grade/canvas-link-submission.oracle.test.ts` (new)
- `src/lib/grade/extraction.ts` (edited)
- `src/lib/grade/zip-link-resolution.test.ts` (new)

Files that READ the edited files as source text, or assert on the shared chain's
behaviour - these are in the owns set because they go red if the resolution pass
changes entry shape or routes a non-link file differently. Command:

```
grep -rln 'from "\.\?/*extraction"\|@/lib/grade/extraction\|ingestZipEntries\|extractSubmissions\|extractStudentEntries' src --include=*.test.ts | sort
```

Output (pasted):

```
src/app/actions/grading-chat-intake.test.ts
src/app/actions/grading-incremental.test.ts
src/app/actions/grading.budget.test.ts
src/app/actions/grading.collisionRefusal.test.ts
src/app/actions/grading.guard.test.ts
src/lib/grade/collisionRefusal.wiring.test.ts
src/lib/grade/extraction.inference.test.ts
src/lib/grade/extraction.test.ts
src/lib/grade/grouping-zip-parents.wiring.test.ts
src/lib/grade/ingestion-attribution.oracle.test.ts
src/lib/grade/reply-axis-scoring.oracle.test.ts
src/lib/grade/rubric-stamp.wiring.test.ts
```

Structural scanners that walk `src` as source text (go red on a new file that
carries an emoji, a materialized unicode escape, or a new server-only import
trail from engine.ts):

```
src/lib/no-emojis.test.ts                      # roots = ["src","docs"], no-emojis.test.ts:254
src/source-bytes.structure.test.ts             # walks src, source-bytes.structure.test.ts:57
src/lib/module-graph/runtime-import-graph.test.ts  # R-16 FROZEN_TRAILS :671-708
src/lib/grade/grade-result-doors.wiring.test.ts    # walks src for Canvas-posting callers :54-68 (new leaf calls none - stays green)
```

Disjointness: W1's entire write set is under `src/lib/grade/` plus the four
scanner tests it is merely checked against (not edited). No other backlog item in
`docs/BACKLOG.md` currently edits `src/lib/grade/extraction.ts` - confirm with
`sort | uniq -d` against any concurrently dispatched item's file list before
running W1 alongside another wave.

---

## 16. Residual register

Each entry has an owner, an instrument, and a measuring step. Any of these
missing = a deletion. These must be filed in `docs/BACKLOG.md` or they do not
exist.

| ID | Residual | Owner | Instrument | Measuring step |
|---|---|---|---|---|
| R1 | "other" external-engine provider cannot resolve link.html (extraction is in the external service). Either show a clear "URL submissions aren't supported with the Other grader - use the default grader" message in GradingTab, or fund an external-engine change. | Owner (product decision) | A UI assertion in GradingTab's provider branch + a message string test; no component renders here, so the message-string test is the only machine check | Verify: rule on the "other" branch against the built diff; file the message-string test if the owner picks the message option |
| R2 | Drive link inside a zip is detected but not fetched (W1 emits a note). Resolve it via `fetchGoogleDriveFile` + `buildSingleFileEntry`-style buffer->text. | `loop-architect` + implementer | A resolver-mocked test asserting a Drive `link.html` yields the Drive file's extracted text (mock `fetchGoogleDriveFile`) | A follow-up wave; the note-vs-resolve behaviour is asserted in `zip-link-resolution.test.ts` today (note), flipped there when R2 ships |
| R3 | String-seam W1 does not set `gradedRepo`/`gradedRef` or per-file `submittedFiles` for a resolved zip link (repo shows as one blob under the `_link.html` name). Build full per-entry resolution for the Repo-Grades-style view. | `loop-architect` + implementer | A test asserting the resolved entry carries `gradedRepo`/`gradedRef` and per-file `submittedFiles` | A follow-up wave; pinned absent today by the W1 wiring test |
| R4 | A single `.html` redirect dropped OUTSIDE a zip (chat single-file path, or GradingTab single upload) still grades its boilerplate - `classifyGradingUpload` routes `.html` as `"single"` (`src/lib/grade/single-file-entry.ts`), which does not run `ingestZipEntries`. Owner asked specifically for "grading by zip", so this is out of W1 scope. | `loop-architect` + implementer | A test on the single-file path asserting a `link.html` resolves (reuse the pure detector) | A follow-up wave; the pure detector from W1 is directly reusable |

---

## 17. What this environment cannot verify (stated, not filled in)

- No live GitHub token and the network is blocked under vitest
  (`vitest.setup.ts` throws on real fetch), so the actual fetch+grade of the two
  real sample URLs is owner-walk only.
- No component renders under any test here, so there is no verification that the
  resolved grade displays correctly in GradingTab or the chat results surface -
  all UI findings are reading claims.
- Whether the two sample repos are public/readable with the configured token is
  owner-walk.

---

## 18. Measurements (every quantity -> command)

| Quantity | Value | Command |
|---|---|---|
| `extraction.ts` lines | 546 | `@(Get-Content src/lib/grade/extraction.ts).Count` and `wc -l` (agree) |
| `utils.ts` lines | 581 | `@(Get-Content src/lib/grade/utils.ts).Count` |
| `grading-chat-intake.ts` lines | 328 | `@(Get-Content src/app/actions/grading-chat-intake.ts).Count` |
| `submission-repo.ts` lines | 240 | `@(Get-Content src/lib/submission-repo.ts).Count` |
| `repo-content.ts` lines | 134 | `@(Get-Content src/lib/grade/repo-content.ts).Count` |
| `html`/`htm` are TEXT extensions | yes | `grep -n '"html"\|"htm"' src/lib/office-extract.ts` -> :26,:27 |
| engine.ts frozen server-only trails | 9, all -> lib/supabase | `runtime-import-graph.test.ts:671-711` (R-16) |
| no new grade-dir file-count canary | none found | `grep -rn readdirSync src --include=*.test.ts \| grep -i grade` -> only `grade-result-doors.wiring.test.ts` (caller scan, not a count) |
| owns-set test files | 12 behaviour + 4 scanner | command in section 15, output pasted |
