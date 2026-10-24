-- ICFES English Lab Studio — esquema docente-only para Supabase.
-- Ejecutar en un proyecto de pruebas NUEVO. No aplicar encima de tablas existentes sin respaldo.
create extension if not exists pgcrypto;

-- Solo se crean perfiles administrativos. El primer admin se asigna manualmente desde SQL seguro.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Docente',
  role text not null default 'teacher_admin' check (role = 'teacher_admin'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_teacher_admin()
returns boolean language sql stable security definer set search_path = public, pg_temp
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher_admin'); $$;
revoke all on function public.is_teacher_admin() from public;
grant execute on function public.is_teacher_admin() to authenticated;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  part smallint not null check (part between 1 and 7),
  question text not null check (length(trim(question)) > 0),
  question_type text not null default 'text' check (question_type in ('text','image')),
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text not null default '',
  image_path text,
  difficulty text not null default 'medium' check (difficulty in ('easy','medium','hard')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  source_material text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.question_drafts (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null default gen_random_uuid(),
  part smallint not null check (part between 1 and 7),
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index smallint not null check (correct_index between 0 and 3),
  explanation text not null default '',
  source_material text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.page_configs (
  id uuid primary key default gen_random_uuid(),
  page_key text not null unique,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  alt_text text not null default '',
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.content_versions (
  id uuid primary key default gen_random_uuid(),
  version_number bigint generated always as identity unique,
  label text not null,
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.question_drafts enable row level security;
alter table public.site_settings enable row level security;
alter table public.page_configs enable row level security;
alter table public.media_assets enable row level security;
alter table public.content_versions enable row level security;
alter table public.audit_logs enable row level security;

-- Cerrar lectura/escritura pública: solo sesión del docente con perfil autorizado.
create policy "teacher admin reads own profile" on public.profiles for select to authenticated using (id = auth.uid() and public.is_teacher_admin());
-- No hay política de UPDATE/INSERT/DELETE para perfiles: un usuario no puede asignarse el rol.
create policy "teacher admin manages questions" on public.questions for all to authenticated using (public.is_teacher_admin()) with check (public.is_teacher_admin());
create policy "teacher admin manages drafts" on public.question_drafts for all to authenticated using (public.is_teacher_admin()) with check (public.is_teacher_admin());
create policy "teacher admin manages settings" on public.site_settings for all to authenticated using (public.is_teacher_admin()) with check (public.is_teacher_admin());
create policy "teacher admin manages page configs" on public.page_configs for all to authenticated using (public.is_teacher_admin()) with check (public.is_teacher_admin());
create policy "teacher admin manages media" on public.media_assets for all to authenticated using (public.is_teacher_admin()) with check (public.is_teacher_admin());
create policy "teacher admin manages versions" on public.content_versions for all to authenticated using (public.is_teacher_admin()) with check (public.is_teacher_admin());
create policy "teacher admin reads audit" on public.audit_logs for select to authenticated using (public.is_teacher_admin());
create policy "teacher admin writes audit" on public.audit_logs for insert to authenticated with check (public.is_teacher_admin() and actor_id = auth.uid());

-- Tras crear la cuenta docente en Supabase Auth, asigna el perfil desde SQL Editor confiable:
-- insert into public.profiles (id, display_name, role)
-- select id, 'Docente', 'teacher_admin' from auth.users where email = 'CORREO_DOCENTE';
-- Elimina o reemplaza el correo de ejemplo antes de ejecutar.
-- Configura también Storage privado y sus políticas; este archivo no abre buckets.
