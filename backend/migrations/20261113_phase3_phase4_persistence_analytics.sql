-- Phase 3: persist AI-generated question drafts and teacher review.
-- Phase 4: secure question-media storage, audit indexes and shared analytics assets.

alter table public.question_drafts
  add column if not exists exam_id uuid references public.exams(id) on delete cascade;

-- options_count is a generated column in the current production schema.
-- Leave its expression and constraints untouched.

create index if not exists question_drafts_exam_status_created_idx
  on public.question_drafts(exam_id, status, created_at desc);
create index if not exists question_drafts_creator_status_idx
  on public.question_drafts(created_by, status, created_at desc);
create index if not exists content_versions_created_at_idx
  on public.content_versions(created_at desc);
create index if not exists audit_logs_actor_created_at_idx
  on public.audit_logs(actor_id, created_at desc);
create index if not exists media_assets_uploaded_at_idx
  on public.media_assets(uploaded_by, created_at desc);

drop policy if exists "teacher admin manages drafts" on public.question_drafts;
drop policy if exists "teachers manage own exam drafts" on public.question_drafts;
create policy "teachers manage own exam drafts"
on public.question_drafts for all to authenticated
using (
  public.is_teacher()
  and created_by = (select auth.uid())
  and (
    exam_id is null
    or exists (
      select 1 from public.exams e
      where e.id = question_drafts.exam_id
        and e.owner_id = (select auth.uid())
    )
  )
)
with check (
  public.is_teacher()
  and created_by = (select auth.uid())
  and (
    exam_id is null
    or exists (
      select 1 from public.exams e
      where e.id = question_drafts.exam_id
        and e.owner_id = (select auth.uid())
    )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-media',
  'question-media',
  true,
  4194304,
  array['image/jpeg','image/png','image/webp','image/gif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "question media public read" on storage.objects;
create policy "question media public read"
on storage.objects for select to public
using (bucket_id = 'question-media');

drop policy if exists "teachers upload own question media" on storage.objects;
create policy "teachers upload own question media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'question-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.is_teacher()
);

drop policy if exists "teachers update own question media" on storage.objects;
create policy "teachers update own question media"
on storage.objects for update to authenticated
using (
  bucket_id = 'question-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.is_teacher()
)
with check (
  bucket_id = 'question-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.is_teacher()
);

drop policy if exists "teachers delete own question media" on storage.objects;
create policy "teachers delete own question media"
on storage.objects for delete to authenticated
using (
  bucket_id = 'question-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and public.is_teacher()
);

notify pgrst, 'reload schema';
