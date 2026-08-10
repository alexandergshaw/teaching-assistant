-- Files attached to a single Tasks-grid cell ("also make it so that i can
-- attach files as notes for each cell" - the instructor's own framing,
-- verbatim, which is why this feature shares the existing note mark rather
-- than adding a new one - see
-- docs/task-cell-attachments-acceptance-criteria.md AC1-AC3).
--
-- course_task_attachments is a CHILD TABLE, never a column - and never even
-- a bare count - on course_tasks.statuses. That is not a style preference,
-- it is the load-bearing decision of this feature (AC1 item 5):
-- isEmptyTaskCell (src/lib/course-tasks.ts:131-133) treats
-- {status: "open", note: "", doneAt: null} as absence, and applyTaskCell
-- (:297-305) DELETES a cell satisfying it; coerceTaskCellMap (:200-221)
-- rebuilds every cell as a fresh {status, note, doneAt} literal on every
-- read and DROPS any other key; mergeStatusMap
-- (src/lib/supabase/course-tasks.ts:68-82) SETS the whole value at a task id
-- rather than merging into it. A field added to that jsonb blob - even a
-- bare attachment count - would be silently wiped by the very next ordinary
-- status click (setTaskCellStatus rebuilds the cell on every one) or by
-- syllabusAckTaskPatch, with no error anywhere. A child table this feature
-- owns end to end is immune to all six sites by construction, because
-- nothing in course_tasks ever has to know this table exists.
--
-- task_id carries NO foreign key, for the same reason
-- course_task_instructions.task_id has none (see that migration's header
-- comment): task ids are strings owned by a TypeScript catalog
-- (course-tasks-catalog.ts), not a database table, and course_task_defs is
-- already keyed (user_id, task_id) with no course dimension at all - there
-- is nothing in this schema for task_id to reference.
--
-- storage_path is UNIQUE because it doubles as the join back to the Storage
-- object it names: row and object are always created and removed together
-- (src/lib/course-task-attachments.ts's uploadTaskAttachment uploads the
-- object, then records the row, and removes the object again if the row
-- insert fails; deleteTaskAttachment removes the object BEFORE the row), so
-- neither should ever be able to end up pointing at two different things.
--
-- Bytes live in the EXISTING private "course-files" storage bucket
-- (20260722000000_course_materials.sql), under a new
-- `${userId}/${courseId}/task-attachments/${attachmentId}.${ext}` prefix.
-- No new bucket and no storage migration: that bucket's four policies
-- already check only (storage.foldername(name))[1] = auth.uid()::text,
-- which this path satisfies, and its file_size_limit is already large
-- enough for this feature's own 25 MB per-file cap
-- (20260806000000_course_files_size_limit.sql).
--
-- The one index this table needs - (user_id, course_id, task_id,
-- created_at) - is the exact shape of the only query the grid runs: every
-- attachment for one owner, in creation order, paginated with .range()
-- rather than a bare .limit() (AC4 item 19 - PostgREST's 1000-row default
-- is a server-side ceiling .limit() cannot exceed).
--
-- RLS: exactly four owner-scoped policies (select/insert/update/delete),
-- each preceded by its own `drop policy if exists`, matching
-- 20261001000000_course_task_instructions.sql's structure.
--
-- Migrations in this repo auto-apply via
-- .github/workflows/supabase-migrations.yml on push to main; this file is
-- never meant to be run by hand.
--
-- Written idempotently.

create table if not exists public.course_task_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  course_id uuid not null references public.course_hub (id) on delete cascade,
  task_id text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint not null check (size_bytes >= 0),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists course_task_attachments_user_course_task_created_idx
  on public.course_task_attachments (user_id, course_id, task_id, created_at);

alter table public.course_task_attachments enable row level security;

drop policy if exists "Users read own course_task_attachments" on public.course_task_attachments;
create policy "Users read own course_task_attachments"
  on public.course_task_attachments for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own course_task_attachments" on public.course_task_attachments;
create policy "Users insert own course_task_attachments"
  on public.course_task_attachments for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own course_task_attachments" on public.course_task_attachments;
create policy "Users update own course_task_attachments"
  on public.course_task_attachments for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own course_task_attachments" on public.course_task_attachments;
create policy "Users delete own course_task_attachments"
  on public.course_task_attachments for delete
  using (auth.uid() = user_id);
