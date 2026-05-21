# Configuración del Scraper Automático

## Archivos nuevos para subir a GitHub

Subí estos archivos a tu repositorio en la RAÍZ (no dentro de la carpeta Cinetra):

- `api/scraper.js` → el scraper automático
- `api/proxy.js` → el proxy para ver páginas
- `vercel.json` → configuración de Vercel con cron job

## Estructura de carpetas en GitHub

```
cinertra/
├── Cinetra/
│   ├── index.html
│   ├── admin.html
│   └── ...
├── api/
│   ├── scraper.js
│   └── proxy.js
└── vercel.json
```

## Cómo subir los archivos a GitHub

1. Entrá a github.com/SantiCardozo21/cinertra
2. Hacé clic en "Add file" → "Upload files"
3. Subí la carpeta `api/` completa y el `vercel.json`
4. Commit changes

## Ejecutar el scraper manualmente (primera vez)

Después de subir los archivos abrí esta URL en el navegador:

https://cinertra.vercel.app/api/scraper?secret=cinetra-scraper-2024&source=poseidon

Esto va a cargar todas las películas y series de PoseidonHD automáticamente en tu Supabase.

Para anime:
https://cinertra.vercel.app/api/scraper?secret=cinetra-scraper-2024&source=animeflv

## Cron job automático

El vercel.json ya configura el scraper para que se ejecute todos los días a las 3am automáticamente.

## Proxy

El proxy se usa internamente por la app para mostrar páginas.
URL: https://cinertra.vercel.app/api/proxy?url=https://www.poseidonhd2.co
