# ICFES English Lab — Vercel + Supabase + OpenAI

Plataforma de preparación para Inglés Saber 11 con dos espacios: un panel docente para administrar pruebas y estudiantes, y un portal estudiantil para resolver evaluaciones, practicar por partes y consultar resultados.

## Arquitectura

- **Frontend:** HTML, CSS y JavaScript en `index.html` (docente) y `student.html` (estudiante).
- **Hosting y API:** Vercel. Las rutas serverless están en `api/`.
- **Base de datos y autenticación:** Supabase Auth + PostgreSQL + RLS.
- **Generación de preguntas:** proveedor compatible con la API de OpenAI, invocado únicamente desde el servidor.

## Funciones actuales

### Panel docente
- Inicio de sesión y verificación de roles `teacher` / `teacher_admin`.
- Creación, edición, duplicación, archivo y publicación de pruebas.
- Banco de preguntas con siete partes, opciones, explicación, imágenes y bloques de lectura.
- Liberación inmediata o programada para todos, un colegio o estudiantes seleccionados.
- Creación de cuentas individuales o por lotes, colegios y matrículas.
- Listado de estudiantes administrados por el docente.
- Asignaciones individuales con fecha límite.
- Seguimiento de intentos, filtros por prueba/estudiante/estado, análisis y exportación CSV.
- Envío de notificaciones a estudiantes administrados.
- Generador de preguntas con IA: crea borradores para revisión; no publica automáticamente.

### Portal estudiantil
- Acceso mediante cuenta con rol `student`.
- Consulta de pruebas asignadas o liberadas.
- Pruebas completas y práctica independiente por cada una de las siete partes.
- Guardado de respuestas durante el intento y calificación en servidor.
- Historial con acceso al análisis detallado de las entregas.
- Biblioteca de apuntes y vocabulario, agenda y notificaciones.
- Tutor de inglés con IA, si está configurada la clave del proveedor.

## Variables de entorno en Vercel

Configúralas en **Project → Settings → Environment Variables** para Production y Preview según corresponda:

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL HTTPS del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Acceso privado de servidor para crear estudiantes y calificar intentos |
| `AI_PROVIDER_API_KEY` | Clave privada del proveedor de IA |
| `AI_MODEL` | Modelo habilitado en la cuenta; valor predeterminado `gpt-4o-mini` |
| `AI_API_URL` | Opcional; predeterminado `https://api.openai.com/v1/chat/completions` |

El código también acepta los alias `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_ANON_KEY` para las variables de URL/clave pública.

**Nunca incluyas `SUPABASE_SERVICE_ROLE_KEY` ni `AI_PROVIDER_API_KEY` en HTML, JavaScript del navegador, GitHub o variables `NEXT_PUBLIC_*`.** No pegues credenciales privadas en el chat. Si una clave privada estuvo alguna vez en un repositorio público, rótala.

## Supabase: esquema y migraciones

La base de datos de este proyecto ya utiliza el esquema multi-prueba y de liberaciones. Las migraciones relevantes se encuentran en `backend/migrations/`:

1. `20261027_multiexam_multirole.sql`: pruebas, siete partes, roles, asignaciones, intentos y políticas.
2. `20261028_scheduled_exam_releases.sql`: colegios, matrículas y liberaciones programadas.
3. `20261113_phase1_phase2_teacher_management.sql`: propiedad de estudiantes por docente, intentos por parte, índices y políticas para listar estudiantes administrados y enviarles avisos.

La migración del 13 de noviembre ya fue aplicada al proyecto conectado durante esta entrega. Si se instala en otra base, respalda primero la base y aplica las migraciones en el orden indicado desde Supabase SQL Editor. No vuelvas a ejecutar una migración antigua sobre una base ya actualizada sin revisar su contenido.

`backend/schema.sql` está pensado como esquema base para una instalación nueva; no lo ejecutes encima de una base existente sin comparar primero sus tablas, constraints y políticas.

### Permisos y propiedad de estudiantes

- Los estudiantes creados desde el panel guardan el docente creador en `profiles.created_by`.
- Los estudiantes asociados a colegios del docente también pueden aparecer en su listado.
- Las políticas RLS limitan el listado y el envío de notificaciones a estudiantes administrados por ese docente.
- Los intentos de los estudiantes permanecen privados para el estudiante y son consultables por el docente propietario de la prueba.

## Despliegue en Vercel

1. Conecta el repositorio de GitHub `User123N/Icfes-English` a Vercel.
2. Usa la rama `main` como rama de producción.
3. Configura las variables de entorno de la sección anterior.
4. Vercel publica los archivos HTML estáticos y las rutas serverless de `api/`.
5. Verifica el inicio de sesión docente y estudiantil después de cada despliegue.

Producción: [https://icfes-english.vercel.app](https://icfes-english.vercel.app)

## Desarrollo y pruebas

Requisitos: Node.js 18 o superior.

```bash
npm test
npm run check
```

- `npm test` ejecuta pruebas unitarias con respuestas simuladas de Supabase y del proveedor de IA.
- `npm run check` comprueba la sintaxis de las APIs, los tests y los scripts de ambos portales HTML.
- Las pruebas simuladas no sustituyen una prueba de extremo a extremo con cuentas reales de docente/estudiante, variables configuradas y el proyecto Supabase de producción.

## Límites actuales conocidos

- Los borradores creados por el generador de IA se mantienen en el almacenamiento local del navegador hasta que se aprueban y pasan al banco; la persistencia remota de la bandeja de borradores con `question_drafts` es una mejora pendiente.
- La carga de algunos materiales, versiones del Studio y partes de la personalización visual todavía utilizan almacenamiento local. No se debe asumir que todos esos recursos se comparten entre dispositivos.
- Los archivos e imágenes que forman parte de preguntas se sincronizan en el contenido de la pregunta; todavía falta un gestor central de almacenamiento con `media_assets` y Supabase Storage.
- El control persistente de cuotas para el generador IA debe añadirse antes de abrirlo a un volumen elevado de usuarios.
- Las funciones de correo transaccional, pagos, suscripciones y facturación no forman parte de esta versión.

## Seguridad

- Usa claves públicas solo en el navegador.
- Las claves de servicio y del proveedor de IA se mantienen exclusivamente en Vercel.
- Mantén RLS habilitado en todas las tablas expuestas en el esquema `public`.
- No permitas que los usuarios modifiquen su propio rol.
- Revisa los avisos de Supabase Security Advisor y habilita la protección contra contraseñas filtradas en Auth.
