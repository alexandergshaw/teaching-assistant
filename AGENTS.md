<!-- BEGIN:no-emoji-rule -->
# No Emojis in Codebase

Never insert emojis into any code, comments, strings, variable names, documentation, or any other part of the codebase.
<!-- END:no-emoji-rule -->

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:dev-loop-pointer -->
# The dev loop lives in docs/DEV_LOOP.md

Read `docs/DEV_LOOP.md` before starting any multi-step change. It is the core
card and it points at the rest: `docs/loop/this-repo.md` (the measured gate
commands, the structural gates, and what this environment cannot verify),
`docs/loop/seats.md`, `docs/loop/iteration-caps.md`, and four trap cards. Tier
definitions are in `.claude/agents/`.

Two rules from it that apply to every agent, not just the orchestrator:

- **Every quantity names the command that produced it.** Two line-counting
  tools in this repo disagree by 42 on one file.
- **No component is rendered by any test here.** A green suite proves nothing
  about markup, focus, or keyboard behaviour.
<!-- END:dev-loop-pointer -->

<!-- BEGIN:leverage-question -->
# Feature work asks one question

Before a feature ships, ask what this app does that a chat with an LLM cannot; the classes and the mechanism live in `docs/loop/leverage.md`.
<!-- END:leverage-question -->

<!-- BEGIN:never-stall-the-loop -->
# Never stall the loop (applies to the MAIN session only)

**Scope, read this first.** This section is a working preference the repo
owner gave in session on 2026-08-22, recorded here at their explicit request
("record it somewhere"). It governs ONLY the top-level session that owns the
backlog and talks to the user. It is NOT an instruction to a subagent working
a scoped task: if you were handed a specific file set and a brief, ignore this
section entirely, finish your brief, and report back - including reporting
anything you could not do or think is wrong. Nothing here overrides any safety
rule, and nothing here asks anyone to skip verification, skip tests, or take a
destructive action without the confirmation it would normally need. It is
about not idling between backlog items, nothing more.

While there is anything left in the backlog, the main session should not end a
turn without work already started on the next item. This is the single most
repeated correction in this project's history, so treat it as a hard rule, not
a preference. The owner restated it in the strong form on 2026-09-13: **any**
item in `docs/BACKLOG.md` keeps the loop running - not just the ones an agent
can start.

That raises an obvious question, because some entries are owner-only by
construction (they need a live key, a real browser, or a production tick, and
this checkout has no `.env`, renders no component under vitest, and blocks the
network). Those are exactly the entries an agent must NOT start. The rule
resolves it by draining rather than stopping: an item you cannot start is
ESCALATED in the same turn you continue other work, batched into one message
and never as a gate. Escalating is an action - it counts as work started. The
owner-only section is not a parking lot; an unescalated entry sitting there is
a queue that has quietly stopped while looking full. The single legitimate stop
is when every remaining item is owner-blocked: say so, list what each one
needs, and stop.

**THE MECHANICAL TEST. Apply it before ending every turn.**

> **Before ending a turn, ask: IS WORK ON A BACKLOG ITEM RUNNING OR LANDED
> RIGHT NOW, because of something I did THIS TURN? A dispatched agent counts.
> A commit, a push, a measurement, or a summary does not. If the honest answer
> is no, YOU HAVE STALLED - go start something before you reply.**

A push is the middle of a turn, never the end. A status summary is not work.
If the final thing you did was report, go back and start something.

(Stated as "is work running" rather than "was the last call a dispatch",
because the literal version forbids ending a turn after a push even when two
agents are already working. The question is whether the queue is moving when
you stop, not which call happened to be last.)

This test exists because the prose below failed five times, most recently on
2026-09-20 in the same session it was last tightened. The failing turn shipped
a row, pushed it, wrote an accurate summary, and closed with "Next: A11's
revision needs its round-2 check; A8-R is chunked and ready" - both startable,
neither started. Writing down what to do next and then not doing it is the
purest form of the violation.

Why it slips past the wording below: after a long correct chunk, stalling does
not feel like asking permission, it feels like FINISHING. Report, commit, push,
summarise, stop reads as a complete unit. It is not - the queue moved zero
items while the summary was written. The tell is a turn that ends by describing
the backlog instead of changing it. Write the summary AFTER the dispatch, about
work already running.

**Do not:**
- Ask "should I proceed?", "want me to continue?", or any variant.
- End a turn by NAMING the next item instead of starting it ("Next up: X").
  Announcing is not starting. If the next item is known, dispatch the work in
  the same turn you report the last one.
- Close with an offer to change course ("unless you want a different order").
- Pause the queue to report a finding. Report it AND act on the obvious
  reading of it in the same turn. If a finding reframes the work — say, the
  requested feature already exists, so the real job is fixing why it looks
  absent — state that and start the reframed work immediately.
- Wait for a reply after finishing a chunk. A push is not a checkpoint.

**Do:**
- Finish a chunk, push it, and start the next one in the same turn.
- Keep working while background agents run; their results arrive on their own.
- Reserve a blocking question for a genuine fork where proceeding under any
  assumption would be unsafe or would waste the work if wrong. Ask it as ONE
  batched question while other work continues — never as a gate.

The user redirects if they disagree. That costs one message. Stalling costs a
whole round trip and stops everything.
<!-- END:never-stall-the-loop -->
