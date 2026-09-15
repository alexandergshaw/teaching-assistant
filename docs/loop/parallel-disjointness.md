# Working items simultaneously: the disjointness rule

Owner-supplied spec, adopted 2026-09-13. `DEV_LOOP.md` says disjoint backlog
items are worked simultaneously; THIS card says what "disjoint" means, and it
is stricter than the word sounds.

---

## 1. The rule

> **Two items may run simultaneously only if they are disjoint in BOTH senses:
> their file sets do not intersect, AND neither establishes a fact the other
> designs against.**
>
> **Cap a simultaneous wave at 2-3 items.**

Two failures, and only the first is the one people guard against:

1. **Two agents edit the same file and one silently loses.** It does not
   surface as a conflict. It surfaces later as a requirement that mysteriously
   is not implemented.
2. **Two agents with NO shared files still collide**, because each designs
   against facts the other is concurrently establishing. Their outputs are
   individually coherent and mutually incompatible. This one passes every
   file-level check and is invisible until integration.

A rule that only prevents (1) will feel like it works, and will not.

---

## 2. Half one - exact-path disjointness, computed not eyeballed

**An item's file set is the files it edits PLUS the tests that assert on the
behaviour it changes.**

That definition is correct and has been quoted at people while it was still
missed five times in one day (all five in `docs/BACKLOG.md`, item L10) -
because nobody applied it to the CALLERS. The gap is not the principle, it is
the missing procedure: **before writing an owns list, grep for the symbol
being changed and for the module's own path; for every hit, ask whether this
change reaches it; include the file if it does.** Do this for the change
itself, not for a summary of it - an owns list built from the description
("add the roster to the facts blob") skips exactly the callers a grep would
have found.

State the failure signature plainly, because it is what makes the procedure
worth running: **a missing caller is never a red test.** It is a green one -
either a capability that ships dead behind an untouched caller, or a wave gate
that passes while the suite goes red on a stale fixture nobody's list
included. In this repo that second failure is invisible to every command an
implementer runs, because vitest does not typecheck; only `tsc` sees it, and
`tsc` has exactly one caller (section 5 below).

The second clause is where this fails. A one-line change to a shared helper
edits one file and can break forty test files - and those belong to whoever is
working in them right now.

1. Start from the files the item obviously edits.
2. Add every file referencing the symbol or behaviour being changed. A
   repo-wide search for the function, constant, endpoint, table or config key
   is the cheap version.
3. Do it for every candidate.
4. **Intersect mechanically** - concatenate, sort, print duplicates
   (`sort | uniq -d`). Paste the output. **Empty output is the only pass.**

**Pair every search with a canary** - a search for a string you know is absent,
which must return zero, plus one you know is present, which must hit. In THIS
repo that is not a theoretical precaution: **`grep -P` is broken here and exits
0 without checking anything**, so a `-P` search reports a clean intersection
for two items that overlap completely. Use `grep -E` or `Select-String`.

Do not eyeball this. Two file lists that look unrelated routinely share a test
helper, a fixture, a sweep test that walks a directory, or a barrel export.

---

## 3. Half two - informational independence

> **List the facts each item must assume to start. Who establishes each fact?**
> If either establishes a fact the other assumes, they are COUPLED, however
> disjoint their files.

Couplings that pass a file check:

- one defines a data shape or interface the other codes against
- one decides a naming or vocabulary the other uses
- one measures something - a limit, a count, a behaviour - the other's design
  depends on
- both consume a third thing that is itself about to change

When two items are coupled there are exactly three options:

1. **Sequence** - the establisher runs first; the second is re-briefed with its
   output.
2. **Merge** into one agent, if the coupling is mutual rather than directional.
3. **Extract the shared contract** into its own earlier step, run ALONE, and
   hand both items its output as a fixed input.

Option 3 is right whenever more than two items depend on the same undecided
thing.

---

## 4. The cap is 2-3, and this repo has paid for exceeding it

Beyond three, agents rediscover each other's findings. The spec records a
seven-agent wave in which three agents independently found the same blocker,
two independently found the same dead function, and one wrote a complete
solution to a problem a sibling was concurrently proving did not exist.

**Our own instance, 2026-09-13:** four design seats fanned out at once on G3.
The UX pass finished at 20:58 and the reliability pass at 21:01, so UX could
not have read the matrix it contradicted - one recommended a silent degrade on
research failure, the other required distinguishable notices. Both internally
sound; only one could ship. Resolving it deleted a checked artifact's
conclusion. Full account in `wave-dispatch.md`.

None of that is caught by review, because every artifact is internally correct
and answers its own brief.

---

## 5. Shared-resource collisions specific to this repo

File sets are not the only shared thing. Before dispatching concurrently:

- **`npx tsc --noEmit` has exactly ONE caller.** It races on
  `tsconfig.tsbuildinfo`. Two agents running it concurrently produce results
  neither can trust. Name the single owner in the briefs and forbid it to the
  others.
- **Sabotage verification mutates the shared tree.** This repo REQUIRES proving
  a test can fail by breaking the implementation and restoring it. During that
  window every concurrent measurement by a sibling - a test run, a build, a
  line count - is untrustworthy, even if the restore is perfect. Two agents
  must not sabotage-verify at the same time on one tree. Sequence them, or give
  one a private worktree.
- **`git stash` reverts every sibling's files.** Forbid it in every concurrent
  brief.
- **A stale `.claude/worktrees` copy is returned FIRST by Glob.** An agent can
  edit the copy, pass every gate, and change nothing real. Require
  `git status --short` as proof of what was actually touched.
- **Shared docs are files too.** `docs/BACKLOG.md` and `docs/REGRESSION.md` are
  edited by nearly every chunk. If an agent's brief lets it write to one, the
  orchestrator must not write to it in the same window - including to record an
  unrelated finding.

---

## 6. Failure modes

- **Computing the set from the item's description rather than from the code.**
  The description says what the item intends; the search says what it touches.
- **A search that silently returns nothing** - broken glob, an exclusion
  filter, a too-narrow root, or `grep -P` here. Always pair with a canary.
- **Forgetting tests, fixtures and sweeps.** A test that walks a directory
  collects new files automatically, so an item that ADDS a file to that
  directory is not disjoint from whoever owns that sweep. This repo is full of
  them: the `ta-` key exact-set scans, `file-size-ceiling.structure.test.ts`,
  `no-emojis.test.ts`, `source-bytes.structure.test.ts`, and the CSS
  orphan-class ratchet.
- **Treating "we checked disjointness once" as durable.** Sets change as work
  proceeds. Re-check before each wave.
- **Parallelising because you can.** If two items are both small and both touch
  the same area, sequencing costs minutes and removes the whole risk class.

---

## 7. Checklist before dispatching a wave

- [ ] For each candidate, compute the file set: **edits + tests asserting the
      changed behaviour**.
- [ ] Each search paired with a **canary** (one that must hit, one that must
      not). Never `grep -P` here.
- [ ] **Intersect mechanically**; paste the output; empty is the only pass.
- [ ] For each pair, run the **facts test**: does either establish what the
      other assumes?
- [ ] Coupled pairs: **sequence, merge, or extract the shared contract**.
- [ ] Wave size **<= 3**.
- [ ] One named owner for `tsc`; no two agents sabotage-verifying at once.
- [ ] Any agent doing mutation or destructive experiments gets a **private
      worktree**.
- [ ] Tell each agent **which paths are not theirs, by name**, and that the
      sets were verified disjoint.
