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
| `AI_GENERATION_DAILY_REQUEST_LIMIT` | Opcional; solicitudes IA diarias por docente (predeterminado: `20`) |
| `AI_GENERATION_DAILY_QUESTION_LIMIT` | Opcional; preguntas IA diarias por docente (predeterminado: `100`) |
| `SUPABASE_SECRET_KEY` | Alternativa privada a `SUPABASE_SERVICE_ROLE_KEY` en APIs compatibles |

El código también acepta los alias `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_ANON_KEY` para las variables de URL/clave pública.

**Nunca incluyas `SUPABASE_SERVICE_ROLE_KEY` ni `AI_PROVIDER_API_KEY` en HTML, JavaScript del navegador, GitHub o variables `NEXT_PUBLIC_*`.** No pegues credenciales privadas en el chat. Si una clave privada estuvo alguna vez en un repositorio público, rótala.

## Supabase: esquema y migraciones

La base de datos de este proyecto ya utiliza el esquema multi-prueba y de liberaciones. Las migraciones relevantes se encuentran en `backend/migrations/`:

1. `20261027_multiexam_multirole.sql`: pruebas, siete partes, roles, asignaciones, intentos y políticas.
2. `20261028_scheduled_exam_releases.sql`: colegios, matrículas y liberaciones programadas.
3. `20261113_phase1_phase2_teacher_management.sql`: propiedad de estudiantes por docente, intentos por parte e índices.
4. `20261113_phase3_phase4_persistence_analytics.sql`: borradores IA persistentes, políticas y almacenamiento de imágenes.
5. `20261113_phase5_security_quotas_phase6_release_readiness.sql`: funciones privadas de autorización, cuotas IA atómicas, índices adicionales y ajuste de políticas.

Las migraciones de las fases 1–5 ya fueron aplicadas al proyecto Supabase conectado durante esta entrega. Para una nueva base, revisa el esquema base y aplica las migraciones compatibles en orden. No vuelvas a ejecutar migraciones antiguas sobre una base ya actualizada sin revisar su contenido.

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

## Límites actuales y configuración operativa

- El generador IA limita por docente las solicitudes y preguntas diarias. Valores predeterminados: 20 solicitudes y 100 preguntas por día UTC. Los intentos que llegan a la comprobación de cuota cuentan aunque el proveedor falle después de reservar el cupo.
- El Studio mantiene algunas preferencias visuales y cambios directos en el navegador. El historial compartido respalda el estado y el banco, pero no sustituye una copia de seguridad del repositorio ni de los archivos originales.
- Las instantáneas compartidas están limitadas a 3 MB para evitar guardar imágenes pesadas dentro de JSON.
- La IA requiere `AI_PROVIDER_API_KEY`; la plataforma de pruebas y el portal pueden funcionar sin esa clave, pero el generador y el tutor quedarán deshabilitados.
- El endpoint `/api/health` informa la disponibilidad de Supabase y si existe configuración de IA sin revelar valores de credenciales.
- Correo transaccional, pagos, suscripciones y facturación no forman parte de esta versión.

## Seguridad

- Las funciones `SECURITY DEFINER` que verifican roles y acceso se ejecutan ahora desde el esquema no expuesto `private`; las funciones públicas son wrappers `SECURITY INVOKER`.
- La tabla de cuotas IA tiene RLS habilitado y no concede acceso directo a `anon` ni `authenticated`; solo la API server-side usa el RPC mediante la clave privada.
- Las claves públicas pueden estar en el navegador; las claves de servicio y de IA deben permanecer exclusivamente como variables privadas de servidor en Vercel.
- No permitas que los usuarios modifiquen su propio rol.
- Supabase Auth todavía requiere activar manualmente **Leaked Password Protection** desde Authentication → Settings → Password Security, si el plan/configuración del proyecto ofrece esa opción.
- Tras aplicar cambios de seguridad, revisa los informes Security y Performance de Supabase Advisor.

## Fase 3 — IA con revisión y borradores persistentes

El generador utiliza `POST /api/generate-questions` y crea elementos en `public.question_drafts` mediante `/api/question-drafts`. Los borradores quedan asociados al docente y al examen, se pueden editar/rechazar/aprobar desde Studio y solo al aprobarse pasan a `public.questions` con estado `draft`. La aprobación no publica el examen automáticamente.

La lista pendiente se consulta en Supabase, por lo que se mantiene al cambiar de navegador o dispositivo. Los cambios de revisión están protegidos por sesión docente, propiedad del examen y RLS.

## Fase 4 — Analítica, versiones compartidas y biblioteca

- `GET /api/teacher-analytics`: resumen docente, aciertos por parte, distribución de puntajes, actividad diaria y rendimiento por examen (hasta 90 días de consulta).
- `GET/POST /api/teacher-versions`: historial compartido de instantáneas, restringido al rol `teacher_admin`.
- `POST /api/media-assets`: carga de imágenes de pregunta a Supabase Storage, validando sesión, propietario del examen, MIME y tamaño.
- Bucket `question-media`: lectura pública para que los estudiantes visualicen recursos del examen; escritura/actualización/borrado limitados a docentes sobre su propia carpeta.
- El sincronizador de preguntas sube imágenes base64 al bucket y guarda `image_path` en la fila de pregunta, evitando almacenar base64 como contenido principal.
- El portal del estudiante permite guardar preguntas para repasarlas desde su biblioteca y marcar notificaciones como leídas.

La migración `backend/migrations/20261113_phase3_phase4_persistence_analytics.sql` ya fue aplicada al proyecto conectado. En una base nueva o diferente, respalda primero y aplica las migraciones compatibles con el esquema de destino.

## Fase 5 — Seguridad de producción y control de IA

- `public.ai_generation_usage` conserva por docente y día UTC los contadores de solicitudes y preguntas.
- `public.consume_ai_generation_quota` incrementa los contadores de forma atómica y aplica límites diarios configurables.
- `GET /api/ai-usage` muestra al docente el cupo utilizado y restante.
- Los límites se configuran mediante `AI_GENERATION_DAILY_REQUEST_LIMIT` y `AI_GENERATION_DAILY_QUESTION_LIMIT`.
- Las funciones privilegiadas de autorización se movieron a `private`; el esquema no se expone como API pública. Las funciones de `public` quedaron como wrappers de tipo invoker.
- Se añadieron índices para claves foráneas señaladas por Supabase Advisor y se eliminaron políticas duplicadas de lectura del perfil.

## Fase 6 — Preparación de publicación y verificación

- `GET /api/health` verifica que la configuración mínima de Supabase existe y que Auth responde. Solo devuelve estados booleanos; nunca revela claves.
- `npm run verify` ejecuta pruebas unitarias, comprobación de sintaxis de APIs/HTML y verificaciones de preparación para publicación.
- GitHub Actions ejecuta el mismo comando en cada push a `main` y en pull requests.
- La lista de transferencia a otra cuenta Vercel está documentada abajo.

## Rutas serverless añadidas

| Ruta | Propósito |
|---|---|
| `/api/question-drafts` | Consultar, guardar, editar, aprobar y rechazar borradores IA |
| `/api/teacher-analytics` | Métricas agregadas para el docente |
| `/api/teacher-versions` | Historial persistente de versiones |
| `/api/media-assets` | Almacenar imágenes de preguntas |
| `/api/ai-usage` | Consultar el cupo diario del generador IA |
| `/api/health` | Comprobar conexión básica y configuración de servicios |
| `/lib/supabase-server.js` | Funciones comunes de autenticación y acceso interno a Supabase |

## Comprobación y límites

Las pruebas automatizadas incluyen casos simulados de persistencia de borradores, autorización de versiones, carga de imágenes y agregación de analítica, además de comprobación de sintaxis para los dos portales. Las simulaciones no equivalen a una prueba de extremo a extremo con credenciales reales.

El generador y el tutor IA necesitan `AI_PROVIDER_API_KEY` configurada en Production en Vercel. Esa variable no debe exponerse en el navegador ni compartirse en el chat. La carga de imágenes acepta JPG, PNG, WEBP y GIF de hasta 4 MB; el formulario docente actual limita también el tamaño de imagen antes de sincronizar.

Las versiones compartidas están limitadas a 3 MB por instantánea. Para respaldos grandes, exporta el banco y conserva por separado los archivos originales.

## Publicar desde otra cuenta de Vercel

1. En la otra cuenta, importa el repositorio GitHub `User123N/Icfes-English` y selecciona `main) como Production Branch.
2. Usa la raíz del repositorio como Root Directory. No requiere framework ni comando de build; los archivos HTML y `api/` se sirven directamente. Node.js 20 o superior.
3. Añade estas variables privadas/públicas en el proyecto Vercel:

| Variable | Tipo | Obligatoria |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Pública | Sí |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Pública | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SECRET_KEY` | Privada | Sí |
| `AI_PROVIDER_API_KEY` | Privada | Para el generador y tutor IA |
| `AI_MODEL` | Privada | Opcional |
| `AI_API_URL` | Privada | Opcional |
| `AI_GENERATION_DAILY_REQUEST_LIMIT` | Privada | Opcional; default 20 |
| `AI_GENERATION_DAILY_QUESTION_LIMIT` | Privada | Opcional; default 100 |

4. Mantén las claves del mismo proyecto Supabase `enncvhybilvpydswvekm` si quieres probar con los datos y cuentas actuales. No crees otro proyecto Supabase salvo que vayas a migrar también sus datos y usuarios.
5. Despliega `main) desde la nueva cuenta. Después abre `/api/health`: `core_ready` debe ser `true). Para las funciones IA, `ai_ready` también debe ser `true).
6. Prueba un inicio de sesión docente, uno estudiantil, la creación de una prueba de borrador, la asignación/publicación, un intento de estudiante, el guardado de una pregunta y la generación de una pregunta IA.
7. Revisa Functions/Runtime Logs si alguna de estas pruebas falla. No pegues claves privadas en incidencias, capturas ni conversaciones.

**Importante:** esta entrega no despliega ni cambia el proyecto Vercel anterior. El repositorio contiene los cambios y el siguiente despliegue lo podrás realizar desde la nueva cuenta.
