# 🎬 Cinetra — Guía de instalación

## Archivos incluidos
- `index.html` → La app que ven los usuarios
- `admin.html` → Tu panel privado de administración
- `netlify.toml` → Configuración para Netlify
- `supabase_setup.sql` → Crea todas las tablas en la base de datos

---

## PASO 1 — Crear la base de datos en Supabase (gratis)

1. Entrá a https://supabase.com y creá una cuenta gratis
2. Creá un nuevo proyecto (elegí un nombre y contraseña)
3. Esperá que termine de crearse (~2 minutos)
4. Ir a **SQL Editor** → **New Query**
5. Copiá y pegá todo el contenido de `supabase_setup.sql`
6. Hacé clic en **Run**
7. Ir a **Settings → API** y copiá:
   - **Project URL** → la vas a necesitar en el paso 3
   - **anon / public key** → la vas a necesitar en el paso 3

---

## PASO 2 — Subir los archivos a Netlify (gratis)

1. Entrá a https://netlify.com y creá una cuenta gratis
2. En el dashboard, arrastrá la CARPETA completa de Cinetra al área que dice
   "drag and drop your site folder here"
3. Netlify te va a dar una URL tipo: `https://nombre-random.netlify.app`
4. Podés cambiar el nombre en **Site Settings → Change site name**
   Ej: `https://cinetra.netlify.app`

---

## PASO 3 — Conectar Supabase con Cinetra

Abrí TANTO `index.html` COMO `admin.html` con un editor de texto
(podés usar el Bloc de Notas o VSCode) y reemplazá estas dos líneas:

```
const SUPABASE_URL = 'TU_SUPABASE_URL';
const SUPABASE_KEY = 'TU_SUPABASE_ANON_KEY';
```

Por tus datos reales de Supabase. Ejemplo:
```
const SUPABASE_URL = 'https://abcdefgh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

Después volvé a subir los archivos a Netlify (arrastrá la carpeta de nuevo).

---

## PASO 4 — Cambiar la contraseña del admin

En `admin.html`, buscá estas líneas y cambiá los valores:

```javascript
const ADMIN_USER = 'admin';        // tu usuario
const ADMIN_PASS = 'cinetra2024';  // tu contraseña (elegí algo seguro)
```

---

## PASO 5 — Acceder al admin

- App pública:  `https://cinetra.netlify.app`
- Tu admin:     `https://cinetra.netlify.app/admin.html`

Nadie más va a saber que existe `/admin.html` a menos que vos se los digas.

---

## Cómo agregar contenido

1. Abrí `https://cinetra.netlify.app/admin.html`
2. Ingresá con tu usuario y contraseña
3. Ir a **Agregar nuevo**
4. Elegí el tipo: Película / Serie / Anime / Canal / Partido
5. Completá los datos y guardá
6. Los cambios aparecen instantáneamente en la app pública ✓

### ¿Cómo conseguir la URL del póster?
- Ir a https://www.themoviedb.org (TMDB)
- Buscá la película o serie
- Hacé clic derecho en el póster → "Copiar dirección de imagen"
- Pegá esa URL en el campo "URL del póster" del admin

---

## Resumen de costos

| Servicio  | Plan     | Costo |
|-----------|----------|-------|
| Netlify   | Free     | $0    |
| Supabase  | Free     | $0    |
| **Total** |          | **$0**|

El plan gratuito de Supabase incluye 500MB de base de datos y
50.000 requests por mes, más que suficiente para empezar.
