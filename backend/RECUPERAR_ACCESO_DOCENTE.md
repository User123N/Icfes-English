# Recuperar acceso docente en Supabase + Netlify

Esta guía corrige los errores `No API key found in request`, `PGRST205` y el mensaje de perfil/rol docente. No otorga permisos automáticamente a todos los usuarios.

## 1. Configurar Netlify

En **Site configuration → Environment variables**, crea o verifica estas variables. Asegúrate de que estén disponibles para **Functions** (no solo para Builds):

- `NEXT_PUBLIC_SUPABASE_URL`: URL del proyecto de Supabase que vas a usar.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: clave pública `sb_publishable_...` de ese mismo proyecto.
- `AI_PROVIDER_API_KEY`: clave privada de OpenAI, solo para Functions.
- `AI_MODEL`: `gpt-4o-mini` (o un modelo disponible en tu cuenta).
- `AI_API_URL`: `https://api.openai.com/v1/chat/completions`.

No uses `NEXT_PUBLIC_` en la clave de OpenAI. No configures `service_role` en el navegador.

La página consulta `/.netlify/functions/public-config` para obtener solo la URL y la clave pública de Supabase. Si esa función devuelve `503`, revisa los nombres/alcance de las variables de Netlify.

## 2. Crear las tablas y políticas

1. Abre el proyecto cuya URL configuraste arriba.
2. Ve a **SQL Editor → New query**.
3. Abre `backend/schema.sql`, copia su contenido y ejecútalo.
4. Si solo necesitas reparar `public.profiles` y el resto del esquema ya está creado, puedes ejecutar `backend/migrations/20261024_repair_profiles_auth.sql`.

No ejecutes los SQL en otro proyecto. El esquema configura tablas, permisos y RLS; no crea automáticamente una cuenta docente ni otorga acceso a todas las cuentas.

## 3. Asignar el rol solo a la cuenta autorizada

1. En Supabase, entra a **Authentication → Users** y confirma que la cuenta exista en ese proyecto.
2. Abre `backend/assign-teacher-admin.example.sql` y reemplaza `CORREO_DOCENTE` por el correo exacto.
3. Ejecuta ese SQL en el SQL Editor de confianza. Debe afectar el perfil de una sola cuenta.

Si no devuelve ninguna fila, el usuario no existe en ese proyecto o el correo no coincide. No crees una política que permita al usuario cambiar su propio rol.

## 4. Desplegar y comprobar

1. Haz un nuevo deploy en Netlify para publicar la función `public-config` y el código actualizado.
2. Abre `https://TU-SITIO/.netlify/functions/public-config`. Debe responder con `supabaseUrl` y `supabasePublishableKey`, y la URL debe ser la del proyecto correcto. Es normal que la clave publicable sea visible.
3. Recarga el sitio con `Ctrl + Shift + R`, cierra sesión e inicia sesión de nuevo.
4. Si aparece un error, abre DevTools → Network y revisa el código HTTP y el mensaje de la petición `profiles`. No compartas tokens de sesión ni claves privadas.

## Alcance

La autenticación y el control de acceso docente se validan con Supabase. El banco, los borradores, las versiones y algunos ajustes siguen guardándose en `localStorage`; este proyecto todavía no implementa la sincronización remota completa de todo el contenido.
