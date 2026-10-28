-- ICFES English Lab Studio: multi-examen, roles y persistencia remota.
-- Ejecutar en Supabase SQL Editor después de respaldar la base existente.
create extension if not exists pgcrypto;

-- Roles base. La asignación de roles privilegiados debe hacerse desde SQL de confianza.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('teacher_admin','teacher','student'));

create table if not exists public.exams (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 160),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists exams_owner_updated_idx on public.exams(owner_id, updated_at desc);

create table if not exists public.exam_parts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  part_number smallint not null check (part_number between 1 and 7),
  title text not null default '',
  instructions text not null default '',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(exam_id, part_number)
);

create table if not exists public.exam_assignments (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid not null references auth.users(id) on delete cascade,
  due_at timestamptz,
  status text not null default 'assigned' check (status in ('assigned','in_progress','completed','revoked')),
  created_at timestamptz not null default now(),
  unique(exam_id, student_id)
);

create table if not exists public.exam_attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  score numeric(5,2) check (score between 0 and 100),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists exam_attempts_student_idx on public.exam_attempts(student_id, created_at desc);

-- Conserva los UUID existentes y añade un identificador estable compatible con IDs locales antiguos.
alter table public.questions add column if not exists client_id text;
alter table public.questions add column if not exists exam_id uuid references public.exams(id) on delete cascade;
alter table public.questions add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table public.questions add column if not exists passage_title text;
alter table public.questions add column if not exists passage text;
alter table public.questions add column if not exists image_data text;
update public.questions set client_id = id::text where client_id is null;
create unique index if not exists questions_client_id_unique on public.questions(owner_id, exam_id, client_id);

alter table public.question_drafts add column if not exists exam_id uuid references public.exams(id) on delete cascade;
alter table public.question_drafts add column if not exists options_count smallint generated always as (jsonb_array_length(options)) stored;

-- Migración conservadora de preguntas antiguas vinculadas a un usuario conocido.
insert into public.exams(owner_id, title, description, status)
select q.created_by, 'Prueba 1', 'Prueba migrada automáticamente desde el banco anterior.', 'draft'
from public.questions q
where q.created_by is not null and q.exam_id is null
  and not exists (select 1 from public.exams e where e.owner_id=q.created_by and e.title='Prueba 1');
update public.questions q set owner_id=q.created_by
where q.owner_id is null and q.created_by is not null;
update public.questions q set exam_id=e.id
from public.exams e
where q.exam_id is null and q.owner_id=e.owner_id and e.title='Prueba 1';
update public.questions set client_id=id::text where client_id is null;


-- Permite de 2 a 4 opciones y que la respuesta correcta exista en el arreglo.
alter table public.questions drop constraint if exists questions_options_check;
alter table public.questions drop constraint if exists questions_options_count_check;
alter table public.questions drop constraint if exists questions_correct_index_check;
alter table public.questions add constraint questions_options_count_check check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4);
alter table public.questions add constraint questions_correct_index_check check (correct_index >= 0 and correct_index < jsonb_array_length(options));
alter table public.question_drafts drop constraint if exists question_drafts_options_check;
alter table public.question_drafts drop constraint if exists question_drafts_options_count_check;
alter table public.question_drafts drop constraint if exists question_drafts_correct_index_check;
alter table public.question_drafts add constraint question_drafts_options_count_check check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) between 2 and 4);
alter table public.question_drafts add constraint question_drafts_correct_index_check check (correct_index >= 0 and correct_index < jsonb_array_length(options));

-- Funciones de autorización con search_path cerrado.
create or replace function public.is_teacher()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('teacher_admin','teacher')); $$;
create or replace function public.owns_exam(target_exam uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.exams e where e.id=target_exam and e.owner_id=(select auth.uid())); $$;
create or replace function public.can_access_exam(target_exam uuid)
returns boolean language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.exams e where e.id=target_exam and (e.owner_id=(select auth.uid()) or (e.status='published' and exists(select 1 from public.exam_assignments a where a.exam_id=e.id and a.student_id=(select auth.uid()) and a.status <> 'revoked')))); $$;
revoke all on function public.is_teacher() from public;
revoke all on function public.owns_exam(uuid) from public;
revoke all on function public.can_access_exam(uuid) from public;
grant execute on function public.is_teacher() to authenticated;
grant execute on function public.owns_exam(uuid) to authenticated;
grant execute on function public.can_access_exam(uuid) to authenticated;

alter table public.exams enable row level security;
alter table public.exam_parts enable row level security;
alter table public.exam_assignments enable row level security;
alter table public.exam_attempts enable row level security;

-- Replace legacy teacher-admin-only question policy with owner-scoped policies.
drop policy if exists "teacher admin manages questions" on public.questions;
drop policy if exists "exam members read questions" on public.questions;
drop policy if exists "exam owners manage questions" on public.questions;
create policy "exam members read questions" on public.questions for select to authenticated using (exam_id is not null and public.can_access_exam(exam_id));
create policy "exam owners manage questions" on public.questions for all to authenticated using (public.is_teacher() and owner_id=(select auth.uid()) and public.owns_exam(exam_id)) with check (public.is_teacher() and owner_id=(select auth.uid()) and public.owns_exam(exam_id));

drop policy if exists "owners manage exams" on public.exams;
create policy "owners manage exams" on public.exams for all to authenticated using (owner_id=(select auth.uid()) and public.is_teacher()) with check (owner_id=(select auth.uid()) and public.is_teacher());
drop policy if exists "assigned students read published exams" on public.exams;
create policy "assigned students read published exams" on public.exams for select to authenticated using (status='published' and exists(select 1 from public.exam_assignments a where a.exam_id=id and a.student_id=(select auth.uid()) and a.status <> 'revoked'));
drop policy if exists "owners manage exam parts" on public.exam_parts;
create policy "owners manage exam parts" on public.exam_parts for all to authenticated using (public.owns_exam(exam_id) and public.is_teacher()) with check (public.owns_exam(exam_id) and public.is_teacher());
drop policy if exists "members read exam parts" on public.exam_parts;
create policy "members read exam parts" on public.exam_parts for select to authenticated using (public.can_access_exam(exam_id));
drop policy if exists "teachers manage assignments" on public.exam_assignments;
create policy "teachers manage assignments" on public.exam_assignments for all to authenticated using (public.owns_exam(exam_id) and public.is_teacher()) with check (public.owns_exam(exam_id) and public.is_teacher());
drop policy if exists "students read own assignments" on public.exam_assignments;
create policy "students read own assignments" on public.exam_assignments for select to authenticated using (student_id=(select auth.uid()));
drop policy if exists "students manage own attempts" on public.exam_attempts;
create policy "students manage own attempts" on public.exam_attempts for all to authenticated using (student_id=(select auth.uid()) and public.can_access_exam(exam_id)) with check (student_id=(select auth.uid()) and public.can_access_exam(exam_id));
drop policy if exists "teachers read attempts for own exams" on public.exam_attempts;
create policy "teachers read attempts for own exams" on public.exam_attempts for select to authenticated using (public.owns_exam(exam_id) and public.is_teacher());

grant select, insert, update, delete on public.exams, public.exam_parts, public.exam_assignments, public.exam_attempts to authenticated;
grant select, insert, update, delete on public.questions to authenticated;

-- Crear siete partes para cada examen nuevo se realiza desde la aplicación.
notify pgrst, 'reload schema';
