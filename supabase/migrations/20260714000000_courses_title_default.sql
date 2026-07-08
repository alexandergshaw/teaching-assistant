-- Unblock the app build that still writes to the pre-existing `courses` table.
--
-- That table has a NOT NULL `title` column this app never sets, so its inserts
-- fail with 'null value in column "title" violates not-null constraint'. Give
-- `title` a default of '' so an insert that omits it succeeds. This does NOT
-- weaken the NOT NULL guarantee (anything that owns this table and sets title
-- explicitly is unaffected) and it changes no existing rows.
--
-- Guarded so it only runs where courses.title actually exists. Harmless and
-- redundant once every client is on the build that targets `course_hub`.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'courses' and column_name = 'title'
  ) then
    execute $q$ alter table public.courses alter column title set default '' $q$;
  end if;
end $$;
