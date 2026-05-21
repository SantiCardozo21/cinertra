export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://hrbzennsghftwjxtqeeg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYnplbm5zZ2hmdHdqeHRxZWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTY3MTYsImV4cCI6MjA5NDQ3MjcxNn0.Yn5iBBEPOvoZ7G5qSFHf7nyDwFa7RAYg93mbRUABGAM';
const SECRET = 'cinetra-scraper-2024';

async function dbUpsert(table, data, conflict) {
  if (!data || !data.length) return true;
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
  if (!data || !data.length) return true;
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
        'Referer': new URL(url).origin,
      }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function slugToTitle(slug) {
  return slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// POSEIDONHD
async function scrapePoseidon() {
  const log = [];
  let peliculas = [], series = {};

  for (let page = 1; page <= 3; page++) {
    const html = await fetchPage(`https://www.poseidonhd2.co/peliculas?page=${page}`);
    if (!html) continue;

    // El HTML viene con unicode escapado en JSON - decodificar
    // \u003C = < , \u003E = > , \u0022 = " , \u002F = /
    const decoded = html
      .replace(/\\u003C/gi, '<')
      .replace(/\\u003E/gi, '>')
      .replace(/\\u0022/gi, '"')
      .replace(/\\u002F/gi, '/')
      .replace(/&quot;/g, '"')
      .replace(/&#x2F;/g, '/');

    // Usar el mismo método que funcionó en el debug: match directo
    const urls = [...new Set(decoded.match(/\/pelicula\/\d+\/[a-z0-9-]+/g) || [])];
    
    // También intentar desde el HTML original sin decodificar
    const urlsRaw = [...new Set(html.match(/\/pelicula\/\d+\/[a-zA-Z0-9-]+/g) || [])];
    
    // Combinar ambos resultados
    const allUrls = [...new Set([...urls, ...urlsRaw])];

    for (const pelUrl of allUrls) {
      const slugMatch = pelUrl.match(/\/pelicula\/\d+\/(.+)/);
      if (!slugMatch) continue;
      const titulo = slugToTitle(slugMatch[1]);
      if (titulo.length < 2 || titulo.length > 150) continue;
      const link = `https://www.poseidonhd2.co${pelUrl}`;
      
      // Buscar poster en el bloque cercano a esta URL
      const idx = html.indexOf(slugMatch[1]);
      let poster = '';
      if (idx > -1) {
        const bloque = html.substring(Math.max(0, idx-300), idx+500);
        const tmdbMatch = bloque.match(/image\.tmdb\.org[^"&\s\\u003]+/);
        if (tmdbMatch) poster = 'https://' + decodeURIComponent(tmdbMatch[0]);
      }
      
      // Año del slug o del bloque
      const anioMatch = html.substring(Math.max(0, html.indexOf(slugMatch[1])-100), html.indexOf(slugMatch[1])+300).match(/20\d{2}/);
      const anio = anioMatch ? anioMatch[0] : '';
      
      peliculas.push({ titulo, anio, genero: '', poster_url: poster, link_reproduccion: link, plataforma: 'PoseidonHD', sinopsis: '', duracion: '' });
    }
    await sleep(800);
  }

  // Deduplicar
  const pelMap = {};
  peliculas.forEach(p => { if (!pelMap[p.titulo]) pelMap[p.titulo] = p; });
  peliculas = Object.values(pelMap);
  if (peliculas.length) await dbUpsert('peliculas', peliculas, 'titulo');
  log.push(`PoseidonHD: ${peliculas.length} películas`);

  // Series - episodios recientes
  const epsHtml = await fetchPage('https://www.poseidonhd2.co/episodios');
  if (epsHtml) {
    const epUrls = [...new Set(epsHtml.match(/\/serie\/\d+\/[a-zA-Z0-9-]+\/temporada\/\d+\/episodio\/\d+/g) || [])];
    for (const epUrl of epUrls) {
      const m = epUrl.match(/\/serie\/(\d+)\/([^/]+)\/temporada\/(\d+)\/episodio\/(\d+)/);
      if (!m) continue;
      const slug = m[2], temp = parseInt(m[3]), ep = parseInt(m[4]);
      const titulo = slugToTitle(slug);
      const url = `https://www.poseidonhd2.co${epUrl}`;
      if (!series[slug]) series[slug] = { titulo, plataforma: 'PoseidonHD', episodios: {}, temporadas: 0, ultimo_episodio: 0, genero: '', sinopsis: '', poster_url: '', anio: '' };
      if (!series[slug].episodios[temp]) series[slug].episodios[temp] = [];
      if (!series[slug].episodios[temp].find(e => e.ep === ep)) {
        series[slug].episodios[temp].push({ ep, titulo: `Episodio ${ep}`, link: url });
      }
      series[slug].temporadas = Math.max(series[slug].temporadas, temp);
      series[slug].ultimo_episodio = Math.max(series[slug].ultimo_episodio, ep);
    }
    const serList = Object.values(series);
    if (serList.length) await dbUpsert('series', serList, 'titulo');
    log.push(`PoseidonHD: ${serList.length} series`);
  }

  return log;
}

// ANIMEFLV
async function scrapeAnimeFLV() {
  const log = [];
  const animes = [];

  for (let page = 1; page <= 2; page++) {
    const html = await fetchPage(`https://www3.animeflv.net/browse?order=updated&page=${page}`);
    if (!html) continue;
    const urls = [...new Set(html.match(/\/anime\/[a-zA-Z0-9-]+/g) || [])];
    for (const u of urls) {
      const slug = u.replace('/anime/', '');
      const titulo = slugToTitle(slug);
      if (titulo.length < 2) continue;
      const link = `https://www3.animeflv.net${u}`;
      const idx = html.indexOf(u);
      let poster = '';
      if (idx > -1) {
        const b = html.substring(Math.max(0,idx-200), idx+400);
        const pm = b.match(/src="([^"]+\.(?:jpg|png|webp))"/);
        if (pm) poster = pm[1].startsWith('http') ? pm[1] : `https://www3.animeflv.net${pm[1]}`;
      }
      animes.push({ titulo, plataforma: 'AnimeFLV', poster_url: poster, episodios: {}, temporadas: 1, ultimo_episodio: 0, genero: 'Anime', sinopsis: '', anio: '' });
    }
    await sleep(700);
  }

  // Episodios recientes
  const homeHtml = await fetchPage('https://www3.animeflv.net/');
  if (homeHtml) {
    const epUrls = [...new Set(homeHtml.match(/\/ver\/[a-zA-Z0-9-]+-\d+/g) || [])];
    const epMap = {};
    for (const u of epUrls) {
      const m = u.match(/\/ver\/(.+)-(\d+)$/);
      if (!m) continue;
      const slug = m[1], epNum = parseInt(m[2]);
      const titulo = slugToTitle(slug);
      const link = `https://www3.animeflv.net${u}`;
      if (!epMap[slug]) epMap[slug] = { titulo, plataforma: 'AnimeFLV', episodios: { 1: [] }, temporadas: 1, ultimo_episodio: 0, genero: 'Anime', sinopsis: '', poster_url: '', anio: '' };
      if (!epMap[slug].episodios[1].find(e => e.ep === epNum)) {
        epMap[slug].episodios[1].push({ ep: epNum, titulo: `Episodio ${epNum}`, link });
      }
      epMap[slug].ultimo_episodio = Math.max(epMap[slug].ultimo_episodio, epNum);
    }
    const existing = new Set(animes.map(a => a.titulo));
    Object.values(epMap).forEach(a => { if (!existing.has(a.titulo)) animes.push(a); });
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
  const log = [];
  const canales = [
    { nombre: 'TyC Sports', siglas: 'TYC', categoria: 'deportes', color: '#1a6e1a', logo_url: '', link_stream: 'https://pelotalibretv.su/tyc-sports/' },
    { nombre: 'ESPN', siglas: 'ESPN', categoria: 'deportes', color: '#cc0000', logo_url: '', link_stream: 'https://pelotalibretv.su/espn-1/' },
    { nombre: 'ESPN Premium', siglas: 'ESPN+', categoria: 'deportes', color: '#cc0000', logo_url: '', link_stream: 'https://pelotalibretv.su/espn-premium/' },
    { nombre: 'Fox Sports', siglas: 'FOX', categoria: 'deportes', color: '#004080', logo_url: '', link_stream: 'https://pelotalibretv.su/fox-sports/' },
    { nombre: 'TNT Sports', siglas: 'TNT', categoria: 'deportes', color: '#7b0000', logo_url: '', link_stream: 'https://pelotalibretv.su/tnt-sports/' },
    { nombre: 'DirecTV Sports', siglas: 'DTV', categoria: 'deportes', color: '#0064ff', logo_url: '', link_stream: 'https://pelotalibretv.su/directv-sports/' },
    { nombre: 'TV Pública', siglas: 'TVP', categoria: 'deportes', color: '#006400', logo_url: '', link_stream: 'https://pelotalibretv.su/tv-publica/' },
    { nombre: 'DeporTV', siglas: 'DEP', categoria: 'deportes', color: '#1a237e', logo_url: '', link_stream: 'https://pelotalibretv.su/deportv/' },
  ];
  await dbUpsert('canales', canales, 'nombre');

  // Partidos de la agenda
  const html = await fetchPage('https://pelotalibretv.su/agenda/');
  const partidos = [];
  if (html) {
    const links = [...new Set(html.match(/https:\/\/pelotalibretv\.su\/[a-zA-Z0-9\-\/]+\//g) || [])];
    const vsMatches = html.match(/([A-ZÁÉÍÓÚ][a-záéíóú\s]{2,25})\s+(?:vs\.?|VS\.?)\s+([A-ZÁÉÍÓÚ][a-záéíóú\s]{2,25})/g) || [];
    vsMatches.slice(0, 20).forEach((vs, i) => {
      const m = vs.match(/(.+?)\s+(?:vs\.?|VS\.?)\s+(.+)/);
      if (!m) return;
      const local = m[1].trim(), visit = m[2].trim();
      if (local.length < 2 || visit.length < 2) return;
      partidos.push({
        equipo_local: local, equipo_visit: visit,
        sigla_local: local.substring(0,3).toUpperCase(),
        sigla_visit: visit.substring(0,3).toUpperCase(),
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

// HANDLER
export default async function handler(req) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== SECRET) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });

  // DEBUG
  const debug = url.searchParams.get('debug');
  if (debug) {
    const html = await fetchPage(debug);
    if (!html) return new Response('Error al obtener página', { status: 500 });
    // Extraer __NEXT_DATA__ que Next.js inyecta con todos los datos
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]+?)<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        return new Response(JSON.stringify({
          source: 'NEXT_DATA',
          keys: Object.keys(nextData?.props?.pageProps || {}),
          data: nextData?.props?.pageProps
        }), { headers: { 'Content-Type': 'application/json' } });
      } catch(e) {
        return new Response(JSON.stringify({ error: 'parse error', raw: nextDataMatch[1].substring(0,500) }), 
          { headers: { 'Content-Type': 'application/json' } });
      }
    }
    return new Response(JSON.stringify({
      length: html.length,
      has_next_data: html.includes('__NEXT_DATA__'),
      snippet: html.substring(html.indexOf('__NEXT_DATA__') - 10, html.indexOf('__NEXT_DATA__') + 200)
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  const source = url.searchParams.get('source') || 'all';
  const logs = [];
  const t = Date.now();

  try {
    if (source === 'all' || source === 'poseidon') logs.push(...await scrapePoseidon());
    if (source === 'all' || source === 'anime') logs.push(...await scrapeAnimeFLV());
    if (source === 'all' || source === 'futbol') logs.push(...await scrapePelotaLibre());
  } catch (e) {
    logs.push(`Error: ${e.message}`);
  }

  return new Response(JSON.stringify({
    ok: true,
    timestamp: new Date().toISOString(),
    duration: `${((Date.now()-t)/1000).toFixed(1)}s`,
    logs
  }), { headers: { 'Content-Type': 'application/json' } });
}
