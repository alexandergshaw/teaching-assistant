# Add items to modules on an export-only course

Instructor request: "when i have a course with no live connection that is only
using a course export (zip or cartridge), make it so that i can add items to the
modules on the module view and then export an updated zip and/or cartridge
whenever I want."

**This chunk is the FIRST half only: adding and persisting items.** The
re-export half is deliberately deferred, by the instructor's own decision, after
the fidelity survey established what a generated cartridge could honestly
contain for their Blackboard source: 17 module titles, 110 item titles, 18
truncated bodies, the additions in full, and none of the `.docx`/`.pptx`/`.mp4`
attachments, whose bytes live in `csfiles/` blobs nothing in the app opens. It
gets designed separately once there are real additions to look at.

## What this is, and what it is not

An addition targets THE EXPORT, never Canvas. It is not a Canvas write with the
gating removed - there is no Canvas destination involved at any point. This is a
new category of operation for this tab, and it must not become a way to reach
the Canvas writes that entry 300 recorded the instructor deciding to keep
refused.

## Acceptance criteria

**AC1. Additions live in one new nullable JSONB column**,
`course_hub.export_module_additions`, following entry 306's pattern exactly:
`{ v: 1, additions: [{ id, moduleRef, title, type, body?, addedAt }] }`, one
pure client-safe coercer in `src/lib/`, one dedicated writer beside
`updateCourseRepoPairing`, one server action, and the column REGISTERED in the
ten places entry 306 lists while being OMITTED from `CourseInput`, `toRow` (with
a named entry in that file's omission comment block), `courseToInput` and
`courseToInputPayload`. That asymmetry is inverted from ordinary scalar columns
and is the single most likely way to break this.

**AC2. Bodies are bounded.** Unlike the repo-pairing blob's short paths, an item
body is unbounded prose on a column read with every course list. Cap the body at
`MAX_CARTRIDGE_ITEM_BODY_CHARS` (3000, the same limit the parser already applies
to export bodies) and cap the addition count, the way the repo-pairing coercer
bounds itself.

**AC3. Keyed on `CartridgeModule.identifier`, and the course by its row id.**
Entry 303 proved the identifier is present on 17/17 modules and stable across
re-parses of the same bytes. Never array position, never a hash (entry 264 check
1 rejected hashing for exactly this). `courseUrl` names nothing - it is empty for
every export course, which is the same root cause as entries 274, 300 and 306.

**AC4. A stale addition is preserved and marked inactive, never deleted.** A
newer export upload replaces the file and identifiers are only stable for the
same bytes, so an addition whose `moduleRef` is absent from the currently-parsed
tree must survive. Compute `active` at read time; gate the recompute on a LOADED
tree (`exportContent` is null mid-load, and recomputing against null would
deactivate everything on every reload); render inactive additions in their own
list rather than dropping them silently. This is entry 306's AC3/AC5 applied
again, and losing an item the instructor typed is worse than losing an inferred
pairing.

**AC5. Rendering is one optional pure argument.**
`cartridgeModulesToDisplay(modules, additions?)`, defaulted absent so every
existing call site and all of `display-module-tree.test.ts` are untouched. An
added item converts to a `DisplayModuleItem` with `added: true` and NO `raw` -
so `ModuleCard`'s `!m.raw` branch and `ModuleItemRow`'s `!it.raw || !m.raw`
branch keep it read-only through the existing structural check, with no new
escape hatch. `added` is assigned ONLY when true, never `added: false` on a
parsed item: that file's discipline is that absence is a real `hasOwnProperty`
absence, and its tests assert exactly that.

**AC6. An added item says so on screen** - a badge beside the existing degraded
-row note - so the instructor can always tell their own additions from the
archive's content.

**AC7. No new `GatedSubject`.** `gateOperation` refuses every one of its seven
subjects when the source is an export, and that invariant is load-bearing (entry
265 check 4, entry 300). Follow `DownloadSelectionSection`'s precedent instead: a
small pure `exportEditUnavailableReason(source, courseId)` returning
`string | null`, modelling the only real preconditions - the active source is an
export, and there is a course row id to write against. A read is not a write,
and neither is an edit to a file.

**AC8. These must NOT become reachable as a side effect**: `AddItemRow`'s live
path (every branch ends in a Canvas create - keep its `!m.raw` structural check
and build the export UI as a SEPARATE component rather than loosening that
condition), `NewAssignmentPanel`, `ModulesHeaderBar`'s `courseWrite` controls,
and `GeneratedPreviewModal`'s Post button. `fieldAvailable` stays
`source === "canvas"`: an added export item has no `published`/`dueAt`/
`pointsPossible`/`indent` either, and fabricating them would violate the
never-fabricate rule with the app's own hands.

**AC9. Added items are EXCLUDED from the selection sets in this slice, and that
is explicit rather than accidental.** `ModuleCard` builds `itemSelKeys` from
items carrying an identifier; an added item would flow into the `.zip` download
and all seven generation kinds, but the server re-reads the tree from the STORED
export and would return "no longer present in the current course content". Wiring
selection to resolve against the overlay is a follow-up; leaving it accidental
would reproduce entry 274 check 6a's exact failure shape.

**AC10. File sizes.** `ModulesView.tsx` (1044) and `useLmsGeneration.ts` (1059)
are ALREADY over this repo's 1000-line cap and must not grow - thread at most a
single prop object through `ModulesView`. The add-item row belongs inside
`ModuleCard`'s export branch (404 lines, room), and the persistence logic in a
new hook. Report the resulting line counts.

**AC11. Reuse the drafting half.** `generateDocumentTextAction` /
`generateSlidesAction` / `titleFromText` in `useAddModuleItem` need no Canvas
access at all - prompt in, text out, into local state. `AddItemRow`'s own comment
records that this half was gated only because its RESULT had nowhere to land.
With an overlay it does.

## Deferred, deliberately

- **The re-export** (`.imscc` and `.zip`). Its own chunk, its own criteria.
  When it is built: the output is a NEW cartridge, never "your updated export",
  and its manifest must state what it omits. Note also that a generated
  cartridge is flagged `generated: true` and stamped inside the zip, and
  `latestSourceExportFile` skips generated files - so such a file cannot be
  re-opened as the course export, and saving it back to the tile would produce
  something the app refuses to read.
- **"Add to a module in this export" on generated content.**
  `GeneratedPreviewModal`'s refusal panel is its natural home, but the wiring
  lives in `useLmsGeneration.ts`, which is over the line cap. Follow-up.
- **Editing or deleting an addition beyond removing it.** Add and remove only.

## Verification

vitest here is node-env and collects only `src/**/*.test.ts` - no component
renders, ever. So the coercer, the activation rule, the display merge and the
unavailable-reason string get real tests; the add row, the badge and the
read-only posture are verified by reading and must be declared as such. Guard
tests that matter: a full `updateCourse` round trip leaves the column untouched;
an export whose module refs change preserves every addition and marks the
missing ones inactive; and the display merge appends added items without
touching the parsed ones (reference equality, per that file's existing pins).
