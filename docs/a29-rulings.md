# A29 - orchestrator rulings, 2026-09-21

The check of `docs/a29-ac.md` revision 1 returned NOT CLEAN: 4 blockers (2
repeat, 2 new), 7 majors, 5 minors, and the explicit verdict that the
criteria are not ready for an architecture pass by rewriting alone. Two of the
four blockers are REPEAT classes, so under `docs/loop/iteration-caps.md` they
go to disposal now and the criteria seat is NOT re-dispatched for them. This
file carries the disposals. An architecture pass reads it alongside the
criteria; where they conflict, this file wins.

The owner has not answered the fork. The working default stays (B-prime):
real email from the instructor's connected Outlook.

## RULING 1 - key the double-send guard on the COURSE, never on the body (B2, REPEAT)

K9 refused a re-send of "the same body to the same course" after a partial or
lost outcome. K13 clears the saved body at confirm. Together they guarantee
the body differs on the retry: the function is killed at the 60s cap, the
instructor reloads, the text is gone, they retype or redraft it, and a
one-character difference walks straight past K9. **The two rulings defeat each
other, and the hazard is a whole-class double send.**

**THE GUARD IS KEYED ON THE COURSE HAVING AN UNRESOLVED ATTEMPT, whatever the
body says.** Any send to a course with an unresolved prior attempt is refused
until the instructor resolves that attempt by an explicit choice that shows
them what it was and what is known about its outcome. Relocated to the
architecture and reliability passes as an obligation, with that as the pass
condition.

## RULING 2 - the attempt record is DURABLE (B3, NEW)

K7 and K9 both pass under vitest with a module-level `Set` or `Map`, and a
Vercel function killed at 60s, or the next call landing on another instance,
keeps none of that. The criteria never said the record must survive the
process. **IT MUST: the attempt record is written to durable storage BEFORE
the first outbound request, and read from durable storage by the guard.** A
test that proves the guard with in-memory state proves nothing about the
hazard it names, and the instrument must say how it stands in for a process
that dies.

K5 and K7 also contradict each other: K5 lets the confirm be a client-side
signature the server recomputes from what the client sends, which proves
nothing was confirmed and cannot satisfy K7. **THE CONFIRMATION IS
SERVER-ISSUED** - a token the server mints when it shows the confirm, bound to
course, recipients, subject, body and channel, and consumed once.

## RULING 3 - the remaining labels become constructions (B4, REPEAT)

Four criteria still describe a property instead of making it impossible to
violate. Relocated to the architecture pass, each with its construction:

- **K8, the count.** A component that types the outcome from the action's
  return and shows `recipients.length` passes every clause - exactly the A28
  defect this repo shipped and fixed today. **THE CLIENT RECEIVES ONLY THE
  SUMMARISER'S OUTPUT**, or an opaque collection with no length. The display
  cannot compute a count because it is never given one to compute from.
- **P2, the batch state.** "Every student in a batch shares its state" is
  prose, and K8 permits per-recipient records, so a fixture can fake a
  per-student outcome Graph never returns. **THE TYPE CARRIES STATE PER BATCH,
  NOT PER RECIPIENT**, so the shape is unrepresentable.
- **K9, the informed choice.** A boolean a component always passes as `true`
  satisfies it. **THE CHOICE IS A SERVER-ISSUED RESOLUTION** of the specific
  attempt record, by id - not a flag.
- **K13, cleared at confirm.** A storage helper tested in isolation and never
  called at confirm passes. **RE-LABEL IT A READING CLAIM** unless the
  architecture makes the clear part of consuming the server-issued token.

## RULING 4 - measure requests, not import edges (B1, NEW)

The checker measured the capability walls on day zero and **both are red
against today's tree before a line of A29 exists.** The roster reader reaches
the model client through a dynamic import; the course row reader reaches both
model clients across 416 modules; and a barrel re-export puts
`sendMessageDraftByEmailAction` inside every workflow's import closure despite
zero call sites. An implementer facing a wall that is red on arrival either
copies the readers to escape it or loosens it until it means nothing.

**THE INSTRUMENT IS THE REQUESTS A SEND ACTUALLY MAKES**: record every
outbound request during a driven send against an allow-set of hosts - Canvas,
the chosen channel, Supabase and the Microsoft token endpoint, the last two of
which the old allow-set omitted. Import closure measures what is reachable,
not what is called. This goes to measurement first and then the architect.

## RULING 5 - majors, carried as obligations

- **A refused send must not lose the text.** Clearing at confirm loses the
  instructor's text when the send is refused before anything went out -
  Outlook not connected, mail send not granted, the roster read failing at
  send time. Nothing outbound happened, so nothing is cleared.
- **Assert each state's count**, not only that the states partition the set: a
  summariser that swaps accepted and refused passes a partition check.
- **Define the base set once.** P2 puts excluded students into the outcome
  while K3 says inactive students are never included. Say whether the confirm
  count is recipients or roster.
- **Ambiguous failures are `unknown`, never `refused`.** A 5xx, a 504 or a
  network error after the request went out may have delivered. Treating it as
  refused lets "resend to the rest" re-send with no explicit choice.
- **SENT ITEMS KEEPS EVERY ADDRESS.** The existing Graph send sets
  `saveToSentItems: true`, so every BCC address is kept permanently in the
  instructor's own Sent Items. That is a privacy fact the owner has not been
  shown; it goes to the owner as an explicit question, not buried in a
  criterion.
- **Restore the dropped clause:** when the Canvas-profile address cannot be
  read for the instructor's role, that is ONE reason, not N separate "no
  address" rows.
- **Reuse the plain-text drafter.** `draftAnnouncementAction` already asks the
  model for plain text and serves three paths; steering reuse to A21's
  Markdown drafter manufactures the formatting hazard K10 then has to guard.

## RULING 6 - minors

Cite by symbol where the checker found lines off; the grep for course-tile
draft creators returns five sites, three of them announcement kinds; the tile
email is Canvas-sourced only when the import was Canvas's own export, since a
plain CSV takes any address; K1's wording states its failure backwards; P2
under (B-prime) needs an instrument line. The backlog row's stale text - the
old R3, the double meaning of R4, and the leftover "default (A)" - is mine and
I am fixing it.
