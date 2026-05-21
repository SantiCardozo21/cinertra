// Vercel Edge Function - Scraper automático de Cinetra
// Fuentes: PoseidonHD, PelisJuanita, AnimeFLV, PelotaLibre
export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://hrbzennsghftwjxtqeeg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYnplbm5zZ2hmdHdqeHRxZWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTY3MTYsImV4cCI6MjA5NDQ3MjcxNn0.Yn5iBBEPOvoZ7G5qSFHf7nyDwFa7RAYg93mbRUABGAM';
const SECRET = 'cinetra-scraper-2024';

// ============================================================
// HELPERS
// ============================================================
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
      },
      redirect: 'follow'
    });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function extractText(html, regex) {
  const m = html.match(regex);
  return m ? m[1].trim() : '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// POSEIDONHD - Películas, Series y Episodios
// ============================================================
async function scrapePoseidon() {
  const log = [];
  let peliculas = [], series = {};

  // Películas - últimas 3 páginas
  for (let page = 1; page <= 3; page++) {
    const html = await fetchPage(`https://www.poseidonhd2.co/peliculas?page=${page}`);
    if (!html) continue;

    // PoseidonHD - el HTML viene en formato markdown con esta estructura:
    // * [AÑO![Titulo](poster)](https://poseidonhd2.co/pelicula/ID/slug)
    //   Titulo
    //   rating duracion AÑO
    //   Género: X, Y
    const pelRegex = /\* \[(\d{4})!\[([^\]]+)\]\(([^)]+)\)\s*\n?\s*([^\]]+)\]\(https:\/\/www\.poseidonhd2\.co(\/pelicula\/[^)]+)\)[\s\S]{1,400}?Género:\s*([^\n]+)/g;
    let m;
    while ((m = pelRegex.exec(html)) !== null) {
      const anio = m[1];
      const titulo = m[2].trim();
      let poster = m[3].trim();
      const link = `https://www.poseidonhd2.co${m[5]}`;
      const genero = m[6].trim().replace(/\s+/g,' ');
      // Decodificar poster de _next/image
      const posterMatch = poster.match(/url=([^&]+)/);
      if (posterMatch) poster = decodeURIComponent(posterMatch[1]);
      if (titulo.length > 1 && titulo.length < 150) {
        peliculas.push({ titulo, anio, genero, poster_url: poster, link_reproduccion: link, plataforma: 'PoseidonHD', sinopsis: '', duracion: '' });
      }
    }
    await sleep(800);
  }

  // Deduplicar por título
  const pelMap = {};
  peliculas.forEach(p => { if (!pelMap[p.titulo]) pelMap[p.titulo] = p; });
  peliculas = Object.values(pelMap);
  if (peliculas.length) await dbUpsert('peliculas', peliculas, 'titulo');
  log.push(`PoseidonHD: ${peliculas.length} películas`);

  // Últimos episodios de series
  const epsHtml = await fetchPage('https://www.poseidonhd2.co/episodios');
  if (epsHtml) {
    const epRegex = /href="(\/serie\/(\d+)\/([^\/]+)\/temporada\/(\d+)\/episodio\/(\d+))"/g;
    let em;
    while ((em = epRegex.exec(epsHtml)) !== null) {
      const url = `https://www.poseidonhd2.co${em[1]}`;
      const slug = em[3];
      const titulo = slug.split('-').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
      const temp = parseInt(em[4]), ep = parseInt(em[5]);
      if (!series[slug]) series[slug] = { titulo, plataforma:'PoseidonHD', episodios:{}, temporadas:0, ultimo_episodio:0, genero:'', sinopsis:'', poster_url:'', anio:'' };
      if (!series[slug].episodios[temp]) series[slug].episodios[temp] = [];
      const exists = series[slug].episodios[temp].find(e => e.ep===ep);
      if (!exists) series[slug].episodios[temp].push({ ep, titulo:`Episodio ${ep}`, link:url });
      series[slug].temporadas = Math.max(series[slug].temporadas, temp);
      series[slug].ultimo_episodio = Math.max(series[slug].ultimo_episodio, ep);
    }
    const serList = Object.values(series);
    if (serList.length) await dbUpsert('series', serList, 'titulo');
    log.push(`PoseidonHD: ${serList.length} series`);
  }

  return log;
}

// ============================================================
// PELISJUANITA - Películas y Series
// ============================================================
async function scrapePelisJuanita() {
  const log = [];
  let peliculas = [], series = {};

  // Películas recientes
  for (let page = 1; page <= 3; page++) {
    const html = await fetchPage(`https://pelisjuanita.com/movies/page/${page}/`);
    if (!html) continue;
    
    // PelisJuanita usa WordPress con estructura típica
    const itemRegex = /href="(https:\/\/pelisjuanita\.com\/movies\/[^"]+)"[\s\S]{1,400}?src="([^"]+)"[\s\S]{1,200}?<(?:h2|h3)[^>]*>([^<]+)<\/(?:h2|h3)>/g;
    let m;
    while ((m = itemRegex.exec(html)) !== null) {
      const link = m[1];
      const poster = m[2];
      const titulo = m[3].trim().replace(/\s+/g,' ');
      if (titulo.length < 2 || titulo.length > 100) continue;
      peliculas.push({ titulo, anio: '', genero: '', poster_url: poster, link_reproduccion: link, plataforma: 'PelisJuanita', sinopsis: '', duracion: '' });
    }
    await sleep(600);
  }

  const pelMap = {};
  peliculas.forEach(p => { if (!pelMap[p.titulo]) pelMap[p.titulo] = p; });
  peliculas = Object.values(pelMap);
  if (peliculas.length) await dbUpsert('peliculas', peliculas, 'titulo');
  log.push(`PelisJuanita: ${peliculas.length} películas`);

  // Series recientes
  const serHtml = await fetchPage('https://pelisjuanita.com/series/');
  if (serHtml) {
    const serRegex = /href="(https:\/\/pelisjuanita\.com\/series\/[^"\/]+\/)"[\s\S]{1,400}?src="([^"]+)"[\s\S]{1,200}?<(?:h2|h3)[^>]*>([^<]+)<\/(?:h2|h3)>/g;
    let sm;
    const serList = [];
    while ((sm = serRegex.exec(serHtml)) !== null) {
      const titulo = sm[3].trim().replace(/\s+/g,' ');
      if (titulo.length < 2 || titulo.length > 100) continue;
      serList.push({ titulo, plataforma:'PelisJuanita', poster_url:sm[2], episodios:{}, temporadas:1, ultimo_episodio:0, genero:'', sinopsis:'', anio:'' });
    }
    if (serList.length) await dbUpsert('series', serList, 'titulo');
    log.push(`PelisJuanita: ${serList.length} series`);
  }

  return log;
}

// ============================================================
// ANIMEFLV - Anime
// ============================================================
async function scrapeAnimeFLV() {
  const log = [];
  const animes = [];

  // Anime actualizado recientemente
  for (let page = 1; page <= 2; page++) {
    const html = await fetchPage(`https://www3.animeflv.net/browse?order=updated&page=${page}`);
    if (!html) continue;

    const animeRegex = /href="(\/anime\/[^"]+)"[\s\S]{1,300}?src="([^"]+)"[\s\S]{1,200}?<h3[^>]*>([^<]+)<\/h3>/g;
    let m;
    while ((m = animeRegex.exec(html)) !== null) {
      const url = `https://www3.animeflv.net${m[1]}`;
      const poster = m[2].startsWith('http') ? m[2] : `https://www3.animeflv.net${m[2]}`;
      const titulo = m[3].trim().replace(/\s+/g,' ');
      if (titulo.length < 2) continue;
      // Extraer géneros del bloque
      const bloque = html.substring(m.index, m.index+500);
      const genero = extractText(bloque, /class="Gens"[^>]*>([\s\S]{1,200}?)<\/[^>]+>/);
      const generoLimpio = genero.replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim().substring(0,100);
      animes.push({ titulo, plataforma:'AnimeFLV', poster_url:poster, episodios:{}, temporadas:1, ultimo_episodio:0, genero:generoLimpio||'Anime', sinopsis:'', anio:'' });
    }
    await sleep(700);
  }

  // Últimos episodios
  const epsHtml = await fetchPage('https://www3.animeflv.net/');
  if (epsHtml) {
    const epRegex = /href="(\/ver\/([^\/]+)-(\d+))"[^>]*>/g;
    let em;
    const epMap = {};
    while ((em = epRegex.exec(epsHtml)) !== null) {
      const url = `https://www3.animeflv.net${em[1]}`;
      const slug = em[2];
      const epNum = parseInt(em[3]);
      const titulo = slug.split('-').map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
      if (!epMap[slug]) epMap[slug] = { titulo, plataforma:'AnimeFLV', episodios:{1:[]}, temporadas:1, ultimo_episodio:0, genero:'Anime', sinopsis:'', poster_url:'', anio:'' };
      const exists = epMap[slug].episodios[1].find(e=>e.ep===epNum);
      if (!exists) epMap[slug].episodios[1].push({ ep:epNum, titulo:`Episodio ${epNum}`, link:url });
      epMap[slug].ultimo_episodio = Math.max(epMap[slug].ultimo_episodio, epNum);
    }
    // Merge con animes existentes
    const existingTitles = new Set(animes.map(a=>a.titulo));
    Object.values(epMap).forEach(a => { if (!existingTitles.has(a.titulo)) animes.push(a); });
  }

  const animeMap = {};
  animes.forEach(a => { if (!animeMap[a.titulo]) animeMap[a.titulo] = a; });
  const animeList = Object.values(animeMap);
  if (animeList.length) await dbUpsert('anime', animeList, 'titulo');
  log.push(`AnimeFLV: ${animeList.length} animes`);
  return log;
}

// ============================================================
// PELOTA LIBRE - Canales de fútbol
// ============================================================
async function scrapePelotaLibre() {
  const log = [];
  
  // Canales fijos de PelotaLibre que ya conocemos
  const canales = [
    { nombre:'TyC Sports', siglas:'TYC', categoria:'deportes', color:'#1a6e1a', logo_url:'', link_stream:'https://pelotalibretv.su/tyc-sports/' },
    { nombre:'ESPN', siglas:'ESPN', categoria:'deportes', color:'#cc0000', logo_url:'', link_stream:'https://pelotalibretv.su/espn-1/' },
    { nombre:'ESPN Premium', siglas:'ESPN+', categoria:'deportes', color:'#cc0000', logo_url:'', link_stream:'https://pelotalibretv.su/espn-premium/' },
    { nombre:'Fox Sports', siglas:'FOX', categoria:'deportes', color:'#004080', logo_url:'', link_stream:'https://pelotalibretv.su/fox-sports/' },
    { nombre:'TNT Sports', siglas:'TNT', categoria:'deportes', color:'#7b0000', logo_url:'', link_stream:'https://pelotalibretv.su/tnt-sports/' },
    { nombre:'DirecTV Sports', siglas:'DTV', categoria:'deportes', color:'#0064ff', logo_url:'', link_stream:'https://pelotalibretv.su/directv-sports/' },
    { nombre:'TV Pública', siglas:'TVP', categoria:'deportes', color:'#006400', logo_url:'', link_stream:'https://pelotalibretv.su/tv-publica/' },
    { nombre:'DeporTV', siglas:'DEP', categoria:'deportes', color:'#1a237e', logo_url:'', link_stream:'https://pelotalibretv.su/deportv/' },
  ];

  // Scraping de la agenda de partidos
  const agendaHtml = await fetchPage('https://pelotalibretv.su/agenda/');
  const partidos = [];
  
  if (agendaHtml) {
    // Buscar partidos en la agenda
    const partidoRegex = /href="(https:\/\/pelotalibretv\.su\/[^"]+)"[^>]*>[\s\S]{1,300}?([A-Z][^<\n]{2,30})\s+vs\.?\s+([A-Z][^<\n]{2,30})/g;
    let pm;
    while ((pm = partidoRegex.exec(agendaHtml)) !== null) {
      const link = pm[1];
      const local = pm[2].trim().replace(/\s+/g,' ');
      const visit = pm[3].trim().replace(/\s+/g,' ');
      if (local.length < 2 || visit.length < 2) continue;
      // Extraer hora
      const bloque = agendaHtml.substring(pm.index, pm.index+400);
      const hora = extractText(bloque, /(\d{1,2}:\d{2})/);
      const fecha = new Date();
      if (hora) {
        const [h,min] = hora.split(':');
        fecha.setHours(parseInt(h), parseInt(min), 0, 0);
      }
      partidos.push({
        equipo_local: local, equipo_visit: visit,
        sigla_local: local.substring(0,3).toUpperCase(),
        sigla_visit: visit.substring(0,3).toUpperCase(),
        color_local: '#1565c0', color_visit: '#c62828',
        fecha: fecha.toISOString(),
        en_vivo: false,
        proveedores: ['tyc'],
        link_tyc: link,
        liga: ''
      });
    }
  }

  if (canales.length) await dbUpsert('canales', canales, 'nombre');
  if (partidos.length) await dbInsert('partidos', partidos);
  log.push(`PelotaLibre: ${canales.length} canales, ${partidos.length} partidos`);
  return log;
}

// ============================================================
// HANDLER PRINCIPAL
// ============================================================
export default async function handler(req) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== SECRET) return new Response(JSON.stringify({error:'No autorizado'}), {status:401});

  // DEBUG: ver HTML crudo de una página
  const debug = url.searchParams.get('debug');
  if (debug) {
    const html = await fetchPage(debug);
    if (!html) return new Response('No se pudo obtener la página', {status:500});
    // Mostrar los primeros 3000 chars y buscar /pelicula/
    const pelMatch = html.match(/\/pelicula\/[^"'\s]{5,60}/g);
    const genMatch = html.match(/[Gg]énero[:\s]+([^\n<]{5,100})/g);
    return new Response(JSON.stringify({
      length: html.length,
      first500: html.substring(0,500),
      peliculas_encontradas: pelMatch ? pelMatch.slice(0,10) : [],
      generos_encontrados: genMatch ? genMatch.slice(0,5) : [],
      tiene_pelicula: html.includes('/pelicula/'),
      tiene_genero: html.includes('Género') || html.includes('género')
    }), { headers: {'Content-Type':'application/json'} });
  }

  const source = url.searchParams.get('source') || 'all';
  const logs = [];
  const startTime = Date.now();

  try {
    if (source === 'all' || source === 'poseidon') {
      const r = await scrapePoseidon();
      logs.push(...r);
    }
    if (source === 'all' || source === 'juanita') {
      const r = await scrapePelisJuanita();
      logs.push(...r);
    }
    if (source === 'all' || source === 'anime') {
      const r = await scrapeAnimeFLV();
      logs.push(...r);
    }
    if (source === 'all' || source === 'futbol') {
      const r = await scrapePelotaLibre();
      logs.push(...r);
    }
  } catch (e) {
    logs.push(`Error general: ${e.message}`);
  }

  return new Response(JSON.stringify({
    ok: true,
    timestamp: new Date().toISOString(),
    duration: `${((Date.now()-startTime)/1000).toFixed(1)}s`,
    logs
  }), { headers: { 'Content-Type': 'application/json' } });
}
