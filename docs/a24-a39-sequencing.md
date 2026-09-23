# Sequencing ruling - A24 against A39, 2026-09-23

The A24/A32 wave plan found that **A24 and A39 claim the same two paths**:
`SnapshotGradingPanel.tsx` and `snapshot-grading.structure.test.ts`
(`docs/a39-architecture.md:1316,1318`). Both order an extraction from the same
970-line panel, with **conflicting numeric targets** - A24 says 928, A39 says
940. The plan correctly adopted neither and routed it here.

## RULING 32 - A39 EXTRACTS FIRST. A24 is measured against the tree A39 leaves.

Not because A39 outranks A24 in value, but because two extraction targets on one
file is not a priority question, it is an arithmetic one, and only one of them
can be measured against a real tree. Whichever lands second is measuring against
a file the first one already changed - so its number was computed against a tree
that no longer exists, and it will be wrong in a direction nobody notices,
because the gate is a ceiling and passing it silently proves nothing about
whether the extraction did what it was scoped to do.

**A39's extraction lands first** because it is already at round 2 of its
architecture with the owner's decisions applied, and because the owner's reported
problem - grading being slower than a chat - is what A39 exists for. A24 is
class-trends disclosure, which nothing is waiting on.

**A24 wave 0's target is then RE-DERIVED, not adjusted.** Do not subtract one
number from another: measure the panel with `@(Get-Content ...).Count` after
A39's extraction commit, add A24's re-costed addition, and state the new target
with the command that produced it. The plan's own arithmetic for the both-ship
case (`1000 - 72 - 14 = 914`) is a useful sanity bound, not the target.

**Until A39's extraction commits, no A24 wave touching either path may be
dispatched.** That is the whole content of this ruling, and it is a dispatch
rule rather than a document change: A24-0 and anything downstream of it wait.
A32 is unaffected and proceeds - it shares no path with either.

## RULING 33 - the 928 target is unreachable as scoped, and that is a finding

The plan measured the call-site costs in that panel (`<SnapshotShotTray>` 8
lines, `<ConfirmedRubricAreasEditor>` 9, `<SnapshotCaptureBar>` 15) and found
that FIVE separate components land at 931-938 - still over. Two GROUPED
components land at 913-918.

So the constraint is **fewer, larger components**, which is the opposite of what
an extraction pass instinctively does. Record this in the brief rather than
letting an implementer discover it at the gate: each extraction boundary costs
its own call site, and at this headroom the call sites are the budget.

This also means Ruling 32's re-derivation must re-cost the SHAPE, not just the
number. If A39's extraction already grouped the same region, A24 may need no
extraction at all.

## RULING 34 - three instruments, not two, and one anchor that breaks

Carried from the plan into any brief that touches this area:

- `snapshot-row-serialization.test.ts` has **three** places an 18th field moves,
  not the two the check named: `:93-113` (the exact 17-key set), `:368-392`
  (`excluded` / `actualKeysToDegrade` / `tableCoveredFields`) and `:395-407` (an
  `it.each` degradation table whose 8 rows `tableCoveredFields` hand-mirrors).
  A brief naming two of three ships a red gate.
- Extracting `{rubricModalOpen && (` at panel `:947-957` breaks
  `snapshot-grading.structure.test.ts:351-360`, which anchors on
  `panelSource.indexOf("onSubmit={(text) => {")` - a literal at panel `:949`. The
  test file is therefore in wave 0's write set, which is exactly the class of
  defect the round-2 check already caught once on this item.
- 47 line-pinned citations point at this panel across `docs/*.md`, of which
  exactly 6 shift if the extraction stays in the JSX tail at `881-967`. That is
  a reason to confine it there, and it is why **the next wave's brief is written
  from the post-extraction tree, never from the scope documents**, which are not
  rewritten.

## RULING 35 - the A32 naming contract is already enforced, and that is lucky

`walkthrough-announcement.structure.test.ts:748` is
`source.indexOf('label="Timing"')` - substring matching, first occurrence. Two
consequences the plan found and I am adopting:

- Renaming the existing select makes that anchor -1 and `:752` fails, so the
  rename **cannot ship silently**. Good.
- A new label with `Timing` as a PREFIX would silently re-bind the assertion to
  the wrong control. That is the trap, and it is why the names are specified
  rather than left to the implementer: **"Written for"** for the content framing
  (options unchanged) and **"Visible to students (optional)"** for the schedule,
  taken verbatim from the shipped sibling at `announcements-panel.tsx:463`.

Reusing the sibling's exact string is deliberate - `docs/a17-discovery.md`
measured five different labels for one act in this app today, and the cheapest
way not to make it six is to copy the one that already ships.

Also carried: **five** label strings need a scheduled variant, not three
(`AnnouncementDraftSlot.tsx:239, :240, :244, :250, :251`), and `:250`/`:251` are
the ACCESSIBLE names - without them a screen-reader user hears "Post draft 2 to
Canvas" on a control that schedules. `:244` ends in a real U+2026 that must not
be retyped as three dots, and a second `ConfirmArmButtons` at `:255-264` means
any slice anchors on `wta-post-consequence`, never a bare `consequenceId=`.

## RULING 36 - a stale constant in a loop card, again

The plan measured the two line counters across 13 files: `@(Get-Content).Count`
and `wc -l` agree everywhere, while `Measure-Object -Line` runs low by 15 to
**138**, with the two structure tests diverging by 111 and 138.

`docs/loop/this-repo.md` says the counters disagree "by 42 on one file". That was
true when written and is now the smallest gap measured, not the largest. The card
is corrected in the same commit as this ruling - a stale number in a card that
every agent reads is the defect this project has now hit three times, most
recently in `seats.md` on this same day.
