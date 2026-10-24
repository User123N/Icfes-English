# ICFES English Lab Studio — backend docente-only

El sitio está pensado para un único docente que prepara y proyecta clases; no requiere registro de estudiantes, perfiles de alumnos ni historial individual.

## Arquitectura recomendada
- **Netlify**: sitio estático y funciones de servidor para IA/operaciones privilegiadas.
- **Supabase Auth**: inicio de sesión del docente.
- **Supabase Postgres + RLS**: banco de preguntas, borradores, ajustes, medios, versiones e historial.
- **Supabase Storage privado**: archivos e imágenes cargados por el docente.
- **Proveedor de IA**: solo desde una función de servidor, nunca desde el HTML.

## Variables de entorno solo servidor

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=...          # clave pública; RLS debe proteger los datos
SUPABASE_SERVICE_ROLE_KEY=...  # solo servidor; jamás en HTML
AI_PROVIDER_API_KEY=...        # solo servidor
AI_MODEL=gpt-4o-mini           # opcional, modelo disponible en tu cuenta
AI_API_URL=https://api.openai.com/v1/chat/completions  # opcional
```

## Esquema
`schema.sql` es para un proyecto Supabase NUEVO o de prueba. No lo ejecutes encima de una base con datos sin respaldo y revisión. Después de crear la cuenta del docente en Supabase Auth, asigna el perfil `teacher_admin` mediante el SQL de ejemplo del archivo. No hay políticas para que un usuario se cambie a sí mismo el rol.

## Estado real de esta entrega
- La página tiene una interfaz adaptada a uso docente y modo de proyección.
- La generación de preguntas puede llamar a una Netlify Function, pero debe protegerse con autenticación de docente antes de producción.
- El banco y los borradores del HTML todavía usan `localStorage`; no están sincronizados con Supabase.
- El inicio de sesión real del docente y el guardado remoto aún deben integrarse y probarse.
- El modo proyección es una ayuda de presentación; la API Fullscreen puede depender de permisos del navegador.

## Antes de publicar
1. Integrar Supabase Auth en el frontend y exigir sesión docente para abrir el panel de administración.
2. Validar el JWT y el perfil `teacher_admin` en cada función protegida.
3. Proteger `generate-questions` con autenticación, límites de uso y validación estricta de la respuesta.
4. Conectar banco, borradores, versiones y configuración con Supabase.
5. Probar edición/recarga/restauración del Studio y las siete partes en navegador real.
6. Mantener Storage privado, copias de seguridad y variables secretas en Netlify.

## Presentación docente por bloques

Las preguntas pueden guardar `passageTitle` y `passage` para asociarlas al mismo texto. El editor docente permite definir esos campos; durante la clase se puede alternar entre una pregunta y el bloque completo, ocultar/mostrar el texto base, navegar, marcar preguntas para explicación y revelar la respuesta desde el bloque. En esta versión los metadatos siguen en `localStorage` hasta que se integre la persistencia Supabase.
