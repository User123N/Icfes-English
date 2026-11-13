-- ICFES English Lab — reliability and teacher-management support
-- Applied to project enncvhybilvpydswvekm on 2026-11-13.
-- Adds exam part attempts and teacher-scoped student visibility.

alter table public.profiles
  add column if not exists created_by uuid references auth.users(id) on delete set null;

alter table public.exam_attempts
  add column if not exists part_number smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exam_attempts_part_number_check'
      and conrelid = 'public.exam_attempts'::regclass
  ) then
    alter table public.exam_attempts
      add constraint exam_attempts_part_number_check
      check (part_number is null or part_number between 1 and 7);
  end if;
end $$;

create index if not exists profiles_created_by_role_idx
  on public.profiles(created_by, role);
create index if not exists exam_attempts_exam_part_idx
  on public.exam_attempts(exam_id, part_number, created_at desc);

update public.profiles p
set created_by = managed.created_by
from (
  select distinct on (sm.user_id) sm.user_id, s.created_by
  from public.school_memberships sm
  join public.schools s on s.id = sm.school_id
  order by sm.user_id, s.created_at asc
) managed
where p.id = managed.user_id
  and p.role = 'student'
  and p.created_by is null;

drop policy if exists "teachers read students they manage" on public.profiles;
create policy "teachers read students they manage"
on public.profiles for select to authenticated
using (
  role = 'student'
  and public.is_teacher()
  and (
    created_by = (select auth.uid())
    or exists (
      select 1
      from public.school_memberships sm
      join public.schools s on s.id = sm.school_id
      where sm.user_id = profiles.id
        and s.created_by = (select auth.uid())
        and sm.membership_role = 'student'
    )
  )
);

drop policy if exists "teachers notify students they manage" on public.student_notifications;
create policy "teachers notify students they manage"
on public.student_notifications for insert to authenticated
with check (
  public.is_teacher()
  and exists (
    select 1 from public.profiles p
    where p.id = student_notifications.student_id
      and p.role = 'student'
      and (
        p.created_by = (select auth.uid())
        or exists (
          select 1
          from public.school_memberships sm
          join public.schools s on s.id = sm.school_id
          where sm.user_id = p.id
            and s.created_by = (select auth.uid())
            and sm.membership_role = 'student'
        )
      )
  )
);

notify pgrst, 'reload schema';
