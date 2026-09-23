# Iteration caps: bounding argument without bounding verification

## The problem this solves

Artifacts that are revised and re-checked in a loop converge on the first two
rounds and then oscillate. Measured on a real project: four artifacts took 8, 9,
10 and 11 revision rounds each - about 48 rounds total - producing no shipped
code, while the one chunk that had already reached the implementation step
shipped verified, passing code in a single wave. A large share of findings in
later rounds were defects *introduced by the previous round's fix*, including
requirements silently dropped during a restructuring, and defects traceable to
the orchestrator's own rulings.

What ended a chain, every time: moving the claim to the party that could measure
it, asking the human a scope question, or replacing an assertion with a
construction that makes the bad state unrepresentable. What never ended a chain:
strengthening the same mechanism. One artifact's oracle went from five
hand-written cases, to a thirteen-row table, to a count assertion - and a single
build defeated all three.

**The principle: cap the steps that argue. Never cap the steps that measure.**

## Definitions

- **Artifact** - any model-authored document the loop produces: acceptance
  criteria, a design seat's output, a plan, test notes, a root-cause analysis,
  the chunking.
- **Round** - one author revision plus one fresh adversarial check of that
  artifact.
- **Defect class** - the *mechanism* of a defect, not its location. Two findings
  are the same class if the same corrective rule fixes both. Classes seen in
  practice: "a check whose assertion cannot fail"; "a quantity named but never
  defined, so the check binds a different object than the one it protects"; "an
  obligation discharged by citing a document without opening it".
- **Disposal** - ending a class without another revision of the same kind.
- **Residual** - a requirement knowingly not proven now, recorded with an owner,
  an instrument, and the step at which it will be measured.

## The caps

1. **Per defect class: two attempts.** The second attempt **must change kind,
   not strength**. Strengthening the same mechanism is forbidden at the second
   failure.
2. **Per artifact: two rounds, then THE QUESTION GOES TO THE OWNER.** Owner
   rule, 2026-09-23, recorded in `AGENTS.md` under "Two rounds, then ask" -
   which is the authoritative statement; this entry exists so the card does not
   contradict it. THERE IS NO ROUND THREE, and in particular no disposal round,
   which is what this entry used to prescribe. If a round-2 check returns
   defective, the orchestrator stops the rounds and asks, carrying: the
   unresolved question in the owner's terms, what each round concluded and why
   they disagree, a recommendation, and what is still running. A REPEATED
   finding means the artifact is wrong; a NEW finding each round usually means
   the thing being designed is underspecified - they need different answers, so
   say which shape it is.

   The disposals below are not withdrawn: they remain how an individual finding
   is disposed of WITHIN a round. What is withdrawn is the idea that a third
   round exists to apply them wholesale.

   Why the owner set it: round 1 finds real defects, round 2 finds real defects
   and starts surfacing questions the loop cannot answer from the code - which
   is exactly when a human has context the agents do not. Round 2 is also where
   the ORCHESTRATOR'S OWN RULINGS start being the thing under revision. On the
   day the rule was set, both A29 and A38 reached round 2 with blockers landing
   on the orchestrator's rulings rather than on the seat, and no seat revision
   can resolve those - only a decision can.

   Asking is NOT stopping. `AGENTS.md`'s never-stall rule is unchanged and
   outranks any reading of this one: the question rides alongside other work,
   and a turn that ends with a question and nothing running is a stall.
3. **Oscillation override.** If more than half of a round's findings are defects
   introduced by the previous round's fix, force disposal immediately,
   regardless of the counts.
4. **Never capped:** any step that *executes* something - running tests,
   mutation and sabotage passes, verification against the built diff,
   regression. Those run until clean. If they find defects, that is the system
   working, not looping.

## The four legal disposals

Exactly one of these ends a class. Anything else is another revision of the same
kind and is forbidden.

- **(a) Relocate** - move the claim to the seat or step that can settle it by
  measurement. Name the receiver **and** the obligation the receiver now
  carries.
- **(b) Reduce** - put a scope, cost or risk question to the human owner. A
  blocker that is really a product decision is not a defect, and no number of
  rounds will resolve it. A leverage claim the built diff does not support is
  the canonical (b): ship the thin version, redesign it, or drop it is a
  product call, and no number of rounds resolves it. Restating the same
  benefit more emphatically is not a disposal.
- **(c) Residual** - record it with an owner, an instrument, and the step that
  will measure it. It must appear in the shipping report.
- **(d) Delete** - withdraw the requirement, naming any existing enforcer it was
  protecting.

**Corollary, learned the hard way:** a requirement whose enforcer is an
already-landed test cannot be "relocated" to an artifact that does not exist
yet. Those stay as stated requirements until the receiving artifact exists.

## Checker output contract

Every check ends with:

1. a verdict and counts by severity;
2. **for every blocker: the class name, and whether it is NEW or
   REPEAT-OF-`<class>`**;
3. an honest stopping point naming what remains: *rulings*, *design*,
   *measurement*, or *nothing*.

Brief the checker explicitly: **never soften a finding to avoid triggering a
disposal.** Classification routes a finding; it does not grade it. A clean
verdict is a legitimate and desirable outcome - say so in the brief, or checkers
manufacture findings to look diligent.

## Orchestrator routing

| Check result | Action |
|---|---|
| All findings are NEW classes, artifact under its cap | Normal revision round |
| The artifact has had TWO rounds, whatever the findings say | **Stop. The question goes to the owner** (`AGENTS.md`, "Two rounds, then ask"). Not a third round, not a disposal round. Keep other work running while you ask. |
| Any REPEAT class | That class goes to disposal **now**; other new-class findings may still be revised in the same round |
| Stopping point says *rulings* | The orchestrator rules. **Do not re-dispatch the author.** |
| Stopping point says *design* or *measurement* | Route there; the artifact ships as it stands |
| Clean | Chain ends. **Do not order a confirmation round.** |

## Entry gates - cheaper than any cap

These prevent rounds rather than truncating them, and in practice removed more
rounds than the caps themselves.

1. **No unmeasured number in an artifact.** Every quantity names the command
   that produced it. Real toll from skipping this: a count of 13 where the true
   value was 11; a ratio imported from a sweep that measured a different
   quantity; "three enforcers" where there were five; "seven matching files"
   where there were 41. **In this repo specifically**, two line-counting tools
   disagree by 42 on `GradingRecordingPanel.tsx` - `@(Get-Content).Count` says
   964, `Measure-Object -Line` says 922. See `this-repo.md` section 3.
2. **Every pass condition names three things:** the object under comparison, the
   instrument that produces each quantity in it, and the direction of failure.
3. **Every restructuring round ships a disposition table** mapping each prior
   requirement to *kept* (with id) / *handed over* (naming receiver and
   obligation) / *withdrawn* (with reason and any enforcer it protected). **The
   checker audits that table before reading the new round on its own terms.**
   This exists because a restructuring silently dropped four requirements that
   had executing tests behind them.

## Anti-gaming rules

The caps fail in predictable ways. Close them.

- **The author never names the class.** Only the checker does; the orchestrator
  arbitrates disputes.
- **A "new" class that shares a corrective rule with a prior class is a
  repeat.** Relabelling is the obvious way to buy another round.
- **A residual without an owner, an instrument and a step is a deletion.** Call
  it that.
- **Disposal is recorded with evidence**, not asserted.
- **Caps bind the artifact, not the chunk.** A chunk may legitimately pass
  through many classes; what is pathological is three rounds on one class.
- **The orchestrator's own rulings are inside the cap.** They are a leading
  source of defects and are checked like any other artifact - several classes
  have existed only because two rulings collided, or a rule was one-directional.

## Tuning

Log per round: round index, findings by severity, how many were introduced by
the previous fix, and whether each class closed by revision or by disposal. If
rounds three and later keep producing genuine, non-self-inflicted defects in
this codebase, raise that artifact type's cap and record why. If they mostly
produce self-inflicted ones, lower it.

## What is never traded away

The caps do not touch the safeguards that actually catch defects, none of which
depend on round count:

- a **fresh checker who did not author the artifact**;
- **instruments that are executed and have controls** - a no-op mutant that must
  survive, a canary that must fire;
- **author is never verifier**, at every step.

Capping argument pushes disputed claims *toward* those checks, which are
strictly stronger evidence than another round of prose.
