-- Course Tasks: per-course task status map, plus per-user task-definition
-- overrides, backing the "Tasks" tab (a course x task-checklist matrix).
--
-- Two tables:
--
-- course_tasks holds one row per (user, course) with a `statuses` jsonb blob
-- mapping a task id to whatever cell-shape the client uses (status, note,
-- doneAt, ...). This persistence layer treats that blob as opaque - writes
-- are a dumb key-level merge (see src/lib/supabase/course-tasks.ts's
-- mergeStatusMap), never a full-object replace, so two concurrent edits to
-- different cells of the same course never clobber each other. The
-- course_id foreign key uses `on delete cascade`, which is what guarantees
-- deleting a course leaves no orphaned task-status row behind.
--
-- course_task_defs holds one row per (user, task_id) recording the user's
-- customization of the built-in task catalog: a rename, a retirement, a
-- reorder, or a wholly custom task. A row's absence means "use the built-in
-- definition unchanged" - only the delta from the built-in catalog is
-- persisted.
--
-- Column naming note: view_id, group_id and sort_position are spelled that
-- way (rather than view/group/position) because `view` is a reserved SQL
-- word and `position`/`group` are keywords - the plain names would need
-- quoting at every call site otherwise.
--
-- Written idempotently.

create table if not exists public.course_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  course_id uuid not null references public.course_hub (id) on delete cascade,
  statuses jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists course_tasks_user_course_idx
  on public.course_tasks (user_id, course_id);

alter table public.course_tasks enable row level security;

drop policy if exists "Users read own course_tasks" on public.course_tasks;
create policy "Users read own course_tasks"
  on public.course_tasks for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own course_tasks" on public.course_tasks;
create policy "Users insert own course_tasks"
  on public.course_tasks for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own course_tasks" on public.course_tasks;
create policy "Users update own course_tasks"
  on public.course_tasks for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own course_tasks" on public.course_tasks;
create policy "Users delete own course_tasks"
  on public.course_tasks for delete
  using (auth.uid() = user_id);

create table if not exists public.course_task_defs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  task_id text not null,
  view_id text not null,
  group_id text not null,
  label text,
  cadence text,
  sort_position integer,
  retired boolean not null default false,
  custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists course_task_defs_user_task_idx
  on public.course_task_defs (user_id, task_id);

alter table public.course_task_defs enable row level security;

drop policy if exists "Users read own course_task_defs" on public.course_task_defs;
create policy "Users read own course_task_defs"
  on public.course_task_defs for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own course_task_defs" on public.course_task_defs;
create policy "Users insert own course_task_defs"
  on public.course_task_defs for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own course_task_defs" on public.course_task_defs;
create policy "Users update own course_task_defs"
  on public.course_task_defs for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own course_task_defs" on public.course_task_defs;
create policy "Users delete own course_task_defs"
  on public.course_task_defs for delete
  using (auth.uid() = user_id);
