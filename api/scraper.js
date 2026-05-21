export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://hrbzennsghftwjxtqeeg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYnplbm5zZ2hmdHdqeHRxZWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTY3MTYsImV4cCI6MjA5NDQ3MjcxNn0.Yn5iBBEPOvoZ7G5qSFHf7nyDwFa7RAYg93mbRUABGAM';
const SECRET = 'cinetra-scraper-2024';
const BASE = 'https://www.poseidonhd2.co';

// ============================================================
// SUPABASE
// ============================================================
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

// ============================================================
// FETCH
// ============================================================
async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-AR,es;q=0.9',
        'Referer': BASE
      }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

// Extraer __NEXT_DATA__ JSON del HTML de PoseidonHD
function extractNextData(html) {
  if (!html) return null;
  try {
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
    if (!m) return null;
    return JSON.parse(m[1])?.props?.pageProps || null;
  } catch { return null; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// POSEIDONHD - PELÍCULAS
// Obtiene las URLs de la página de listado, luego entra a cada
// una para extraer datos completos via __NEXT_DATA__
// ============================================================
async function scrapePoseidonPeliculas() {
  const log = [];
  const peliculas = [];
  const seen = new Set();

  for (let page = 1; page <= 5; page++) {
    const html = await fetchPage(`${BASE}/peliculas?page=${page}`);
    if (!html) continue;

    // Extraer URLs de películas del listado
    const urls = [...new Set(html.match(/\/pelicula\/\d+\/[a-zA-Z0-9-]+/g) || [])];
    if (!urls.length) break;

    for (const pelUrl of urls) {
      if (seen.has(pelUrl)) continue;
      seen.add(pelUrl);

      const pelHtml = await fetchPage(`${BASE}${pelUrl}`);
      const data = extractNextData(pelHtml);
      if (!data?.thisMovie) continue;

      const m = data.thisMovie;
      const titulo = m.titles?.name || '';
      if (!titulo) continue;

      // Link de reproducción: primer video latino o inglés
      const videos = m.videos?.latino?.length ? m.videos.latino :
                     m.videos?.english?.length ? m.videos.english : [];
      const link = videos[0]?.result || `${BASE}${pelUrl}`;

      // Géneros
      const genero = (m.genres || []).map(g => g.name).join(', ');

      // Año
      const anio = m.releaseDate ? new Date(m.releaseDate).getFullYear().toString() : '';

      // Duración
      const duracion = m.runtime ? `${m.runtime} min` : '';

      peliculas.push({
        titulo,
        anio,
        genero,
        duracion,
        sinopsis: m.overview || '',
        poster_url: m.images?.poster || '',
        link_reproduccion: link,
        plataforma: 'PoseidonHD'
      });

      await sleep(300);
    }
    await sleep(500);
  }

  if (peliculas.length) await dbUpsert('peliculas', peliculas, 'titulo');
  log.push(`PoseidonHD: ${peliculas.length} películas`);
  return log;
}

// ============================================================
// POSEIDONHD - SERIES
// Obtiene URLs del listado de episodios recientes, luego entra
// a la página de cada serie para obtener TODAS las temporadas
// ============================================================
async function scrapePoseidonSeries() {
  const log = [];
  const series = {};

  // Obtener series desde la página de episodios recientes
  const epsHtml = await fetchPage(`${BASE}/episodios`);
  if (!epsHtml) return ['PoseidonHD series: error al obtener episodios'];

  // Extraer URLs únicas de series
  const serieUrls = [...new Set(
    (epsHtml.match(/\/serie\/\d+\/[a-zA-Z0-9-]+(?=\/temporada|")/g) || [])
    .map(u => u.split('/temporada')[0])
  )];

  for (const serieUrl of serieUrls) {
    const serieHtml = await fetchPage(`${BASE}${serieUrl}`);
    const data = extractNextData(serieHtml);
    if (!data?.thisSerie) continue;

    const s = data.thisSerie;
    const titulo = s.titles?.name || '';
    if (!titulo) continue;

    // Construir objeto de episodios por temporada
    const episodios = {};
    let maxTemp = 0, maxEp = 0;

    for (const season of (s.seasons || [])) {
      const tempNum = season.number;
      if (tempNum === 0) continue; // skip temporada especial
      if (!season.episodes?.length) continue;

      episodios[tempNum] = season.episodes.map(ep => ({
        ep: ep.number,
        titulo: ep.title || `Episodio ${ep.number}`,
        link: ep.url?.slug ? `${BASE}/${ep.url.slug}` : `${BASE}${serieUrl}/temporada/${tempNum}/episodio/${ep.number}`
      }));

      maxTemp = Math.max(maxTemp, tempNum);
      maxEp = Math.max(maxEp, ...season.episodes.map(e => e.number));
    }

    const genero = (s.genres || []).map(g => g.name).join(', ');
    const anio = s.releaseDate ? new Date(s.releaseDate).getFullYear().toString() : '';

    series[titulo] = {
      titulo,
      anio,
      genero,
      sinopsis: s.overview || '',
      poster_url: s.images?.poster || '',
      plataforma: 'PoseidonHD',
      episodios,
      temporadas: maxTemp,
      ultimo_episodio: maxEp
    };

    await sleep(400);
  }

  const seriesList = Object.values(series);
  if (seriesList.length) await dbUpsert('series', seriesList, 'titulo');
  log.push(`PoseidonHD: ${seriesList.length} series con temporadas completas`);
  return log;
}

// ============================================================
// ANIMEFLV
// ============================================================
async function scrapeAnimeFLV() {
  const log = [];
  const animes = [];
  const seen = new Set();

  for (let page = 1; page <= 3; page++) {
    const html = await fetchPage(`https://www3.animeflv.net/browse?order=updated&page=${page}`);
    if (!html) continue;

    const urls = [...new Set(html.match(/\/anime\/[a-zA-Z0-9-]+/g) || [])];
    for (const u of urls) {
      if (seen.has(u)) continue;
      seen.add(u);

      const slug = u.replace('/anime/', '');
      const titulo = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      // Extraer poster del bloque cercano a esta URL en el html del listado
      const idx = html.indexOf(u);
      let poster = '';
      if (idx > -1) {
        const bloque = html.substring(Math.max(0, idx - 300), idx + 300);
        const pm = bloque.match(/src="([^"]+\.(?:jpg|png|webp))"/);
        if (pm) poster = pm[1].startsWith('http') ? pm[1] : `https://www3.animeflv.net${pm[1]}`;
      }

      // Extraer géneros
      let genero = 'Anime';
      const gBlock = html.substring(Math.max(0, idx - 100), idx + 400);
      const gMatch = gBlock.match(/class="Gens"[^>]*>([\s\S]{1,300}?)<\/[^>]+>/);
      if (gMatch) {
        genero = gMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100) || 'Anime';
      }

      animes.push({
        titulo,
        plataforma: 'AnimeFLV',
        poster_url: poster,
        episodios: {},
        temporadas: 1,
        ultimo_episodio: 0,
        genero,
        sinopsis: '',
        anio: ''
      });
    }
    await sleep(600);
  }

  // Episodios recientes desde la home
  const homeHtml = await fetchPage('https://www3.animeflv.net/');
  if (homeHtml) {
    const epRegex = /\/ver\/([a-zA-Z0-9-]+)-(\d+)/g;
    let em;
    const epMap = {};
    while ((em = epRegex.exec(homeHtml)) !== null) {
      const slug = em[1], epNum = parseInt(em[2]);
      const titulo = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const link = `https://www3.animeflv.net/ver/${slug}-${epNum}`;
      if (!epMap[slug]) epMap[slug] = { titulo, plataforma: 'AnimeFLV', episodios: { 1: [] }, temporadas: 1, ultimo_episodio: 0, genero: 'Anime', sinopsis: '', poster_url: '', anio: '' };
      if (!epMap[slug].episodios[1].find(e => e.ep === epNum)) {
        epMap[slug].episodios[1].push({ ep: epNum, titulo: `Episodio ${epNum}`, link });
      }
      epMap[slug].ultimo_episodio = Math.max(epMap[slug].ultimo_episodio, epNum);
    }
    const existingTitles = new Set(animes.map(a => a.titulo));
    Object.values(epMap).forEach(a => { if (!existingTitles.has(a.titulo)) animes.push(a); });
  }

  // Deduplicar
  const animeMap = {};
  animes.forEach(a => { if (!animeMap[a.titulo]) animeMap[a.titulo] = a; });
  const animeList = Object.values(animeMap);
  if (animeList.length) await dbUpsert('anime', animeList, 'titulo');
  log.push(`AnimeFLV: ${animeList.length} animes`);
  return log;
}

// ============================================================
// PELOTA LIBRE
// ============================================================
async function scrapePelotaLibre() {
  const log = [];
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
        fecha: new Date().toISOString(),
        en_vivo: false, proveedores: ['tyc'],
        link_tyc: links[i] || 'https://pelotalibretv.su',
        liga: ''
      });
    });
    if (partidos.length) await dbInsert('partidos', partidos);
  }

  log.push(`PelotaLibre: ${canales.length} canales, ${partidos.length} partidos`);
  return log;
}

// ============================================================
// HANDLER
// ============================================================
export default async function handler(req) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== SECRET) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  // DEBUG: ver __NEXT_DATA__ de cualquier página de PoseidonHD
  const debug = url.searchParams.get('debug');
  if (debug) {
    const html = await fetchPage(debug);
    if (!html) return new Response('Error', { status: 500 });
    const data = extractNextData(html);
    return new Response(JSON.stringify({
      source: 'NEXT_DATA',
      keys: Object.keys(data || {}),
      data
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const source = url.searchParams.get('source') || 'all';
  const logs = [];
  const t = Date.now();

  try {
    if (source === 'all' || source === 'poseidon') {
      logs.push(...await scrapePoseidonPeliculas());
      logs.push(...await scrapePoseidonSeries());
    }
    if (source === 'all' || source === 'peliculas') logs.push(...await scrapePoseidonPeliculas());
    if (source === 'all' || source === 'series') logs.push(...await scrapePoseidonSeries());
    if (source === 'all' || source === 'anime') logs.push(...await scrapeAnimeFLV());
    if (source === 'all' || source === 'futbol') logs.push(...await scrapePelotaLibre());
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
