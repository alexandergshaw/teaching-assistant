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

**SHAPE 5 - DISPLACEMENT, measured 2026-09-28. The one that defeats the stall
detector completely, because every turn passes it.**

A product fork appeared: whether a new grading surface should be a FILL of the
existing one or a SECOND surface. I stated a recommendation, asked the owner, and
then restated the same question at the end of turn after turn. **TWENTY-FIVE
COMMITS passed before the owner answered it.** Work was running every single one
of those turns, so the Stop hook never fired, and no rule above was violated as
written.

**The rule as written forbids GATING, not DEFERRING.** "Ask it as ONE batched
question while other work continues" is satisfied by ANY other work continuing. I
had ten well-specified sub-waves queued, each low-risk and independently
dispatchable, so "other work continues" was cheaply true every turn while the
recommended reading was never begun. The hard item was never blocked - it was
DISPLACED, over and over, by work that was easier to start.

**Why it felt like compliance rather than avoidance, which is the dangerous part:**

- The question WAS riding alongside. I restated it every turn, and restating a
  question feels like carrying it. **REPETITION SIMULATES PROGRESS.** Six
  restatements moved the item exactly as far as zero would have.
- The stall detector asks "was a subagent dispatched". It cannot distinguish
  working the queue from avoiding the item, and it never will, because both look
  identical to it.
- My MEMORY carried a stronger paraphrase - "even a product fork gets a
  recommended choice acted on NOW" - than AGENTS.md actually said. So I could
  recite the strong version in prose while complying with the weak version in
  practice, and feel consistent doing it. **When a memory is stronger than the
  rule it summarises, the rule is what gets followed.**
- Deferring a fork that is genuinely expensive to get wrong feels like prudence.
  It is only prudence if the deferral is BOUNDED.

**THE CONTROL, and it deliberately reuses machinery that already exists rather
than adding prose that can be recited and not followed:**

> **A RECOMMENDATION ON AN OPEN FORK IS A BACKLOG ITEM. File it as a row, in the
> same turn you state it, with yourself as owner and the recommended reading as
> its `owns`. Then every existing mechanism applies to it - the row count, the
> shipped-but-uncited guard, and the stall detector - and "is work running" stops
> being answerable with something else.**

An unfiled recommendation is a queue that has quietly stopped while looking full,
which is exactly what this file already says about owner-only entries. The row is
what makes the displacement countable.

**Plus a hard cap on restatement, because the row does not stop me talking:**

> **A recommendation may be restated ONCE without work started on it. The SECOND
> time you are about to restate the same recommendation, start it instead.**

That is mechanically checkable against the transcript, and it triggers long before
twenty-five commits. If starting the recommended reading would waste real work
should the owner disagree, say THAT in the question - "I am starting X; answering
Y costs me this much rework" - which gives the owner a reason to answer promptly
instead of a question they can leave open at no visible cost.

**What this does NOT license:** starting the recommended reading is not the same
as deciding the fork. Record it as YOUR reading acted on, not as an owner ruling,
and say so in the artifact - so that when the owner answers, the record shows
which parts were theirs. When the owner does answer, that is a DECISION and it
ends the activity; the work already started either continues or is discarded, and
neither outcome is a reason to have waited.

**SHAPE 5's CONTROL WAS NOT ENOUGH EITHER. Tightened 2026-09-28 on the owner's
instruction, the same day it was written.**

Both halves of it were SELF-REPORTED, and one of them was stored in the one place
that gets erased. Nothing checks that the row was filed. And the restatement cap -
"once, then start it" - counts across turns using a tally held in CONTEXT, which is
COMPACTED. After a summary the count silently resets to zero, so six restatements
present themselves as the first one, every time. **A cap I cannot remember is not a
cap, it is a suggestion that feels like a cap.** That is not a hypothetical: it is
the precise mechanism that let twenty-five commits pass.

So the control moves out of my head and into the two artifacts that survive
compaction - the backlog file and the git log:

> **1. THE TALLY LIVES IN THE ROW.** The fork row's note carries the date it was
> filed and the number of times the recommendation has been restated. Incrementing
> that number is PART OF restating it - if you are about to say it again and the
> row does not get touched, you are not allowed to say it again. A tally in the
> file reads the same after a compaction as before one.
>
> **2. "STARTED" HAS A DEFINITION, and it is a commit.** Work is started on a fork
> row when a commit's diff touches a path in that row's `owns`. FILING THE ROW IS
> NOT STARTING IT. Dispatching an agent to think about it is not starting it.
> Writing a design document about the fork is not starting it, because that is the
> artifact the deferral was already producing.
>
> **3. THE CAP IS IN COMMITS, NOT IN RESTATEMENTS.** A fork row with no commit
> touching its `owns` within TWO commits of being filed is overdue, and the next
> commit is that one. Commits are countable by anyone from the log, which is what
> makes this checkable at all; restatements were only ever countable by me.
>
> **4. THE QUESTION SAYS WHAT IS ALREADY RUNNING.** A fork put to the owner names
> the reading already started and what answering the other way would cost in
> rework. A fork with nothing started attached to it is a gate wearing a question's
> clothes, and the owner cannot tell the difference from the outside.
>
> **5. IF THE RECOMMENDED READING CANNOT BE STARTED AT ALL, IT IS NOT A FORK ROW.**
> It is owner-blocked. Say so in those words and list what it needs. What is
> forbidden is the third thing - a row that looks startable, is never started, and
> is restated instead.

**Why the tally and not a better rule.** Every version of this failure has been
defeated by prose, six times now. The difference here is not that the wording is
firmer; it is that steps 1 and 3 are answerable by READING TWO FILES rather than
by trusting my account of my own turns. When the enforcement and the thing being
enforced both live in my context, the context is the single point of failure, and
this session proved it fails silently.

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
  batched question while other work continues - never as a gate. **AND START THE
  WORK ON YOUR OWN RECOMMENDED READING IN THE SAME TURN.** See SHAPE 5: "while
  other work continues" is satisfied by ANY work, so on its own this clause
  forbids gating without requiring progress on the thing you recommended.

The user redirects if they disagree. That costs one message. Stalling costs a
whole round trip and stops everything.
<!-- END:never-stall-the-loop -->
