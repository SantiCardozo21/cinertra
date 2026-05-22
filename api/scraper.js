export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://hrbzennsghftwjxtqeeg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYnplbm5zZ2hmdHdqeHRxZWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTY3MTYsImV4cCI6MjA5NDQ3MjcxNn0.Yn5iBBEPOvoZ7G5qSFHf7nyDwFa7RAYg93mbRUABGAM';
const SECRET = 'cinetra-scraper-2024';
const BASE = 'https://www.poseidonhd2.co';

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

function extractNextData(html) {
  if (!html) return null;
  try {
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
    if (!m) return null;
    return JSON.parse(m[1])?.props?.pageProps || null;
  } catch { return null; }
}

// Scrapea UNA SOLA página del listado y guarda las películas
// sin entrar a cada película individualmente
async function scrapePeliculasFromListado(page) {
  const html = await fetchPage(`${BASE}/peliculas?page=${page}`);
  if (!html) return [];

  const data = extractNextData(html);
  const peliculas = [];

  // El listado también tiene __NEXT_DATA__ con las películas!
  if (data) {
    // Combinar todas las listas de películas disponibles
    const allMovies = [
      ...(data.movies || []),
      ...(data.latestMovies || []),
      ...(data.otherMovies || []),
      ...(data.topMoviesDay || []),
      ...(data.topMoviesWeek || []),
    ];

    const seen = new Set();
    for (const m of allMovies) {
      const titulo = m.titles?.name;
      if (!titulo || seen.has(titulo)) continue;
      seen.add(titulo);

      const slug = m.url?.slug || '';
      const link = slug ? `${BASE}/${slug}` : BASE;
      const anio = m.releaseDate ? new Date(m.releaseDate).getFullYear().toString() : '';
      const genero = (m.genres || []).map(g => g.name).join(', ');
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
    }
  }

  // Fallback: extraer URLs del HTML y sacar info básica
  if (!peliculas.length) {
    const urls = [...new Set(html.match(/\/pelicula\/\d+\/[a-zA-Z0-9-]+/g) || [])];
    for (const u of urls) {
      const slugMatch = u.match(/\/pelicula\/\d+\/(.+)/);
      if (!slugMatch) continue;
      const titulo = slugMatch[1].split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const link = `${BASE}${u}`;
      // Intentar sacar poster del HTML
      const idx = html.indexOf(slugMatch[1]);
      let poster = '';
      if (idx > -1) {
        const b = html.substring(Math.max(0, idx - 400), idx + 200);
        const pm = b.match(/https%3A%2F%2Fimage\.tmdb\.org[^"&\s]+/);
        if (pm) poster = decodeURIComponent(pm[0]);
      }
      peliculas.push({ titulo, anio: '', genero: '', duracion: '', sinopsis: '', poster_url: poster, link_reproduccion: link, plataforma: 'PoseidonHD' });
    }
  }

  return peliculas;
}

// Scrapea UNA SOLA serie con todas sus temporadas
async function scrapeSerieCompleta(serieUrl) {
  const html = await fetchPage(`${BASE}${serieUrl}`);
  const data = extractNextData(html);
  if (!data?.thisSerie) return null;

  const s = data.thisSerie;
  const titulo = s.titles?.name;
  if (!titulo) return null;

  const episodios = {};
  let maxTemp = 0, maxEp = 0;

  for (const season of (s.seasons || [])) {
    const tempNum = season.number;
    if (tempNum === 0 || !season.episodes?.length) continue;

    episodios[tempNum] = season.episodes.map(ep => ({
      ep: ep.number,
      titulo: ep.title || `Episodio ${ep.number}`,
      link: ep.url?.slug ? `${BASE}/${ep.url.slug}` : `${BASE}${serieUrl}/temporada/${tempNum}/episodio/${ep.number}`
    }));

    maxTemp = Math.max(maxTemp, tempNum);
    maxEp = Math.max(maxEp, ...season.episodes.map(e => e.number));
  }

  return {
    titulo,
    anio: s.releaseDate ? new Date(s.releaseDate).getFullYear().toString() : '',
    genero: (s.genres || []).map(g => g.name).join(', '),
    sinopsis: s.overview || '',
    poster_url: s.images?.poster || '',
    plataforma: 'PoseidonHD',
    episodios,
    temporadas: maxTemp,
    ultimo_episodio: maxEp
  };
}

// ANIMEFLV
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

  // Episodios recientes
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

// PELOTA LIBRE
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
        proveedores: ['tyc'], link_tyc: links[i] || 'https://pelotalibretv.su', liga: ''
      });
    });
    if (partidos.length) await dbInsert('partidos', partidos);
  }
  return [`PelotaLibre: ${canales.length} canales, ${partidos.length} partidos`];
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export default async function handler(req) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== SECRET) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  const source = url.searchParams.get('source') || 'all';
  const logs = [];
  const t = Date.now();

  // DEBUG
  const debug = url.searchParams.get('debug');
  if (debug) {
    const html = await fetchPage(debug);
    const data = extractNextData(html);
    return new Response(JSON.stringify({ keys: Object.keys(data || {}), data }),
      { headers: { 'Content-Type': 'application/json' } });
  }

  try {
    // PELÍCULAS: scrapear página por página sin entrar a cada película
    if (source === 'all' || source === 'peliculas' || source === 'poseidon') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const peliculas = await scrapePeliculasFromListado(page);
      if (peliculas.length) await dbUpsert('peliculas', peliculas, 'titulo');
      logs.push(`Películas página ${page}: ${peliculas.length} guardadas`);
    }

    // SERIES: scrapear de a una serie por request
    if (source === 'series' || source === 'all') {
      // Obtener lista de series desde episodios
      const epsHtml = await fetchPage(`${BASE}/episodios`);
      const serieUrls = [...new Set(
        (epsHtml?.match(/\/serie\/\d+\/[a-zA-Z0-9-]+(?=\/temporada|")/g) || [])
        .map(u => u.split('/temporada')[0])
      )];
      
      const idx = parseInt(url.searchParams.get('idx') || '0');
      const serieUrl = serieUrls[idx];
      
      if (serieUrl) {
        const serie = await scrapeSerieCompleta(serieUrl);
        if (serie) {
          await dbUpsert('series', [serie], 'titulo');
          logs.push(`Serie ${idx + 1}/${serieUrls.length}: "${serie.titulo}" — ${serie.temporadas} temp, ${serie.ultimo_episodio} eps`);
          // Si hay más series, indicar cuántas quedan
          if (idx + 1 < serieUrls.length) {
            logs.push(`Quedan ${serieUrls.length - idx - 1} series. Próxima: ?secret=${SECRET}&source=series&idx=${idx + 1}`);
          } else {
            logs.push('✅ Todas las series procesadas');
          }
        }
      } else if (source === 'all') {
        logs.push(`Series: ${serieUrls.length} encontradas. Usá source=series&idx=0 para scrapear`);
      }
    }

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
