# Private Pipeline snapshot publication

## App leverage and removal criterion

This claims INTEGRATION and GUARANTEED leverage: the app publishes one frozen
deck/PPTX/renderer package, verifies its commit, binds confirmation to the exact
reviewed snapshot and records a content-free reconciliation intent before egress.
A chat operator otherwise transfers those files manually and remembers which deck
was confirmed or whether a lost response created a repository. The removal
criterion is to remove review-fingerprint matching or move intent persistence
after egress in an isolated mutation: `repository-confirmation.test.ts` must fail
its changed-deck/late-result or persist-before-egress assertion. Removing PPTX
byte integrity must fail the uploaded-byte assertion in
`repository-publish.test.ts`. Source wiring alone does not establish this claim.

## Publish and render

In Slide Deck Pipeline, generate a current deck and choose generated deck design,
an uploaded template, or a saved library. Open the deck stage's **Private deck
repository** panel, enter a new private repository name, review the GitHub account
and package, then confirm publication. This requires app-owner access and the
server's existing `GITHUB_TOKEN` with private repository create/content access.
Publication does not start Copilot.

The package contains committed deck JSON and PPTX, applied objectives, a manifest
with SHA-256 file hashes, a signed publication seal and a frozen renderer. Unsaved
editor drafts and regeneration candidates are excluded. Optional context and
extracted source text are excluded unless explicitly selected and displayed for
review. The browser receipt retains their fingerprint rather than their text.

Template publication uses the same authenticated raw-source/library resolution
and title/bullet paragraph fill as **Download .pptx**. Review binds the original
bytes to the snapshot; confirmation reloads the source and refuses changed
originals or snapshots before GitHub egress. Changing the template, deck,
objectives, optional context or repository name invalidates review.

The complete original is included as `template/original.pptx`, disclosing its
original notes, hidden or unused slides, themes, layouts, images and embedded
assets to the private repository. Original notes/assets/layouts remain intact.
Generated notes, code and graphics remain in `deck.json`; they are not inserted
into template slides. Review this disclosure before confirming. Invalid PPTX,
excess slides/bullets and filled decks exceeding the download response limit are
refused. There is no generated-layout fallback.

Clone with your existing GitHub access, install Node.js 22, then run `npm install`
and `npm run render`. This produces `regenerated.pptx` from `deck.json` without app
keys. The package pins `pptxgenjs` for generated design or `jszip` for template
fill. Template rendering reapplies the fill to the included original. ZIP
metadata can vary: compare uncompressed parts or slide content rather than whole
ZIP bytes. Preserve the verified commit reference when the default branch moves.

An uncertain publication receipt is not success. Retry the same name and unchanged
snapshot to reconcile. The server only resumes a private repository bearing its
authenticated owner/snapshot marker; unrelated or public repositories are refused.
Uploads form one candidate tree/commit and use a non-forced branch update.
Recovery requires the same owner account and signing token. If either changes,
retain the repository link for manual reconciliation. Do not create a second
repository merely because a response was lost.

Before egress, browser storage must save the account, repository name and snapshot
fingerprint. Storage refusal prevents submission. After reload, review the account,
select the pending name and review again. A changed snapshot makes the intent
stale. Explicitly starting a new publication leaves the prior repository intact.
A late account-review response cannot confirm newer content.

## Copilot generation and continuation

Task dispatch requires explicit server configuration
`PRESENTATION_COPILOT_TASKS_ENABLED=true` and a configured GitHub token. The flag
is off by default in source. The production config was saved as `true`; it takes
effect on a subsequent successful deployment, and the signed-in production flow
still needs verification. Each initial or follow-up submission
requires its own button click and saved content-free intent/receipt. Publishing
alone authorizes neither task submission nor merge.

The action reauthenticates the app owner, verifies the signed private snapshot
manifest and every package blob, then creates or checks
`presentation-snapshot-<verified-commit>`. That dedicated source branch must point
exactly at the verified commit. A conflicting branch is refused; the app never
moves it. The task's `base_ref` is this branch. Live probing rejected a raw SHA
base, so sending a commit SHA is not the adapter's contract.

Open the returned GitHub task link and use **Refresh task status** to read current
state. Actual returned `/tasks/<id>` URLs are supported. Refresh verifies the
snapshot, source branch and session binding without dispatching another task;
it remains available when dispatch is disabled. A failed task that never started
a session can report failure but cannot supply a continuation branch.

After the prior task is completed or idle, enter a follow-up prompt and choose
**Submit follow-up regeneration task**. The server refreshes the prior task,
checks that its generated branch descends from the snapshot, and submits the
same frozen `base_ref` with that prior `head_ref`. Its continuation instructions
identify the prior task, branch and observed commit, require implementing the
owner request even without PR review comments, and preserve the current project
while updating its existing PR. No merge is required. Complete
follow-ups before merging. Copilot's PR targets the dedicated source branch; to
integrate the reviewed result into the repository default branch, change the PR
base in GitHub rather than merging into or otherwise moving the frozen source
branch. The app neither merges nor imports generated output.

If submission is uncertain, inspect GitHub task history before explicitly clearing
the pending intent. The app does not automatically retry a potentially accepted
task. A returned queued/in-progress state is not proof of finished output,
checkout commit, package hashes or PR ancestry.

GitHub's [June 4, 2026 changelog](https://github.blog/changelog/2026-06-04-agent-tasks-rest-api-now-available-for-copilot-pro-pro-and-max/)
extends the public-preview Agent Tasks REST API to Copilot Pro, Pro+ and Max;
the older Business/Enterprise-only wording in the REST documentation is stale.
The changelog lists classic/fine-grained personal access tokens and OAuth tokens.
This does not establish entitlement for every token: verify the actual account,
repository access and required Agent tasks permissions. The server's existing
`GITHUB_TOKEN` may lack them. See also the [Agent Tasks REST reference](https://docs.github.com/en/rest/agent-tasks/agent-tasks?apiVersion=2022-11-28).

## Evidence and remaining checks

[Live verification](pipeline-copilot-live-verification.md) separates local gates,
synthetic private-repository observations and the authenticated production browser
walk. Template publication, the initial Copilot source-tree proof and corrected
continuation all passed in the synthetic private-repository experiment. The first
follow-up attempt completed without a revision; that failure and the successful
corrected envelope are both recorded. Production exposure and credentials still
require the production checks recorded there.

Diagnostics record terminal publication outcome, total duration and bounded
slide/byte counts; task submission records outcome, duration, kind and bounded
prompt length; refresh records its read outcome/duration. Individual GitHub
create/upload/verification phase timings remain uninstrumented. No content,
repository names/URLs or credentials belong in those records.

Tests render no components. They cover owner refusal before egress, private
create/reconciliation, binary upload encoding, signed package verification,
standalone renderer subprocesses, shared-source template parity, ownership,
changed-original refusal, fit refusal and preservation of original parts. They do
not prove browser focus, keyboard behavior, a usable PowerPoint download, live
Copilot completion or production credentials. The owner browser walk must cover
those behaviors, reload recovery, current-versus-published warnings and interrupted
publication recovery in a disposable private repository.
