# R2 sub-waves 1-4: the over-tightening audit nobody ran

Read-only audit, written 2026-09-28 against the tree at `587c210`
(`git rev-parse --short HEAD`). Seat: `loop-seat`. Consumer: a fresh
`loop-checker`, then the orchestrator.

**Nothing under `src/` or `supabase/` was written, and no mutation was run.**
Section 12 names every mutation I did NOT run and says who owns each one. My
write set is this one file, so a proposed instrument I could not turn red is a
proposed instrument I may not recommend - the rule is
`docs/owner-private-secrets.md:442-452`, and I am honouring it rather than
restating it as ambition.

**THE HEADLINE, stated before the evidence so it cannot be mistaken for a
hedge. All 71 owner-only call sites in the five sub-wave-1-4 files are
CORRECTLY restrictive under the shipped criterion. I found ZERO wrongly
tightened sites.** Section 4 is the per-site table, section 5 is the eight
attacks I ran to try to break that answer, and section 6 is why the
`19/19, 19/19, 26/26, 6/6` shape that looks exactly like a sweep is not one
here. I would rather report that the sweep concern was unfounded than
manufacture a finding to justify the pass, and section 5 exists so a checker
can see what it cost me to reach that answer.

**What I DID find is three defects, none of them an over-tightening.** One is
in the counting tool the brief told me to use and is the most important thing
in this document (F1). One is a converted site with no executing guard test at
all (F2). One is a false-absence hazard in `git grep` in this checkout (F3).
And SW4's stated GROUND for the conditional-reach site is wrong in both
directions at once - section 7.

---

## 0. Owner decisions checked FIRST, per `docs/loop/traps-spec.md`

```
grep -n "requireOwner\|requireAppOwner\|owner-private\|secret\|GITHUB\|sandbox\|PISTON\|guard" \
  docs/owner-decisions-2026-09-23.md docs/owner-decisions-2026-09-27.md
```

Four hits, all in `docs/owner-decisions-2026-09-23.md`, none bearing on this
question: `:16` is about a Canvas sandbox for a single-recipient POST
experiment, and `:194`, `:197`, `:198` are about route-handler guards and the
action-guard coverage test being in a write set. **No owner decision forecloses
or settles any branch in this audit.** This matters because
`owner-private-secrets.md` ran the same check with a narrower pattern and got
zero output; my wider pattern finds four lines and they still do not bear, so
that document's conclusion survives a stronger search.

**RULING 126 is not in `docs/`.** `grep -rn "RULING 12[0-9]" docs/ src/` returns
`RULING 129` (in `docs/a39-incremental-fill-architecture*.md`) and `RULING 127`
(quoted inside `docs/BACKLOG.md:116`), but no RULING 126. I take its content
from my brief as given and do not re-derive it: **the sandbox credentials'
OUTCOME stands as a named exception while its GROUND is withdrawn**, so I do
not reason from "uncontained equals restrictive" anywhere below. That matters
in section 4.3, where `listGithubModelsAction` and `copilotChatAction` would
otherwise be arguable either way. Flagging the absent file is not a complaint:
a ruling a later seat cannot open is a ruling a later seat will re-derive.

---

## 1. The criterion I judged against, quoted, not paraphrased

I did not re-decide it. Three citations, all opened:

**(a) `src/lib/supabase/auth.ts:369-375`** - `requireAppOwner()`'s own doc
comment, read at `sed -n '365,380p'`:

> Authorize a server action for role==='owner' ONLY. Reserved for call sites
> that spend or reach an OWNER-PRIVATE resource through a shared server
> secret (Canvas, GitHub, the cloned voice/avatar, ...) plus the admin
> surface

and the caution that cuts the other way, same comment:

> which is why requireAppOwner() is reserved for a smaller list than
> "everything that used to call requireOwner()".

**(b) `src/lib/supabase/auth.ts:294-295`** - the families, in production
source, read at `sed -n '280,300p'`:

> reach every owner-private capability still gated by the requireOwner() name -
> Canvas, GITHUB_TOKEN, the cloned voice/avatar (AC R7).

**(c) `src/app/actions/action-guard-coverage.test.ts:313`** - the criterion in
six words, in executing code:

> not merely a shared billing key

**The operative test, from `docs/owner-private-secrets.md:343-347` (its section
5 step 3), is containment AT THE SECRET:** does the read site itself consult the
CALLING identity and refuse a non-owner? For `GITHUB_TOKEN` the answer is no,
and I verified it rather than inheriting it. `src/lib/github.repos.ts:8-12`:

```
function githubToken(): string {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token) throw new Error("GitHub is not configured. ...");
  return token;
}
```

No identity parameter, no `getEffectiveIdentity()`, no `role` check - compare
`src/lib/canvas-credentials.ts:220`, which gates its env fallback on
`identity.role === "owner"` and is the worked precedent for a reach that
legitimately stays permissive. `src/lib/github.repos.ts:28-35` then shows
`ghFetch` attaching `Authorization: Bearer ${githubToken()}` to every request.

**So the audit reduces to one question per site: does this action's body reach a
PAT-spending function on a path a caller can take?** If yes, restrictive is
correct under (a)+(b)+(c). If no, the site was swept along with its file and
a capability has been silently removed.

---

## 2. The site inventory, measured

`requireOwner` is gone from all five files and `requireUser` never appears in
any of them, so every guard call in the audited set is `requireAppOwner`.
Measured with the two-instrument tool at `src/tools/symbol-count/count.ts`
(driver script in the session scratchpad; it calls `countSymbolOccurrences`
per file per symbol and prints the whole report):

| File | `requireAppOwner` calls | declarations | `requireUser` | `requireOwner` | naive line count |
|---|---|---|---|---|---|
| `src/app/actions/github-repos.ts` | **37** | 1 (the import) | 0 | 0 | 38 |
| `src/app/actions/submission-repo.ts` | **1** | 1 | 0 | 0 | 2 |
| `src/app/actions/github.ts` | **27** | 1 | 0 | 0 | 28 |
| `src/app/actions/github-content.ts` | **5** | 1 | 0 | 0 | 6 |
| `src/app/actions/visualizer-coverage.ts` | **1** | 1 | 0 | 0 | 2 |
| **Total** | **71** | 5 | 0 | 0 | 76 |

The naive line count is 76 against a true 71 call sites - the five import lines.
That is the exact gap the tool exists to show, and it is why the `callCount`
column above is the one I used.

**71 = 70 + 1, and the 1 is cited by content rather than subtracted.** The four
sub-wave commits converted 19 + 19 + 26 + 6 = 70 (section 3 diffs them). The
seventy-first is `ingestRepoAction`, converted earlier by R4's `a77f447`, and it
is identified by content: `src/app/actions/github.test.ts:126` opens
`describe("ingestRepoAction - R4 guard swap", ...)` and `:178` opens
`describe("github.ts sites 1-26 (minus ingestRepoAction) - R2 SW3 guard swap", ...)`.
So github.ts's 27 = 26 (SW3) + 1 (R4), which also explains why
`docs/r2-wave1-subwaves.md` section 0 corrected the scope doc's "27" to 26.

Sizes, both instruments, because they disagree by 15 to 138 on real files here
(`docs/loop/this-repo.md:5-12`). They agree on all twelve:

| File | `wc -l` | `@(Get-Content <path>).Count` |
|---|---|---|
| `src/app/actions/github-repos.ts` | 881 | 881 |
| `src/app/actions/submission-repo.ts` | 119 | 119 |
| `src/app/actions/github.ts` | 880 | 880 |
| `src/app/actions/github-content.ts` | 474 | 474 |
| `src/app/actions/visualizer-coverage.ts` | 239 | 239 |
| `src/app/actions/github-repos.guard.test.ts` | 221 | 221 |
| `src/app/actions/github.test.ts` | 186 | 186 |
| `src/app/actions/github-content.guard.test.ts` | 115 | 115 |
| `src/app/actions/visualizer-coverage.guard.test.ts` | 102 | 102 |
| `src/app/actions/submission-repo.test.ts` | 140 | 140 |
| `src/app/actions/guard-overtightening.test.ts` | 689 | 689 |
| `src/app/actions/action-guard-coverage-github-cohort.test.ts` | 772 | 772 |

---

## 3. What the four commits actually changed - the cheapest attack, run first

Before reading a single body I diffed the production half of all four commits
and collapsed it to unique changed lines:

```
git show <sha> -- src/app/actions/github-repos.ts src/app/actions/submission-repo.ts \
  src/app/actions/github.ts src/app/actions/github-content.ts \
  src/app/actions/visualizer-coverage.ts \
  | grep -E "^[-+]" | grep -vE "^(\+\+\+|---)" | sort | uniq -c | sort -rn
```

| Commit | Sub-wave | Guard lines changed | Anything else |
|---|---|---|---|
| `c6ba912` | SW1 | 19 x `- await requireOwner();` / `+ await requireAppOwner();` | 1 import line |
| `12f1dbe` | SW2 | 19 x the same | 3 import lines |
| `3f39baf` | SW3 | 26 x the same | 1 import line |
| `269e58d` | SW4 | 6 x the same | 2 import lines |

**Two results, and they are the load-bearing ones for the whole audit:**

1. **Zero `requireUser()` -> `requireAppOwner()` conversions.** Every one of the
   70 came off the deprecated alias. No site that was ALREADY permissive was
   tightened, which is the most direct form the feared defect could have taken.
2. **Zero body changes.** Not one line outside a guard call and an import was
   touched in any of the five files. So no in-body `identity.role === "owner"`
   branch was removed, and the "contained in the BODY with a permissive guard"
   shape (`docs/owner-private-secrets.md` section 5 step 5,
   `src/app/actions/course-hub-integrations.ts:154` - "Fixed in the BODY, not
   the guard") cannot have been destroyed here, because no body was edited.

Diffstats confirm the blast radius: `git show --stat` on the four commits shows
only these five production files plus test files. No other production guard
moved.

---

## 4. Per-site verdicts

### 4.1 How each verdict was produced, so it can be rebuilt rather than trusted

**RULING 84 forbids a file-level closure as a classification**, so the unit here
is the ACTION. Two AST passes over each file (compiler API, not a regex over
raw text - the same reason `src/lib/module-graph/runtime-import-graph.ts` gives
in its own header):

- **Pass A - per-action call map.** For each `export async function`, collect
  every `CallExpression` callee identifier in its body, and resolve each
  callee's root against the file's own import map so the printout says
  `getFileText<-@/lib/github` rather than a bare name. This is what makes the
  barrel problem tractable: `src/lib/github.ts` is a pure re-export barrel
  (147 lines, `wc -l`; it declares only `githubConfigured` at `:11` and
  `githubWebhookSecret` at `:19` and re-exports everything else), so an import
  from it proves nothing - the CALL is what proves.
- **Pass B - which barrel names spend the PAT.** For each of the eleven
  `src/lib/github.*.ts` modules, mark every exported function that reaches
  `ghFetch` / `ghJson` / `githubToken`, transitively within the module.

**Pass B was WRONG on first run and I am recording the correction rather than
the corrected answer alone.** It resolves only within a module, so it reported
`ingestRepo` as NON-SPENDING. Opening `src/lib/github.digest.ts:262-276` shows
`ingestRepo` calling `getRepo(owner, repo)` at `:274` and
`getRepoTreeWithMeta(owner, repo, branch)` at `:276` - both imported from
sibling modules, both PAT-spending, and `:274` is before any branch. Two other
cross-module edges needed the same hand correction:
`src/lib/github-models.ts:5` imports `githubToken` from `./github` and spends it
at `:48` and `:62`, and its own header at `:3` says "authenticated with the same
GITHUB_TOKEN as the REST client". The corrected PAT set is 69 names.

The barrel's genuinely NON-spending exports, which is the list a sweep would
have hidden behind: `parseRepoRef`, `invitationPermissionToRepoPermission`,
`excludeInstructionsFromDigest`, `isScaffoldingFile`, `selectDigestFiles`,
`githubConfigured`, `githubWebhookSecret`. **No action in the audited set reaches
the PAT only through one of these.**

- **Pass C - branch gating.** For each PAT call, is an `if` / ternary /
  `&&` / `||` / loop / `switch` between it and the function body? Reported per
  call, so an action with one gated and one ungated reach shows both.

### 4.2 `src/app/actions/github-repos.ts` - 37 sites, all CORRECT

Every site's own body names a PAT-spending function. `:line` is the
`export async function` line; `via` is the PAT call the body makes.

| # | Action | `:line` | via |
|---|---|---|---|
| 1 | `forkRepoAction` | 78 | `forkRepo` |
| 2 | `copyRepoAction` | 90 | `copyRepo` |
| 3 | `copyPathsToRepoAction` | 105 | `copyPathsToRepo` |
| 4 | `detectRepoFrontendAction` | 120 | `getFileText` |
| 5 | `createBranchAction` | 151 | `createBranch` |
| 6 | `deleteBranchAction` | 165 | `deleteBranch` |
| 7 | `listPullRequestsAction` | 179 | `listPullRequests` |
| 8 | `mergePullRequestAction` | 191 | `mergePullRequest` |
| 9 | `markPullRequestReadyAction` | 203 | `markPullRequestReady` |
| 10 | `getRepoAttentionAction` | 220 | `listPullRequests`, `listWorkflowRuns` |
| 11 | `listPullRequestReviewsAction` | 246 | `listPullRequestReviews` |
| 12 | `listPullRequestFilesAction` | 261 | `listPullRequestFiles` |
| 13 | `reviewPullRequestAction` | 276 | `reviewPullRequest` |
| 14 | `listWorkflowRunsAction` | 296 | `listWorkflowRuns` |
| 15 | `listRunJobsAction` | 316 | `listRunJobs` |
| 16 | `rerunWorkflowRunAction` | 328 | `rerunWorkflowRun` |
| 17 | `cancelWorkflowRunAction` | 340 | `cancelWorkflowRun` |
| 18 | `rerunFailedJobsAction` | 352 | `rerunFailedJobs` |
| 19 | `setWorkflowEnabledAction` | 364 | `setWorkflowEnabled` |
| 20 | `listRunArtifactsAction` | 376 | `listRunArtifacts` |
| 21 | `getArtifactDownloadUrlAction` | 387 | `getArtifactDownloadUrl` |
| 22 | `getRunLogsDownloadUrlAction` | 398 | `getRunLogsDownloadUrl` |
| 23 | `listPendingDeploymentsAction` | 409 | `listPendingDeployments` |
| 24 | `reviewPendingDeploymentsAction` | 420 | `reviewPendingDeployments` |
| 25 | `getRepoTreeAction` | 438 | `getRepoTree` |
| 26 | `getFileTextAction` | 450 | `getFileText` |
| 27 | `commitFileAction` | 463 | `putFile` |
| 28 | `listOrgMembersAction` | 479 | `listOrgMembers` |
| 29 | `inviteOrgMemberAction` | 490 | `inviteOrgMember` |
| 30 | `setOrgMemberRoleAction` | 507 | `setOrgMemberRole` |
| 31 | `listRepoCollaboratorsAction` | 523 | `listRepoCollaborators` |
| 32 | `setRepoCollaboratorAction` | 534 | `setRepoCollaborator` |
| 33 | `createPullRequestAction` | 550 | `createPullRequest` |
| 34 | `setBranchProtectionAction` | 570 | `setBranchProtection` |
| 35 | `updateRepoAction` | 586 | `updateRepo` |
| 36 | `gradeRepoAction` | 652 | `ingestRepo` @701 unconditional, `getRepoTreeWithMeta` @774 gated |
| 37 | `getRepoZipAction` | 851 | `downloadRepoZipball` |

Sites 1-35 and 37 are one- or two-statement bodies whose entire purpose is the
barrel call; pass C reports every PAT call in them unconditional.

**Site 36 is the only one worth reading by hand**, because SW2's commit body
made a specific claim about it ("gradeRepoAction reaches it on the first line of
its try block, before any branching"). That claim is nearly right and slightly
wrong, and the correction does not change the verdict. `sed -n '698,705p'` shows
the order: `requireAppOwner()` at `:698`, `parseRepoRef` at `:699`, a
`if (!parsed) return` at `:700`, then `ingestRepo(parsed.owner, parsed.repo, ...)`
at `:701`. So it is the THIRD statement, gated only on the caller's own input
parsing - not the first line. Pass C confirms `ingestRepo@701` unconditional.

**Verdict: 37/37 CORRECT.**

### 4.3 `src/app/actions/github.ts` - 27 sites, all CORRECT

| # | Action | `:line` | via |
|---|---|---|---|
| 1 | `extractTopicsFromRepoAction` | 22 | `getRepoTree` @34, `getFileText` |
| 2 | `setRepoTopicsAction` | 98 | `setRepoTopics` |
| 3 | `listGithubReposAction` | 118 | `listRepos` |
| 4 | `deleteOrgReposAction` | 133 | `deleteRepo` @145 (inside the loop over caller-supplied names) |
| 5 | `setupStudentRepoAction` | 172 | `generateFromTemplate` @192 unconditional, `setRepoCollaborator` @207 gated |
| 6 | `listMyOrgsAction` | 220 | `listOwnedOrgs` |
| 7 | `listOrgReposAction` | 230 | `listOrgRepos` |
| 8 | `listGithubBranchesAction` | 244 | `listBranches` |
| 9 | `ingestRepoAction` | 258 | `ingestRepo` (**R4's site, not R2's**) |
| 10 | `createRepoAction` | 278 | `createRepo` |
| 11 | `createRepoFromTemplateAction` | 307 | `generateFromTemplate` @322 unconditional, `updateRepo` @320 gated |
| 12 | `createCopilotRepoAction` | 337 | `putFile` @357, @358 unconditional; `createOrgRepo`/`createRepo` @356 gated; `startCopilotBuild` @373 |
| 13 | `createCopilotTaskAction` | 386 | `createCopilotAgentTask` |
| 14 | `listCopilotTasksAction` | 403 | `listCopilotTasks` |
| 15 | `bulkDeletePathsAction` | 417 | `deletePaths` |
| 16 | `bulkMovePathsAction` | 436 | `movePaths` |
| 17 | `listGithubModelsAction` | 462 | `listGithubModels` -> `githubToken()` (`github-models.ts:48`) |
| 18 | `copilotChatAction` | 472 | `chatWithGithubModel` -> `githubToken()` (`github-models.ts:62`) |
| 19 | `checkStudentActivityAction` | 487 | `listOrgRepos`, `listCommits` |
| 20 | `registerOrgPushWebhookAction` | 527 | `createOrgPushHook` |
| 21 | `generateRubricFromRepoAction` | 553 | `ingestRepo` (third statement, input-gated only) |
| 22 | `gradeReposAction` | 611 | `ingestRepo` @650 (inside the loop over caller-supplied repos) |
| 23 | `listWorkflowsAction` | 769 | `listWorkflows` |
| 24 | `dispatchWorkflowAction` | 782 | `dispatchWorkflow` |
| 25 | `dispatchTestsAction` | 805 | `dispatchWorkflow` @823 unconditional; `getRepo` @814, `listWorkflows` @817 gated |
| 26 | `getTestRunStatusAction` | 835 | `findWorkflowRunSince` |
| 27 | `setupTestsWorkflowAction` | 864 | `putFile` |

**Sites 4 and 22 are the only two whose every PAT call is branch-gated**, and in
both the "branch" is a `for` loop over an argument the caller supplies -
`names` for site 4, `repos` for site 22. An invocation with a non-empty array
reaches the PAT; an invocation with an empty one returns an error
(`github.ts:651`: `if (rawDigests.length === 0) return { error: "No valid repositories to grade." }`).
That is input-emptiness, not a feature flag, so there is no reachable capability
behind the gate for a non-owner to lose. Restrictive is correct.

**Sites 17 and 18 are the closest call in the whole cohort and I want a checker
to attack them rather than skim them.** `listGithubModelsAction` and
`copilotChatAction` reach the GitHub Models inference API, not a repository. By
`docs/owner-private-secrets.md` section 6's reasoning they look structurally
identical to `GEMINI_API_KEY`: metered third-party model spend. Under a
per-ENDPOINT reading they would be permissive, and two instructor capabilities
(list GitHub Models, chat with one) are gone.

I rule them CORRECT, on three grounds and with the cost of being wrong stated:

- **The enumeration is per-SECRET, not per-endpoint.** `auth.ts:295` names
  `GITHUB_TOKEN` as a family, not "the GitHub REST API". Two of the three
  families in that line are already pinned per-secret in shipped code.
- **Section 1's own test answers yes.** "Is there an owner identity behind this
  credential?" The PAT *is* the owner's GitHub identity; every
  `models.github.ai` request made with it is attributed to the owner's GitHub
  account and consumes that account's Models entitlement.
  `github-models.ts:39` says so in its own error text: "GITHUB_TOKEN needs the
  'models' permission and Models must be enabled for the account."
- **Re-reading them as shared spend is a criterion amendment**, and
  `docs/owner-private-secrets.md:511-519` (its section 9 step 3) rules that a
  criterion amendment is not a sub-wave's decision and, by the same argument,
  not an audit's. **Cost of my being wrong: two instructor capabilities stay
  closed until someone reopens them, and the owner-private set carries a family
  member that does not belong in it.** That is a recoverable error in the
  direction this audit exists to catch, so it goes in the residual register as
  RES-A rather than being decided here.

`githubConfiguredAction` (`github.ts:113`) carries NO guard and was not touched
by R2. It is pinned in `PINNED_UNGUARDED`
(`action-guard-coverage.test.ts:237`, `:263`) as "still unguarded but SHOULD NOT
BE". That is an UNDER-tightening row already owned by that list, in the opposite
direction from this audit, and I am not adopting it.

**Verdict: 27/27 CORRECT (26 R2 + 1 R4).**

### 4.4 `src/app/actions/github-content.ts` - 5 sites, all CORRECT

| # | Action | `:line` | via |
|---|---|---|---|
| 1 | `generateSchedulePlanFromRepoAction` | 20 | `downloadRepoZipball` |
| 2 | `fillAssignmentReadmesAction` | 202 | `getRepoTree` @229 unconditional, `putFile` @370 gated |
| 3 | `getAssignmentSyncStateAction` | 399 | `getFileText` |
| 4 | `syncAssignmentToRepoAction` | 428 | `putFile` |
| 5 | `syncAssignmentFromRepoAction` | 451 | `getFileText` |

Sites 3, 4 and 5 also reach Canvas (`getAccessibilityItem` /
`saveAccessibilityItemHtml` from `@/lib/canvas-modules`). That reach on its own
would NOT justify restrictive - Canvas is the tree's best-contained secret
(`canvas-credentials.ts:220` gates the env fallback on
`identity.role === "owner"`), and it is exactly the containment that keeps
`postWalkthroughAnnouncementAction` permissive in `GITHUB_NOT_OWNER_ONLY`. The
PAT call is what settles all three. **Verdict: 5/5 CORRECT.**

### 4.5 `src/app/actions/submission-repo.ts` - 1 site, CORRECT, but see F2

`fetchSubmissionRepoAction` (`:33`, guard at `:35`) calls `getRepo` @43,
`listCommits` @61, `getRepoTree` @70 - all unconditional - and `getFileText`
@94 gated. Four PAT reaches, three of them on every path.

The capability it gates, from the file's own doc comment at `:19-21`: it is
"called directly by the drafted grades page (DraftedGradesTab /
SubmissionCodePanel)", i.e. loading a student's submitted code next to a draft
grade. That capability is now owner-only, and correctly so: it fetches an
arbitrary caller-supplied repository under the owner's PAT.

**Verdict: 1/1 CORRECT.** It is nonetheless the one site of 71 with no executing
guard test - finding F2.

### 4.6 `src/app/actions/visualizer-coverage.ts` - 1 site, CORRECT; SW4's ground is wrong

This is the site the brief asked me to rule on. Section 7 is the full answer,
because the reasoning is the substance and a table row would hide it.
**Verdict: 1/1 CORRECT, ground replaced.**

---

## 5. The eight attacks, including the five that came back empty

A clean audit is only worth having if it says what it tried. Each attack names
the object it compared, the instrument, and what a failure would have looked
like.

**A1 - a site whose body names no PAT function at all.** Object: all 71 action
bodies. Instrument: pass A intersected with the 69-name corrected PAT set.
Failure direction: any site printing `NO-PAT-NAME` with
`guard=requireAppOwner`. **Result: zero.** The only `NO-PAT-NAME` export in the
five files is `githubConfiguredAction`, which carries no guard at all.

**A2 - an already-permissive site tightened.** Object: the four commits'
production diffs. Instrument: `git show <sha> -- <five paths>` collapsed with
`sort | uniq -c`. Failure direction: a `- await requireUser();` line. **Result:
zero** (section 3). All 70 came off `requireOwner()`.

**A3 - a body-level permissive branch removed while the guard tightened.**
Object: the same diffs. Instrument: the same. Failure direction: any changed
line outside a guard call or an import. **Result: zero changed body lines in any
of the five files.** This is the attack that would have caught the
`course-hub-integrations.ts`-shaped defect, and it cannot have happened here.

**A4 - a PAT reach behind a feature flag, so the capability lost when the flag
is off is real.** Object: every PAT call in all 71 bodies. Instrument: pass C.
Failure direction: an action ALL of whose PAT reaches are branch-gated by
something other than input emptiness. **Result: three candidates, all resolved.**
`deleteOrgReposAction` and `gradeReposAction` gate on a `for` over a
caller-supplied array (section 4.3). `auditVisualizerCoverageAction` gates on a
real boolean flag and is section 7.

**A5 - an export my AST pass could not see.** Object: the five files. Instrument:
a scan for `export const x = async () => {}` / function-expression consts
alongside the `FunctionDeclaration` walk. Failure direction: any exported arrow
or function expression, which pass A would have skipped and which could carry an
unaudited guard. **Result: zero in all five files.** Consistent with
`src/lib/use-server-exports.test.ts`'s rule, which `github.ts:548-549` cites in
its own comment.

**A6 - a permissive CALLER broken by the tightening.** This is the attack I
expected to land, because it is the shape `docs/loop/` records as
"verify reachability, not just correctness". Object: every non-test module
importing one of the five action files. Instrument:
`grep -rln 'from "\./<module>"' src --include=*.ts --include=*.tsx | grep -v '\.test\.'`,
then pass A on each importer. Failure direction: a `requireUser()` action
calling one of the 71, which would silently stop working for every non-owner.
**Result: two importers, neither a failure.**

- `src/app/actions/deck-source.ts:30` imports `ingestRepoAction` from
  `./github`. This file IS in the over-tightening instrument's
  `PERMISSIVE_FILES`, so it was the best candidate in the tree. Pass A shows the
  call is made by `extractDeckSourceRepoAction` (`:63`), which is itself
  `requireAppOwner()`; the permissive sibling
  `extractDeckSourceFileAction` (`:34`, `requireUser`) does not call it. That is
  exactly what `GITHUB_NOT_OWNER_ONLY`'s own entry predicts - "never touches the
  ./github edge its sibling extractDeckSourceRepoAction does" - and it holds
  against the code, not just against the comment.
- `src/lib/workflows/registry/steps.visualizer.ts:22` imports
  `auditVisualizerCoverageAction`. Its step type is `audit-visualizer-coverage`
  (`:251`) and it is headless-safe (`src/lib/workflows/headless.ts:482`), so an
  unattended run reaches it as the impersonated owner. An ATTENDED run by a
  non-owner would now be rejected - which is the intended consequence of the
  whole GitHub surface being owner-only, not a defect in this site.
- `src/lib/github-models.ts:5` matched the same grep and is a FALSE POSITIVE
  worth naming: its `from "./github"` is the LIB barrel `src/lib/github.ts`, not
  the action file `src/app/actions/github.ts`. A reader who trusted the grep
  output would have chased a non-existent edge.

**A7 - the aggregate capability question.** Object: the whole audited set.
Instrument: reading. **Result: not a finding, but it must be said plainly.** The
71 sites are the entire GitHub surface of this app - repo CRUD, branches, pull
requests, reviews, Actions, artifacts, deployments, collaborators, org members
and invitations, Copilot tasks, repo ingest, bulk grading, student-repo
provisioning, test-workflow setup, and loading a student's submitted code. After
sub-waves 1-4 **a non-owner account can do none of it.** That is what the
criterion prescribes, and `auth.ts:299` records why it costs nothing today -
"there are no members yet (REL1)". It will stop costing nothing the moment one
account is approved, and nothing in this repo will announce that.

**A8 - does the shipped over-tightening instrument cover these files?** Object:
`guard-overtightening.test.ts`'s `PERMISSIVE_FILES`. Instrument: extracting
every `file: "..."` from the `REVIEWED_PERMISSIVE` declaration
(`:159`-`:303`), against the set pinned to 11 at `:589`. **Result: none of the
five audited files appears, in either the named-action direction or the
per-file-exactness direction.** The eleven are
`account/integrations/lms-actions.ts`, `actions/deck-source.ts`,
`actions/deck-template-files.ts`, `actions/prompt-announcement-draft.ts`,
`actions/prompt-announcement-post.ts`, `actions/snapshot-grade.ts`,
`actions/snapshot-parse-rubric.ts`, `actions/snapshot-read.ts`,
`actions/snapshot-transcribe-rubric.ts`, `actions/visualizer.ts`,
`actions/walkthrough-announcement.ts`. **So sub-waves 1-4 remain outside the
instrument even now, and this document is the only thing standing in for it -
a source-READING artifact, not an executing one.** RES-B.

---

## 6. Why `19/19, 19/19, 26/26, 6/6` is not a sweep here

The brief is right that a run of files with zero permissive sites is exactly
what a sweep looks like. Three independent reasons it is not one in this case,
each measured rather than argued:

1. **The per-site test in A1 passes for all 71 individually.** The aggregate was
   not accepted; each body was intersected with the PAT set on its own, and the
   `via` column in section 4 names the specific function per site. A sweep would
   show at least one site whose only barrel import is `parseRepoRef`.
2. **The barrel problem was handled.** `src/lib/github.ts` re-exports 69
   PAT-spending names and 7 non-spending ones. If classification had rested on
   "the file imports from `@/lib/github`", `extractDeckSourceFileAction` would
   be restrictive too - and it is not; it is a shipped permissive site in
   `GITHUB_NOT_OWNER_ONLY`. That is a live counterexample in the tree proving
   the import edge was not what anyone classified on.
3. **These five files are the extreme case by construction, and SW3 said so
   before it could be accused.** `3f39baf`'s commit body: "Three sub-waves in,
   64 sites, ZERO permissive - which is right for Rank 1, where every site
   touches the PAT by construction. It should NOT be read as the expected shape
   for the Rank-2b sub-waves." Later sub-waves bear that out: SW5 produced
   `extractDeckConceptsAction` permissive, SW6 produced four, SW7 produced
   sixteen. A sweeper does not start producing permissive classifications three
   sub-waves in.

---

## 7. The conditional-reach site: I agree with the outcome and reject both halves of the stated ground

`auditVisualizerCoverageAction` (`src/app/actions/visualizer-coverage.ts:112`,
guard at `:121`). SW4's commit body rules it restrictive because its PAT reach
is "on a path the action really takes - only when dispatch is on and gaps are
found, but a live path, not a name it never reaches."

**Pass C says the picture is more complicated than that, in both directions.**

```
auditVisualizerCoverageAction:
  loadVisualizerIndexAction@140 [unconditional]
  listCopilotTasks@199          [BRANCH-GATED]
  createCopilotAgentTask@207    [BRANCH-GATED]
```

**Half one of the ground is too weak: there is an UNCONDITIONAL reach SW4 did
not name.** `:140` is `const indexResult = await loadVisualizerIndexAction();`,
outside every branch, and that function
(`src/app/actions/live-class.ts:686-700`) calls `getFileText` at `:691` - the
PAT.

**But that reach is CONTAINED AT THE ACTION, so it does not help.** I have to
say this against my own first reading. `live-class.ts:690` is
`await requireAppOwner();`, immediately before the `getFileText` at `:691`, and
the whole body is wrapped in a `try` that returns `{ error }`. So for a
non-owner the inner guard throws, `getFileText` never runs, and
`auditVisualizerCoverageAction` continues with `index = []` (its own `:141`:
`const index = "entries" in indexResult ? indexResult.entries : []`). That is
containment shape three from `docs/owner-private-secrets.md` - contained at the
action - and it means the unconditional reach confers nothing. **Note the
timing: `live-class.ts` was SW6, which landed AFTER SW4. At the moment SW4 ruled,
that inner guard was still the permissive alias and the reach really was
uncontained and unconditional. SW4's ground was weak for a reason that no longer
applies.**

**Half two of the ground is right but understates itself by a wide margin.** The
only UNCONTAINED PAT reach is the dispatch branch at `:199` and `:207`, and
those call `@/lib/github` directly. And the repository they act on is not
arbitrary: `:196` is `const [owner, repo] = VISUALIZER_REPO.split("/")`, and
`src/lib/visualizer.ts:7` is

```
export const VISUALIZER_REPO = "alexandergshaw/programming-concept-visualizer";
```

a hardcoded personal repository of the deployment owner - the same account
`live-class.ts:692` names literally as `"alexandergshaw"`. So the dispatch
branch does not merely spend a shared credential; **it opens a GitHub issue,
under the owner's identity, inside the owner's own named repository.** That is
owner-private under section 1's test with no appeal to the PAT at all, and it is
a far stronger ground than "a live path is a live path".

**So: do I agree a live path is a live path?** As a general rule, not without
the second half. Taken alone it would justify restrictive for any action with
any gated PAT call anywhere in it, which is the reasoning that would have
swept `deleteOrgReposAction` and `gradeReposAction` on a technicality and, worse,
would make the branch-gating analysis pointless. The rule that survives is the
one `docs/owner-private-secrets.md` section 5 step 3 already states:
**trace the reach, then ask whether it is contained.** Applied here it gives
restrictive on the dispatch branch and nothing on the index branch.

**And the brief's harder question: does the capability lost when the branch is
NOT taken matter?** No, and this is the part that makes the verdict safe rather
than merely defensible. With `dispatch` false, a non-owner running this action
would get: `loadVisualizerIndexAction` returning `{ error }`, therefore
`index = []`, therefore `checkConceptsAgainstIndex(weekConcepts, [])` reporting
**every planned concept as a gap**, and a report whose coverage verdict is
uniformly wrong. The action does surface the cause - `:142` builds
`indexNote = "Visualizer index: " + indexResult.error` and `:176` folds it into
the report - so it is not silent. But the capability is degenerate: the coverage
audit's entire value is the comparison against the index, and the index is
itself owner-gated one level down. **Restoring the dispatch-off half to
non-owners would hand them a feature that structurally cannot work.** Closing
it costs nothing real.

**Verdict: restrictive is CORRECT. The ground in `269e58d`'s commit body should
be read as superseded by this section.**

---

## 8. Findings

**F0 - ZERO wrongly tightened sites, across all 71.** Stated as a numbered
finding so it cannot be mistaken for an absence of work. The attacks that
produced it are section 5; the five that came back empty are A2, A3, A5, A6 and
A1. No capability was silently removed from instructors by sub-waves 1-4 beyond
what the criterion prescribes.

### F1 - the symbol-count tool's lexical instrument is WRONG on any file containing a substituting template literal, and its own tests cannot see it

The brief said that if I found the counting tool wrong, that would matter more
than anything else here. I did.

**The AST instrument is fine. `callCount` is trustworthy, and every count in
this document rests on it.** The defect is in instrument 2, the
`ts.createScanner` walk in `scanCommentsAndStrings`
(`src/tools/symbol-count/count.ts:226-247`), which populates
`excludedAsComment`, `excludedAsString` and `instrumentsReconcile`.

**Proof, two fixtures differing in one expression.** Both were written to the
session scratchpad, never to the repo:

```ts
// fixture.ts
export async function a(x: string) {
  const msg = `hello ${x} world`;
  await requireAppOwner();
  return msg;
}
// fixture2.ts - identical except the template becomes a concatenation
  const msg = "hello " + x;
```

```
fixture.ts  | requireAppOwner | code=1 call=1 comment=0 string=1 reconcile=false
fixture2.ts | requireAppOwner | code=1 call=1 comment=0 string=0 reconcile=true
```

**A real `requireAppOwner()` CALL is counted as a string-literal occurrence,
because one template literal with one `${}` preceded it.** The cause is that a
raw `ts.createScanner` emits `TemplateHead`, then scans the substitution as
code, then on `}` emits `CloseBraceToken` and keeps scanning as code - it never
re-enters template mode, because `reScanTemplateToken()` is never called. So the
template's closing backtick is read as the OPENING delimiter of a new
string/template token, and everything up to the next backtick in the file -
real code included - is swallowed into a "string".

**The second fixture is worse, because the reconcile flag stays GREEN:**

```ts
// fixture3.ts
export async function a(x: string) {
  const msg = `hello ${x} world`;
  // requireAppOwner() is only mentioned here, in a comment
  return msg;
}
```
```
fixture3.ts | requireAppOwner | code=0 comment=0 string=1 reconcile=true
```

A mention in a COMMENT is reported as `excludedAsString=1` and
`excludedAsComment=0`, and `instrumentsReconcile` is `true` because
`0 + 0 + 1` still equals the file's total. The header's promise - that the
lexical scan "lets this tool measure occurrences of the symbol text INSIDE
comment tokens and INSIDE string/template literal tokens separately" - is false
for any file with a substituting template above the occurrence.

**Why it shipped: not one fixture in the tool's own test file contains a
substituting template literal.** `grep -n '\${' src/tools/symbol-count/count.test.ts`
returns **no output, exit 1**. The tests at `:145` and `:155` assert
`excludedAsString` is 1, and `:206` asserts `instrumentsReconcile` is `true` -
both on template-free fixtures, so both pass while the instrument is broken for
the real files it exists to measure.

**How wrong it is on real files, measured on the audited set:**

| File | `codeOccurrences` (AST, correct) | `excludedAsString` (wrong) | `reconcile` |
|---|---|---|---|
| `github-repos.ts` | 38 | 1 | false |
| `github.ts` | 28 | **26** | false |
| `github-content.ts` | 6 | 3 | false |
| `submission-repo.ts` | 2 | 0 | true |
| `visualizer-coverage.ts` | 2 | 0 | true |

`github.ts` reports 26 spurious string occurrences against a true 0.

**The consequence for the repo, and it is not "the tool is a bit off".**
`instrumentsReconcile` was built to be the signal that "two instruments
disagree about the same file - report it, do not average it away"
(`count.ts:106-108`). On three of the five files I measured it is false purely
from this artifact, and on `fixture3.ts` it is true while the classification is
wrong. **So the flag cannot distinguish a genuine anomaly from the template
artifact in either direction, which makes it unusable as the alarm it was
written to be.** The `callCount` field is unaffected and remains the right number
to cite - which is what I did throughout - but any future brief that quotes
`excludedAsComment`, `excludedAsString` or `instrumentsReconcile` from this tool
will be quoting noise. Residual RES-C carries the fix, its instrument, and the
mutation that must turn it red.

### F2 - one of the 71 sites has no executing guard test, and its test file's comment still names the old guard

**`fetchSubmissionRepoAction` (`src/app/actions/submission-repo.ts:35`) is the
only converted site with no PC1 instrument.** SW2's own commit body says how it
was verified - "both verified by count" - and a count is not an execution.

The evidence, opened: `src/app/actions/submission-repo.test.ts:9-11` is

```ts
vi.mock("@/lib/supabase/auth", () => ({
  requireAppOwner: vi.fn().mockResolvedValue({ id: "owner-1", email: "owner@example.com" }),
}));
```

which is exactly the wholesale mock SW4 identified as the pattern that "stubs
the guard away so it never executes". And
`ls src/app/actions/*.guard.test.ts` returns twelve files, none of them
`submission-repo.guard.test.ts`. The other four files each have one:
`github-repos.guard.test.ts` (37 tests, one per site),
`github.test.ts` (27 tests, `:126` + `:178`),
`github-content.guard.test.ts` (5), `visualizer-coverage.guard.test.ts` (1) -
**70 executing per-site assertions for 71 sites.**

Second, smaller defect in the same file: `submission-repo.test.ts:3` still reads
"fetchSubmissionRepoAction calls requireOwner() (auth)". Production is
`requireAppOwner()` at `:35`. SW2 changed that test file by one line (the mock
name) and left the comment stale - the exact class this repo has nine recorded
instances of.

**This is not an over-tightening.** Section 4.5 rules the site correct on its
four PAT reaches. It is a verification gap: the site is right, and nothing
executing proves it stays right. RES-D.

### F3 - `git grep` reports a FALSE CLEAN here for any pattern containing `@/lib/...`, and it is MSYS argument mangling

Found while trying to reproduce SW4's "81 test files" historically. Reported
because `docs/loop/traps-search.md` already owns one broken-search rule
(`grep -P`) and this is its sibling, with a named cause and a one-variable fix.

Bisected, all at `HEAD -- src/app/actions`, with `git grep -F -l -e <pattern>`:

| Pattern | Files reported |
|---|---|
| `vi.mock` | 116 |
| `mock("` | 115 |
| `lib/supabase` | 192 |
| `"` | 237 |
| **`@/lib`** | **0** |
| **`vi.mock("@/lib/supabase/auth"`** | **0** |

The working tree contradicts it: `grep -rl 'vi\.mock("@/lib/supabase/auth"' src/app/actions --include=*.test.ts | wc -l`
returns **82**. `-F` and `-e` do not help. The cause is MSYS argument path
conversion in this Git Bash, confirmed by the fix:

```
MSYS_NO_PATHCONV=1 git grep -F -l -e 'vi.mock("@/lib/supabase/auth"' HEAD -- src/app/actions
# -> 82.   MSYS2_ARG_CONV_EXCL='*' also -> 82
```

**A search returning zero here is not evidence of absence**, and `git grep`
against a rev otherwise works fine (`git grep -F -l "requireAppOwner" HEAD -- src/app/actions`
-> 45, matching the working tree's 45).

With the hazard neutralised I got the historical number, using a dot-escaped
pattern with a canary that must be zero:

```
git grep -l -e 'vi.mock(.@.lib.supabase.auth.' 269e58d -- src/app/actions | grep -c "\.test\.ts$"  # 81
git grep -l -e 'vi.mock(.@.lib.supabase.auth.' HEAD     -- src/app/actions | grep -c "\.test\.ts$"  # 82
git grep -l -e 'vi.mock(.@.lib.supabase.NOPE.' HEAD     -- src/app/actions | wc -l                  # 0
```

**SW4's 81 was correct at `269e58d`. It is 82 at `587c210`, so the pattern that
blinds the suite to guard changes is still spreading - one new file since.**
RES-E.

---

## 9. The pass conditions this audit's verdicts rest on

Each names the object under comparison, the instrument producing each quantity,
and the direction of failure. None of these is a new instrument I am proposing;
they are the conditions I applied.

**PC-A1 - a site is correctly restrictive.** Object: one `export async function`
body in one of the five files. Instruments: (i) the AST per-action call map,
resolving each callee root against that file's own import map; (ii) the
PAT-spending name set, derived per module from reachability to
`ghFetch`/`ghJson`/`githubToken` and hand-corrected for the three cross-module
edges named in 4.1. **FAILS if the intersection of (i) and (ii) is empty while
the body calls `requireAppOwner`.** Never a `grep -c` over the file, and never
"the file imports from `@/lib/github`" - section 6 reason 2 is the live
counterexample that would break.

**PC-A2 - the reach is on a path a caller can take.** Object: each PAT call
inside one body. Instrument: the AST branch-gating walk, marking a call gated
when an `if`/ternary/`&&`/`||`/loop/`switch` lies between it and the function
body. **FAILS RESTRICTIVE if every PAT call in a body is gated by something
other than input emptiness and the ungated remainder is a usable capability.**
Applied, this is what forced section 7 rather than a table row.

**PC-A3 - no permissive caller was broken.** Object: every non-test module
importing one of the five action files, paired with the guard on the specific
exported function making the call. Instrument: `grep -rln` for the import edge,
then the AST per-action call map on each importer. **FAILS if a `requireUser()`
export calls one of the 71.** The instrument's own weakness is recorded in A6:
its grep matched `src/lib/github-models.ts` on the LIB barrel, so a reader who
stopped at the file list would have chased an edge that does not exist.

**PC-A4 - a claimed absence is not a broken search.** Object: any zero-result
search in this document. Instrument: a canary exercising the same pattern and
the same filter, plus - after F3 - a working-tree cross-check with a different
tool. **FAILS if the canary also returns zero.** F3 is what happens when this
condition is skipped: `git grep` reported a clean 0 against a true 82.

---

## 10. Disposition of the prior claims

There is no prior version of this file, so nothing was restructured. There ARE
five prior claims about these 71 sites, and leaving them unreconciled would be
the silent-drop failure `docs/DEV_LOOP.md` warns about.

| Prior claim | Where | Disposition |
|---|---|---|
| "19 restrictive, 0 permissive ... EVERY ONE OF THE 19 WAS READ INDIVIDUALLY rather than swept, and each one's own body calls a PAT-spending function directly" | `c6ba912` commit body | **CONFIRMED.** Sites 1-19 of section 4.2, independently re-derived by AST rather than by reading the report. |
| "19 sites this sub-wave, 19 restrictive, 0 permissive ... gradeRepoAction reaches it on the first line of its try block, before any branching" | `12f1dbe` commit body | **CONFIRMED WITH ONE CORRECTION.** The count and the classification hold. `ingestRepo` is at `github-repos.ts:701`, the THIRD statement, after `parseRepoRef` at `:699` and its `if (!parsed) return` at `:700`. Unconditional, but not the first line. The verdict does not move. |
| "26 sites, all restrictive, 0 permissive ... Two sites reach it through github-models rather than the REST barrel, and that module's own header says it authenticates with the same GITHUB_TOKEN" | `3f39baf` commit body | **CONFIRMED, and the two sites are the cohort's closest call.** `github-models.ts:3` says it, `:48` and `:62` do it. Section 4.3 records why I rule them correct anyway and what it costs if I am wrong (RES-A). |
| "6 restrictive, 0 permissive ... The one site the brief asked to be TRACED was traced: it reaches the token through the barrel to a Copilot call that spends it, on a path the action really takes - only when dispatch is on and gaps are found, but a live path, not a name it never reaches" | `269e58d` commit body | **OUTCOME CONFIRMED, GROUND SUPERSEDED by section 7.** Two things it did not see: an unconditional reach at `:140` (which turns out to be contained at `live-class.ts:690`, and was NOT contained when SW4 ruled), and that the dispatch branch writes into `alexandergshaw/programming-concept-visualizer` - the owner's own repository, `src/lib/visualizer.ts:7` - which is a stronger ground than the one given. |
| "81 test files under src/app/actions do the same thing [mock @/lib/supabase/auth wholesale]" | `269e58d` commit body | **CONFIRMED at that commit, and now STALE.** 81 at `269e58d`, **82** at `587c210`, both via the F3-safe dot pattern with a zero canary. Not a defect in SW4; a moving number that any later brief quoting 81 will get wrong. |

---

## 11. Residual register

Every entry names an owner, an instrument, and the step that will measure it. I
have called none of these a residual that is really a deletion, and if a checker
thinks one is, that is the right thing to attack.

| Id | What is not proven now | Owner | Instrument | Step that will measure it |
|---|---|---|---|---|
| RES-A | Whether `listGithubModelsAction` and `copilotChatAction` (`github.ts:462`, `:472`) belong in the owner-private set. They reach GitHub Models inference under the owner's PAT, which is per-SECRET owner-private by `auth.ts:295` and per-ENDPOINT shared spend by `owner-private-secrets.md` section 6. I ruled them correct on the per-secret reading and did not amend the criterion | repo owner - it is a criterion amendment, which `owner-private-secrets.md` section 9 step 3 rules is not a sub-wave's (or an audit's) decision | If reopened: the `grading.guard.test.ts:294-311` executing idiom, an `active` non-owner session, asserting `listGithubModelsAction` RESOLVES; plus the PC3 non-vacuity assertion (`requireAppOwner()` on that same session must reject) | A named follow-up, only if the owner reclassifies. Until then these two stay restrictive and this row is the record of the open question |
| RES-B | That sub-waves 1-4's five files have any EXECUTING or PINNING over-tightening protection. `guard-overtightening.test.ts`'s `PERMISSIVE_FILES` (11 files, pinned at `:589`) contains none of them, in either direction. This document is the only thing standing in for it, and it is a source-reading artifact | the next sub-wave that writes `guard-overtightening.test.ts` | A per-file exactness entry for the five files asserting **every** `export async function` in them calls `requireAppOwner` and none calls a bare `requireUser` - the converse of the media pin at `action-guard-coverage.test.ts:626-636`. FAILS if a site in one of the five is ever flipped permissive without an argued entry | That sub-wave's own gate. I did not write it and may not recommend an instrument I could not turn red (section 12) |
| RES-C | That `src/tools/symbol-count/count.ts`'s lexical instrument is correct. F1 proves it is not: instrument 2 must call `reScanTemplateToken()` on `TemplateHead`/`TemplateMiddle` to stay in template mode, and `instrumentsReconcile` is unusable as an alarm until it does | whoever owns RULING 135's tool | The fix, plus a fixture in `count.test.ts` containing a substituting template literal ABOVE a real call and a comment mention - the three cases in F1. The mutation that must turn it red: remove the `reScanTemplateToken` call and assert `excludedAsString` goes from 0 to 1 on the template fixture. `grep -n '\${' src/tools/symbol-count/count.test.ts` returns nothing today, which is why the defect shipped | A named follow-up on `src/tools/symbol-count/`. My write set is this one file |
| RES-D | That `fetchSubmissionRepoAction` (`submission-repo.ts:35`) rejects an active non-owner. Verified by COUNT only, at SW2. `submission-repo.test.ts:9-11` mocks `@/lib/supabase/auth` wholesale, so the guard never executes, and no `submission-repo.guard.test.ts` exists. Also: that file's `:3` comment still says `requireOwner()` | a remediation wave on `submission-repo.ts`'s test files | A `submission-repo.guard.test.ts` in the `grading.guard.test.ts:294-311` idiom - mock `@/lib/supabase/server` and `@/lib/supabase/app-users`, never the auth module; assert the action REJECTS with `OWNER_ONLY_MESSAGE` for an `active` non-owner, plus the PC3 non-vacuity assertion. FAILS PERMISSIVE if the action resolves | That wave's own gate. It is the only one of the 71 sites missing this |
| RES-E | Whether the 82 wholesale auth mocks under `src/app/actions` are being added faster than they are removed. 81 at `269e58d`, 82 at `587c210`. Each one blinds its file to every guard change | repo owner to schedule; it is a suite-wide obligation, not a sub-wave's | A count pin, in the shape `MEDIA_OWNER_ONLY_ACTIONS.length` is pinned at `action-guard-coverage.test.ts:599`: a source-shape test asserting the number of test files mocking `@/lib/supabase/auth` does not exceed today's figure. FAILS when the number grows, which is the direction that matters. The count MUST be taken with `MSYS_NO_PATHCONV=1` or the working-tree `grep` - see F3 | A dedicated pass, not an R2 sub-wave. R2 changes guards, not test architecture |
| RES-F | Whether any instructor-facing surface is now dead rather than merely owner-only. A7 establishes that a non-owner can reach none of the 71 capabilities; whether a control is RENDERED to them and fails, versus hidden, is not decidable here | repo owner - it needs a browser and a second account | None exists in this repo. No component is rendered by any test (`docs/loop/this-repo.md:114-118`), there is no `.env`, and the network is blocked | An owner check with one approved non-owner account against the deployed app. Costs nothing today: `auth.ts:299` - "there are no members yet (REL1)" |

---

## 12. What executed, what did not, and what I could not determine

**The tests I ran, through the wrapper `docs/loop/this-repo.md` mandates for any
multi-file check.** The per-argument `COVERED` lines are quoted verbatim, not
summarised, and no raw multi-path `vitest` command was used:

```
npm run test:paths -- src/app/actions/github-repos.guard.test.ts \
  src/app/actions/github.test.ts src/app/actions/github-content.guard.test.ts \
  src/app/actions/visualizer-coverage.guard.test.ts \
  src/app/actions/guard-overtightening.test.ts \
  src/app/actions/action-guard-coverage-github-cohort.test.ts \
  src/app/actions/action-guard-coverage.test.ts

 Test Files  7 passed (7)
      Tests  101 passed (101)
COVERED src/app/actions/github-repos.guard.test.ts               files=1 passed=37
COVERED src/app/actions/github.test.ts                           files=1 passed=27
COVERED src/app/actions/github-content.guard.test.ts             files=1 passed=5
COVERED src/app/actions/visualizer-coverage.guard.test.ts        files=1 passed=1
COVERED src/app/actions/guard-overtightening.test.ts             files=1 passed=10
COVERED src/app/actions/action-guard-coverage-github-cohort.test.ts files=1 passed=6
COVERED src/app/actions/action-guard-coverage.test.ts            files=1 passed=15
```

Wrapper exit 0. **37 + 27 + 5 + 1 = 70 executing per-site guard assertions
against 71 converted sites** - the missing one is F2.

**The structural gates, run WITH this document present, because it is a 1000-line
file added under `docs/` and `src/lib/no-emojis.test.ts` scans `docs` as well as
`src`** (its `roots` line - and note `docs/owner-private-secrets.md:715-719`
records that a citation to it at `docs/loop/seats.md:34-37` names `:243` while
the line has moved to `:254`, so I located it by content, not by that address):

```
npm run test:paths -- src/lib/no-emojis.test.ts src/source-bytes.structure.test.ts
 Test Files  2 passed (2) / Tests  21 passed (21)
COVERED src/lib/no-emojis.test.ts             files=1 passed=18
COVERED src/source-bytes.structure.test.ts    files=1 passed=3

npm run test:paths -- src/file-size-ceiling.structure.test.ts
COVERED src/file-size-ceiling.structure.test.ts files=1 passed=3
```

The emoji scan is the committed test, never hand-rolled (`grep -P` reports a
false clean here). The source-bytes gate is what catches a `\uXXXX` escape
landing as a literal character or a stray NUL. The ceiling gate scans `src`, not
`docs`, so it says nothing about this file's own 1000 lines; I ran it because a
green tree before hand-off is cheaper than a red one after.

**I ran NO MUTATION, and that is a limitation, not a claim of rigour.** My write
set is this one document, so I could not touch `src/`; `docs/DEV_LOOP.md` also
rules that no two agents may sabotage-verify on the tree at once, and a seat is
concurrently writing `docs/a39-fill-waves.md`. The three mutations this audit
would otherwise have run, each named with its owner:

1. **Flip one of the 71 sites to `requireUser()`** and confirm
   `action-guard-coverage-github-cohort.test.ts`'s bare-`requireUser` check
   turns red naming the action by file and line. Not run. Owner: already
   discharged three times by SW1, SW2 and SW3, each of which reports a verbatim
   red on one of its own sites - I am relying on those reports, which is weaker
   than running it, and saying so.
2. **Remove `reScanTemplateToken`-equivalent handling from
   `src/tools/symbol-count/count.ts`** and confirm a new template fixture goes
   red. Not run - there is nothing to remove, because it was never there; this
   is the mutation that must accompany the FIX. Owner: RES-C.
3. **Add a per-file exactness entry for the five audited files to
   `guard-overtightening.test.ts`, then flip one site permissive** and confirm
   red. Not run. Owner: RES-B. I am NOT recommending this instrument, only
   recording it as the shape the gap has, because an instrument I could not turn
   red is one I may not propose.

**What I could not determine.**

- **Whether `GITHUB_TOKEN` is set in the owner's deployment, or what scopes it
  carries.** There is no `.env` in this checkout. The severity of every reach in
  section 4 is conditional on a token existing with repo and org scope, and I am
  not resolving that condition. `github.repos.ts:10` throws when it is unset,
  which means an unset token makes all 71 actions fail for the owner too.
- **Whether any of the 71 capabilities is reachable in the UI by a non-owner
  today.** No component is rendered by any test here
  (`docs/loop/this-repo.md:114-118`), so every reachability statement in this
  document is a source-READING claim about guards and call paths. RES-F.
- **Whether `requireAppOwner()`'s rejection is honoured at runtime in all 71
  bodies.** Every one wraps its guard in a `try` that returns `{ error }`, which
  is the file convention and is what the 70 executing guard tests assert; but a
  source reading cannot prove a rejection is not swallowed somewhere unusual.
  `guard-overtightening.test.ts:70-74` states this same limit about itself.
- **Whether the 69-name PAT set is complete.** It is a floor over the eleven
  `src/lib/github.*.ts` modules plus `github-models.ts`, built by reachability
  to `ghFetch`/`ghJson`/`githubToken`. A PAT spend through a module naming none
  of those three, or through a dynamically-built identifier, is invisible to it -
  the same blind spot `count.ts`'s own `blindSpot` notice names. It cannot
  produce a FALSE restrictive verdict (a missing name can only make a site look
  less PAT-reaching, never more), so the direction of its error is safe for this
  audit's conclusion.
- **RULING 126's text.** Not in `docs/` (section 0). I applied it as my brief
  stated it and did not reason from "uncontained equals restrictive" anywhere.

---

## 13. Every quantity, with the command that produced it

Run from the repo root at `587c210`.

| Quantity | Command | Value |
|---|---|---|
| Owner-only call sites in the five files | `countSymbolOccurrences(..., "requireAppOwner").callCount`, summed | **71** (37 + 1 + 27 + 5 + 1) |
| Naive line count over the same five files | `naiveGrepLineCount`, summed | 76 - the 5 import lines are the gap |
| `requireUser` / `requireOwner` in the five files | same tool, both symbols | 0 and 0 |
| Guard lines changed by SW1-SW4 | `git show <sha> -- <five paths> \| grep -E "^[-+]" \| grep -vE "^(\+\+\+\|---)" \| sort \| uniq -c \| sort -rn` | 19 + 19 + 26 + 6 = **70**, all `requireOwner()` -> `requireAppOwner()` |
| Non-guard, non-import production lines changed by SW1-SW4 | same | **0** |
| `src/lib/github.ts` barrel size | `wc -l src/lib/github.ts` | 147 |
| PAT-spending names in the barrel's modules | AST reachability to `ghFetch`/`ghJson`/`githubToken` per module, plus 3 hand-verified cross-module edges | 69 |
| Non-spending barrel exports | same | 7 |
| Sites whose every PAT call is branch-gated | AST branch-gating walk | **3** - `deleteOrgReposAction`, `gradeReposAction` (both loop-over-input), `auditVisualizerCoverageAction` (real flag) |
| Exported arrow / function-expression consts in the five files | AST scan for exported `VariableStatement` with a function initializer | **0** |
| Non-test importers of the five action modules | `grep -rln 'from "\./<m>"' src --include=*.ts --include=*.tsx \| grep -v '\.test\.'` | 2 real (`deck-source.ts`, `steps.visualizer.ts`) + 1 false positive (`src/lib/github-models.ts`, the LIB barrel) |
| `REVIEWED_PERMISSIVE` files | `file: "..."` extracted from `:159`-`:303`, cross-checked against the `PERMISSIVE_FILES.size` pin at `:589` | 11, **none of them an audited file** |
| Guard test files under `src/app/actions` | `ls src/app/actions/*.guard.test.ts` | 12, **no `submission-repo.guard.test.ts`** |
| Executing per-site guard assertions | the wrapper's `passed=` per file | 37 + 27 + 5 + 1 = **70** against 71 sites |
| Tests run for this audit | `npm run test:paths -- <7 paths>` | 7 files / 101 tests passed, exit 0, one `COVERED` line per argument |
| Wholesale auth mocks, `src/app/actions/*.test.ts`, today | `grep -rl 'vi\.mock("@/lib/supabase/auth"' src/app/actions --include=*.test.ts \| wc -l` | **82** |
| Same, repo-wide | `grep -rl ... src --include=*.test.ts \| wc -l` | 89 |
| Same, at `269e58d` | `git grep -l -e 'vi.mock(.@.lib.supabase.auth.' 269e58d -- src/app/actions \| grep -c "\.test\.ts$"`, canary 0 | **81** - SW4's figure confirmed |
| `git grep` false clean | `git grep -F -l -e 'vi.mock("@/lib/supabase/auth"' HEAD -- src/app/actions` vs the same with `MSYS_NO_PATHCONV=1` | **0** vs **82** |
| Substituting templates in the count tool's own tests | `grep -n '\${' src/tools/symbol-count/count.test.ts` | **none, exit 1** |
| `excludedAsString` on `github.ts`, true value 0 | `countSymbolOccurrences` instrument 2 | **26** |
| This file's size | `wc -l docs/r2-overtightening-audit.md` | 1029 |
| This file's size, second instrument | `@(Get-Content docs\r2-overtightening-audit.md).Count` | 1029 |

---

## 14. Tree state

```
git status --short
?? docs/r2-overtightening-audit.md
```

**HEAD moved under me during this pass and I am reporting it rather than quoting
a stale snapshot.** At the start, `git status --short` showed
`?? docs/a39-fill-waves.md` - the concurrently-running seat's file, which I did
not open, read or write. The auto-commit hook has since landed it as `e46bd0d`
("plan(a39): seven waves, fully sequential"), so HEAD is now `e46bd0d` while
every measurement in this document was taken at `587c210`.
**That does not invalidate any of them:** `git show --stat --format="" e46bd0d`
is `docs/a39-fill-waves.md | 1775 ++++`, one file changed, nothing under `src/`.

The one remaining entry, `docs/r2-overtightening-audit.md`, is this document.
**No file under `src/` or `supabase/` was modified, staged or reverted by this
pass; every measurement above is a read.** No `git stash`, no `git add -A`, no
`git checkout --` was run at any point. The two fixture files proving F1 and the
four driver scripts were written to the session scratchpad at
`C:\Users\alexa\AppData\Local\Temp\claude\...\scratchpad`, never into the repo,
which is why `git status --short` shows nothing for them.
