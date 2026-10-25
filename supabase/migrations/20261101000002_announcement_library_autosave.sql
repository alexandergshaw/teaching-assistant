-- POST RPC avoids placing a potentially large legacy CAS snapshot in a URL.
-- Only the service client may call this function; session identity and desired
-- outline are established by the authenticated action before dispatch.
create or replace function public.update_announcement_library_entry(
  p_id uuid, p_user_id uuid, p_course_id uuid,
  p_exemplar_text text, p_label text, p_outline jsonb,
  p_expected_text text, p_expected_label text
)
returns setof public.announcement_exemplars
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_entry public.announcement_exemplars%rowtype;
begin
  -- Validate before locking. No truncation, logging or dynamic SQL.
  if p_exemplar_text is null or length(btrim(p_exemplar_text)) = 0
     or length(p_exemplar_text) > 16000 or octet_length(p_exemplar_text) > 32768
     or length(p_label) > 120 or p_outline is null
     or p_expected_text is null or octet_length(p_expected_text) > 262144
     or length(p_expected_label) > 1024 then
    return;
  end if;
  if not exists (select 1 from public.course_hub c
                 where c.id = p_course_id and c.user_id = p_user_id) then
    return;
  end if;
  select e.* into current_entry from public.announcement_exemplars e
    where e.id = p_id and e.user_id = p_user_id and e.course_id = p_course_id
    for update;
  if not found then return; end if;
  -- An uncertain request may already have stored exactly this desired revision.
  if current_entry.exemplar_text = p_exemplar_text
     and current_entry.label is not distinct from p_label then
    return next current_entry;
    return;
  end if;
  if current_entry.exemplar_text = p_expected_text
     and current_entry.label is not distinct from p_expected_label then
    return query update public.announcement_exemplars e
      set exemplar_text = p_exemplar_text, label = p_label, outline = p_outline
      where e.id = p_id and e.user_id = p_user_id and e.course_id = p_course_id
        and e.exemplar_text = p_expected_text
        and e.label is not distinct from p_expected_label
      returning e.*;
  end if;
end;
$$;

revoke all on function public.update_announcement_library_entry(uuid, uuid, uuid, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.update_announcement_library_entry(uuid, uuid, uuid, text, text, jsonb, text, text) to service_role;
