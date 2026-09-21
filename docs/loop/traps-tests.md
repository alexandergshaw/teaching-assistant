# Traps: tests and mutation

Every rule here carries the failure it prevents. A rule with no instance behind
it does not belong on this card.

---

**A test is not evidence until you have watched it fail.** During the
`canvasFetch` transport migration a sabotage check stayed green for the wrong
reason: the sabotage reverted a call to the platform `fetch`, which escaped a
mock installed on `canvasFetch`, made a real request to a live Canvas host, and
got back a 401 whose message was identical to the one the test expected. The
test could not tell a correct implementation from a broken one plus a working
internet connection. `vitest.setup.ts` now throws on any unmocked `fetch`. Mock
`canvasFetch`, not `fetch`, on Canvas paths.

**Sabotage the implementation, not the test.** A guard test for an ownership
allowlist passed on both the correct and the broken implementation; nobody had
tried breaking the code to see the test go red. Deleting an assertion proves
only that the assertion runs.

**Coverage must be a property of construction, not of enumeration.** Recurring
disguises, all seen: a text search standing in for a type check; an assertion
reading a hardcoded value the implementation also reads; an oracle covering 5 of
13 reachable states; and a count assertion whose "unmapped input" branch could
never fire because the generator and the expected-value table shared the same
hardcoded axes. A constructor, a discriminated union, or an enumerated product
cannot silently miss a case; a hand-written list of five can.

**Every count assertion needs a demonstrated failure mode.** Name the input that
makes the number wrong, and show it going red. `src/app/.../headless.test.ts`
asserts an exact set size for exactly this reason, and the count must be bumped
in the same commit that adds or removes a member.

**A refactor disarms the test that compared the two things it merged.**
Consolidating two implementations turned the test that checked them against each
other into a tautology - it now compares a function to itself and passes
forever. When merging implementations, freeze a literal oracle of the resolved
output first, and prove that oracle catches the worst failure mode before
converting anything.

**Freeze the oracle before the migration, not after.** The safe order is:
capture the resolved output as a frozen literal, sabotage the current code and
watch the oracle fire, then convert one file at a time.

**Never import a helper from another `*.test.ts`.** Doing so re-runs the other
file's `describe` blocks inside the importing file's run - doubling its tests
and, worse, running them under the wrong setup. Duplicate the helper. This is
why `src/lib/count-lines.ts` is a plain `.ts` leaf shared by two structure tests
rather than living in either of them.

**A fixture that uses a shape the UI never emits proves nothing.** A green suite
once rested entirely on fixtures whose value shape no code path produced.
Fixtures come from the emitted shape - construct them with the same function the
app uses, or copy a real payload.

**Adding a validator to a membership test changes the set.** A coercion
introduced into one side of a superset or disjointness check against a frozen
raw-comparing sibling breaks the relationship silently. Validate the emitted
values, not the comparison.

**Source-text tests over-specify, twice measured.** Assertions that pinned the
exact spelling of an implementation forced contorted code on two occasions. Pin
the *fact* and the *ordering*; never the wording. This matters more here than
elsewhere because source-text tests are the only wiring check available - see
the next rule.

**A green suite proves nothing about markup, focus, or keyboard behaviour.**
vitest here is node-env and collects only `src/**/*.test.ts`; no component is
rendered by any test in this repo. Every UI and accessibility claim is a reading
claim, and the loop must say so rather than letting a passing suite imply
otherwise.

**A constant back-imported from a parent module creates a cycle that silently
yields `undefined`.** Splitting a file and reaching back up for a shared
constant type-checks, passes tsc, and produces `undefined` at runtime. Push the
constant down into the leaf.

**A multi-path vitest filter silently drops any argument it does not match,
whenever another argument matches.** vitest's own filter is a union with no
per-filter accounting: a missing path, a typo, an existing non-test file, or a
real but test-less directory sitting next to one real match still exits 0 -
under `npx vitest run`, bare `npx vitest`, `--run`, `npm test`, `npm test --`,
and `npm run test --`, in both shells (docs/l14-scope.md, section 1). Use
`npm run test:paths <p1> <p2> ...` for two or more paths instead
(docs/loop/this-repo.md, "Running a named set of test files"); it fails unless
every argument is credited at least one executed, passing file. Through
`npm run test:paths`, the wrapper's own flag-refusal rule almost never fires,
because npm swallows an unrecognised flag before the wrapper ever sees it
(measured on `-t` and `--reporter`, in both shells - see the next entry for
`npm`'s handling of `--`). Safety there holds for two other reasons instead: a
flag's displaced VALUE arrives as a plain positional and fails the wrapper's
existence check, and a flag npm swallows whole only makes the run BROADER,
never narrower. The direct `node ... cli.ts` form still refuses a flag
outright. Do not claim the wrapper refuses flags through `npm run`.

**An optional-value flag can consume the next positional argument, including a
test file, and overwrite it.** `vitest list --filesOnly --json` followed by a
real test file consumed that file as `--json`'s (optional) output path and
overwrote it with two bytes, deleting 302 lines of a real test file in this
repo during this very trap's own measurement (docs/l14-scope.md, section 1.6).
The fix in `src/tools/vitest-paths/`: every flag passed to vitest is in joined
`--flag=value` form, never a bare flag followed by a separate value token, and
its JSON report path is built under the OS temp directory, never inside the
repository.
