# Bulk "open in a new tab" for module items

**The request, verbatim:** "the ability to set 'open in a new tab' bulk
whenever that option is available on the items in a module."

---

## Survey first: this is three layers, not one

Measured before writing any criterion.

| Layer | State today |
| --- | --- |
| Read | `CanvasModuleItem` (`src/lib/canvas-modules/types.ts`) has **no** `newTab` field. The list mapper never reads Canvas's `new_tab`. |
| Write | `updateModuleItem` (`src/lib/canvas-modules/module-items.ts`) accepts `{ title, indent, published, position, targetModuleId }` - **no** `new_tab`. |
| UI | A grouped bulk bar already exists (`bulkBarGroups.ts`, 14 group ids incl. `items`), with `useBulkItemActions.ts` and `CourseItemsBulkBar.tsx`. |

`new_tab` appears **nowhere** in `src/`. So the bulk bar is reusable; the read
and write paths are genuinely new.

---

## AC1. Only two item types can take this, and that is the whole design problem

Canvas honours `new_tab` for **ExternalUrl** and **ExternalTool** items only.
It is meaningless for Assignment, Quiz, Page, Discussion, File and SubHeader.

The request says "whenever that option is available on the items", so
eligibility is per item, decided by type. That makes the interesting case a
MIXED selection, which is the normal case - an instructor selects a whole
module and it contains one external link among eight pages.

**Decided:** the action is offered whenever the selection contains at least
one eligible item, and it states plainly how many it will affect. When the
selection contains none, the control is DISABLED WITH ITS REASON VISIBLE -
this repo's standing rule, never enabled-then-rejected.

The count is not decoration. "Set 3 of 11 selected items to open in a new tab"
is the difference between an instructor trusting the result and re-checking
every item by hand.

## AC2. It is a set, not a toggle

Bulk actions that toggle are ambiguous on a mixed selection: if two items are
on and three are off, what does "toggle" mean? So there are two explicit
actions - open in a new tab, and open in the same tab - and each SETS a value
rather than inverting one.

## AC3. The read path comes first, because a control that cannot show state is
## a control nobody trusts

`CanvasModuleItem` gains `newTab: boolean | null` - `null` for the item types
where the field does not apply, so "not applicable" is distinguishable from
"applicable and currently false". The list mapper reads Canvas's `new_tab`.

A row for an eligible item shows its current setting. Without this the
instructor cannot tell whether the bulk action did anything.

## AC4. The write path

`updateModuleItem`'s `fields` gains `newTab?: boolean`, sent as
`module_item[new_tab]`. It is sent ONLY when present, exactly like every
existing optional field in that function - an absent key must never be
interpreted as `false`.

**Canvas requires `module_item[external_url]` to be resent on an ExternalUrl
update in some versions.** Verify this against the installed Canvas API
behaviour before shipping; if true, the update must preserve the existing URL
rather than blanking it. A bulk action that silently erases every external
link's destination would be the worst possible outcome here.

## AC5. Partial failure is reported per item, not swallowed

The existing bulk actions already run per item against the Canvas API. Follow
whatever they do for progress and failure - and if any of them collapses N
failures into one message, do NOT copy that; report which items failed.

## AC6. Ineligible items are skipped, never "failed"

An Assignment in the selection is not an error. It is simply not eligible, and
the summary distinguishes "skipped, not applicable" from "tried and failed".
Conflating them makes a successful run look broken.

## AC7. The bulk bar's own conventions

It joins the existing `items` group rather than adding a fifteenth group,
unless the survey finds a reason otherwise. Its label, disabled reason and
result summary follow the copy discipline already used there.

---

## Deliberately NOT in scope

Setting `new_tab` at creation time; a per-item toggle outside the bulk bar (a
separate, smaller change); any other module-item field; and changing how the
bulk bar itself is structured.

---


---

# Survey result (2026-09-06): the criteria above were wrong in three places

Read the corrections before the criteria. Two make the feature smaller, one
makes it bigger, and one reverses a defence that would have destroyed data.

## AC4 WAS BACKWARDS. The defence it suggested is the disaster it feared.

AC4 worried that omitting `module_item[external_url]` on an ExternalUrl update
might blank the link, and suggested resending it defensively.

**Canvas's own controller settles it the other way.** The update assigns the
url only when the param is PRESENT:

```ruby
if %w[ExternalUrl ContextExternalTool].include?(@tag.content_type) && params[:module_item][:external_url]
  @tag.url = params[:module_item][:external_url]
```

So omitting it is safe. But that guard is Ruby truthiness, and **in Ruby `""`
is TRUTHY**. The "defensive" version - appending `item.externalUrl ?? ""` -
would therefore set `@tag.url = ""` on every item whose `externalUrl` this app
holds as null, which is every ExternalTool item and any row mapped before the
field existed. That is the mass link-erasure AC4 was written to prevent,
caused by AC4's own suggested fix.

**RESOLUTION: send ONLY `module_item[new_tab]`. Never send `external_url`.**
That is already the idiom in `updateModuleItem` and `createModuleItem` - every
field appended only when present. Do not deviate from it, and the question
becomes moot rather than answered.

## Canvas applies `new_tab` with NO content-type guard. Client-side
## eligibility is the ONLY guard there is.

The same controller assigns `new_tab` unconditionally:

```ruby
@tag.new_tab = value_to_boolean(params[:module_item][:new_tab]) if params[:module_item][:new_tab]
```

No content-type check. So Canvas will accept, store and 200-OK a `new_tab`
write on an Assignment, Page or Quiz. An ineligible item would not fail
loudly - it would silently SUCCEED and be counted as done.

That materially strengthens AC1 and AC6: the per-item eligibility predicate is
not a nicety that avoids a rejection, it is the only thing standing between
the instructor and a report that says "11 done" about eight items where
nothing meaningful happened.

Also settled: `"false"` is a truthy Ruby string, so `value_to_boolean("false")`
runs and writes `false`. **AC2's set-not-toggle works in both directions.**
Send the literal `"true"`/`"false"`; never send an empty value.

## AC3 is THREE LINES. `new_tab` already rides the response the app reads.

Canvas emits `new_tab` from the SAME conditional block as `external_url` - and
this app already reads `external_url` off that exact response and uses it at
runtime. So no `include[]`, no second endpoint, no per-item fetch: a field on
`RawModuleItem`, a line in `mapModuleItem`, a field on `CanvasModuleItem`.

For non-external items the key is ABSENT, not `false`, so `raw.new_tab ?? null`
is faithful and AC3's `boolean | null` falls out of the payload rather than
being imposed on it.

**One stale-documentation trap:** Canvas's published docs annotate `new_tab` as
"(only for 'ExternalTool' type)". The serializer source emits it for
`ExternalUrl` too. AC1's two-type rule is right and the docs are wrong. Note
also that the API's `type` is `"ExternalTool"` while the DB's `content_type` is
`"ContextExternalTool"` - the TypeScript predicate tests the API spelling.

## AC5/AC6 ARE THE BIGGEST PIECE, and the criteria had no row for them.

Every existing per-item bulk action collapses failure into `N done, M failed`
and **discards the Canvas error string entirely**. AC5 said "follow whatever
they do" AND "do not copy that" - those cannot both hold, because inside the
bulk bar there is nothing else to follow.

**RESOLUTION: model it on the rubric generate-and-associate action**, the only
per-item reporting in the app that distinguishes SKIPPED from FAILED. It
carries a discriminated outcome per item with named skip reasons, a separate
summariser counting each reason, and copy that keeps "cannot take this" and
"failed" in different clauses. Critically, it lives in **its own pure module
with its own test file** - which is what makes it testable at all, since
vitest here renders no component.

**Do NOT copy the older rubric bulk action**, which silently filters out every
non-Assignment. That file's own header names it as a bad precedent and forbids
inheriting it.

## Corrections to this document's own survey table

- There are **17** bulk-bar group ids, not 14, and the group literals live in
  `bulkBarGroupCatalog.ts`, not `bulkBarGroups.ts`.
- `CourseItemsBulkBar.tsx` is not under `modules/` and is NOT part of this
  feature: it belongs to the Course Items tab, has no module-item selection,
  and a standing test forbids it from importing the module-item update action.

## Ratchets that must move in the SAME commit

- The bulk-bar control-count canary, currently `expect(total).toBe(30)`,
  becomes 32 for two new controls. **This is the one that fails the suite if
  missed.**
- The `items` group's `consequenceTag` must be EXTENDED, not nulled - a test
  asserts it is non-null for any group reachable at fan-out-write tier.
- Both new controls declare `persistKey: null` with a non-empty
  `unpersistedReason`, or the persistence canary's "exactly 1 declared" breaks.
- Control ids must be unique across the whole model.

## Where it can and cannot live

`useBulkItemActions.ts` is at **900 of 1000 lines and has already been split
twice for exactly this reason** - two existing leaf modules carry headers
saying they were carved out of it at 934 and 999. The new outcome type and
summariser must be a NEW LEAF from the start, not an addition there. That is
also what makes them node-testable.

`bulkBarGroups.test.ts` is at **1026 lines, already over the ceiling**.
Bumping a count literal there is fine; adding a describe block is not.

## Cheap follow-up the survey turned up

Two existing code paths create ExternalUrl items and **neither sets
`new_tab`** - so every link this app creates lands in exactly the state this
bulk action then has to fix. Setting it at creation is out of scope here and
is an obvious, small follow-up.

## Not verified, stated as such

All Canvas behaviour above is read from canvas-lms source, not from a live
instance and not from any fixture in this repo. Which Canvas version the
target institution runs is unknown. The safe implementation (never send
`external_url`) was chosen precisely so the feature does not depend on that
answer.

## Recorded debt: `newTab` shipped OPTIONAL, not required

AC3 specifies `newTab: boolean | null` on `CanvasModuleItem`. It shipped as
`newTab?: boolean | null`.

The reason was scope, not design: making it required broke `tsc` across roughly
fifteen test files outside the implementing group's allow-list, all of which
construct literal `CanvasModuleItem` fixtures. Editing files owned by
concurrent siblings mid-wave is how a wave gate stops meaning anything, so the
field was widened instead.

**The cost, stated so nobody discovers it the hard way.** `undefined` and
`null` now both mean "not applicable here", and a consumer that checks
`item.newTab === null` will silently miss the `undefined` case. `mapModuleItem`
always sets a real `boolean | null`, so `undefined` can only come from a test
fixture - which means the bug would appear in a test and not in production,
the least useful place for it.

**The fix is mechanical and small:** add `newTab: null` to the fixtures that
need it and tighten the field to required. It was deferred only because a
sibling agent held some of those files at the time. Do it in the next change
that touches that directory, not as a standing exception.

Callers in the meantime should read the value as `item.newTab ?? null` rather
than comparing to `null` directly.
