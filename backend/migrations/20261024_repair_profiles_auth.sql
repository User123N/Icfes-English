-- Reparación segura e idempotente para autenticación docente en ICFES English Lab Studio.
-- Ejecutar en el SQL Editor del MISMO proyecto que usa NEXT_PUBLIC_SUPABASE_URL.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Docente',
  role text not null default 'teacher_admin' check (role = 'teacher_admin'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.is_teacher_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'teacher_admin'); $$;
revoke all on function public.is_teacher_admin() from public;
grant execute on function public.is_teacher_admin() to authenticated;

drop policy if exists "teacher admin reads own profile" on public.profiles;
create policy "teacher admin reads own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;

-- Asegura que la API REST detecte la tabla después de crearla.
notify pgrst, 'reload schema';
