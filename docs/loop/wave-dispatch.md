# Dependency-wave dispatch

**Dispatch design seats in dependency waves. Within a wave, run in parallel.
Never fan out every concern at once.**

A wave boundary exists wherever one seat's output is an *input* to another's -
that is, wherever the later seat would otherwise have to assume, guess, or
independently re-derive what the earlier one establishes.

---

## Why: disjoint file sets do not mean independent

The seats in `seats.md` write to disjoint files, so fanning all of them out at
once looks free. It is not. They are **informationally coupled**: several design
against the same facts, and those facts are being established, in parallel, by
each other.

**Measured on this repo, 2026-09-13**, from one six-seat fan-out on the
snapshot-grading feature:

- **Three seats independently discovered the 3.5 MB wire budget.** The data
  seat found it and quantified it; the reliability seat found it while sizing
  the 60s cap; the architect found it and made it decision D2. Three full
  investigations, one fact.
- **Two seats independently discovered that `requestScreenShareStream` was the
  wrong entry point** and that `SCREEN_SHARE_CONSTRAINTS` pins
  `displaySurface: "monitor"`. Security found it; the architect found it. A
  later checker found it a third time, because the AC still said otherwise.
- **Three seats independently discovered the localStorage image-quota problem.**
  Data, architect and UX each reasoned it out from scratch.
- **One whole section was moot before it was read.** The reliability seat
  produced a careful analysis concluding that grading must not be chunked and
  that the fix is an admission-time shot cap - while the data seat was
  concurrently establishing the budget arithmetic that led to splitting the
  pipeline into a read pass and a grade pass. The reliability analysis was not
  wrong; it answered a question that had changed.

None of this is caught by review. Every one of those outputs was internally
consistent and correctly answered the brief it was given.

---

## The three waves

Ordered by what each concern designs **against**.

### Wave 1 - structure and state
Module boundaries, interfaces, the persisted shape, lifecycle, data ownership.
Everything downstream designs against these; if they are wrong or absent, every
later wave designs against a fiction.

Here that is: **architect + reuse survey**, **data / storage**, and anything
that only reads and reports - **baseline**, a code census, **external-facts
research**. Report-only seats have no upstream dependency and can run in wave 1
or earlier regardless of their nominal category.

*Hands downstream:* the data contract, the module map, what is stored and where,
and the read/write surface other code will use.

### Wave 2 - constraints
**Security**, **reliability**, **operability and admin**. These read wave 1's
contract and determine what the system is permitted and able to do. They
frequently *shrink* the design - a budget refuses an arrangement, a privacy rule
forbids a data path - and that shrinking must happen before anyone designs a
surface on top of it.

*Hands downstream:* what is forbidden, what is bounded, what can fail and how,
and every option ruled out by arithmetic or policy.

### Wave 3 - experience
**User experience**, **visual / aesthetic**, **accessibility**. These need waves
1-2 to design something actually buildable. A surface designed before its
constraints are known is a surface that gets redesigned - and in the run above,
the UX seat's click count was invalidated by a pipeline change from wave 1's
arithmetic, because it counted a flow that no longer existed.

---

## Sorting your own concerns

Do not copy the wave names. Apply the test:

> **For concern X, list the facts it must assume to start. Who establishes each
> fact?** X goes in a later wave than everyone who establishes one of its
> inputs.

- Defines a contract others build against -> wave 1.
- Narrows or forbids (security, budget, limits, retention) -> wave 2.
- Renders, exposes, or operates the result -> wave 3.
- Only reads existing code and reports -> wave 1 or earlier.
- Two concerns mutually dependent -> a decomposition smell. Merge them, or pull
  the shared contract out as its own earlier wave, alone.

A wave of one is legitimate. A wave of six usually means the test was not
applied - which is exactly what produced the duplication measured above.

---

## Brief requirements - where the mechanism actually lives

Sequencing pays off only if later seats are *told* to build on earlier ones.
Every wave-2 and wave-3 brief must:

1. **Name the earlier artifacts as explicit inputs, by path**, and say the seat
   is expected to build on them rather than re-derive them.
2. **Carry every decision made since the earlier wave ran**, including decisions
   made *in response to* it. This is the most-missed item and the most
   expensive.
3. **Say which earlier findings are binding** versus merely informative, so the
   seat knows what it may not contradict.
4. **Instruct the seat to report a conflict rather than reconcile it.** If an
   earlier artifact and the brief disagree, stop and say so. Silent
   reconciliation destroys the information the ordering exists to create.

> **Attribution rule: a seat that re-discovers a blocker already ruled on has
> been UNDER-BRIEFED by the orchestrator, not failed by itself.** Treat every
> duplicate discovery as a defect in the briefing and fix the brief template -
> never the agent. All three duplicates measured above were briefing defects of
> mine.

---

## What it costs, stated honestly

**It does not save tokens.** The same seats do the same work. Anyone presenting
sequencing as a cost saving is wrong, and the claim will be found out.

**It costs wall-clock**, roughly proportional to the number of waves:

- All-parallel elapsed = the duration of the **slowest single seat**.
- Waved elapsed = the **sum, across waves, of each wave's slowest seat**.

Measured on the six-seat fan-out above: the seats ran 96s, 137s, 223s, 299s,
422s and 462s. All-parallel is gated by the slowest at **462s**. The same seats
in three dependency waves would be 422 + 299 + 462 = **1183s**, about **2.6x the
wall-clock for identical token spend**.

**What it actually buys:** less duplicated discovery, later seats building on
earlier decisions instead of racing them, spend arriving in interruptible
increments, and lower rate-limit exposure from fewer concurrent requests. That
last one is not theoretical here - a wave died against a session limit on
2026-09-13.

Sequencing is a **control and quality lever, not a cost lever.** Say so plainly
when proposing it.

---

## How to verify it is working

Instrument the thing the change is meant to fix. After each design stage, count:

1. **Duplicate findings** - the same blocker raised by more than one seat.
   Target zero. Any occurrence is a briefing defect; name which brief should
   have carried it. Baseline before this rule: three duplicates in one stage.
2. **Moot sections** - work invalidated by a sibling's finding in the same
   stage. Target zero after wave 1. Baseline: one.
3. **Cross-references** - later-wave artifacts explicitly citing earlier-wave
   ones. Should be **nonzero and rising**. This is the positive signal. If it is
   near zero, the briefs are not naming the earlier artifacts and the wall-clock
   is being paid for nothing.
4. **Conflicts reported rather than reconciled** - also positive.

The counter-proof from the same stage: the one seat that ran **later and alone**
opened a sibling's artifact, adopted its finding, and re-verified it. That
behaviour needed no extra instruction beyond the artifact being named as an
input - it is what sequencing buys.

---

## Failure modes

- **Stale briefs.** Waves 2-3 dispatched with briefs written before wave 1
  landed. The ordering is then pure cost. **Regenerate briefs after each wave
  lands, never before.** This is the single highest-value instruction on this
  card.
- **Wave 1 blocking on an unanswerable question.** If wave 1 stalls on a
  decision only the owner can make, escalate immediately and let waves 2-3
  proceed on everything that does not depend on the answer. Do not idle the
  stage - see the never-stall rule in `traps-orchestration.md`.
- **Treating the ordering as rigid.** A concern with genuinely no upstream
  inputs runs early regardless of its nominal category.
- **Over-sequencing.** Five or six waves gives five times the wall-clock for
  little added information. Three is the working default; go further only for a
  proven dependency.
- **Merging waves back under time pressure.** The failure it prevents is
  invisible at the time and expensive later. If you must compress, compress
  waves 2 and 3 - never fold anything into wave 1.

---

## Checklist

- [ ] Sort concerns into waves with the input test.
- [ ] Dispatch wave 1; its seats run in parallel with each other.
- [ ] Wait for wave 1 to land. Read it. Make any decisions it escalates.
- [ ] **Regenerate** wave 2's briefs to include wave 1's artifacts and every
      decision just made.
- [ ] Dispatch wave 2. Repeat for wave 3.
- [ ] Count duplicates, moot sections and cross-references.
- [ ] Fix the brief template wherever a duplicate appeared.
