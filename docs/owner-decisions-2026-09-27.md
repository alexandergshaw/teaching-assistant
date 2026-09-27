# Owner decisions, 2026-09-27

## DECISION 15 - A43 KEEPS the conversational ask. The scope's recommendation is overridden.

The A43 scope recommended routing A43-C - "smoothly upload and ask for things" -
OUT of the row, on the measured ground that no function or tool calling exists
anywhere in this app. **The owner answered: keep it.**

So A43 is the whole request, not the template half. Recorded here with what that
costs, because the cost is real and the scope was right about the measurement
even though it was overruled on the disposition.

**What the measurement actually says.** Re-verified this pass:
`grep -rniE "functionDeclaration|functionCall|toolConfig" src/lib/llm.ts
src/app/api/ai-chat/route.ts` returns NOTHING, against a canary of 22 exports in
`llm.ts` proving the file was read. `llm.ts:519` is Google search grounding, not
app tool calling. So there is no mechanism today by which a model request can
invoke an app capability.

**Therefore A43 now includes building that mechanism, and that is the largest
single thing in the row.** It is not a UI affordance and it must not be scoped as
one. "Ask for things" against a deck means at minimum: a declared set of
operations the model may request, a schema for each, a dispatcher that validates
a requested operation before running it, and a refusal path for anything outside
the set. That is a capability surface, and every one of those parts is a place a
model can ask for something the app must decline.

**The consequence for the row's shape, which the owner should know:** A43 cannot
close until the conversational layer ships. The template guarantee - the half
nothing else can give the owner - is therefore no longer independently closable
as this row. That is the trade the owner accepted. The mitigation is sequencing,
not scope: the template half ships FIRST and completely, because it is the half
with a structural guarantee, and the conversational layer is built against
something that already conforms. Building them in the other order means a
conversational editor with nothing trustworthy to edit.

**What does NOT change, and must not be relaxed to fit the conversational half:**

- **The guarantee stays structural.** Q2's ruling was shape (a) - the model emits
  content as structured data and a deterministic writer places it into the
  uploaded template, so the template is never in the model's hands. A
  conversational request may change CONTENT. It may NOT be allowed to reach the
  writer, the template, or the layout. The moment a model request can alter
  placement, the guarantee stops being structural and becomes checked, and the
  owner's own requirement - output guaranteed to use their template - is gone.
  So the operation set is the enforcement point: if an operation cannot be
  expressed as content, it is not an operation.
- **The interaction budget stays.** `docs/a39-census.md` measured that this app's
  problem is interaction cost and a chat's advantage is asking for nothing else.
  The existing deck surface is 3 warm interactions with NO course prerequisite,
  which is unusually good. A conversational layer must not add a required step,
  a mode switch, or a prerequisite.
- **The hard constraint stays.** The shipped machinery can rewrite, clone or
  delete a paragraph and CANNOT add a slide, so a deck from an uploaded template
  has exactly the template's slide count while this app's own decks reach the
  high seventies. A conversational "add a slide about X" is therefore blocked on
  the slide-cloning wave, and must refuse in a way that says so rather than
  silently producing nothing.

**What I am NOT deciding here**, because it is the scope's to settle now that the
disposition has changed: whether the conversational layer is a general tool-calling
mechanism or a deck-specific operation set. The general one is reusable and much
larger; the deck-specific one is smaller and will be re-implemented the next time
this need appears. That is a real fork and the revised scope must argue it, with a
recommendation, rather than defaulting to whichever is easier to write.
