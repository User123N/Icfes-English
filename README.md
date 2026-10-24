# ICFES English Lab Studio — Netlify + Supabase + OpenAI

Proyecto original conservado: la aplicación sigue en `index.html`, con sus herramientas docentes, proyección por bloques, banco local, Studio visual, borradores, importación y exportación. Esta entrega añade un primer flujo real de autenticación de docentes y un endpoint de generación con IA protegido en servidor.

## Requisitos

- Node.js 18 o superior.
- Proyecto Supabase y cuenta docente autorizada.
- Cuenta OpenAI con acceso a un modelo habilitado.
- Sitio desplegado en Netlify para probar la función serverless.

## Configuración de Supabase

1. En Supabase, abre **SQL Editor** y revisa `backend/schema.sql` antes de ejecutarlo. El script crea tablas y políticas si no existen; no borra tablas ni filas. No lo ejecutes sin revisar si ya tienes objetos con esos nombres.
2. En **Authentication → Providers → Email**, habilita Email/Password.
3. Crea la cuenta docente en **Authentication → Users**. Mantén deshabilitado el registro público si no necesitas nuevas cuentas.
4. Después de crearla, abre SQL Editor y asigna el rol a esa cuenta desde un entorno administrativo confiable, sustituyendo el correo:

   ```sql
   insert into public.profiles (id, display_name, role)
   select id, 'Docente', 'teacher_admin'
   from auth.users
   where email = 'CORREO_DOCENTE';
   ```

   Si ya existe el perfil, usa una actualización manual revisada en lugar de insertar duplicados. No habilites una política que permita a usuarios modificar su propio `role`.
5. La aplicación consulta `profiles` al iniciar sesión; la función también valida el token con Supabase Auth y verifica el rol en el servidor. Una sesión válida sin el perfil `teacher_admin` no obtiene acceso.
6. La clave `sb_publishable_...` es una clave pública de cliente, no una clave `service_role`. Se usa en el navegador. La función usa la misma clave pública como `SUPABASE_ANON_KEY` para verificar usuarios con su JWT. Nunca configures `service_role` en el cliente.

## Variables de entorno en Netlify

En **Site configuration → Environment variables**, crea:

- `SUPABASE_URL` = `https://enncvhybilvpydswvekm.supabase.co`
- `SUPABASE_ANON_KEY` = la clave pública `sb_publishable_...` de tu proyecto
- `AI_PROVIDER_API_KEY` = una clave privada nueva de OpenAI, creada y pegada directamente en Netlify
- `AI_MODEL` = modelo disponible en tu cuenta; por defecto se usa `gpt-4o-mini`, pero confirma disponibilidad en tu cuenta
- `AI_API_URL` = opcional; si se omite, usa `https://api.openai.com/v1/chat/completions`

No pegues la clave privada de OpenAI en el chat, en el HTML, en GitHub ni en `.env.example`. Después de cambiar variables, vuelve a desplegar el sitio. Para desarrollo local puedes copiar `.env.example` a `.env` (sin subirlo a Git) y usar `netlify dev`; instala la CLI de Netlify localmente si aún no la tienes.

## Despliegue en Netlify

1. Sube el contenido de esta carpeta a un repositorio nuevo o a una rama de trabajo de tu repositorio. No se ha publicado ni modificado ningún repositorio remoto desde esta sesión.
2. En Netlify, importa el repositorio.
3. Usa directorio de publicación `.` y directorio de funciones `netlify/functions` (ya indicado en `netlify.toml`). No hay paso de build para el HTML estático.
4. Añade las variables anteriores y ejecuta Deploy.
5. Abre el sitio HTTPS, inicia sesión con el usuario de Supabase que tenga perfil `teacher_admin`, y prueba el generador. La generación solo crea borradores para revisión; no los publica automáticamente.

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

- `index.html`: aplicación original con el flujo de autenticación añadido.
- `netlify/functions/generate-questions.mjs`: endpoint de IA protegido.
- `backend/schema.sql`: tablas y políticas RLS preparadas.
- `backend/README-generador-ia.md`: notas de IA.
- `.env.example`: nombres de variables, sin secretos privados.
- `tests/`: pruebas unitarias con servicios simulados.
