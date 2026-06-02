export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://hrbzennsghftwjxtqeeg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYnplbm5zZ2hmdHdqeHRxZWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTY3MTYsImV4cCI6MjA5NDQ3MjcxNn0.Yn5iBBEPOvoZ7G5qSFHf7nyDwFa7RAYg93mbRUABGAM';
const SECRET = 'cinetra-scraper-2024';
const JUANITA_BASE = 'https://pelisjuanita.com';

// ── Supabase helpers ─────────────────────────────────────────────────────────
async function dbUpsert(table, data, conflict) {
  if (!data?.length) return true;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(data)
  });
  return res.ok;
}

async function dbDelete(table, column, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });
  return res.ok;
}

async function dbInsert(table, data) {
  if (!data?.length) return true;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(data)
  });
  return res.ok;
}

// ── Fetch helper ─────────────────────────────────────────────────────────────
async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/json',
        'Accept-Language': 'es-AR,es;q=0.9',
        'Referer': JUANITA_BASE
      }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// ── PelisJuanita: Películas ──────────────────────────────────────────────────
function parseMoviesPage(html) {
  if (!html) return [];
  const movies = [];
  const seen = new Set();

  // Extraer cada grid-item
  const itemRegex = /<div class=['"][\s]*grid-item[\s]*['"]>([\s\S]*?)<\/div>\s*(?=<div class=['"][\s]*grid-item|<div class=['"]pagination)/g;

  // Regex para extraer datos de cada item
  const linkRegex = /href=['"]\/movies\/pelicula\/([^'"]+)['"]/;
  const posterRegex = /src=['"]\s*(https:\/\/image\.tmdb\.org[^'"]+\.(?:jpg|png|webp))\s*['"]/;
  const altRegex = /alt=['"]([^'"]+)['"]/;
  const yearRegex = /class=['"][\s]*right[\s]*['"]>\s*(\d{4})/;
  const ratingRegex = /class=['"][\s]*left[\s]*['"]>★\s*([\d.]+)/;
  const h2Regex = /<h2[^>]*>([^<]+)<\/h2>/;

  // Alternativa: buscar todos los links a /movies/pelicula/
  const allLinks = [...html.matchAll(/href=['"][\s]*\/movies\/pelicula\/([^'"\/\s]+)[\s]*['"]/g)];

  for (const linkMatch of allLinks) {
    const slug = linkMatch[1].trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    // Buscar el bloque alrededor de este link
    const linkPos = html.indexOf(linkMatch[0]);
    const blockStart = Math.max(0, linkPos - 200);
    const blockEnd = Math.min(html.length, linkPos + 600);
    const block = html.substring(blockStart, blockEnd);

    // Extraer datos del bloque
    const posterMatch = block.match(posterRegex);
    const altMatch = block.match(altRegex);
    const yearMatch = block.match(yearRegex);
    const ratingMatch = block.match(ratingRegex);
    const h2Match = block.match(h2Regex);

    const titulo = (altMatch?.[1] || h2Match?.[1] || slug.replace(/-/g, ' ')).trim();
    const poster_url = posterMatch?.[1]?.trim() || '';
    const anio = yearMatch?.[1] || '';

    if (!titulo) continue;

    movies.push({
      titulo,
      anio,
      genero: '',
      duracion: '',
      sinopsis: '',
      poster_url,
      link_reproduccion: `${JUANITA_BASE}/movies/pelicula/${slug}`,
      plataforma: 'PelisJuanita'
    });
  }

  return movies;
}

async function scrapeJuanitaMovies(page) {
  const html = await fetchPage(`${JUANITA_BASE}/movies/movies.php?populares=1&page=${page}`);
  return parseMoviesPage(html);
}

// ── PelisJuanita: Series ─────────────────────────────────────────────────────
function parseSeriesPage(html) {
  if (!html) return [];
  const series = [];
  const seen = new Set();

  // Links relativos: ver-serie/{slug} (sin leading slash)
  const allLinks = [...html.matchAll(/href=['"][\s]*ver-serie\/([^'"\/\s\-][^'"\/\s]*)[\s]*['"]/g)];

  for (const linkMatch of allLinks) {
    const slug = linkMatch[1].trim();
    if (!slug || slug.startsWith('-') || /^\d+$/.test(slug) || seen.has(slug)) continue;
    seen.add(slug);

    const linkPos = html.indexOf(linkMatch[0]);
    const blockStart = Math.max(0, linkPos - 200);
    const blockEnd = Math.min(html.length, linkPos + 600);
    const block = html.substring(blockStart, blockEnd);

    const posterMatch = block.match(/src=['"]\s*(https:\/\/image\.tmdb\.org[^'"]+\.(?:jpg|png|webp))\s*['"]/);
    const altMatch = block.match(/alt=['"]([^'"]+)['"]/);
    const yearMatch = block.match(/class=['"][\s]*right[\s]*['"]>\s*(\d{4})/);
    const h2Match = block.match(/<h2[^>]*>([^<]+)<\/h2>/);

    const titulo = (altMatch?.[1] || h2Match?.[1] || slug.replace(/-/g, ' ')).trim();
    const poster_url = posterMatch?.[1]?.trim() || '';
    const anio = yearMatch?.[1] || '';

    if (!titulo || titulo.length < 2) continue;

    series.push({
      titulo,
      anio,
      genero: '',
      sinopsis: '',
      poster_url,
      plataforma: 'PelisJuanita',
      episodios: { 1: [{ ep: 1, titulo: 'Episodio 1', link: `${JUANITA_BASE}/series/ver-serie/${slug}/01x01` }] },
      temporadas: 1,
      ultimo_episodio: 1
    });
  }

  return series;
}

// Obtener episodios de una serie usando serieInfo.php
async function scrapeJuanitaSerieInfo(nombreSerie) {
  const url = `${JUANITA_BASE}/series/serieInfo.php?nombreSerie=${encodeURIComponent(nombreSerie)}`;
  const html = await fetchPage(url);
  if (!html) return null;

  const episodios = {};
  let maxTemp = 1, maxEp = 1;

  // Extraer links de episodios: /series/ver-serie/{slug}/{temp}x{ep}
  const epRegex = /href=['"]\/series\/ver-serie\/([^'"]+)\/(\d+)x(\d+)['"]/g;
  const titleRegex = /alt=['"]([^'"]+)['"]|<h[23][^>]*>([^<]+)<\/h[23]>/;
  let match;

  const episodiosParsed = [];
  while ((match = epRegex.exec(html)) !== null) {
    const slug = match[1];
    const temp = parseInt(match[2]);
    const ep = parseInt(match[3]);

    if (!episodios[temp]) episodios[temp] = [];

    const epUrl = `${JUANITA_BASE}/series/ver-serie/${slug}/${match[2]}x${match[3]}`;

    // Buscar título del episodio en el bloque cercano
    const pos = html.indexOf(match[0]);
    const block = html.substring(Math.max(0, pos - 50), Math.min(html.length, pos + 200));
    const titleMatch = block.match(/alt=['"]([^'"]+)['"]|<span[^>]*>([^<]+)<\/span>/);
    const epTitulo = titleMatch?.[1] || titleMatch?.[2] || `Episodio ${ep}`;

    // Evitar duplicados
    if (!episodios[temp].find(e => e.ep === ep)) {
      episodios[temp].push({ ep, titulo: epTitulo.trim(), link: epUrl });
      maxTemp = Math.max(maxTemp, temp);
      maxEp = Math.max(maxEp, ep);
    }
  }

  // Ordenar episodios por número
  Object.keys(episodios).forEach(t => {
    episodios[t].sort((a, b) => a.ep - b.ep);
  });

  if (Object.keys(episodios).length === 0) return null;

  // Extraer poster y datos básicos
  const posterMatch = html.match(/src=['"]\s*(https:\/\/image\.tmdb\.org[^'"]+\.(?:jpg|png|webp))\s*['"]/);
  const yearMatch = html.match(/\b(19|20)\d{2}\b/);

  return {
    episodios,
    temporadas: maxTemp,
    ultimo_episodio: maxEp,
    poster_url: posterMatch?.[1]?.trim() || '',
    anio: yearMatch?.[0] || ''
  };
}

async function scrapeJuanitaSeries(page) {
  const url = page === 1
    ? `${JUANITA_BASE}/series/apiSeries.php`
    : `${JUANITA_BASE}/series/apiSeries.php?page=${page}`;
  const html = await fetchPage(url);
  return parseSeriesPage(html);
}

// ── AnimeFLV ─────────────────────────────────────────────────────────────────
async function scrapeAnimeFLV() {
  const log = [];
  const animes = [];
  const seen = new Set();

  for (let page = 1; page <= 2; page++) {
    const html = await fetchPage(`https://www3.animeflv.net/browse?order=updated&page=${page}`);
    if (!html) continue;
    const urls = [...new Set(html.match(/\/anime\/[a-zA-Z0-9-]+/g) || [])];
    for (const u of urls) {
      if (seen.has(u)) continue;
      seen.add(u);
      const slug = u.replace('/anime/', '');
      const titulo = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const idx = html.indexOf(u);
      let poster = '';
      if (idx > -1) {
        const b = html.substring(Math.max(0, idx - 300), idx + 300);
        const pm = b.match(/src="([^"]+\.(?:jpg|png|webp))"/);
        if (pm) poster = pm[1].startsWith('http') ? pm[1] : `https://www3.animeflv.net${pm[1]}`;
      }
      animes.push({ titulo, plataforma: 'AnimeFLV', poster_url: poster, episodios: {}, temporadas: 1, ultimo_episodio: 0, genero: 'Anime', sinopsis: '', anio: '' });
    }
  }

  const homeHtml = await fetchPage('https://www3.animeflv.net/');
  if (homeHtml) {
    const epRegex = /\/ver\/([a-zA-Z0-9-]+)-(\d+)/g;
    let em;
    const epMap = {};
    while ((em = epRegex.exec(homeHtml)) !== null) {
      const slug = em[1], epNum = parseInt(em[2]);
      const titulo = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      if (!epMap[slug]) epMap[slug] = { titulo, plataforma: 'AnimeFLV', episodios: { 1: [] }, temporadas: 1, ultimo_episodio: 0, genero: 'Anime', sinopsis: '', poster_url: '', anio: '' };
      if (!epMap[slug].episodios[1].find(e => e.ep === epNum)) {
        epMap[slug].episodios[1].push({ ep: epNum, titulo: `Episodio ${epNum}`, link: `https://www3.animeflv.net/ver/${slug}-${epNum}` });
      }
      epMap[slug].ultimo_episodio = Math.max(epMap[slug].ultimo_episodio, epNum);
    }
    const existingTitles = new Set(animes.map(a => a.titulo));
    Object.values(epMap).forEach(a => { if (!existingTitles.has(a.titulo)) animes.push(a); });
  }

  const animeMap = {};
  animes.forEach(a => { if (!animeMap[a.titulo]) animeMap[a.titulo] = a; });
  const animeList = Object.values(animeMap);
  if (animeList.length) await dbUpsert('anime', animeList, 'titulo');
  log.push(`AnimeFLV: ${animeList.length} animes`);
  return log;
}

// ── Pelota Libre ─────────────────────────────────────────────────────────────
async function scrapePelotaLibre() {
  const canales = [
    { nombre: 'TyC Sports',     siglas: 'TYC',  categoria: 'deportes', color: '#1a6e1a', logo_url: '', link_stream: 'https://pelotalibretv.su/tyc-sports/' },
    { nombre: 'ESPN',           siglas: 'ESPN', categoria: 'deportes', color: '#cc0000', logo_url: '', link_stream: 'https://pelotalibretv.su/espn-1/' },
    { nombre: 'ESPN Premium',   siglas: 'ESPN+',categoria: 'deportes', color: '#cc0000', logo_url: '', link_stream: 'https://pelotalibretv.su/espn-premium/' },
    { nombre: 'Fox Sports',     siglas: 'FOX',  categoria: 'deportes', color: '#004080', logo_url: '', link_stream: 'https://pelotalibretv.su/fox-sports/' },
    { nombre: 'TNT Sports',     siglas: 'TNT',  categoria: 'deportes', color: '#7b0000', logo_url: '', link_stream: 'https://pelotalibretv.su/tnt-sports/' },
    { nombre: 'DirecTV Sports', siglas: 'DTV',  categoria: 'deportes', color: '#0064ff', logo_url: '', link_stream: 'https://pelotalibretv.su/directv-sports/' },
    { nombre: 'TV Pública',     siglas: 'TVP',  categoria: 'deportes', color: '#006400', logo_url: '', link_stream: 'https://pelotalibretv.su/tv-publica/' },
    { nombre: 'DeporTV',        siglas: 'DEP',  categoria: 'deportes', color: '#1a237e', logo_url: '', link_stream: 'https://pelotalibretv.su/deportv/' },
  ];
  await dbUpsert('canales', canales, 'nombre');

  const html = await fetchPage('https://pelotalibretv.su/agenda/');
  const partidos = [];
  if (html) {
    const vsMatches = html.match(/([A-ZÁÉÍÓÚ][a-záéíóúA-ZÁÉÍÓÚ\s]{2,25})\s+(?:vs\.?|VS\.?)\s+([A-ZÁÉÍÓÚ][a-záéíóúA-ZÁÉÍÓÚ\s]{2,25})/g) || [];
    const links = [...new Set(html.match(/https:\/\/pelotalibretv\.su\/[a-zA-Z0-9\-\/]+\//g) || [])];
    vsMatches.slice(0, 20).forEach((vs, i) => {
      const m = vs.match(/(.+?)\s+(?:vs\.?|VS\.?)\s+(.+)/);
      if (!m) return;
      const local = m[1].trim(), visit = m[2].trim();
      if (local.length < 2 || visit.length < 2) return;
      partidos.push({
        equipo_local: local, equipo_visit: visit,
        sigla_local: local.substring(0, 3).toUpperCase(),
        sigla_visit: visit.substring(0, 3).toUpperCase(),
        color_local: '#1565c0', color_visit: '#c62828',
        fecha: new Date().toISOString(), en_vivo: false,
        proveedores: ['tyc'], link_tyc: links[i] || 'https://pelotalibretv.su'
      });
    });
    if (partidos.length) await dbInsert('partidos', partidos);
  }
  return [`PelotaLibre: ${canales.length} canales, ${partidos.length} partidos`];
}

// ── HANDLER PRINCIPAL ────────────────────────────────────────────────────────
export default async function handler(req) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== SECRET) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  const source = url.searchParams.get('source') || 'all';
  const logs = [];
  const t = Date.now();

  try {

    // ── BORRAR contenido de PoseidonHD ──
    if (source === 'delete-poseidon' || source === 'all-fresh') {
      const okP = await dbDelete('peliculas', 'plataforma', 'PoseidonHD');
      const okS = await dbDelete('series', 'plataforma', 'PoseidonHD');
      logs.push(`Borradas pelis PoseidonHD: ${okP} | series: ${okS}`);
    }

    // ── PELÍCULAS PelisJuanita ──
    if (source === 'all' || source === 'peliculas' || source === 'juanita') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const peliculas = await scrapeJuanitaMovies(page);
      if (peliculas.length) {
        await dbUpsert('peliculas', peliculas, 'titulo');
        logs.push(`Películas PelisJuanita pág ${page}: ${peliculas.length} guardadas`);
      } else {
        logs.push(`Películas PelisJuanita pág ${page}: 0 encontradas`);
      }
    }

    // ── SERIES PelisJuanita ──
    if (source === 'series' || source === 'all') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const series = await scrapeJuanitaSeries(page);
      if (series.length) {
        await dbUpsert('series', series, 'titulo');
        logs.push(`Series PelisJuanita pág ${page}: ${series.length} guardadas`);
      } else {
        logs.push(`Series PelisJuanita pág ${page}: 0 encontradas`);
      }
    }

    // ── EPISODIOS de una serie específica ──
    if (source === 'serie-info') {
      const nombre = url.searchParams.get('nombre') || '';
      if (!nombre) {
        logs.push('Falta el parámetro ?nombre=');
      } else {
        const info = await scrapeJuanitaSerieInfo(nombre);
        if (info) {
          await dbUpsert('series', [{ titulo: nombre, ...info, plataforma: 'PelisJuanita' }], 'titulo');
          logs.push(`Serie "${nombre}": ${info.temporadas} temporadas, ${info.ultimo_episodio} eps`);
        } else {
          logs.push(`Serie "${nombre}": no encontrada`);
        }
      }
    }

    // ── ANIME ──
    if (source === 'all' || source === 'anime') {
      logs.push(...await scrapeAnimeFLV());
    }

    // ── FÚTBOL ──
    if (source === 'all' || source === 'futbol') {
      logs.push(...await scrapePelotaLibre());
    }

  } catch (e) {
    logs.push(`Error: ${e.message}`);
  }

  return new Response(JSON.stringify({
    ok: true,
    timestamp: new Date().toISOString(),
    duration: `${((Date.now() - t) / 1000).toFixed(1)}s`,
    logs
  }), { headers: { 'Content-Type': 'application/json' } });
}
