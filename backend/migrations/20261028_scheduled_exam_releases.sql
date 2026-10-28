-- Liberaciones periódicas de pruebas para toda la población, colegios o estudiantes concretos.
-- Ejecutar después de 20261027_multiexam_multirole.sql. Respaldar la BD antes de aplicar.
create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 180),
  code text unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.school_memberships (
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_role text not null default 'student' check (membership_role in ('student','teacher','school_admin')),
  created_at timestamptz not null default now(),
  primary key (school_id,user_id)
);
create index if not exists school_memberships_user_idx on public.school_memberships(user_id,school_id);

create table if not exists public.exam_releases (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  target_type text not null check (target_type in ('all','school','student')),
  school_id uuid references public.schools(id) on delete cascade,
  student_id uuid references auth.users(id) on delete cascade,
  release_at timestamptz not null,
  expires_at timestamptz,
  enabled boolean not null default true,
  note text not null default '' check (length(note) <= 180),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check ((target_type='all' and school_id is null and student_id is null)
      or (target_type='school' and school_id is not null and student_id is null)
      or (target_type='student' and student_id is not null and school_id is null)),
  check (expires_at is null or expires_at > release_at)
);
create index if not exists exam_releases_exam_date_idx on public.exam_releases(exam_id,enabled,release_at);
create index if not exists exam_releases_student_idx on public.exam_releases(student_id,exam_id) where target_type='student';
create index if not exists exam_releases_school_idx on public.exam_releases(school_id,exam_id) where target_type='school';

alter table public.schools enable row level security;
alter table public.school_memberships enable row level security;
alter table public.exam_releases enable row level security;

-- Las funciones SECURITY DEFINER evitan que la comprobación de acceso dependa de políticas recursivas.
create or replace function public.can_access_exam(target_exam uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.exams e
    where e.id=target_exam and e.status='published' and (
      exists (select 1 from public.exam_assignments a where a.exam_id=e.id and a.student_id=(select auth.uid()) and a.status <> 'revoked')
      or exists (
        select 1 from public.exam_releases r
        where r.exam_id=e.id and r.enabled=true and r.release_at <= now()
          and (r.expires_at is null or r.expires_at > now())
          and (r.target_type='all'
            or (r.target_type='student' and r.student_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='student'))
            or (r.target_type='school' and exists(select 1 from public.school_memberships sm where sm.school_id=r.school_id and sm.user_id=(select auth.uid()) and sm.membership_role='student')))
      )
    )
  );
$$;
revoke all on function public.can_access_exam(uuid) from public;
grant execute on function public.can_access_exam(uuid) to authenticated;

-- Los propietarios docentes administran solo las liberaciones de sus propias pruebas.
drop policy if exists "owners manage exam releases" on public.exam_releases;
create policy "owners manage exam releases" on public.exam_releases for all to authenticated
  using (public.owns_exam(exam_id) and public.is_teacher())
  with check (public.owns_exam(exam_id) and public.is_teacher());
drop policy if exists "students read releases applicable to them" on public.exam_releases;
create policy "students read releases applicable to them" on public.exam_releases for select to authenticated
  using (enabled=true and release_at <= now() and (expires_at is null or expires_at > now()) and (
    target_type='all' or (target_type='student' and student_id=(select auth.uid()) and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role='student'))
    or (target_type='school' and exists(select 1 from public.school_memberships sm where sm.school_id=exam_releases.school_id and sm.user_id=(select auth.uid()) and sm.membership_role='student'))
  ));

-- Los docentes administradores crean colegios y matrículas. No se permite autoasignarse roles.
drop policy if exists "teachers manage schools" on public.schools;
create policy "teachers manage schools" on public.schools for all to authenticated
  using (public.is_teacher() and created_by=(select auth.uid()))
  with check (public.is_teacher() and created_by=(select auth.uid()));
drop policy if exists "teachers manage school memberships" on public.school_memberships;
create policy "teachers manage school memberships" on public.school_memberships for all to authenticated
  using (exists(select 1 from public.schools s where s.id=school_memberships.school_id and s.created_by=(select auth.uid()) and public.is_teacher()))
  with check (exists(select 1 from public.schools s where s.id=school_memberships.school_id and s.created_by=(select auth.uid()) and public.is_teacher()));
drop policy if exists "users read own school memberships" on public.school_memberships;
create policy "users read own school memberships" on public.school_memberships for select to authenticated using (user_id=(select auth.uid()));
drop policy if exists "members read own school" on public.schools;
create policy "members read own school" on public.schools for select to authenticated using (exists(select 1 from public.school_memberships sm where sm.school_id=schools.id and sm.user_id=(select auth.uid())));

grant select,insert,update,delete on public.exam_releases,public.schools,public.school_memberships to authenticated;

-- Permite que estudiantes lean una prueba publicada cuando ya hay una liberación activa.
drop policy if exists "assigned students read published exams" on public.exams;
create policy "students read assigned or released published exams" on public.exams for select to authenticated
  using (public.can_access_exam(id));

notify pgrst, 'reload schema';

-- CONFIGURACIÓN DE COLEGIOS (ejecutar desde SQL Editor con el UUID real del docente administrador):
-- insert into public.schools(name,code,created_by) values ('Colegio Ejemplo','COLEGIO-EJEMPLO','UUID-DOCENTE-ADMIN') returning id;
-- Luego matricular cada estudiante usando su UUID de auth.users:
-- insert into public.school_memberships(school_id,user_id,membership_role) values ('UUID-COLEGIO','UUID-ESTUDIANTE','student');
-- La prueba debe tener status='published' para ser visible a estudiantes al llegar la fecha de liberación.
