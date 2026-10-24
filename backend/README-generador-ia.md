# Generador de preguntas IA — endpoint protegido

La función `netlify/functions/generate-questions.mjs` requiere `POST`, token Bearer de Supabase, identidad activa y un perfil `teacher_admin`. Valida texto (80–90.000 caracteres), parte (1–7), cantidad (1–20), usa un timeout de 45 segundos y valida que todas las preguntas incluyan cuatro opciones, índice correcto y explicación. Las respuestas quedan como borradores para revisión docente.

## Variables del servidor

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (clave pública del proyecto; no `service_role`)
- `AI_PROVIDER_API_KEY` (secreto privado de OpenAI)
- `AI_MODEL` (opcional; valor por defecto `gpt-4o-mini`, sujeto a disponibilidad de la cuenta)
- `AI_API_URL` (opcional; por defecto API oficial de OpenAI Chat Completions)
- `ALLOW_CUSTOM_AI_API_URL=true` solo para un proveedor compatible de confianza, si se requiere

En Netlify: **Site configuration → Environment variables**. Añade los valores y vuelve a desplegar. No guardes la clave privada en HTML, Git ni `.env.example`.

## Verificación

`npm test` ejecuta pruebas automatizadas simuladas de autenticación, permisos, validación y salida de IA. No contacta servicios reales. Para prueba de integración, despliega en Netlify, configura las variables y usa una cuenta con rol `teacher_admin`.

La protección actual no sustituye un rate limiter distribuido por usuario/IP. El banco y los borradores se conservan localmente: la persistencia Supabase de los datos de la aplicación queda pendiente.
