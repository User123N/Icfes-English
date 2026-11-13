-- Phase 5: production security, persistent AI quotas and database performance.
-- Phase 6: release-readiness support, auditability and repeatable verification.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create or replace function private.is_teacher()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('teacher_admin','teacher')
  );
$$;
create or replace function private.is_teacher_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'teacher_admin'
  );
$$;
create or replace function private.owns_exam(target_exam uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.exams e
    where e.id = target_exam and e.owner_id = (select auth.uid())
  );
$$;
create or replace function private.can_access_exam(target_exam uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.exams e
    where e.id = target_exam and e.status = 'published'
      and (
        exists (
          select 1 from public.exam_assignments a
          where a.exam_id = e.id and a.student_id = (select auth.uid())
            and a.status in ('assigned','in_progress','completed')
        )
        or exists (
          select 1 from public.exam_releases r
          where r.exam_id = e.id and r.enabled = true and r.release_at <= now()
            and (r.expires_at is null or r.expires_at > now())
            and (
              r.target_type = 'all'
              or (r.target_type = 'student' and r.student_id = (select auth.uid()))
              or (
                r.target_type = 'school'
                and exists (
                  select 1 from public.school_memberships sm
                  where sm.school_id = r.school_id and sm.user_id = (select auth.uid())
                    and sm.membership_role = 'student'
                )
              )
            )
        )
      )
  );
$$;

revoke all on function private.is_teacher() from public, anon;
revoke all on function private.is_teacher_admin() from public, anon;
revoke all on function private.owns_exam(uuid) from public, anon;
revoke all on function private.can_access_exam(uuid) from public, anon;
grant execute on function private.is_teacher() to authenticated, service_role;
grant execute on function private.is_teacher_admin() to authenticated, service_role;
grant execute on function private.owns_exam(uuid) to authenticated, service_role;
grant execute on function private.can_access_exam(uuid) to authenticated, service_role;

create or replace function public.is_teacher()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_teacher(); $$;
create or replace function public.is_teacher_admin()
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.is_teacher_admin(); $$;
create or replace function public.owns_exam(target_exam uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.owns_exam(target_exam); $$;
create or replace function public.can_access_exam(target_exam uuid)
returns boolean language sql stable security invoker set search_path = ''
as $$ select private.can_access_exam(target_exam); $$;

revoke all on function public.is_teacher() from public, anon;
revoke all on function public.is_teacher_admin() from public, anon;
revoke all on function public.owns_exam(uuid) from public, anon;
revoke all on function public.can_access_exam(uuid) from public, anon;
grant execute on function public.is_teacher() to authenticated, service_role;
grant execute on function public.is_teacher_admin() to authenticated, service_role;
grant execute on function public.owns_exam(uuid) to authenticated, service_role;
grant execute on function public.can_access_exam(uuid) to authenticated, service_role;

create table if not exists public.ai_generation_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  request_count integer not null default 0 check (request_count >= 0),
  question_count integer not null default 0 check (question_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);
alter table public.ai_generation_usage enable row level security;
revoke all on table public.ai_generation_usage from public, anon, authenticated;
grant all on table public.ai_generation_usage to service_role;

create or replace function public.consume_ai_generation_quota(
  p_user_id uuid,
  p_requested_questions integer,
  p_request_limit integer default 20,
  p_question_limit integer default 100
)
returns table (
  allowed boolean,
  requests_used integer,
  questions_used integer,
  requests_remaining integer,
  questions_remaining integer,
  reset_at timestamptz
)
language plpgsql security definer set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'UTC')::date;
  v_requests integer;
  v_questions integer;
begin
  if p_user_id is null or p_requested_questions is null or p_requested_questions < 1
     or p_requested_questions > 20 or p_request_limit < 1 or p_question_limit < 1 then
    raise exception 'Invalid AI quota parameters' using errcode = '22023';
  end if;
  insert into public.ai_generation_usage(user_id, usage_date)
  values (p_user_id, v_day)
  on conflict (user_id, usage_date) do nothing;
  select u.request_count, u.question_count into v_requests, v_questions
  from public.ai_generation_usage u
  where u.user_id = p_user_id and u.usage_date = v_day
  for update;
  if v_requests + 1 > p_request_limit or v_questions + p_requested_questions > p_question_limit then
    return query select false, v_requests, v_questions,
      greatest(0, p_request_limit - v_requests),
      greatest(0, p_question_limit - v_questions),
      ((v_day + 1)::timestamp at time zone 'UTC');
    return;
  end if;
  update public.ai_generation_usage u
  set request_count = v_requests + 1,
      question_count = v_questions + p_requested_questions,
      updated_at = now()
  where u.user_id = p_user_id and u.usage_date = v_day;
  return query select true, v_requests + 1, v_questions + p_requested_questions,
    greatest(0, p_request_limit - v_requests - 1),
    greatest(0, p_question_limit - v_questions - p_requested_questions),
    ((v_day + 1)::timestamp at time zone 'UTC');
end;
$$;
revoke all on function public.consume_ai_generation_quota(uuid, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_generation_quota(uuid, integer, integer, integer) to service_role;

create index if not exists content_versions_created_by_idx on public.content_versions(created_by);
create index if not exists exam_assignments_assigned_by_idx on public.exam_assignments(assigned_by);
create index if not exists exam_assignments_student_idx on public.exam_assignments(student_id);
create index if not exists exam_releases_created_by_idx on public.exam_releases(created_by);
create index if not exists page_configs_updated_by_idx on public.page_configs(updated_by);
create index if not exists questions_exam_part_status_idx on public.questions(exam_id, part, status);
create index if not exists questions_created_by_idx on public.questions(created_by);
create index if not exists questions_updated_by_idx on public.questions(updated_by);
create index if not exists schools_created_by_idx on public.schools(created_by);
create index if not exists site_settings_updated_by_idx on public.site_settings(updated_by);
create index if not exists student_bookmarks_exam_idx on public.student_bookmarks(exam_id);
create index if not exists student_bookmarks_question_idx on public.student_bookmarks(question_id);
create index if not exists student_bookmarks_student_idx on public.student_bookmarks(student_id);
create index if not exists student_notes_student_updated_idx on public.student_notes(student_id, updated_at desc);
create index if not exists student_notifications_student_created_idx on public.student_notifications(student_id, created_at desc);

drop policy if exists profiles_select_own_for_auth on public.profiles;
drop policy if exists "teacher admin writes audit" on public.audit_logs;
create policy "teacher admin writes audit"
on public.audit_logs for insert to authenticated
with check ((select public.is_teacher_admin()) and actor_id = (select auth.uid()));
drop policy if exists "teacher admin reads audit" on public.audit_logs;
create policy "teacher admin reads audit"
on public.audit_logs for select to authenticated
using ((select public.is_teacher_admin()));

notify pgrst, 'reload schema';
