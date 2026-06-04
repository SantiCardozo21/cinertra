export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://hrbzennsghftwjxtqeeg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYnplbm5zZ2hmdHdqeHRxZWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTY3MTYsImV4cCI6MjA5NDQ3MjcxNn0.Yn5iBBEPOvoZ7G5qSFHf7nyDwFa7RAYg93mbRUABGAM';
const SECRET = 'cinetra-scraper-2024';
const JUANITA_BASE = 'https://pelisjuanita.com';
const POSEIDON_BASE = 'https://www.poseidonhd2.co';

async function dbUpsert(table, data, conflict) {
  if (!data?.length) return true;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(data)
  });
  return res.ok;
}

async function dbUpdate(table, match, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${match}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data)
  });
  return res.ok;
}

async function dbDelete(table, column, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  return res.ok;
}

async function dbInsert(table, data) {
  if (!data?.length) return true;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data)
  });
  return res.ok;
}

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

function decodeHtmlEntities(str) {
  return str
    .replace(/&aacute;/g,'á').replace(/&eacute;/g,'é').replace(/&iacute;/g,'í')
    .replace(/&oacute;/g,'ó').replace(/&uacute;/g,'ú').replace(/&ntilde;/g,'ñ')
    .replace(/&Aacute;/g,'Á').replace(/&Eacute;/g,'É').replace(/&Iacute;/g,'Í')
    .replace(/&Oacute;/g,'Ó').replace(/&Uacute;/g,'Ú').replace(/&Ntilde;/g,'Ñ')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\s+/g,' ').trim();
}

// ── PoseidonHD2 ───────────────────────────────────────────────────────────────
async function getPoseidonBuildId() {
  const html = await fetchPage(POSEIDON_BASE);
  if (!html) return null;
  const match = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  return match?.[1] || null;
}

async function fetchWithTimeout(url, ms = 5000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' }
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function formatRuntime(mins) {
  if (!mins || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function isHD(videos) {
  // Checks if any video has HD quality (not CAM)
  const all = [
    ...(videos?.latino || []),
    ...(videos?.spanish || []),
    ...(videos?.english || [])
  ];
  if (!all.length) return false;
  return all.some(v => v.quality && !v.quality.toUpperCase().includes('CAM'));
}

function extractNextData(html) {
  if (!html) return null;
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch { return null; }
}

function poseidonMovieToDb(m) {
  const slugParts = m.url?.slug?.split('/') || [];
  const id = slugParts[1] || m.TMDbId || '';
  const slugName = slugParts[2] || '';
  const year = m.releaseDate ? m.releaseDate.substring(0, 4) : '';
  return {
    titulo: m.titles?.name || '',
    anio: year,
    genero: m.genres?.map(g => g.name).join(', ') || '',
    duracion: formatRuntime(m.runtime),
    sinopsis: m.overview || '',
    poster_url: m.images?.poster || '',
    link_reproduccion: id ? `${POSEIDON_BASE}/pelicula/${id}/${slugName}` : '',
    plataforma: 'PoseidonHD'
  };
}

function poseidonSerieToDb(s) {
  const slugParts = s.url?.slug?.split('/') || [];
  const id = slugParts[1] || s.TMDbId || '';
  const slugName = slugParts[2] || '';
  const year = s.releaseDate ? s.releaseDate.substring(0, 4) : '';
  return {
    titulo: s.titles?.name || '',
    anio: year,
    genero: s.genres?.map(g => g.name).join(', ') || '',
    sinopsis: s.overview || '',
    poster_url: s.images?.poster || '',
    plataforma: 'PoseidonHD',
    episodios: {},
    temporadas: 1,
    ultimo_episodio: 0
  };
}

async function checkPoseidonMovieHD(movie) {
  // Visits individual movie page and returns db object only if HD quality exists
  const slugParts = movie.url?.slug?.split('/') || [];
  const id = slugParts[1] || movie.TMDbId || '';
  const slugName = slugParts[2] || '';
  if (!id) return null;

  const html = await fetchWithTimeout(`${POSEIDON_BASE}/pelicula/${id}/${slugName}`, 5000);
  const nextData = extractNextData(html);
  if (!nextData) return null;

  const videos = nextData?.props?.pageProps?.thisMovie?.videos;
  if (!videos) return null;
  if (!isHD(videos)) return null; // Skip CAM-only

  return poseidonMovieToDb(movie);
}

async function checkPoseidonSerieHD(serie) {
  const slugParts = serie.url?.slug?.split('/') || [];
  const id = slugParts[1] || serie.TMDbId || '';
  const slugName = slugParts[2] || '';
  if (!id) return null;

  const html = await fetchWithTimeout(`${POSEIDON_BASE}/serie/${id}/${slugName}`, 5000);
  const nextData = extractNextData(html);
  if (!nextData) return null;

  const videos = nextData?.props?.pageProps?.thisTvshow?.videos
              || nextData?.props?.pageProps?.thisMovie?.videos;
  if (!videos) return null;
  if (!isHD(videos)) return null;

  return poseidonSerieToDb(serie);
}

async function scrapePoseidonMovies(page) {
  const buildId = await getPoseidonBuildId();
  if (!buildId) return 0;

  const raw = await fetchPage(`${POSEIDON_BASE}/_next/data/${buildId}/es/peliculas.json?page=${page}`);
  if (!raw) return 0;
  let data;
  try { data = JSON.parse(raw); } catch { return 0; }

  const movies = data?.pageProps?.movies || [];
  if (!movies.length) return 0;

  // Process in parallel batches of 4 to stay within timeout
  const CONCURRENCY = 4;
  const hdMovies = [];
  for (let i = 0; i < movies.length; i += CONCURRENCY) {
    const batch = movies.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(m => checkPoseidonMovieHD(m)));
    results.forEach(r => { if (r.status === 'fulfilled' && r.value) hdMovies.push(r.value); });
  }

  if (hdMovies.length) await dbUpsert('peliculas', hdMovies, 'titulo');
  return hdMovies.length;
}

async function scrapePoseidonSeries(page) {
  const buildId = await getPoseidonBuildId();
  if (!buildId) return 0;

  const raw = await fetchPage(`${POSEIDON_BASE}/_next/data/${buildId}/es/series.json?page=${page}`);
  if (!raw) return 0;
  let data;
  try { data = JSON.parse(raw); } catch { return 0; }

  const series = data?.pageProps?.tvshows || data?.pageProps?.series || [];
  if (!series.length) return 0;

  const CONCURRENCY = 4;
  const hdSeries = [];
  for (let i = 0; i < series.length; i += CONCURRENCY) {
    const batch = series.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(s => checkPoseidonSerieHD(s)));
    results.forEach(r => { if (r.status === 'fulfilled' && r.value) hdSeries.push(r.value); });
  }

  if (hdSeries.length) await dbUpsert('series', hdSeries, 'titulo');
  return hdSeries.length;
}

// ── PelisJuanita parsers ──────────────────────────────────────────────────────
function parseMoviePage(html) {
  if (!html) return null;
  const sinopsisMatch = html.match(/<p class="sinopsis">([^<]+)<\/p>/);
  const sinopsis = sinopsisMatch?.[1]?.trim() || '';
  const sGeneroMatch = html.match(/<p id=['"]sGenero['"]>([\s\S]*?)<\/p>/);
  const generos = [];
  if (sGeneroMatch) {
    const tagMatches = [...sGeneroMatch[1].matchAll(/class="badge-etiqueta"[^>]*>[\s\S]*?<\/i>\s*([^<\n\r]+)/g)];
    tagMatches.forEach(m => { const g = m[1].trim(); if (g) generos.push(g); });
  }
  const duracionMatch = html.match(/<span>(\d+ min\.)<\/span>/);
  return { sinopsis, genero: generos.join(', '), duracion: duracionMatch?.[1] || '' };
}

function parseSeriesInfoPage(html) {
  if (!html) return null;
  const sinopsisMatch = html.match(/<p class="sinopsis">([^<]+)<\/p>/) ||
                        html.match(/<div[^>]*class="sinopsis"[^>]*>([^<]+)<\/div>/);
  const sinopsis = sinopsisMatch?.[1]?.trim() || '';
  const sGeneroMatch = html.match(/<p id=['"]sGenero['"]>([\s\S]*?)<\/p>/);
  const generos = [];
  if (sGeneroMatch) {
    const tagMatches = [...sGeneroMatch[1].matchAll(/class="badge-etiqueta"[^>]*>[\s\S]*?<\/i>\s*([^<\n\r]+)/g)];
    tagMatches.forEach(m => { const g = m[1].trim(); if (g) generos.push(g); });
  }
  return { sinopsis, genero: generos.join(', ') };
}

async function enrichPeliculas(batch) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/peliculas?genero=eq.&plataforma=eq.PelisJuanita&select=titulo,link_reproduccion&limit=${batch}&order=created_at.asc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const movies = await res.json();
  if (!Array.isArray(movies) || !movies.length) return 0;
  let enriched = 0;
  for (const movie of movies) {
    const slug = movie.link_reproduccion?.split('/').pop();
    if (!slug) continue;
    const html = await fetchPage(`${JUANITA_BASE}/movies/movieInfo.php?title=${slug}`);
    if (!html) { await dbUpdate('peliculas', `titulo=eq.${encodeURIComponent(movie.titulo)}`, { genero: '-' }); continue; }
    const info = parseMoviePage(html);
    if (!info) continue;
    await dbUpdate('peliculas', `titulo=eq.${encodeURIComponent(movie.titulo)}`, { genero: info.genero || '-', sinopsis: info.sinopsis, duracion: info.duracion });
    enriched++;
  }
  return enriched;
}

async function enrichSeries(batch) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/series?genero=eq.&plataforma=eq.PelisJuanita&select=titulo&limit=${batch}&order=created_at.asc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const series = await res.json();
  if (!Array.isArray(series) || !series.length) return 0;
  let enriched = 0;
  for (const serie of series) {
    const html = await fetchPage(`${JUANITA_BASE}/series/serieInfo.php?nombreSerie=${encodeURIComponent(serie.titulo)}`);
    if (!html) { await dbUpdate('series', `titulo=eq.${encodeURIComponent(serie.titulo)}`, { genero: '-' }); continue; }
    const info = parseSeriesInfoPage(html);
    if (!info) continue;
    await dbUpdate('series', `titulo=eq.${encodeURIComponent(serie.titulo)}`, { genero: info.genero || '-', sinopsis: info.sinopsis });
    enriched++;
  }
  return enriched;
}

async function enrichAnime(batch) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/anime?sinopsis=eq.&slug=neq.&select=titulo,slug&limit=${batch}&order=created_at.asc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const animes = await res.json();
  if (!Array.isArray(animes) || !animes.length) return 0;
  let enriched = 0;
  for (const anime of animes) {
    if (!anime.slug) continue;
    const html = await fetchPage(`https://www3.animeflv.net/anime/${anime.slug}`);
    if (!html || !html.includes('class="Nvgnrs"')) {
      await dbUpdate('anime', `titulo=eq.${encodeURIComponent(anime.titulo)}`, { sinopsis: '-' });
      continue;
    }
    const nvgnrsMatch = html.match(/<nav class="Nvgnrs">([\s\S]*?)<\/nav>/);
    const generos = [];
    if (nvgnrsMatch) {
      const genMatches = [...nvgnrsMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      genMatches.forEach(m => { const g = decodeHtmlEntities(m[1]); if (g && g.length > 1) generos.push(g); });
    }
    const descMatch = html.match(/<div class="Description">\s*<p>([\s\S]*?)<\/p>/);
    const sinopsis = descMatch ? decodeHtmlEntities(descMatch[1].replace(/<[^>]+>/g, ' ')) : '-';
    await dbUpdate('anime', `titulo=eq.${encodeURIComponent(anime.titulo)}`, {
      genero: generos.length ? generos.join(', ') : 'Anime',
      sinopsis: sinopsis || '-'
    });
    enriched++;
  }
  return enriched;
}

// ── PelisJuanita movies/series ────────────────────────────────────────────────
function parseMoviesPage(html) {
  if (!html) return [];
  const movies = [];
  const seen = new Set();
  const allLinks = [...html.matchAll(/href=['"][\s]*\/movies\/pelicula\/([^'"\/\s]+)[\s]*['"]/g)];
  for (const linkMatch of allLinks) {
    const slug = linkMatch[1].trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const linkPos = html.indexOf(linkMatch[0]);
    const block = html.substring(linkPos, Math.min(html.length, linkPos + 600));
    const posterMatch = block.match(/src=['"]\s*(https:\/\/image\.tmdb\.org[^'"]+\.(?:jpg|png|webp))\s*['"]/);
    const altMatch = block.match(/alt=['"]([^'"]+)['"]/);
    const yearMatch = block.match(/class=['"][\s]*right[\s]*['"]>\s*(\d{4})/);
    const h2Match = block.match(/<h2[^>]*>([^<]+)<\/h2>/);
    const titulo = (altMatch?.[1] || h2Match?.[1] || slug.replace(/-/g, ' ')).trim();
    if (!titulo) continue;
    movies.push({ titulo, anio: yearMatch?.[1] || '', genero: '', duracion: '', sinopsis: '', poster_url: posterMatch?.[1]?.trim() || '', link_reproduccion: `${JUANITA_BASE}/movies/pelicula/${slug}`, plataforma: 'PelisJuanita' });
  }
  return movies;
}

async function scrapeJuanitaMovies(page) {
  return parseMoviesPage(await fetchPage(`${JUANITA_BASE}/movies/movies.php?populares=1&page=${page}`));
}

function parseSeriesPage(html) {
  if (!html) return [];
  const series = [];
  const seen = new Set();
  const allLinks = [...html.matchAll(/href=['"][\s]*ver-serie\/([^'"\/\s\-][^'"\/\s]*)[\s]*['"]/g)];
  for (const linkMatch of allLinks) {
    const slug = linkMatch[1].trim();
    if (!slug || slug.startsWith('-') || /^\d+$/.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    const linkPos = html.indexOf(linkMatch[0]);
    const block = html.substring(linkPos, Math.min(html.length, linkPos + 600));
    const posterMatch = block.match(/src=['"]\s*(https:\/\/image\.tmdb\.org[^'"]+\.(?:jpg|png|webp))\s*['"]/);
    const altMatch = block.match(/alt=['"]([^'"]+)['"]/);
    const yearMatch = block.match(/class=['"][\s]*right[\s]*['"]>\s*(\d{4})/);
    const h2Match = block.match(/<h2[^>]*>([^<]+)<\/h2>/);
    const titulo = (altMatch?.[1] || h2Match?.[1] || slug.replace(/-/g, ' ')).trim();
    if (!titulo || titulo.length < 2) continue;
    series.push({ titulo, anio: yearMatch?.[1] || '', genero: '', sinopsis: '', poster_url: posterMatch?.[1]?.trim() || '', plataforma: 'PelisJuanita', episodios: { 1: [{ ep: 1, titulo: 'Episodio 1', link: `${JUANITA_BASE}/series/ver-serie/${slug}/01x01` }] }, temporadas: 1, ultimo_episodio: 1 });
  }
  return series;
}

async function scrapeJuanitaSerieInfo(nombreSerie) {
  const html = await fetchPage(`${JUANITA_BASE}/series/serieInfo.php?nombreSerie=${encodeURIComponent(nombreSerie)}`);
  if (!html) return null;
  const episodios = {};
  let maxTemp = 1, maxEp = 1;
  const epRegex = /href=['"]\/series\/ver-serie\/([^'"]+)\/(\d+)x(\d+)['"]/g;
  let match;
  while ((match = epRegex.exec(html)) !== null) {
    const temp = parseInt(match[2]), ep = parseInt(match[3]);
    if (!episodios[temp]) episodios[temp] = [];
    const epUrl = `${JUANITA_BASE}/series/ver-serie/${match[1]}/${match[2]}x${match[3]}`;
    const pos = html.indexOf(match[0]);
    const block = html.substring(Math.max(0, pos - 50), Math.min(html.length, pos + 200));
    const titleMatch = block.match(/alt=['"]([^'"]+)['"]|<span[^>]*>([^<]+)<\/span>/);
    const epTitulo = titleMatch?.[1] || titleMatch?.[2] || `Episodio ${ep}`;
    if (!episodios[temp].find(e => e.ep === ep)) {
      episodios[temp].push({ ep, titulo: epTitulo.trim(), link: epUrl });
      maxTemp = Math.max(maxTemp, temp); maxEp = Math.max(maxEp, ep);
    }
  }
  Object.keys(episodios).forEach(t => { episodios[t].sort((a, b) => a.ep - b.ep); });
  if (!Object.keys(episodios).length) return null;
  const posterMatch = html.match(/src=['"]\s*(https:\/\/image\.tmdb\.org[^'"]+\.(?:jpg|png|webp))\s*['"]/);
  const yearMatch = html.match(/\b(19|20)\d{2}\b/);
  return { episodios, temporadas: maxTemp, ultimo_episodio: maxEp, poster_url: posterMatch?.[1]?.trim() || '', anio: yearMatch?.[0] || '' };
}

async function scrapeJuanitaSeries(page) {
  const url = page === 1 ? `${JUANITA_BASE}/series/apiSeries.php` : `${JUANITA_BASE}/series/apiSeries.php?page=${page}`;
  return parseSeriesPage(await fetchPage(url));
}
async function scrapeJuanitaSeriesPopulares(page) {
  const url = page === 1 ? `${JUANITA_BASE}/series/apiSeries.php?populares=` : `${JUANITA_BASE}/series/apiSeries.php?populares=&page=${page}`;
  return parseSeriesPage(await fetchPage(url));
}
async function scrapeJuanitaSeriesEstrenos(page) {
  const url = page === 1 ? `${JUANITA_BASE}/series/apiSeries.php?estrenos=` : `${JUANITA_BASE}/series/apiSeries.php?estrenos=&page=${page}`;
  return parseSeriesPage(await fetchPage(url));
}

// ── AnimeFLV ──────────────────────────────────────────────────────────────────
async function scrapeAnimeFLVPage(page) {
  const animes = [];
  const seen = new Set();
  const html = await fetchPage(`https://www3.animeflv.net/browse?order=title&page=${page}`);
  if (!html) return 0;
  const allLinks = [...html.matchAll(/href="\/anime\/([a-zA-Z0-9\-]+)"/g)];
  for (const linkMatch of allLinks) {
    const slug = linkMatch[1].trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const linkPos = html.indexOf(linkMatch[0]);
    const block = html.substring(linkPos, Math.min(html.length, linkPos + 600));
    const posterMatch = block.match(/src="(https:\/\/animeflv\.net\/uploads\/animes\/covers\/[^"]+)"/);
    const altMatch = block.match(/alt="([^"]+)"/);
    const h3Match = block.match(/<h3[^>]*>([^<]+)<\/h3>/);
    const titulo = (altMatch?.[1] || h3Match?.[1] || slug).trim();
    if (!titulo || titulo === 'AnimeFLV') continue;
    animes.push({ titulo, slug, plataforma: 'AnimeFLV', poster_url: posterMatch?.[1] || '', episodios: {}, temporadas: 1, ultimo_episodio: 0, genero: 'Anime', sinopsis: '', anio: '' });
  }
  if (animes.length) await dbUpsert('anime', animes, 'titulo');
  return animes.length;
}

// ── Pelota Libre ──────────────────────────────────────────────────────────────
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
      partidos.push({ equipo_local: local, equipo_visit: visit, sigla_local: local.substring(0,3).toUpperCase(), sigla_visit: visit.substring(0,3).toUpperCase(), color_local: '#1565c0', color_visit: '#c62828', fecha: new Date().toISOString(), en_vivo: false, proveedores: ['tyc'], link_tyc: links[i] || 'https://pelotalibretv.su' });
    });
    if (partidos.length) await dbInsert('partidos', partidos);
  }
  return [`PelotaLibre: ${canales.length} canales, ${partidos.length} partidos`];
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== SECRET) return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: CORS });
  const source = url.searchParams.get('source') || '';
  const logs = [];
  const t = Date.now();

  try {
    if (source === 'delete-poseidon') {
      logs.push(`Borradas: pelis=${await dbDelete('peliculas','plataforma','PoseidonHD')} series=${await dbDelete('series','plataforma','PoseidonHD')}`);
    }

    // PelisJuanita
    if (source === 'peliculas') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const peliculas = await scrapeJuanitaMovies(page);
      if (peliculas.length) { await dbUpsert('peliculas', peliculas, 'titulo'); logs.push(`Películas Juanita pág ${page}: ${peliculas.length} guardadas`); }
      else logs.push(`Películas Juanita pág ${page}: 0 encontradas`);
    }
    if (source === 'series') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const series = await scrapeJuanitaSeries(page);
      if (series.length) { await dbUpsert('series', series, 'titulo'); logs.push(`Series Juanita pág ${page}: ${series.length} guardadas`); }
      else logs.push(`Series Juanita pág ${page}: 0 encontradas`);
    }
    if (source === 'serie-info') {
      const nombre = url.searchParams.get('nombre') || '';
      if (!nombre) logs.push('Falta ?nombre=');
      else {
        const info = await scrapeJuanitaSerieInfo(nombre);
        if (info) { await dbUpsert('series', [{ titulo: nombre, ...info, plataforma: 'PelisJuanita' }], 'titulo'); logs.push(`Serie "${nombre}": OK`); }
        else logs.push(`Serie "${nombre}": no encontrada`);
      }
    }
    if (source === 'series-populares') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const series = await scrapeJuanitaSeriesPopulares(page);
      if (series.length) { await dbUpsert('series', series, 'titulo'); logs.push(`Series Populares pág ${page}: ${series.length}`); }
      else logs.push(`Series Populares pág ${page}: 0`);
    }
    if (source === 'series-estrenos') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const series = await scrapeJuanitaSeriesEstrenos(page);
      if (series.length) { await dbUpsert('series', series, 'titulo'); logs.push(`Series Estrenos pág ${page}: ${series.length}`); }
      else logs.push(`Series Estrenos pág ${page}: 0`);
    }

    // PoseidonHD2
    if (source === 'poseidon-peliculas') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const count = await scrapePoseidonMovies(page);
      logs.push(`PoseidonHD Películas pág ${page}: ${count} guardadas`);
    }
    if (source === 'poseidon-series') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const count = await scrapePoseidonSeries(page);
      logs.push(`PoseidonHD Series pág ${page}: ${count} guardadas`);
    }

    // AnimeFLV
    if (source === 'anime') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const count = await scrapeAnimeFLVPage(page);
      logs.push(`AnimeFLV pág ${page}: ${count} animes guardados`);
    }

    // Enriquecimiento
    if (source === 'enrich-peliculas') {
      const batch = parseInt(url.searchParams.get('batch') || '5');
      const count = await enrichPeliculas(batch);
      logs.push(`Enrich películas: ${count} enriquecidas`);
    }
    if (source === 'enrich-series') {
      const batch = parseInt(url.searchParams.get('batch') || '5');
      const count = await enrichSeries(batch);
      logs.push(`Enrich series: ${count} enriquecidas`);
    }
    if (source === 'enrich-anime') {
      const batch = parseInt(url.searchParams.get('batch') || '5');
      const count = await enrichAnime(batch);
      logs.push(`Enrich anime: ${count} enriquecidos`);
    }

    if (source === 'futbol') {
      logs.push(...await scrapePelotaLibre());
    }
  } catch (e) {
    logs.push(`Error: ${e.message}`);
  }

  return new Response(JSON.stringify({
    ok: true, timestamp: new Date().toISOString(),
    duration: `${((Date.now() - t) / 1000).toFixed(1)}s`, logs
  }), { headers: { 'Content-Type': 'application/json', ...CORS } });
}
