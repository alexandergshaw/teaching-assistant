# Repo grader continuation incident

The owner requested general repository grading, Windows executables, a full
live verification, and a push to main. The work had not been delivered when
the preceding turn ended. The current candidate is in the isolated
`.worktrees/wncc-execution-audit` checkout; that is a location, not a delivery.

`git log -15 --format="%h %ci %s"` in that checkout shows the latest delivered
change as `d809f516` on 2026-11-13 at 18:49 Central. That change concerns the
visibility of earlier instructor reviews. The preceding delivered execution
change was `3f687832`, scoped to Module 12. Neither establishes the later
general request.

The transcript shows several distinct causes for the stop. The existing
implementation was limited to one assignment, while generalizing it exposed
new runtime, rubric, and persistence requirements. Automatic approval review
rejected a test operation that could replace grading functions or remove a
constraint; it was not performed. The user subsequently approved a clean test,
but the clean-branch connector calls hung and produced no branch. PGlite tests
used synthetic prerequisites and stubbed authorization or settlement, so they
did not establish hosted-database security or concurrency. The full candidate
test suite was not clean, and no live general grading flow was verified.

The host also allowed the critical path to expand into artifact checkpoints,
cross-tick continuation, and other control work before establishing a small,
verified general grading path. It spent long periods awaiting tools and agent
results; some calls required interruption after exceeding the communication
limit. The final response accurately named missing work, but ended the turn
while implementation and independent verification remained actionable. A
status report is not a delivery boundary.

The practical controls are the existing requested-item completion assertion and
the critical-path rule in `docs/loop/traps-orchestration.md`: keep the active
host turn open, consume worker results, prioritize the requested grading flow,
and bound waits to permit progress reports and alternative work. A failed or
rejected operation is not retried through a disguised equivalent; continue
independent work and preserve the exact evidence. Only invoke
`manual-handoff.ts` for a real configured manual-loop item; it is a snapshot
assertion, not an automatic Codex stop hook or a mechanism that wakes the chat.

This file records the incident; it does not enforce continuation. The available
host tools did not expose an automatic final-response interception or durable
wakeup mechanism. Do not claim that a new prose rule, dispatch marker, or
operator-attested JSON file prevents a stop.
