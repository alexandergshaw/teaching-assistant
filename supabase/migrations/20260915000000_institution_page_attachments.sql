-- Attachments for institution_pages: any file type, uploaded to a page in
-- the per-institution knowledge base ("Give me the chance to attach/embed
-- all sorts of files in the knowledge pages"). Bytes live in the private
-- "institution-attachments" storage bucket; this table only records the
-- metadata (file name, mime type, size, storage path) - see
-- src/lib/institution-page-attachments.ts for the data-access layer that
-- reads/writes it.
--
-- institution_page_attachments is a CHILD TABLE, not a jsonb column on
-- institution_pages (unlike course_hub.misc_files, which is exactly that
-- shape for a different domain). Three reasons, together - the same shape
-- of argument as workflow_run_steps' own header comment
-- (20260909000000_workflow_run_logs.sql):
--   (1) a page gains attachments one upload at a time, from independent
--       requests (today one at a time; a future bulk-upload UI makes this
--       genuinely concurrent) - each upload is its own INSERT, so two
--       uploads racing against the SAME page never race against each
--       other. A jsonb array on institution_pages would require every
--       upload to read the current array, append, and write the whole
--       column back - two uploads that both read before either write lands
--       would each write back an array missing the other's file, silently
--       losing one of the two attachments (a lost update, not an error).
--   (2) institution_pages.body already stores potentially large markdown
--       text that autosaves as an instructor types; a jsonb attachments
--       column would make every such autosave rewrite an unrelated column
--       (and every attachment upload would touch the row a markdown edit
--       might be mid-flight on), coupling two features that change on
--       completely different rhythms.
--   (3) deleting a page must remove its attachments' STORAGE OBJECTS before
--       the row delete removes their metadata (see
--       src/lib/institution-page-attachments.ts's
--       deleteInstitutionPageAndAttachments) - a child table lets that
--       lookup be a single indexed `page_id IN (...)` query across a whole
--       subtree (a page delete cascades to its descendants - see
--       institution_pages.parent_id); with jsonb-on-page the same lookup
--       would mean fetching every page row in the subtree just to parse
--       its embedded array back out.
--
-- page_id references institution_pages and cascades on delete, same as
-- institution_pages.parent_id cascading on itself: deleting a page (or an
-- ancestor whose own cascade takes it) removes its attachment ROWS
-- automatically. That cascade does NOT touch the Storage objects those rows
-- point to - a foreign key cascade only ever deletes rows, never calls
-- Storage - so callers MUST collect and remove the storage objects BEFORE
-- the page delete runs, or every attachment on a deleted page (and its
-- whole subtree) becomes an orphaned, invisible-forever blob: dead cost,
-- and leaked institutional content with no row left to find it by. See
-- deleteInstitutionPageAndAttachments for how this migration's cascade is
-- paired with that explicit cleanup, including what happens when the
-- cleanup itself partially fails.
--
-- Owner-scoped RLS matching institution_pages' four standard policies.
--
-- Written idempotently.

create table if not exists public.institution_page_attachments (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.institution_pages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  storage_path text not null,
  created_at timestamptz not null default now()
);

-- Owner-scoped listing for one page, and the `page_id IN (...)` subtree
-- lookup the cascade-delete cleanup depends on, both covered by this single
-- composite index (user_id, page_id as a leftmost-prefix pair, created_at
-- for stable ordering).
create index if not exists institution_page_attachments_user_page_created_idx
  on public.institution_page_attachments (user_id, page_id, created_at);

alter table public.institution_page_attachments enable row level security;

drop policy if exists "Users read own institution_page_attachments" on public.institution_page_attachments;
create policy "Users read own institution_page_attachments"
  on public.institution_page_attachments for select
  using (auth.uid() = user_id);

drop policy if exists "Users insert own institution_page_attachments" on public.institution_page_attachments;
create policy "Users insert own institution_page_attachments"
  on public.institution_page_attachments for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users update own institution_page_attachments" on public.institution_page_attachments;
create policy "Users update own institution_page_attachments"
  on public.institution_page_attachments for update
  using (auth.uid() = user_id);

drop policy if exists "Users delete own institution_page_attachments" on public.institution_page_attachments;
create policy "Users delete own institution_page_attachments"
  on public.institution_page_attachments for delete
  using (auth.uid() = user_id);

-- Private bucket (AC5: these are institutional policy documents, so this
-- defaults to the more private option - served back out only via
-- short-lived signed URLs, never a public URL; see
-- getInstitutionPageAttachmentUrl).
--
-- file_size_limit is set to 6291456 bytes (6 MiB), matching
-- MAX_ATTACHMENT_SIZE_BYTES in src/lib/institution-page-attachments.ts.
-- Enforcing the same cap at the Storage layer, not only in application
-- code, means a request that somehow bypassed
-- createInstitutionPageAttachment's own check would still be refused by
-- Storage itself rather than silently accepted - the two numbers must be
-- kept in sync by hand, the same way course_files_size_limit.sql's bucket
-- limit is a hand-kept constant with no shared source of truth across
-- SQL/TypeScript.
insert into storage.buckets (id, name, public, file_size_limit)
  values ('institution-attachments', 'institution-attachments', false, 6291456)
  on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists "Users read own institution attachment objects" on storage.objects;
create policy "Users read own institution attachment objects"
  on storage.objects for select
  using (bucket_id = 'institution-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users insert own institution attachment objects" on storage.objects;
create policy "Users insert own institution attachment objects"
  on storage.objects for insert
  with check (bucket_id = 'institution-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users update own institution attachment objects" on storage.objects;
create policy "Users update own institution attachment objects"
  on storage.objects for update
  using (bucket_id = 'institution-attachments' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'institution-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users delete own institution attachment objects" on storage.objects;
create policy "Users delete own institution attachment objects"
  on storage.objects for delete
  using (bucket_id = 'institution-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
