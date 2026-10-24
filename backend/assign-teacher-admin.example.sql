-- Ejecutar solo en el SQL Editor del proyecto Supabase correcto, después de crear al usuario en Authentication > Users.
-- Sustituye el correo por el correo exacto del docente. No otorgues este rol a usuarios no autorizados.
insert into public.profiles (id, display_name, role)
select id, 'Docente', 'teacher_admin'
from auth.users
where lower(email) = lower('CORREO_DOCENTE')
on conflict (id) do update
set display_name = excluded.display_name,
    role = 'teacher_admin',
    updated_at = now();

-- Debe insertar/actualizar exactamente una fila. Si no devuelve filas, comprueba el correo en Authentication > Users.
