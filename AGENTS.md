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
# Two rounds, then ask (applies to the MAIN session only)

**Owner rule, given in session 2026-09-23.** Any activity inside the dev loop -
a scope, an architecture pass, acceptance criteria, test notes, a plan, an RCA,
an implementation - gets at most TWO rounds. If a second round does not settle
it, THE QUESTION GOES TO THE OWNER instead of a third round.

Concretely: artifact, check, revision, check. That is round 1 and round 2. If
the round-2 check returns defective, DO NOT dispatch a revision 3 and DO NOT
dispatch a round-3 check. Stop the rounds, state what is unresolved, and ask.

**THE ANSWER ENDS THE ACTIVITY. It does not feed another round.** Tightened by
the owner on 2026-09-23, because without this the rule degrades into a slower
revision cycle with a human inside it - ask, revise, check, ask again - which
costs more than the three rounds it was meant to prevent.

So the question put to the owner must be shaped so that EVERY answer terminates
the activity. Not "which of these should the next revision explore", but "this
activity produces X or Y; which do you want". When the answer arrives, the
activity is DONE: the artifact ships as it stands, with the answer applied and
everything still unresolved recorded as residuals with owners and instruments.

A revision that applies a decision already accepted is not a round - it is
transcription, and it must not reopen anything the decision did not touch. If
applying the answer seems to require re-deciding something else, that is the
signal the question was the wrong one; say so and ask the terminating question
instead of starting the cycle again.

The next ACTIVITY on the same item - a wave plan consuming a finished scope, an
implementation consuming a finished plan - is a new activity with its own two
rounds. What is forbidden is a third round of the SAME activity, however it is
labelled.

**What to send the owner.** Not "it failed again". One message carrying:

- the specific question or fork that two rounds did not settle, in the owner's
  terms rather than the loop's;
- what each round concluded, and WHY they disagree - a repeated finding means
  the artifact is wrong, a NEW finding each round usually means the thing being
  designed is underspecified, and those two need different answers;
- what I recommend and what it would cost to be wrong;
- what is still running, because this is a question, NOT A STOP.

**This does not pause the loop, and it must not become a way to.** The
never-stall rule above is unchanged and outranks any reading of this one. The
question rides alongside other work exactly like every other non-blocking
question in this file: dispatch or confirm other backlog work in the same turn
you ask. A turn that ends with a question and nothing running is a stall
wearing this rule as a costume.

**Why the owner set it.** Rounds are expensive and their yield falls off. Round
1 finds real defects. Round 2 finds real defects and starts surfacing questions
the loop cannot answer from the code - which is exactly when a human has the
context that the agents do not. A third round spends a lot to rediscover that.
Two rounds is also where THE ORCHESTRATOR'S OWN RULINGS start being the thing
under revision: on 2026-09-23 both A29 and A38 reached round 2 with two of the
blockers landing on MY rulings rather than on the seat, and no seat revision
can resolve those - the only thing that resolves them is a decision. That is
the signal this rule exists to catch.

**What still counts as one round.** A mechanical re-run after a gate failure, a
citation repair, or a revision that only applies rulings already accepted is not
a new round. A round is a CHECK-AND-REVISE cycle over the substance. Do not game
the count in either direction.

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

**THE TWO SHAPES THAT DEFEATED THE TEST ABOVE ON 2026-09-20, both in one
session, after it had already been tightened twice. The test was not wrong;
it was not APPLIED, because neither turn felt like a stall.**

**SHAPE 1 - THE OFF-BACKLOG INTERRUPT.** The owner asked for help with an
unrelated file (a resume document). That work was legitimate, foreground and
correctly done - and for three consecutive turns ZERO backlog work was running,
because the interrupt absorbed the whole turn. A user handing you another task
does NOT pause the loop. It changes what the FOREGROUND of the turn is; the
background queue is supposed to keep moving underneath it. THE RULE: when an
off-backlog request arrives, dispatch or confirm backlog work IN THE SAME TURN
you start the new task. The mechanical test does not have an exemption for
"the owner asked me something else", and it must not grow one - an interrupt is
the easiest moment to stall while feeling maximally responsive.

**SHAPE 2 - THE DISMISSED QUESTION.** A question was asked, the owner dismissed
it, and the turn ended with "Standing by." That is a stall wearing deference's
clothes. A dismissal is not an instruction to stop working; it is a refusal of
THAT QUESTION. Two separate errors compounded: the question should not have
been a gate in the first place (see the tightening below), and once dismissed,
the correct move is to keep the backlog moving while waiting - not to idle.
NEVER END A TURN WITH "standing by", "let me know", "waiting on you", or any
variant, while the backlog has a dispatchable item.

**SHAPE 3 - THE KILLED AGENT, 2026-09-22.** The owner stopped five running
agents at once. I checked the tree for damage (correctly - a killed
implementer had been stopped mid-sabotage, leaving a mutated file and tests
that no longer matched it), fixed that, and then ENDED TWO TURNS WITH NOTHING
RUNNING, closing with "Say the word and I'll restart" - the banned
idle-waiting phrase, verbatim. The owner's next message was "restart both",
which is the round trip the rule exists to prevent.

The reasoning that produced it felt like respect: the owner had just
intervened, so surely anything I dispatch is unwelcome. That is SHAPE 2 in new
clothes. STOPPING AN AGENT KILLS THAT DISPATCH, NOT THE QUEUE. It is
information about THAT agent - too slow, wrong direction, wrong moment - and
says nothing about the other forty-odd rows. A stop is not a stop-work order
unless the owner says so in words.

**THE RULE: after a kill, the same turn that reports the tree state also
restarts the killed work, re-scoped if the kill suggests why, or starts the
next item if the killed work is genuinely unwanted.** If it is truly unclear
whether the owner wants that work at all, say which reading you took and
dispatch on it - never park BOTH the killed work and the queue and wait.
One legitimate exception: the owner says stop working, in which case say so
plainly and stop.

**A killed implementer is a tree hazard first.** Check `git status --short`
and the diff before anything else: a kill can land between "mutant applied"
and "restore from backup", which leaves production code holding a deliberate
defect while its tests expect the fix. That check is right and must stay - it
is only the IDLING AFTERWARDS that is the violation.

**SHAPE 4 - THE CONTROL-WRITING TURN, 2026-09-23.** The turn that ended with
no work running was the turn that wrote a root-cause analysis and tightened
the implementer brief. Improving the loop is the one kind of work that feels
like it earns a pause - the queue is not moving because you are fixing how the
queue moves. It does not earn one. The turn also closed by listing three
questions as "still with you", which reads as a handoff rather than an idle,
and that is the tell: A LIST OF OPEN QUESTIONS IS NOT WORK RUNNING. A question
you are waiting on is not permission to stop; it is a reason to dispatch
something that does not depend on the answer.

THE COUNT SO FAR: this rule has now failed SIX times and been tightened five,
which is the evidence that prose alone does not hold it. As of 2026-09-23 the
Stop hook carries a STALL DETECTOR: it blocks when no subagent was dispatched
during the turn that is ending, and its block message names the escape for the
one legitimate stop (every remaining item owner-blocked). The prose below
stays because it explains WHY; the detector is what enforces it.

**THE CONTROL, tightened to close both.** The test above asks whether work is
running. Both failures answered "no" honestly and ended the turn anyway,
because the turn had an obvious non-backlog purpose. So the test now has a
second clause, and it is not optional:

> **A TURN THAT ENDS WITH NO BACKLOG WORK RUNNING IS A STALL REGARDLESS OF WHAT
> ELSE THE TURN ACCOMPLISHED. Not if the owner asked for something else. Not if
> a question was dismissed. Not if the other work was urgent, correct and
> finished. The only legitimate stop is the one named above: every remaining
> item is owner-blocked, and you have said so and listed what each needs.**

Two corollaries, both learned the same day:

- **A blocking question is still forbidden when it is about someone else's
  file.** The dismissed question asked which of three readings of a formatting
  request was meant. The correct shape was to pick the most likely reading, act
  on it, and let the question ride alongside - exactly as for a product fork.
  "I measured X and your screen shows Y, so my model is wrong" is a finding to
  report while continuing, not a reason to stop.
- **When measurement and the owner disagree, the owner is describing the
  artefact and you are describing your model of it.** Say the measurement,
  believe the owner, and act. Do not ask them to reconcile it for you.

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
- End a turn with "standing by", "let me know", or any idle-waiting phrase
  while a backlog item is dispatchable.
- Let an off-backlog request from the owner absorb a whole turn with no backlog
  work running underneath it.
- Treat a dismissed question as an instruction to stop working.
- Treat a KILLED AGENT as an instruction to stop working. A stop kills that
  dispatch, not the queue. Restart it, re-scope it, or start the next item -
  in the same turn you report the tree state.
- Offer to restart something instead of restarting it ("say the word and I'll
  resume"). That is the idle-waiting phrase with a different costume.

**Do:**
- Finish a chunk, push it, and start the next one in the same turn.
- Keep working while background agents run; their results arrive on their own.
- Reserve a blocking question for a genuine fork where proceeding under any
  assumption would be unsafe or would waste the work if wrong. Ask it as ONE
  batched question while other work continues — never as a gate.

The user redirects if they disagree. That costs one message. Stalling costs a
whole round trip and stops everything.
<!-- END:never-stall-the-loop -->
