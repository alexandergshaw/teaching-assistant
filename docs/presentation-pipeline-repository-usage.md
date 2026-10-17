# Private Pipeline snapshot publication

## App leverage and removal criterion

This claims INTEGRATION and GUARANTEED leverage: the app publishes one frozen
deck/PPTX/renderer package, verifies its immutable commit, binds confirmation to
the exact reviewed snapshot and records a content-free reconciliation intent
before egress. A chat operator otherwise transfers those files manually and
remembers which deck was confirmed or whether a lost response created a repo.
The falsifiable removal criterion is to remove review-fingerprint matching or
move intent persistence after the remote request in an isolated mutation:
`repository-confirmation.test.ts` must fail its changed-deck/late-result or
persist-before-egress assertion respectively. Removing PPTX byte integrity must
also fail the exact uploaded-byte assertion in `repository-publish.test.ts`.
Passing source wiring alone does not establish this advantage.

## Operation

In Slide Deck Pipeline, generate a current deck and choose own layout. Open the
deck stage's Private deck repository panel, enter a new private repository name,
review the configured GitHub account and package, then confirm publication.
Publication requires workspace-owner access and the server's existing GitHub
token with private repository create/content access. It never starts Copilot.

The package includes the committed deck JSON and PPTX, applied objectives,
manifest with SHA-256 file hashes, signed publication seal and frozen own-layout
renderer. Notes/code/graphics are part of the deck. Optional context and extracted
source text are excluded unless explicitly selected and displayed for review.
The original context is not stored in the receipt; only its fingerprint is kept.
Unsaved editor drafts and regeneration candidates are excluded.

Clone the private repository with your existing GitHub access, install Node.js 22,
then run `npm install` and `npm run render`. The frozen renderer and pinned
`pptxgenjs` version build `regenerated.pptx` from `deck.json` without app keys.
ZIP timestamps may differ. Inspect slide content rather than comparing whole ZIP
bytes across render runs. Keep the generated commit reference to identify the
verified snapshot; default-branch changes do not change that reference.

An uncertain receipt is not success. Retry the same name with the unchanged deck
to reconcile; the server only resumes a private repo bearing the authenticated
owner/snapshot marker. It never overwrites an unrelated or public repository.
Uploads land as one candidate tree/commit and a non-forced branch update. Receipt
recovery requires the same owner account and server signing token. If either
changes, retain the repository link and ask the owner to reconcile manually.
Do not create another repository merely because a response was lost.

Before any publication request, browser storage must retain login, repository
name and snapshot fingerprint only. Storage refusal prevents that request. After
reload, review the account to recover the pending name, select that name for
reconciliation, and review again. Only an exactly matching recomputed snapshot
can reconcile; changed deck/context/objectives make the intent stale. Starting a
new publication requires its own explicit action and leaves any prior remote
repository intact. Account review is invalidated immediately by input changes;
a late account-review response cannot confirm newer content.

Template-backed publication is unavailable: this delivery does not yet package
the original authorized template asset and a reproducible template renderer.
Normal Pipeline template downloads remain unchanged. Initial and follow-up Copilot
forms are separate and visibly unavailable: neither issue text nor the currently
documented base-ref parameter proves an immutable worker checkout. No GitHub
task, PR, merge or Pipeline import is automatically initiated.

Residuals with instruments and receiving steps:

- GitHub integration owner: before enabling either Copilot form, establish a
  supported immutable-base contract, then run a test-account dispatch while
  moving the default branch. Verify actual worker base commit, package hashes,
  renderer output and resulting PR ancestry at integration Verify. Until then,
  task status is not started and PR status is none reported.
- Template integration implementer: package an authorized original asset and
  reproducible fill renderer, prove fit-refusal and notes/layout preservation,
  then enable template publication in a separately reviewed implementation.
- Diagnostics implementer: current publication instrumentation is one terminal
  total-duration record with bounded slide/byte counts and fixed outcome code;
  individual create/upload/verification timings are not yet separate records.
  Instrument those phases with success/returned-failure/transport outcomes and
  paired JSON/CSV privacy tests before claiming phase-level diagnostics coverage.
- Owner browser verifier: at final Verify, check account review and keyboard
  navigation, current-versus-published warning, reload recovery, private GitHub
  access, downloaded PPTX usability and a retry after an interrupted upload in a
  disposable private test repo. No live mutation was performed by local tests.

Tests render no components. Local tests exercise owner refusal before egress,
private create/reconcile, exact binary blob encoding, signed manifest/file
verification, independent renderer subprocess and source wiring. They do not
establish live GitHub/Copilot behavior or browser focus and download receipt.
