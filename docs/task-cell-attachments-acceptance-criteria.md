# Attach files to a Tasks-grid cell

The instructor's request, verbatim: "also make it so that i can attach files as
notes for each cell". A cell of the Tasks grid already carries a 200-character
text note; this adds files alongside it, framed by the request itself as another
kind of note rather than a separate concept.

Every decision that could reasonably have gone the other way records why it did
not. Several are counter-intuitive, one (AC1 item 5) is the difference between
working and silently losing the instructor's files, and three of them (AC4, AC5,
AC7) replace an earlier draft that a pre-implementation audit disproved - those
carry a REJECTED note so the wrong version is not re-derived later.

## AC1. Attachments live in their own table, never inside the cell

1. A new table `public.course_task_attachments`: `id uuid primary key`,
   `user_id uuid not null references auth.users on delete cascade`,
   `course_id uuid not null references public.course_hub on delete cascade`,
   `task_id text not null`, `file_name text not null`, `mime_type text`,
   `size_bytes bigint not null check (size_bytes >= 0)`,
   `storage_path text not null unique`,
   `created_at timestamptz not null default now()`.
2. An index on `(user_id, course_id, task_id, created_at)` - the exact shape of
   the only query the grid runs.
3. RLS enabled, with exactly four owner-scoped policies (select/insert/update/
   delete), each preceded by its own `drop policy if exists`, matching
   `20261001000000_course_task_instructions.sql`'s structure.
4. `task_id` carries NO foreign key. Task ids are strings owned by a TypeScript
   catalog (`course-tasks-catalog.ts`) and `course_task_defs` is keyed
   `(user_id, task_id)` with no course dimension - the identical situation
   `course_task_instructions.institution` is already in.
5. **Attachment data is NEVER written into `course_tasks.statuses`, in any
   form, including a bare count.** This is the load-bearing decision of the
   feature. `isEmptyTaskCell` (`src/lib/course-tasks.ts:131-133`) is
   `status === "open" && note === "" && doneAt === null`; `applyTaskCell`
   (`:297-305`) DELETES a cell satisfying it; `coerceTaskCellMap` (`:200-221`)
   rebuilds every cell as a fresh `{status, note, doneAt}` literal and DROPS
   every unknown key; `mergeStatusMap`
   (`src/lib/supabase/course-tasks.ts:68-82`) SETS the whole value at a task id
   rather than merging into it. Six sites rebuild a cell as a fresh literal,
   including `setTaskCellStatus` - which runs on every ordinary status click -
   and `syllabusAckTaskPatch`. A field on the cell would be wiped by clicking a
   checkbox, with no error. A child table is immune to all six, and a test
   asserts the coercer still drops an unknown fourth key.
6. The attachment `id` is generated in the BROWSER (`crypto.randomUUID()`)
   before the upload, because the storage path embeds it and the object is
   written before the row exists.

## AC2. The bytes go browser to Storage, never through a server action

7. Upload uses the authenticated browser Supabase client (`useSupabase()`,
   mounted app-wide at `src/app/layout.tsx`) writing into the EXISTING private
   `course-files` bucket. No new bucket and no storage migration: that bucket's
   four policies check only `(storage.foldername(name))[1] = auth.uid()::text`
   (`20260722000000_course_materials.sql:17,22,27-28,33`), and its
   `file_size_limit` is already 200 MB.
8. The storage path is `${userId}/${courseId}/task-attachments/${id}.${ext}`,
   and the value returned by the shared path builder is the value handed to
   `.upload()` - not a separately-derived string. A path whose first segment is
   not the user id is refused by RLS, not by our code, so this is a 403 in
   production rather than a visible bug.
9. The original filename never enters the path. Only a SANITISED EXTENSION
   derived from it does: lowercased, stripped to `[a-z0-9]`, capped at 12
   characters, falling back to `bin`. The full original name is kept in the
   `file_name` column and shown in the UI.
10. **Why not base64 through a server action, which is the other convention in
    this repo:** Vercel Functions cap the request body at 4.5 MB and return
    `413 FUNCTION_PAYLOAD_TOO_LARGE` at the platform layer, before the request
    reaches the app. `next.config.ts`'s `serverActions.bodySizeLimit: "10mb"`
    cannot raise a platform limit, and base64 inflates by 4/3, so that route
    tops out near 3.3 MB of real bytes. No base64 encoder (`readFileBase64`,
    `readAsDataURL`, `btoa`) appears anywhere in this feature.
11. `MAX_TASK_ATTACHMENT_BYTES` is 25 MB and `MAX_ATTACHMENTS_PER_CELL` is 20.
    Both are checked BEFORE any byte is uploaded - a rejected file must cost no
    upload - and both name their own limit in their message.
12. Write ordering, mirroring `createInstitutionPageAttachment`
    (`institution-page-attachments.ts:347-372`): upload the object, then record
    the row, and **if recording fails, remove the object that was just
    uploaded**. Delete ordering is the reverse: remove the object BEFORE the
    row (`:501-509`), so a failure leaves a visible row rather than an
    invisible orphan. This ordering is expressed in a function that takes its
    storage client and its row-recorder as arguments, so both orderings and
    the rollback are provable by test rather than by reading.
13. Two files with the same name are two attachments - the object name comes
    from the attachment id, so nothing is ever silently replaced.
    (`MiscFilesCell` replaces same-named files; for a task, two files called
    `rubric.pdf` is ordinary and replacing one would be data loss.)

## AC3. The existing note mark means "has a note OR has files"

14. No fifth corner indicator is added. All four corners are taken -
    `.cellMenuTrigger` top-left, `.noteMarker` top-right, `.errorMarker`
    bottom-right, `.instructionMarker` bottom-left - and the "each mark owns a
    corner no other mark ever touches" invariant is pinned by
    `taskCellIndicators.test.ts`. The instructor's own framing ("files as
    notes") is what makes sharing the mark correct rather than a compromise.
15. `taskCellIndicatorSet` gains a fourth, optional parameter (the cell's
    attachment count, default 0) and its `note` field becomes true when the
    text note is non-blank OR the count is above zero. A negative or
    non-finite count never turns the mark on. The decision stays in that ONE
    pure function - never an inline condition in `TaskCell.tsx`.
    `TaskCellIndicatorSet.note`'s own doc comment, which currently says
    "TaskCell.note's dog-ear", is updated in the same change.
16. The count reaches assistive technology through `taskCellAccessibleName`,
    which appends a terse sentence - `" 2 files attached."`, singular
    `" 1 file attached."` - through the same `appendSentence` helper the
    instruction mention already uses, and AFTER it, so every existing frozen
    literal still matches on its prefix and no terminator is ever doubled. The
    `title` tooltip mirrors it but is never the only carrier: this repo's own
    S8 note records that `title` is invisible on touch and unreliable for
    keyboard users.
17. File NAMES never enter the accessible name or the title - the same string
    would be re-read on every arrow-key move across a 40-column row.

## AC4. Every attachment loads in the one query the grid already runs

18. The attachment fetch joins the SAME `Promise.all` in
    `useCourseTasksData.reload()` as courses, cells, defs and instructions, and
    **its result is indexed and stored in state** - a fetch whose rows are
    discarded is the failure mode this item exists to prevent. A per-cell or
    per-course fetch is forbidden: the grid renders over a thousand cells with
    no virtualization and no `React.memo`.
19. The read is PAGINATED with `.range()` until a short page comes back, and it
    selects only the columns the grid needs. **REJECTED, and why:** an earlier
    draft said `.limit(1000)`. PostgREST's 1000-row default is a SERVER-side
    ceiling (`db.max_rows`); `.limit()` requests at most n and cannot exceed
    it, so that draft truncated exactly as a bare `select()` does. A silent
    truncation would both hide files and corrupt item 11's per-cell cap check,
    which counts what was loaded.
20. The result is indexed by `` `${courseId}:${taskId}` `` into a
    null-prototype map, threaded whole from `TasksTab` through `TasksGrid` to
    `TaskGridRow`, and resolved per cell there - the same shape `instructions`
    already uses. `TaskCell` itself receives a plain `number`, never an array,
    so a cell re-render can never depend on array identity.
21. Signed URLs are minted lazily, one per download click, never for the grid.

## AC5. One dialog for the whole tab, not one per cell

22. **REJECTED, and why:** an earlier draft put a hand-rolled fixed-overlay
    modal inside each `<td>`, on the theory that a portal rendered inside the
    cell popover's `ClickAwayListener` would fire `onClickAway`. That theory is
    real MUI behaviour (issue 18586) but irrelevant here, because the popover
    is committed and closed BEFORE the dialog opens. The draft was also wrong
    on three counts: it would mount roughly a thousand modal instances, one per
    cell; `role="dialog"` inside `<td role="gridcell">` is invalid ARIA
    containment and would leak the dialog's contents into the grid's
    accessibility tree; and "this repo does not use MUI `Dialog`" is false -
    `TasksTab.tsx` and `tasks/ManageTasksDialog.tsx` both use it.
23. There is exactly ONE `TaskAttachmentsDialog`, rendered by `TasksTab`,
    driven by a single `{courseId, taskId} | null` piece of state. It is an
    MUI `Dialog`, matching `ManageTasksDialog` in the same directory, which
    brings the focus trap, the inert background and the scroll lock that a
    hand-rolled overlay does not.
24. The cell's popover gains an "Attachments" control showing the count.
    Activating it commits and closes the popover, then asks the tab to open the
    dialog for that cell - so the two surfaces are never open at once.
25. On close, focus returns to the grid cell that opened the dialog, through
    the ref registry `TasksGrid` already keeps for its roving tabindex. MUI
    restores focus to whatever was focused at open time, which by then is the
    unmounted popover button, so the restoration must be explicit or focus
    lands on `<body>` and the grid loses its focused cell.
26. The upload control is a real `<input type="file" multiple>` driven by a
    visible `<button>` - the GOV.UK pattern - never a custom widget. Files may
    also be dropped onto the dialog.
27. Each row shows the file name, a human-readable size via the EXISTING
    `formatBytes` (`src/app/components/content-tab/utils.ts`), the date added,
    a Download control and a Remove control. Remove is a real `<button>` whose
    accessible name names its own file (`Remove "syllabus.pdf"`), built inside
    the list's own map so every row gets one, and it takes two clicks to
    confirm (the `FileRow.tsx` precedent).
28. ONE `role="status"` region announces upload start, completion, removal and
    every error, and every one of those paths writes to it. Progress, if
    shown, is announced coarsely, never per percent, never
    `aria-live="assertive"`.
29. Error wording: "The selected file must be smaller than 25MB", "The selected
    file is empty", `Could not upload "<name>" - try again`, "You can only
    attach up to 20 files to one task". The upload failure names the file
    because several upload at once.
30. Download fetches the signed URL into a Blob and triggers `a.download`.
    Navigating to the signed URL - including `a.href = signedUrl` - is
    forbidden: the URL is on the Supabase origin, so `download` is ignored
    cross-origin and an attached `.svg` or `.html` renders in the browser.

## AC6. Deleting a course must not orphan the objects

31. `deleteCourse` (`src/lib/supabase/courses.ts:560-566`) is today a bare row
    delete, and the FK cascade removes attachment ROWS while leaving every
    object in Storage. Before the row delete, the server collects this course's
    attachment `storage_path` values and removes those objects - the discipline
    `deleteInstitutionPageAndAttachments` exists to enforce. It must happen
    server-side and BEFORE the cascade, because afterwards there is nothing
    left to enumerate.
32. Scope note: the same path ALREADY orphans course materials, misc files,
    Castletop files and LMS exports under the same bucket and prefix. That
    pre-existing leak is out of scope here and is flagged separately rather
    than silently inherited.

## AC7. What changes elsewhere, and what must not

33. **Four existing assertions WILL break, and updating them is part of this
    work, not a regression.** `taskInstructionIndicator.wiring.test.ts:236,270`
    and `taskNoteIndicator.wiring.test.ts:472,482` pin the exact call strings
    `taskCellIndicatorSet(cell.note, instruction, error)` and
    `taskCellAccessibleName(courseName, task, cell, nowMs, indicators.instruction)`
    as source text. Both gain an argument. The four assertions are updated to
    the new call strings in the same change - never deleted, never loosened to
    a substring that would stop detecting a re-derived inline condition.
34. Unchanged and asserted: the text note's 200-character cap, `commitNote`,
    the institution-instruction section, all four corner marks and their
    corners, the grid's geometry and density variables, `isEmptyTaskCell`'s
    definition, and the four existing members of the mount-time `Promise.all`.
35. CSV export is deliberately NOT changed. `csvCellText` renders
    `token (note)`, pinned by `course-tasks-view.test.ts`. The consequence is
    recorded rather than left implicit: a files-only cell shows the mark in the
    grid and exports an empty note. Changing that is a separate decision.
36. No emojis anywhere. Any new glyph is an inline SVG path - the committed
    scan flags the obvious paperclip and check-mark code points.
37. Every file created or modified stays under 1000 lines. `TaskCell.tsx` is
    already 597, so the dialog is its own component file.
