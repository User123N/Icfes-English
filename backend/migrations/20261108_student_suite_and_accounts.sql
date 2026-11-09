-- ICFES English Lab: registro docente de estudiantes y herramientas personales.
-- Ejecutar después de 20261027_multiexam_multirole.sql y 20261028_scheduled_exam_releases.sql.
create extension if not exists pgcrypto;

-- Cuentas creadas por el docente usan un alias interno de correo; el estudiante inicia sesión con usuario.
-- Nunca almacenar contraseñas en tablas de la aplicación.
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username)) where username is not null;

create table if not exists public.student_notes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Apunte',
  content text not null default '',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create table if not exists public.student_vocabulary (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  term text not null,
  meaning text not null default '',
  example text not null default '',
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  unique(student_id,term)
);
create table if not exists public.student_bookmarks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  question_id uuid references public.questions(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete cascade,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (question_id is not null or exam_id is not null)
);
create table if not exists public.student_notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null default '',
  kind text not null default 'info',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.exam_attempts add column if not exists result_detail jsonb not null default '{}'::jsonb;

alter table public.student_notes enable row level security;
alter table public.student_vocabulary enable row level security;
alter table public.student_bookmarks enable row level security;
alter table public.student_notifications enable row level security;

drop policy if exists "students manage own notes" on public.student_notes;
create policy "students manage own notes" on public.student_notes for all to authenticated
 using(student_id=(select auth.uid())) with check(student_id=(select auth.uid()));
drop policy if exists "students manage own vocabulary" on public.student_vocabulary;
create policy "students manage own vocabulary" on public.student_vocabulary for all to authenticated
 using(student_id=(select auth.uid())) with check(student_id=(select auth.uid()));
drop policy if exists "students manage own bookmarks" on public.student_bookmarks;
create policy "students manage own bookmarks" on public.student_bookmarks for all to authenticated
 using(student_id=(select auth.uid())) with check(student_id=(select auth.uid()));
drop policy if exists "students read own notifications" on public.student_notifications;
create policy "students read own notifications" on public.student_notifications for select to authenticated
 using(student_id=(select auth.uid()));
drop policy if exists "students update own notifications" on public.student_notifications;
create policy "students update own notifications" on public.student_notifications for update to authenticated
 using(student_id=(select auth.uid())) with check(student_id=(select auth.uid()));

grant select,insert,update,delete on public.student_notes,public.student_vocabulary,public.student_bookmarks to authenticated;
grant select,update on public.student_notifications to authenticated;

-- Reafirma la visibilidad de pruebas publicadas: asignación individual O liberación activa aplicable.
create or replace function public.can_access_exam(target_exam uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
 select exists(select 1 from public.exams e where e.id=target_exam and e.status='published' and (
   exists(select 1 from public.exam_assignments a where a.exam_id=e.id and a.student_id=(select auth.uid()) and a.status in ('assigned','in_progress','completed'))
   or exists(select 1 from public.exam_releases r where r.exam_id=e.id and r.enabled
     and r.release_at<=now() and (r.expires_at is null or r.expires_at>now())
     and (r.target_type='all'
       or (r.target_type='student' and r.student_id=(select auth.uid()))
       or (r.target_type='school' and exists(select 1 from public.school_memberships sm where sm.school_id=r.school_id and sm.user_id=(select auth.uid()) and sm.membership_role='student'))))
 ));
$$;
revoke all on function public.can_access_exam(uuid) from public;
grant execute on function public.can_access_exam(uuid) to authenticated;

drop policy if exists "students read assigned or released published exams" on public.exams;
create policy "students read assigned or released published exams" on public.exams for select to authenticated
 using(public.can_access_exam(id));
drop policy if exists "members read exam parts" on public.exam_parts;
create policy "members read exam parts" on public.exam_parts for select to authenticated
 using(public.can_access_exam(exam_id));
drop policy if exists "exam members read questions" on public.questions;
create policy "exam members read questions" on public.questions for select to authenticated
 using(exam_id is not null and public.can_access_exam(exam_id));

notify pgrst,'reload schema';
