# TreneSolar — Guía de despliegue

Sitio con agenda de citas en tiempo real, base de datos de clientes,
tarjeta digital con referidos y módulo de reseñas/estadísticas, listo
para conectar a Supabase (plan gratuito).

## 1. Crear el proyecto en Supabase

1. Entra a https://supabase.com → **New project** (el plan Free alcanza de sobra para este uso).
2. Guarda la contraseña de la base de datos que te pida.
3. Cuando el proyecto esté listo, ve a **SQL Editor → New query**, pega
   todo el contenido de `supabase-schema.sql` y dale **Run**.
   Esto crea las tablas, las vistas públicas y las reglas de seguridad.

## 2. Conectar el sitio a tu proyecto

1. En Supabase ve a **Project Settings → API**.
2. Copia el **Project URL** y la clave **anon public**.
3. Abre `js/config.js` y reemplaza:
   ```js
   export const SUPABASE_URL = "PEGA_AQUI_TU_SUPABASE_URL";
   export const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_ANON_KEY";
   ```

## 3. Crear tu usuario de administrador

1. En Supabase ve a **Authentication → Users → Add user**.
2. Crea tu correo y contraseña — con esto entras a `admin.html`.
   (No hace falta ninguna tabla extra: cualquier usuario que puedas
   autenticar en Supabase puede administrar el sitio.)

## 4. Publicar el sitio (gratis)

Cualquiera de estas opciones funciona con esta carpeta tal cual:

- **Netlify**: arrastra la carpeta `trenesolar/` a https://app.netlify.com/drop
- **Vercel**: `vercel deploy` desde dentro de la carpeta
- **GitHub Pages**: sube la carpeta a un repositorio y activa Pages

No necesitas backend propio ni servidor — Supabase actúa como base de
datos y autenticación directamente desde el navegador del cliente.

## 5. Uso diario

- **Sitio público** (`index.html`): tus clientes agendan, ven tu
  tarjeta digital y dejan reseñas.
- **Panel admin** (`admin.html`): entras con tu correo/contraseña para
  ver y cambiar el estado de las citas, bloquear días u horas, revisar
  tus clientes, aprobar reseñas antes de publicarlas, y ver tus
  estadísticas (trabajos completados, calificación promedio, clientes
  llegados por referido).
- **Tarjeta digital**: cada cliente que agenda recibe un enlace propio
  con su QR (`?ref=su-id`). Si alguien agenda a través de ese enlace,
  queda registrado como referido — lo verás en Resumen.

## Estructura de archivos

```
trenesolar/
├── index.html              sitio público
├── admin.html               panel de administración
├── supabase-schema.sql      esquema de base de datos (ejecutar una vez)
├── css/styles.css           estilos compartidos
├── js/
│   ├── config.js             tus credenciales de Supabase
│   ├── supabase-client.js    cliente compartido
│   ├── site.js                lógica del sitio público
│   └── admin.js               lógica del panel admin
└── img/                      logo original
```

## Seguridad

Las políticas de la base de datos (Row Level Security) ya están
configuradas para que:
- cualquier visitante pueda **agendar una cita, registrarse como
  cliente y dejar una reseña**;
- solo tú, con tu sesión iniciada, puedas **ver los datos completos de
  los clientes, cambiar el estado de las citas, bloquear la agenda y
  aprobar reseñas**.
