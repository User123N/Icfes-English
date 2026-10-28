# ICFES English Lab Studio — Netlify + Supabase + OpenAI

Proyecto original conservado: la aplicación sigue en `index.html`, con sus herramientas docentes, proyección por bloques, banco local, Studio visual, borradores, importación y exportación. Esta entrega añade un primer flujo real de autenticación de docentes y un endpoint de generación con IA protegido en servidor.

## Requisitos

- Node.js 18 o superior.
- Proyecto Supabase y cuenta docente autorizada.
- Cuenta OpenAI con acceso a un modelo habilitado.
- Sitio desplegado en Netlify para probar la función serverless.

## Configuración de Supabase

1. En Supabase, abre **SQL Editor** del mismo proyecto que se configurará en Netlify y ejecuta `backend/schema.sql`. Crea las tablas y políticas que necesita la app; no borra tablas ni filas. El archivo ahora puede volver a ejecutarse sin fallar por políticas duplicadas. Haz una copia de seguridad y revisa objetos existentes antes de producción. Si solo falta recuperar `profiles`, también está `backend/migrations/20261024_repair_profiles_auth.sql`.
2. En **Authentication → Providers → Email**, habilita Email/Password.
3. Crea la cuenta docente en **Authentication → Users**. Mantén deshabilitado el registro público si no necesitas nuevas cuentas.
4. Después de crearla, abre SQL Editor y ejecuta `backend/assign-teacher-admin.example.sql` desde un entorno administrativo confiable, sustituyendo el correo por el de la cuenta autorizada. El script devuelve/actualiza solo el perfil del usuario que coincida:

   ```sql
   insert into public.profiles (id, display_name, role)
   select id, 'Docente', 'teacher_admin'
   from auth.users
   where email = 'CORREO_DOCENTE';
   ```

   Si ya existe el perfil, usa una actualización manual revisada en lugar de insertar duplicados. No habilites una política que permita a usuarios modificar su propio `role`.
5. La aplicación consulta `profiles` al iniciar sesión; la función también valida el token con Supabase Auth y verifica el rol en el servidor. Una sesión válida sin el perfil `teacher_admin` no obtiene acceso.
6. La clave `sb_publishable_...` es una clave pública de cliente, no una clave `service_role`. Se usa en el navegador. La función acepta la clave pública como `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` o `SUPABASE_ANON_KEY` para verificar usuarios con su JWT. Nunca configures `service_role` en el cliente.

## Variables de entorno en Netlify

En **Site configuration → Environment variables**, crea:

- `NEXT_PUBLIC_SUPABASE_URL` = `https://TU_PROYECTO.supabase.co` (la función acepta también `SUPABASE_URL`)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = la clave pública `sb_publishable_...` del mismo proyecto (la función acepta también `SUPABASE_ANON_KEY`)
- `AI_PROVIDER_API_KEY` = una clave privada nueva de OpenAI, creada y pegada directamente en Netlify
- `AI_MODEL` = modelo disponible en tu cuenta; por defecto se usa `gpt-4o-mini`, pero confirma disponibilidad en tu cuenta
- `AI_API_URL` = opcional; si se omite, usa `https://api.openai.com/v1/chat/completions`

No pegues la clave privada de OpenAI en el chat, en el HTML, en GitHub ni en `.env.example`. Después de cambiar variables, vuelve a desplegar el sitio. Para desarrollo local copia `.env.example` a `.env` (sin subirlo a Git) y usa `netlify dev`; instala la CLI de Netlify localmente si aún no la tienes.

## Despliegue en Netlify

1. Sube el contenido de esta carpeta a un repositorio nuevo o a una rama de trabajo de tu repositorio. No se ha publicado ni modificado ningún repositorio remoto desde esta sesión.
2. En Netlify, importa el repositorio.
3. Usa directorio de publicación `.` y directorio de funciones `netlify/functions` (ya indicado en `netlify.toml`). No hay paso de build para el HTML estático.
4. Añade las variables anteriores y ejecuta Deploy.
5. Abre el sitio HTTPS, inicia sesión con el usuario de Supabase que tenga perfil `teacher_admin`, y prueba el generador. La generación solo crea borradores para revisión; no los publica automáticamente.

## Recuperar errores de Supabase

Si aparece `PGRST205` (no existe `public.profiles`), ejecuta `backend/schema.sql` en el SQL Editor del proyecto cuya URL aparece en Netlify, o la migración de reparación si el resto del esquema ya está instalado. Después de crear la tabla, el SQL envía `NOTIFY pgrst, 'reload schema'` para refrescar la caché REST. Si una cuenta no tiene perfil, crea el usuario en Auth y asígnale `teacher_admin` desde SQL Editor; nunca permitas que el navegador cambie el rol.

## Pruebas locales

```bash
npm test
npm run check
```

Las pruebas unitarias de la función usan respuestas simuladas de Supabase y OpenAI; no demuestran que tus credenciales, el proyecto Supabase o tu cuenta OpenAI funcionen. La prueba real requiere desplegar y configurar los secretos en Netlify.

## Límites importantes de esta entrega

- El inicio/cierre de sesión y la autorización por rol están implementados. El endpoint de IA valida sesión, rol, método, tamaño, cantidad, formato de respuesta y tiempo de espera.
- **El banco, las preguntas aprobadas, los borradores, las versiones y la configuración visual siguen guardándose localmente en el navegador.** Aunque el esquema SQL prepara tablas con RLS, la sincronización remota de todo el estado de la aplicación aún no está conectada. No interpretes esto como persistencia multiusuario terminada.
- No se ha ejecutado SQL ni se han hecho llamadas reales autenticadas contra tu Supabase u OpenAI. No se puede afirmar que las credenciales o el modelo funcionen hasta probarlos en tu cuenta.
- El control de abuso por cuota/IP debe completarse con un limitador persistente (por ejemplo, una tabla RPC/Edge rate limit o un proveedor de rate limiting); el endpoint ya limita el tamaño, cantidad y duración de cada solicitud, pero eso no sustituye una cuota distribuida.
- No se implementó publicación remota desde el panel; no hay credenciales de despliegue en el cliente.
- El archivo `Pasted text.txt` mencionado en el encargo no estaba adjunto en los archivos disponibles para esta sesión. Se trabajó a partir del ZIP original y de los requisitos incluidos en el mensaje.

## Archivos principales

- `index.html`: aplicación original con autenticación docente y diagnóstico de errores de perfil.
- `netlify/functions/public-config.mjs`: entrega únicamente la URL y clave pública de Supabase al navegador; no devuelve claves privadas.
- `backend/migrations/20261024_repair_profiles_auth.sql`: reparación idempotente de la tabla y política de lectura del perfil.
- `backend/assign-teacher-admin.example.sql`: asignación explícita del rol docente desde SQL Editor confiable.
- `backend/RECUPERAR_ACCESO_DOCENTE.md`: pasos para reparar variables, tabla, perfil y despliegue.
- `netlify/functions/generate-questions.mjs`: endpoint de IA protegido.
- `backend/schema.sql`: tablas y políticas RLS preparadas.
- `backend/README-generador-ia.md`: notas de IA.
- `.env.example`: nombres de variables, sin secretos privados.
- `tests/`: pruebas unitarias con servicios simulados.


## Configuración de generación segura con IA en Netlify

La generación de preguntas usa `/.netlify/functions/generate-questions`. Para habilitarla:

1. En Netlify abre **Site configuration → Environment variables**.
2. Configura `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `AI_PROVIDER_API_KEY`. La última debe ser una clave válida del proveedor compatible con OpenAI y mantenerse únicamente en el servidor.
3. Opcionalmente define `AI_MODEL` (por defecto `gpt-4o-mini`) y `AI_API_URL` (por defecto el endpoint oficial de OpenAI).
4. Vuelve a desplegar el sitio para que Netlify reconstruya y publique las funciones.
5. Inicia sesión con una cuenta cuyo perfil tenga el rol `teacher_admin` y prueba el generador en Studio avanzado.

El panel consulta `public-config` para mostrar si la variable de IA está presente; este endpoint solo devuelve un indicador booleano, nunca la clave. No publiques archivos `.env.local` ni incluyas secretos en el ZIP del sitio.


## Migración multi-prueba (27-10-2026)

Para habilitar pruebas independientes, siete partes por prueba y sincronización de preguntas con Supabase, respalda la base de datos y ejecuta `backend/migrations/20261027_multiexam_multirole.sql` en el SQL Editor del proyecto. Esta migración agrega exámenes, partes, asignaciones, intentos, roles base y políticas RLS. No reemplaza una revisión de producción ni configura por sí sola pagos, facturación, almacenamiento de archivos o correos transaccionales. Configura las variables del archivo `.env.example` en Netlify; nunca publiques `.env.local` ni claves privadas.

## Liberación programada de pruebas (v3)

Para programar la disponibilidad de pruebas a una fecha futura, a un colegio o a estudiantes específicos:

1. Haz una copia de seguridad de Supabase.
2. Ejecuta en el SQL Editor la migración `backend/migrations/20261028_scheduled_exam_releases.sql` después de `20261027_multiexam_multirole.sql`.
3. Verifica que la cuenta que administra la plataforma tenga un perfil autorizado y que las pruebas que se entregarán estén en estado `published`.
4. Abre **Panel docente → Liberaciones**. Puedes programar fecha/hora de inicio y cierre opcional, desactivar o eliminar una liberación, crear colegios y matricular estudiantes mediante su UUID de Supabase Auth.
5. Para liberar a un colegio, primero créalo y matricula sus estudiantes en la sección **Colegios y matrículas**. La fecha y el permiso se validan en la base de datos, no solo en la interfaz.

Las fechas se guardan como `timestamptz`; la entrada `datetime-local` se interpreta en la zona horaria del dispositivo administrador y se convierte a UTC. Para que un estudiante pueda iniciar sesión y recibir una liberación, debe tener una cuenta y el perfil/rol correspondiente configurado en Supabase. No compartas claves `service_role` con el navegador.

Esta función programa el acceso; no crea por sí sola cuentas de estudiante, pagos, suscripciones ni facturación. Verifica primero en un proyecto de prueba, especialmente las políticas RLS y las matrículas escolares, antes de usarla en producción.
