# Scope: deep LMS connectivity diagnostics (the next increment after robust-lms-diagnostics)

Owner request, verbatim: "add more robust diag around lms connectivity".
Author seat: loop-seat (Sonnet). READ-ONLY artifact: no production file was
edited. A fresh checker reads this before any consumer does, so every claim
below names the command or `file:line` that produced it, says what was opened,
and marks what was MEASURED here versus RECALLED from Node/OpenSSL
documentation. ASCII only, no emojis. Default ON; nothing ships dark.

Predecessor: `docs/robust-lms-diagnostics-scope.md` (shipped as 5f6b7a8a and
eb4be431, confirmed present: `git log --oneline` shows both on main). This
document does not restructure that one; its residuals are carried in section 14.

---

## 0. READ FIRST - two corrections to the request's premises

The dispatch said (a) fetch failures "in undici carry a `cause` with code
ENOTFOUND/ECONNREFUSED/..." and (b) the RIZE blocker is "almost certainly
owner-side host reachability, NOT a code defect". Opening the code and running
it contradicts both, and both change the design.

### 0.1 There is no undici and no `fetch` on this path

Every bearer-carrying Canvas call goes through `canvasFetch`
(`src/lib/canvas-fetch.ts:200`), which uses `node:https` + `node:dns`, by
design (header, `canvas-fetch.ts:12-17`; `undici` is deliberately not a
dependency). The error information that does exist is the `node:https`
`ClientRequest` `'error'` event and the `dns.promises.lookup` rejection. BOTH
ARE DISCARDED AT THE SOURCE:

| Where | file:line | What is thrown away |
|---|---|---|
| DNS lookup rejects or races the deadline | `canvas-fetch.ts:274-276` (`catch {` with no binding) | the `Error`, including `.code` (ENOTFOUND / EAI_AGAIN) |
| DNS answered with zero addresses | `canvas-fetch.ts:278-280` | (nothing to keep; a distinct fact: "resolved to nothing") |
| deadline already passed before DNS / before dial | `canvas-fetch.ts:264-266`, `:298-301` | which stage ran out of budget |
| request `'error'` event | `canvas-fetch.ts:436` `req.on("error", () => settle({ kind: "network-error" }))` | the `Error`: name, `.code`, `.cause`; also which socket events had fired |
| response stream `'error'` | `canvas-fetch.ts:432` | same |
| byte cap tripped | `canvas-fetch.ts:414-418` | recorded as the same generic `network-error` as a socket failure |
| `network-error` mapped to result | `canvas-fetch.ts:312-314` -> `unreachableAtDeadline` `:455-461` | everything; result is exactly `{ ok: false, kind: "unreachable" }` (type at `:154`) |
| result mapped to a throw | `canvas-fetch-response.ts:135-137` | throws the fixed literal `"Canvas did not respond."` |

Then the action layer sees only a string: `listCoursesAction`
(`src/app/actions/canvas-inbox.ts:75-89`) and `listCourseAssignmentsAction`
(`src/app/actions/repo-grades.ts:34-49`) return `err.message`. So today the
chain from socket to diagnostic carries ZERO bits of cause. The new "no
response" class (`chatSeamDiagnostic.ts:46`) can only say "something did not
answer".

The loss is DELIBERATE and documented: SEC9/E-UX4 (`canvas-fetch.ts:59-74`;
`docs/lms-credentials-acceptance-criteria.md:302-310`, `:701-705`) pads every
network-layer failure to the full deadline and collapses them to one message so
that a signed-in user's credential form cannot become a port scanner. The
design below keeps the padding and the fixed message byte-for-byte, and keeps
the cause OUT of every surface a non-owner can reach (section 4.4, fork F1).

### 0.2 There is a probable CODE defect on the same path, measured locally

`pinnedLookup` (`canvas-fetch.ts:342-346`) answers Node's socket layer in the
single-address form `callback(null, address, family)`. On Node >= 20 the
default is `autoSelectFamily: true`, and Node then calls the custom `lookup`
with `{ all: true }` and EXPECTS AN ARRAY. Reproduced on this machine (Node
v22.14.0) against a HEALTHY local TLS server, using the exact production
lookup form (Appendix A, case A0):

```
A0 prod lookup form, healthy server -> TypeError code=ERR_INVALID_IP_ADDRESS
   (lookup was called with {"hints":0,"all":true}; ev = ["socket"] only)
A1 same server, lookup honouring all -> HTTP 200
```

Under that failure `req.on("error")` fires, the error is discarded, and the
caller sees `Canvas did not respond.` after the FULL 15s padding - exactly the
shape of the owner's symptom, on every institution, not just RIZE.

What I could NOT determine (state, do not fill in):
- The Vercel runtime's Node version and whether autoSelectFamily is on there.
  `package.json` has no `engines` field (`grep -n "engines" package.json`
  returned nothing); `@types/node` is `^20` (`package.json:45`); no
  `vercel.json` runtime pin (`vercel.json` holds only `crons`). Next's server
  runtime does not set it (`grep -rl "autoSelectFamily" node_modules/next/dist`
  hit only edge-runtime bundles).
- Whether MCC (the one built-in institution) lists courses in production. If
  it does, production is NOT affected and the owner-side-host reading stands.
  The prior real log "List courses, MU, failure, Canvas did not respond."
  (`canvas-inbox.ts:58-60`) means at least TWO institutions have shown the
  symptom, which is weak evidence for a shared cause - not proof.
- The real-socket path has no unit test and cannot get one: the existing test
  states it "CANNOT prove that Node's real socket-connect internals actually
  honor the `lookup` option end to end" (`canvas-fetch.test.ts:186-190`), and a
  loopback server is refused by `validateLmsBaseUrl` before dialing
  (`canvas-fetch.test.ts:94-103`).

The OWNER DISCRIMINATOR (one action, no code): in production, open the From-LMS
picker for MCC (or any institution known to work). If MCC also returns "Canvas
did not respond", the lookup defect is live and RIZE is a bystander. After W1
ships, the new Cause column makes this unnecessary (`local-error` /
`ERR_INVALID_IP_ADDRESS` names it in one line).

The fix is two lines in the same function this increment already edits, and is
SAFE IN BOTH WORLDS (if production is unaffected, honouring `all` changes
nothing; when `options.all` is absent the old triple is still returned). It is
therefore in W1, not a separate row (fork F4).

---

## 1. Inventory: what exists, with file:line (opened, not recalled)

| Piece | file:line | Role in this increment |
|---|---|---|
| `canvasFetch`, `CanvasFetchResult` | `src/lib/canvas-fetch.ts:200`, `:151-154` | WRITE: capture facts at every failure site |
| `DEFAULT_TIMEOUT_MS = 15_000` | `canvas-fetch.ts:161` | unchanged; callers omit `timeoutMs` (`src/lib/canvas/listings.ts:42`) |
| `unreachableAtDeadline` (the SEC9 pad) | `canvas-fetch.ts:455-461` | unchanged; failure facts are captured BEFORE it |
| `performRequest` (socket, abort signal, byte cap) | `canvas-fetch.ts:360-444`; `AbortSignal.timeout` at `:403` | WRITE: track socket events, keep error facts |
| `canvasFetchResultToResponse` | `src/lib/canvas-fetch-response.ts:118-138` | WRITE: throw a typed error with the SAME message |
| `canvasError(status, inst)` (HTTP-status messages) | `src/lib/canvas-core.ts:101-115` | read-only; parsed by a pure classifier (no edit) |
| `resolveCanvasCredential` (source stored/env, 5s read bound, awaited failure record) | `src/lib/canvas-credentials.ts:107`, `:150-164`, `:189-228` (`:198-211`, `:220-225`) | read-only; the second resolution on the error path is a cost (section 2.3) |
| `resolveInstitutionByCode` (drops `source`) | `src/lib/canvas-core.ts:174-201` | read-only |
| `listCourses` -> `fetchCoursesForQuery` -> `canvasGet` | `src/lib/canvas/listings.ts:157-159`, `:103-127`; `listAssignments` `:217-245` | read-only; no catch/wrap between canvasGet and the action |
| `listCoursesAction` + `describeAttemptedCanvasHost` | `canvas-inbox.ts:75-89`, `:99-107` | WRITE (W2) |
| `listCourseAssignmentsAction` + duplicate helper | `repo-grades.ts:34-49`, `:55-63` | WRITE (W2) |
| third private host helper | `src/app/actions/live-messaging-enrollments.ts:32-38` | NOT touched (residual R3) |
| `classifyChatSeamFailure`, `CHAT_SEAM_FAILURE_CLASSES` (10 members) | `src/app/components/grading-chat/chatSeamDiagnostic.ts:21-32`, `:38-48` | NOT changed (fork F6); pinned only |
| `recordChatSeamSettled` (already threads `institution`, `host`) | `chatSeamDiagnostic.ts:91-110` | WRITE (W2): add cause/code/serverMs |
| `recordGradingDiagnosticEntry` args (host at `:78-79`, forwarded `:96`) | `src/app/components/grading/gradingDiagnosticLog.ts:62-96` | WRITE (W2) |
| `SessionDiagnosticEntry` (host at `:155-157`), `recordSessionDiagnosticEntry` (`:237-260`), CSV header (`:399`), CSV row (`:441-456`), `parseOneEntry` (`:516-547`) | `src/lib/session-diagnostic-log.ts` | WRITE (W2) |
| hook record sites | `useLmsSubmissionPicker.ts:88-101` (courses), `:111-123` (assignments) | WRITE (W2) |
| existing stored-credential probe | `src/lib/lms-credential-probe.ts:77-106` (10s, `/api/v1/users/self`), `lms-actions.ts:323-359` (`checkLmsCredentialConnectionAction`, STORED rows only, `getLmsCredentialSecret` at `:342`) | REUSED by W3; it cannot see env-sourced (owner) institutions |
| institution enumeration (owner: env + stored) | `src/app/actions/course-hub-integrations.ts:211-252` | REUSED by W3 |
| owner role signal on `requireUser()` | `course-hub-integrations.ts:172-173` (`identity.role === "owner"`); `requireAppOwner` `src/lib/supabase/auth.ts:408` | gate precedent |
| Diagnostics page + download section | `src/app/account/diagnostics/page.tsx:317`, `SessionLogSection.tsx` | W3 surface (page mount) |
| connection map | `src/lib/live-messaging/connection-map.ts:1-25` | configuration only (configured vs not-linked); NO reachability state. Not touched. |

---

## 2. Measured facts (each names its command)

### 2.1 Real error shapes of the `node:https` path (MEASURED, Node v22.14.0)

Command: `node appendix-a.mjs` (Appendix A; scratch, not committed; loopback
TLS servers with a throwaway self-signed cert, plus one documentation-range
address 192.0.2.1 for the black-hole case). Each row replicates the production
`https.request` options (`canvas-fetch.ts:391-404`: `servername`, pinned
`lookup`, `AbortSignal.timeout`). `ev` is the socket event sequence observed.

| Case | ev | error name / code | note |
|---|---|---|---|
| dns.lookup of a `.invalid` name | - | `Error` / `ENOTFOUND` | rejects, no request exists yet |
| A2 closed port | socket | `Error` / `ECONNREFUSED` | 1-56 ms |
| A3 self-signed cert, no CA | socket,connect | `Error` / `DEPTH_ZERO_SELF_SIGNED_CERT` | |
| A4 SNI/altname mismatch | socket,connect | `Error` / `ERR_TLS_CERT_ALTNAME_INVALID` | |
| A5 TLS up, no HTTP reply | socket,connect,secureConnect | `AbortError` / `ABORT_ERR`, `cause` = `TimeoutError` | abort at ~timeout |
| A6 TCP up, no TLS reply | socket,connect | `AbortError` / `ABORT_ERR`, `cause` = `TimeoutError` | abort at ~timeout |
| A7 reset on connect | socket,connect | `Error` / `ECONNRESET` | 2 ms |
| A8 closed mid-body | socket,connect,secureConnect | `Error` / `ECONNRESET`, delivered on the RESPONSE (`res` `'error'`), message "aborted" | production handles at `canvas-fetch.ts:432` |
| A9 black-holed address (SYN gets no reply) | socket ONLY | `AbortError` / `ABORT_ERR` | abort at ~timeout |
| A0 production lookup form | socket | `TypeError` / `ERR_INVALID_IP_ADDRESS` | the section 0.2 defect |

THE KEY MEASURED FACT: the three timeout flavours produce the IDENTICAL error
(`AbortError`/`ABORT_ERR`) and are told apart ONLY by which socket events had
fired (A9: none past `socket`; A6: `connect` but no `secureConnect`; A5:
`secureConnect`). So a connect-timeout (a firewall or allowlist silently
dropping the deployment's packets - the leading hypothesis for a host that
"returns nothing") versus a response-timeout (the host is up and hung) is
decidable only if `performRequest` tracks socket events. Naming the error code
alone would NOT distinguish them.

NOT reproduced here (named from Node/OpenSSL naming, RECALLED): `EAI_AGAIN`,
`ENODATA`, `EAI_NONAME`, `EHOSTUNREACH`, `ENETUNREACH`, `ETIMEDOUT`,
`CERT_HAS_EXPIRED`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`,
`SELF_SIGNED_CERT_IN_CHAIN`, `ERR_SSL_*`, `EPROTO`, `EPIPE`,
`ERR_STREAM_PREMATURE_CLOSE`. The taxonomy maps them, but the classifier has a
closed `unknown-network` fallback AND records the raw code token, so a
mis-mapped code is visible next increment rather than silently wrong.

### 2.2 Timing facts

- Closed port fails in ~1-56 ms; reset in ~2 ms; the three timeouts fire at the
  signal's timeout + ~16 ms (Appendix A `ms` column). With the SEC9 pad every
  one of these reaches the caller at the deadline, so `durationMs` (already
  recorded) carries NO information about which class occurred. The class must
  be captured before the pad (`failedAfterMs`).
- The owner's export shows `durationMs` 36404 for one picker course listing
  (`docs/robust-lms-diagnostics-scope.md` section 1); the dispatch cites ~28 s;
  `docs/BACKLOG.md:87` (G4-CANVASGET-TIMEOUT) cites ~37 s. I could not
  reconcile 28 vs 36 vs 37; they may be different attempts.

### 2.3 Why a failing call can exceed the 15 s deadline (arithmetic, from reading)

A single failing `listCoursesAction` call spends, in order:
1. `requireUser()` (`auth.ts:328`) - unmeasured.
2. `resolveCanvasCredential` #1 via `listCourses` (`listings.ts:158` ->
   `canvas-core.ts:189` -> `canvas-credentials.ts:189`): identity lookup, then
   the stored-credential read bounded to 5 s (`canvas-credentials.ts:107`,
   `:193`), then, when no stored row exists (always, for the env-configured
   owner), an AWAITED `recordLmsCredentialFailure` write
   (`canvas-credentials.ts:198-211`) that is NOT inside the 5 s race.
3. `canvasGet` -> `canvasFetch`: up to 15 s (`canvas-fetch.ts:161`), padded.
4. The catch branch re-runs the whole of step 2 as
   `describeAttemptedCanvasHost` -> `resolveInstitutionByCode`
   (`canvas-inbox.ts:99-107`): another identity lookup, another <=5 s read,
   another awaited write.

Bounded parts: 5 + 15 + 5 = 25 s before any unbounded Supabase call. Reaching
28-36 s needs only 3-11 s from the unbounded identity/record calls. I did not
measure those; this is a bound, not a diagnosis. Two consequences for the
design: (1) the host should be CARRIED from the failing request (it knows the
URL it dialed) so the error path stops paying for a second credential
resolution on exactly the slow case; (2) one server-side elapsed number
(`serverMs`) lets the next export say "client saw 36 s, the action spent 20 s"
and so separate cold-start/queue/transit time from server work.

---

## 3. Failure taxonomy (closed vocabulary, mapped to real error shapes)

Transport records three RAW FACTS (never a message): `phase`, `code`, `name`.
A pure leaf classifies facts -> `cause` (closed set). Nothing else crosses.

`phase` is derived from socket events tracked in `performRequest`:
`dns` (own `dnsPromises.lookup` stage, `canvas-fetch.ts:268-276`), `connect`
(no `connect` event yet), `tls` (connected, no `secureConnect`), `request`
(secure, no response head yet), `body` (response head seen, stream failed or
byte cap tripped).

| cause | facts that select it | measured / recalled | what it tells the owner |
|---|---|---|---|
| `dns-unresolved` | phase dns, code ENOTFOUND / ENODATA / EAI_NONAME, OR lookup returned zero addresses (`:278`) | ENOTFOUND measured; others recalled | the name does not resolve from this server (typo, or an internal-only / split-horizon name) |
| `dns-timeout` | phase dns, code EAI_AGAIN, OR our own "Deadline exceeded." race (`:483`, no code) | recalled / own code | the resolver never answered in time |
| `connect-refused` | phase connect, code ECONNREFUSED | measured | host reachable, nothing listening on that port |
| `connect-unreachable` | phase connect, code EHOSTUNREACH / ENETUNREACH / EADDRNOTAVAIL | recalled | no route from this server |
| `connect-timeout` | AbortError with phase connect (A9), OR ETIMEDOUT with phase connect | A9 measured | packets get no reply: a firewall, WAF or IP allowlist dropping this deployment is the usual cause. THE leading RIZE hypothesis |
| `tls-handshake-timeout` | AbortError with phase tls (A6) | measured | TCP accepted, TLS never completed (wrong port, plain HTTP, stalled middlebox) |
| `tls-certificate` | code in {DEPTH_ZERO_SELF_SIGNED_CERT, SELF_SIGNED_CERT_IN_CHAIN, UNABLE_TO_VERIFY_LEAF_SIGNATURE, UNABLE_TO_GET_ISSUER_CERT*, CERT_HAS_EXPIRED, CERT_NOT_YET_VALID, ERR_TLS_CERT_ALTNAME_INVALID} | DEPTH_ZERO + ALTNAME measured | certificate rejected; the raw `code` token says which (expired vs untrusted vs name mismatch) - three different fixes, one class |
| `tls-protocol` | phase tls, code EPROTO or ERR_SSL_* | recalled | not an HTTPS endpoint / unsupported protocol |
| `response-timeout` | AbortError with phase request or body (A5) | measured | host accepted the request and never replied: an app hang, not a network block |
| `connection-reset` | code ECONNRESET / EPIPE / ERR_STREAM_PREMATURE_CLOSE (A7, A8); ETIMEDOUT after connect | A7/A8 measured | peer closed the connection |
| `response-oversize` | byte cap tripped (`:414-418`), no error object | own code | host sent more than `MAX_RESPONSE_BYTES` (`:181`) |
| `local-error` | error name TypeError/RangeError, or code `ERR_*` outside ERR_TLS_*/ERR_SSL_*/ERR_STREAM_* | A0 measured | THIS SERVER could not make the request (the section 0.2 defect lands here). Not the host's fault |
| `unknown-network` | anything else | - | unmapped; the raw `code` token is still recorded |
| `http-rejected` | action error text starts "Canvas rejected the request" (`canvas-core.ts:106`) | own text | 401 or 403: reached Canvas, token refused |
| `http-404` / `http-NNN` | action error text `HTTP (\d{3})` (`canvas-core.ts:113`) or the 404 text (`:110`) | own text | reached something; it answered with that status |

HTTP-status-bearing responses are NOT transport failures: they complete the
exchange (`ok: true`, `canvas-fetch.ts:330`) and the callers throw
`canvasError` text. They are classified from that app-composed text by a pure
function, with a drift pin (section 8) rather than by editing `canvasError`.
The host-not-allowed refusals (`canvas-fetch.ts:217`, `:247`, `:251`, `:261`,
`:290`) keep the existing `Canvas request refused: <reason>` text and are NOT
given a closed class in this increment (residual R2).

`code` token: kept only if it matches `^[A-Z][A-Z0-9_]{2,39}$`; otherwise
dropped. This is the whole scrub: a hostile or surprising `Error.code`, any
`Error.message`, any URL, header or token can never enter the output.

---

## 4. Design

### 4.1 Transport capture (W1) - `src/lib/canvas-fetch.ts`

1. `CanvasFetchResult`'s unreachable branch gains one OPTIONAL field:
   `failure?: { phase; code?; name?; failedAfterMs; host }`. Optional so every
   test double that builds `{ ok: false, kind: "unreachable" }` still
   type-checks (`grades.test.ts:206`, `grading-queue.test.ts:110`,
   `discussion-topics.test.ts:118`, `canvas-fetch-response.test.ts:90`).
2. `host` = `parsed.host` of the URL actually dialed this hop (host only,
   includes a non-default port, never path/query/fragment).
3. `failedAfterMs` = `Date.now() - (deadline - timeoutMs)` at the moment of the
   REAL failure, taken before `unreachableAtDeadline` pads. The pad is
   unchanged; the result is still delivered at exactly the deadline.
4. Capture sites: the DNS `catch` (`:274`, bind the error), the empty-answer
   (`:278`), the two deadline-passed checks (`:264`, `:298`; phase = the stage
   about to run), `performRequest` (see 5), and the byte cap (`:414`).
5. `performRequest`: on the request's `'socket'` event attach
   `once('connect')` / `once('secureConnect')`; if the socket is already
   connected when assigned (`socket.connecting === false`, a reused keep-alive
   socket) treat connect and secure as already reached. Keep the error's
   `name` and `code` (allowlisted) and the phase at the moment of failure; an
   `AbortError` is a timeout of that phase. `'error'` on `req` and on `res`
   both feed the same fact. The outcome type becomes
   `{ kind: "network-error"; facts }`.
6. `pinnedLookup`: honour `options.all` - return
   `[{ address, family }]` when `all` is true, else the existing triple.
   (Section 0.2.)
7. NO behaviour change to: padding, redirects, SSRF checks, retry policy, byte
   cap, the `reason` strings.

### 4.2 The pure leaf (W1) - NEW `src/lib/canvas-network-failure.ts`

No imports (client-safe, so a source-text test can pin it independent of the
server graph). Exports: the closed `CANVAS_FAILURE_CAUSES` list;
`sanitizeFailureCode`; `factsFromError(err, phase)`;
`classifyNetworkFailure(facts) -> cause`; `describeFailureCause(cause, code?)`
(owner-facing copy table); `classifyHttpCause(message) -> cause | undefined`;
and `class CanvasTransportError extends Error` whose `message` is the existing
fixed literal and which carries `.failure`. Putting the error class in the leaf
(not in `canvas-core.ts`) matters: many tests `vi.mock("@/lib/canvas-core", ...)`
with a partial factory (`live-messaging-enrollments.test.ts` mocks only
`resolveInstitutionByCode`), and an `instanceof` against a symbol imported from
a partially mocked module throws.

### 4.3 The carrier (W1) - `canvas-fetch-response.ts`

`canvasFetchResultToResponse` (`:118-138`) throws
`new CanvasTransportError("Canvas did not respond.", result.failure)` for an
unreachable result. `message` is byte-identical, so every regex and test that
keys on the literal (`chatSeamDiagnostic.ts:46`, `course-intel` classification,
`bulk-course-message.ts:82`, `canvas-fetch-response.test.ts:89-90`) is
unaffected; `instanceof Error` still holds. A result without `failure` (every
existing test double) throws a `CanvasTransportError` with `failure` undefined,
or a plain `Error` - either is behaviourally the old path.

### 4.4 Who may see the cause (fork F1) - SEC9 preserved

Recommendation: the finer cause leaves the server ONLY to the app owner
(`identity.role === "owner"`, precedent `course-hub-integrations.ts:172-173`).

Why gate, concretely. A signed-in user can store a credential for a host H that
passed the E4 probe, then change H's DNS to an arbitrary public IP. Each picker
call would then dial that IP:port and, with an ungated cause, return
refused / timeout / certificate-error - a port-and-TLS scanner with no rate
limit (the SEC9 limiter covers only save/check, `lms-actions.ts:284`, `:338`).
The env-configured owner path cannot be abused that way (SEC13,
`canvas-credentials.ts:220-225`). The `host` is already shown to all users
(5f6b7a8a) and stays ungated.

Consequence, stated plainly: a NON-owner with a stored credential keeps today's
message plus host and gets no finer cause. The cause and the probe are owner
tooling.

The save-flow oracle stays closed: `toProbeExchange`
(`lms-credential-probe.ts:77-84`) builds a FRESH `{ ok:false, kind:"unreachable" }`
and does not forward `failure`; W1 adds a strict-equality test so that cannot
regress.

### 4.5 Action layer (W2) - NEW `src/lib/canvas-failure-report.ts`

One server helper replaces the two private duplicate host helpers
(`canvas-inbox.ts:99-107`, `repo-grades.ts:55-63`):

`reportCanvasFailure({ err, acronym, isOwner, startedAtMs })` returns
`{ error, attemptedHost?, networkFailure?, serverMs }`.

- host: `err.failure.host` when the error carries one (NO second credential
  resolution); otherwise fall back to the existing `resolveInstitutionByCode`
  try/catch that returns `undefined` on any failure (same never-throws rule as
  `canvas-inbox.ts:91-98`).
- `error`: unchanged format for non-owners: `base (dialed host)`. For the owner
  with a transport failure: `Canvas did not respond. <cause sentence> (dialed
  host)`.
- `networkFailure`: `{ cause, code?, phase, failedAfterMs }`, owner only.
  HTTP-status causes (`classifyHttpCause(base)`) are NOT gated: they come from
  app-composed text already shown to every user.
- `serverMs`: `Date.now() - startedAtMs`, ungated (padded; no oracle).

Both actions capture `startedAtMs` and `isOwner` right after `requireUser()`
(guard stays the FIRST statement - the guard ratchet scans for it,
`action-guard-coverage.test.ts:61`). Return types gain optional fields only:
`{ error: string; attemptedHost?: string; networkFailure?: ...; serverMs?: number }`.

The copy sentences must keep `classifyChatSeamFailure(error) === "no response"`:
that function tests `time(d)?[ -]?out|deadline|aborted` (`:41`) and
`limit|too many` (`:42`) and `too large|exceed|oversize|budget` (`:43`) BEFORE
the no-response branch (`:46`). So the copy never contains "timed out",
"time out", "limit", "exceed", "deadline", "aborted", "budget", "too large".
A table-driven test pins this for every cause (AC-11).

### 4.6 Diagnostic entry (W2)

`SessionDiagnosticEntry` gains three OPTIONAL fields, omitted when absent
(never an explicit `undefined`, matching `:247-251`):
`cause?: string`, `code?: string`, `serverMs?: number`.

- Stored via `recordSessionDiagnosticEntry` with the token rule: `cause` must
  match `^[a-z0-9-]{1,40}$`, `code` must match `^[A-Z][A-Z0-9_]{2,39}$`,
  otherwise the field is omitted. This is a LOCAL regex in
  `session-diagnostic-log.ts` (that module is browser-only and must not import
  server code, header `:37-42`; and the client-boundary tests restrict
  `canvas*` imports). Scrub-then-cap is not applicable to closed-shape tokens;
  the regex is the stricter control.
- CSV: three columns APPENDED after Host: `"Cause"`, `"Code"`, `"Server (ms)"`
  (`ENTRY_CSV_HEADER` `:399`, row `:441-456`). JSON export already spreads the
  entry; `parseOneEntry` (`:516-547`) reads the three keys optionally, the
  `host`/`durationMs` precedent at `:539-545`, so exports without them still
  parse.
- Wiring: `gradingDiagnosticLog.ts:62-96` and `chatSeamDiagnostic.ts:63-110`
  forward the three fields; the hook passes them at both record sites from
  `r.networkFailure` / `r.serverMs`, AFTER `operation` (the frozen regex
  `lmsPicker.wiring.test.ts:25,:45` needs `operation` first).
- `classifyChatSeamFailure` and `CHAT_SEAM_FAILURE_CLASSES` are NOT changed
  (fork F6). `error` stays the coarse `no response`; `cause` is the fine class.

### 4.7 Picker copy (W2)

Owner sees, for example (ASCII): `Canvas did not respond. No reply to the
connection attempt; a firewall or IP allowlist may be dropping this server
(dialed canvas.rize.education).` Non-owner sees `Canvas did not respond.
(dialed canvas.rize.education)` as today. Path:
action string -> `errors.courses` (`useLmsSubmissionPicker.ts:162`) ->
`lmsFieldIndication` verbatim passthrough (`lmsPickerState.ts:85`) ->
`helperText`. No hook, indication or component change is needed for the
message; the hook change is only the three diagnostic fields.

### 4.8 Timing (item 2) - decision

Add exactly two numbers; decline the rest:
- `failedAfterMs` (transport, owner-gated with the cause): real time to the
  underlying failure, before the pad. Shown in the probe result and in
  `networkFailure`; NOT a diagnostic-entry column (the cause already says
  instant-vs-hang).
- `serverMs` (action, ungated): total action time, entry column. It is the one
  number that turns the unexplained 28/36 s into "X in the server, Y elsewhere"
  (section 2.3).
- DECLINED: separate connect-vs-first-byte milliseconds. The phase encodes it
  discretely and testably (`connect-timeout` / `tls-handshake-timeout` /
  `response-timeout`); millisecond splits would need per-socket timestamps and
  add test surface for no extra decision.

### 4.9 The connectivity probe (item 3) - IN this increment, as W3 (fork F3)

Why in, not follow-up: it is the only instrument that answers "why does RIZE
not respond" proactively, in one click, without grading a submission, and it is
mostly reuse: `canvasFetch`, `/api/v1/users/self` (the E4 probe URL,
`lms-credential-probe.ts:99`), the 10 s bound (`:55`), the outcome classifier
(`lms-credential-probe-outcome.ts`) and the owner enumeration
(`course-hub-integrations.ts:211-252`). The existing check-connection cannot do
this job: it reads STORED rows only (`lms-actions.ts:342`) and flattens
unreachable (`:197-198`); the owner's institutions are env-configured.

Shape:
- NEW `src/lib/canvas-connectivity-probe.ts`: given a resolved credential,
  call `canvasFetch(baseUrl + "/api/v1/users/self", { timeoutMs: 10_000 }, { token })`,
  time it, and return
  `{ institution, host, source, verdict, stagesReached[], httpStatus?, latencyMs, failedAfterMs?, cause?, code?, hint, runtime }`.
  `verdict` in `connected | token-rejected | not-canvas | http-error | refused-by-host-rules | network`.
  `refused-by-host-rules` carries the existing `reason` string (our own text, as
  `lms-actions.ts:196` already returns it).
- `stagesReached` (answers "resolved? connected? TLS ok? HTTP?"): dns failure
  -> []; connect -> [dns]; tls -> [dns, connect]; request -> [dns, connect,
  tls]; body or an `ok: true` exchange -> [dns, connect, tls, http].
- `runtime`: `{ node: process.version, autoSelectFamily: net.getDefaultAutoSelectFamily() }`.
  Both are non-secret and resolve section 0.2's "Vercel Node version unknown"
  by MEASURING it in production (residual R1).
- NEW `src/app/account/diagnostics/connectivity-actions.ts` ("use server"):
  `probeLmsConnectivityAction(institution)`; FIRST statement `await requireAppOwner()`
  inside a try, `{ kind: "not-authorized" }` on throw (shape of
  `lms-actions.ts:326-331`). One institution per call (fork F7), code normalised
  and shape-checked (`^[A-Z][A-Z0-9]{0,31}$`), credential from
  `resolveCanvasCredential(code)` (so `source` is known), unknown/uncredentialed
  returns `{ kind: "no-credential" }` without detail (the E6/E7 single message
  rule). The input is an institution CODE, never a URL: the probe can only dial
  an owner-configured or owner-stored host, so it is not a port scanner. No DB
  write, no SEC9 limiter (owner-only, owner hosts, no external-host oracle);
  worst case per call is ~5 s credential read + 10 s probe, well under the 60 s
  cap.
- NEW `src/app/account/diagnostics/ConnectivitySection.tsx` + a 3-line mount in
  `page.tsx` next to `SessionLogSection` (`page.tsx:317`). One control: "Test
  connections" - it lists configured institutions with the existing
  `listConfiguredInstitutionsAction`, probes them one after another (a loop in
  the component, so no server call approaches the 60 s cap), renders a table
  (Institution, Host, Result, Stages reached, HTTP, Latency, Hint), and records
  one `diagnostics`-surface entry per probe (`operation: "probe_lms_connectivity"`)
  so the downloadable log carries it. There is no textbox/select/checkbox, so
  the persist-control-state rule has nothing to persist (stated, not skipped).
  A non-owner who loads the page gets the "owner only" line from
  `not-authorized`.

Hints are copy keyed by `cause`, labelled "likely meaning", never asserted as
fact.

---

## 5. Forks and recommendations (all acted on; the owner may redirect)

| Fork | Options | Recommendation (built in this scope) | Cost if wrong |
|---|---|---|---|
| F1 who sees the fine cause | owner only / all users / nobody | OWNER ONLY (section 4.4) | non-owner instructors get no finer text; loosening later is a one-line `isOwner` change |
| F2 how the cause crosses the lib boundary | typed error with identical message / suffix in message / module-level side channel | typed `CanvasTransportError`, message byte-identical | none: a plain `Error` still works everywhere; a suffix would have changed the literal 5+ tests and regexes key on |
| F3 probe in this increment | in (W3) / follow-up | IN, as the last wave; W1+W2 are independently useful and shippable | W3 is separable: dropping it leaves W1+W2 whole |
| F4 fix `pinnedLookup` `all` | W1 / separate row | W1 (safe in both worlds) | none; if production is unaffected the change is a no-op |
| F5 where fine fields live | 3 new optional entry fields + CSV columns / fold into `error` | 3 fields (`cause`, `code`, `serverMs`) | folding would have mixed vocabularies in `error` and broken its fixed-class contract (`chatSeamDiagnostic.ts:7-10`) |
| F6 touch `classifyChatSeamFailure` catch-all | reclassify / leave | LEAVE. The catch-all `"refused"` is asserted at `chatSeamDiagnostic.test.ts:27-28` and used by 5 other call sites (`grep -rn classifyChatSeamFailure src` -> GradingChatPanel.tsx:351, useContinuousGradingRun.ts:330,417,561,633) | the coarse class stays imprecise for HTTP errors; the new `cause` column is where precision lives |
| F7 probe granularity | one institution per call, client loops / server loops all | per call | a server loop over N institutions x 10 s risks the 60 s cap |
| F8 duplicate host helpers | consolidate 2 of 3 now / all 3 / none | consolidate the two in files W2 already edits into `canvas-failure-report.ts`; leave `live-messaging-enrollments.ts` (R3) | the third stays duplicated |

---

## 6. Write set and waves

Waves run SEQUENTIALLY (W1 -> W2 -> W3): W2 imports W1's leaf and error class;
W3 consumes W2's entry fields. Disjointness computed, not eyeballed - command:
`sort wA.txt wB.txt | uniq -d` over the three lists below. Output: W1xW2 empty,
W1xW3 empty, W2xW3 = `src/lib/session-diagnostic-log.ts` and
`src/lib/session-diagnostic-log.test.ts` (which is why W2 and W3 are not
parallel).

### W1 - transport capture, leaf, carrier, lookup fix (no UI, no schema)
Production: `src/lib/canvas-network-failure.ts` (NEW),
`src/lib/canvas-fetch.ts`, `src/lib/canvas-fetch-response.ts`.
Tests: `src/lib/canvas-network-failure.test.ts` (NEW), `src/lib/canvas-fetch.test.ts`,
`src/lib/canvas-fetch-response.test.ts`, `src/lib/lms-credential-probe.test.ts`.
Must also run (read-only dependents of the changed result/throw):
`src/lib/canvas/grades.test.ts`, `src/lib/canvas/grading-queue.test.ts`,
`src/lib/canvas/discussion-topics.test.ts`,
`src/lib/canvas-client-boundary.test.ts` (+ `.transitive`, `.runtime-graph`),
`src/lib/course-intel/connection.test.ts`, `src/app/actions/bulk-course-message.test.ts`,
`src/lib/canvas-credentials.exports.test.ts`.
Unconditional: `src/file-size-ceiling.structure.test.ts`,
`src/source-bytes.structure.test.ts`, `src/lib/no-emojis.test.ts`,
`src/tools/strip-comments-agreement.structure.test.ts`.

### W2 - action report, diagnostic fields, hook wiring
Production: `src/lib/canvas-failure-report.ts` (NEW),
`src/app/actions/canvas-inbox.ts`, `src/app/actions/repo-grades.ts`,
`src/lib/session-diagnostic-log.ts`,
`src/app/components/grading/gradingDiagnosticLog.ts`,
`src/app/components/grading-chat/chatSeamDiagnostic.ts`,
`src/app/components/grading-chat/useLmsSubmissionPicker.ts`.
Tests: `src/lib/canvas-failure-report.test.ts` (NEW),
`src/app/actions/lms-dialed-host.test.ts`, `src/lib/session-diagnostic-log.test.ts`,
`src/app/components/grading/gradingDiagnosticLog.test.ts`,
`src/app/components/grading-chat/chatSeamDiagnostic.test.ts`,
`src/app/components/grading-chat/chatSeamDiagnostic.wiring.test.ts`,
`src/app/components/grading-chat/lmsPicker.wiring.test.ts`.
Must also run: `src/app/actions/canvas-inbox.guard.test.ts`,
`src/app/actions/repo-grades.guard.test.ts`,
`src/app/actions/action-guard-coverage.test.ts`,
`src/app/actions/action-guard-coverage-github-cohort.test.ts`,
`src/app/actions/wholesale-auth-mock-population.structure.test.ts`,
`src/app/actions/live-messaging-enrollments.test.ts` (third site, untouched),
`src/app/components/content-tab/contentDiagnosticLog.test.ts`,
`src/app/components/live-messaging/messagingDiagnosticLog.test.ts`,
`src/lib/action-route-response.test.ts`, plus the W1 unconditional four.
`canvas-inbox.ts` is the file to watch for the ceiling (914 lines, section 10).

### W3 - connectivity probe (server action, lib, section, mount)
Production: `src/lib/canvas-connectivity-probe.ts` (NEW),
`src/app/account/diagnostics/connectivity-actions.ts` (NEW),
`src/app/account/diagnostics/ConnectivitySection.tsx` (NEW),
`src/app/account/diagnostics/page.tsx` (mount, ~3 lines),
`src/lib/session-diagnostic-log.ts` (the `diagnostics` coverage sentence only,
`:96-97`, so the download states probes are covered).
Tests: `src/lib/canvas-connectivity-probe.test.ts` (NEW),
`src/app/account/diagnostics/connectivity-actions.test.ts` (NEW),
`src/app/account/diagnostics/ConnectivitySection.wiring.test.ts` (NEW),
`src/app/actions/action-guard-coverage.test.ts` (add the action to `OWNER_ONLY`,
`:296`; the recursive collector already finds colocated actions, its own
comment `:70-80`), `src/lib/session-diagnostic-log.test.ts` (coverage text, if
pinned - run it to find out).
Must also run: the W2 guard canaries and the W1 unconditional four.

Gate command for every wave (two or more paths -> the wrapper, never raw
vitest), shown for W1; W2/W3 substitute their lists:
`npm run test:paths src/lib/canvas-network-failure.test.ts src/lib/canvas-fetch.test.ts src/lib/canvas-fetch-response.test.ts src/lib/lms-credential-probe.test.ts src/lib/canvas/grades.test.ts src/lib/canvas/grading-queue.test.ts src/lib/canvas/discussion-topics.test.ts src/lib/canvas-client-boundary.test.ts src/lib/canvas-client-boundary.transitive.test.ts src/lib/canvas-client-boundary.runtime-graph.test.ts src/lib/course-intel/connection.test.ts src/app/actions/bulk-course-message.test.ts src/lib/canvas-credentials.exports.test.ts src/file-size-ceiling.structure.test.ts src/source-bytes.structure.test.ts src/lib/no-emojis.test.ts src/tools/strip-comments-agreement.structure.test.ts`
then the full `npm test`, then `npx tsc --noEmit` (single caller), then
`npm run lint` (pass = exit 0 and no NEW warning in the wave's files; do not
pin a count), then `npm run build` and grep for the `Compiled successfully`
line (the exit code is not the gate, `docs/loop/this-repo.md` section 1;
`next build` is the only gate that catches a non-async export in a
"use server" file, which matters for W3's new action file).

---

## 7. Acceptance criteria (each: object / instrument / direction of failure)

All network behaviour is exercised through MOCKS of `node:dns` and `node:https`
(the existing harness, `canvas-fetch.test.ts:18-59`) or of `canvasFetch`
itself; NEVER a real socket (vitest.setup.ts blocks `fetch` and the repo rule
forbids it).

W1
- AC-1 DNS failure keeps its cause and stays padded. OBJECT: result of
  `canvasFetch` when `lookupMock` rejects with
  `Object.assign(new Error("getaddrinfo ENOTFOUND canvas.example.edu"), { code: "ENOTFOUND" })`.
  INSTRUMENT: `canvas-fetch.test.ts` (fake timers, as `:380-408`). PASS:
  `failure` is `{ phase: "dns", code: "ENOTFOUND", host: "canvas.example.edu" }`
  plus a numeric `failedAfterMs` near 0, AND the promise is unsettled until the
  deadline. FAILS IF: `failure` absent or `code` lost, OR the pad is removed
  (settles early).
- AC-2 Refused. OBJECT: `requestMock` returns a `FakeClientRequest` that emits
  `'socket'` (an EventEmitter socket) then `'error'` carrying `code:
  "ECONNREFUSED"`. PASS: `failure.phase === "connect"` and `code ===
  "ECONNREFUSED"`. FAILS IF: phase is anything else.
- AC-3 Three timeouts are distinct. OBJECT: the same `AbortError` (`name:
  "AbortError", code: "ABORT_ERR"`) emitted after (a) `'socket'` only, (b)
  `'socket'`,`'connect'`, (c) `'socket'`,`'connect'`,`'secureConnect'`.
  PASS: phases `connect`, `tls`, `request` respectively; classified causes
  `connect-timeout`, `tls-handshake-timeout`, `response-timeout`. FAILS IF:
  any two collapse (the classifier ignores phase).
- AC-4 Certificate. OBJECT: error `code: "DEPTH_ZERO_SELF_SIGNED_CERT"` after
  `'connect'`. PASS: cause `tls-certificate`, `code` retained. A second case,
  `ERR_TLS_CERT_ALTNAME_INVALID`, also `tls-certificate` (same class, different
  code token).
- AC-5 Distinctness table (the owner's required test). OBJECT:
  `classifyNetworkFailure` over a fixture table covering ENOTFOUND, EAI_AGAIN,
  ECONNREFUSED, EHOSTUNREACH, the three AbortError phases, a cert code,
  ECONNRESET, byte-cap, TypeError `ERR_INVALID_IP_ADDRESS`, and an unmapped
  code. INSTRUMENT: `canvas-network-failure.test.ts`. PASS: each row equals its
  expected cause AND the set of causes over the rows named in the owner's
  request (ENOTFOUND, ECONNREFUSED, connect-timeout, response-timeout, cert)
  has size 5 (pairwise distinct). FAILS IF: any pair maps to the same cause, or
  the unmapped code does not land on `unknown-network`.
- AC-6 Scrub. OBJECT: `JSON.stringify(failure)` for errors whose `message`
  contains the credential `1234~abcdefghij` and `?access_token=secret`, and
  whose `code` is the hostile string `"ECONNREFUSED 10.0.0.1 token=abc"`.
  PASS: output contains neither substring and the hostile `code` is dropped (not
  truncated). FAILS IF: any message text or non-token code appears.
- AC-7 Carrier. OBJECT: `canvasFetchResultToResponse({ ok:false, kind:"unreachable", failure })`.
  PASS: throws an `Error` whose `message === "Canvas did not respond."`,
  `instanceof CanvasTransportError`, `.failure` deep-equal; and the
  failure-less input throws the SAME message. FAILS IF: message differs by one
  character.
- AC-8 Lookup honours `all`. OBJECT: the `lookup` captured from `requestMock`
  (`canvas-fetch.test.ts:166-204` idiom). PASS: called with `{ all: true }` it
  yields `[null, [{ address, family }]]`; called with `{ family: 0 }` it still
  yields `[null, address, family]`. FAILS IF: the `all` call yields the triple
  (red today - this is the section 0.2 defect).
- AC-9 SEC9 not regressed. OBJECT: `probeLmsCredential` with `canvasFetch`
  mocked to return an unreachable result that HAS `failure`. INSTRUMENT:
  `lms-credential-probe.test.ts`. PASS: result `toStrictEqual({ kind: "unreachable" })`.
  FAILS IF: any field of `failure` appears on the outcome.

W2
- AC-10 Owner gating. OBJECT: `listCoursesAction("RIZE")` with `listCourses`
  mocked to reject `new CanvasTransportError("Canvas did not respond.", {phase:"connect", host:"rize.instructure.com", ...})`.
  INSTRUMENT: `lms-dialed-host.test.ts` extended (real `requireUser`, as `:26-58`).
  PASS (owner row): result has `networkFailure.cause === "connect-timeout"` and
  `error` contains the cause sentence and `(dialed rize.instructure.com)`.
  PASS (instructor row, the existing `userRow()` at `:31-46`): result `toEqual`
  `{ error: "Canvas did not respond. (dialed rize.instructure.com)", attemptedHost: "rize.instructure.com", serverMs: expect.any(Number) }`
  with NO `networkFailure` key. FAILS IF: a non-owner receives `networkFailure`
  or the finer sentence. The two existing assertions at `:77-82` and `:88`
  must be adjusted for the added `serverMs` key (use `toMatchObject`) - that is
  the only change to existing assertions.
- AC-11 Copy cannot be mis-classified. OBJECT: every sentence in
  `describeFailureCause`'s table. PASS: `classifyChatSeamFailure("Canvas did not respond. " + sentence) === "no response"`
  for ALL causes, and no sentence contains `?`, `/`, `=`, or a digit run of 4+.
  FAILS IF: a sentence trips an earlier branch (for example gains "timed out").
- AC-12 No re-resolution when the host is carried. OBJECT: call count of the
  `resolveInstitutionByCode` mock on the error path. PASS: 0 when the error
  carries `failure.host`; exactly 1 when it does not (fallback), and when that
  call rejects the result is the bare message with `attemptedHost: undefined`.
  FAILS IF: it re-resolves when the host was carried.
- AC-13 HTTP causes. OBJECT: `classifyHttpCause` over the REAL output of
  `canvasError(status, inst)` for 401, 403, 404, 429, 500, 503. PASS: 401/403 ->
  `http-rejected`; 404 -> `http-404`; others -> `http-<status>`. This is the
  drift pin between the message text and the parser. FAILS IF: any status maps
  wrongly or to `undefined`.
- AC-14 Entry fields. OBJECT: the recorded `SessionDiagnosticEntry`. INSTRUMENT:
  `chatSeamDiagnostic.test.ts` + `session-diagnostic-log.test.ts`. PASS:
  `recordChatSeamSettled({... cause:"connect-timeout", code:"ABORT_ERR", serverMs:20100})`
  yields those exact fields; with none supplied `Object.keys(entry)` contains
  none of the three (omitted, not `undefined`); a hostile `cause`
  (`"dns token=abc"`) is omitted; JSON round-trips them; a FROZEN LITERAL old
  export (no such keys) still parses; CSV header ends `"Host","Cause","Code","Server (ms)"`
  and the tail assertions (`session-diagnostic-log.test.ts:611, :612, :642,
  :673-676`) are updated to the new column count. FAILS IF: a column is
  missing from either format, or a field is written as explicit `undefined`.
- AC-15 Hook wiring (source-text, no render exists). OBJECT: `useLmsSubmissionPicker.ts`
  source. INSTRUMENT: `lmsPicker.wiring.test.ts`. PASS: both
  `recordChatSeamSettled({ operation: ...` sites still match the
  operation-first regex (`:25`, `:45`) AND each passes `cause`, `code`,
  `serverMs` sourced from `r.networkFailure` / `r.serverMs`; `classifyChatSeamFailure(r.error)`
  still present (`:26`). FAILS IF: either site omits a field.

W3
- AC-16 Owner gate and no dial for a non-owner. OBJECT: `probeLmsConnectivityAction`
  with a non-owner session. INSTRUMENT: `connectivity-actions.test.ts` (real
  `requireAppOwner` with the targeted-mock idiom,
  `live-messaging-enrollments.test.ts:1-60`). PASS: `{ kind: "not-authorized" }`
  AND the `canvasFetch` mock was called 0 times. FAILS IF: the probe runs for a
  non-owner. Plus `action-guard-coverage.test.ts` `OWNER_ONLY` contains the
  action (its `requireAppOwner` regex check, `:503`).
- AC-17 Per-class result. OBJECT: `probeCanvasConnectivity` with `canvasFetch`
  mocked per fixture. PASS: `connected` (200 + `{id}` JSON) -> stages
  `[dns,connect,tls,http]`; 401 -> `token-rejected`; 200 HTML -> `not-canvas`;
  503 -> `http-error` with `httpStatus: 503`; unreachable with `phase:"connect"`
  -> `network`, `cause: "connect-timeout"`, stages `[dns]`; `host-not-allowed`
  -> `refused-by-host-rules` with the `reason` text. FAILS IF: any stage list
  or verdict differs.
- AC-18 No leak. OBJECT: `JSON.stringify(result)` for every fixture, with a
  credential whose baseUrl is `https://rize.example.edu/some/path?x=1` and token
  `1234~abcdefghij`. PASS: contains neither the token, nor `/some/path`, nor
  `?x=1`, nor `https://`; `host` is `rize.example.edu` only. FAILS IF: any
  appears. Also asserts `runtime.node` is a `v`-prefixed string.
- AC-19 Reachability (the surface is a layer). OBJECT: `page.tsx` and
  `ConnectivitySection.tsx` source. INSTRUMENT: `ConnectivitySection.wiring.test.ts`.
  PASS: `page.tsx` imports and renders `ConnectivitySection`; the section calls
  `probeLmsConnectivityAction` and `recordSessionDiagnosticEntry` with
  `surface: "diagnostics"`. FAILS IF: any link is absent (the green-but-dead
  case). This is a reading claim: no component is rendered by any test here.

All waves
- AC-20 Ceiling and bytes. OBJECT: whole `src/` tree. INSTRUMENT:
  `file-size-ceiling.structure.test.ts`, `source-bytes.structure.test.ts`.
  FAILS IF: any file exceeds 1000 lines or gains a BOM/control byte.

---

## 8. Structure pins and sabotage (the instruments must be able to fail)

Pins (source-text, because no component renders):
- `canvas-network-failure.ts` has no `import` lines (client-safe leaf).
- `canvas-fetch.ts` never passes an `Error`'s `.message` into the failure
  object: pin that the facts builder reads only `name` and `code`.
- `canvas-fetch-response.ts` still contains the literal
  `"Canvas did not respond."` and `"Canvas request refused: "`.
- `lms-credential-probe.ts` still builds its unreachable exchange as a fresh
  literal (`toProbeExchange`).
- the hook keeps `operation` first (`lmsPicker.wiring.test.ts:25,:45`).
- every `describeFailureCause` sentence passes AC-11.

Sabotage the test-author must design (each mutation must turn a named test
red; apply by `cp` backup, never `git checkout` - MEMORY
sabotage-restore-needs-a-copy):
1. delete the `unreachableAtDeadline` pad call on the DNS branch -> AC-1 red.
2. classify `ECONNREFUSED` as `unknown-network` -> AC-2 and AC-5 red.
3. ignore `phase` when classifying `AbortError` -> AC-3 and AC-5 red.
4. make `pinnedLookup` always return the triple -> AC-8 red.
5. let the facts builder copy `err.message` -> AC-6 red.
6. attach `networkFailure` regardless of role -> AC-10 red.
7. re-resolve the host unconditionally -> AC-12 red.
8. add "timed out" to one copy sentence -> AC-11 red.
9. forward `failure` in `toProbeExchange` -> AC-9 red.
10. drop `requireAppOwner` from the probe action -> AC-16 red and the guard
    ratchet red.
11. have the probe return `baseUrl` -> AC-18 red.
12. remove the page mount -> AC-19 red.

---

## 9. Security review

- No secret/PII path: the failure object is `phase` (enum), `code` (regex
  token), `name` (enum), `failedAfterMs` (number), `host` (host only). No
  `Error.message`, URL, header, body or token field exists (AC-6, AC-18).
- SEC9 port-scan oracle: kept closed for non-owners (section 4.4) and for the
  save flow (AC-9). The padding is untouched. The cause is returned only where
  the credential is owner-controlled.
- SEC4 (no upstream text in errors): the thrown message is still the fixed
  literal; the typed error adds structured fields, not text.
- Probe: owner-gated by `requireAppOwner` as the first statement (not the
  deprecated `requireOwner`, which is `requireUser`, `auth.ts:451-453`); takes
  an institution CODE only, so it cannot be pointed at an arbitrary host;
  resolves through `resolveCanvasCredential` so a non-owner could not reach env
  credentials even if the gate regressed (SEC13); returns host only; makes one
  read-only GET to `/api/v1/users/self`; no persistence.
- E-ARCH3 export surface: `canvas-credentials.ts` is not edited, so
  `canvas-credentials.exports.test.ts` is unaffected. The probe imports
  `resolveCanvasCredential` (already exported and already used by
  `canvas-core.ts:30`).
- Known residual leak in an adjacent path (NOT introduced here, found while
  reading): a 200 response from a host that is not Canvas makes
  `response.json()` throw a `SyntaxError` whose message can quote the start of
  the foreign body (`listings.ts:117`), and the action returns `err.message`
  verbatim (`canvas-inbox.ts:82`). Recorded as R4; the probe does not parse a
  body for this reason (it reuses `classifyCanvasProbeOutcome`).
- Real-socket behaviour (TLS verification, SNI) is unchanged; no new egress
  (the probe dials the same configured hosts the picker already dials).

---

## 10. Ceiling notes

Command for every size: `wc -l <file>` (Bash). `docs/loop/this-repo.md` section 3
records `wc -l` and `@(Get-Content).Count` agreeing on 13 measured files;
`Measure-Object -Line` is not used. The enforced gate is
`src/file-size-ceiling.structure.test.ts` (LIMIT 1000, `:41`).

| File | Now (`wc -l`) | Expected change | Risk |
|---|---|---|---|
| `src/app/actions/canvas-inbox.ts` | 914 | about -6 net (private helper `:91-107` removed, catch grows a few lines) | none; watch it |
| `src/app/actions/repo-grades.ts` | 96 | about -4 net | none |
| `src/lib/canvas-fetch.ts` | 490 | about +90 | none (<600) |
| `src/lib/canvas-fetch-response.ts` | 161 | +6 | none |
| `src/lib/session-diagnostic-log.ts` | 557 | about +40 (W2) | none |
| `src/lib/session-diagnostic-log.test.ts` | 797 | about +70 | none (<900) |
| `src/lib/canvas-fetch.test.ts` | 446 | about +130 | none (<600) |
| `src/app/components/grading-chat/useLmsSubmissionPicker.ts` | 171 | +6 | none |
| `src/app/account/diagnostics/page.tsx` | 445 | +3 | none |

No file is near the wall; the unconditional ceiling test still runs every wave.

---

## 11. For loop-ac (not rulings)

- Diagnostics representation (DEV_LOOP.md, 2026-10-11): this increment IS the
  diagnostic. What it reports: `cause`, `code`, `serverMs`, `host`,
  `institution` on every picker listing failure, and one `diagnostics`-surface
  entry per probe. The failure it makes visible: connect-timeout (packets
  dropped) vs response-timeout (host hung) vs DNS vs refused vs certificate vs
  OUR OWN socket setup failing (`local-error`).
- Leverage claim: the probe + typed cause is observability a chat with an LLM
  cannot provide (it requires the deployment's own view of the network). Class:
  GUARANTEED/observability per `docs/loop/leverage.md` - the author did not
  re-read that file; loop-ac owns the exact class and the removal test.
- UX: one control on an existing owner page; the picker change is copy only.

---

## 12. What could not be determined here (state, do not fill in)

- Vercel's Node version and whether the section 0.2 defect is live in
  production. W3's `runtime` field measures it; the MCC discriminator answers it
  today.
- Whether RIZE's host is dropping Vercel's traffic. The probe plus the
  `connect-timeout` cause is the instrument; nothing here can observe RIZE.
- The real-socket path cannot be unit-tested (SSRF rules refuse loopback). The
  only real-socket evidence is the scratch harness in Appendix A.
- No component renders in any test: `ConnectivitySection` and the picker copy
  are verified by reading and by source-text wiring tests only.
- No `.env`, no network: no claim about a real Canvas response, a real
  Supabase latency (section 2.3 is a bound), or a deployed build.
- The 28 s vs 36 s vs 37 s discrepancy (section 2.2).

---

## 13. Residual register (owner / instrument / measuring step)

| ID | Residual | Owner | Instrument | Step that measures it |
|---|---|---|---|---|
| R1 | Is the `pinnedLookup` defect live in production, and was it RIZE's cause? | repo owner | MCC picker in prod, or the W3 probe `runtime` + `cause` for RIZE | first prod picker/probe call after W1 (W2/W3 for the readout): `local-error` + `ERR_INVALID_IP_ADDRESS` before the fix, `connect-timeout` or other after |
| R2 | `host-not-allowed` refusals (incl. cross-origin redirect, `canvas-fetch.ts:251`) have no closed cause; they classify "refused" via the catch-all | whoever next revises the taxonomy | a `refusal` token on the result + `classifyChatSeamFailure` case | next increment touching `canvas-fetch.ts`; measured by a test per refusal site |
| R3 | `live-messaging-enrollments.ts:32-38` keeps a third private host helper and gets no cause | next chunk touching that file | `grep -rn "function attemptedCanvasHost\|function describeAttemptedCanvasHost" src` returns only `canvas-failure-report`'s | extract-and-adopt in that chunk |
| R4 | Foreign-host JSON `SyntaxError` message reaches the picker verbatim (`listings.ts:117`, `canvas-inbox.ts:82`) | whoever owns `listings.ts` | a test feeding an HTML 200 body and asserting the action's error has no body text | a follow-up row; the probe's `not-canvas` verdict already covers the diagnosis |
| R5 | Non-owner instructors get no fine cause (fork F1) | owner decision | none needed unless the owner wants it | owner redirect = a one-line `isOwner` change |
| R6 | Pagination deadline: several 15 s calls aggregate (`docs/BACKLOG.md:87`, G4-CANVASGET-TIMEOUT) | existing row | existing | not addressed here; `serverMs` will quantify it |
| R7 | The unbounded `recordLmsCredentialFailure` await on every env-owner call (`canvas-credentials.ts:198-211`) | whoever owns `canvas-credentials.ts` | `serverMs` minus the 15 s fetch, over several exports | after W2 has produced real `serverMs` values |
| R8 | Reused keep-alive socket phase handling (4.1 step 5) is exercised only through a fake socket | W1 implementer + checker | AC-3 variant with `connecting = false` | W1 gate; real behaviour unobservable here |
| R9 | Hint copy is unvalidated against real incidents | owner | the owner reading the first real probe | after W3 |

---

## 14. Carry-over from the predecessor scope (not a restructuring)

| Predecessor item (`docs/robust-lms-diagnostics-scope.md`) | Status here |
|---|---|
| Wave 1 host in picker error; Wave 2 institution + host + "no response" | SHIPPED (5f6b7a8a, eb4be431); built upon, not re-proposed |
| R1 host-helper triplication | PARTIALLY handed over: two of three consolidated in W2; third = R3 |
| R2 host-not-allowed classification | handed over: R2 above |
| R3 per-call stage tagging | withdrawn as stated; replaced by `phase` (transport) + `serverMs` (action), which answer the same question with less seam |

---

## Appendix A - the measurement harness (scratch, not committed)

Setup (certificate; Git Bash needs the path-conversion guard):
`MSYS_NO_PATHCONV=1 openssl req -x509 -newkey rsa:2048 -nodes -keyout k.pem -out c.pem -days 1 -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost"`
Run: `node appendix-a.mjs` (Node v22.14.0, `node --version`). Output rows are
the table in section 2.1. `lookupStyle: "prod"` is the single-address form of
`canvas-fetch.ts:342-346`; the default honours `options.all`.

```js
import https from "node:https"; import net from "node:net"; import tls from "node:tls"; import fs from "node:fs";
import { promises as dns } from "node:dns";
const cert = fs.readFileSync("c.pem"), key = fs.readFileSync("k.pem");
const shape = (e) => ({ name: e?.name, code: e?.code, causeName: e?.cause?.name });
function req(label, { port, addr = "127.0.0.1", ca, servername = "localhost", timeout = 1200, lookupStyle = "all" }) {
  return new Promise((resolve) => {
    const ev = []; const t0 = Date.now(); let opts;
    const lookup = (_h, o, cb) => process.nextTick(() => { opts = o;
      return lookupStyle === "prod" ? cb(null, addr, 4) : (o.all ? cb(null, [{ address: addr, family: 4 }]) : cb(null, addr, 4)); });
    const r = https.request({ hostname: "localhost", port, path: "/", servername, ca, headers: { Host: "localhost" }, lookup, signal: AbortSignal.timeout(timeout) },
      (res) => { res.on("data", () => {}); res.on("end", () => resolve({ label, ok: true, status: res.statusCode, ev }));
                 res.on("error", (e) => resolve({ label, where: "res", ev, ...shape(e) })); });
    r.on("socket", (s) => { ev.push("socket"); s.on("connect", () => ev.push("connect")); s.on("secureConnect", () => ev.push("secureConnect")); });
    r.on("error", (e) => resolve({ label, where: "req", ms: Date.now() - t0, ev, lookupOpts: JSON.stringify(opts), ...shape(e) }));
    r.end();
  });
}
const listen = (srv) => new Promise((r) => srv.listen(0, "127.0.0.1", () => r(srv.address().port)));
const push = (x) => console.log(JSON.stringify(x));
try { await dns.lookup("no-such-host-zzq.invalid", { all: true }); } catch (e) { push({ label: "dns lookup .invalid", ...shape(e) }); }
const okPort = await listen(https.createServer({ cert, key }, (q, r) => r.end("ok")));
push(await req("A0 prod lookup form, healthy server", { port: okPort, ca: cert, lookupStyle: "prod" }));
push(await req("A1 same server, lookup honouring all", { port: okPort, ca: cert }));
push(await req("A2 closed port", { port: 1 }));
push(await req("A3 self-signed, no ca", { port: okPort }));
push(await req("A4 altname mismatch", { port: okPort, ca: cert, servername: "wrong.example" }));
push(await req("A5 tls up, no http reply", { port: await listen(tls.createServer({ cert, key }, (s) => s.on("data", () => {}))), ca: cert }));
push(await req("A6 tcp up, no tls reply", { port: await listen(net.createServer((s) => s.on("data", () => {}))), ca: cert }));
push(await req("A7 reset on connect", { port: await listen(net.createServer((s) => s.destroy())), ca: cert }));
push(await req("A8 closed mid-body", { port: await listen(tls.createServer({ cert, key }, (s) => s.once("data", () => { s.write("HTTP/1.1 200 OK\r\nContent-Length: 100\r\n\r\nabc"); setTimeout(() => s.destroy(), 50); }))), ca: cert, timeout: 3000 }));
push(await req("A9 blackhole 192.0.2.1:443", { port: 443, addr: "192.0.2.1", timeout: 1500 }));
process.exit(0);
```

Observed output (this run, Node v22.14.0), trimmed to the discriminating fields:

```
dns lookup .invalid      code=ENOTFOUND
A0 prod lookup form      TypeError ERR_INVALID_IP_ADDRESS   ev=[socket]   lookupOpts={"hints":0,"all":true}
A1 honouring all         ok status=200                      ev=[socket,connect,secureConnect]
A2 closed port           ECONNREFUSED                       ev=[socket]
A3 self-signed           DEPTH_ZERO_SELF_SIGNED_CERT        ev=[socket,connect]
A4 altname mismatch      ERR_TLS_CERT_ALTNAME_INVALID       ev=[socket,connect]
A5 tls up, no reply      AbortError ABORT_ERR (TimeoutError) ev=[socket,connect,secureConnect]  ms=1204
A6 tcp up, no tls        AbortError ABORT_ERR (TimeoutError) ev=[socket,connect]                ms=1216
A7 reset on connect      ECONNRESET                         ev=[socket,connect]
A8 closed mid-body       ECONNRESET (on res)                ev=[socket,connect,secureConnect]
A9 black-holed address   AbortError ABORT_ERR (TimeoutError) ev=[socket]                        ms=1513
```

## Appendix B - other measurement commands cited

- `git log --oneline -8` (HEAD f1a8aaee; 5f6b7a8a and eb4be431 present).
- `wc -l` on every file in section 10 (values copied from that run).
- `sort w1.txt w2.txt | uniq -d` and the W1xW3, W2xW3 pairs (section 6).
- `grep -rn "classifyChatSeamFailure" src --include=*.ts --include=*.tsx`
  (consumers, F6).
- `grep -n "engines" package.json` (empty); `cat vercel.json` (crons only).
- `grep -rl "autoSelectFamily" node_modules/next/dist` (edge-runtime bundles only).
- `grep -n 'toEqual(' src/lib/canvas-fetch.test.ts`: the three
  `{ ok: false, kind: "unreachable" }` assertions at `:161`, `:375`, `:407` are
  the only existing assertions W1 must change (the four `host-not-allowed`
  assertions at `:96`, `:141`, `:324`, `:415` are unaffected because W1 adds no
  field to that branch).
