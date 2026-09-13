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
